import { create } from 'zustand'

export type AppMode = 'dataset' | 'model' | 'explore' | 'simulate' | 'inverse'
export type BottomTab = 'timeseries' | 'fft' | 'taylor' | 'dose' | 'metrics'
export type ColorBy = 'cluster' | 'split' | 'family'

/** visualizationState — purely visual switches. */
export interface VisualizationState {
  mode: AppMode
  bottomTab: BottomTab
  showReference: boolean
  showConnections: boolean
  showNeighbors: boolean
  showTrajectory: boolean
  showGrid: boolean
  colorBy: ColorBy
  displayState: 'steady' | 'time'
  receptorView: 'activity' | 'difference'
  cameraResetToken: number
  focusToken: number
  set: (p: Partial<Omit<VisualizationState, 'set' | 'resetCamera' | 'focusSelected'>>) => void
  resetCamera: () => void
  focusSelected: () => void
}

export const useVisualizationStore = create<VisualizationState>((set) => ({
  mode: 'explore',
  bottomTab: 'timeseries',
  showReference: true,
  showConnections: false,
  showNeighbors: true,
  showTrajectory: true,
  showGrid: true,
  colorBy: 'cluster',
  displayState: 'steady',
  receptorView: 'activity',
  cameraResetToken: 0,
  focusToken: 0,
  set: (p) => set(p),
  resetCamera: () => set((s) => ({ cameraResetToken: s.cameraResetToken + 1 })),
  focusSelected: () => set((s) => ({ focusToken: s.focusToken + 1 })),
}))
