"""Pydantic request/response schemas for /api/v1.

Array shapes (E = embedding_dim = 256, R = n_receptors = 64, D = bulb_dim = 64,
H = cortex_hidden = 256, T = frame_count):

  odor_embedding        [E]          trajectory.odor_embedding       [T, E]
  receptor_activities   [R]          trajectory.receptor_activities  [T, R]
  bulb_activities       [D]          trajectory.bulb_activities      [T, D]
  cortical_activities   [H]          trajectory.cortical_activities  [T, H]
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MixtureComponent(BaseModel):
    compound_id: str = Field(..., examples=["C001"])
    concentration: float = Field(..., ge=0.0, le=100.0, description="non-negative, arbitrary units")


class SimulateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mixture: list[MixtureComponent] = Field(..., min_length=1, max_length=8)
    receptor_knockdowns: dict[str, float] = Field(
        default_factory=dict,
        description="receptor id → fraction of activity removed (0 = intact, 1 = full knockout)")
    duration_seconds: float = Field(4.0, gt=0, le=30)
    frame_count: int = Field(120, ge=8, le=600)
    scenario_id: str = "single_pulse"
    lateral_inhibition: bool | None = Field(None, description="None = as trained")
    sparsity: float | None = Field(None, ge=0.01, le=1.0, description="kept fraction; None = as trained")
    disable_sparsity: bool = False
    include_trajectory: bool = True

    @field_validator("receptor_knockdowns")
    @classmethod
    def _kd_range(cls, v):
        for k, x in v.items():
            if not 0.0 <= x <= 1.0:
                raise ValueError(f"knockdown for {k} must be within [0, 1]")
        return v


class ProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    embeddings: list[list[float]] | None = None
    sample_ids: list[str] | None = None
    mode: Literal["pca", "direct", "weighted"] = "pca"
    params: dict = Field(default_factory=dict)
    lift_from: list[float] | None = Field(None, description="base embedding z for lifting a 3-D displacement")
    lift_delta: list[float] | None = Field(None, min_length=3, max_length=3, description="Δp in view units")


class FourierRequest(BaseModel):
    signal: list[float] = Field(..., min_length=4, max_length=100_000)
    sample_spacing: float = Field(..., gt=0)
    band: tuple[float, float] | None = None
    remove_mean: bool = True
    units: str = "s"


class TaylorRequest(BaseModel):
    mixture: list[MixtureComponent] = Field(..., min_length=1, max_length=8)
    receptor_id: str = "R001"
    selected: list[str] = Field(..., min_length=1, max_length=3)
    receptor_knockdowns: dict[str, float] = Field(default_factory=dict)
    direction: list[float] | None = None
    span: float = Field(1.0, gt=0, le=5)


class DoseResponseRequest(BaseModel):
    compound_id: str
    base_mixture: list[MixtureComponent] = Field(default_factory=list, max_length=7)
    n_points: int = Field(40, ge=5, le=200)


class InverseDesignRequest(BaseModel):
    target_sample_id: str | None = None
    target_embedding: list[float] | None = None
    allowed_compounds: list[str] | None = None
    max_components: int = Field(5, ge=1, le=5, description="maximum number of components in a candidate mixture (1-5). The interactive UI defaults to 3; the static Pages build shows results precomputed with 3.")
    n_starts: int = Field(8, ge=1, le=32)
    steps: int = Field(200, ge=10, le=2000)
    refine_steps: int = Field(150, ge=0, le=2000)
    sparsity_weight: float = Field(1e-3, ge=0, le=10)
    seed: int = 0
