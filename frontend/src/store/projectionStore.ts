import { create } from 'zustand'
import type { ProjectionMode, ProjectionSpec, WeightedAxis } from '../mathematics/projection'

/** projectionState — the mathematical viewpoint only. Changing it never triggers model computation. */
export interface ProjectionState extends ProjectionSpec {
  scale: number
  presets: Record<string, ProjectionSpec & { scale: number }>
  setMode: (m: ProjectionMode) => void
  setDim: (axis: 0 | 1 | 2, d: number) => void
  setAxis: (axis: 0 | 1 | 2, patch: Partial<WeightedAxis>) => void
  setOrthogonalize: (v: boolean) => void
  setScale: (s: number) => void
  reset: () => void
  savePreset: (name: string) => void
  loadPreset: (name: string) => void
  deletePreset: (name: string) => void
}

const DEFAULT: ProjectionSpec & { scale: number } = {
  mode: 'pca',
  dims: [0, 1, 2],
  axes: [
    { primary: 0, secondary: 1, mix: 0 },
    { primary: 2, secondary: 3, mix: 0 },
    { primary: 4, secondary: 5, mix: 0 },
  ],
  orthogonalize: false,
  scale: 1,
}

const PRESET_KEY = 'ose.projectionPresets.v1'
function readPresets(): ProjectionState['presets'] {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) ?? '{}')
  } catch {
    return {}
  }
}
function writePresets(p: ProjectionState['presets']) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(p))
  } catch { /* storage unavailable: presets live for this session only */ }
}

const spec = (s: ProjectionState) => ({ mode: s.mode, dims: s.dims, axes: s.axes, orthogonalize: s.orthogonalize, scale: s.scale })

export const useProjectionStore = create<ProjectionState>((set, get) => ({
  ...DEFAULT,
  presets: readPresets(),
  setMode: (mode) => set({ mode }),
  setDim: (axis, d) => set((s) => {
    const dims = [...s.dims] as [number, number, number]
    dims[axis] = Math.max(0, Math.min(255, Math.round(d)))
    return { dims }
  }),
  setAxis: (axis, patch) => set((s) => {
    const axes = s.axes.map((a, i) => (i === axis ? { ...a, ...patch } : a)) as ProjectionSpec['axes']
    return { axes }
  }),
  setOrthogonalize: (orthogonalize) => set({ orthogonalize }),
  setScale: (scale) => set({ scale }),
  reset: () => set({ ...DEFAULT, axes: DEFAULT.axes.map((a) => ({ ...a })) as ProjectionSpec['axes'], dims: [0, 1, 2] }),
  savePreset: (name) => {
    const presets = { ...get().presets, [name]: JSON.parse(JSON.stringify(spec(get()))) }
    writePresets(presets)
    set({ presets })
  },
  loadPreset: (name) => {
    const p = get().presets[name]
    if (p) set(JSON.parse(JSON.stringify(p)))
  },
  deletePreset: (name) => {
    const presets = { ...get().presets }
    delete presets[name]
    writePresets(presets)
    set({ presets })
  },
}))
