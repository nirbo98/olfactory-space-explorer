"""Re-evaluate a saved checkpoint on every split (both evaluation protocols)."""
import argparse
import json
from pathlib import Path

import _path  # noqa: F401
from app.config import CHECKPOINT_DIR, MODEL_VERSION, TrainConfig
from app.datasets.synthetic import load_or_generate
from app.training.trainer import TensorDataset, evaluate, load_checkpoint

if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--checkpoint", type=Path, default=CHECKPOINT_DIR / f"{MODEL_VERSION}.pt")
    a = ap.parse_args()
    model, ck = load_checkpoint(a.checkpoint)
    ds = load_or_generate(seed=ck["dataset"]["seed"])
    data = TensorDataset.from_dataset(ds)
    tc = TrainConfig(**ck["train_config"])
    out = {
        "protocol_1_unseen_mixtures_of_known_components": evaluate(model, data, data.indices("test"), ck["norms"], tc),
        "protocol_2_heldout_molecular_components": evaluate(model, data, data.indices("heldout_compound"), ck["norms"], tc),
        "train": evaluate(model, data, data.indices("train"), ck["norms"], tc),
        "val": evaluate(model, data, data.indices("val"), ck["norms"], tc),
    }
    print(json.dumps(out, indent=1))

    # per-sample receptor errors (pandas) for inspection: checkpoints/<version>.per_sample_errors.csv
    import pandas as pd
    import torch
    with torch.no_grad():
        b = data.batch(range(len(data.split)))
        r = model(b["features"], b["conc"], b["mask"]).receptor_activities.numpy()
    df = pd.DataFrame({
        "sample_id": ds["sample_ids"], "split": data.split,
        "n_components": ds["mask"].sum(1),
        "receptor_mae": abs(r - ds["receptor_targets"]).mean(1),
    })
    path = a.checkpoint.with_suffix(".per_sample_errors.csv")
    df.to_csv(path, index=False)
    print(df.groupby("split")["receptor_mae"].describe().round(4).to_string())
    print(f"wrote {path}")
    print("NOTE: metrics measure agreement with a SYNTHETIC teacher, not with olfactory biology.")
