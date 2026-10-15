// Shapes mirror backend/app/schemas/api.py. E = 256, R = 64, D = 64, H = 256, T = frame_count.

export type Provenance =
  | 'synthetic_model_prediction'
  | 'untrained_random_weights'
  | 'synthetic_teacher_ground_truth'
  | 'experimental'

export interface MixtureComponent {
  compound_id: string
  concentration: number
}

export interface Scenario {
  id: string
  name: string
  name_he: string
  onset: number
  duration: number
  total: number
  recovery: number
  profile: 'pulse' | 'double' | 'sniff' | 'ramp'
  frequency: number | null
}

export interface ConfigResponse {
  model_version: string
  model_status: 'trained' | 'untrained'
  provenance: Provenance
  model_config: {
    n_features: number
    mol_dim: number
    n_receptors: number
    bulb_dim: number
    cortex_hidden: number
    embedding_dim: number
    sparsity: number | null
    lateral_inhibition: boolean
    cortex_type: string
    settle_steps: number
    tau_min: number
    tau_max: number
  }
  receptor_ids: string[]
  descriptor_labels: string[]
  max_training_concentration: number
  scenarios: Scenario[]
  architecture: { stage: string; space: string; shape: number[] }[]
  training: null | { best_epoch: number; epochs_run: number; training_seconds: number; train_config: Record<string, number> }
}

export interface AtlasSample {
  id: string
  components: MixtureComponent[]
  split: 'train' | 'val' | 'test' | 'heldout_compound'
  group: string
  cluster: number
  intensity_prediction: number
  top_descriptors: string[]
}

export interface ReferenceProjectionJSON {
  mean: number[]
  pca_components: number[][]
  pca_scale: number[]
  explained_variance_ratio: number[]
  dim_mean: number[]
  dim_std: number[]
}

export interface AtlasResponse {
  model_hash: string
  model_version: string
  provenance: Provenance
  embedding_dim: number
  embeddings: number[][]
  samples: AtlasSample[]
  projection: ReferenceProjectionJSON
  nn_distance: { median: number; p95: number; max: number }
  n_clusters: number
}

export interface Compound {
  compound_id: string
  name: string
  family: string
  heldout: boolean
  n_features: number
}

export interface Novelty {
  nearest_sample: string
  nearest_distance: number
  reference_nn_p95: number
  outside_reference: boolean
}

export interface Trajectory {
  times: number[]
  dt: number
  stimulus: number[]
  scenario: Scenario
  odor_embedding: number[][]       // [T, E]
  receptor_activities: number[][]  // [T, R]
  bulb_activities: number[][]      // [T, D]
  cortical_activities: number[][]  // [T, H]
  intensity_prediction: number[]   // [T]
}

export interface SimulateResponse {
  odor_embedding: number[]
  receptor_activities: number[]
  bulb_activities: number[]
  cortical_activities: number[]
  descriptor_predictions: Record<string, number>
  intensity_prediction: number
  baseline: { odor_embedding: number[]; receptor_activities: number[]; embedding_shift_norm: number }
  novelty: Novelty
  warnings: string[]
  provenance: Provenance
  model_version: string
  model_status: string
  teacher_reference?: {
    provenance: 'synthetic_teacher_ground_truth'
    receptor_activities: number[]
    descriptor_targets: Record<string, number>
    intensity: number
  }
  trajectory?: Trajectory
}

export interface SimulateRequest {
  mixture: MixtureComponent[]
  receptor_knockdowns: Record<string, number>
  duration_seconds: number
  frame_count: number
  scenario_id: string
  lateral_inhibition: boolean | null
  sparsity: number | null
  disable_sparsity: boolean
  include_trajectory: boolean
}

export interface MetricsBlock {
  n: number
  loss?: number
  loss_terms?: Record<string, number>
  receptor_mae?: number
  receptor_rmse?: number
  receptor_r2?: number
  receptor_mae_mean_baseline?: number
  descriptor_mae?: number
  descriptor_auroc_macro?: number | null
  intensity_mae?: number
  intensity_pearson?: number
  similarity_pearson?: number
  similarity_spearman?: number
}

export interface MetricsResponse {
  model_status: string
  metrics: null | Record<'train' | 'val' | 'test_unseen_mixtures' | 'test_heldout_compounds', MetricsBlock>
  history: { epoch: number; train_loss: number; val_loss: number; val_receptor_mae: number }[]
  best_epoch?: number
  dataset?: { provenance: string; seed: number; heldout_compounds: string[]; split_counts: Record<string, number> }
  note: string
}

export interface ExperimentalDatasetInfo {
  id: string
  kind: 'experimental'
  provenance: string
  label: string
  label_he: string
  citation: string
  license: string
  role: 'validation'
}

export interface DatasetsResponse {
  active: string
  /** datasets[0] is always the synthetic demo; real datasets follow in `validation_datasets`. */
  validation_datasets?: ExperimentalDatasetInfo[]
  datasets: {
    id: string
    kind: string
    provenance: string
    label: string
    label_he: string
    seed: number
    n_compounds: number
    n_receptors: number
    n_mixtures: number
    split_counts: Record<string, number>
    heldout_compounds: string[]
    descriptor_labels: string[]
    missing_labels: { descriptor_rows: number; intensity: number }
  }[]
  experimental_import: { schema: string; example: string; loaded: string[] }
}

export interface FourierResponse {
  frequencies: number[]
  amplitude: number[]
  power: number[]
  dominant: { frequency: number; amplitude: number }[]
  sampling_rate: number
  nyquist: number
  frequency_resolution: number
  n_samples: number
  reconstruction?: number[]
  reconstruction_rmse?: number
  band?: [number, number]
  frequency_units: string
}

export interface TaylorResponse {
  receptor_id: string
  f0: number
  gradient: number[]
  gradient_fd: number[]
  hessian: number[][]
  hessian_fd: number[][]
  max_gradient_fd_error: number
  max_hessian_fd_error: number
  components: string[]
  selected_ids: string[]
  direction: number[]
  sweep: {
    s: number[]
    actual: number[]
    first_order: number[]
    second_order: number[]
    abs_error_first: number[]
    abs_error_second: number[]
  }
  rmse_first: number
  rmse_second: number
  grid?: { delta_a: number[]; delta_b: number[]; actual: number[][]; abs_error_second: number[][] }
}

export interface DoseResponse {
  compound_id: string
  concentrations: number[]
  receptor_activities: number[][]
  teacher_receptor_activities?: number[][]
  training_range_max: number
}

export interface InverseCandidate {
  start: number
  components: MixtureComponent[]
  distance: number
  embedding: number[]
  on_bound: string[]
  novelty: Novelty
  uses_heldout_compounds: string[]
}

export interface InverseResponse {
  candidates: InverseCandidate[]
  history: number[][]
  phase1_steps: number
  c_max: number
  target_embedding: number[]
  target_novelty: Novelty
  warnings: string[]
  distinct_solutions_near_best: number
  reference_nn_median: number
  provenance: string
  model_status: string
}

// ── real-data validation (backend/app/validation/benchmark.py, schema ose.validation.v1) ──
export type Interval = [number | null, number | null]
export interface TargetScore { r: number | null; ci: Interval; frac_ceiling: number | null }
export interface DoseScore {
  sign_agreement: number; ci: Interval; n: number; r_delta: number | null; observed_increase_fraction: number | null
}
export interface Delta { vs: string; delta_mean_r: number; ci: Interval }
export interface Verdict {
  supported: boolean
  outcome?: 'ose_better' | 'ose_worse' | 'no_detectable_difference'
  evidence: Record<string, unknown>
  /** annotation added after the first run — never changes `supported` */
  post_hoc?: { majority_rate: number | null; beats_majority: boolean; note: string }
}
export interface ProtocolResult {
  per_target: Record<string, Record<string, TargetScore>>
  summary: Record<string, { mean_r: number; mean_r_ci: Interval; mean_frac_ceiling: number }>
  dose: Record<string, DoseScore>
  verdicts: Record<string, Verdict> | null
  deltas: Record<string, Delta>
  n_folds: number
}
export interface Ceiling {
  r_half: number; r_half_sd: number; reliability: number; ceiling: number; n_splits: number
  test_retest: { r: number | null; n_pairs: number } | null
}
export interface ValidationResponse {
  schema: 'ose.validation.v1'
  dataset: {
    id: string; kind: string; provenance: string; citation: string; license: string; doi: string; source: string
    n_subjects: number; n_stimuli: number; n_molecules_total: number; n_molecules_used: number; n_scaffold_groups: number
    targets: string[]; coding_rules: string[]
  }
  metric: string
  models: Record<string, string>
  protocol_labels: Record<string, string>
  ceilings: Record<string, Ceiling>
  protocols: Record<string, ProtocolResult>
  config: Record<string, unknown>
  environment: Record<string, unknown>
}
