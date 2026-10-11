"""Molecule–receptor interaction layer: H_M ⊗ H_E → H_R.

Simplified competitive-binding steady state (NOT a universal receptor law):

    r_j = g_j · Σ_i ε_ij c_i / K_ij  /  (1 + Σ_i c_i / K_ij)

  c_i  ≥ 0     concentration of component i
  K_ij > 0     effective binding constant  (Softplus + floor)
  ε_ij ∈ (0,1) activation efficacy        (Sigmoid)
  g_j ∈ [0,1]  experimental gain: 1 = intact, 0 = virtual knockout

K and ε are predicted by a small MLP acting on (molecule embedding, receptor
identity embedding) pairs. Because the response sums over components, the
static prediction is invariant to component order, and zero concentration gives
exactly zero stimulus-driven response. r_j is bounded in [0, 1).

The 64 channels are simulated computational channels, not identified human
olfactory receptors.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn


class ReceptorInteractionLayer(nn.Module):
    def __init__(self, mol_dim: int = 128, n_receptors: int = 64, receptor_dim: int = 64,
                 hidden: int = 64, k_min: float = 1e-3, eps: float = 1e-6):
        super().__init__()
        self.n_receptors = n_receptors
        self.k_min = k_min
        self.eps = eps
        self.receptor_embedding = nn.Parameter(torch.randn(n_receptors, receptor_dim) * 0.5)
        self.mol_proj = nn.Linear(mol_dim, hidden)
        self.rec_proj = nn.Linear(receptor_dim, hidden)
        self.mol_gate = nn.Linear(mol_dim, hidden)
        self.rec_gate = nn.Linear(receptor_dim, hidden, bias=False)
        self.head = nn.Sequential(nn.GELU(), nn.Linear(hidden, hidden), nn.GELU(), nn.Linear(hidden, 2))

    # -- parameters of the binding model ------------------------------------
    def binding_params(self, mol_emb: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        """mol_emb: [B, N, D] → (K, ε), each [B, N, R]."""
        e = self.receptor_embedding
        additive = self.mol_proj(mol_emb)[:, :, None, :] + self.rec_proj(e)[None, None]
        bilinear = self.mol_gate(mol_emb)[:, :, None, :] * self.rec_gate(e)[None, None]
        out = self.head(additive + bilinear)  # [B, N, R, 2]
        K = F.softplus(out[..., 0]) + self.k_min
        efficacy = torch.sigmoid(out[..., 1])
        return K, efficacy

    # -- steady-state response -------------------------------------------
    def response(self, conc: torch.Tensor, K: torch.Tensor, efficacy: torch.Tensor,
                 mask: torch.Tensor, gain: torch.Tensor | None = None) -> torch.Tensor:
        """conc: [B, N] (static) or [B, T, N] (time series). Returns [B, R] or [B, T, R]."""
        if bool((conc.detach() < 0).any()):
            raise ValueError("concentrations must be non-negative")
        return self.response_unchecked(conc, K, efficacy, mask, gain)

    def response_unchecked(self, conc, K, efficacy, mask, gain=None):
        """Same computation without input validation (used for graph export)."""
        m = mask.to(conc.dtype)
        temporal = conc.dim() == 3
        if temporal:
            c = (conc * m[:, None, :])[..., None]          # [B, T, N, 1]
            Kx, Ex = K[:, None], efficacy[:, None]          # [B, 1, N, R]
        else:
            c = (conc * m)[..., None]                       # [B, N, 1]
            Kx, Ex = K, efficacy
        occupancy = c / (Kx + self.eps)                     # c_i / K_ij
        num = (Ex * occupancy).sum(dim=-2)
        den = 1.0 + occupancy.sum(dim=-2)
        r = num / den
        if gain is not None:
            r = r * (gain[:, None, :] if temporal else gain)
        return r

    def forward(self, mol_emb, conc, mask, gain=None):
        K, efficacy = self.binding_params(mol_emb)
        return self.response(conc, K, efficacy, mask, gain), K, efficacy
