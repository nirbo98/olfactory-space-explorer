import { useMemo } from 'react'
import * as THREE from 'three'
import { useAtlasPositions } from '../../hooks/useProjection'
import { useDatasetStore } from '../../store/datasetStore'
import { useVisualizationStore } from '../../store/visualizationStore'

/** Connects reference mixtures that share a component set, ordered by total concentration. */
export function ConnectionLines() {
  const show = useVisualizationStore((s) => s.showConnections)
  const samples = useDatasetStore((s) => s.samples)
  const positions = useAtlasPositions()
  const pairs = useMemo(() => {
    const groups = new Map<string, { i: number; tot: number }[]>()
    samples.forEach((s, i) => {
      const tot = s.components.reduce((a, c) => a + c.concentration, 0)
      groups.set(s.group, [...(groups.get(s.group) ?? []), { i, tot }])
    })
    const out: [number, number][] = []
    groups.forEach((g) => {
      g.sort((a, b) => a.tot - b.tot)
      for (let j = 1; j < g.length; j++) out.push([g[j - 1].i, g[j].i])
    })
    return out
  }, [samples])
  const geom = useMemo(() => {
    if (!positions) return null
    const arr = new Float32Array(pairs.length * 6)
    pairs.forEach(([a, b], j) => {
      arr.set(positions.subarray(a * 3, a * 3 + 3), j * 6)
      arr.set(positions.subarray(b * 3, b * 3 + 3), j * 6 + 3)
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3))
    return g
  }, [pairs, positions])
  if (!show || !geom) return null
  return (
    <lineSegments geometry={geom}>
      <lineBasicMaterial color="#5f7894" transparent opacity={0.35} />
    </lineSegments>
  )
}
