import { useEffect, useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useVisualizationStore } from '../../store/visualizationStore'
import { sceneShared } from './sharedScene'

export const DEFAULT_CAMERA: [number, number, number] = [10.5, 7.5, 12.5]

/** Orbit controls + reset / focus. The camera is never moved by projection changes. */
export function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera)
  const resetToken = useVisualizationStore((s) => s.cameraResetToken)
  const focusToken = useVisualizationStore((s) => s.focusToken)
  useEffect(() => {
    if (!resetToken || !controls.current) return
    camera.position.set(...DEFAULT_CAMERA)
    controls.current.target.set(0, 0, 0)
    controls.current.update()
  }, [resetToken, camera])
  useEffect(() => {
    if (!focusToken || !controls.current) return
    const [x, y, z] = sceneShared.markerPosition
    const c = controls.current
    const off = camera.position.clone().sub(c.target).setLength(5)
    c.target.set(x, y, z)
    camera.position.set(x + off.x, y + off.y, z + off.z)
    c.update()
  }, [focusToken, camera])
  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.12} minDistance={1.5} maxDistance={60} />
}
