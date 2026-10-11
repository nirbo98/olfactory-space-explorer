"""Mathematical test 7: temporal integration stability."""
import torch

from app.mathematics.dynamics import euler_step, exponential_integrate
from conftest import make_batch


def test_exact_integration_stable_for_large_steps():
    tau = torch.tensor([0.02, 0.1, 0.4])
    b = torch.rand(2, 200, 3) * 5
    for dt in (0.001, 0.05, 1.0, 100.0):           # dt ≫ τ would explode with forward Euler
        h = exponential_integrate(b, dt, tau, h0=torch.zeros(2, 3))
        assert torch.isfinite(h).all()
        assert h.min() >= 0 and h.max() <= b.max() + 1e-6   # convex combination stays in range


def test_converges_to_constant_input():
    tau = torch.tensor([0.05, 0.3])
    b = torch.full((1, 400, 2), 0.7)
    h = exponential_integrate(b, 0.01, tau, h0=torch.zeros(1, 2))
    assert torch.allclose(h[0, -1], torch.tensor([0.7, 0.7]), atol=1e-4)


def test_euler_is_unstable_where_exact_is_not():
    tau = torch.tensor([0.02])
    h = torch.tensor([1.0])
    for _ in range(50):
        h = euler_step(h, torch.tensor([0.0]), 0.1, tau)
    assert h.abs() > 1e6
    exact = exponential_integrate(torch.zeros(1, 50, 1), 0.1, tau, h0=torch.ones(1, 1))
    assert exact.abs().max() <= 1.0


def test_model_temporal_trajectory_is_stable(model, dataset):
    f, c, m = make_batch(dataset, [3, 77])
    T = 240
    ct = c[:, None, :].expand(-1, T, -1).contiguous()
    out = model(f, ct, m, dt=4.0 / 120)
    assert torch.isfinite(out.odor_embedding).all()
    tau = model.bulb.tau()
    assert (tau >= model.config.tau_min).all() and (tau <= model.config.tau_max).all()
