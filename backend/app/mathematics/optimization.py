"""Model-based inverse mixture design.

    c* = argmin_{c ∈ C} ‖F(c) − z_target‖² + λ Ω(c),   C = [0, c_max]^N

* bounded by construction: c = c_max · sigmoid(θ), optimized with Adam over θ;
* Ω(c) = Σ_i √(c_i + δ) encourages sparse formulations;
* multiple random initializations run in parallel as one batch;
* cardinality (≤ max_components) is enforced by keeping the largest
  concentrations after phase 1 and re-optimizing only those in phase 2.

This searches the *trained model's* forward map. A low predicted distance is not
evidence that the mixture smells like the target — that requires experiments.
Different starts frequently reach different mixtures with similar distances:
the inverse is not unique, and the response reports that explicitly.
"""
from __future__ import annotations

import numpy as np
import torch


def _logit(p):
    p = np.clip(p, 1e-4, 1 - 1e-4)
    return np.log(p / (1 - p))


def inverse_design(model, compound_features: torch.Tensor, allowed: list[int], z_target: np.ndarray,
                   max_components: int = 5, n_starts: int = 8, steps: int = 200, refine_steps: int = 150,
                   lr: float = 0.05, sparsity_weight: float = 1e-3, c_max: float = 2.0, seed: int = 0,
                   gain: torch.Tensor | None = None) -> dict:
    if not allowed:
        raise ValueError("at least one allowed compound is required")
    if not 1 <= max_components <= 5:
        raise ValueError("max_components must be within 1..5")
    # The model may be shared by concurrent FastAPI requests. Do not mutate its
    # training mode or parameter.requires_grad flags during inverse optimization.
    # autograd.grad below differentiates the objective only with respect to theta.
    rng = np.random.default_rng(seed)
    N, S = len(allowed), n_starts
    feats = compound_features[allowed][None].expand(S, -1, -1).contiguous()
    z_t = torch.as_tensor(np.asarray(z_target), dtype=torch.float32)[None]
    g = None if gain is None else gain[None].expand(S, -1)

    c_init = 10 ** rng.uniform(np.log10(0.02), np.log10(c_max * 0.8), size=(S, N))
    # random sparse starting supports so different starts explore different formulations
    for s in range(S):
        off = rng.permutation(N)[min(N, max_components + 2):]
        c_init[s, off] = 1e-3
    theta = torch.tensor(_logit(c_init / c_max), dtype=torch.float32, requires_grad=True)

    def run(theta, mask, n_steps, history):
        opt = torch.optim.Adam([theta], lr=lr)
        for _ in range(n_steps):
            c = c_max * torch.sigmoid(theta) * mask
            out = model(feats, c, mask, g)
            dist2 = (out.odor_embedding - z_t).pow(2).sum(-1)
            omega = torch.sqrt(c + 1e-4).sum(-1) * mask.sum(-1).clamp(min=1).rsqrt()
            loss = (dist2 + sparsity_weight * omega).sum()
            opt.zero_grad(set_to_none=True)
            (theta_grad,) = torch.autograd.grad(loss, theta)
            theta.grad = theta_grad
            opt.step()
            history.append(dist2.detach().sqrt().tolist())

    history: list[list[float]] = []
    full_mask = torch.ones(S, N)
    run(theta, full_mask, steps, history)
    phase1_end = len(history)

    # enforce cardinality: keep the top-k concentrations of each start
    with torch.no_grad():
        c = c_max * torch.sigmoid(theta)
        k = min(max_components, N)
        top = c.topk(k, dim=-1).indices
        mask = torch.zeros(S, N).scatter_(-1, top, 1.0)
    run(theta, mask, refine_steps, history)

    with torch.no_grad():
        c = c_max * torch.sigmoid(theta) * mask
        c = torch.where(c < 1e-3, torch.zeros_like(c), c)        # prune negligible components
        mask_final = (c > 0).float()
        out = model(feats, c, mask_final, g)
        dist = (out.odor_embedding - z_t).pow(2).sum(-1).sqrt()

    candidates = []
    for s in range(S):
        comps = [(allowed[i], float(c[s, i])) for i in range(N) if c[s, i] > 0]
        comps.sort(key=lambda t: -t[1])
        candidates.append({
            "start": s, "components": comps, "distance": float(dist[s]),
            "embedding": out.odor_embedding[s].tolist(),
            "on_bound": [cid for cid, ci in comps if ci >= 0.98 * c_max],
        })
    candidates.sort(key=lambda d: d["distance"])
    return {
        "candidates": candidates,
        "history": np.asarray(history).T.tolist(),   # [S, steps+refine_steps]
        "phase1_steps": phase1_end,
        "c_max": c_max,
    }
