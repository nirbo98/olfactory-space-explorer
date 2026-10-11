"""Local Taylor analysis of the (trained, differentiable) receptor model.

    f_j(c₀ + Δc) ≈ f_j(c₀) + J_j Δc + ½ Δcᵀ H_j Δc

J_j (all components) and H_j (a small selected subset) are obtained by PyTorch
automatic differentiation in float64 and cross-checked against central finite
differences. Taylor expansions are LOCAL: the reported error curves show how the
approximation degrades away from c₀; no claim is made beyond that neighbourhood.
"""
from __future__ import annotations

import numpy as np
import torch
from torch.autograd.functional import hessian, jacobian


def _response_fn(model, features, mask, gain, receptor: int):
    with torch.no_grad():
        mol = model.encoder(features, mask)
        K, eff = model.receptors.binding_params(mol)
    K, eff = K.double(), eff.double()
    m = mask.double()
    g = None if gain is None else gain.double()
    layer = model.receptors

    def f(c: torch.Tensor) -> torch.Tensor:          # c: [N] float64 → scalar
        r = layer.response(c[None], K, eff, m, g)
        return r[0, receptor]

    return f


def taylor_analysis(model, features: torch.Tensor, conc0: np.ndarray, mask: torch.Tensor,
                    gain: torch.Tensor | None, receptor: int, selected: list[int],
                    direction: list[float] | None = None, span: float = 1.0,
                    n_points: int = 41, grid_points: int = 25, fd_step: float = 1e-5) -> dict:
    if not 1 <= len(selected) <= 3:
        raise ValueError("select 1–3 components for the Hessian")
    N = features.shape[1]
    if any(not 0 <= s < N for s in selected) or len(set(selected)) != len(selected):
        raise ValueError("invalid selected components")
    f = _response_fn(model, features, mask, gain, receptor)
    c0 = torch.tensor(conc0, dtype=torch.float64)
    sel = torch.tensor(selected)

    def f_sel(cs: torch.Tensor) -> torch.Tensor:
        c = c0.clone()
        c = c.index_put((sel,), cs)
        return f(c)

    f0 = float(f(c0))
    J = jacobian(f, c0).numpy()                                    # [N]
    H = hessian(f_sel, c0[sel]).numpy()                            # [k, k]

    # finite-difference cross-check
    def fe(c):
        return float(f(torch.as_tensor(c, dtype=torch.float64)))
    c0n = c0.numpy()
    J_fd = np.zeros(N)
    for i in range(N):
        e = np.zeros(N); e[i] = fd_step
        J_fd[i] = (fe(c0n + e) - fe(np.maximum(c0n - e, 0))) / (fd_step + min(fd_step, c0n[i]))
    k = len(selected)
    H_fd = np.zeros((k, k))
    h2 = 1e-4
    for a in range(k):
        for b in range(k):
            def shifted(da, db):
                c = c0n.copy(); c[selected[a]] += da; c[selected[b]] += db
                return fe(np.maximum(c, 0))
            H_fd[a, b] = (shifted(h2, h2) - shifted(h2, -h2) - shifted(-h2, h2) + shifted(-h2, -h2)) / (4 * h2 * h2)

    # 1-D sweep along a direction in the selected subspace, restricted to c ≥ 0
    d = np.ones(k) if direction is None else np.asarray(direction, dtype=float)
    if np.linalg.norm(d) < 1e-12:
        raise ValueError("direction must be non-zero")
    d = d / np.linalg.norm(d)
    c0_sel = c0n[selected]
    s_max = span * max(float(np.linalg.norm(c0_sel)), 0.1)
    lo, hi = -s_max, s_max
    for ck, dk in zip(c0_sel, d):
        if dk > 0:
            lo = max(lo, -ck / dk)
        elif dk < 0:
            hi = min(hi, -ck / dk)
    s = np.linspace(lo, hi, n_points)
    g_sel = J[selected]
    actual = np.array([float(f_sel(torch.tensor(np.maximum(c0_sel + si * d, 0.0)))) for si in s])
    first = f0 + s * (g_sel @ d)
    second = first + 0.5 * s ** 2 * (d @ H @ d)

    out = {
        "receptor_index": receptor,
        "f0": f0,
        "gradient": J.tolist(),
        "gradient_fd": J_fd.tolist(),
        "hessian": H.tolist(),
        "hessian_fd": H_fd.tolist(),
        "max_gradient_fd_error": float(np.max(np.abs(J - J_fd))),
        "max_hessian_fd_error": float(np.max(np.abs(H - H_fd))),
        "selected": selected,
        "direction": d.tolist(),
        "sweep": {
            "s": s.tolist(), "actual": actual.tolist(), "first_order": first.tolist(),
            "second_order": second.tolist(),
            "abs_error_first": np.abs(actual - first).tolist(),
            "abs_error_second": np.abs(actual - second).tolist(),
        },
        "rmse_first": float(np.sqrt(np.mean((actual - first) ** 2))),
        "rmse_second": float(np.sqrt(np.mean((actual - second) ** 2))),
    }
    if k >= 2:  # 2-D error map over the first two selected components
        a_i, b_i = 0, 1
        ra = np.linspace(max(-c0_sel[a_i], -s_max), s_max, grid_points)
        rb = np.linspace(max(-c0_sel[b_i], -s_max), s_max, grid_points)
        err = np.zeros((grid_points, grid_points))
        act = np.zeros_like(err)
        for ii, da in enumerate(ra):
            for jj, db in enumerate(rb):
                dc = np.zeros(k); dc[a_i], dc[b_i] = da, db
                y = float(f_sel(torch.tensor(np.maximum(c0_sel + dc, 0.0))))
                approx = f0 + g_sel @ dc + 0.5 * dc @ H @ dc
                act[ii, jj], err[ii, jj] = y, abs(y - approx)
        out["grid"] = {"delta_a": ra.tolist(), "delta_b": rb.tolist(), "actual": act.tolist(),
                       "abs_error_second": err.tolist()}
    return out
