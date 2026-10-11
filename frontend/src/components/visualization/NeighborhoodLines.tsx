import { useMemo } from 'react'
import { Line } from '@react-three/drei'
import { toScene, useAtlasPositions, useEffectiveProjection } from '../../hooks/useProjection'
import { useDatasetStore } from '../../store/datasetStore'
import { useSimulationStore } from '../../store/simulationStore'
import { useVisualizationStore } from '../../store/visualizationStore'

/** Nearest reference odors measured in the FULL 256-D space (reveals projection distortion). */
export function NeighborhoodLines({ k = 6 }: { k?: number }) {
  const show = useVisualizationStore((s) => s.showNeighbors)
  const z = useSimulationStore((s) => s.result?.odor_embedding)
  const Z = useDatasetStore((s) => s.embeddings)
  const E = useDatasetStore((s) => s.E)
  const positions = useAtlasPositions()
  const proj = useEffectiveProjection()
  const nearest = useMemo(() => {
    if (!z || !Z) return []
    const M = Z.length / E
    const d: [number, number][] = []
    for (let m = 0; m < M; m++) {
      let s = 0
      for (let e = 0; e < E; e++) { const t = Z[m * E + e] - z[e]; s += t * t }
      d.push([s, m])
    }
    return d.sort((a, b) => a[0] - b[0]).slice(0, k).map((x) => x[1])
  }, [z, Z, E, k])
  const from = toScene(z, proj)
  if (!show || !from || !positions) return null
  return (
    <group>
      {nearest.map((m) => (
        <Line key={m} points={[from, [positions[m * 3], positions[m * 3 + 1], positions[m * 3 + 2]]]}
          color="#8fb4d9" lineWidth={1} transparent opacity={0.45} />
      ))}
    </group>
  )
}
