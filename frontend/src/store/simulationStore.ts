import { create } from 'zustand'
import type { SimulateResponse } from '../types/api'

/** simulationState — latest model output for the current inputs + temporal playback. */
export interface SimulationState {
  status: 'idle' | 'pending' | 'ready' | 'error'
  stale: boolean
  error: string | null
  result: SimulateResponse | null
  requestId: number
  compare: { sampleId: string; result: SimulateResponse | null } | null
  time: number
  playing: boolean
  speed: number
  loop: boolean
  setTime: (t: number) => void
  play: () => void
  pause: () => void
  resetTime: () => void
  setSpeed: (s: number) => void
  setLoop: (l: boolean) => void
  advance: (dtSeconds: number) => void
  setCompare: (id: string | null) => void
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  status: 'idle',
  stale: true,
  error: null,
  result: null,
  requestId: 0,
  compare: null,
  time: 0,
  playing: false,
  speed: 1,
  loop: false,
  setTime: (time) => set({ time: Math.max(0, time) }),
  play: () => {
    const tr = get().result?.trajectory
    if (tr && get().time >= tr.times[tr.times.length - 1]) set({ time: 0 })
    set({ playing: true })
  },
  pause: () => set({ playing: false }),
  resetTime: () => set({ time: 0, playing: false }),
  setSpeed: (speed) => set({ speed }),
  setLoop: (loop) => set({ loop }),
  advance: (dt) => {
    const s = get()
    const tr = s.result?.trajectory
    if (!s.playing || !tr) return
    const end = tr.times[tr.times.length - 1]
    let t = s.time + dt * s.speed
    if (t >= end) {
      if (s.loop) t = t % end
      else { set({ time: end, playing: false }); return }
    }
    set({ time: t })
  },
  setCompare: (id) => set({ compare: id ? { sampleId: id, result: null } : null }),
}))

/** Index of the computed frame displayed for the current time (nearest sample, never interpolated). */
export function frameIndex(times: number[], t: number): number {
  if (!times.length) return 0
  const dt = times.length > 1 ? times[1] - times[0] : 1
  return Math.max(0, Math.min(times.length - 1, Math.round((t - times[0]) / dt)))
}
