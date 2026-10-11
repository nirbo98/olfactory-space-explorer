import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Line, PivotControls } from '@react-three/drei'
import * as THREE from 'three'
import { toScene, useEffectiveProjection } from '../../hooks/useProjection'
import { liftDisplacement } from '../../mathematics/projection'
import { useInverseDesignStore } from '../../store/inverseDesignStore'
import { TARGET } from '../../utils/colors'
import { sceneShared } from './sharedScene'
import { STATIC_MODE } from '../../services/mode'

/**
 * Inverse-design target. Dragging moves the target in 3-D; the new latent target is
 * z_target = z + P⁺Δp (minimum-norm lift — one choice among infinitely many).
 * Dragging is disabled when the current projection is rank-deficient.
 */
export function InverseTargetMarker() {
  const z = useInverseDesignStore((s) => s.targetEmbedding)
  const base = useInverseDesignStore((s) => s.baseEmbedding)
  const delta = useInverseDesignStore((s) => s.liftedDelta)
  const setModified = useInverseDesignStore((s) => s.setModifiedTarget)
  const candidates = useInverseDesignStore((s) => s.result?.candidates)
  const proj = useEffectiveProjection()
  const [key, setKey] = useState(0)
  const drag = useRef(new THREE.Matrix4())
  const pos = toScene(z, proj)
  const basePos = toScene(base, proj)
  useFrame(({ camera, size }) => {
    if (!pos) { sceneShared.inverseHandles = null; return }
    const toPx = (p: THREE.Vector3): [number, number] => {
      const v = p.project(camera)
      return [(v.x + 1) / 2 * size.width, (1 - v.y) / 2 * size.height]
    }
    sceneShared.inverseHandles = {
      center: toPx(new THREE.Vector3(...pos)),
      xHandle: toPx(new THREE.Vector3(pos[0] + 0.75, pos[1], pos[2])),
    }
  })
  if (!pos || !proj || !z) return null
  const canDrag = !STATIC_MODE && !proj.warnings.some((w) => w.startsWith('degenerate') || w.startsWith('dependent'))

  const onDragEnd = () => {
    const t = new THREE.Vector3().setFromMatrixPosition(drag.current)
    const dp: [number, number, number] = [t.x / proj.sceneScale, t.y / proj.sceneScale, t.z / proj.sceneScale]
    if (Math.hypot(...dp) < 1e-6) return
    const dz = liftDisplacement(proj.P, dp)
    setModified(z.map((v, i) => v + dz[i]), [delta[0] + dp[0], delta[1] + dp[1], delta[2] + dp[2]])
    drag.current.identity()
    setKey((k) => k + 1)
  }

  const sphere = (
    <group position={pos}>
      <mesh>
        <octahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial color={TARGET} emissive={TARGET} emissiveIntensity={0.6} />
      </mesh>
      <Billboard>
        <mesh>
          <ringGeometry args={[0.3, 0.34, 4]} />
          <meshBasicMaterial color={TARGET} transparent opacity={0.8} />
        </mesh>
      </Billboard>
    </group>
  )
  return (
    <group>
      {canDrag ? (
        <PivotControls key={key} offset={pos} disableRotations disableScaling depthTest={false} scale={1.1}
          lineWidth={2.5} axisColors={['#c46a6a', '#6fae78', '#6a8fd0']}
          onDrag={(local) => drag.current.copy(local)} onDragEnd={onDragEnd}>
          {sphere}
        </PivotControls>
      ) : sphere}
      {basePos && Math.hypot(...delta) > 1e-6 && (
        <>
          <mesh position={basePos}>
            <octahedronGeometry args={[0.15, 0]} />
            <meshBasicMaterial color={TARGET} wireframe />
          </mesh>
          <Line points={[basePos, pos]} color={TARGET} lineWidth={1.2} dashed dashSize={0.1} gapSize={0.08} />
        </>
      )}
      {candidates?.slice(0, 5).map((c, i) => {
        const p = toScene(c.embedding, proj)
        return p && (
          <mesh key={i} position={p}>
            <boxGeometry args={[0.16, 0.16, 0.16]} />
            <meshBasicMaterial color={i === 0 ? '#ffffff' : '#b9a6c9'} wireframe={i !== 0} />
          </mesh>
        )
      })}
    </group>
  )
}
