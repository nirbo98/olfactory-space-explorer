# Test results

Executed on 2026-10-11 in a Linux container (2 CPU cores, no GPU): Python 3.13, PyTorch 2.14.1 (CPU), Node 22, Chromium 1194 (headless, SwiftShader WebGL). All numbers below were produced by actually running the commands; nothing is hand-entered.

| Suite | Command | Result |
|---|---|---|
| Backend (pytest) | `make test-backend` | **52 passed** (9.5 s) — incl. ONNX-vs-PyTorch parity for the Pages build |
| Frontend type check | `npx tsc --noEmit -p .` | no errors |
| Frontend unit (vitest) | `npx vitest run` | **28 passed** — incl. TypeScript DFT vs numpy fixture |
| End-to-end (Playwright, real backend + frontend) | `npx playwright test` | **8 passed** (1.7 min) |
| End-to-end, static Pages build (no server, ONNX in browser) | `npx playwright test -c playwright.static.config.ts` | **2 passed** (29 s); asserts zero `/api` requests |
| Production build | `npm run build` | built |

Note: in this container Playwright's own browser download was blocked by the network policy, so the e2e run used a pre-installed Chromium via `PW_CHROMIUM_PATH`. On a normal machine run `npx playwright install chromium` once.

## End-to-end scenarios (Playwright)

```
  ✓  1 e2e/app.spec.ts:17:1 › 3-D canvas renders a populated odor space (9.0s)
  ✓  2 e2e/app.spec.ts:36:1 › Scenario 1: dimension sliders change only the projection (9.8s)
  ✓  3 e2e/app.spec.ts:56:1 › Scenario 2: concentration change recomputes the model and moves the marker (11.7s)
  ✓  4 e2e/app.spec.ts:73:1 › Scenario 3: receptor R003 knockout propagates downstream (10.4s)
  ✓  5 e2e/app.spec.ts:88:1 › Scenario 4: temporal playback, pause and reset (15.7s)
  ✓  6 e2e/app.spec.ts:107:1 › Scenario 5: Taylor analysis on two components (9.7s)
  ✓  7 e2e/app.spec.ts:118:1 › Scenario 6: inverse design returns bounded candidates (23.0s)
  ✓  8 e2e/app.spec.ts:132:1 › Inverse target dragging lifts a 3-D displacement into the latent target (14.4s)
  8 passed (1.8m)
```

Screenshots from this run: [`screenshots/`](screenshots/) (01 explore/PCA … 10 inverse drag).

What the e2e tests assert: the WebGL canvas contains rendered points; moving the X dimension slider to 17 changes the selected point's X coordinate while Y and Z stay identical **and no `/simulate` request is issued**; a concentration change issues a `/simulate` request with the new value and moves the marker; knocking out R003 sends `{R003: 1}`, zeroes R003 and yields a non-zero embedding shift vs baseline; playback advances, pause freezes, reset returns to t = 0; the FFT panel reports dominant frequencies; the Taylor endpoint returns a Hessian; inverse design returns candidates; dragging the target's X handle produces a lifted target with Δp along X only.

## Backend tests (pytest)

- test_analysis.py::test_taylor_derivatives_match_finite_differences PASSED
- test_analysis.py::test_second_order_is_better_locally PASSED
- test_analysis.py::test_fft_identifies_known_frequencies PASSED
- test_analysis.py::test_inverse_optimization_respects_bounds PASSED
- test_api.py::test_health_and_config PASSED
- test_api.py::test_atlas_and_compounds PASSED
- test_api.py::test_simulate_shapes_and_provenance PASSED
- test_api.py::test_simulate_validation PASSED
- test_api.py::test_concentration_change_moves_embedding PASSED
- test_api.py::test_receptor_knockout_R003 PASSED
- test_api.py::test_atlas_sample_reproduces_reference_embedding PASSED
- test_api.py::test_project_and_lift PASSED
- test_api.py::test_fourier_taylor_dose_inverse PASSED
- test_data_training.py::test_dataset_is_deterministic_and_sized PASSED
- test_data_training.py::test_teacher_zero_and_bounds PASSED
- test_data_training.py::test_no_leakage_between_splits PASSED
- test_data_training.py::test_missing_labels_are_masked_not_zeroed PASSED
- test_data_training.py::test_short_training_run_reduces_validation_loss PASSED
- test_dynamics.py::test_exact_integration_stable_for_large_steps PASSED
- test_dynamics.py::test_converges_to_constant_input PASSED
- test_dynamics.py::test_euler_is_unstable_where_exact_is_not PASSED
- test_dynamics.py::test_model_temporal_trajectory_is_stable PASSED
- test_importer.py::test_template_validates_and_keeps_missing_as_nan PASSED
- test_importer.py::test_unknown_compound_rejected PASSED
- test_importer.py::test_negative_concentration_rejected PASSED
- test_projection.py::test_pca_returns_three_coordinates PASSED
- test_projection.py::test_same_embedding_same_point PASSED
- test_projection.py::test_projection_does_not_mutate_embeddings PASSED
- test_projection.py::test_direct_mode_selects_dimensions PASSED
- test_projection.py::test_weighted_orthogonalization PASSED
- test_projection.py::test_minimum_norm_lift_reproduces_displacement[pca-params0] PASSED
- test_projection.py::test_minimum_norm_lift_reproduces_displacement[direct-params1] PASSED
- test_projection.py::test_minimum_norm_lift_reproduces_displacement[weighted-params2] PASSED
- test_projection.py::test_write_frontend_fixture PASSED
- test_receptor_layer.py::test_receptor_output_shape PASSED
- test_receptor_layer.py::test_zero_concentration_gives_zero_receptor_response PASSED
- test_receptor_layer.py::test_negative_concentrations_rejected PASSED
- test_receptor_layer.py::test_receptor_outputs_finite[1e-09] PASSED
- test_receptor_layer.py::test_receptor_outputs_finite[1.0] PASSED
- test_receptor_layer.py::test_receptor_outputs_finite[1000.0] PASSED
- test_receptor_layer.py::test_receptor_outputs_finite[1000000.0] PASSED
- test_receptor_layer.py::test_receptor_responses_bounded PASSED
- test_receptor_layer.py::test_component_order_invariance PASSED
- test_receptor_layer.py::test_padding_is_not_a_molecule PASSED
- test_receptor_layer.py::test_knockout_zeroes_receptor_and_changes_downstream PASSED
- test_receptor_layer.py::test_inference_is_deterministic PASSED
- test_receptor_layer.py::test_lateral_inhibition_and_sparsity_switches PASSED

## Frontend unit tests (vitest)

- ✓ src/store/stores.test.tsx > dimension sliders (projection only) > X dimension slider updates only X coordinates
- ✓ src/store/stores.test.tsx > dimension sliders (projection only) > Y dimension slider updates only Y coordinates
- ✓ src/store/stores.test.tsx > dimension sliders (projection only) > Z dimension slider updates only Z coordinates
- ✓ src/store/stores.test.tsx > dimension sliders (projection only) > X dimension 17 equals the standardized latent coordinate
- ✓ src/store/stores.test.tsx > dimension sliders (projection only) > shows a degeneracy warning for repeated dimensions
- ✓ src/store/stores.test.tsx > simulation controller > concentration changes trigger a new model prediction
- ✓ src/store/stores.test.tsx > simulation controller > projection-only changes do not call the simulation endpoint
- ✓ src/store/stores.test.tsx > simulation controller > debounces bursts and ignores stale responses
- ✓ src/store/stores.test.tsx > simulation controller > receptor knockout is sent to the model
- ✓ src/store/stores.test.tsx > temporal playback > playback advances the timeline
- ✓ src/store/stores.test.tsx > temporal playback > pause freezes the displayed simulation time
- ✓ src/store/stores.test.tsx > temporal playback > reset returns to the initial state
- ✓ src/store/stores.test.tsx > temporal playback > stops at the end unless looping
- ✓ src/store/stores.test.tsx > selected odor marker > corresponds to the projection of the returned embedding
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > pca: coordinates match the Python reference
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > pca: minimum-norm lift matches pinv in Python and reproduces Δp
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > direct: coordinates match the Python reference
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > direct: minimum-norm lift matches pinv in Python and reproduces Δp
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > weighted: coordinates match the Python reference
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > weighted: minimum-norm lift matches pinv in Python and reproduces Δp
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > PCA projection returns three coordinates and is deterministic
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > projection never mutates embeddings
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > flags degenerate direct selections
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > symmetric 3×3 eigen-decomposition reconstructs the matrix
- ✓ src/mathematics/projection.test.ts > projection (TypeScript twin of backend projection.py) > reference dimension is 256

## Trained demo model — evaluated metrics (`checkpoints/demo-v1.metrics.json`)

Training: AdamW, lr 1e-4, batch 32, seed 42; early stopping at epoch 514, best epoch 454 (180.7 s on 2 CPU cores). Metrics compare the student with the **synthetic teacher**; they say nothing about biology.

| Split | n | Receptor MAE | Mean-predictor MAE | Receptor R² | Descriptor MAE | Descriptor AUROC | Intensity MAE | Intensity r | Similarity ρ |
|---|---|---|---|---|---|---|---|---|---|
| Train | 341 | 0.0307 | 0.1665 | 0.955 | 0.041 | 0.985 | 0.028 | 0.999 | 0.984 |
| Validation | 78 | 0.0343 | 0.1706 | 0.945 | 0.094 | 0.922 | 0.049 | 0.988 | 0.939 |
| Protocol 1: unseen mixtures of known components | 78 | 0.0345 | 0.1684 | 0.937 | 0.083 | 0.928 | 0.045 | 0.994 | 0.921 |
| Protocol 2: held-out compounds (C002, C016, C021) | 194 | 0.0505 | 0.1616 | 0.860 | 0.104 | 0.873 | 0.078 | 0.978 | 0.900 |

AUROC binarizes synthetic descriptor probabilities at 0.5. Similarity ρ is the Spearman correlation between student and teacher pairwise cosine similarities within a split.

## Ablations (`make ablations`, `checkpoints/ablations.json`)

Single seed, 400-epoch budget (most runs were still improving when the budget ended), so differences of a few thousandths are not meaningful.

| Variant | Best epoch | Receptor MAE — unseen mixtures | Receptor MAE — held-out compounds | Desc. AUROC (unseen / held-out) | Similarity ρ (unseen / held-out) |
|---|---|---|---|---|---|
| Default (GRU, 20 % sparse, lateral inhibition) | 390 | 0.0361 | 0.0503 | 0.923 / 0.869 | 0.931 / 0.900 |
| No sparsity | 395 | 0.0447 | 0.0597 | 0.925 / 0.885 | 0.913 / 0.869 |
| No lateral inhibition | 390 | 0.0343 | 0.0487 | 0.926 / 0.886 | 0.926 / 0.896 |
| Attention cortex | 347 | 0.0372 | 0.0487 | 0.921 / 0.883 | 0.917 / 0.908 |

On this synthetic task the sparse cortex lowered receptor error relative to the dense variant; lateral inhibition did not help. With one seed this is a hint for follow-up, not a finding.

## Additional checks on the trained model

* Temporal consistency: for C001 0.5 + C005 0.2 under the single-pulse protocol, the trajectory comes within 0.43 (L2, ℝ²⁵⁶) of the static embedding during stimulation, versus a median nearest-neighbour distance of 4.4 in the reference atlas.
* Fourier: under the 4 Hz sniffing protocol the receptor signal's spectrum shows a peak at 4.00 Hz (alongside the 0.25 Hz envelope of the 2.5 s stimulation window).
* Taylor: autograd vs central finite differences agree to < 1e-5 (gradient) and < 1e-3 (Hessian) in the tests; in the app (receptor R020, C001 + C005) they agreed to 3e-11 / 2e-8 (screenshot 07).
