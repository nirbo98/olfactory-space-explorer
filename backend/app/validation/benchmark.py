"""Keller 2016 benchmark: noise ceilings, chemistry baselines and the OSE model on
identical molecule-level folds, scored on out-of-fold predictions.

Primary metric (DREAM convention): Pearson r, across held-out molecules, between
the predicted and observed panel-mean rating at the higher of the two tested
dilutions. Confidence intervals: bootstrap over molecules (pooled out-of-fold
predictions). Decision rules for the hypotheses are fixed in
documentation/PREREGISTRATION_KELLER_HE.md and implemented in `verdicts`.
"""
from __future__ import annotations

import math
import platform
import time

import numpy as np

from ..datasets import keller
from . import baselines, features, ose_adapter
from .reliability import retest_reliability, split_half
from .splits import molecule_folds, validation_molecules

BASELINES = ["ridge_morgan", "rf_morgan", "rf_descriptors", "mlp_morgan"]
MODELS = [*BASELINES, "ose"]
MODEL_LABELS = {"ridge_morgan": "Ridge · Morgan", "rf_morgan": "RF · Morgan", "rf_descriptors": "RF · RDKit 2D",
                "mlp_morgan": "MLP · Morgan", "ose": "OSE (bio-structured)"}
PROTOCOLS = {"scaffold": "scaffold-grouped 5-fold (primary)", "random": "random molecule 5-fold"}


def _pearson(a, b) -> float:
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 3 or np.std(a[ok]) == 0 or np.std(b[ok]) == 0:
        return float("nan")
    return float(np.corrcoef(a[ok], b[ok])[0, 1])


def _wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (math.nan, math.nan)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)


def prepare(data: dict) -> dict:
    """Panel means per stimulus and the molecule ↔ stimulus layout (molecules with SMILES only)."""
    with np.errstate(all="ignore"):
        means = np.nanmean(data["ratings"], axis=1)                     # [S, T]
    mol_ids = [m for m in dict.fromkeys(data["mol_id"]) if data["smiles"][data["mol_id"].index(m)]]
    pos = {m: i for i, m in enumerate(mol_ids)}
    stim = np.array([i for i, m in enumerate(data["mol_id"]) if m in pos])
    stim_mol = np.array([pos[data["mol_id"][i]] for i in stim])
    dil = np.asarray(data["dilution"], float)[stim]
    high = np.zeros(len(mol_ids), int)
    low = np.zeros(len(mol_ids), int)
    for k in range(len(mol_ids)):
        rows = np.where(stim_mol == k)[0]
        high[k] = rows[np.argmax(dil[rows])]
        low[k] = rows[np.argmin(dil[rows])]
    smiles = [data["smiles"][data["mol_id"].index(m)] for m in mol_ids]
    names = [data["names"][data["mol_id"].index(m)] for m in mol_ids]
    return {"means": means[stim], "stim": stim, "stim_mol": stim_mol, "log_dil": np.log10(dil),
            "conc": keller.to_model_concentration(dil), "high": high, "low": low,
            "mol_ids": mol_ids, "smiles": smiles, "names": names}


def ceilings(data: dict, p: dict, n_splits: int = 200, seed: int = 0) -> dict:
    hi_stim = p["stim"][p["high"]]
    out = {}
    rep_idx, rep_val = data["replicate_index"], data["replicate_ratings"]
    for t, name in enumerate(data["targets"]):
        sh = split_half(data["ratings"][hi_stim, :, t], n_splits=n_splits, seed=seed)
        first = data["ratings"][rep_idx[:, 0], rep_idx[:, 1], t] if len(rep_idx) else np.array([])
        sh["test_retest"] = retest_reliability(first, rep_val[:, t]) if len(rep_idx) else None
        out[name] = sh
    return out


def out_of_fold(p: dict, feats: dict, groups, models, n_splits: int, seed: int, target_names,
                ose_train: dict | None = None, log=print) -> dict:
    fold = molecule_folds(len(p["mol_ids"]), groups, n_splits, seed)
    sfold = fold[p["stim_mol"]]
    Y = p["means"]
    preds = {m: np.full_like(Y, np.nan) for m in models}
    for k in range(n_splits):
        tr, te = np.where(sfold != k)[0], np.where(sfold == k)[0]
        for m in models:
            t0 = time.time()
            if m == "ose":
                train_mols = np.unique(p["stim_mol"][tr])
                val_mols = validation_molecules(train_mols, None if groups is None else groups, seed=seed + k)
                split = np.where(sfold == k, "test", np.where(np.isin(p["stim_mol"], val_mols), "val", "train"))
                preds[m][te] = ose_adapter.fit_predict(feats["morgan"], p["stim_mol"], p["conc"], Y, split,
                                                       target_names, seed=seed, overrides=ose_train)
            else:
                base = feats["descriptors"] if m == "rf_descriptors" else feats["morgan"]
                X = np.hstack([base[p["stim_mol"]], p["log_dil"][:, None]])
                preds[m][te] = baselines.fit_predict(m, X[tr], Y[tr], X[te], seed=seed)
            log(f"  fold {k + 1}/{n_splits}  {m:15s} {time.time() - t0:6.1f}s")
    return {"fold": fold, "preds": preds}


def score(p: dict, preds: dict, target_names, ceil: dict, n_boot: int, seed: int) -> dict:
    hi, lo = p["high"], p["low"]
    obs = p["means"][hi]
    n = len(hi)
    rng = np.random.default_rng(seed)
    boots = [rng.integers(0, n, n) for _ in range(n_boot)]
    res = {"per_target": {}, "summary": {}, "dose": {}, "boot_mean_r": {}}
    for m, P in preds.items():
        pr = P[hi]
        per = {}
        bmat = np.zeros((n_boot, len(target_names)))
        for t, name in enumerate(target_names):
            r = _pearson(pr[:, t], obs[:, t])
            bs = np.array([_pearson(pr[b, t], obs[b, t]) for b in boots])
            bmat[:, t] = bs
            c = ceil[name]["ceiling"]
            per[name] = {"r": r, "ci": [float(np.nanpercentile(bs, 2.5)), float(np.nanpercentile(bs, 97.5))],
                         "frac_ceiling": r / c if c > 0 else None}
        res["per_target"][m] = per
        bm = np.nanmean(bmat, axis=1)
        mean_r = float(np.nanmean([per[t]["r"] for t in target_names]))
        res["summary"][m] = {"mean_r": mean_r, "mean_r_ci": [float(np.percentile(bm, 2.5)), float(np.percentile(bm, 97.5))],
                             "mean_frac_ceiling": float(np.nanmean([per[t]["frac_ceiling"] for t in target_names
                                                                    if per[t]["frac_ceiling"] is not None]))}
        res["boot_mean_r"][m] = bm
        # dose: does the predicted intensity change between dilutions follow the observed one?
        d_obs = p["means"][hi, 0] - p["means"][lo, 0]
        d_pred = P[hi, 0] - P[lo, 0]
        ok = np.isfinite(d_obs) & np.isfinite(d_pred) & (d_obs != 0)
        k = int((np.sign(d_obs[ok]) == np.sign(d_pred[ok])).sum())
        res["dose"][m] = {"sign_agreement": k / max(ok.sum(), 1), "ci": list(_wilson(k, int(ok.sum()))),
                          "n": int(ok.sum()), "r_delta": _pearson(d_pred, d_obs),
                          "observed_increase_fraction": float((d_obs[ok] > 0).mean()) if ok.any() else None}
    return res


def _delta(res: dict, a: str, b: str) -> dict:
    d = res["boot_mean_r"][a] - res["boot_mean_r"][b]
    point = res["summary"][a]["mean_r"] - res["summary"][b]["mean_r"]
    return {"vs": b, "delta_mean_r": point, "ci": [float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))]}


def verdicts(ceil: dict, primary: dict, models) -> dict:
    """Decision rules, fixed in advance (PREREGISTRATION_KELLER_HE.md)."""
    v = {}
    rank = sorted(ceil, key=lambda t: -ceil[t]["reliability"])
    pos = {t: rank.index(t) + 1 for t in rank}
    h1 = pos["INTENSITY"] <= 5 and pos["PLEASANTNESS"] <= 5
    v["H1"] = {"supported": h1, "evidence": {"rank_intensity": pos["INTENSITY"], "rank_pleasantness": pos["PLEASANTNESS"],
                                             "n_targets": len(rank)}}
    if "rf_morgan" in primary["per_target"]:
        ci_i = primary["per_target"]["rf_morgan"]["INTENSITY"]["ci"]
        ci_p = primary["per_target"]["rf_morgan"]["PLEASANTNESS"]["ci"]
        v["H2"] = {"supported": ci_i[0] > 0 and ci_p[0] > 0, "evidence": {"intensity_ci": ci_i, "pleasantness_ci": ci_p}}
    if "ose" in models:
        base = [m for m in models if m != "ose"]
        best = max(base, key=lambda m: primary["summary"][m]["mean_r"])
        d = _delta(primary, "ose", best)
        outcome = "ose_better" if d["ci"][0] > 0 else "ose_worse" if d["ci"][1] < 0 else "no_detectable_difference"
        v["H3"] = {"outcome": outcome, "supported": outcome == "ose_better", "evidence": d}
        if "mlp_morgan" in base:
            d2 = _delta(primary, "ose", "mlp_morgan")
            v["H3b"] = {"outcome": "ose_better" if d2["ci"][0] > 0 else "ose_worse" if d2["ci"][1] < 0
                        else "no_detectable_difference", "evidence": d2}
            v["H3b"]["supported"] = v["H3b"]["outcome"] == "ose_better"
        dose = primary["dose"]["ose"]
        v["H4"] = {"supported": dose["sign_agreement"] > 0.8, "evidence": dose}
        # POST-HOC (added after the first run; not part of the pre-registered rule): the 50% chance
        # level in the rule is the wrong reference when most molecules get stronger with concentration.
        # A constant "always increases" predictor scores the observed increase fraction.
        majority = dose["observed_increase_fraction"]
        v["H4"]["post_hoc"] = {"majority_rate": majority,
                               "beats_majority": bool(majority is not None and dose["sign_agreement"] > majority),
                               "note": "rule passes, but the always-increase predictor scores the same; uninformative"
                               if majority is not None and dose["sign_agreement"] <= majority else ""}
    return v


def run(data: dict | None = None, protocols=("scaffold", "random"), models=MODELS, n_splits: int = 5,
        seed: int = 42, n_boot: int = 1000, n_ceiling_splits: int = 200, ose_train: dict | None = None,
        log=print) -> dict:
    t_start = time.time()
    data = data or keller.load()
    target_names = data["targets"]
    p = prepare(data)
    log(f"{len(p['mol_ids'])} molecules with structure, {len(p['stim'])} stimuli, {len(target_names)} targets")
    feats = {"morgan": features.morgan_counts(p["smiles"])}
    if "rf_descriptors" in models:
        feats["descriptors"], _ = features.rdkit_descriptors(p["smiles"])
    groups = features.scaffold_groups(p["smiles"])
    ceil = ceilings(data, p, n_ceiling_splits, seed)
    out = {"protocols": {}}
    for proto in protocols:
        log(f"protocol: {proto}")
        oof = out_of_fold(p, feats, groups if proto == "scaffold" else None, models, n_splits, seed,
                          target_names, ose_train, log)
        res = score(p, oof["preds"], target_names, ceil, n_boot, seed)
        res["verdicts"] = verdicts(ceil, res, models) if proto == "scaffold" else None
        res["deltas"] = {m: _delta(res, "ose", m) for m in models if m != "ose"} if "ose" in models else {}
        res.pop("boot_mean_r")
        res["n_folds"] = n_splits
        out["protocols"][proto] = res
    import sklearn
    import torch
    n_groups = len(set(groups))
    return {
        "schema": "ose.validation.v1",
        "dataset": {"id": "keller2016", "kind": "experimental", "provenance": "human_psychophysics",
                    "citation": keller.CITATION, "license": keller.LICENSE, "doi": "10.1186/s12868-016-0287-2",
                    "source": f"pyrfume-data@{keller.PYRFUME_COMMIT[:10]}",
                    "n_subjects": int(data["ratings"].shape[1]), "n_stimuli": int(data["ratings"].shape[0]),
                    "n_molecules_total": len(set(data["mol_id"])), "n_molecules_used": len(p["mol_ids"]),
                    "n_scaffold_groups": n_groups, "targets": target_names,
                    "coding_rules": [
                        "can't smell → intensity 0, other targets missing",
                        "descriptor not selected on a smelled trial → 0",
                        "first presentation used; 20 repeated stimuli give test–retest",
                        "2 molecules without SMILES (CAS-only) excluded from prediction",
                    ]},
        "metric": "Pearson r between predicted and observed panel mean at the higher dilution, across held-out molecules",
        "models": {m: MODEL_LABELS[m] for m in models},
        "protocol_labels": {k: PROTOCOLS[k] for k in protocols},
        "ceilings": ceil,
        **out,
        "config": {"n_splits": n_splits, "seed": seed, "n_boot": n_boot, "n_ceiling_splits": n_ceiling_splits,
                   "ose_train": {**ose_adapter.OSE_TRAIN, **(ose_train or {})},
                   "concentration_mapping": "c = 2·10^((log10 dilution + 1)/3)"},
        "environment": {"python": platform.python_version(), "torch": torch.__version__,
                        "sklearn": sklearn.__version__, "runtime_s": round(time.time() - t_start, 1)},
    }
