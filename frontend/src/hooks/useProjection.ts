import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { effectiveProjection, projectAll, projectOne, type EffectiveProjection } from '../mathematics/projection'
import { useDatasetStore } from '../store/datasetStore'
import { useProjectionStore } from '../store/projectionStore'

/** Scene units per standardized projection unit (before the user's coordinate scaling). */
export const SCENE_UNIT = 2.2

export function useProjectionSpec() {
  return useProjectionStore(useShallow((s) => ({ mode: s.mode, dims: s.dims, axes: s.axes, orthogonalize: s.orthogonalize, scale: s.scale })))
}

export function useEffectiveProjection(): (EffectiveProjection & { sceneScale: number }) | null {
  const ref = useDatasetStore((s) => s.reference)
  const spec = useProjectionSpec()
  return useMemo(() => {
    if (!ref) return null
    try {
      return { ...effectiveProjection(ref, spec), sceneScale: SCENE_UNIT * spec.scale }
    } catch {
      return null
    }
  }, [ref, spec.mode, spec.dims, spec.axes, spec.orthogonalize, spec.scale]) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Projected atlas positions (scene units), recomputed only when the projection changes. */
export function useAtlasPositions(): Float32Array | null {
  const proj = useEffectiveProjection()
  const Z = useDatasetStore((s) => s.embeddings)
  const M = useDatasetStore((s) => s.samples.length)
  return useMemo(() => {
    if (!proj || !Z) return null
    return projectAll(Z, M, proj, proj.sceneScale, new Float32Array(M * 3))
  }, [proj, Z, M])
}

export function toScene(z: ArrayLike<number> | null | undefined, proj: (EffectiveProjection & { sceneScale: number }) | null):
  [number, number, number] | null {
  if (!z || !proj) return null
  const p = projectOne(z, proj)
  return [p[0] * proj.sceneScale, p[1] * proj.sceneScale, p[2] * proj.sceneScale]
}
