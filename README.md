# Olfactory Space Explorer (OSE)

Interactive 3-D research prototype for exploring a **256-dimensional learned odor space** produced by a biologically inspired neural network (molecular encoder → competitive-binding receptor layer → olfactory-bulb dynamics → sparse recurrent "piriform" cortex). Hebrew RTL interface, Python/PyTorch backend, React Three Fiber frontend.

> **SIMULATED DATA — NOT EXPERIMENTALLY VALIDATED · נתונים מדומים — לא אומתו בניסוי**
> The demo runs entirely on a deterministic synthetic teacher model. Read [`documentation/SCIENTIFIC_LIMITATIONS.md`](documentation/SCIENTIFIC_LIMITATIONS.md) before interpreting anything.
>
> **Real-data check (Keller & Vosshall 2016, 55 subjects, 478 molecules, pre-registered):** on held-out chemical scaffolds the OSE architecture reaches mean r = 0.10. A random forest on RDKit descriptors reaches 0.45 and a plain MLP 0.19, and the noise-ceiling median is 0.84. The biologically structured model does **not** beat standard chemistry baselines. See [`VALIDATION_KELLER2016_HE.md`](documentation/VALIDATION_KELLER2016_HE.md).

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
| Real-data validation (optional, ~7 min, needs RDKit) | `make fetch-real` (download + SHA-256 check of Keller 2016) then `make benchmark` → `checkpoints/keller-benchmark.json`; `make export-validation` copies it into the static build |

`make install-backend` now includes the `chem` extra (RDKit, needed for the validation benchmark); `make` uses `backend/.venv` automatically when it exists. Optional: `pip install -e "backend[umap]"` (UMAP helper; not invertible, so not used for dragging).

The repository already contains a trained checkpoint and atlas, so `make install && make dev` is enough to see the demo; `make train` reproduces them (seed 42).

## GitHub Pages (static build)

GitHub Pages cannot run the Python server, so the Pages build runs the **same trained checkpoint in the browser**: `make export-static` exports the model to two ONNX graphs (static and 120-frame temporal; parity with PyTorch is tested in `backend/tests/test_onnx_export.py`) plus the atlas, metrics and teacher references into `frontend/public/static/`, and `npm run build:pages` builds a site that uses onnxruntime-web instead of `/api/v1`. On every push to `main`, `.github/workflows/pages.yml` builds and deploys it (Settings → Pages → Source: *GitHub Actions*).

What differs from the local app: simulation, knockouts, ablation switches, playback, FFT (TypeScript DFT checked against numpy) and dose–response run live in the browser; **Taylor analysis** (needs autograd) is precomputed for the default mixture C001 0.5 + C005 0.2 across all 64 receptors, and **inverse design** (gradient-based) is precomputed for 12 target odors with fixed search settings (exactly 3 components, 8 starts, 200 steps; the controls are locked to these values there). Target dragging, custom Taylor configurations and custom search parameters require the local backend. Simulation duration is fixed at 4 s / 120 frames.

## Tests

```bash
make test-backend    # pytest: 62 tests (model maths, dynamics, projection, Taylor, FFT, inverse bounds, training, API, real-data validation)
make test-frontend   # tsc + vitest: 35 tests (projection and DFT twins vs Python fixtures, sliders, controller, playback, validation report, tab keys)
make test-e2e        # Playwright: 10 scenarios on the full app + 4 on the static Pages build
make test            # all of the above
```

Playwright needs a Chromium once: `cd frontend && npx playwright install chromium`, or point `PW_CHROMIUM_PATH` to an existing binary. Screenshots are written to `frontend/e2e/screenshots/`. Latest results: [`documentation/TEST_RESULTS.md`](documentation/TEST_RESULTS.md).

## What you can do

* **Explore** — PCA view (fitted once on the reference atlas; explained variance shown), direct-dimension view with X/Y/Z sliders over `z[0…255]`, weighted axes (primary/secondary/mix, optional Gram–Schmidt), coordinate scaling, presets; colour by k-means cluster, split or family; hover tooltips, click to select, camera reset/focus, true 256-D neighbour lines.
* **Simulate** — edit the mixture (≤ 5 virtual compounds), concentrations, receptor inhibition 0–100 % / knockout, lateral inhibition and cortical sparsity. Every change re-runs the backend model; the marker moves through the fixed reference space and the baseline (no knockdown) is shown for comparison. Readouts: receptor heat-map with the synthetic teacher's values, bulb, cortex (sparse activity), latent z, synthetic descriptors and intensity.
* **Temporal** — inhalation protocols (single pulse, double, 4 Hz sniffing, ramp), 120 frames over 4 s, play/pause/scrub/loop/speed, 3-D trajectory, comparison trajectory, receptor×time heat-map, FFT with band-limited reconstruction.
* **Mathematics** — local Taylor analysis of a receptor response (autograd gradient + selected Hessian, finite-difference check, 1-D and 2-D error maps), dose–response curves vs teacher.
* **Inverse design** — choose a target odor, optionally drag it in 3-D (minimum-norm lift `Δz = P⁺Δp`), restrict allowed compounds and the maximum number of components (API: 1–5, default 5; UI default 3, adjustable up to 5), run bounded multi-start optimization; candidates, distances, convergence, non-uniqueness and out-of-distribution warnings.
* **Dataset / Model** — provenance, splits, missing-label handling, import schema, architecture, configuration, evaluated metrics and training curves.
* **Validation (אימות מדעי)** — the pre-registered Keller 2016 benchmark: noise ceilings, per-descriptor dot plot (OSE vs. the best baseline, with 95 % CIs), hypothesis verdicts, dose test, scaffold vs. random split, full table.

## Repository layout

```
backend/app/models/        molecular_encoder, receptor_layer, olfactory_bulb, piriform_cortex, odor_embedding, olfactory_model
backend/app/mathematics/   projection, dynamics, fourier, approximation (Taylor), optimization (inverse)
backend/app/datasets/      synthetic teacher + generator, schema-validated importer, Keller 2016 loader
backend/app/validation/    noise ceilings, features/scaffolds, folds, baselines, OSE adapter, benchmark
backend/app/training/      trainer (losses, evaluation, checkpoints)
backend/app/simulation/    engine (atlas, simulate, analyses), scenarios
backend/app/api, schemas   FastAPI /api/v1 + Pydantic schemas
backend/scripts/           generate_data, train_demo, evaluate, run_ablations
backend/tests/             pytest suite
frontend/src/              app, components/{visualization,controls,panels,charts}, store, services, mathematics, hooks
frontend/e2e/              Playwright scenarios + screenshots
data/synthetic, data/examples, data/real/keller2016 (processed, CC-BY), checkpoints/, documentation/
```

Scientific background (Hebrew): [`OLFACTION_LITERATURE_REVIEW_HE.md`](documentation/OLFACTION_LITERATURE_REVIEW_HE.md) · Code-to-math explanation (Hebrew): [`COMPUTATION_EXPLAINED_HE.md`](documentation/COMPUTATION_EXPLAINED_HE.md). The application also includes a **מדע וחישובים** research tab.

Details: [`ARCHITECTURE.md`](documentation/ARCHITECTURE.md) · [`DATA_SCHEMA.md`](documentation/DATA_SCHEMA.md) · [`SCIENTIFIC_LIMITATIONS.md`](documentation/SCIENTIFIC_LIMITATIONS.md) · [`TEST_RESULTS.md`](documentation/TEST_RESULTS.md)
