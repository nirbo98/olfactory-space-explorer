"""Train the student BioOlfactoryModel on the synthetic teacher data.

python scripts/train_demo.py [--epochs N] [--lr 1e-4] [--cortex gru|attention]
                             [--no-sparsity] [--no-lateral-inhibition] [--out PATH]
"""
import argparse
import json
from pathlib import Path

import _path  # noqa: F401
import torch
from app.config import CHECKPOINT_DIR, MODEL_VERSION, ModelConfig, TrainConfig
from app.datasets.synthetic import load_or_generate
from app.training.trainer import train

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=TrainConfig.max_epochs)
    ap.add_argument("--lr", type=float, default=TrainConfig.lr)
    ap.add_argument("--batch-size", type=int, default=TrainConfig.batch_size)
    ap.add_argument("--patience", type=int, default=TrainConfig.patience)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--cortex", choices=["gru", "attention"], default="gru")
    ap.add_argument("--no-sparsity", action="store_true")
    ap.add_argument("--no-lateral-inhibition", action="store_true")
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--out", type=Path, default=CHECKPOINT_DIR / f"{MODEL_VERSION}.pt")
    a = ap.parse_args()
    torch.set_num_threads(a.threads)
    mc = ModelConfig(cortex_type=a.cortex, sparsity=None if a.no_sparsity else 0.2,
                     lateral_inhibition=not a.no_lateral_inhibition)
    tc = TrainConfig(seed=a.seed, lr=a.lr, max_epochs=a.epochs, batch_size=a.batch_size, patience=a.patience)
    ds = load_or_generate(seed=a.seed)
    res = train(ds, mc, tc, out_path=a.out)
    ck = res["checkpoint"]
    print(f"\nsaved {a.out}  (best epoch {ck['best_epoch']}, {ck['training_seconds']} s)")
    for split, m in ck["metrics"].items():
        print(f"  {split:24s} n={m['n']:4d}  loss={m['loss']:.4f}  receptor MAE={m['receptor_mae']:.4f} "
              f"(mean-baseline {m['receptor_mae_mean_baseline']:.4f})  R²={m['receptor_r2']:.3f}  "
              f"desc AUROC={m.get('descriptor_auroc_macro')}")
    atlas = CHECKPOINT_DIR / f"atlas-{MODEL_VERSION}.json"
    if a.out == CHECKPOINT_DIR / f"{MODEL_VERSION}.pt":
        from app.simulation.engine import OlfactoryEngine
        OlfactoryEngine(a.out, ds)   # builds + caches the fixed reference atlas / PCA
        print(f"built reference atlas {atlas}")
