import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Line } from '@react-three/drei'
import * as THREE from 'three'
import { toScene, useEffectiveProjection } from '../../hooks/useProjection'
import { useSimulationStore } from '../../store/simulationStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { BASELINE, SELECTED } from '../../utils/colors'
import type { SimulateResponse } from '../../types/api'
import { sceneShared } from './sharedScene'

/**
 * Numeric scene position of the selected odor = projection of the model's embedding.
 * In time mode the two neighbouring computed frames are linearly interpolated for
 * rendering only; readouts always show the nearest computed frame.
 */
export function selectedTarget(result: SimulateResponse | null, displayState: 'steady' | 'time', time: number,
  proj: ReturnType<typeof useEffectiveProjection>): [number, number, number] | null {
  if (!result || !proj) return null
  const tr = result.trajectory
  if (displayState === 'time' && tr && tr.times.length > 1) {
    const f = Math.max(0, Math.min(tr.times.length - 1, (time - tr.times[0]) / tr.dt))
    const k0 = Math.floor(f), k1 = Math.min(k0 + 1, tr.times.length - 1), u = f - k0
    const a = toScene(tr.odor_embedding[k0], proj)!, b = toScene(tr.odor_embedding[k1], proj)!
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
  }
  return toScene(result.odor_embedding, proj)
}

export function SelectedOdorMarker() {
  const result = useSimulationStore((s) => s.result)
  const pending = useSimulationStore((s) => s.status === 'pending')
  const time = useSimulationStore((s) => s.time)
  const displayState = useVisualizationStore((s) => s.displayState)
  const proj = useEffectiveProjection()
  const group = useRef<THREE.Group>(null)
  const ring = useRef<THREE.Mesh>(null)
  const initialized = useRef(false)

  const target = selectedTarget(result, displayState, time, proj)
  const baseline = useMemo(() => {
    if (!result || result.baseline.embedding_shift_norm < 1e-6 || displayState === 'time') return null
    return toScene(result.baseline.odor_embedding, proj)
  }, [result, proj, displayState])

  useFrame((state, delta) => {
    const g = group.current
    if (!g || !target) return
    if (!initialized.current) { g.position.set(...target); initialized.current = true }
    const k = 1 - Math.exp(-delta * (displayState === 'time' ? 30 : 8))
    g.position.x += (target[0] - g.position.x) * k
    g.position.y += (target[1] - g.position.y) * k
    g.position.z += (target[2] - g.position.z) * k
    sceneShared.markerPosition = [g.position.x, g.position.y, g.position.z]
    if (ring.current) {
      const mat = ring.current.material as THREE.MeshBasicMaterial
      mat.opacity = pending ? 0.35 + 0.35 * Math.sin(state.clock.elapsedTime * 8) : 0.85
    }
  })

  if (!target) return null
  return (
    <>
      <group ref={group}>
        <mesh>
          <sphereGeometry args={[0.16, 24, 18]} />
          <meshStandardMaterial color={SELECTED} emissive={SELECTED} emissiveIntensity={0.9} />
        </mesh>
        <Billboard>
          <mesh ref={ring}>
            <ringGeometry args={[0.26, 0.31, 40]} />
            <meshBasicMaterial color={SELECTED} transparent opacity={0.85} depthWrite={false} />
          </mesh>
        </Billboard>
      </group>
      {baseline && (
        <>
          <mesh position={baseline}>
            <sphereGeometry args={[0.15, 16, 12]} />
            <meshBasicMaterial color={BASELINE} wireframe transparent opacity={0.8} />
          </mesh>
          <Line points={[baseline, target]} color={BASELINE} lineWidth={1.5} dashed dashSize={0.12} gapSize={0.08} />
        </>
      )}
    </>
  )
}
