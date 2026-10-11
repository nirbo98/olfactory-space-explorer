"""BioOlfactoryModel: the unified forward model F.

    molecular features ─► MolecularEncoder ─► ReceptorInteractionLayer ─► r
    r ─► OlfactoryBulb ─► b / h ─► PiriformCortex ─► z ∈ R^256 ─► heads

Static stimulus ([B, N] concentrations): the bulb is taken at the steady state
of its ODE (h = b) and the recurrent cortex settles for `settle_steps` steps
from rest. Temporal stimulus ([B, T, N]): receptor responses are computed per
frame, the bulb is integrated exactly with step dt, and the cortex is stepped
once per frame starting from its settled resting state (no odor).
"""
from __future__ import annotations

from dataclasses import dataclass, fields

import torch
from torch import nn

from ..config import ModelConfig
from .molecular_encoder import MolecularEncoder
from .odor_embedding import DescriptorHead, IntensityHead, SimilarityHead
from .olfactory_bulb import OlfactoryBulb
from .piriform_cortex import AttentionCortex, PiriformCortex
from .receptor_layer import ReceptorInteractionLayer


@dataclass
class ModelOutput:
    molecular_embeddings: torch.Tensor   # [B, N, mol_dim]
    receptor_activities: torch.Tensor    # [B, R]        or [B, T, R]
    bulb_activities: torch.Tensor        # [B, D]        or [B, T, D]
    cortical_activities: torch.Tensor    # [B, H]        or [B, T, H]  (after sparsification)
    odor_embedding: torch.Tensor         # [B, E]        or [B, T, E]
    descriptor_predictions: torch.Tensor # [B, n_desc]   or [B, T, n_desc]
    intensity_prediction: torch.Tensor   # [B]           or [B, T]
    similarity_projection: torch.Tensor  # [B, S]        or [B, T, S]
    binding_K: torch.Tensor              # [B, N, R]
    efficacy: torch.Tensor               # [B, N, R]
    fixed_point_gap: torch.Tensor | None = None

    def detach(self) -> "ModelOutput":
        return ModelOutput(**{f.name: (None if getattr(self, f.name) is None else getattr(self, f.name).detach())
                              for f in fields(self)})


class BioOlfactoryModel(nn.Module):
    def __init__(self, config: ModelConfig | None = None):
        super().__init__()
        self.config = cfg = config or ModelConfig()
        self.encoder = MolecularEncoder(cfg.n_features, cfg.mol_dim)
        self.receptors = ReceptorInteractionLayer(cfg.mol_dim, cfg.n_receptors, cfg.receptor_dim,
                                                  cfg.pair_hidden, cfg.k_min, cfg.eps)
        self.bulb = OlfactoryBulb(cfg.n_receptors, cfg.bulb_dim, cfg.lateral_inhibition, cfg.tau_min, cfg.tau_max)
        cortex_cls = PiriformCortex if cfg.cortex_type == "gru" else AttentionCortex
        self.cortex = cortex_cls(cfg.bulb_dim, cfg.cortex_hidden, cfg.embedding_dim, cfg.sparsity)
        self.descriptor_head = DescriptorHead(cfg.embedding_dim, cfg.n_descriptors)
        self.intensity_head = IntensityHead(cfg.embedding_dim)
        self.similarity_head = SimilarityHead(cfg.embedding_dim, cfg.similarity_dim)

    # ------------------------------------------------------------------
    def _heads(self, z):
        return self.descriptor_head(z), self.intensity_head(z), self.similarity_head(z)

    def _settle(self, b: torch.Tensor, steps: int, sparsity):
        x = b[:, None, :].expand(-1, steps, -1)
        return self.cortex(x, sparsity=sparsity)

    def forward(self, features: torch.Tensor, conc: torch.Tensor, mask: torch.Tensor,
                gain: torch.Tensor | None = None, *, lateral_inhibition: bool | None = None,
                sparsity: float | None | str = "default", dt: float | None = None,
                compute_fixed_point: bool = False) -> ModelOutput:
        cfg = self.config
        mol = self.encoder(features, mask)
        K, eff = self.receptors.binding_params(mol)
        r = self.receptors.response(conc, K, eff, mask, gain)

        if conc.dim() == 2:  # ---- static / steady state -------------------------
            b = self.bulb.drive(r, lateral_inhibition)
            steps = cfg.settle_steps * (2 if compute_fixed_point else 1)
            S, Z, _ = self._settle(b, steps, sparsity)
            k = cfg.settle_steps - 1
            z, s = Z[:, k], S[:, k]
            gap = (Z[:, -1] - z).pow(2).mean() if compute_fixed_point else None
            d, i, u = self._heads(z)
            return ModelOutput(mol, r, b, s, z, d, i, u, K, eff, gap)

        # ---- temporal -------------------------------------------------------------
        if dt is None:
            raise ValueError("dt is required for temporal input")
        b_seq = self.bulb.drive(r, lateral_inhibition)
        rest_b = self.bulb.drive(torch.zeros_like(r[:, 0]), lateral_inhibition)
        h_seq = self.bulb.integrate(b_seq, dt, h0=rest_b)
        _, _, h_rest = self._settle(rest_b, cfg.settle_steps, sparsity)
        S, Z, _ = self.cortex(h_seq, h0=h_rest, sparsity=sparsity)
        d, i, u = self._heads(Z)
        return ModelOutput(mol, r, h_seq, S, Z, d, i, u, K, eff, None)
