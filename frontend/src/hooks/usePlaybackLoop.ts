import { useEffect } from 'react'
import { useSimulationStore } from '../store/simulationStore'

/** Advances simulated time with requestAnimationFrame while playing (decoupled from rendering and network). */
export function usePlaybackLoop() {
  const playing = useSimulationStore((s) => s.playing)
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      useSimulationStore.getState().advance(Math.min(0.1, (now - last) / 1000))
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
