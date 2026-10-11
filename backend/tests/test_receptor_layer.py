"""Mathematical tests 1–6 and receptor-knockout propagation."""
import pytest
import torch

from conftest import make_batch


def test_receptor_output_shape(model, dataset):
    f, c, m = make_batch(dataset, [0, 100, 200])
    out = model(f, c, m)
    assert out.receptor_activities.shape == (3, model.config.n_receptors)
    assert out.odor_embedding.shape == (3, 256)
    assert out.molecular_embeddings.shape == (3, f.shape[1], 128)


def test_zero_concentration_gives_zero_receptor_response(model, dataset):
    f, c, m = make_batch(dataset, [5, 300])
    out = model(f, torch.zeros_like(c), m)
    assert torch.all(out.receptor_activities == 0)


def test_negative_concentrations_rejected(model, dataset):
    f, c, m = make_batch(dataset, [5])
    c[0, 0] = -0.1
    with pytest.raises(ValueError):
        model(f, c, m)


@pytest.mark.parametrize("scale", [1e-9, 1.0, 1e3, 1e6])
def test_receptor_outputs_finite(model, dataset, scale):
    f, c, m = make_batch(dataset, list(range(0, 600, 37)))
    out = model(f, c * scale, m)
    for t in (out.receptor_activities, out.bulb_activities, out.odor_embedding):
        assert torch.isfinite(t).all()


def test_receptor_responses_bounded(model, dataset):
    f, c, m = make_batch(dataset, list(range(0, 690, 23)))
    for scale in (0.01, 1.0, 100.0):
        r = model(f, c * scale, m).receptor_activities
        assert (r >= 0).all() and (r < 1).all()


def test_component_order_invariance(model, dataset):
    rows = [i for i in range(len(dataset["sample_ids"])) if dataset["mask"][i].sum() >= 3][:10]
    f, c, m = make_batch(dataset, rows)
    perm = torch.tensor([2, 0, 4, 1, 3])
    a = model(f, c, m)
    b = model(f[:, perm], c[:, perm], m[:, perm])
    assert torch.allclose(a.receptor_activities, b.receptor_activities, atol=1e-6)
    assert torch.allclose(a.odor_embedding, b.odor_embedding, atol=1e-5)


def test_padding_is_not_a_molecule(model, dataset):
    f, c, m = make_batch(dataset, [0])          # single component, 4 padded slots
    f2 = f.clone(); f2[0, 1:] = torch.randn_like(f2[0, 1:])  # garbage in padded slots
    c2 = c.clone(); c2[0, 1:] = 5.0
    a, b = model(f, c, m), model(f2, c2, m)
    assert torch.allclose(a.odor_embedding, b.odor_embedding, atol=1e-6)


def test_knockout_zeroes_receptor_and_changes_downstream(model, dataset):
    f, c, m = make_batch(dataset, [400])
    g = torch.ones(1, model.config.n_receptors)
    base = model(f, c, m, g)
    j = int(base.receptor_activities[0].argmax())
    g[0, j] = 0.0
    ko = model(f, c, m, g)
    assert ko.receptor_activities[0, j] == 0
    assert not torch.allclose(base.bulb_activities, ko.bulb_activities)
    assert (base.odor_embedding - ko.odor_embedding).norm() > 1e-4
    g[0, j] = 0.5   # continuous inhibition
    half = model(f, c, m, g)
    assert torch.isclose(half.receptor_activities[0, j], 0.5 * base.receptor_activities[0, j])


def test_inference_is_deterministic(model, dataset):
    f, c, m = make_batch(dataset, list(range(50)))
    a, b = model(f, c, m), model(f, c, m)
    assert torch.equal(a.odor_embedding, b.odor_embedding)
    T = 60
    ct = c[:2, None, :].expand(-1, T, -1).contiguous()
    x, y = model(f[:2], ct, m[:2], dt=0.03), model(f[:2], ct, m[:2], dt=0.03)
    assert torch.equal(x.odor_embedding, y.odor_embedding)


def test_lateral_inhibition_and_sparsity_switches(model, dataset):
    f, c, m = make_batch(dataset, [10, 20])
    a = model(f, c, m)
    b = model(f, c, m, lateral_inhibition=False)
    assert not torch.allclose(a.bulb_activities, b.bulb_activities)
    s = model(f, c, m).cortical_activities
    assert ((s != 0).sum(-1) <= 52).all()             # ~20 % of 256 kept
    d = model(f, c, m, sparsity=None).cortical_activities
    assert ((d != 0).sum(-1) > 200).all()
