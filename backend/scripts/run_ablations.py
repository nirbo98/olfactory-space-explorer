"""Train architecture ablations (sparsity off, lateral inhibition off, attention cortex)
and write a comparison table to checkpoints/ablations.json. CPU-heavy: ~4x a demo run."""
import argparse
import json

import _path  # noqa: F401
import torch
from app.config import CHECKPOINT_DIR, ModelConfig, TrainConfig
from app.datasets.synthetic import load_or_generate
from app.training.trainer import train

VARIANTS = {
    "default (GRU, sparse 20%, lateral inhibition)": ModelConfig(),
    "no sparsity": ModelConfig(sparsity=None),
    "no lateral inhibition": ModelConfig(lateral_inhibition=False),
    "attention cortex": ModelConfig(cortex_type="attention"),
}

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, default=400)
    ap.add_argument("--lr", type=float, default=TrainConfig.lr)
    a = ap.parse_args()
    torch.set_num_threads(2)
    ds = load_or_generate()
    rows = {}
    for name, mc in VARIANTS.items():
        print(f"== {name}")
        ck = train(ds, mc, TrainConfig(max_epochs=a.epochs, lr=a.lr), log=lambda *_: None)["checkpoint"]
        rows[name] = {k: {m: v.get(m) for m in ("loss", "receptor_mae", "descriptor_auroc_macro", "similarity_spearman")}
                      for k, v in ck["metrics"].items()}
        rows[name]["best_epoch"] = ck["best_epoch"]
        print(json.dumps(rows[name], indent=1))
    (CHECKPOINT_DIR / "ablations.json").write_text(json.dumps(rows, indent=1))
