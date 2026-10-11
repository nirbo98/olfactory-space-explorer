"""Central configuration for the Olfactory Space Explorer backend.

Every dimension used by the neural model lives here so that, e.g., the number of
simulated receptor channels can be raised from 64 to ~400 without touching the
architecture code.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Literal

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
SYNTHETIC_DIR = DATA_DIR / "synthetic"
CHECKPOINT_DIR = REPO_ROOT / "checkpoints"

MODEL_VERSION = "demo-v1"

# Synthetic descriptor axes. These are labels for *synthetic* teacher outputs,
# not measured human perceptual reports.
DEFAULT_DESCRIPTOR_LABELS: list[str] = [
    "fruity", "floral", "woody", "citrus", "green",
    "musky", "spicy", "sweet", "smoky", "minty",
]


@dataclass
class ModelConfig:
    n_features: int = 256          # molecular feature vector length
    mol_dim: int = 128             # molecular embedding (H_M)
    n_receptors: int = 64          # simulated receptor channels (H_R); can be raised to ~400
    receptor_dim: int = 64         # learned receptor identity embedding
    pair_hidden: int = 64          # hidden width of the molecule-receptor interaction MLP
    bulb_dim: int = 64             # one glomerular unit per receptor channel (H_B)
    cortex_hidden: int = 256       # piriform hidden state
    embedding_dim: int = 256       # odor embedding z (H_P)
    n_descriptors: int = len(DEFAULT_DESCRIPTOR_LABELS)
    descriptor_labels: list[str] = field(default_factory=lambda: list(DEFAULT_DESCRIPTOR_LABELS))
    similarity_dim: int = 64
    lateral_inhibition: bool = True
    sparsity: float | None = 0.2   # fraction of hidden units kept; None disables sparsification
    cortex_type: Literal["gru", "attention"] = "gru"
    settle_steps: int = 4          # recurrent settling steps for a static (steady-state) stimulus
    tau_min: float = 0.02          # s, bounds on bulb integration time constants
    tau_max: float = 0.40
    k_min: float = 1e-3            # lower bound on effective binding constants
    eps: float = 1e-6

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "ModelConfig":
        known = {k: v for k, v in d.items() if k in cls.__dataclass_fields__}
        return cls(**known)


@dataclass
class TrainConfig:
    seed: int = 42
    lr: float = 1e-4
    weight_decay: float = 1e-4
    batch_size: int = 32
    max_epochs: int = 1200
    patience: int = 60
    lambda_receptor: float = 1.0
    lambda_descriptor: float = 1.0
    lambda_similarity: float = 0.5
    lambda_intensity: float = 0.5
    lambda_fixed_point: float = 0.1  # part of L_P: settled embedding must be a stable fixed point
    grad_clip: float = 1.0

    def to_dict(self) -> dict:
        return asdict(self)


MAX_TRAINING_CONCENTRATION = 2.0   # upper end of synthetic concentration range (arbitrary units)
MAX_COMPONENTS = 5
