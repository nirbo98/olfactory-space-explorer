"""Molecular features and scaffold groups (requires RDKit: pip install '.[chem]')."""
from __future__ import annotations

import numpy as np


def _chem():
    try:
        from rdkit import Chem, RDLogger
    except ImportError as e:  # pragma: no cover
        raise ImportError("RDKit is required for the validation benchmark: pip install -e '.[chem]'") from e
    RDLogger.DisableLog("rdApp.*")
    return Chem


def morgan_counts(smiles: list[str], n_bits: int = 2048, radius: int = 2) -> np.ndarray:
    """log(1 + Morgan count fingerprint), shape [n, n_bits]."""
    Chem = _chem()
    from rdkit.Chem import rdFingerprintGenerator
    gen = rdFingerprintGenerator.GetMorganGenerator(radius=radius, fpSize=n_bits)
    out = np.zeros((len(smiles), n_bits), np.float32)
    for i, s in enumerate(smiles):
        mol = Chem.MolFromSmiles(s)
        if mol is None:
            raise ValueError(f"invalid SMILES: {s}")
        out[i] = gen.GetCountFingerprintAsNumPy(mol)
    return np.log1p(out)


def rdkit_descriptors(smiles: list[str]) -> tuple[np.ndarray, list[str]]:
    """All RDKit 2-D descriptors; non-finite values replaced by the column median."""
    Chem = _chem()
    from rdkit.Chem import Descriptors
    names = [n for n, _ in Descriptors._descList]
    X = np.full((len(smiles), len(names)), np.nan)
    for i, s in enumerate(smiles):
        mol = Chem.MolFromSmiles(s)
        for j, (_, fn) in enumerate(Descriptors._descList):
            try:
                X[i, j] = fn(mol)
            except Exception:  # noqa: BLE001 — a few descriptors fail on unusual molecules
                pass
    X[~np.isfinite(X)] = np.nan
    X = np.clip(X, -1e6, 1e6)
    med = np.nanmedian(X, axis=0)
    X = np.where(np.isnan(X), np.where(np.isnan(med), 0.0, med)[None], X)
    keep = X.std(0) > 0
    return X[:, keep].astype(np.float32), [n for n, k in zip(names, keep) if k]


def scaffold_groups(smiles: list[str]) -> list[str]:
    """Bemis–Murcko scaffold per molecule.

    Many odorants are acyclic and have an empty Murcko scaffold; putting them all
    in one group would make one fold almost entirely acyclic. Acyclic molecules
    are grouped instead by their generic carbon skeleton (all atoms → C, all bonds
    single), so chain isomers and close homologues still share a group.
    """
    Chem = _chem()
    from rdkit.Chem.Scaffolds import MurckoScaffold
    groups = []
    for s in smiles:
        mol = Chem.MolFromSmiles(s)
        scaf = MurckoScaffold.MurckoScaffoldSmiles(mol=mol)
        if scaf:
            groups.append("ring:" + scaf)
        else:
            heavy = Chem.RemoveHs(mol)
            groups.append("acyclic:" + Chem.MolToSmiles(MurckoScaffold.MakeScaffoldGeneric(heavy)))
    return groups
