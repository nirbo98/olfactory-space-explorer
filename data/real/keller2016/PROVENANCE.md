# Keller & Vosshall 2016 — provenance

**REAL HUMAN DATA.** Keller A, Vosshall LB (2016). Olfactory perception of chemically diverse molecules. *BMC Neuroscience* 17:55. doi:10.1186/s12868-016-0287-2. License: CC-BY 4.0.

Source files: pyrfume-data, commit `8054ea98ed675005ec10e67359902f500e4911b0`, folder `keller_2016/`. They are downloaded by `make fetch-real` into `raw/` (not in git) and verified against these SHA-256 hashes:

| file | sha256 |
|---|---|
| behavior.csv | `ab31c17c475c8b471706822f89aaf9e148bebe5f50f33ff03ebc42b32ac94df8` |
| molecules.csv | `5f862b6ea62dd3ee0a15138605ea2567d06a527263284348a5982844f9bec81f` |
| stimuli.csv | `49c1a6bfb8c1665a31e13f515add95a95291f29416be1bb0b54d3317efb6665b` |
| subjects.csv | `45d4d17d557982bb98ce399cf4cf07166aa38f6670c339bad266aac21583c39f` |

## Processed files (in git)

**`ratings.npz`** contains:

| array | shape | content |
|---|---|---|
| `ratings` | `[960 stimuli, 55 subjects, 22 targets]` | uint8, 255 = missing |
| `targets` | — | target names |
| `stimulus` | — | stimulus ids |
| `subject` | — | subject ids |
| `mol_id` | — | PubChem CID, or CAS when no CID resolved |
| `dilution` | — | dilution of each stimulus |
| `replicate_index` | `[2200, 2]` | stimulus and subject of each second presentation |
| `replicate_ratings` | `[2200, 22]` | ratings from the second presentation |

**`molecules.csv`** has one row per molecule: `mol_id`, CID, name, CAS, SMILES, molecular weight.

## Coding rules (`backend/app/datasets/keller.py`)

- **"I can't smell anything":** intensity is set to 0; pleasantness and descriptors are missing.
- **"I smell something":** a descriptor left unused is NA in the source, and every recorded value is ≥ 1, so it is coded 0.
- **Repeated stimuli:** the first presentation goes into `ratings`; the second goes into `replicate_*`.
- **CAS-only molecules:** CAS 109-19-0 and 3796-70-1 have no SMILES in the source. They are kept for reliability estimates and excluded from prediction.
