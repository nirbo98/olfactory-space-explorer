import fixture from '../mathematics/__fixtures__/projection_fixture.json'
import { referenceFromJSON } from '../mathematics/projection'
import { useDatasetStore } from '../store/datasetStore'
import type { AtlasSample, SimulateResponse } from '../types/api'

export { fixture }
export const reference = referenceFromJSON(fixture.reference)
export const E = reference.E

/** Seeds the dataset store with the cross-language fixture (5 embeddings) without any network. */
export function seedDataset() {
  const Z = fixture.embeddings as number[][]
  const flat = new Float32Array(Z.length * E)
  Z.forEach((z, m) => flat.set(z, m * E))
  const samples: AtlasSample[] = Z.map((_, m) => ({
    id: `M${m}`, components: [{ compound_id: 'C001', concentration: 0.1 * (m + 1) }], split: 'train',
    group: `g${m}`, cluster: m % 3, intensity_prediction: 1, top_descriptors: [],
  }))
  useDatasetStore.setState({
    status: 'ready', embeddings: flat, E, reference, samples,
    sampleIndex: new Map(samples.map((s, i) => [s.id, i])),
  })
  return { flat, samples }
}

export function fakeResult(z: number[], withTrajectory = true): SimulateResponse {
  const T = 10
  return {
    odor_embedding: z, receptor_activities: Array(64).fill(0.1), bulb_activities: Array(64).fill(0.2),
    cortical_activities: Array(256).fill(0), descriptor_predictions: {}, intensity_prediction: 1,
    baseline: { odor_embedding: z, receptor_activities: Array(64).fill(0.1), embedding_shift_norm: 0 },
    novelty: { nearest_sample: 'M0', nearest_distance: 0, reference_nn_p95: 1, outside_reference: false },
    warnings: [], provenance: 'synthetic_model_prediction', model_version: 'demo-v1', model_status: 'trained',
    trajectory: withTrajectory ? {
      times: Array.from({ length: T }, (_, k) => k * 0.1), dt: 0.1, stimulus: Array(T).fill(1),
      scenario: { id: 'single_pulse', name: '', name_he: '', onset: 0.1, duration: 0.5, total: 1, recovery: 0.4, profile: 'pulse', frequency: null },
      odor_embedding: Array.from({ length: T }, () => z), receptor_activities: Array.from({ length: T }, () => Array(64).fill(0)),
      bulb_activities: Array.from({ length: T }, () => Array(64).fill(0)), cortical_activities: Array.from({ length: T }, () => Array(256).fill(0)),
      intensity_prediction: Array(T).fill(1),
    } : undefined,
  }
}
