"""Artificial piriform cortex: H_B → H_P.

Bulb features → recurrent layer (GRU) → sparse activation (top-k by magnitude)
→ residual MLP → LayerNorm → 256-D odor embedding.

This is a biologically *motivated* inductive bias (recurrence, sparse
distributed coding), not a model of the biological piriform cortex.
`AttentionCortex` is a small causal self-attention alternative for ablations.
"""
from __future__ import annotations

import math

import torch
from torch import nn


def topk_sparsify(x: torch.Tensor, keep_fraction: float | None) -> torch.Tensor:
    """Keep the `keep_fraction` largest-magnitude entries of the last dim, zero the rest."""
    if keep_fraction is None or keep_fraction >= 1.0:
        return x
    if keep_fraction <= 0:
        return torch.zeros_like(x)
    k = max(1, int(math.ceil(keep_fraction * x.shape[-1])))
    idx = x.abs().topk(k, dim=-1).indices
    mask = torch.zeros_like(x).scatter_(-1, idx, 1.0)
    return x * mask


class _CortexReadout(nn.Module):
    def __init__(self, hidden: int, emb_dim: int):
        super().__init__()
        self.skip = nn.Identity() if hidden == emb_dim else nn.Linear(hidden, emb_dim)
        self.mlp = nn.Sequential(nn.Linear(hidden, 2 * hidden), nn.GELU(), nn.Linear(2 * hidden, emb_dim))
        self.norm = nn.LayerNorm(emb_dim)

    def forward(self, s: torch.Tensor) -> torch.Tensor:
        return self.norm(self.skip(s) + self.mlp(s))


class PiriformCortex(nn.Module):
    """GRU-based sparse recurrent cortex."""

    def __init__(self, in_dim: int = 64, hidden: int = 256, emb_dim: int = 256, sparsity: float | None = 0.2):
        super().__init__()
        self.hidden = hidden
        self.sparsity = sparsity
        self.in_proj = nn.Sequential(nn.Linear(in_dim, hidden), nn.GELU())
        self.cell = nn.GRUCell(hidden, hidden)
        self.readout = _CortexReadout(hidden, emb_dim)

    def forward(self, x_seq: torch.Tensor, h0: torch.Tensor | None = None,
                sparsity: float | None | str = "default"):
        """x_seq: [B, T, D]. Returns (sparse activity [B,T,H], embedding [B,T,E], last state [B,H])."""
        keep = self.sparsity if sparsity == "default" else sparsity
        B, T, _ = x_seq.shape
        u = self.in_proj(x_seq)
        h = x_seq.new_zeros(B, self.hidden) if h0 is None else h0
        states = []
        for t in range(T):
            h = self.cell(u[:, t], h)
            states.append(h)
        H = torch.stack(states, dim=1)
        S = topk_sparsify(H, keep)
        return S, self.readout(S), h


class AttentionCortex(nn.Module):
    """Causal self-attention over time; ablation alternative to the GRU cortex."""

    def __init__(self, in_dim: int = 64, hidden: int = 256, emb_dim: int = 256,
                 sparsity: float | None = 0.2, heads: int = 4, max_len: int = 1024):
        super().__init__()
        self.hidden = hidden
        self.sparsity = sparsity
        self.in_proj = nn.Sequential(nn.Linear(in_dim, hidden), nn.GELU())
        self.attn = nn.MultiheadAttention(hidden, heads, batch_first=True)
        self.pos = nn.Parameter(torch.zeros(max_len, hidden))
        self.norm = nn.LayerNorm(hidden)
        self.readout = _CortexReadout(hidden, emb_dim)

    def forward(self, x_seq, h0=None, sparsity="default"):
        keep = self.sparsity if sparsity == "default" else sparsity
        T = x_seq.shape[1]
        u = self.in_proj(x_seq) + self.pos[:T]
        causal = torch.triu(torch.ones(T, T, dtype=torch.bool, device=x_seq.device), diagonal=1)
        a, _ = self.attn(u, u, u, attn_mask=causal, need_weights=False)
        H = self.norm(u + a)
        S = topk_sparsify(H, keep)
        return S, self.readout(S), H[:, -1]
