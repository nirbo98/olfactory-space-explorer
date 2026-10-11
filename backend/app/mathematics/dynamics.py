"""Nonlinear-dynamics utilities: exact integration of first-order leaky units.

For τ dh/dt = b(t) − h(t) with b piecewise constant on [t, t+Δt):

    h(t+Δt) = e^{−Δt/τ} h(t) + (1 − e^{−Δt/τ}) b(t)

This is the exact solution, so it is stable for every Δt > 0 and τ > 0 (the
update is a convex combination of h and b). Forward Euler, by contrast, becomes
unstable for Δt > 2τ; `euler_step` is kept only to demonstrate that contrast in
tests.
"""
from __future__ import annotations

import torch


def decay_factor(dt: float, tau: torch.Tensor) -> torch.Tensor:
    if dt <= 0:
        raise ValueError("dt must be positive")
    if bool((tau <= 0).any()):
        raise ValueError("time constants must be positive")
    return torch.exp(-dt / tau)


def exponential_integrate(b_seq: torch.Tensor, dt: float, tau: torch.Tensor,
                          h0: torch.Tensor | None = None) -> torch.Tensor:
    """b_seq: [B, T, D]; tau: [D] → h: [B, T, D] (state after each step)."""
    a = decay_factor(dt, tau)
    h = b_seq[:, 0] if h0 is None else h0
    out = []
    for t in range(b_seq.shape[1]):
        h = a * h + (1.0 - a) * b_seq[:, t]
        out.append(h)
    return torch.stack(out, dim=1)


def euler_step(h: torch.Tensor, b: torch.Tensor, dt: float, tau: torch.Tensor) -> torch.Tensor:
    return h + dt / tau * (b - h)
