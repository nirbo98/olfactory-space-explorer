import { create } from 'zustand'
import type { AtlasSample, MixtureComponent } from '../types/api'

/**
 * mixtureState — every input of the scientific model (composition, receptor
 * manipulations, network switches, temporal protocol). Any change here
 * invalidates the current simulation; projection settings live elsewhere.
 */
export interface MixtureState {
  components: MixtureComponent[]
  sourceSampleId: string | null
  knockdowns: Record<string, number> // receptor id → fraction removed (0..1)
  selectedReceptor: string
  lateralInhibition: boolean | null // null = as trained
  sparsityMode: 'trained' | 'custom' | 'off'
  sparsity: number
  scenarioId: string
  durationSeconds: number
  frameCount: number
  addComponent: (id: string, c?: number) => void
  removeComponent: (id: string) => void
  setConcentration: (id: string, c: number) => void
  normalize: () => void
  reset: () => void
  loadSample: (s: AtlasSample) => void
  setMixture: (m: MixtureComponent[], source?: string | null) => void
  setKnockdown: (rid: string, frac: number) => void
  knockout: (rid: string) => void
  clearKnockdowns: () => void
  selectReceptor: (rid: string) => void
  setLateralInhibition: (v: boolean | null) => void
  setSparsityMode: (m: MixtureState['sparsityMode']) => void
  setSparsity: (v: number) => void
  setScenario: (id: string) => void
}

const INITIAL: Pick<MixtureState, 'components' | 'sourceSampleId'> = {
  components: [{ compound_id: 'C001', concentration: 0.5 }, { compound_id: 'C005', concentration: 0.2 }],
  sourceSampleId: null,
}
export const MAX_MIXTURE_COMPONENTS = 5

export const useMixtureStore = create<MixtureState>((set) => ({
  ...INITIAL,
  knockdowns: {},
  selectedReceptor: 'R003',
  lateralInhibition: null,
  sparsityMode: 'trained',
  sparsity: 0.2,
  scenarioId: 'single_pulse',
  durationSeconds: 4,
  frameCount: 120,
  addComponent: (id, c = 0.3) => set((s) => (
    s.components.some((x) => x.compound_id === id) || s.components.length >= MAX_MIXTURE_COMPONENTS
      ? s : { components: [...s.components, { compound_id: id, concentration: c }], sourceSampleId: null })),
  removeComponent: (id) => set((s) => (
    s.components.length <= 1 ? s : { components: s.components.filter((x) => x.compound_id !== id), sourceSampleId: null })),
  setConcentration: (id, c) => set((s) => ({
    components: s.components.map((x) => (x.compound_id === id ? { ...x, concentration: Math.max(0, c) } : x)),
    sourceSampleId: null,
  })),
  normalize: () => set((s) => {
    const tot = s.components.reduce((a, x) => a + x.concentration, 0)
    if (tot <= 0) return s
    return { components: s.components.map((x) => ({ ...x, concentration: +(x.concentration / tot).toFixed(4) })), sourceSampleId: null }
  }),
  reset: () => set({ ...INITIAL, components: INITIAL.components.map((c) => ({ ...c })), knockdowns: {},
    lateralInhibition: null, sparsityMode: 'trained' }),
  loadSample: (smp) => set({ components: smp.components.map((c) => ({ ...c })), sourceSampleId: smp.id }),
  setMixture: (m, source = null) => set({ components: m.map((c) => ({ ...c })), sourceSampleId: source }),
  setKnockdown: (rid, frac) => set((s) => {
    const k = { ...s.knockdowns }
    const f = Math.max(0, Math.min(1, frac))
    if (f === 0) delete k[rid]; else k[rid] = f
    return { knockdowns: k }
  }),
  knockout: (rid) => set((s) => ({ knockdowns: { ...s.knockdowns, [rid]: 1 } })),
  clearKnockdowns: () => set({ knockdowns: {} }),
  selectReceptor: (selectedReceptor) => set({ selectedReceptor }),
  setLateralInhibition: (lateralInhibition) => set({ lateralInhibition }),
  setSparsityMode: (sparsityMode) => set({ sparsityMode }),
  setSparsity: (sparsity) => set({ sparsity }),
  setScenario: (scenarioId) => set({ scenarioId }),
}))

/** Fields that feed the model. `selectedReceptor` is a UI choice and is excluded. */
export function modelInputKey(s: MixtureState): string {
  return JSON.stringify([s.components, s.knockdowns, s.lateralInhibition, s.sparsityMode,
    s.sparsityMode === 'custom' ? s.sparsity : null, s.scenarioId, s.durationSeconds, s.frameCount])
}
