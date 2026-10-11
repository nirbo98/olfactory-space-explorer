"""Schema-validated import of real (experimental) datasets + data-source abstraction.

Nothing is downloaded automatically. A user supplies a JSON file following
`ExperimentalDataset`; missing labels stay missing (NaN masks downstream), they
are never silently replaced by zero.
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Literal

import numpy as np
from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..config import MAX_COMPONENTS


class Compound(BaseModel):
    model_config = ConfigDict(extra="forbid")
    compound_id: str
    name: str | None = None
    smiles: str | None = None
    features: list[float] | None = Field(None, description="precomputed feature vector; else derived from SMILES")

    @model_validator(mode="after")
    def _has_representation(self):
        if self.smiles is None and self.features is None:
            raise ValueError(f"{self.compound_id}: provide smiles or features")
        return self


class Environment(BaseModel):
    temperature_c: float | None = None
    relative_humidity: float | None = Field(None, ge=0, le=1)
    flow_rate_l_min: float | None = None


class Component(BaseModel):
    compound_id: str
    concentration: float = Field(..., ge=0)
    unit: str = "arbitrary"
    gas_phase_concentration: float | None = Field(None, ge=0, description="measured headspace concentration")


class MixtureRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sample_id: str
    components: list[Component] = Field(..., min_length=1)
    environment: Environment | None = None
    receptor_responses: dict[str, float | None] | None = None
    assay_conditions: str | None = None
    descriptors: dict[str, float | None] | None = None
    intensity: float | None = None
    intensity_sd: float | None = Field(None, ge=0)
    participant_id: str | None = Field(None, description="pseudonymous; only where ethically approved")


class ExperimentalDataset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    provenance: Literal["experimental", "literature", "format_example_only"]
    license: str
    citation: str | None = None
    receptor_ids: list[str]
    descriptor_labels: list[str] = Field(default_factory=list)
    compounds: list[Compound]
    mixtures: list[MixtureRecord]

    @model_validator(mode="after")
    def _references(self):
        ids = {c.compound_id for c in self.compounds}
        rec = set(self.receptor_ids)
        desc = set(self.descriptor_labels)
        for m in self.mixtures:
            for comp in m.components:
                if comp.compound_id not in ids:
                    raise ValueError(f"{m.sample_id}: unknown compound {comp.compound_id}")
            if len(m.components) > MAX_COMPONENTS:
                raise ValueError(f"{m.sample_id}: more than {MAX_COMPONENTS} components")
            for r in (m.receptor_responses or {}):
                if r not in rec:
                    raise ValueError(f"{m.sample_id}: unknown receptor {r}")
            for d in (m.descriptors or {}):
                if d not in desc:
                    raise ValueError(f"{m.sample_id}: unknown descriptor {d}")
        return self


def to_arrays(exp: ExperimentalDataset, featurizer=None) -> dict:
    """Convert to the training array layout. Missing labels → NaN (never 0)."""
    feats = []
    for c in exp.compounds:
        if c.features is not None:
            feats.append(np.asarray(c.features, dtype=np.float32))
        else:
            if featurizer is None:
                from ..models.molecular_encoder import RDKitFingerprintFeaturizer
                featurizer = RDKitFingerprintFeaturizer()
            feats.append(featurizer.featurize(c.smiles))
    if len({len(f) for f in feats}) != 1:
        raise ValueError("all compound feature vectors must have the same length")
    cidx = {c.compound_id: i for i, c in enumerate(exp.compounds)}
    M, R, D = len(exp.mixtures), len(exp.receptor_ids), len(exp.descriptor_labels)
    comp_idx = -np.ones((M, MAX_COMPONENTS), dtype=np.int64)
    conc = np.zeros((M, MAX_COMPONENTS), dtype=np.float32)
    receptor = np.full((M, R), np.nan, dtype=np.float32)
    desc = np.full((M, D), np.nan, dtype=np.float32)
    inten = np.full(M, np.nan, dtype=np.float32)
    for m, rec in enumerate(exp.mixtures):
        for k, comp in enumerate(rec.components):
            comp_idx[m, k] = cidx[comp.compound_id]
            conc[m, k] = comp.concentration
        for j, rid in enumerate(exp.receptor_ids):
            v = (rec.receptor_responses or {}).get(rid)
            if v is not None:
                receptor[m, j] = v
        for j, lab in enumerate(exp.descriptor_labels):
            v = (rec.descriptors or {}).get(lab)
            if v is not None:
                desc[m, j] = v
        if rec.intensity is not None:
            inten[m] = rec.intensity
    return {"provenance": exp.provenance, "compound_ids": list(cidx), "compound_features": np.stack(feats),
            "receptor_ids": exp.receptor_ids, "descriptor_labels": exp.descriptor_labels,
            "sample_ids": [m.sample_id for m in exp.mixtures], "comp_idx": comp_idx, "conc": conc,
            "mask": comp_idx >= 0, "receptor_targets": receptor, "descriptor_targets": desc,
            "intensity_targets": inten}


def load_experimental(path: Path) -> ExperimentalDataset:
    return ExperimentalDataset.model_validate(json.loads(Path(path).read_text()))


# ---------------------------------------------------------------------------
class DataSource(ABC):
    kind: str

    @abstractmethod
    def describe(self) -> dict: ...

    @abstractmethod
    def arrays(self) -> dict: ...


class SyntheticDataSource(DataSource):
    kind = "synthetic"

    def __init__(self, ds: dict):
        self.ds = ds

    def describe(self) -> dict:
        split = np.asarray(self.ds["split"])
        return {"id": "synthetic-demo", "kind": self.kind, "provenance": self.ds["provenance"],
                "label": "SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED",
                "label_he": "נתונים מדומים — לא אומתו בניסוי",
                "seed": int(self.ds["seed"]), "n_compounds": len(self.ds["compound_ids"]),
                "n_receptors": len(self.ds["receptor_ids"]), "n_mixtures": len(self.ds["sample_ids"]),
                "split_counts": {s: int((split == s).sum()) for s in np.unique(split)},
                "heldout_compounds": list(self.ds["heldout_compounds"]),
                "descriptor_labels": list(self.ds["descriptor_labels"]),
                "missing_labels": {
                    "descriptor_rows": int(np.isnan(self.ds["descriptor_targets"]).all(1).sum()),
                    "intensity": int(np.isnan(self.ds["intensity_targets"]).sum())}}

    def arrays(self) -> dict:
        return self.ds


class ExperimentalDataSource(DataSource):
    kind = "experimental"

    def __init__(self, path: Path, featurizer=None):
        self.path = Path(path)
        self.meta = load_experimental(self.path)
        self.featurizer = featurizer

    def describe(self) -> dict:
        return {"id": self.meta.name, "kind": self.kind, "provenance": self.meta.provenance,
                "license": self.meta.license, "citation": self.meta.citation,
                "n_compounds": len(self.meta.compounds), "n_mixtures": len(self.meta.mixtures)}

    def arrays(self) -> dict:
        return to_arrays(self.meta, self.featurizer)
