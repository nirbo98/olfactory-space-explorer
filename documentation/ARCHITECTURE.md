# Architecture

## Ownership

| Concern | Owner | Location |
|---|---|---|
| Neural model, training, synthetic teacher, Taylor, FFT, inverse optimization | Python backend | `backend/app/` |
| Fixed reference atlas + PCA basis (fitted once per checkpoint, cached) | Python backend | `checkpoints/atlas-demo-v1.json` |
| Projection geometry for interactive views (pure linear maps) | Frontend, mirrored in backend | `frontend/src/mathematics/projection.ts` ⇄ `backend/app/mathematics/projection.py` |
| Interaction state, rendering, playback | Frontend | `frontend/src/store`, `frontend/src/components` |

The frontend never re-implements the model. Projection math exists in both languages because the 3-D view must update without a network round-trip; both are checked against the same fixture (`frontend/src/mathematics/__fixtures__/projection_fixture.json`, written by `backend/tests/test_projection.py`).

## Model (`BioOlfactoryModel`)

```
molecular features [B,N,256] ─ MolecularEncoder: Linear(256,256)→LayerNorm→GELU→Linear(256,128)
        │  (mask zeroes padding; per-component, order-independent)
        ▼
ReceptorInteractionLayer  K = Softplus(·)+k_min, ε = Sigmoid(·) from (molecule, receptor-identity) pairs
        │  r_j = g_j · Σᵢ εᵢⱼ cᵢ/Kᵢⱼ / (1 + Σᵢ cᵢ/Kᵢⱼ)        g_j = 1 − knockdown_j
        ▼  r ∈ [0,1)^64
OlfactoryBulb  r̂ = r/(1+κ·mean r);  b = Softplus(W_E r̂ − W_I r̂ + b₀)   (W_E, W_I ≥ 0)
        │  τ dh/dt = b − h, exact update h ← e^{−Δt/τ}h + (1−e^{−Δt/τ})b ; static: h = b
        ▼  [64]
PiriformCortex  GRUCell(256) → top-k sparsity (20 %) → residual MLP → LayerNorm
        │  static: settle 4 steps from rest; temporal: one step per frame from the settled rest state
        ▼  z ∈ ℝ²⁵⁶
Heads: descriptors (sigmoid, 10 synthetic labels) · intensity (softplus) · similarity (unit-norm 64-D)
```

`AttentionCortex` (causal self-attention) is a drop-in ablation (`--cortex attention`). Lateral inhibition and sparsity can be disabled at training time (`--no-lateral-inhibition`, `--no-sparsity`) or at inference time (flagged as counterfactual).

## Training

`backend/scripts/train_demo.py` — AdamW (lr 1e-4, wd 1e-4), batch 32, seed 42, early stopping (patience 60 on validation loss), best-epoch checkpoint. Loss terms are normalized by train-set scales and enabled only where labels exist:

`L = L_R + L_D + 0.5 L_S + 0.5 L_I + 0.1 L_P` where `L_P` is a fixed-point regularizer (embedding after 4 vs 8 settling steps) that makes long stimulation converge to the static embedding.

Splits: by component set (all concentration variants of a set share a split); mixtures containing any of the held-out compounds (C002, C016, C021) are excluded from training and form evaluation protocol 2.

## API (`/api/v1`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | status, model hash |
| GET | `/config` | model config, receptor ids, descriptor labels, scenarios, architecture |
| GET | `/datasets` | active dataset description + importer schema |
| GET | `/samples?split=` | reference mixtures (paged) |
| GET | `/atlas` | reference embeddings `[M,256]`, fixed projection (μ, PCA axes, scales, per-dim mean/std), clusters |
| GET | `/compounds` | virtual compounds (family, held-out flag) |
| GET | `/model/metrics` | evaluated metrics per split + training history |
| GET | `/scenarios` | temporal protocols |
| POST | `/simulate` | forward model: static outputs, baseline (no knockdown), teacher reference, trajectory |
| POST | `/project` | projection of embeddings/sample ids; optional minimum-norm lift |
| POST | `/analyze/fourier` | rFFT amplitude/power, dominant peaks, band-limited reconstruction |
| POST | `/analyze/taylor` | gradient (all components), Hessian (1–3 selected), FD check, sweeps, 2-D error map |
| POST | `/analyze/dose-response` | receptor concentration–response curves (model + teacher) |
| POST | `/inverse-design` | bounded multi-start optimization with cardinality ≤ 5, warnings |

### `/simulate` shapes (E = 256, R = 64, D = 64, H = 256, T = frame_count)

| Field | Shape |
|---|---|
| `odor_embedding` | `[E]` |
| `receptor_activities` | `[R]` |
| `bulb_activities` | `[D]` |
| `cortical_activities` | `[H]` (after sparsification) |
| `descriptor_predictions` | `{label: p}` (10) |
| `baseline.odor_embedding`, `baseline.receptor_activities` | `[E]`, `[R]` |
| `teacher_reference.receptor_activities` | `[R]` (synthetic ground truth) |
| `trajectory.times`, `stimulus`, `intensity_prediction` | `[T]` |
| `trajectory.odor_embedding` | `[T, E]` |
| `trajectory.receptor_activities` / `bulb_activities` / `cortical_activities` | `[T, R]` / `[T, D]` / `[T, H]` |

Validation: concentrations must be finite and ≥ 0, compound and receptor ids must exist, components must be unique (≤ 8), knockdowns ∈ [0,1]; violations return HTTP 422 with a message.

## Frontend state (Zustand)

| Store | Contents | Triggers model computation? |
|---|---|---|
| `datasetStore` | config, atlas embeddings (Float32Array), reference projection, metrics | — (loaded once) |
| `mixtureStore` | components, knockdowns, lateral inhibition, sparsity, scenario | **yes** (only this store) |
| `projectionStore` | mode, dims, weighted axes, scale, presets | no |
| `simulationStore` | latest result, request id, playback time/speed/loop, comparison | — |
| `selectionStore` | selected / hovered reference odor | via `selectSample` → mixture |
| `visualizationStore` | app mode, tabs, toggles, display state | no |
| `inverseDesignStore` | target, lifted Δp, search parameters, result | own request |

`services/simulationController.ts` subscribes only to `mixtureStore`; requests are debounced (150 ms), aborted when superseded, and applied only if their id is the newest. Projection sliders therefore cannot trigger model work (tested in `stores.test.tsx` and the Playwright suite).

Rendering: reference odors are a single `InstancedMesh`; numeric target positions (projection of z) are kept separately from interpolated display positions; the selected marker lerps toward the projected embedding; in time mode two neighbouring computed frames are interpolated for display while readouts show the nearest computed frame.
