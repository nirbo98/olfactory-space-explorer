"""Molecule-level cross-validation protocols. Both dilutions of a molecule always
share a fold, so no structure seen in training appears in its test fold."""
from __future__ import annotations

import numpy as np
from sklearn.model_selection import GroupKFold, KFold


def molecule_folds(n_molecules: int, groups: list[str] | None, n_splits: int = 5, seed: int = 42) -> np.ndarray:
    """Fold index per molecule. groups=None → random split; otherwise scaffold-grouped."""
    fold = np.full(n_molecules, -1)
    idx = np.arange(n_molecules)
    if groups is None:
        splitter = KFold(n_splits=n_splits, shuffle=True, random_state=seed).split(idx)
    else:
        splitter = GroupKFold(n_splits=n_splits, shuffle=True, random_state=seed).split(idx, groups=groups)
    for k, (_, test) in enumerate(splitter):
        fold[test] = k
    assert (fold >= 0).all()
    return fold


def validation_molecules(train_mols: np.ndarray, groups: list[str] | None, frac: float = 0.15,
                         seed: int = 0) -> np.ndarray:
    """Hold out whole groups from the training molecules for early stopping."""
    rng = np.random.default_rng(seed)
    if groups is None:
        return rng.choice(train_mols, size=max(1, int(frac * len(train_mols))), replace=False)
    g = np.asarray(groups)[train_mols]
    uniq = rng.permutation(np.unique(g))
    chosen, n = [], 0
    for u in uniq:
        if n >= frac * len(train_mols):
            break
        chosen.append(u)
        n += int((g == u).sum())
    return train_mols[np.isin(g, chosen)]
