"""Validation of the model against real human psychophysics (Keller & Vosshall 2016).

reliability  noise ceilings (split-half across subjects, test–retest)
features     Morgan count fingerprints, RDKit 2-D descriptors, scaffold groups
splits       scaffold-grouped and random molecule-level K-fold protocols
baselines    chemistry baselines (Ridge, random forest, MLP)
ose_adapter  trains the biologically structured model on the same folds
benchmark    out-of-fold predictions → per-target Pearson r, bootstrap CIs, verdicts
"""
