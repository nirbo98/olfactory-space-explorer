import { useDatasetStore } from '../store/datasetStore'
import { useMixtureStore } from '../store/mixtureStore'
import { useSelectionStore } from '../store/selectionStore'
import { useInverseDesignStore } from '../store/inverseDesignStore'
import { useVisualizationStore } from '../store/visualizationStore'

/** Selecting a reference odor loads its mixture as the model input (and, in Inverse mode, as the target). */
export function selectSample(id: string | null) {
  useSelectionStore.getState().select(id)
  if (!id) return
  const ds = useDatasetStore.getState()
  const idx = ds.sampleIndex.get(id)
  if (idx === undefined || !ds.embeddings) return
  useMixtureStore.getState().loadSample(ds.samples[idx])
  if (useVisualizationStore.getState().mode === 'inverse') {
    useInverseDesignStore.getState().setTarget(id, Array.from(ds.embeddings.subarray(idx * ds.E, (idx + 1) * ds.E)))
  }
}
