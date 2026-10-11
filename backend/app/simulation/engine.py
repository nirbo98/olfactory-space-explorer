"""OlfactoryEngine: owns the dataset, the trained model and the fixed reference atlas.

All scientific computation requested by the API goes through this class, so the
frontend never re-implements the model.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import torch
from sklearn.cluster import KMeans

from ..config import CHECKPOINT_DIR, MAX_COMPONENTS, MAX_TRAINING_CONCENTRATION, MODEL_VERSION, ModelConfig
from ..datasets.synthetic import load_or_generate
from ..mathematics import fourier
from ..mathematics.approximation import taylor_analysis
from ..mathematics.optimization import inverse_design
from ..mathematics.projection import ReferenceProjection, effective_projection, fit_reference_projection, project
from ..models.olfactory_model import BioOlfactoryModel
from ..training.trainer import load_checkpoint
from .scenarios import SCENARIOS, Scenario, profile, time_grid

MAX_EDITOR_COMPONENTS = 8
N_CLUSTERS = 6


def _r(a, nd: int = 5):
    return np.round(np.asarray(a, dtype=np.float64), nd).tolist()


class InputError(ValueError):
    """Invalid user input (mapped to HTTP 422)."""


class OlfactoryEngine:
    def __init__(self, checkpoint_path: Path | None = None, dataset: dict | None = None):
        self.ds = dataset or load_or_generate()
        self.checkpoint_path = checkpoint_path or CHECKPOINT_DIR / f"{MODEL_VERSION}.pt"
        if self.checkpoint_path.exists():
            self.model, self.ckpt = load_checkpoint(self.checkpoint_path)
            self.status = "trained"
            self.provenance = "synthetic_model_prediction"
            self.model_hash = hashlib.sha256(self.checkpoint_path.read_bytes()).hexdigest()[:16]
        else:
            torch.manual_seed(0)
            self.model, self.ckpt = BioOlfactoryModel(ModelConfig()).eval(), None
            self.status = "untrained"
            self.provenance = "untrained_random_weights"
            self.model_hash = "untrained"
        self.cfg: ModelConfig = self.model.config
        self.compound_ids: list[str] = list(self.ds["compound_ids"])
        self.cid_index = {c: i for i, c in enumerate(self.compound_ids)}
        self.receptor_ids: list[str] = list(self.ds["receptor_ids"])
        self.rid_index = {r: i for i, r in enumerate(self.receptor_ids)}
        self.features = torch.as_tensor(self.ds["compound_features"], dtype=torch.float32)
        self.heldout = set(self.ds["heldout_compounds"])
        self.teacher = self.ds.get("teacher")
        self._build_or_load_atlas()

    # ------------------------------------------------------------------ batches
    def _parse_mixture(self, mixture: list[dict]) -> tuple[list[int], list[float]]:
        if not mixture:
            raise InputError("mixture must contain at least one component")
        if len(mixture) > MAX_EDITOR_COMPONENTS:
            raise InputError(f"at most {MAX_EDITOR_COMPONENTS} components are supported")
        idx, conc = [], []
        for comp in mixture:
            cid, c = comp["compound_id"], float(comp["concentration"])
            if cid not in self.cid_index:
                raise InputError(f"unknown compound id {cid!r}")
            if not np.isfinite(c) or c < 0:
                raise InputError(f"concentration of {cid} must be a finite non-negative number")
            if self.cid_index[cid] in idx:
                raise InputError(f"compound {cid} appears more than once")
            idx.append(self.cid_index[cid]); conc.append(c)
        return idx, conc

    def _gain(self, knockdowns: dict[str, float] | None) -> torch.Tensor:
        g = torch.ones(self.cfg.n_receptors)
        for rid, frac in (knockdowns or {}).items():
            if rid not in self.rid_index:
                raise InputError(f"unknown receptor id {rid!r}")
            if not 0.0 <= frac <= 1.0:
                raise InputError("receptor knockdown must be within [0, 1]")
            g[self.rid_index[rid]] = 1.0 - frac
        return g

    def _batch(self, mixtures: list[tuple[list[int], list[float]]]):
        n = max(len(m[0]) for m in mixtures)
        B = len(mixtures)
        feats = torch.zeros(B, n, self.cfg.n_features)
        conc = torch.zeros(B, n)
        mask = torch.zeros(B, n, dtype=torch.bool)
        for b, (idx, c) in enumerate(mixtures):
            k = len(idx)
            feats[b, :k] = self.features[idx]
            conc[b, :k] = torch.tensor(c, dtype=torch.float32)
            mask[b, :k] = True
        return feats, conc, mask

    # ------------------------------------------------------------------ atlas
    def _atlas_paths(self):
        return CHECKPOINT_DIR / f"atlas-{MODEL_VERSION}.json"

    def _build_or_load_atlas(self):
        path = self._atlas_paths()
        if path.exists():
            cached = json.loads(path.read_text())
            if cached.get("model_hash") == self.model_hash and self.status == "trained":
                self._set_atlas(cached)
                return
        self._set_atlas(self.build_atlas())
        if self.status == "trained":
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(self.atlas_json))

    @torch.no_grad()
    def build_atlas(self) -> dict:
        ds = self.ds
        mixtures = []
        for row_i, row_c, row_m in zip(ds["comp_idx"], ds["conc"], ds["mask"]):
            mixtures.append(([int(i) for i in row_i[row_m]], [float(c) for c in row_c[row_m]]))
        feats, conc, mask = self._batch(mixtures)
        out = self.model(feats, conc, mask)
        Z = out.odor_embedding.numpy().astype(np.float64)
        ref = fit_reference_projection(Z)
        km = KMeans(n_clusters=N_CLUSTERS, n_init=10, random_state=0).fit(Z)
        D = np.linalg.norm(Z[:, None] - Z[None], axis=-1)
        np.fill_diagonal(D, np.inf)
        nn = D.min(1)
        samples = []
        for m, (idx, c) in enumerate(mixtures):
            samples.append({
                "id": ds["sample_ids"][m],
                "components": [{"compound_id": self.compound_ids[i], "concentration": round(ci, 5)} for i, ci in zip(idx, c)],
                "split": str(ds["split"][m]),
                "group": ds["groups"][m],
                "cluster": int(km.labels_[m]),
                "intensity_prediction": round(float(out.intensity_prediction[m]), 4),
                "top_descriptors": [ds["descriptor_labels"][j] for j in
                                    np.argsort(-out.descriptor_predictions[m].numpy())[:3].tolist()],
            })
        return {
            "model_hash": self.model_hash,
            "model_version": MODEL_VERSION,
            "provenance": self.provenance,
            "embedding_dim": int(Z.shape[1]),
            "embeddings": _r(Z, 5),
            "samples": samples,
            "projection": ref.to_json(),
            "nn_distance": {"median": float(np.median(nn)), "p95": float(np.percentile(nn, 95)),
                            "max": float(nn.max())},
            "n_clusters": N_CLUSTERS,
        }

    def _set_atlas(self, atlas: dict):
        self.atlas_json = atlas
        self.atlas_Z = np.asarray(atlas["embeddings"], dtype=np.float64)
        self.reference = ReferenceProjection.from_json(atlas["projection"])
        self.sample_index = {s["id"]: i for i, s in enumerate(atlas["samples"])}

    def novelty(self, z: np.ndarray) -> dict:
        d = np.linalg.norm(self.atlas_Z - np.asarray(z)[None], axis=1)
        j = int(np.argmin(d))
        p95 = self.atlas_json["nn_distance"]["p95"]
        return {"nearest_sample": self.atlas_json["samples"][j]["id"], "nearest_distance": float(d[j]),
                "reference_nn_p95": p95, "outside_reference": bool(d[j] > p95)}

    # ------------------------------------------------------------------ warnings
    def _input_warnings(self, idx, conc, knockdowns, lateral, sparsity="default") -> list[str]:
        w = []
        if any(c > MAX_TRAINING_CONCENTRATION for c in conc):
            w.append(f"concentration above the training range (> {MAX_TRAINING_CONCENTRATION}); extrapolation")
        if len(idx) > MAX_COMPONENTS:
            w.append(f"more than {MAX_COMPONENTS} components; training mixtures had at most {MAX_COMPONENTS}")
        held = [self.compound_ids[i] for i in idx if self.compound_ids[i] in self.heldout]
        if held:
            w.append(f"compounds held out from training: {', '.join(held)}")
        if knockdowns and any(v > 0 for v in knockdowns.values()):
            w.append("receptor knockdown is a counterfactual manipulation never seen during training")
        if lateral is not None and lateral != self.cfg.lateral_inhibition:
            w.append("lateral inhibition setting differs from training (inference-time ablation)")
        if sparsity != "default" and sparsity != self.cfg.sparsity:
            w.append("cortical sparsity differs from training (inference-time ablation)")
        if self.status != "trained":
            w.append("model is UNTRAINED (random weights) — run `make train`")
        return w

    # ------------------------------------------------------------------ simulate
    @torch.no_grad()
    def simulate(self, mixture, knockdowns=None, duration_seconds=4.0, frame_count=120,
                 scenario_id="single_pulse", lateral_inhibition=None, sparsity="default",
                 include_trajectory=True) -> dict:
        idx, conc = self._parse_mixture(mixture)
        gain = self._gain(knockdowns)
        sp = sparsity
        feats, c, mask = self._batch([(idx, conc), (idx, conc)])
        gains = torch.stack([gain, torch.ones_like(gain)])
        out = self.model(feats, c, mask, gains, lateral_inhibition=lateral_inhibition, sparsity=sp)
        labels = self.ds["descriptor_labels"]
        z = out.odor_embedding[0].numpy()
        z_base = out.odor_embedding[1].numpy()
        res = {
            "odor_embedding": _r(z),
            "receptor_activities": _r(out.receptor_activities[0]),
            "bulb_activities": _r(out.bulb_activities[0]),
            "cortical_activities": _r(out.cortical_activities[0]),
            "descriptor_predictions": {l: round(float(v), 5) for l, v in zip(labels, out.descriptor_predictions[0])},
            "intensity_prediction": round(float(out.intensity_prediction[0]), 5),
            "baseline": {
                "odor_embedding": _r(z_base),
                "receptor_activities": _r(out.receptor_activities[1]),
                "embedding_shift_norm": float(np.linalg.norm(z - z_base)),
            },
            "novelty": self.novelty(z),
            "warnings": self._input_warnings(idx, conc, knockdowns, lateral_inhibition, sp),
            "provenance": self.provenance,
            "model_version": MODEL_VERSION,
            "model_status": self.status,
        }
        if self.teacher is not None and self.ds.get("provenance") == "synthetic_teacher_model":
            r_t = self.teacher.receptor_response(idx, conc) * gain.numpy()
            p_t = self.teacher.perceptual(r_t)
            res["teacher_reference"] = {
                "provenance": "synthetic_teacher_ground_truth",
                "receptor_activities": _r(r_t),
                "descriptor_targets": {l: round(float(v), 5) for l, v in zip(labels, self.teacher.descriptors(p_t))},
                "intensity": round(self.teacher.intensity(r_t), 5),
            }
        if include_trajectory:
            res["trajectory"] = self._trajectory(idx, conc, gain, duration_seconds, frame_count, scenario_id,
                                                 lateral_inhibition, sp)
        return res

    def _scenario(self, scenario_id: str, total: float) -> Scenario:
        if scenario_id not in SCENARIOS:
            raise InputError(f"unknown scenario {scenario_id!r}")
        s = SCENARIOS[scenario_id]
        if abs(total - s.total) > 1e-9:  # rescale the protocol to the requested duration
            k = total / s.total
            s = Scenario(s.id, s.name, s.name_he, s.onset * k, s.duration * k, total, s.profile, s.frequency, s.edge)
        return s

    @torch.no_grad()
    def _trajectory(self, idx, conc, gain, total, frame_count, scenario_id, lateral, sparsity) -> dict:
        if not 0.5 <= total <= 30:
            raise InputError("duration_seconds must be within [0.5, 30]")
        if not 8 <= frame_count <= 600:
            raise InputError("frame_count must be within [8, 600]")
        s = self._scenario(scenario_id, total)
        t, dt = time_grid(total, frame_count)
        m = profile(s, t)
        feats, c, mask = self._batch([(idx, conc)])
        c_t = c[:, None, :] * torch.as_tensor(m, dtype=torch.float32)[None, :, None]
        out = self.model(feats, c_t, mask, gain[None], lateral_inhibition=lateral, sparsity=sparsity, dt=dt)
        return {
            "times": _r(t, 6), "dt": dt, "stimulus": _r(m),
            "scenario": s.to_dict(),
            "odor_embedding": _r(out.odor_embedding[0], 4),
            "receptor_activities": _r(out.receptor_activities[0], 4),
            "bulb_activities": _r(out.bulb_activities[0], 4),
            "cortical_activities": _r(out.cortical_activities[0], 4),
            "intensity_prediction": _r(out.intensity_prediction[0], 4),
            "shapes": {"odor_embedding": [frame_count, self.cfg.embedding_dim],
                       "receptor_activities": [frame_count, self.cfg.n_receptors],
                       "bulb_activities": [frame_count, self.cfg.bulb_dim],
                       "cortical_activities": [frame_count, self.cfg.cortex_hidden]},
        }

    # ------------------------------------------------------------------ analyses
    def projection(self, mode: str, params: dict | None):
        P, centre, warnings = effective_projection(self.reference, mode, params)
        return P, centre, warnings

    def project(self, embeddings, mode, params):
        P, centre, warnings = self.projection(mode, params)
        Z = np.asarray(embeddings, dtype=np.float64)
        if Z.ndim != 2 or Z.shape[1] != self.cfg.embedding_dim:
            raise InputError(f"embeddings must have shape [n, {self.cfg.embedding_dim}]")
        return project(Z, P, centre), P, centre, warnings

    def fourier(self, signal, sample_spacing, band, remove_mean):
        try:
            return fourier.analyze(signal, sample_spacing, band, remove_mean)
        except ValueError as e:
            raise InputError(str(e)) from e

    def taylor(self, mixture, receptor_id, selected_ids, knockdowns=None, direction=None, span=1.0):
        idx, conc = self._parse_mixture(mixture)
        if receptor_id not in self.rid_index:
            raise InputError(f"unknown receptor id {receptor_id!r}")
        cids = [self.compound_ids[i] for i in idx]
        if not selected_ids or any(s not in cids for s in selected_ids):
            raise InputError("selected components must belong to the mixture")
        sel = [cids.index(s) for s in selected_ids]
        feats, _, mask = self._batch([(idx, conc)])
        try:
            res = taylor_analysis(self.model, feats, np.asarray(conc), mask, self._gain(knockdowns)[None],
                                  self.rid_index[receptor_id], sel, direction, span)
        except ValueError as e:
            raise InputError(str(e)) from e
        res["components"] = cids
        res["selected_ids"] = selected_ids
        res["receptor_id"] = receptor_id
        res["provenance"] = self.provenance
        return res

    @torch.no_grad()
    def dose_response(self, compound_id, base_mixture=None, n_points=40, c_min=1e-3, c_max=10.0):
        if compound_id not in self.cid_index:
            raise InputError(f"unknown compound id {compound_id!r}")
        base = [m for m in (base_mixture or []) if m["compound_id"] != compound_id]
        idx, conc = self._parse_mixture(base + [{"compound_id": compound_id, "concentration": 0.0}]) \
            if base else ([self.cid_index[compound_id]], [0.0])
        grid = np.logspace(np.log10(c_min), np.log10(c_max), n_points)
        mixes = [(idx, conc[:-1] + [float(c)]) for c in grid]
        feats, c, mask = self._batch(mixes)
        out = self.model(feats, c, mask)
        res = {"compound_id": compound_id, "concentrations": _r(grid, 6),
               "receptor_activities": _r(out.receptor_activities, 5),
               "base_mixture": base, "training_range_max": MAX_TRAINING_CONCENTRATION,
               "provenance": self.provenance}
        if self.teacher is not None:
            res["teacher_receptor_activities"] = _r([self.teacher.receptor_response(m[0], m[1]) for m in mixes], 5)
        return res

    def inverse(self, target_embedding=None, target_sample_id=None, allowed_ids=None, max_components=5,
                n_starts=8, steps=200, refine_steps=150, sparsity_weight=1e-3, seed=0):
        if target_embedding is None:
            if target_sample_id not in self.sample_index:
                raise InputError("provide target_embedding or a valid target_sample_id")
            z_t = self.atlas_Z[self.sample_index[target_sample_id]]
        else:
            z_t = np.asarray(target_embedding, dtype=np.float64)
            if z_t.shape != (self.cfg.embedding_dim,) or not np.all(np.isfinite(z_t)):
                raise InputError(f"target_embedding must be {self.cfg.embedding_dim} finite numbers")
        allowed_ids = allowed_ids or self.compound_ids
        if any(a not in self.cid_index for a in allowed_ids):
            raise InputError("unknown compound in allowed set")
        allowed = [self.cid_index[a] for a in dict.fromkeys(allowed_ids)]
        try:
            res = inverse_design(self.model, self.features, allowed, z_t, max_components, n_starts, steps,
                                 refine_steps, sparsity_weight=sparsity_weight, c_max=MAX_TRAINING_CONCENTRATION,
                                 seed=seed)
        except ValueError as e:
            raise InputError(str(e)) from e
        target_nov = self.novelty(z_t)
        warnings = []
        if target_nov["outside_reference"]:
            warnings.append("target lies farther from every reference odor than 95% of reference nearest-neighbour "
                            "distances; the model may not be reliable there")
        best = res["candidates"][0]["distance"]
        sets = {}
        for cand in res["candidates"]:
            ids = [self.compound_ids[i] for i, _ in cand["components"]]
            cand["components"] = [{"compound_id": self.compound_ids[i], "concentration": round(c, 5)}
                                  for i, c in cand["components"]]
            cand["on_bound"] = [self.compound_ids[i] for i in cand["on_bound"]]
            cand["novelty"] = self.novelty(cand["embedding"])
            cand["embedding"] = _r(cand["embedding"])
            cand["uses_heldout_compounds"] = [i for i in ids if i in self.heldout]
            sets.setdefault(tuple(sorted(ids)), cand["distance"])
        near_best = [k for k, d in sets.items() if d <= 1.25 * best + 1e-9]
        if len(near_best) > 1:
            warnings.append(f"non-unique inverse: {len(near_best)} different component sets reach within 25% "
                            f"of the best predicted distance")
        res.update({"target_embedding": _r(z_t), "target_novelty": target_nov, "warnings": warnings,
                    "distinct_solutions_near_best": len(near_best),
                    "reference_nn_median": self.atlas_json["nn_distance"]["median"],
                    "provenance": "model_based_optimization_not_experimentally_validated",
                    "model_status": self.status})
        res["history"] = [_r(h, 4) for h in res["history"]]
        return res
