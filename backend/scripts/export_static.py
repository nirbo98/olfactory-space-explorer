"""Export everything the static (GitHub Pages) build needs into frontend/public/static/.

* model_static.onnx / model_temporal.onnx — the trained model for in-browser inference
* config, atlas, compounds, datasets, metrics, scenario profiles (as the API would serve them)
* teacher references for every reference mixture and single-compound teacher dose curves
* precomputed Taylor analyses (default mixture, every receptor) and inverse designs for
  a fixed set of targets — these need autograd / gradient optimization, unavailable in-browser

python scripts/export_static.py
"""
import json
from pathlib import Path

import _path  # noqa: F401
import numpy as np
import torch
from app.api import routes
from app.config import MODEL_VERSION, REPO_ROOT
from app.datasets.importer import SyntheticDataSource
from app.export.onnx_graphs import StaticGraph, TemporalGraph
from app.simulation.engine import OlfactoryEngine, _r
from app.simulation.scenarios import SCENARIOS, profile, time_grid

OUT = REPO_ROOT / "frontend" / "public" / "static"
FRAMES, TOTAL = 120, 4.0
DEFAULT_MIX = [{"compound_id": "C001", "concentration": 0.5}, {"compound_id": "C005", "concentration": 0.2}]


class _Req:  # minimal stand-in for fastapi.Request
    def __init__(self, engine):
        self.app = type("A", (), {"state": type("S", (), {"engine": engine})()})()


def dump(name: str, obj) -> None:
    (OUT / name).write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False))


def export_onnx(engine: OlfactoryEngine) -> None:
    model = engine.model.eval()
    F, R = model.config.n_features, model.config.n_receptors
    B, N = 2, 3
    feats = torch.randn(B, N, F)
    conc, mask, gain = torch.rand(B, N), torch.ones(B, N), torch.ones(B, R)
    lat, k = torch.tensor([1.0]), torch.tensor([52], dtype=torch.long)
    common = dict(opset_version=17, dynamo=False, do_constant_folding=True)
    torch.onnx.export(StaticGraph(model), (feats, conc, mask, gain, lat, k), OUT / "model_static.onnx",
                      input_names=["features", "conc", "mask", "gain", "lateral", "keep_k"],
                      output_names=["receptor", "bulb", "cortical", "embedding", "descriptors", "intensity"],
                      dynamic_axes={"features": {0: "B", 1: "N"}, "conc": {0: "B", 1: "N"}, "mask": {0: "B", 1: "N"},
                                    "gain": {0: "B"}, "receptor": {0: "B"}, "bulb": {0: "B"}, "cortical": {0: "B"},
                                    "embedding": {0: "B"}, "descriptors": {0: "B"}, "intensity": {0: "B"}}, **common)
    conc_t = torch.rand(1, FRAMES, N)
    torch.onnx.export(TemporalGraph(model, FRAMES), (feats[:1], conc_t, mask[:1], gain[:1], lat, k, torch.tensor([TOTAL / FRAMES])),
                      OUT / "model_temporal.onnx",
                      input_names=["features", "conc_t", "mask", "gain", "lateral", "keep_k", "dt"],
                      output_names=["receptor", "bulb", "cortical", "embedding", "intensity"],
                      dynamic_axes={"features": {1: "N"}, "conc_t": {2: "N"}, "mask": {1: "N"}}, **common)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(2)
    e = OlfactoryEngine()
    if e.status != "trained":
        raise SystemExit("train the model first (make train)")
    req = _Req(e)
    export_onnx(e)

    cfg = routes.config(req)
    cfg["static_build"] = {"frames": FRAMES, "total_seconds": TOTAL,
                           "note": "in-browser ONNX inference of the trained checkpoint; Taylor and inverse design precomputed"}
    dump("config.json", cfg)
    dump("atlas.json", e.atlas_json)
    dump("compounds.json", routes.compounds(req))
    dump("datasets.json", routes.datasets(req))
    dump("metrics.json", routes.metrics(req))
    dump("features.json", _r(e.features.numpy(), 6))
    t, dt = time_grid(TOTAL, FRAMES)
    dump("scenarios.json", {s.id: {"scenario": s.to_dict(), "times": _r(t, 6), "dt": dt, "stimulus": _r(profile(s, t))}
                            for s in SCENARIOS.values()})

    # synthetic teacher references (ground truth of the simulated world) for each reference mixture
    teacher = {}
    for s in e.atlas_json["samples"]:
        idx = [e.cid_index[c["compound_id"]] for c in s["components"]]
        conc = [c["concentration"] for c in s["components"]]
        out = e.teacher.full(idx, conc)
        teacher[s["id"]] = {"receptor": _r(out["receptor"], 4), "descriptors": _r(out["descriptors"], 4),
                            "intensity": round(out["intensity"], 4)}
    dump("teacher.json", teacher)
    grid = np.logspace(-3, 1, 60)
    dump("dose_teacher.json", {"concentrations": _r(grid, 6), "curves": {
        cid: _r([e.teacher.receptor_response([i], [c]) for c in grid], 4) for cid, i in e.cid_index.items()}})

    # precomputed analyses that need autograd / gradient-based optimization
    dump("taylor_default.json", {"mixture": DEFAULT_MIX, "selected": ["C001", "C005"], "span": 1.0, "results": {
        rid: e.taylor(DEFAULT_MIX, rid, ["C001", "C005"]) for rid in e.receptor_ids}})
    samples = e.atlas_json["samples"]
    by_cluster = {}
    for s in samples:
        if s["split"] in ("test", "heldout_compound") or len(by_cluster.get(s["cluster"], [])) < 1:
            by_cluster.setdefault(s["cluster"], [])
            if len(by_cluster[s["cluster"]]) < 2:
                by_cluster[s["cluster"]].append(s["id"])
    targets = ["M0001"] + [i for ids in by_cluster.values() for i in ids if i != "M0001"]
    inv = {}
    for tid in targets:
        print("inverse", tid)
        inv[tid] = e.inverse(target_sample_id=tid, max_components=3, n_starts=8, steps=200, refine_steps=150)
    dump("inverse.json", {"params": {"max_components": 3, "n_starts": 8, "steps": 200, "refine_steps": 150,
                                     "sparsity_weight": 1e-3, "allowed": "all"}, "results": inv})
    sizes = {p.name: f"{p.stat().st_size / 1e6:.2f} MB" for p in sorted(OUT.iterdir())}
    print(json.dumps(sizes, indent=1))
    print(f"static export for {MODEL_VERSION} written to {OUT}")


if __name__ == "__main__":
    main()
