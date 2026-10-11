# Data sources and import schema

## Data-source abstraction

`backend/app/datasets/importer.py` defines `DataSource` with two implementations:

* `SyntheticDataSource` — the deterministic demo (`generate_demo_dataset(seed=42)`), provenance `synthetic_teacher_model`.
* `ExperimentalDataSource(path)` — loads a JSON file validated against `ExperimentalDataset` and converts it to the training array layout with `to_arrays()`.

Nothing is downloaded automatically. Use only data whose licence permits your use, and record it in the `license` / `citation` fields.

## `ExperimentalDataset` (JSON)

| Field | Type | Notes |
|---|---|---|
| `name` | str | |
| `provenance` | `experimental` \| `literature` \| `format_example_only` | shown in the UI badge |
| `license`, `citation` | str | required / optional |
| `receptor_ids` | list[str] | e.g. OR gene symbols |
| `descriptor_labels` | list[str] | perceptual vocabulary used in the study |
| `compounds[]` | `compound_id`, `name?`, `smiles?`, `features?` | one of `smiles` (featurized with RDKit Morgan bits, optional extra `.[chem]`) or precomputed `features` |
| `mixtures[]` | see below | ≤ 5 components |

Each mixture record:

| Field | Type | Missing value handling |
|---|---|---|
| `sample_id` | str | required |
| `components[]` | `compound_id`, `concentration ≥ 0`, `unit`, `gas_phase_concentration?` | required |
| `environment` | `temperature_c?`, `relative_humidity? ∈ [0,1]`, `flow_rate_l_min?` | optional |
| `receptor_responses` | `{receptor_id: value \| null}` | absent/null → NaN (masked) |
| `assay_conditions` | str | optional |
| `descriptors` | `{label: value \| null}` | absent/null → NaN (masked) |
| `intensity`, `intensity_sd` | float | absent → NaN |
| `participant_id` | str | pseudonymous; only where ethically approved |

Validation rejects unknown compound/receptor/descriptor references, negative concentrations and more than five components. A format-only template lives in `data/examples/experimental_dataset_template.json` (it contains no measurements).

## Synthetic demo dataset (`data/synthetic/`)

* `demo_dataset.npz` — compound features `[32,256]`, mixtures `comp_idx/conc/mask [691,5]`, receptor targets `[691,64]` (with simulated assay noise) and noise-free `receptor_clean`, descriptor targets `[691,10]` (10 % rows NaN), intensity `[691]` (15 % NaN), teacher perceptual latent `[691,32]`, split labels and all teacher parameters.
* `demo_dataset.json` — ids, names, families, held-out compounds, split counts, provenance label.

Regenerate with `make data` (identical arrays for the same seed).
