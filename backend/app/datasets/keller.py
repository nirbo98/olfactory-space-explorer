"""Keller & Vosshall (2016) human psychophysics — download, verify, and compact.

REAL HUMAN DATA. 55 subjects rated 480 molecules, each at two dilutions in
paraffin oil, for intensity, pleasantness and 20 semantic descriptors (0–100).
Source: Keller A, Vosshall LB. "Olfactory perception of chemically diverse
molecules." BMC Neuroscience 17:55 (2016), doi:10.1186/s12868-016-0287-2,
CC-BY 4.0. Files are taken from the pyrfume-data repository at a pinned commit
and checked against SHA-256 hashes.

Coding rules (applied by `process`, documented in PROVENANCE.md):

* "I can't smell anything": intensity = 0 (an undetected stimulus has zero
  perceived intensity); pleasantness and descriptors = missing.
* "I smell something": a descriptor the subject did not use is recorded as NA
  in the source; every recorded value is ≥ 1, so NA there means "not selected"
  and is coded 0 (the DREAM-challenge convention).
* Two stimuli identify their molecule only by CAS number and the source has no
  SMILES for them (CAS 109-19-0, 3796-70-1). They stay in the rating tensor (used
  for reliability) but have no structure, so prediction benchmarks exclude them.
* 20 stimuli were presented twice to every subject; the first presentation goes
  into the main tensor, the second into the replicate arrays (test–retest).
"""
from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

import numpy as np

from ..config import DATA_DIR

KELLER_DIR = DATA_DIR / "real" / "keller2016"
RAW_DIR = KELLER_DIR / "raw"
PROCESSED = KELLER_DIR / "ratings.npz"
MOLECULES = KELLER_DIR / "molecules.csv"

PYRFUME_COMMIT = "8054ea98ed675005ec10e67359902f500e4911b0"
BASE_URL = f"https://raw.githubusercontent.com/pyrfume/pyrfume-data/{PYRFUME_COMMIT}/keller_2016/"
SHA256 = {
    "behavior.csv": "ab31c17c475c8b471706822f89aaf9e148bebe5f50f33ff03ebc42b32ac94df8",
    "molecules.csv": "5f862b6ea62dd3ee0a15138605ea2567d06a527263284348a5982844f9bec81f",
    "stimuli.csv": "49c1a6bfb8c1665a31e13f515add95a95291f29416be1bb0b54d3317efb6665b",
    "subjects.csv": "45d4d17d557982bb98ce399cf4cf07166aa38f6670c339bad266aac21583c39f",
}
CITATION = ("Keller A, Vosshall LB (2016). Olfactory perception of chemically diverse molecules. "
            "BMC Neuroscience 17:55. doi:10.1186/s12868-016-0287-2")
LICENSE = "CC-BY 4.0"

DESCRIPTORS = ["EDIBLE", "BAKERY", "SWEET", "FRUIT", "FISH", "GARLIC", "SPICES", "COLD", "SOUR", "BURNT",
               "ACID", "WARM", "MUSKY", "SWEATY", "AMMONIA/URINOUS", "DECAYED", "WOOD", "GRASS", "FLOWER",
               "CHEMICAL"]
INTENSITY_Q, PLEASANT_Q, SMELL_Q = "HOW STRONG IS THE SMELL?", "HOW PLEASANT IS THE SMELL?", "CAN OR CAN'T SMELL"
TARGETS = ["INTENSITY", "PLEASANTNESS", *DESCRIPTORS]
NA = 255


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fetch(raw_dir: Path = RAW_DIR, log=print) -> None:
    """Download the four source files (≈68 MB) and verify their hashes."""
    raw_dir.mkdir(parents=True, exist_ok=True)
    for name, digest in SHA256.items():
        path = raw_dir / name
        if not path.exists() or sha256(path) != digest:
            log(f"downloading {name}")
            urllib.request.urlretrieve(BASE_URL + name, path)
        got = sha256(path)
        if got != digest:
            raise ValueError(f"{name}: SHA-256 mismatch ({got}); refusing to use unverified data")
        log(f"verified {name}")


def process(raw_dir: Path = RAW_DIR, out_dir: Path = KELLER_DIR) -> dict:
    """Compact the long-format ratings into a [stimulus, subject, target] uint8 tensor."""
    import pandas as pd

    beh = pd.read_csv(raw_dir / "behavior.csv", index_col=0)
    stim = pd.read_csv(raw_dir / "stimuli.csv", index_col=0)
    mols = pd.read_csv(raw_dir / "molecules.csv", index_col=0)

    beh["rep"] = beh.groupby(["Stimulus", "Subject", "MeasurementValue"]).cumcount()
    wide = beh.pivot_table(index=["Stimulus", "Subject", "rep"], columns="MeasurementValue",
                           values="Value", aggfunc="first", dropna=False)
    wide = wide.reindex(columns=[SMELL_Q, INTENSITY_Q, PLEASANT_Q, *DESCRIPTORS])
    wide = wide[wide[SMELL_Q].notna()]                    # drop (stimulus, subject, rep) cells never presented
    smelled = wide[SMELL_Q].eq("I smell something")
    vals = pd.DataFrame(index=wide.index)
    vals["INTENSITY"] = pd.to_numeric(wide[INTENSITY_Q], errors="coerce").where(smelled, 0.0)
    vals["PLEASANTNESS"] = pd.to_numeric(wide[PLEASANT_Q], errors="coerce").where(smelled)
    for d in DESCRIPTORS:
        vals[d] = pd.to_numeric(wide[d], errors="coerce").fillna(0.0).where(smelled)
    v = vals.to_numpy()
    if np.nanmin(v) < 0 or np.nanmax(v) > 100 or not np.allclose(v[~np.isnan(v)] % 1, 0):
        raise ValueError("ratings are expected to be integers in 0–100")
    coded = np.where(np.isnan(v), NA, v).astype(np.uint8)

    stimuli = np.sort(stim.index.to_numpy() if "Stimulus" not in stim else stim["Stimulus"].to_numpy())
    subjects = np.sort(beh["Subject"].unique())
    s_pos = {s: i for i, s in enumerate(stimuli)}
    j_pos = {s: i for i, s in enumerate(subjects)}
    ratings = np.full((len(stimuli), len(subjects), len(TARGETS)), NA, np.uint8)
    rep_rows, rep_vals = [], []
    for (s, j, r), row in zip(vals.index, coded):
        if r == 0:
            ratings[s_pos[s], j_pos[j]] = row
        else:
            rep_rows.append((s_pos[s], j_pos[j]))
            rep_vals.append(row)

    st = stim.set_index("Stimulus").loc[stimuli]
    mol_ids = np.asarray(st["CIDs"].astype(str).tolist(), dtype=str)  # PubChem CID, or CAS when no CID resolved
    out_dir.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_dir / PROCESSED.name, ratings=ratings, targets=np.array(TARGETS),
                        stimulus=stimuli, subject=subjects, mol_id=mol_ids,
                        dilution=st["Concentration"].astype(float).to_numpy(),
                        replicate_index=np.array(rep_rows, np.int16).reshape(-1, 2),
                        replicate_ratings=np.array(rep_vals, np.uint8).reshape(-1, len(TARGETS)))
    mols = mols.assign(mol_id=[str(c) if str(c).isdigit() else str(cas) for c, cas in zip(mols["CID"], mols["CAS"])])
    # a CAS-only stimulus is matched on the CAS column
    mols.loc[mols["CAS"].isin(set(mol_ids)), "mol_id"] = mols["CAS"]
    used = mols[mols["mol_id"].isin(set(mol_ids))][["mol_id", "CID", "OdorName", "CAS", "CanonicalSMILES",
                                                     "MolecularWeight"]].drop_duplicates("mol_id")
    used.to_csv(out_dir / MOLECULES.name, index=False)
    return {"n_stimuli": len(stimuli), "n_subjects": len(subjects), "n_molecules": int(len(set(mol_ids))),
            "n_replicates": len(rep_rows), "n_molecules_with_smiles": int(used["CanonicalSMILES"].notna().sum())}


def load(path: Path = PROCESSED, molecules: Path = MOLECULES) -> dict:
    """Processed data as float arrays (NaN = missing); see module docstring for coding rules."""
    import pandas as pd

    z = np.load(path)
    def f(a):
        a = a.astype(np.float32)
        a[a == NA] = np.nan
        return a
    mols = pd.read_csv(molecules, dtype={"mol_id": str})
    smiles = {m: s for m, s in zip(mols["mol_id"], mols["CanonicalSMILES"]) if isinstance(s, str)}
    names = dict(zip(mols["mol_id"], mols["OdorName"]))
    mol_id = [str(m) for m in z["mol_id"]]
    return {"ratings": f(z["ratings"]), "targets": [str(t) for t in z["targets"]], "mol_id": mol_id,
            "dilution": z["dilution"], "subject": z["subject"],
            "replicate_index": z["replicate_index"].astype(int), "replicate_ratings": f(z["replicate_ratings"]),
            "smiles": [smiles.get(m) for m in mol_id], "names": [names.get(m) for m in mol_id]}


def to_model_concentration(dilution) -> np.ndarray:
    """Declared mapping of liquid dilution to the model's arbitrary units.

    c = 2·10^((log10 d + 1)/3): 1/10 → 2.0, 1/10³ → 0.43, 1/10⁵ → 0.093, 1/10⁷ → 0.02,
    i.e. the 0.02–2.0 training range. Headspace (vapour-phase) concentration is NOT
    modelled; molecules with very different vapour pressures at equal dilution are
    treated alike, which is a known limitation.
    """
    return 2.0 * 10.0 ** ((np.log10(np.asarray(dilution, float)) + 1.0) / 3.0)
