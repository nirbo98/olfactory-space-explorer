import { Line } from '@react-three/drei'
import { useDatasetStore } from '../../store/datasetStore'
import { useProjectionStore } from '../../store/projectionStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { axisLabel } from '../../mathematics/projection'
import { AXIS_LENGTH as L } from './sharedScene'
import { SCENE_UNIT } from '../../hooks/useProjection'
import { TextSprite } from './TextSprite'

export const AXIS_COLORS = ['#c46a6a', '#6fae78', '#6a8fd0']

export function ProjectionAxes() {
  const spec = useProjectionStore()
  const ref = useDatasetStore((s) => s.reference)
  const showGrid = useVisualizationStore((s) => s.showGrid)
  const unit = SCENE_UNIT * spec.scale
  const ends: [number, number, number][] = [[L, 0, 0], [0, L, 0], [0, 0, L]]
  return (
    <group>
      {showGrid && <gridHelper args={[2 * L, 12, '#24303d', '#18212b']} position={[0, -L, 0]} />}
      {showGrid && <gridHelper args={[2 * L, 12, '#1d2732', '#141b23']} position={[0, 0, -L]} rotation={[Math.PI / 2, 0, 0]} />}
      {ends.map((e, k) => (
        <group key={k}>
          <Line points={[e.map((v) => -v) as [number, number, number], e]} color={AXIS_COLORS[k]} lineWidth={1.2}
            transparent opacity={0.75} />
          {[-4, -2, 2, 4].map((t) => {
            const p = e.map((v) => (v / L) * t) as [number, number, number]
            return <TextSprite key={t} position={p} text={(t / unit).toFixed(1)} />
          })}
          <TextSprite position={e.map((v) => v * 1.1) as [number, number, number]} color={AXIS_COLORS[k]} size={0.36}
            text={`${'XYZ'[k]}  ${axisLabel(spec, ref, k as 0 | 1 | 2)}`} />
        </group>
      ))}
    </group>
  )
}
