"""Mathematical tests 12–14: Taylor derivatives, FFT, inverse-optimization bounds."""
import threading

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


# --- inverse design must never mutate the shared model, not even transiently -------------
# The API server shares ONE model instance between requests (FastAPI runs sync endpoints in
# a thread pool). Toggling requires_grad_ / eval() during optimization and restoring them
# afterwards leaves the final state intact but exposes a broken model to concurrent
# requests, so these tests inspect the model *while* the optimizer is running.

def _model_state(model) -> dict:
    params = list(model.parameters())
    return {
        "training": [mod.training for mod in model.modules()],
        "requires_grad": [p.requires_grad for p in params],
        "grad_is_none": [p.grad is None for p in params],
        "version": [p._version for p in params],      # bumped by any in-place write to a parameter
    }


def _inverse_target(model, dataset):
    f, c, m = make_batch(dataset, [250])
    with torch.no_grad():
        return model(f, c, m).odor_embedding[0].numpy()


def test_inverse_never_mutates_shared_model_during_optimization(model, dataset):
    """Deterministic instrumentation: snapshot the model state at EVERY forward pass the
    optimizer makes. Every snapshot (not just the final state) must equal the baseline."""
    feats = torch.as_tensor(dataset["compound_features"])
    target = _inverse_target(model, dataset)
    model.train()                       # a non-default mode, so a forced .eval() is also detected
    baseline = _model_state(model)
    weights = [p.detach().clone() for p in model.parameters()]
    seen: list[dict] = []
    handle = model.register_forward_pre_hook(lambda mod, args: seen.append(_model_state(mod)))
    try:
        inverse_design(model, feats, list(range(8)), target, max_components=3,
                       n_starts=2, steps=5, refine_steps=3, c_max=2.0)
    finally:
        handle.remove()
    assert len(seen) == 5 + 3 + 1       # every optimization step + the final evaluation was observed
    for i, state in enumerate(seen):
        for key in baseline:
            assert state[key] == baseline[key], f"model.{key} changed during optimization (forward #{i})"
    assert _model_state(model) == baseline
    assert all(torch.equal(p, w) for p, w in zip(model.parameters(), weights))


def test_concurrent_request_sees_intact_model_while_inverse_runs(model, dataset):
    """Concurrency: pause the optimizer inside its first forward pass (event-synchronized,
    no sleeps), then act as a second request on the same shared model and verify it gets
    gradient-enabled parameters and the original mode."""
    feats = torch.as_tensor(dataset["compound_features"])
    target = _inverse_target(model, dataset)
    f, c, m = make_batch(dataset, [10])

    def gradient_request() -> tuple[bool, list[bool]]:
        """A second request that needs parameter gradients (e.g. a Taylor/saliency analysis).
        Returns whether its loss was differentiable and which parameters received a gradient."""
        for p in model.parameters():
            p.grad = None
        loss = model(f, c, m).odor_embedding.pow(2).mean()
        if loss.requires_grad:
            loss.backward()
        got = [p.grad is not None for p in model.parameters()]
        for p in model.parameters():
            p.grad = None
        return loss.requires_grad, got

    solo_ok, solo_grads = gradient_request()      # reference: the same request with nothing else running
    assert solo_ok and any(solo_grads)
    baseline = _model_state(model)
    paused, resume = threading.Event(), threading.Event()
    worker_ident: list[int] = []
    errors: list[BaseException] = []

    def hook(mod, args):
        if worker_ident and threading.get_ident() == worker_ident[0] and not paused.is_set():
            paused.set()
            resume.wait(timeout=60)

    def worker():
        worker_ident.append(threading.get_ident())
        try:
            inverse_design(model, feats, list(range(8)), target, max_components=3,
                           n_starts=2, steps=4, refine_steps=2, c_max=2.0)
        except BaseException as exc:    # surfaced in the main thread below
            errors.append(exc)

    handle = model.register_forward_pre_hook(hook)
    thread = threading.Thread(target=worker, daemon=True)
    try:
        thread.start()
        assert paused.wait(timeout=60), "optimizer never reached its first forward pass"
        # --- optimizer is now suspended mid-request; this is a concurrent request ---
        during = _model_state(model)
        concurrent_ok, concurrent_grads = gradient_request()
    finally:
        resume.set()
        thread.join(timeout=120)
        handle.remove()
    assert not thread.is_alive() and not errors, errors
    assert during["requires_grad"] == baseline["requires_grad"], "inverse request disabled gradients on the shared model"
    assert during["training"] == baseline["training"], "inverse request changed the shared model's mode"
    assert concurrent_ok, "concurrent request's loss was not differentiable"
    assert concurrent_grads == solo_grads, "concurrent request received gradients for fewer parameters than when run alone"


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
