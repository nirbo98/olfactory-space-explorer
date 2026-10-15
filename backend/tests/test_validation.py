"""Validation infrastructure: reliability maths, leakage-free folds, Keller coding
rules, and an end-to-end benchmark on a tiny fabricated panel (not real data)."""
import numpy as np
import pandas as pd
import pytest

from app.validation.reliability import retest_reliability, spearman_brown, split_half
from app.validation.splits import molecule_folds, validation_molecules

rdkit = pytest.importorskip("rdkit")

SMILES = ["CCO", "CCCO", "CCCCO", "CC(C)O", "CC(=O)OCC", "CCCCC(=O)OC", "c1ccccc1", "Cc1ccccc1", "CCc1ccccc1",
          "Oc1ccccc1", "C1CCCCC1", "CC1CCCCC1", "OC1CCCCC1", "CC=O", "CCC=O", "CCCC=O", "c1ccncc1", "Cc1ccncc1",
          "CC(C)CC(=O)O", "CCCC(=O)O", "C1=CC=C(C=C1)C=O", "COc1ccccc1", "CSC", "CCSCC", "CCN", "CCCN",
          "C1CCOC1", "C1CCNC1", "CC(=O)C", "CCC(=O)C", "c1ccc2ccccc2c1", "CC(C)(C)O", "OCCO", "CCOCC",
          "C=CC=O", "CC#N", "ClCCl", "CCCCCCO", "CCCCCCCC", "c1ccsc1"]


def test_spearman_brown_and_split_half_recover_known_reliability():
    assert spearman_brown(0.5) == pytest.approx(2 / 3)
    rng = np.random.default_rng(0)
    true = rng.normal(size=400)
    noise_sd = 2.0
    ratings = true[:, None] + rng.normal(scale=noise_sd, size=(400, 40))
    # reliability of a 40-rater mean: var_t / (var_t + noise²/40)
    expected = 1 / (1 + noise_sd ** 2 / 40)
    r = split_half(ratings, n_splits=100)
    assert r["reliability"] == pytest.approx(expected, abs=0.03)
    assert r["ceiling"] == pytest.approx(np.sqrt(expected), abs=0.02)
    tr = retest_reliability(true + rng.normal(size=400), true + rng.normal(size=400))
    assert tr["r"] == pytest.approx(0.5, abs=0.1)


def test_scaffold_folds_have_no_group_leakage():
    from app.validation.features import scaffold_groups
    groups = scaffold_groups(SMILES)
    assert groups[6] == groups[7] == groups[8] == groups[9] == groups[21]       # benzene scaffold
    assert groups[0].startswith("acyclic:")
    fold = molecule_folds(len(SMILES), groups, n_splits=5)
    g = np.asarray(groups)
    for u in set(groups):
        assert len(set(fold[g == u])) == 1
    val = validation_molecules(np.where(fold != 0)[0], groups)
    assert not set(g[val]) & set(g[np.setdiff1d(np.where(fold != 0)[0], val)])


def test_keller_coding_rules(tmp_path):
    from app.datasets import keller
    rows = []
    def add(stim, subj, smell, inten, sweet, rep=0):
        base = {"Stimulus": stim, "Subject": subj, "Experiment": "keller2016"}
        vals = {keller.SMELL_Q: "I smell something" if smell else "I can't smell anything",
                keller.INTENSITY_Q: inten, keller.PLEASANT_Q: 50 if smell else None,
                **{d: None for d in keller.DESCRIPTORS}}
        vals["SWEET"] = sweet
        for k, v in vals.items():
            rows.append({**base, "MeasurementValue": k, "Value": v})
    add(1, 1, True, 60, 30); add(1, 2, False, None, None); add(2, 1, True, 20, None); add(2, 2, True, 10, 5)
    add(1, 1, True, 70, 40)   # replicate of stimulus 1 / subject 1
    pd.DataFrame(rows).to_csv(tmp_path / "behavior.csv")
    pd.DataFrame({"Stimulus": [1, 2], "Experiment": "keller2016", "CIDs": ["702", "702"],
                  "Concentration": [0.1, 0.001], "Ratio": ["", ""], "Solvent": ""}).to_csv(tmp_path / "stimuli.csv")
    pd.DataFrame({"CID": [702], "OdorName": ["ethanol"], "CAS": ["64-17-5"], "CanonicalSMILES": ["CCO"],
                  "MolecularWeight": [46.07]}).to_csv(tmp_path / "molecules.csv")
    info = keller.process(tmp_path, tmp_path)
    assert info["n_stimuli"] == 2 and info["n_replicates"] == 1
    d = keller.load(tmp_path / "ratings.npz", tmp_path / "molecules.csv")
    t = {n: i for i, n in enumerate(d["targets"])}
    R = d["ratings"]
    assert R[0, 0, t["INTENSITY"]] == 60 and R[0, 0, t["SWEET"]] == 30
    assert R[0, 1, t["INTENSITY"]] == 0                       # can't smell → intensity 0
    assert np.isnan(R[0, 1, t["SWEET"]]) and np.isnan(R[0, 1, t["PLEASANTNESS"]])
    assert R[1, 0, t["SWEET"]] == 0                           # smelled, descriptor not selected → 0
    assert d["replicate_ratings"][0, t["INTENSITY"]] == 70
    assert d["smiles"] == ["CCO", "CCO"]
    np.testing.assert_allclose(keller.to_model_concentration([0.1, 1e-7]), [2.0, 0.02])


def _fake_panel(n_sub=12, seed=0):
    """Fabricated ratings driven by molecular size, for plumbing tests only."""
    from app.datasets import keller
    rng = np.random.default_rng(seed)
    n_mol = len(SMILES)
    size = np.array([len(s) for s in SMILES], float)
    dil = np.tile([1e-1, 1e-3], n_mol)
    T = len(keller.TARGETS)
    signal = (size[:, None] * rng.uniform(0.5, 2, T)[None]).repeat(2, 0)
    signal[:, 0] += 10 * (np.log10(dil) + 3)
    ratings = np.clip(signal[:, None, :] + rng.normal(scale=8, size=(2 * n_mol, n_sub, T)), 0, 100)
    return {"ratings": ratings.astype(np.float32), "targets": list(keller.TARGETS),
            "mol_id": [str(i) for i in np.arange(n_mol).repeat(2)], "dilution": dil,
            "subject": np.arange(n_sub), "replicate_index": np.zeros((0, 2), int),
            "replicate_ratings": np.zeros((0, T), np.float32),
            "smiles": list(np.repeat(SMILES, 2)), "names": list(np.repeat(SMILES, 2))}


def test_benchmark_end_to_end_on_fabricated_panel():
    from app.validation import benchmark
    res = benchmark.run(_fake_panel(), protocols=("scaffold",), models=["ridge_morgan", "rf_morgan", "ose"],
                        n_splits=3, n_boot=50, n_ceiling_splits=20,
                        ose_train={"max_epochs": 3, "patience": 3, "lr": 1e-3}, log=lambda *_: None)
    pr = res["protocols"]["scaffold"]
    assert set(pr["summary"]) == {"ridge_morgan", "rf_morgan", "ose"}
    assert all(np.isfinite(pr["per_target"]["rf_morgan"][t]["r"]) for t in res["dataset"]["targets"])
    assert pr["summary"]["rf_morgan"]["mean_r"] > 0              # size signal is learnable
    assert {"H1", "H2", "H3", "H4"} <= set(pr["verdicts"])
    assert pr["verdicts"]["H3"]["outcome"] in {"ose_better", "ose_worse", "no_detectable_difference"}
    assert res["ceilings"]["INTENSITY"]["ceiling"] > 0.5
