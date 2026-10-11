/**
 * Bridges model-input state (mixtureState) to the backend model.
 *
 * Architectural guarantee: this controller subscribes ONLY to mixtureState (and
 * the comparison selection). Projection state is never observed here, so
 * projection-only sliders cannot trigger model computation.
 *
 * Requests are debounced; every request carries an id and an AbortController,
 * and a response is applied only if it belongs to the newest request, so a slow
 * old response can never overwrite a newer slider state.
 */
import { api as defaultApi, type Api } from './api'
import { modelInputKey, useMixtureStore, type MixtureState } from '../store/mixtureStore'
import { useSimulationStore } from '../store/simulationStore'
import { useDatasetStore } from '../store/datasetStore'
import type { MixtureComponent, SimulateRequest } from '../types/api'

export function buildSimulateRequest(m: MixtureState, mixture: MixtureComponent[] = m.components): SimulateRequest {
  return {
    mixture: mixture.map((c) => ({ compound_id: c.compound_id, concentration: c.concentration })),
    receptor_knockdowns: { ...m.knockdowns },
    duration_seconds: m.durationSeconds,
    frame_count: m.frameCount,
    scenario_id: m.scenarioId,
    lateral_inhibition: m.lateralInhibition,
    sparsity: m.sparsityMode === 'custom' ? m.sparsity : null,
    disable_sparsity: m.sparsityMode === 'off',
    include_trajectory: true,
  }
}

export function startSimulationController(opts: { debounceMs?: number; apiImpl?: Api } = {}): () => void {
  const debounceMs = opts.debounceMs ?? 150
  const client = opts.apiImpl ?? defaultApi
  let timer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let latestId = 0
  let lastKey = ''
  let compareController: AbortController | null = null
  let lastCompareKey = ''

  const fire = async () => {
    timer = null
    const id = ++latestId
    controller?.abort()
    controller = new AbortController()
    const body = buildSimulateRequest(useMixtureStore.getState())
    useSimulationStore.setState({ requestId: id, status: 'pending' })
    try {
      const result = await client.simulate(body, controller.signal)
      if (id !== latestId) return // a newer request superseded this one
      const sim = useSimulationStore.getState()
      const end = result.trajectory?.times.at(-1) ?? 0
      useSimulationStore.setState({ result, status: 'ready', stale: false, error: null, time: Math.min(sim.time, end) })
    } catch (e) {
      if ((e as Error).name === 'AbortError' || id !== latestId) return
      useSimulationStore.setState({ status: 'error', error: (e as Error).message })
    }
  }

  const schedule = () => {
    useSimulationStore.setState({ stale: true, status: 'pending' })
    if (timer) clearTimeout(timer)
    timer = setTimeout(fire, debounceMs)
  }

  const onMixture = (s: MixtureState) => {
    const key = modelInputKey(s)
    if (key === lastKey) return
    lastKey = key
    schedule()
    runCompare()
  }

  const runCompare = async () => {
    const cmp = useSimulationStore.getState().compare
    if (!cmp) { lastCompareKey = ''; return }
    const ds = useDatasetStore.getState()
    const idx = ds.sampleIndex.get(cmp.sampleId)
    if (idx === undefined) return
    const m = useMixtureStore.getState()
    const body = buildSimulateRequest(m, ds.samples[idx].components)
    const key = JSON.stringify([cmp.sampleId, body])
    if (key === lastCompareKey && cmp.result) return
    lastCompareKey = key
    compareController?.abort()
    compareController = new AbortController()
    try {
      const result = await client.simulate(body, compareController.signal)
      const cur = useSimulationStore.getState().compare
      if (cur && cur.sampleId === cmp.sampleId) useSimulationStore.setState({ compare: { sampleId: cmp.sampleId, result } })
    } catch { /* comparison is optional; errors surface via the main request */ }
  }

  const unsubMix = useMixtureStore.subscribe(onMixture)
  const unsubCmp = useSimulationStore.subscribe((s, prev) => {
    if (s.compare?.sampleId !== prev.compare?.sampleId) runCompare()
  })
  onMixture(useMixtureStore.getState())
  return () => {
    unsubMix(); unsubCmp()
    if (timer) clearTimeout(timer)
    controller?.abort(); compareController?.abort()
  }
}
