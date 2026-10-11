"""Mathematical tests 9–11 and lifting; writes the cross-language fixture."""
import json
from pathlib import Path

import numpy as np
import pytest

from app.mathematics.projection import (ReferenceProjection, effective_projection, fit_reference_projection, lift_displacement,
                                        project)

FIXTURE = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mathematics" / "__fixtures__" / "projection_fixture.json"


@pytest.fixture(scope="module")
def ref_and_Z():
    rng = np.random.default_rng(1)
    Z = rng.normal(size=(120, 256)) @ np.diag(np.linspace(3, 0.1, 256))
    return fit_reference_projection(Z), Z


def test_pca_returns_three_coordinates(ref_and_Z):
    ref, Z = ref_and_Z
    P, c, _ = effective_projection(ref, "pca")
    p = project(Z, P, c)
    assert p.shape == (120, 3)
    assert np.all(np.diff(ref.explained_variance_ratio) <= 1e-12)        # sorted
    assert np.allclose(p.std(0), 1.0, atol=1e-6)                          # unit-scaled PC scores


def test_same_embedding_same_point(ref_and_Z):
    ref, Z = ref_and_Z
    P, c, _ = effective_projection(ref, "pca")
    a, b = project(Z[7], P, c), project(Z[7].copy(), P, c)
    assert np.array_equal(a, b)
    ref2 = fit_reference_projection(Z)                                    # refit on same reference → identical
    P2, c2, _ = effective_projection(ref2, "pca")
    assert np.allclose(project(Z[7], P2, c2), a)


def test_projection_does_not_mutate_embeddings(ref_and_Z):
    ref, Z = ref_and_Z
    before = Z.copy()
    for mode, params in [("pca", {}), ("direct", {"dims": [17, 3, 9]}),
                         ("weighted", {"axes": [{"primary": 0, "secondary": 5, "mix": 0.3}] * 3})]:
        P, c, _ = effective_projection(ref, mode, params)
        project(Z, P, c)
    assert np.array_equal(Z, before)


def test_direct_mode_selects_dimensions(ref_and_Z):
    ref, Z = ref_and_Z
    P, c, w = effective_projection(ref, "direct", {"dims": [17, 1, 2]})
    p = project(Z, P, c)
    assert np.allclose(p[:, 0], (Z[:, 17] - ref.dim_mean[17]) / ref.dim_std[17])
    assert not w
    _, _, w = effective_projection(ref, "direct", {"dims": [4, 4, 2]})
    assert any("degenerate" in s for s in w)


def test_weighted_orthogonalization(ref_and_Z):
    ref, _ = ref_and_Z
    axes = [{"primary": 0, "secondary": 1, "mix": 0.5}, {"primary": 1, "secondary": 0, "mix": 0.2},
            {"primary": 2, "secondary": 3, "mix": 0.0}]
    P, _, _ = effective_projection(ref, "weighted", {"axes": axes, "orthogonalize": True})
    W = P * ref.dim_std[None, :]
    assert np.allclose(W @ W.T, np.eye(3), atol=1e-8)
    _, _, w = effective_projection(ref, "weighted", {"axes": [axes[0], axes[0], axes[2]]})
    assert any("degenerate" in s for s in w)


@pytest.mark.parametrize("mode,params", [("pca", {}), ("direct", {"dims": [17, 3, 9]}),
                                         ("weighted", {"axes": [{"primary": 0, "secondary": 5, "mix": 0.3},
                                                                {"primary": 9, "secondary": 2, "mix": 0.7},
                                                                {"primary": 40, "secondary": 41, "mix": 0.5}]})])
def test_minimum_norm_lift_reproduces_displacement(ref_and_Z, mode, params):
    ref, Z = ref_and_Z
    P, c, _ = effective_projection(ref, mode, params)
    dp = np.array([0.4, -0.2, 0.7])
    dz = lift_displacement(P, dp)
    assert np.allclose(project(Z[0] + dz, P, c) - project(Z[0], P, c), dp, atol=1e-8)
    # minimum norm: Δz lies in the row space of P
    Q, _ = np.linalg.qr(P.T)
    assert np.allclose(Q @ (Q.T @ dz), dz, atol=1e-8)


def test_write_frontend_fixture(ref_and_Z):
    """Exports reference stats + expected outputs so the TypeScript twin is checked against Python."""
    ref, Z = ref_and_Z
    ref = ReferenceProjection.from_json(ref.to_json())   # exactly what the API serves (rounded JSON)
    cases = []
    params_list = [("pca", {}), ("direct", {"dims": [17, 3, 9]}),
                   ("weighted", {"axes": [{"primary": 0, "secondary": 5, "mix": 0.3},
                                          {"primary": 9, "secondary": 2, "mix": 0.7},
                                          {"primary": 40, "secondary": 41, "mix": 0.5}], "orthogonalize": True})]
    for mode, params in params_list:
        P, c, _ = effective_projection(ref, mode, params)
        dp = [0.5, -0.25, 0.1]
        cases.append({"mode": mode, "params": params, "coords": project(Z[:5], P, c).tolist(),
                      "lift_delta": dp, "lifted": (Z[0] + lift_displacement(P, np.array(dp))).tolist()})
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(json.dumps({"reference": ref.to_json(), "embeddings": Z[:5].tolist(), "cases": cases}))
    assert FIXTURE.exists()
