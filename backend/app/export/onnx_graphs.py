"""Export adapters: the trained BioOlfactoryModel as two ONNX graphs for in-browser inference.

These adapters call the model's own sub-modules and parameters; the only difference
from `BioOlfactoryModel.forward` is that two inference switches become tensor
inputs so that one exported graph serves every UI setting:

* `lateral`  — 1.0 = lateral inhibition on, 0.0 = off (multiplies the W_I term),
* `keep_k`   — number of cortical units kept by the sparsity step (k = H disables it).
  Top-k is expressed as "|x| ≥ k-th largest |x|", identical to torch.topk except
  for exact magnitude ties.

`tests/test_onnx_export.py` checks both graphs against the PyTorch model.
"""
from __future__ import annotations

import torch
from torch import nn

from ..models.olfactory_model import BioOlfactoryModel


def sparsify_k(x: torch.Tensor, keep_k: torch.Tensor) -> torch.Tensor:
    mag = x.abs()
    sorted_mag, _ = torch.sort(mag, dim=-1, descending=True)
    idx = (keep_k.to(torch.long) - 1).clamp(min=0).reshape([1] * (x.dim() - 1) + [1])
    idx = idx.expand(*x.shape[:-1], 1)
    thresh = torch.gather(sorted_mag, -1, idx)
    return x * (mag >= thresh).to(x.dtype)


class _Base(nn.Module):
    def __init__(self, model: BioOlfactoryModel):
        super().__init__()
        if model.config.cortex_type != "gru":
            raise ValueError("ONNX export is implemented for the GRU cortex")
        self.m = model

    def settle(self, x: torch.Tensor, steps: int, keep_k: torch.Tensor):
        c = self.m.cortex
        u = c.in_proj(x)
        h = torch.zeros(x.shape[0], c.hidden, dtype=x.dtype)
        for _ in range(steps):
            h = c.cell(u, h)
        return h

    def readout(self, h: torch.Tensor, keep_k: torch.Tensor):
        s = sparsify_k(h, keep_k)
        return s, self.m.cortex.readout(s)

    def heads(self, z):
        return self.m.descriptor_head(z), self.m.intensity_head(z)


class StaticGraph(_Base):
    """features [B,N,F], conc [B,N], mask [B,N] (0/1), gain [B,R], lateral [1], keep_k [1] (int64)."""

    def forward(self, features, conc, mask, gain, lateral, keep_k):
        m = self.m
        mol = m.encoder(features, mask)
        K, eff = m.receptors.binding_params(mol)
        r = m.receptors.response_unchecked(conc, K, eff, mask, gain)
        b = m.bulb.drive(r, lateral)
        h = self.settle(b, m.config.settle_steps, keep_k)
        s, z = self.readout(h, keep_k)
        d, i = self.heads(z)
        return r, b, s, z, d, i


class TemporalGraph(_Base):
    """features [B,N,F], conc_t [B,T,N] (T fixed at export), mask, gain, lateral [1], keep_k [1], dt [1]."""

    def __init__(self, model: BioOlfactoryModel, frames: int):
        super().__init__(model)
        self.frames = frames

    def forward(self, features, conc_t, mask, gain, lateral, keep_k, dt):
        m = self.m
        mol = m.encoder(features, mask)
        K, eff = m.receptors.binding_params(mol)
        r_seq = m.receptors.response_unchecked(conc_t, K, eff, mask, gain)       # [B,T,R]
        b_seq = m.bulb.drive(r_seq, lateral)
        rest_b = m.bulb.drive(torch.zeros_like(r_seq[:, 0]), lateral)
        a = torch.exp(-dt / m.bulb.tau())
        h_b = rest_b
        h_c = self.settle(rest_b, m.config.settle_steps, keep_k)
        c = m.cortex
        hs, cs = [], []
        for t in range(self.frames):
            h_b = a * h_b + (1.0 - a) * b_seq[:, t]
            h_c = c.cell(c.in_proj(h_b), h_c)
            hs.append(h_b)
            cs.append(h_c)
        H_b = torch.stack(hs, 1)
        S, Z = self.readout(torch.stack(cs, 1), keep_k)
        _, I = self.heads(Z)
        return r_seq, H_b, S, Z, I
