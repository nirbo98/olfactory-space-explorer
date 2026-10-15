"""Versioned REST API: /api/v1."""
from __future__ import annotations

import json

import numpy as np
from fastapi import APIRouter, HTTPException, Query, Request

from ..config import CHECKPOINT_DIR, MAX_TRAINING_CONCENTRATION, MODEL_VERSION
from ..datasets import keller
from ..datasets.importer import SyntheticDataSource
from ..mathematics.projection import lift_displacement
from ..schemas.api import (DoseResponseRequest, FourierRequest, InverseDesignRequest, ProjectRequest,
                           SimulateRequest, TaylorRequest)
from ..simulation.engine import InputError, OlfactoryEngine
from ..simulation.scenarios import SCENARIOS

router = APIRouter(prefix="/api/v1")


def engine(request: Request) -> OlfactoryEngine:
    return request.app.state.engine


def _guard(fn, *a, **kw):
    try:
        return fn(*a, **kw)
    except InputError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@router.get("/health")
def health(request: Request):
    e = engine(request)
    return {"status": "ok", "model_status": e.status, "model_version": MODEL_VERSION, "model_hash": e.model_hash}


@router.get("/config")
def config(request: Request):
    e = engine(request)
    cfg = e.cfg.to_dict()
    return {
        "model_version": MODEL_VERSION,
        "model_status": e.status,
        "provenance": e.provenance,
        "model_config": cfg,
        "receptor_ids": e.receptor_ids,
        "descriptor_labels": list(e.ds["descriptor_labels"]),
        "max_training_concentration": MAX_TRAINING_CONCENTRATION,
        "scenarios": [s.to_dict() for s in SCENARIOS.values()],
        "architecture": [
            {"stage": "molecular_encoder", "space": "H_M", "shape": [cfg["mol_dim"]]},
            {"stage": "receptor_interaction", "space": "H_R", "shape": [cfg["n_receptors"]]},
            {"stage": "olfactory_bulb", "space": "H_B", "shape": [cfg["bulb_dim"]]},
            {"stage": "piriform_cortex", "space": "H_P", "shape": [cfg["cortex_hidden"]]},
            {"stage": "odor_embedding", "space": "H_P", "shape": [cfg["embedding_dim"]]},
        ],
        "training": None if e.ckpt is None else {
            "best_epoch": e.ckpt["best_epoch"], "epochs_run": e.ckpt["epochs_run"],
            "train_config": e.ckpt["train_config"], "training_seconds": e.ckpt.get("training_seconds")},
    }


@router.get("/datasets")
def datasets(request: Request):
    e = engine(request)
    ds = [SyntheticDataSource(e.ds).describe()]
    if keller.PROCESSED.exists():
        ds.append({"id": "keller2016", "kind": "experimental", "provenance": "human_psychophysics",
                   "label": "REAL HUMAN DATA — Keller & Vosshall 2016",
                   "label_he": "נתוני בני אדם אמיתיים — Keller & Vosshall 2016",
                   "citation": keller.CITATION, "license": keller.LICENSE, "role": "validation"})
    return {"active": "synthetic-demo",
            "datasets": ds,
            "experimental_import": {"schema": "app.datasets.importer.ExperimentalDataset",
                                    "example": "data/examples/experimental_dataset_template.json",
                                    "loaded": []}}


VALIDATION_PATH = CHECKPOINT_DIR / "keller-benchmark.json"


@router.get("/validation")
def validation():
    """Benchmark against real human psychophysics (precomputed by scripts/run_benchmark.py)."""
    if not VALIDATION_PATH.exists():
        raise HTTPException(status_code=404, detail="no validation results — run `make fetch-real benchmark`")
    return json.loads(VALIDATION_PATH.read_text())


@router.get("/samples")
def samples(request: Request, split: str | None = None, offset: int = Query(0, ge=0),
            limit: int = Query(1000, ge=1, le=5000)):
    s = engine(request).atlas_json["samples"]
    if split:
        s = [x for x in s if x["split"] == split]
    return {"total": len(s), "offset": offset, "samples": s[offset: offset + limit]}


@router.get("/atlas")
def atlas(request: Request):
    return engine(request).atlas_json


@router.get("/compounds")
def compounds(request: Request):
    e = engine(request)
    ds = e.ds
    return {"provenance": ds["provenance"], "compounds": [
        {"compound_id": cid, "name": ds["compound_names"][i], "family": ds["compound_families"][i],
         "heldout": cid in e.heldout, "n_features": int(ds["compound_features"].shape[1])}
        for i, cid in enumerate(ds["compound_ids"])]}


@router.get("/model/metrics")
def metrics(request: Request):
    e = engine(request)
    if e.ckpt is None:
        return {"model_status": e.status, "metrics": None, "history": [],
                "note": "no trained checkpoint — run `make train`"}
    return {"model_status": e.status, "model_version": MODEL_VERSION, "metrics": e.ckpt["metrics"],
            "history": e.ckpt["history"], "best_epoch": e.ckpt["best_epoch"], "dataset": e.ckpt["dataset"],
            "note": "computed by trainer.evaluate on held-out splits of SYNTHETIC teacher data"}


@router.get("/scenarios")
def scenarios():
    return [s.to_dict() for s in SCENARIOS.values()]


@router.post("/simulate")
def simulate(req: SimulateRequest, request: Request):
    sparsity = None if req.disable_sparsity else (req.sparsity if req.sparsity is not None else "default")
    return _guard(engine(request).simulate,
                  [c.model_dump() for c in req.mixture], req.receptor_knockdowns, req.duration_seconds,
                  req.frame_count, req.scenario_id, req.lateral_inhibition, sparsity, req.include_trajectory)


@router.post("/project")
def project(req: ProjectRequest, request: Request):
    e = engine(request)
    if req.embeddings is None and req.sample_ids is None and req.lift_delta is None:
        raise HTTPException(422, "provide embeddings, sample_ids or lift_delta")
    Z = []
    if req.sample_ids:
        bad = [s for s in req.sample_ids if s not in e.sample_index]
        if bad:
            raise HTTPException(422, f"unknown sample ids: {bad[:5]}")
        Z += [e.atlas_Z[e.sample_index[s]].tolist() for s in req.sample_ids]
    if req.embeddings:
        Z += req.embeddings
    try:
        P, centre, warnings = e.projection(req.mode, req.params)
    except ValueError as err:
        raise HTTPException(422, str(err)) from err
    res = {"mode": req.mode, "matrix": np.round(P, 8).tolist(), "centre": np.round(centre, 6).tolist(),
           "warnings": warnings, "explained_variance_ratio": e.reference.explained_variance_ratio.tolist()}
    if Z:
        coords, *_ = _guard(e.project, Z, req.mode, req.params)
        res["coordinates"] = np.round(coords, 6).tolist()
    if req.lift_delta is not None:
        if req.lift_from is None or len(req.lift_from) != e.cfg.embedding_dim:
            raise HTTPException(422, "lift_from must be a full embedding")
        dz = lift_displacement(P, np.asarray(req.lift_delta))
        res["lifted_embedding"] = (np.asarray(req.lift_from) + dz).round(6).tolist()
        res["lift_rule"] = "minimum-norm: Δz = P⁺Δp (one choice among infinitely many)"
    return res


@router.post("/analyze/fourier")
def analyze_fourier(req: FourierRequest, request: Request):
    res = _guard(engine(request).fourier, req.signal, req.sample_spacing, req.band, req.remove_mean)
    res["frequency_units"] = f"cycles per {req.units}" + (" (Hz)" if req.units == "s" else "")
    return res


@router.post("/analyze/taylor")
def analyze_taylor(req: TaylorRequest, request: Request):
    return _guard(engine(request).taylor, [c.model_dump() for c in req.mixture], req.receptor_id,
                  req.selected, req.receptor_knockdowns, req.direction, req.span)


@router.post("/analyze/dose-response")
def analyze_dose(req: DoseResponseRequest, request: Request):
    return _guard(engine(request).dose_response, req.compound_id, [c.model_dump() for c in req.base_mixture],
                  req.n_points)


@router.post("/inverse-design")
def inverse(req: InverseDesignRequest, request: Request):
    return _guard(engine(request).inverse, req.target_embedding, req.target_sample_id, req.allowed_compounds,
                  req.max_components, req.n_starts, req.steps, req.refine_steps, req.sparsity_weight, req.seed)
