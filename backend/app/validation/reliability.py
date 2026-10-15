"""Noise ceilings for population-mean ratings.

A model predicting the mean rating of a finite panel can never correlate with
that mean better than the mean correlates with itself under re-sampling of the
panel. We estimate this from the data:

  split-half: split subjects randomly into halves A, B; r_AB = corr over stimuli
  of the half means; Spearman–Brown gives the reliability of the full panel
  mean, r_SB = 2 r_AB / (1 + r_AB). The ceiling on the Pearson correlation of
  any predictor with the observed panel mean is √r_SB (correlation of the
  observed mean with its own noise-free value). Averaged over many random splits.

  test–retest: correlation of a subject's first and second rating of the same
  stimulus (individual-level reliability, 20 repeated stimuli).
"""
from __future__ import annotations

import numpy as np


def _pearson(a: np.ndarray, b: np.ndarray) -> float:
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3:
        return float("nan")
    a, b = a[ok], b[ok]
    if a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(np.corrcoef(a, b)[0, 1])


def spearman_brown(r: float, factor: float = 2.0) -> float:
    return factor * r / (1.0 + (factor - 1.0) * r)


def split_half(ratings: np.ndarray, n_splits: int = 200, seed: int = 0) -> dict:
    """ratings: [stimuli, subjects] with NaN = missing. Returns reliability and ceiling."""
    rng = np.random.default_rng(seed)
    n_sub = ratings.shape[1]
    rs = []
    with np.errstate(all="ignore"):
        for _ in range(n_splits):
            perm = rng.permutation(n_sub)
            a = np.nanmean(ratings[:, perm[: n_sub // 2]], axis=1)
            b = np.nanmean(ratings[:, perm[n_sub // 2:]], axis=1)
            rs.append(_pearson(a, b))
    rs = np.asarray(rs)
    rs = rs[np.isfinite(rs)]
    r_half = float(rs.mean())
    r_sb = spearman_brown(r_half)
    return {"r_half": r_half, "r_half_sd": float(rs.std()), "reliability": r_sb,
            "ceiling": float(np.sqrt(max(r_sb, 0.0))), "n_splits": int(len(rs))}


def retest_reliability(first: np.ndarray, second: np.ndarray) -> dict:
    """first, second: paired individual ratings [pairs] for one target."""
    return {"r": _pearson(first, second), "n_pairs": int((np.isfinite(first) & np.isfinite(second)).sum())}
