"""Generate the deterministic synthetic demonstration dataset into data/synthetic/."""
import argparse

import _path  # noqa: F401
from app.datasets.synthetic import generate_demo_dataset, save_dataset

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    ds = generate_demo_dataset(seed=a.seed)
    path = save_dataset(ds)
    print(f"wrote {path}  ({len(ds['sample_ids'])} synthetic mixtures, provenance={ds['provenance']})")
    print("SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED")
