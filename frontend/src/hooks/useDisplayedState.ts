import { useSimulationStore, frameIndex } from '../store/simulationStore'
import { useVisualizationStore } from '../store/visualizationStore'

/**
 * The state shown in readouts: either the steady-state (static) model output or
 * the computed frame nearest to the current playback time. Values are taken
 * verbatim from the model output; nothing is interpolated here.
 */
export function useDisplayedState() {
  const result = useSimulationStore((s) => s.result)
  const time = useSimulationStore((s) => s.time)
  const display = useVisualizationStore((s) => s.displayState)
  const tr = result?.trajectory
  if (!result) return null
  if (display === 'time' && tr) {
    const k = frameIndex(tr.times, time)
    return {
      temporal: true as const, frame: k, time: tr.times[k], stimulus: tr.stimulus[k],
      embedding: tr.odor_embedding[k], receptor: tr.receptor_activities[k], bulb: tr.bulb_activities[k],
      cortical: tr.cortical_activities[k], intensity: tr.intensity_prediction[k],
    }
  }
  return {
    temporal: false as const, frame: null, time: null, stimulus: null,
    embedding: result.odor_embedding, receptor: result.receptor_activities, bulb: result.bulb_activities,
    cortical: result.cortical_activities, intensity: result.intensity_prediction,
  }
}
