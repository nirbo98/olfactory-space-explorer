"""Training and evaluation of the student BioOlfactoryModel on teacher targets.

Loss (each term only when its labels exist; each normalized by a train-set scale):

    L = λ_R L_R + λ_D L_D + λ_S L_S + λ_I L_I + λ_P L_P

  L_R  receptor MSE / Var(train receptor targets)
  L_D  descriptor BCE (NaN labels masked) / BCE of the constant train-mean predictor
  L_S  MSE between student and teacher pairwise cosine similarity / Var(teacher sims)
       (synthetic similarity — NOT human similarity judgments)
  L_I  intensity MSE (NaN masked) / Var(train intensity)
  L_P  fixed-point regularizer: settled embedding after K and 2K recurrent steps
       must agree (weight decay is applied separately by AdamW)

Splits are by component *set* (all concentration variants of one set share a
split) and every mixture containing a held-out compound is excluded from
training, validation and the mixture test set (protocol 2 evaluates them).
"""
from __future__ import annotations

import copy
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from scipy.stats import pearsonr, spearmanr
from sklearn.metrics import roc_auc_score

from ..config import CHECKPOINT_DIR, MODEL_VERSION, ModelConfig, TrainConfig
from ..models.olfactory_model import BioOlfactoryModel


def set_seed(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)


@dataclass
class TensorDataset:
    features: torch.Tensor     # [C, F] compound table
    comp_idx: torch.Tensor     # [M, Nmax] (−1 = padding)
    conc: torch.Tensor         # [M, Nmax]
    mask: torch.Tensor         # [M, Nmax] bool
    receptor: torch.Tensor     # [M, R]
    descriptor: torch.Tensor   # [M, D] (NaN = missing)
    intensity: torch.Tensor    # [M]    (NaN = missing)
    perceptual: torch.Tensor   # [M, P] teacher latent, used only to derive similarity targets
    split: np.ndarray

    @classmethod
    def from_dataset(cls, ds: dict) -> "TensorDataset":
        t = lambda a, dt=torch.float32: torch.as_tensor(np.asarray(a), dtype=dt)  # noqa: E731
        return cls(t(ds["compound_features"]), t(ds["comp_idx"], torch.long), t(ds["conc"]),
                   t(ds["mask"], torch.bool), t(ds["receptor_targets"]), t(ds["descriptor_targets"]),
                   t(ds["intensity_targets"]), t(ds["perceptual_targets"]), np.asarray(ds["split"]))

    def batch(self, idx) -> dict:
        idx = torch.as_tensor(idx, dtype=torch.long)
        ci = self.comp_idx[idx]
        mask = self.mask[idx]
        feats = self.features[ci.clamp(min=0)] * mask[..., None]
        return {"features": feats, "conc": self.conc[idx] * mask, "mask": mask,
                "receptor": self.receptor[idx], "descriptor": self.descriptor[idx],
                "intensity": self.intensity[idx], "perceptual": self.perceptual[idx]}

    def indices(self, *splits: str) -> np.ndarray:
        return np.where(np.isin(self.split, splits))[0]


def _cos_matrix(x: torch.Tensor) -> torch.Tensor:
    x = F.normalize(x, dim=-1)
    return x @ x.T


def compute_norms(data: TensorDataset, train_idx) -> dict:
    b = data.batch(train_idx)
    d = b["descriptor"]
    m = ~torch.isnan(d)
    p = torch.nanmean(d, dim=0).clamp(1e-4, 1 - 1e-4)
    base_bce = F.binary_cross_entropy(p.expand_as(d)[m], d[m]).item()
    iv = b["intensity"][~torch.isnan(b["intensity"])]
    S = _cos_matrix(b["perceptual"])
    tri = torch.triu_indices(len(S), len(S), 1)
    return {"receptor_var": b["receptor"].var().item(), "descriptor_bce": base_bce,
            "intensity_var": iv.var().item(), "similarity_var": S[tri[0], tri[1]].var().item(),
            "receptor_train_mean": b["receptor"].mean(0).tolist()}


def compute_losses(model, batch: dict, norms: dict, tc: TrainConfig, fixed_point: bool = True):
    out = model(batch["features"], batch["conc"], batch["mask"], compute_fixed_point=fixed_point)
    losses = {}
    losses["receptor"] = F.mse_loss(out.receptor_activities, batch["receptor"]) / norms["receptor_var"]
    d, dm = batch["descriptor"], ~torch.isnan(batch["descriptor"])
    if dm.any():
        losses["descriptor"] = F.binary_cross_entropy(out.descriptor_predictions[dm].clamp(1e-6, 1 - 1e-6),
                                                      d[dm]) / norms["descriptor_bce"]
    im = ~torch.isnan(batch["intensity"])
    if im.any():
        losses["intensity"] = F.mse_loss(out.intensity_prediction[im], batch["intensity"][im]) / norms["intensity_var"]
    if len(batch["perceptual"]) > 1:
        tri = torch.triu_indices(len(batch["perceptual"]), len(batch["perceptual"]), 1)
        s_t = _cos_matrix(batch["perceptual"])[tri[0], tri[1]]
        s_p = (out.similarity_projection @ out.similarity_projection.T)[tri[0], tri[1]]
        losses["similarity"] = F.mse_loss(s_p, s_t) / norms["similarity_var"]
    if out.fixed_point_gap is not None:
        losses["fixed_point"] = out.fixed_point_gap
    weights = {"receptor": tc.lambda_receptor, "descriptor": tc.lambda_descriptor,
               "intensity": tc.lambda_intensity, "similarity": tc.lambda_similarity,
               "fixed_point": tc.lambda_fixed_point}
    total = sum(weights[k] * v for k, v in losses.items())
    return total, {k: float(v.detach()) for k, v in losses.items()}, out


@torch.no_grad()
def evaluate(model, data: TensorDataset, idx, norms: dict, tc: TrainConfig) -> dict:
    """Metrics computed from an actual forward pass over `idx` (no hard-coded values)."""
    if len(idx) == 0:
        return {"n": 0}
    model.eval()
    b = data.batch(idx)
    total, parts, out = compute_losses(model, b, norms, tc)
    r_p, r_t = out.receptor_activities.numpy(), b["receptor"].numpy()
    base = np.asarray(norms["receptor_train_mean"])
    ss_res = ((r_p - r_t) ** 2).sum()
    ss_tot = ((r_t - r_t.mean(0)) ** 2).sum()
    m = {
        "n": int(len(idx)),
        "loss": float(total),
        "loss_terms": parts,
        "receptor_mae": float(np.abs(r_p - r_t).mean()),
        "receptor_rmse": float(np.sqrt(((r_p - r_t) ** 2).mean())),
        "receptor_r2": float(1 - ss_res / ss_tot),
        "receptor_mae_mean_baseline": float(np.abs(base[None] - r_t).mean()),
    }
    d_t, d_p = b["descriptor"].numpy(), out.descriptor_predictions.numpy()
    dm = ~np.isnan(d_t)
    if dm.any():
        m["descriptor_mae"] = float(np.abs(d_p[dm] - d_t[dm]).mean())
        aucs = []
        for j in range(d_t.shape[1]):
            mj = dm[:, j]
            y = (d_t[mj, j] > 0.5).astype(int)
            if 0 < y.sum() < len(y):
                aucs.append(roc_auc_score(y, d_p[mj, j]))
        m["descriptor_auroc_macro"] = float(np.mean(aucs)) if aucs else None
        m["descriptor_labels_available"] = int(dm.sum())
    i_t, i_p = b["intensity"].numpy(), out.intensity_prediction.numpy()
    im = ~np.isnan(i_t)
    if im.sum() > 2:
        m["intensity_mae"] = float(np.abs(i_p[im] - i_t[im]).mean())
        m["intensity_pearson"] = float(pearsonr(i_p[im], i_t[im])[0])
    if len(idx) > 2:
        tri = np.triu_indices(len(idx), 1)
        s_t = _cos_matrix(b["perceptual"]).numpy()[tri]
        u = out.similarity_projection.numpy()
        s_p = (u @ u.T)[tri]
        m["similarity_pearson"] = float(pearsonr(s_p, s_t)[0])
        m["similarity_spearman"] = float(spearmanr(s_p, s_t)[0])
        m["similarity_pairs"] = int(len(s_t))
    model.train()
    return m


def train(ds: dict, mc: ModelConfig | None = None, tc: TrainConfig | None = None,
          out_path: Path | None = None, log=print) -> dict:
    mc, tc = mc or ModelConfig(), tc or TrainConfig()
    set_seed(tc.seed)
    torch.set_num_threads(max(1, torch.get_num_threads()))
    data = TensorDataset.from_dataset(ds)
    tr, va = data.indices("train"), data.indices("val")
    norms = compute_norms(data, tr)
    model = BioOlfactoryModel(mc)
    opt = torch.optim.AdamW(model.parameters(), lr=tc.lr, weight_decay=tc.weight_decay)
    gen = np.random.default_rng(tc.seed)
    best, best_state, best_epoch, bad = math.inf, None, -1, 0
    history = []
    t0 = time.time()
    for epoch in range(tc.max_epochs):
        model.train()
        perm = gen.permutation(tr)
        run, nb = 0.0, 0
        for s in range(0, len(perm), tc.batch_size):
            idx = perm[s: s + tc.batch_size]
            if len(idx) < 2:
                continue
            loss, _, _ = compute_losses(model, data.batch(idx), norms, tc)
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), tc.grad_clip)
            opt.step()
            run += float(loss.detach()); nb += 1
        val = evaluate(model, data, va, norms, tc)
        history.append({"epoch": epoch, "train_loss": run / max(nb, 1), "val_loss": val["loss"],
                        "val_receptor_mae": val["receptor_mae"]})
        if val["loss"] < best - 1e-5:
            best, best_state, best_epoch, bad = val["loss"], copy.deepcopy(model.state_dict()), epoch, 0
        else:
            bad += 1
        if epoch % 10 == 0 or bad == 0 and epoch % 5 == 0:
            log(f"epoch {epoch:4d}  train {run / max(nb, 1):.4f}  val {val['loss']:.4f}  "
                f"val receptor MAE {val['receptor_mae']:.4f}  ({time.time() - t0:.0f}s)")
        if bad >= tc.patience:
            log(f"early stopping at epoch {epoch} (best epoch {best_epoch})")
            break
    model.load_state_dict(best_state)
    model.eval()
    metrics = {
        "train": evaluate(model, data, tr, norms, tc),
        "val": evaluate(model, data, va, norms, tc),
        "test_unseen_mixtures": evaluate(model, data, data.indices("test"), norms, tc),
        "test_heldout_compounds": evaluate(model, data, data.indices("heldout_compound"), norms, tc),
    }
    ckpt = {
        "model_version": MODEL_VERSION,
        "model_config": mc.to_dict(),
        "train_config": tc.to_dict(),
        "norms": norms,
        "metrics": metrics,
        "history": history,
        "best_epoch": best_epoch,
        "epochs_run": len(history),
        "training_seconds": round(time.time() - t0, 1),
        "dataset": {"provenance": ds["provenance"], "seed": int(ds["seed"]),
                    "heldout_compounds": list(ds["heldout_compounds"]),
                    "split_counts": {s: int((data.split == s).sum()) for s in np.unique(data.split)}},
        "state_dict": model.state_dict(),
    }
    if out_path is not None:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        torch.save(ckpt, out_path)
        meta = {k: v for k, v in ckpt.items() if k != "state_dict"}
        out_path.with_suffix(".metrics.json").write_text(json.dumps(meta, indent=1))
    return {"model": model, "checkpoint": ckpt}


def load_checkpoint(path: Path = CHECKPOINT_DIR / f"{MODEL_VERSION}.pt"):
    # The bundled demo-v1 checkpoint includes NumPy scalar metadata. Allowlist only
    # the legacy scalar/dtype objects it requires, instead of unrestricted pickle.
    # For new checkpoints, the metadata should be normalized to Python primitives.
    try:
        from numpy._core.multiarray import scalar as numpy_scalar
    except ImportError:  # NumPy 1.x
        from numpy.core.multiarray import scalar as numpy_scalar
    safe_numpy = [numpy_scalar, np.dtype, type(np.dtype("float64")),
                  type(np.dtype("float32")), type(np.dtype("int64")),
                  type(np.dtype("str"))]
    with torch.serialization.safe_globals(safe_numpy):
        ckpt = torch.load(path, map_location="cpu", weights_only=True)
    model = BioOlfactoryModel(ModelConfig.from_dict(ckpt["model_config"]))
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    return model, ckpt
