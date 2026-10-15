"""Train the biologically structured model (encoder → receptor binding → bulb →
cortex → heads) on real psychophysics, using exactly the folds of the baselines.

There are no receptor assays in Keller 2016, so the receptor loss is absent and
the 64 receptor channels are a latent layer constrained only by the binding
equation. Targets: pleasantness + 20 descriptors (mean rating / 100) through the
sigmoid descriptor head; intensity (mean / 25, i.e. 0–4) through the intensity
head. Concentration enters through the declared dilution mapping.
"""
from __future__ import annotations

import numpy as np
import torch

from ..config import MAX_COMPONENTS, ModelConfig, TrainConfig
from ..training.trainer import TensorDataset, train

INTENSITY_SCALE = 25.0
DESCRIPTOR_SCALE = 100.0

# Fixed before the benchmark is run (see documentation/PREREGISTRATION_KELLER_HE.md).
OSE_TRAIN = dict(lr=3e-4, max_epochs=400, patience=40, batch_size=32)


def build_dataset(features: np.ndarray, stim_mol: np.ndarray, conc: np.ndarray, Y: np.ndarray,
                  split: np.ndarray, target_names: list[str]) -> dict:
    """Y[:, 0] = intensity, Y[:, 1:] = pleasantness and descriptors (0–100 scale, NaN = missing)."""
    n = len(stim_mol)
    comp_idx = np.full((n, MAX_COMPONENTS), -1, np.int64)
    comp_idx[:, 0] = stim_mol
    c = np.zeros((n, MAX_COMPONENTS), np.float32)
    c[:, 0] = conc
    return {
        "provenance": "human_psychophysics",
        "compound_features": features.astype(np.float32),
        "comp_idx": comp_idx, "conc": c, "mask": comp_idx >= 0,
        "receptor_targets": np.full((n, ModelConfig().n_receptors), np.nan, np.float32),
        "descriptor_targets": (Y[:, 1:] / DESCRIPTOR_SCALE).astype(np.float32),
        "intensity_targets": (Y[:, 0] / INTENSITY_SCALE).astype(np.float32),
        "split": split, "descriptor_labels": target_names[1:],
    }


def fit_predict(features, stim_mol, conc, Y, split, target_names, seed: int = 42,
                overrides: dict | None = None, log=lambda *_: None) -> np.ndarray:
    """Train on split=='train' (early stopping on 'val'), predict rows with split=='test'."""
    ds = build_dataset(features, stim_mol, conc, Y, split, target_names)
    mc = ModelConfig(n_features=features.shape[1], n_descriptors=len(target_names) - 1,
                     descriptor_labels=list(target_names[1:]))
    tc = TrainConfig(seed=seed, **{**OSE_TRAIN, **(overrides or {})})
    model = train(ds, mc, tc, log=log)["model"].eval()
    data = TensorDataset.from_dataset(ds)
    test = data.indices("test")
    with torch.no_grad():
        b = data.batch(test)
        out = model(b["features"], b["conc"], b["mask"])
    pred = np.zeros((len(test), len(target_names)))
    pred[:, 0] = out.intensity_prediction.numpy() * INTENSITY_SCALE
    pred[:, 1:] = out.descriptor_predictions.numpy() * DESCRIPTOR_SCALE
    return pred
