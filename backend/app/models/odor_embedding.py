"""Prediction heads on the 256-D odor embedding (H_P), plus the descriptor-
interpretation interface reserved for a future language model."""
from __future__ import annotations

from abc import ABC, abstractmethod

import torch
import torch.nn.functional as F
from torch import nn


class DescriptorHead(nn.Module):
    """Probability that each (configurable) descriptor label applies."""

    def __init__(self, emb_dim: int, n_descriptors: int):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(emb_dim, 128), nn.GELU(), nn.Linear(128, n_descriptors))

    def forward(self, z):
        return torch.sigmoid(self.net(z))


class IntensityHead(nn.Module):
    def __init__(self, emb_dim: int):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(emb_dim, 64), nn.GELU(), nn.Linear(64, 1))

    def forward(self, z):
        return F.softplus(self.net(z)).squeeze(-1)


class SimilarityHead(nn.Module):
    """Projects embeddings to a unit sphere; similarity = cosine of projections."""

    def __init__(self, emb_dim: int, out_dim: int = 64):
        super().__init__()
        self.proj = nn.Linear(emb_dim, out_dim)

    def forward(self, z):
        return F.normalize(self.proj(z), dim=-1)

    @staticmethod
    def pairwise(u: torch.Tensor) -> torch.Tensor:
        return u @ u.transpose(-1, -2)


class DescriptorInterpreter(ABC):
    """Interface for a future language-model-based descriptor interpreter.

    Not implemented in the prototype on purpose: no language model is attached.
    An implementation would map (descriptor probabilities, embedding) to
    free-text interpretations and must declare its own provenance.
    """

    provenance: str = "unimplemented"

    @abstractmethod
    def interpret(self, descriptor_probs: dict[str, float], embedding: list[float]) -> str: ...
