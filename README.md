# Olfactory Space Explorer (OSE)

Interactive 3-D research prototype for exploring a **256-dimensional learned odor space** produced by a biologically inspired neural network (molecular encoder → competitive-binding receptor layer → olfactory-bulb dynamics → sparse recurrent "piriform" cortex). Hebrew RTL interface, Python/PyTorch backend, React Three Fiber frontend.

> **SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED · נתונים מדומים — לא אומתו בניסוי**
> The demo runs entirely on a deterministic synthetic teacher model. Read [`documentation/SCIENTIFIC_LIMITATIONS.md`](documentation/SCIENTIFIC_LIMITATIONS.md) before interpreting anything.

## Quick start

Requirements: Python ≥ 3.11, Node ≥ 20, ~2 CPU cores. No GPU, cloud API or proprietary data.

```bash
make bootstrap      # install deps, generate synthetic data, train the demo model (~3 min CPU)
make dev            # backend on :8000, frontend on :5173
# open http://127.0.0.1:5173
```

Or the one-liner `./scripts/bootstrap.sh` (bootstrap + dev).

### Step by step

| Step | Command |
|---|---|
| Install backend (CPU torch first, then package + dev extras) | `make install-backend` — equivalent to `pip install torch --index-url https://download.pytorch.org/whl/cpu && pip install -e "backend[dev]"` |
| Install frontend | `make install-frontend` (`cd frontend && npm ci`) |
| Generate demo data | `make data` (`cd backend && python scripts/generate_data.py`) |
| Train the demo model | `make train` (`cd backend && python scripts/train_demo.py`) — writes `checkpoints/demo-v1.pt`, `demo-v1.metrics.json`, and the fixed reference atlas `atlas-demo-v1.json` |
| Re-evaluate | `make evaluate` (both protocols + per-sample CSV) |
| Start backend | `make backend` (`cd backend && uvicorn app.main:app --port 8000`) |
| Start frontend | `make frontend` (`cd frontend && npm run dev`) |
| Production build | `make build` |
| Ablations (optional, ~15 min) | `make ablations` → `checkpoints/ablations.json` |

Optional extras: `pip install -e "backend[chem]"` (RDKit fingerprints from SMILES), `pip install -e "backend[umap]"` (UMAP helper; not invertible, so not used for dragging).

The repository already contains a trained checkpoint and atlas, so `make install && make dev` is enough to see the demo; `make train` reproduces them (seed 42).

## Tests

```bash
make test-backend    # pytest: 47 tests (model maths, dynamics, projection, Taylor, FFT, inverse bounds, training, API)
make test-frontend   # tsc + vitest: 25 tests (projection twin vs Python fixture, sliders, controller, playback)
make test-e2e        # Playwright: 8 browser scenarios on the real app (starts both servers)
make test            # all of the above
```

Playwright needs a Chromium once: `cd frontend && npx playwright install chromium`, or point `PW_CHROMIUM_PATH` to an existing binary. Screenshots are written to `frontend/e2e/screenshots/`. Latest results: [`documentation/TEST_RESULTS.md`](documentation/TEST_RESULTS.md).

## What you can do

* **Explore** — PCA view (fitted once on the reference atlas; explained variance shown), direct-dimension view with X/Y/Z sliders over `z[0…255]`, weighted axes (primary/secondary/mix, optional Gram–Schmidt), coordinate scaling, presets; colour by k-means cluster, split or family; hover tooltips, click to select, camera reset/focus, true 256-D neighbour lines.
* **Simulate** — edit the mixture (≤ 5 virtual compounds), concentrations, receptor inhibition 0–100 % / knockout, lateral inhibition and cortical sparsity. Every change re-runs the backend model; the marker moves through the fixed reference space and the baseline (no knockdown) is shown for comparison. Readouts: receptor heat-map with the synthetic teacher's values, bulb, cortex (sparse activity), latent z, synthetic descriptors and intensity.
* **Temporal** — inhalation protocols (single pulse, double, 4 Hz sniffing, ramp), 120 frames over 4 s, play/pause/scrub/loop/speed, 3-D trajectory, comparison trajectory, receptor×time heat-map, FFT with band-limited reconstruction.
* **Mathematics** — local Taylor analysis of a receptor response (autograd gradient + selected Hessian, finite-difference check, 1-D and 2-D error maps), dose–response curves vs teacher.
* **Inverse design** — choose a target odor, optionally drag it in 3-D (minimum-norm lift `Δz = P⁺Δp`), restrict allowed compounds and component count, run bounded multi-start optimization; candidates, distances, convergence, non-uniqueness and out-of-distribution warnings.
* **Dataset / Model** — provenance, splits, missing-label handling, import schema, architecture, configuration, evaluated metrics and training curves.

## Repository layout

```
backend/app/models/        molecular_encoder, receptor_layer, olfactory_bulb, piriform_cortex, odor_embedding, olfactory_model
backend/app/mathematics/   projection, dynamics, fourier, approximation (Taylor), optimization (inverse)
backend/app/datasets/      synthetic teacher + generator, schema-validated importer / data sources
backend/app/training/      trainer (losses, evaluation, checkpoints)
backend/app/simulation/    engine (atlas, simulate, analyses), scenarios
backend/app/api, schemas   FastAPI /api/v1 + Pydantic schemas
backend/scripts/           generate_data, train_demo, evaluate, run_ablations
backend/tests/             pytest suite
frontend/src/              app, components/{visualization,controls,panels,charts}, store, services, mathematics, hooks
frontend/e2e/              Playwright scenarios + screenshots
data/synthetic, data/examples, checkpoints/, documentation/
```

Details: [`ARCHITECTURE.md`](documentation/ARCHITECTURE.md) · [`DATA_SCHEMA.md`](documentation/DATA_SCHEMA.md) · [`SCIENTIFIC_LIMITATIONS.md`](documentation/SCIENTIFIC_LIMITATIONS.md) · [`TEST_RESULTS.md`](documentation/TEST_RESULTS.md)
