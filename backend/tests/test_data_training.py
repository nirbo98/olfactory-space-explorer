"""Dataset determinism, split hygiene, missing labels, and a short real training run."""
import math

import numpy as np
import torch

from app.config import ModelConfig, TrainConfig
from app.datasets.synthetic import generate_demo_dataset
from app.training.trainer import TensorDataset, compute_losses, compute_norms, train


def test_dataset_is_deterministic_and_sized():
    a, b = generate_demo_dataset(42), generate_demo_dataset(42)
    assert np.array_equal(a["receptor_targets"], b["receptor_targets"])
    assert len(a["sample_ids"]) >= 200 and len(a["compound_ids"]) == 32 and len(a["receptor_ids"]) == 64
    n = a["mask"].sum(1)
    assert n.min() == 1 and n.max() == 5
    assert a["provenance"] == "synthetic_teacher_model"
    assert len({g for g in a["groups"]}) < len(a["groups"])            # multiple concentration configs


def test_teacher_zero_and_bounds(dataset):
    t = dataset["teacher"]
    assert np.all(t.receptor_response([0, 1], [0.0, 0.0]) == 0)
    r = t.receptor_response([0, 1, 2], [5.0, 5.0, 5.0])
    assert r.min() >= 0 and r.max() < 1


def test_no_leakage_between_splits(dataset):
    split, groups = np.asarray(dataset["split"]), dataset["groups"]
    by_group = {}
    for g, s in zip(groups, split):
        by_group.setdefault(g, set()).add(s)
    assert all(len(s) == 1 for s in by_group.values())
    held = {dataset["compound_ids"].index(c) for c in dataset["heldout_compounds"]}
    for i in np.where(np.isin(split, ["train", "val", "test"]))[0]:
        assert not held & set(dataset["comp_idx"][i][dataset["mask"][i]].tolist())


def test_missing_labels_are_masked_not_zeroed(dataset, model):
    data = TensorDataset.from_dataset(dataset)
    assert torch.isnan(data.descriptor).any() and torch.isnan(data.intensity).any()
    idx = np.where(np.isnan(dataset["intensity_targets"]))[0][:8]
    norms = compute_norms(data, data.indices("train"))
    total, parts, _ = compute_losses(model, data.batch(idx), norms, TrainConfig())
    assert math.isfinite(float(total.detach()))
    all_missing = np.where(np.isnan(dataset["descriptor_targets"]).all(1) & np.isnan(dataset["intensity_targets"]))[0]
    if len(all_missing):
        _, parts, _ = compute_losses(model, data.batch(all_missing[:2]), norms, TrainConfig())
        assert "descriptor" not in parts and "intensity" not in parts


def test_short_training_run_reduces_validation_loss(dataset):
    res = train(dataset, ModelConfig(), TrainConfig(max_epochs=6, lr=1e-3, patience=10), log=lambda *_: None)
    hist = res["checkpoint"]["history"]
    assert hist[-1]["val_loss"] < hist[0]["val_loss"]
    m = res["checkpoint"]["metrics"]
    assert {"train", "val", "test_unseen_mixtures", "test_heldout_compounds"} <= set(m)
    assert m["test_heldout_compounds"]["n"] > 0


def test_masked_receptor_loss_matches_plain_mse_when_fully_observed(dataset, model):
    data = TensorDataset.from_dataset(dataset)
    norms = compute_norms(data, data.indices("train"))
    b = data.batch(data.indices("train")[:16])
    _, parts, out = compute_losses(model, b, norms, TrainConfig())
    plain = torch.nn.functional.mse_loss(out.receptor_activities, b["receptor"]) / norms["receptor_var"]
    assert parts["receptor"] == float(plain)


def test_training_without_receptor_or_teacher_labels(dataset):
    """Real psychophysics has no receptor assays and no teacher latent: loss must stay finite."""
    ds = {k: v for k, v in dataset.items() if k != "perceptual_targets"}
    ds["receptor_targets"] = np.full_like(dataset["receptor_targets"], np.nan)
    data = TensorDataset.from_dataset(ds)
    norms = compute_norms(data, data.indices("train"))
    torch.manual_seed(0)
    from app.models.olfactory_model import BioOlfactoryModel
    total, parts, _ = compute_losses(BioOlfactoryModel(ModelConfig()), data.batch(data.indices("train")[:16]),
                                     norms, TrainConfig())
    assert math.isfinite(float(total.detach()))
    assert "receptor" not in parts and "similarity" not in parts and "descriptor" in parts
    res = train(ds, ModelConfig(), TrainConfig(max_epochs=2, lr=1e-3), log=lambda *_: None)
    assert "receptor_r2" not in res["checkpoint"]["metrics"]["val"]
