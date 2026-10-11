import { create } from 'zustand'
import { api } from '../services/api'
import { referenceFromJSON, type Reference } from '../mathematics/projection'
import type { AtlasSample, Compound, ConfigResponse, DatasetsResponse, MetricsResponse } from '../types/api'

/** datasetState — fixed reference atlas + model/dataset metadata. Loaded once; never refit on slider moves. */
export interface DatasetState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  config: ConfigResponse | null
  compounds: Compound[]
  datasets: DatasetsResponse | null
  metrics: MetricsResponse | null
  samples: AtlasSample[]
  embeddings: Float32Array | null // M × E, flat
  E: number
  reference: Reference | null
  nnDistance: { median: number; p95: number; max: number } | null
  nClusters: number
  sampleIndex: Map<string, number>
  load: () => Promise<void>
}

export const useDatasetStore = create<DatasetState>((set) => ({
  status: 'idle',
  error: null,
  config: null,
  compounds: [],
  datasets: null,
  metrics: null,
  samples: [],
  embeddings: null,
  E: 256,
  reference: null,
  nnDistance: null,
  nClusters: 6,
  sampleIndex: new Map(),
  load: async () => {
    set({ status: 'loading', error: null })
    try {
      const [config, atlas, compounds, datasets, metrics] = await Promise.all([
        api.config(), api.atlas(), api.compounds(), api.datasets(), api.metrics(),
      ])
      const E = atlas.embedding_dim
      const flat = new Float32Array(atlas.embeddings.length * E)
      atlas.embeddings.forEach((z, m) => flat.set(z, m * E))
      set({
        status: 'ready', config, compounds: compounds.compounds, datasets, metrics,
        samples: atlas.samples, embeddings: flat, E, reference: referenceFromJSON(atlas.projection),
        nnDistance: atlas.nn_distance, nClusters: atlas.n_clusters,
        sampleIndex: new Map(atlas.samples.map((s, i) => [s.id, i])),
      })
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
  },
}))

export function sampleEmbedding(index: number): Float32Array | null {
  const { embeddings, E } = useDatasetStore.getState()
  return embeddings ? embeddings.subarray(index * E, (index + 1) * E) : null
}
