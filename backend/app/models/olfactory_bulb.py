"""Artificial olfactory bulb: H_R → H_B.

    r̂(t) = r(t) / (1 + κ · mean_j r_j(t))              divisive normalization
    b(t) = φ(W_E r̂(t) − W_I r̂(t) + b₀)                 φ = Softplus
    τ dh/dt = b(t) − h(t)                               leaky temporal integration

W_E, W_I ≥ 0 are trainable (Softplus-parameterized). For piecewise-constant
input the ODE is integrated exactly:

    h(t+Δt) = e^{−Δt/τ} h(t) + (1 − e^{−Δt/τ}) b(t)

which is unconditionally stable for any Δt > 0 because 0 < e^{−Δt/τ} < 1.
τ is bounded in [tau_min, tau_max]. Lateral inhibition can be switched off for
ablation experiments.
"""
from __future__ import annotations

import torch
import torch.nn.functional as F
from torch import nn

from ..mathematics.dynamics import exponential_integrate


def _inv_softplus(x: torch.Tensor) -> torch.Tensor:
    return x + torch.log(-torch.expm1(-x))


class OlfactoryBulb(nn.Module):
    def __init__(self, n_receptors: int = 64, bulb_dim: int = 64, lateral_inhibition: bool = True,
                 tau_min: float = 0.02, tau_max: float = 0.4):
        super().__init__()
        self.lateral_inhibition = lateral_inhibition
        self.tau_min, self.tau_max = tau_min, tau_max
        g = torch.Generator().manual_seed(0)
        we = torch.full((bulb_dim, n_receptors), 0.02)
        if bulb_dim == n_receptors:  # glomerular convergence: one receptor type → one unit
            we = we + torch.eye(n_receptors) * 1.5
        we = we + 0.01 * torch.rand(bulb_dim, n_receptors, generator=g)
        self.we_raw = nn.Parameter(_inv_softplus(we))
        self.wi_raw = nn.Parameter(_inv_softplus(0.03 + 0.01 * torch.rand(bulb_dim, n_receptors, generator=g)))
        self.b0 = nn.Parameter(torch.full((bulb_dim,), -1.0))
        self.kappa_raw = nn.Parameter(torch.tensor(0.0))
        self.tau_raw = nn.Parameter(torch.linspace(-2.0, 2.0, bulb_dim))

    @property
    def W_E(self) -> torch.Tensor:
        return F.softplus(self.we_raw)

    @property
    def W_I(self) -> torch.Tensor:
        return F.softplus(self.wi_raw)

    def tau(self) -> torch.Tensor:
        return self.tau_min + (self.tau_max - self.tau_min) * torch.sigmoid(self.tau_raw)

    def drive(self, r: torch.Tensor, lateral_inhibition: bool | None = None) -> torch.Tensor:
        """Instantaneous bulb drive b for receptor activity r [..., R] → [..., D]."""
        lat = self.lateral_inhibition if lateral_inhibition is None else lateral_inhibition
        r_hat = r / (1.0 + F.softplus(self.kappa_raw) * r.mean(dim=-1, keepdim=True))
        pre = r_hat @ self.W_E.T + self.b0
        if lat:
            pre = pre - r_hat @ self.W_I.T
        return F.softplus(pre)

    def integrate(self, b_seq: torch.Tensor, dt: float, h0: torch.Tensor | None = None) -> torch.Tensor:
        """Exact exponential integration of τ dh/dt = b − h. b_seq: [B, T, D] → h: [B, T, D]."""
        return exponential_integrate(b_seq, dt, self.tau(), h0)
