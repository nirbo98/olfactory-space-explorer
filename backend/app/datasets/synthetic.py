"""Deterministic synthetic demonstration dataset.

SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED.

Targets come from a fixed mathematical *teacher* (not random labels):

* 32 virtual compounds with latent "chemical" coordinates u_i ∈ R^8 grouped into
  six virtual families; their 256-D feature vectors are a fixed nonlinear map of
  u_i (so features carry learnable structure, enabling held-out-compound tests).
* 64 virtual receptor channels with latent tuning vectors.
* Teacher receptor response: competitive binding with receptor-specific Hill
  exponents, antagonists (high affinity / low efficacy) and a pairwise
  family-dependent synergy/suppression term. The student's pure competitive-
  binding layer cannot represent this exactly — the approximation gap is real
  and visible in the reported metrics.
* Teacher "perceptual" latent, synthetic descriptor probabilities and synthetic
  intensity are fixed nonlinear functions of the clean teacher receptor pattern.
  None of these are human perceptual measurements.
"""
from __future__ import annotations

import itertools
import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from ..config import DEFAULT_DESCRIPTOR_LABELS, MAX_COMPONENTS, SYNTHETIC_DIR

PROVENANCE = "synthetic_teacher_model"
LATENT = 8
N_FAMILIES = 6


@dataclass
class SyntheticTeacher:
    """Fixed generative model producing synthetic receptor/perceptual targets."""

    log10_K: np.ndarray        # [C, R]
    efficacy: np.ndarray       # [C, R]
    hill: np.ndarray           # [R]
    synergy_family: np.ndarray # [F, F] symmetric
    synergy_gain: np.ndarray   # [R]
    families: np.ndarray       # [C]
    G1: np.ndarray             # [P, R]
    g1: np.ndarray             # [P]
    G2: np.ndarray             # [n_desc, P]
    g2: np.ndarray             # [n_desc]

    def receptor_response(self, comp_idx, conc) -> np.ndarray:
        """Clean teacher response for one mixture. comp_idx, conc: 1-D sequences."""
        comp_idx = np.asarray(comp_idx, dtype=int)
        conc = np.asarray(conc, dtype=float)
        if (conc < 0).any():
            raise ValueError("negative concentration")
        R = self.log10_K.shape[1]
        if len(comp_idx) == 0 or conc.sum() == 0:
            return np.zeros(R)
        K = 10.0 ** self.log10_K[comp_idx]                       # [n, R]
        x = (conc[:, None] / K) ** self.hill[None, :]            # Hill-modified occupancy
        r = (self.efficacy[comp_idx] * x).sum(0) / (1.0 + x.sum(0))
        syn = 0.0
        for a, b in itertools.combinations(range(len(comp_idx)), 2):
            fa, fb = self.families[comp_idx[a]], self.families[comp_idx[b]]
            syn = syn + self.synergy_family[fa, fb] * np.sqrt(conc[a] * conc[b])
        r = r * (1.0 + 0.25 * np.tanh(self.synergy_gain * syn))
        return np.clip(r, 0.0, 0.999)

    def perceptual(self, r: np.ndarray) -> np.ndarray:
        return np.tanh(self.G1 @ r + self.g1)

    def descriptors(self, p: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-(self.G2 @ p + self.g2)))

    @staticmethod
    def intensity(r: np.ndarray) -> float:
        return float(4.0 * np.sqrt(max(r.mean(), 0.0)))

    def full(self, comp_idx, conc) -> dict:
        r = self.receptor_response(comp_idx, conc)
        p = self.perceptual(r)
        return {"receptor": r, "perceptual": p, "descriptors": self.descriptors(p), "intensity": self.intensity(r)}

    def to_arrays(self) -> dict:
        return {f"teacher_{k}": v for k, v in self.__dict__.items()}

    @classmethod
    def from_arrays(cls, arrays) -> "SyntheticTeacher":
        return cls(**{k: np.asarray(arrays[f"teacher_{k}"]) for k in cls.__dataclass_fields__})


def _build_teacher(rng: np.random.Generator, n_compounds: int, n_receptors: int, n_desc: int,
                   u: np.ndarray, families: np.ndarray, perceptual_dim: int = 32) -> SyntheticTeacher:
    v = rng.normal(size=(n_receptors, LATENT))                     # affinity tuning
    w = rng.normal(size=(n_receptors, LATENT))                     # efficacy tuning
    score = u @ v.T / np.sqrt(LATENT)
    log10_K = 0.6 - 0.9 * score                                    # strong binders: K ≈ 0.05
    efficacy = 1.0 / (1.0 + np.exp(-(1.5 * (u @ w.T) / np.sqrt(LATENT) + 0.5)))
    hill = rng.uniform(0.8, 1.6, size=n_receptors)
    S = rng.normal(size=(N_FAMILIES, N_FAMILIES))
    synergy_family = (S + S.T) / 2.0
    synergy_gain = rng.normal(scale=1.0, size=n_receptors)
    G1 = rng.normal(scale=3.0 / np.sqrt(n_receptors), size=(perceptual_dim, n_receptors)) * 3.0
    g1 = rng.normal(scale=0.3, size=perceptual_dim)
    G2 = rng.normal(scale=2.5 / np.sqrt(perceptual_dim), size=(n_desc, perceptual_dim))
    g2 = np.zeros(n_desc)
    return SyntheticTeacher(log10_K, efficacy, hill, synergy_family, synergy_gain, families, G1, g1, G2, g2)


def generate_demo_dataset(seed: int = 42, n_compounds: int = 32, n_receptors: int = 64,
                          n_features: int = 256, n_multi_sets: int = 240,
                          descriptor_labels: list[str] | None = None,
                          n_heldout_compounds: int = 3) -> dict:
    """Generate the deterministic synthetic dataset. Same seed → identical arrays."""
    labels = list(descriptor_labels or DEFAULT_DESCRIPTOR_LABELS)
    rng = np.random.default_rng(seed)

    # --- virtual compounds ---------------------------------------------------
    centers = rng.normal(scale=1.5, size=(N_FAMILIES, LATENT))
    families = np.arange(n_compounds) % N_FAMILIES
    u = centers[families] + 0.6 * rng.normal(size=(n_compounds, LATENT))
    A = rng.normal(size=(n_features, LATENT)) / np.sqrt(LATENT)
    A2 = rng.normal(size=(n_features, LATENT)) / np.sqrt(LATENT)
    features = np.tanh(u @ A.T + 0.3 * (u ** 2) @ A2.T / 3.0 + 0.05 * rng.normal(size=(n_compounds, n_features)))
    compound_ids = [f"C{i + 1:03d}" for i in range(n_compounds)]
    family_names = [f"F{f + 1}" for f in families]

    teacher = _build_teacher(rng, n_compounds, n_receptors, len(labels), u, families)

    # --- mixtures -----------------------------------------------------------------
    mixtures: list[tuple[tuple[int, ...], tuple[float, ...]]] = []
    for i in range(n_compounds):                                 # single-molecule stimulation
        for c in (0.05, 0.3, 1.5):
            mixtures.append(((i,), (c,)))
    seen_sets = set()
    while len(seen_sets) < n_multi_sets:                          # 2–5 component mixtures
        k = int(rng.integers(2, MAX_COMPONENTS + 1))
        s = tuple(sorted(rng.choice(n_compounds, size=k, replace=False).tolist()))
        if s in seen_sets:
            continue
        seen_sets.add(s)
        for _ in range(int(rng.integers(2, 4))):                 # multiple concentration configurations
            conc = tuple(np.round(10 ** rng.uniform(np.log10(0.02), np.log10(2.0), size=k), 4).tolist())
            mixtures.append((s, conc))

    M = len(mixtures)
    comp_idx = -np.ones((M, MAX_COMPONENTS), dtype=np.int64)
    conc_arr = np.zeros((M, MAX_COMPONENTS), dtype=np.float32)
    receptor_clean = np.zeros((M, n_receptors))
    perceptual = np.zeros((M, teacher.G1.shape[0]))
    descriptors = np.zeros((M, len(labels)))
    intensity = np.zeros(M)
    for m, (s, c) in enumerate(mixtures):
        comp_idx[m, : len(s)] = s
        conc_arr[m, : len(c)] = c
        out = teacher.full(s, c)
        receptor_clean[m], perceptual[m] = out["receptor"], out["perceptual"]
        descriptors[m], intensity[m] = out["descriptors"], out["intensity"]

    # centre descriptor logits so each synthetic descriptor applies to ~35% of mixtures
    logits = np.log(descriptors / (1 - descriptors))
    teacher.g2 = -np.quantile(logits, 0.65, axis=0)
    descriptors = 1.0 / (1.0 + np.exp(-(logits + teacher.g2)))

    # simulated assay noise on receptor targets (documented, deterministic)
    receptor_targets = np.clip(receptor_clean + rng.normal(scale=0.005, size=receptor_clean.shape), 0.0, 1.0)

    # deliberately missing labels exercise the masked-loss path (NaN, never 0)
    descriptor_targets = descriptors.copy()
    descriptor_targets[rng.random(M) < 0.10] = np.nan
    intensity_targets = intensity.copy()
    intensity_targets[rng.random(M) < 0.15] = np.nan

    # --- splits -------------------------------------------------------------------
    heldout = sorted(rng.choice(n_compounds, size=n_heldout_compounds, replace=False).tolist())
    groups = ["-".join(map(str, s)) for s, _ in mixtures]
    split = np.empty(M, dtype=object)
    has_heldout = np.array([any(i in heldout for i in s) for s, _ in mixtures])
    split[has_heldout] = "heldout_compound"
    uniq = sorted({g for g, h in zip(groups, has_heldout) if not h})
    perm = rng.permutation(len(uniq))
    n_tr, n_va = int(0.7 * len(uniq)), int(0.15 * len(uniq))
    group_split = {}
    for rank, gi in enumerate(perm):
        group_split[uniq[gi]] = "train" if rank < n_tr else ("val" if rank < n_tr + n_va else "test")
    for m, g in enumerate(groups):
        if not has_heldout[m]:
            split[m] = group_split[g]

    return {
        "provenance": PROVENANCE,
        "seed": seed,
        "compound_ids": compound_ids,
        "compound_names": [f"Virtual compound {i + 1:02d}" for i in range(n_compounds)],
        "compound_families": family_names,
        "compound_features": features.astype(np.float32),
        "heldout_compounds": [compound_ids[i] for i in heldout],
        "receptor_ids": [f"R{j + 1:03d}" for j in range(n_receptors)],
        "descriptor_labels": labels,
        "sample_ids": [f"M{m + 1:04d}" for m in range(M)],
        "comp_idx": comp_idx,
        "conc": conc_arr,
        "mask": comp_idx >= 0,
        "receptor_targets": receptor_targets.astype(np.float32),
        "receptor_clean": receptor_clean.astype(np.float32),
        "descriptor_targets": descriptor_targets.astype(np.float32),
        "intensity_targets": intensity_targets.astype(np.float32),
        "perceptual_targets": perceptual.astype(np.float32),
        "groups": groups,
        "split": split.astype(str),
        "teacher": teacher,
    }


# ---------------------------------------------------------------------------
_ARRAY_KEYS = ["compound_features", "comp_idx", "conc", "mask", "receptor_targets", "receptor_clean",
               "descriptor_targets", "intensity_targets", "perceptual_targets"]
_LIST_KEYS = ["compound_ids", "compound_names", "compound_families", "heldout_compounds", "receptor_ids",
              "descriptor_labels", "sample_ids", "groups"]


def save_dataset(ds: dict, out_dir: Path = SYNTHETIC_DIR) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    arrays = {k: ds[k] for k in _ARRAY_KEYS}
    arrays["split"] = ds["split"].astype("U32")
    arrays.update(ds["teacher"].to_arrays())
    np.savez_compressed(out_dir / "demo_dataset.npz", **arrays)
    meta = {k: ds[k] for k in _LIST_KEYS}
    meta.update({"provenance": ds["provenance"], "seed": ds["seed"],
                 "label": "SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED",
                 "n_mixtures": int(len(ds["sample_ids"])),
                 "split_counts": {s: int((ds["split"] == s).sum()) for s in np.unique(ds["split"])}})
    (out_dir / "demo_dataset.json").write_text(json.dumps(meta, indent=1, ensure_ascii=False))
    return out_dir / "demo_dataset.npz"


def load_dataset(in_dir: Path = SYNTHETIC_DIR) -> dict:
    npz = np.load(in_dir / "demo_dataset.npz", allow_pickle=False)
    meta = json.loads((in_dir / "demo_dataset.json").read_text())
    ds = {k: npz[k] for k in _ARRAY_KEYS}
    ds["split"] = npz["split"].astype(str)
    ds["teacher"] = SyntheticTeacher.from_arrays(npz)
    ds.update({k: meta[k] for k in _LIST_KEYS})
    ds["provenance"], ds["seed"] = meta["provenance"], meta["seed"]
    return ds


def load_or_generate(in_dir: Path = SYNTHETIC_DIR, seed: int = 42) -> dict:
    if (in_dir / "demo_dataset.npz").exists():
        return load_dataset(in_dir)
    ds = generate_demo_dataset(seed)
    save_dataset(ds, in_dir)
    return ds
