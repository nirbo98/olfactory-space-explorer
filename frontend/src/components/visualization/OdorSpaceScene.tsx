import { Canvas } from '@react-three/fiber'
import { useVisualizationStore } from '../../store/visualizationStore'
import { useSimulationStore } from '../../store/simulationStore'
import { ProjectionAxes } from './ProjectionAxes'
import { OdorPointCloud } from './OdorPointCloud'
import { SelectedOdorMarker } from './SelectedOdorMarker'
import { OdorTrajectory } from './OdorTrajectory'
import { NeighborhoodLines } from './NeighborhoodLines'
import { ConnectionLines } from './ConnectionLines'
import { InverseTargetMarker } from './InverseTargetMarker'
import { CameraRig, DEFAULT_CAMERA } from './CameraRig'
import { SceneOverlays } from './SceneOverlays'

export function OdorSpaceScene() {
  const showReference = useVisualizationStore((s) => s.showReference)
  const mode = useVisualizationStore((s) => s.mode)
  const pending = useSimulationStore((s) => s.status === 'pending')
  return (
    <div className="relative h-full w-full" data-testid="odor-space">
      <Canvas camera={{ position: DEFAULT_CAMERA, fov: 42, near: 0.1, far: 300 }} dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }} onPointerMissed={() => undefined}>
        <color attach="background" args={['#0a0e13']} />
        <fog attach="fog" args={['#0a0e13', 26, 60]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[8, 14, 6]} intensity={1.0} />
        <directionalLight position={[-10, -4, -8]} intensity={0.25} />
        <ProjectionAxes />
        {showReference && <OdorPointCloud />}
        {showReference && <ConnectionLines />}
        <NeighborhoodLines />
        <OdorTrajectory />
        <SelectedOdorMarker />
        {mode === 'inverse' && <InverseTargetMarker />}
        <CameraRig />
      </Canvas>
      <SceneOverlays />
      {pending && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded bg-black/50 px-2 py-1 text-xs text-sky-200"
          role="status" data-testid="sim-loading">
          <span className="h-2 w-2 animate-pulse rounded-full bg-sky-300" /> מחשב את המודל…
        </div>
      )}
    </div>
  )
}
