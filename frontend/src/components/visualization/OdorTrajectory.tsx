import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { toScene, useEffectiveProjection } from '../../hooks/useProjection'
import { useSimulationStore } from '../../store/simulationStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { COMPARE } from '../../utils/colors'
import type { Trajectory } from '../../types/api'
import { selectedTarget } from './SelectedOdorMarker'
import { TextSprite } from './TextSprite'

function usePath(tr: Trajectory | undefined, base: [number, number, number], hot: [number, number, number]) {
  const proj = useEffectiveProjection()
  return useMemo(() => {
    if (!tr || !proj) return null
    const pts = tr.odor_embedding.map((z) => toScene(z, proj)!)
    const colors = tr.stimulus.map((s) => base.map((b, i) => b + (hot[i] - b) * Math.min(1, s)) as [number, number, number])
    return { pts, colors }
  }, [tr, proj]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** p(t) = P(z(t) − c): the projected model trajectory; brightness follows the stimulus profile. */
export function OdorTrajectory() {
  const show = useVisualizationStore((s) => s.showTrajectory)
  const displayState = useVisualizationStore((s) => s.displayState)
  const result = useSimulationStore((s) => s.result)
  const compare = useSimulationStore((s) => s.compare)
  const time = useSimulationStore((s) => s.time)
  const proj = useEffectiveProjection()
  const main = usePath(result?.trajectory, [0.25, 0.35, 0.45], [0.5, 0.9, 1.0])
  const cmp = usePath(compare?.result?.trajectory, [0.35, 0.25, 0.4], [0.85, 0.55, 0.95])
  if (!show) return null
  const cmpHead = displayState === 'time' ? selectedTarget(compare?.result ?? null, 'time', time, proj) : null
  return (
    <group>
      {main && <Line points={main.pts} vertexColors={main.colors} lineWidth={2.2} />}
      {main && (
        <group position={main.pts[0]}>
          <mesh><sphereGeometry args={[0.08, 12, 8]} /><meshBasicMaterial color="#9aa7b8" /></mesh>
          <TextSprite text="rest (t=0, no odor)" position={[0, 0.35, 0]} color="#9aa7b8" size={0.28} />
        </group>
      )}
      {cmp && <Line points={cmp.pts} vertexColors={cmp.colors} lineWidth={1.8} />}
      {cmpHead && (
        <mesh position={cmpHead}>
          <sphereGeometry args={[0.12, 16, 12]} />
          <meshStandardMaterial color={COMPARE} emissive={COMPARE} emissiveIntensity={0.7} />
        </mesh>
      )}
    </group>
  )
}
