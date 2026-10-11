"""Fixed linear projections of z ∈ R^256 into the 3-D viewer.

Every supported view is an affine map  p = P (z − c),  P ∈ R^{3×256}:

* pca      — PCA fitted ONCE on the fixed reference atlas; rows of P are the
             top-3 principal axes divided by the reference std of each PC score.
* direct   — p_k = (z_{d_k} − mean_{d_k}) / std_{d_k}  (reference statistics).
* weighted — w_k = α e_a + (1−α) e_b on standardized coordinates, unit-normalized,
             optionally Gram–Schmidt orthogonalized across axes.

Because all views are linear, a 3-D displacement Δp can be lifted to a latent
displacement with the minimum-norm rule Δz = P⁺ Δp (P⁺ = Moore–Penrose
pseudoinverse; equals Pᵀ(PPᵀ)⁻¹ when P has full row rank). This is ONE choice
among infinitely many latent vectors with the same projection: it changes z
only inside the row space of P and leaves the orthogonal complement untouched.

The TypeScript twin of this module lives in frontend/src/mathematics/projection.ts;
`tests/test_projection.py` writes a fixture that the frontend test-suite checks.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class ReferenceProjection:
    mean: np.ndarray                 # [E]   reference centre μ
    pca_components: np.ndarray       # [3,E] unit principal axes
    pca_scale: np.ndarray            # [3]   std of reference PC scores
    explained_variance_ratio: np.ndarray  # [3]
    dim_mean: np.ndarray             # [E]
    dim_std: np.ndarray              # [E]

    def to_json(self) -> dict:
        return {k: np.round(v, 6).tolist() for k, v in self.__dict__.items()}

    @classmethod
    def from_json(cls, d: dict) -> "ReferenceProjection":
        return cls(**{k: np.asarray(v, dtype=np.float64) for k, v in d.items()})


def fit_reference_projection(Z: np.ndarray) -> ReferenceProjection:
    """Fit once on the fixed reference collection Z [M, E]. Never refit on slider moves."""
    Z = np.asarray(Z, dtype=np.float64)
    mu = Z.mean(0)
    X = Z - mu
    _, S, Vt = np.linalg.svd(X, full_matrices=False)
    comps = Vt[:3].copy()
    # deterministic sign convention: largest-|loading| entry of each axis is positive
    for k in range(3):
        if comps[k, np.argmax(np.abs(comps[k]))] < 0:
            comps[k] *= -1
    var = S ** 2 / (len(Z) - 1)
    scores = X @ comps.T
    return ReferenceProjection(
        mean=mu, pca_components=comps, pca_scale=scores.std(0) + 1e-12,
        explained_variance_ratio=var[:3] / var.sum(),
        dim_mean=mu.copy(), dim_std=Z.std(0) + 1e-8,
    )


def effective_projection(ref: ReferenceProjection, mode: str, params: dict | None = None
                         ) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """Return (P [3,E], centre c [E], warnings) for the requested view."""
    params = params or {}
    warnings: list[str] = []
    E = ref.mean.shape[0]
    if mode == "pca":
        return ref.pca_components / ref.pca_scale[:, None], ref.mean, warnings
    if mode == "direct":
        dims = params.get("dims", [0, 1, 2])
        if len(set(dims)) < 3:
            warnings.append("degenerate: the same latent dimension is used on more than one axis")
        P = np.zeros((3, E))
        for k, d in enumerate(dims):
            if not 0 <= d < E:
                raise ValueError(f"dimension {d} out of range")
            P[k, d] = 1.0 / ref.dim_std[d]
        return P, ref.dim_mean, warnings
    if mode == "weighted":
        axes = params.get("axes")
        if not axes or len(axes) != 3:
            raise ValueError("weighted mode requires three axes {primary, secondary, mix}")
        W = np.zeros((3, E))
        for k, ax in enumerate(axes):
            a, b, alpha = int(ax["primary"]), int(ax["secondary"]), float(ax["mix"])
            if not 0.0 <= alpha <= 1.0:
                raise ValueError("mix must be in [0, 1]")
            W[k, a] += 1.0 - alpha
            W[k, b] += alpha
            n = np.linalg.norm(W[k])
            if n < 1e-12:
                raise ValueError("zero projection axis")
            W[k] /= n
        if params.get("orthogonalize", False):
            Q = np.zeros_like(W)
            for k in range(3):
                v = W[k] - sum((W[k] @ Q[j]) * Q[j] for j in range(k))
                n = np.linalg.norm(v)
                if n < 1e-8:
                    warnings.append(f"axis {'XYZ'[k]} is linearly dependent on previous axes; orthogonalization skipped for it")
                    Q[k] = W[k]
                else:
                    Q[k] = v / n
            W = Q
        G = W @ W.T
        if np.linalg.matrix_rank(G, tol=1e-8) < 3:
            warnings.append("degenerate: projection axes are linearly dependent")
        return W / ref.dim_std[None, :], ref.dim_mean, warnings
    raise ValueError(f"unknown projection mode {mode!r}")


def project(Z: np.ndarray, P: np.ndarray, centre: np.ndarray) -> np.ndarray:
    """Pure function: does not modify Z. Z [..., E] → [..., 3]."""
    return (np.asarray(Z, dtype=np.float64) - centre) @ P.T


def lift_displacement(P: np.ndarray, dp: np.ndarray, rcond: float = 1e-10) -> np.ndarray:
    """Minimum-norm latent displacement Δz = P⁺ Δp (numerically stable via SVD)."""
    return np.linalg.pinv(P, rcond=rcond) @ np.asarray(dp, dtype=np.float64)


def fit_umap(Z: np.ndarray, seed: int = 42):  # pragma: no cover - optional dependency
    """Optional non-linear view. NOT invertible, so inverse dragging is disabled for it."""
    try:
        import umap
    except ImportError as exc:
        raise ImportError("umap-learn is not installed (optional extra: pip install '.[umap]')") from exc
    reducer = umap.UMAP(n_components=3, random_state=seed)
    return reducer, reducer.fit_transform(Z)
