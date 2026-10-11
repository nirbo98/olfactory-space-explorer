"""The exported browser graphs must reproduce the PyTorch model (skipped if not exported / no onnxruntime)."""
import numpy as np
import pytest
import torch

from app.config import REPO_ROOT

ort = pytest.importorskip("onnxruntime")
STATIC = REPO_ROOT / "frontend" / "public" / "static"
pytestmark = pytest.mark.skipif(not (STATIC / "model_static.onnx").exists(), reason="run scripts/export_static.py")

MIX = [{"compound_id": "C001", "concentration": 0.5}, {"compound_id": "C005", "concentration": 0.2},
       {"compound_id": "C017", "concentration": 1.3}]


@pytest.fixture(scope="module")
def batch(engine):
    idx, conc = engine._parse_mixture(MIX)
    f, c, m = engine._batch([(idx, conc), (idx, conc)])
    g = torch.ones(2, 64)
    g[0, 2] = 0.0
    return f, c, m, g


@pytest.mark.parametrize("lateral,keep", [(True, 52), (False, 52), (True, 256)])
def test_static_graph_matches_pytorch(engine, batch, lateral, keep):
    f, c, m, g = batch
    sess = ort.InferenceSession(str(STATIC / "model_static.onnx"))
    r, b, s, z, d, i = sess.run(None, {"features": f.numpy(), "conc": c.numpy(), "mask": m.float().numpy(),
                                       "gain": g.numpy(), "lateral": np.array([float(lateral)], np.float32),
                                       "keep_k": np.array([keep], np.int64)})
    with torch.no_grad():
        out = engine.model(f, c, m, g, lateral_inhibition=lateral, sparsity=None if keep == 256 else 0.2)
    assert np.allclose(r, out.receptor_activities.numpy(), atol=1e-5)
    assert np.allclose(z, out.odor_embedding.numpy(), atol=1e-4)
    assert np.allclose(d, out.descriptor_predictions.numpy(), atol=1e-4)


def test_temporal_graph_matches_pytorch(engine, batch):
    f, c, m, g = batch
    from app.simulation.scenarios import SCENARIOS, profile, time_grid
    t, dt = time_grid(4.0, 120)
    prof = torch.as_tensor(profile(SCENARIOS["sniff_4hz"], t), dtype=torch.float32)
    ct = c[:1, None, :] * prof[None, :, None]
    sess = ort.InferenceSession(str(STATIC / "model_temporal.onnx"))
    r, b, s, z, i = sess.run(None, {"features": f[:1].numpy(), "conc_t": ct.numpy(), "mask": m[:1].float().numpy(),
                                    "gain": g[:1].numpy(), "lateral": np.array([1.0], np.float32),
                                    "keep_k": np.array([52], np.int64), "dt": np.array([dt], np.float32)})
    with torch.no_grad():
        out = engine.model(f[:1], ct, m[:1], g[:1], dt=dt)
    assert np.allclose(r, out.receptor_activities.numpy(), atol=1e-5)
    assert np.allclose(b, out.bulb_activities.numpy(), atol=1e-4)
    assert np.allclose(z, out.odor_embedding.numpy(), atol=1e-3)
