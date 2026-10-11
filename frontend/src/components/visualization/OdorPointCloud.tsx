import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { useAtlasPositions } from '../../hooks/useProjection'
import { useDatasetStore } from '../../store/datasetStore'
import { useSelectionStore } from '../../store/selectionStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { selectSample } from '../../services/actions'
import { CLUSTER_COLORS, SPLIT_COLORS } from '../../utils/colors'
import { sceneShared } from './sharedScene'

const dummy = new THREE.Object3D()
const tmpColor = new THREE.Color()

/** Reference odors drawn as one instanced mesh; numeric positions are kept separate from interpolated display positions. */
export function OdorPointCloud() {
  const target = useAtlasPositions()
  const samples = useDatasetStore((s) => s.samples)
  const compounds = useDatasetStore((s) => s.compounds)
  const colorBy = useVisualizationStore((s) => s.colorBy)
  const selectedId = useSelectionStore((s) => s.selectedSampleId)
  const hovered = useSelectionStore((s) => s.hoveredIndex)
  const hover = useSelectionStore((s) => s.hover)
  const mesh = useRef<THREE.InstancedMesh>(null)
  const display = useRef<Float32Array | null>(null)
  const dirty = useRef(true)
  const M = samples.length
  const selectedIndex = useMemo(() => samples.findIndex((s) => s.id === selectedId), [samples, selectedId])
  const familyOf = useMemo(() => new Map(compounds.map((c) => [c.compound_id, c.family])), [compounds])

  useEffect(() => { dirty.current = true }, [target, selectedIndex, hovered])

  useEffect(() => {
    const m = mesh.current
    if (!m) return
    samples.forEach((s, i) => {
      let c: string
      if (colorBy === 'split') c = SPLIT_COLORS[s.split]
      else if (colorBy === 'family') c = CLUSTER_COLORS[(parseInt((familyOf.get(s.components[0].compound_id) ?? 'F1').slice(1)) - 1) % CLUSTER_COLORS.length]
      else c = CLUSTER_COLORS[s.cluster % CLUSTER_COLORS.length]
      m.setColorAt(i, tmpColor.set(c))
    })
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  }, [samples, colorBy, familyOf])

  useFrame((_, delta) => {
    const m = mesh.current
    if (!m || !target) return
    if (!display.current || display.current.length !== target.length) {
      display.current = target.slice()
      dirty.current = true
    }
    const d = display.current
    const k = 1 - Math.exp(-delta * 9)
    let moving = false
    for (let i = 0; i < d.length; i++) {
      const diff = target[i] - d[i]
      if (Math.abs(diff) > 1e-4) { d[i] += diff * k; moving = true } else d[i] = target[i]
    }
    sceneShared.displayPositions = d
    if (!moving && !dirty.current) return
    for (let i = 0; i < M; i++) {
      dummy.position.set(d[i * 3], d[i * 3 + 1], d[i * 3 + 2])
      dummy.scale.setScalar(i === selectedIndex ? 1.9 : i === hovered ? 1.6 : 1)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    }
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
    dirty.current = moving
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.instanceId === undefined) return
    const r = (e.nativeEvent.target as HTMLElement).getBoundingClientRect()
    hover(e.instanceId, [e.nativeEvent.clientX - r.left, e.nativeEvent.clientY - r.top])
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 4 || e.instanceId === undefined) return
    e.stopPropagation()
    selectSample(samples[e.instanceId].id)
  }

  return (
    <group>
      <instancedMesh ref={mesh} args={[undefined, undefined, M]} onPointerMove={onMove} onPointerOut={() => hover(null)}
        onClick={onClick} frustumCulled={false}>
        <sphereGeometry args={[0.075, 14, 10]} />
        <meshLambertMaterial />
      </instancedMesh>
    </group>
  )
}
