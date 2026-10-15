"""API contract tests (run against the trained checkpoint when present)."""
import numpy as np

MIX = [{"compound_id": "C001", "concentration": 0.5}, {"compound_id": "C005", "concentration": 0.2}]


def test_health_and_config(client):
    assert client.get("/api/v1/health").json()["status"] == "ok"
    cfg = client.get("/api/v1/config").json()
    assert cfg["model_config"]["embedding_dim"] == 256 and len(cfg["receptor_ids"]) == 64


def test_atlas_and_compounds(client):
    a = client.get("/api/v1/atlas").json()
    assert len(a["embeddings"]) == len(a["samples"]) >= 200
    assert len(a["embeddings"][0]) == 256
    assert len(a["projection"]["pca_components"]) == 3
    assert len(client.get("/api/v1/compounds").json()["compounds"]) == 32
    assert client.get("/api/v1/samples?split=test").json()["total"] > 0


def test_simulate_shapes_and_provenance(client):
    r = client.post("/api/v1/simulate", json={"mixture": MIX, "frame_count": 60}).json()
    assert len(r["odor_embedding"]) == 256 and len(r["receptor_activities"]) == 64
    assert len(r["bulb_activities"]) == 64 and len(r["cortical_activities"]) == 256
    tr = r["trajectory"]
    assert np.array(tr["odor_embedding"]).shape == (60, 256)
    assert np.array(tr["receptor_activities"]).shape == (60, 64)
    assert r["provenance"] in ("synthetic_model_prediction", "untrained_random_weights")
    assert r["teacher_reference"]["provenance"] == "synthetic_teacher_ground_truth"


def test_simulate_validation(client):
    bad = client.post("/api/v1/simulate", json={"mixture": [{"compound_id": "C001", "concentration": -1}]})
    assert bad.status_code == 422
    unk = client.post("/api/v1/simulate", json={"mixture": [{"compound_id": "X999", "concentration": 1}]})
    assert unk.status_code == 422 and "unknown compound" in unk.text
    kd = client.post("/api/v1/simulate", json={"mixture": MIX, "receptor_knockdowns": {"R003": 1.5}})
    assert kd.status_code == 422


def test_concentration_change_moves_embedding(client):
    a = client.post("/api/v1/simulate", json={"mixture": MIX, "include_trajectory": False}).json()
    mix2 = [dict(MIX[0], concentration=1.5), MIX[1]]
    b = client.post("/api/v1/simulate", json={"mixture": mix2, "include_trajectory": False}).json()
    assert np.linalg.norm(np.subtract(a["odor_embedding"], b["odor_embedding"])) > 1e-3
    assert np.abs(np.subtract(a["receptor_activities"], b["receptor_activities"])).max() > 1e-4


def test_receptor_knockout_R003(client):
    a = client.post("/api/v1/simulate", json={"mixture": MIX, "include_trajectory": False,
                                              "receptor_knockdowns": {"R003": 1.0}}).json()
    assert a["receptor_activities"][2] == 0
    assert a["baseline"]["receptor_activities"][2] > 0
    assert a["baseline"]["embedding_shift_norm"] > 0


def test_atlas_sample_reproduces_reference_embedding(client):
    atlas = client.get("/api/v1/atlas").json()
    s = atlas["samples"][123]
    r = client.post("/api/v1/simulate", json={"mixture": s["components"], "include_trajectory": False}).json()
    assert np.allclose(r["odor_embedding"], atlas["embeddings"][123], atol=1e-3)


def test_project_and_lift(client):
    atlas = client.get("/api/v1/atlas").json()
    z = atlas["embeddings"][0]
    r = client.post("/api/v1/project", json={"embeddings": [z], "mode": "pca", "lift_from": z,
                                             "lift_delta": [0.5, 0, 0]}).json()
    p0 = np.array(r["coordinates"][0])
    r2 = client.post("/api/v1/project", json={"embeddings": [r["lifted_embedding"]], "mode": "pca"}).json()
    assert np.allclose(np.array(r2["coordinates"][0]) - p0, [0.5, 0, 0], atol=1e-4)


def test_fourier_taylor_dose_inverse(client):
    t = np.arange(120) * (4 / 120)
    f = client.post("/api/v1/analyze/fourier", json={"signal": np.sin(2 * np.pi * 4 * t).tolist(),
                                                     "sample_spacing": 4 / 120}).json()
    assert np.isclose(f["dominant"][0]["frequency"], 4.0)
    tay = client.post("/api/v1/analyze/taylor", json={"mixture": MIX, "receptor_id": "R010",
                                                      "selected": ["C001", "C005"]}).json()
    assert len(tay["hessian"]) == 2 and tay["max_gradient_fd_error"] < 1e-4
    dr = client.post("/api/v1/analyze/dose-response", json={"compound_id": "C003", "n_points": 10}).json()
    assert np.array(dr["receptor_activities"]).shape == (10, 64)
    inv = client.post("/api/v1/inverse-design", json={"target_sample_id": "M0100", "n_starts": 3, "steps": 30,
                                                      "refine_steps": 10, "max_components": 3}).json()
    assert inv["provenance"] == "model_based_optimization_not_experimentally_validated"
    for c in inv["candidates"]:
        assert len(c["components"]) <= 3
        assert all(0 <= x["concentration"] <= 2.0 for x in c["components"])


def test_inverse_component_limit_is_enforced(client):
    """API accepts 1–5 components (the UI defaults to 3, the Pages build uses 3)."""
    base = {"target_sample_id": "M0100", "n_starts": 1, "steps": 10, "refine_steps": 0}
    assert client.post("/api/v1/inverse-design", json={**base, "max_components": 6}).status_code == 422
    assert client.post("/api/v1/inverse-design", json={**base, "max_components": 0}).status_code == 422
    ok = client.post("/api/v1/inverse-design", json={**base, "max_components": 5})
    assert ok.status_code == 200
    assert all(len(c["components"]) <= 5 for c in ok.json()["candidates"])


def test_validation_route(client, monkeypatch, tmp_path):
    from app.api import routes
    monkeypatch.setattr(routes, "VALIDATION_PATH", tmp_path / "missing.json")
    assert client.get("/api/v1/validation").status_code == 404
    (tmp_path / "v.json").write_text('{"schema": "ose.validation.v1"}')
    monkeypatch.setattr(routes, "VALIDATION_PATH", tmp_path / "v.json")
    assert client.get("/api/v1/validation").json()["schema"] == "ose.validation.v1"
    ids = [d["id"] for d in client.get("/api/v1/datasets").json()["datasets"]]
    assert ids[0] == "synthetic-demo"
