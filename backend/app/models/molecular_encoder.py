"""Molecular encoder: H_M.

Maps a padded, variable-length *set* of molecular feature vectors to per-molecule
embeddings. The encoder is applied independently to every component (no
ordering-dependent aggregation); padding is zeroed using the validity mask so it
can never act as a physical molecule downstream.

The featurizer is decoupled from the encoder: the default demonstration uses
deterministic synthetic 256-D vectors, `RDKitFingerprintFeaturizer` produces
Morgan fingerprints from SMILES when RDKit is installed, and a graph neural
network could replace `MolecularEncoder` as long as it returns [B, N, mol_dim].
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np
import torch
from torch import nn


class MolecularEncoder(nn.Module):
    """Linear(256,256) → LayerNorm → GELU → Linear(256,128)."""

    def __init__(self, n_features: int = 256, mol_dim: int = 128):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, 256),
            nn.LayerNorm(256),
            nn.GELU(),
            nn.Linear(256, mol_dim),
        )

    def forward(self, features: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """features: [B, N, F]; mask: [B, N] (bool or 0/1). Returns [B, N, mol_dim]."""
        if features.dim() != 3:
            raise ValueError(f"features must be [B, N, F], got {tuple(features.shape)}")
        emb = self.net(features)
        return emb * mask.unsqueeze(-1).to(emb.dtype)


# ---------------------------------------------------------------------------
# Featurizers (swap-in point for real chemistry)
# ---------------------------------------------------------------------------
class Featurizer(ABC):
    n_features: int

    @abstractmethod
    def featurize(self, identifier: str) -> np.ndarray:
        """Return a float32 vector of length `n_features`."""


class LookupFeaturizer(Featurizer):
    """Looks up precomputed vectors (used for the synthetic demonstration)."""

    def __init__(self, table: dict[str, np.ndarray]):
        self.table = table
        self.n_features = len(next(iter(table.values())))

    def featurize(self, identifier: str) -> np.ndarray:
        if identifier not in self.table:
            raise KeyError(f"unknown compound id {identifier!r}")
        return np.asarray(self.table[identifier], dtype=np.float32)


class RDKitFingerprintFeaturizer(Featurizer):
    """Morgan (ECFP-like) bit fingerprint from SMILES. Optional dependency."""

    def __init__(self, n_features: int = 256, radius: int = 2):
        try:
            from rdkit import Chem  # noqa: F401
            from rdkit.Chem import rdFingerprintGenerator  # noqa: F401
        except ImportError as exc:  # pragma: no cover - optional path
            raise ImportError(
                "RDKit is not installed. Install the optional extra: pip install '.[chem]'"
            ) from exc
        self.n_features = n_features
        self.radius = radius

    def featurize(self, identifier: str) -> np.ndarray:  # pragma: no cover - optional path
        from rdkit import Chem
        from rdkit.Chem import rdFingerprintGenerator

        mol = Chem.MolFromSmiles(identifier)
        if mol is None:
            raise ValueError(f"invalid SMILES: {identifier!r}")
        gen = rdFingerprintGenerator.GetMorganGenerator(radius=self.radius, fpSize=self.n_features)
        return gen.GetFingerprintAsNumPy(mol).astype(np.float32)
