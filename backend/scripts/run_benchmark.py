"""Run the Keller 2016 validation benchmark → checkpoints/keller-benchmark.json.

Requires the processed data (python scripts/fetch_keller.py) and RDKit.
Decision rules are pre-registered in documentation/PREREGISTRATION_KELLER_HE.md.

    python scripts/run_benchmark.py                  # full run (both protocols, all models)
    python scripts/run_benchmark.py --threads 4
"""
import argparse
import json
import math

import _path  # noqa: F401
import torch

from app.config import CHECKPOINT_DIR
from app.validation import benchmark


def clean(x):
    """JSON-safe: NaN/inf → null, numpy scalars → Python."""
    if isinstance(x, dict):
        return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if hasattr(x, "item") and not hasattr(x, "__len__"):
        x = x.item()
    if isinstance(x, float) and not math.isfinite(x):
        return None
    return x


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(CHECKPOINT_DIR / "keller-benchmark.json"))
    ap.add_argument("--threads", type=int, default=4)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    res = benchmark.run(seed=a.seed)
    with open(a.out, "w") as f:
        json.dump(clean(res), f, indent=1, allow_nan=False)
    print(f"wrote {a.out}")
    for proto, r in res["protocols"].items():
        print(f"\n{proto}")
        for m, s in r["summary"].items():
            print(f"  {m:15s} mean r {s['mean_r']:.3f}  CI {s['mean_r_ci'][0]:.3f}–{s['mean_r_ci'][1]:.3f}  "
                  f"of ceiling {s['mean_frac_ceiling']:.2f}")
        if r["verdicts"]:
            for h, v in r["verdicts"].items():
                print(f"  {h}: {v.get('outcome', v['supported'])}")
