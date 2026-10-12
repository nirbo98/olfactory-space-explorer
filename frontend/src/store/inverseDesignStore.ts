import { create } from 'zustand'
import { api } from '../services/api'
import type { InverseResponse } from '../types/api'
import { INVERSE_UI_DEFAULT_COMPONENTS } from '../config/inverseLimits'

/** inverseDesignState — target specification and model-based optimization results. */
export interface InverseDesignState {
  targetSampleId: string | null
  baseEmbedding: number[] | null    // z of the selected target odor
  targetEmbedding: number[] | null  // possibly modified by lifting a 3-D displacement
  liftedDelta: [number, number, number]
  allowed: string[] | null          // null = all compounds
  maxComponents: number
  nStarts: number
  steps: number
  sparsityWeight: number
  status: 'idle' | 'running' | 'done' | 'error'
  error: string | null
  result: InverseResponse | null
  setTarget: (id: string, z: number[]) => void
  setModifiedTarget: (z: number[], delta: [number, number, number]) => void
  clearModification: () => void
  setParams: (p: Partial<Pick<InverseDesignState, 'maxComponents' | 'nStarts' | 'steps' | 'sparsityWeight' | 'allowed'>>) => void
  run: () => Promise<void>
}

let controller: AbortController | null = null

export const useInverseDesignStore = create<InverseDesignState>((set, get) => ({
  targetSampleId: null,
  baseEmbedding: null,
  targetEmbedding: null,
  liftedDelta: [0, 0, 0],
  allowed: null,
  maxComponents: INVERSE_UI_DEFAULT_COMPONENTS,
  nStarts: 8,
  steps: 200,
  sparsityWeight: 1e-3,
  status: 'idle',
  error: null,
  result: null,
  setTarget: (id, z) => set({ targetSampleId: id, baseEmbedding: z, targetEmbedding: z, liftedDelta: [0, 0, 0], result: null, status: 'idle' }),
  setModifiedTarget: (z, delta) => set({ targetEmbedding: z, liftedDelta: delta, result: null, status: 'idle' }),
  clearModification: () => set((s) => ({ targetEmbedding: s.baseEmbedding, liftedDelta: [0, 0, 0], result: null })),
  setParams: (p) => set(p),
  run: async () => {
    const s = get()
    if (!s.targetEmbedding) return
    controller?.abort()
    controller = new AbortController()
    set({ status: 'running', error: null })
    try {
      const result = await api.inverse({
        target_embedding: s.targetEmbedding, allowed_compounds: s.allowed, max_components: s.maxComponents,
        n_starts: s.nStarts, steps: s.steps, refine_steps: Math.round(s.steps * 0.75), sparsity_weight: s.sparsityWeight,
      }, controller.signal)
      set({ status: 'done', result })
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      set({ status: 'error', error: (e as Error).message })
    }
  },
}))
