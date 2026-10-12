"""Mathematical tests 12–14: Taylor derivatives, FFT, inverse-optimization bounds."""
import numpy as np
import torch

from app.mathematics.approximation import taylor_analysis
from app.mathematics.fourier import analyze
from app.mathematics.optimization import inverse_design
from conftest import make_batch


def _mixture_row(dataset, k=3):
    return next(i for i in range(len(dataset["sample_ids"])) if dataset["mask"][i].sum() == k)


def test_taylor_derivatives_match_finite_differences(model, dataset):
    row = _mixture_row(dataset)
    f, c, m = make_batch(dataset, [row])
    n = int(m.sum())
    res = taylor_analysis(model, f[:, :n], c[0, :n].numpy(), m[:, :n], None, receptor=5, selected=[0, 1])
    assert res["max_gradient_fd_error"] < 1e-5
    assert res["max_hessian_fd_error"] < 1e-3
    H = np.array(res["hessian"])
    assert np.allclose(H, H.T, atol=1e-10)


def test_second_order_is_better_locally(model, dataset):
    row = _mixture_row(dataset)
    f, c, m = make_batch(dataset, [row])
    n = int(m.sum())
    res = taylor_analysis(model, f[:, :n], c[0, :n].numpy(), m[:, :n], None, receptor=11, selected=[0, 1],
                          span=0.2)
    s = np.array(res["sweep"]["s"])
    e1, e2 = np.array(res["sweep"]["abs_error_first"]), np.array(res["sweep"]["abs_error_second"])
    near = np.abs(s) < 0.3 * np.abs(s).max()
    assert e2[near].mean() <= e1[near].mean() + 1e-12
    assert np.isclose(res["sweep"]["actual"][np.argmin(np.abs(s))], res["f0"], atol=1e-3)


def test_fft_identifies_known_frequencies():
    dt = 4.0 / 120
    t = np.arange(120) * dt
    x = 0.8 * np.sin(2 * np.pi * 3.0 * t) + 0.3 * np.sin(2 * np.pi * 7.0 * t) + 0.5
    res = analyze(x, dt, band=(2.5, 3.5))
    dom = [d["frequency"] for d in res["dominant"][:2]]
    assert np.isclose(dom[0], 3.0) and np.isclose(dom[1], 7.0)
    assert np.isclose(res["dominant"][0]["amplitude"], 0.8, atol=1e-6)
    assert np.isclose(res["nyquist"], 15.0)
    recon = np.array(res["reconstruction"])
    assert np.allclose(recon, 0.8 * np.sin(2 * np.pi * 3.0 * t) + 0.5, atol=1e-8)


def test_inverse_optimization_respects_bounds(model, dataset):
    feats = torch.as_tensor(dataset["compound_features"])
    f, c, m = make_batch(dataset, [250])
    with torch.no_grad():
        z_t = model(f, c, m).odor_embedding[0].numpy()
    res = inverse_design(model, feats, list(range(12)), z_t, max_components=3, n_starts=4, steps=40,
                         refine_steps=20, c_max=2.0)
    for cand in res["candidates"]:
        assert 1 <= len(cand["components"]) <= 3
        assert all(0 < conc <= 2.0 for _, conc in cand["components"])
    hist = np.array(res["history"])
    assert hist.shape == (4, 60)
    assert hist[:, -1].min() <= hist[:, 0].min() + 1e-6
    assert all(p.requires_grad for p in model.parameters())          # model left intact


def test_inverse_does_not_mutate_shared_model(model, dataset):
    """An inverse request must never change parameters, flags, or model mode.

    The server shares a model instance between inference requests, so toggling
    requires_grad_ (even if restored later) is unsafe.
    """
    feats = torch.as_tensor(dataset["compound_features"])
    f, c, m = make_batch(dataset, [250])
    with torch.no_grad():
        target = model(f, c, m).odor_embedding[0].numpy()
    before_flags = [p.requires_grad for p in model.parameters()]
    before_weights = [p.detach().clone() for p in model.parameters()]
    before_grads = [p.grad for p in model.parameters()]
    before_training_mode = model.training
    inverse_design(model, feats, list(range(8)), target, max_components=3,
                   n_starts=2, steps=5, refine_steps=2, c_max=2.0)
    assert [p.requires_grad for p in model.parameters()] == before_flags
    assert model.training == before_training_mode
    assert all(torch.equal(p, before) for p, before in zip(model.parameters(), before_weights))
    assert all(p.grad is before for p, before in zip(model.parameters(), before_grads))


def test_write_fourier_fixture():
    """Fixture for the in-browser (static build) DFT twin in frontend/src/mathematics/fourier.ts."""
    import json
    from pathlib import Path
    out = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mathematics" / "__fixtures__" / "fourier_fixture.json"
    dt = 4.0 / 120
    t = np.arange(120) * dt
    cases = []
    for sig, band in [(0.8 * np.sin(2 * np.pi * 3 * t) + 0.3 * np.sin(2 * np.pi * 7 * t) + 0.5, [2.5, 3.5]),
                      (np.exp(-((t - 1.5) ** 2) / 0.1) * (1 + 0.3 * np.cos(2 * np.pi * 4 * t)), [0.0, 6.0])]:
        r = analyze(sig, dt, band=tuple(band))
        cases.append({"signal": sig.tolist(), "dt": dt, "band": band, "expected": r})
    sig = np.random.default_rng(0).normal(size=33)  # odd length
    cases.append({"signal": sig.tolist(), "dt": 0.1, "band": [1.0, 3.0], "expected": analyze(sig, 0.1, band=(1.0, 3.0))})
    out.write_text(json.dumps(cases))
    assert out.exists()
