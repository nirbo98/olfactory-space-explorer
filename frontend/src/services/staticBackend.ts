/**
 * Backend for the static (GitHub Pages) build.
 *
 * The trained checkpoint was exported to ONNX (backend/app/export/onnx_graphs.py; parity with
 * PyTorch tested in backend/tests/test_onnx_export.py) and runs here with onnxruntime-web.
 * Atlas, metrics, teacher references, Taylor analyses and inverse designs were exported by
 * backend/scripts/export_static.py. Taylor (autograd) and inverse design (gradient-based
 * optimization) are therefore available only for their precomputed configurations.
 */
import type * as OrtNS from 'onnxruntime-web'
import { ApiError } from './api'
import { BASE_URL } from './mode'
import { analyze } from '../mathematics/fourier'
import type {
  AtlasResponse, Compound, ConfigResponse, DatasetsResponse, DoseResponse, FourierResponse, InverseResponse,
  MetricsResponse, MixtureComponent, Scenario, SimulateRequest, SimulateResponse, TaylorResponse,
} from '../types/api'

type Ort = typeof OrtNS
const json = async <T>(name: string): Promise<T> => {
  const r = await fetch(`${BASE_URL}static/${name}`)
  if (!r.ok) throw new ApiError(r.status, `missing static asset ${name}`)
  return r.json() as Promise<T>
}
const once = <T>(f: () => Promise<T>) => { let p: Promise<T> | null = null; return () => (p ??= f()) }

const getConfig = once(() => json<ConfigResponse & { static_build: { frames: number; total_seconds: number } }>('config.json'))
const getAtlas = once(() => json<AtlasResponse>('atlas.json'))
const getFeatures = once(() => json<number[][]>('features.json'))
const getCompounds = once(() => json<{ compounds: Compound[] }>('compounds.json'))
const getScenarios = once(() => json<Record<string, { scenario: Scenario; times: number[]; dt: number; stimulus: number[] }>>('scenarios.json'))
const getTeacher = once(() => json<Record<string, { receptor: number[]; descriptors: number[]; intensity: number }>>('teacher.json'))
const getDoseTeacher = once(() => json<{ concentrations: number[]; curves: Record<string, number[][]> }>('dose_teacher.json'))
const getTaylor = once(() => json<{ mixture: MixtureComponent[]; selected: string[]; span: number; results: Record<string, TaylorResponse> }>('taylor_default.json'))
const getInverse = once(() => json<{ params: Record<string, unknown>; results: Record<string, InverseResponse> }>('inverse.json'))

const getOrt = once(async () => {
  const ort: Ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1          // GitHub Pages is not cross-origin isolated
  return ort
})
const getStatic = once(async () => (await getOrt()).InferenceSession.create(`${BASE_URL}static/model_static.onnx`))
const getTemporal = once(async () => (await getOrt()).InferenceSession.create(`${BASE_URL}static/model_temporal.onnx`))

// onnxruntime-web sessions are used one run at a time
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(f: () => Promise<T>): Promise<T> {
  const p = queue.then(f, f)
  queue = p.catch(() => undefined)
  return p
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
}

interface Parsed { ids: string[]; idx: number[]; conc: number[] }

async function parseMixture(mixture: MixtureComponent[]): Promise<Parsed> {
  const { compounds } = await getCompounds()
  const index = new Map(compounds.map((c, i) => [c.compound_id, i]))
  if (!mixture.length) throw new ApiError(422, 'mixture must contain at least one component')
  if (mixture.length > 8) throw new ApiError(422, 'at most 8 components are supported')
  const seen = new Set<string>()
  const idx: number[] = [], conc: number[] = []
  for (const c of mixture) {
    if (!index.has(c.compound_id)) throw new ApiError(422, `unknown compound id '${c.compound_id}'`)
    if (!Number.isFinite(c.concentration) || c.concentration < 0) throw new ApiError(422, `concentration of ${c.compound_id} must be a finite non-negative number`)
    if (seen.has(c.compound_id)) throw new ApiError(422, `compound ${c.compound_id} appears more than once`)
    seen.add(c.compound_id); idx.push(index.get(c.compound_id)!); conc.push(c.concentration)
  }
  return { ids: mixture.map((c) => c.compound_id), idx, conc }
}

async function gainVector(knockdowns: Record<string, number>): Promise<Float32Array> {
  const cfg = await getConfig()
  const g = new Float32Array(cfg.receptor_ids.length).fill(1)
  for (const [rid, f] of Object.entries(knockdowns)) {
    const j = cfg.receptor_ids.indexOf(rid)
    if (j < 0) throw new ApiError(422, `unknown receptor id '${rid}'`)
    if (!(f >= 0 && f <= 1)) throw new ApiError(422, 'receptor knockdown must be within [0, 1]')
    g[j] = 1 - f
  }
  return g
}

async function runStatic(rows: { idx: number[]; conc: number[]; gain: Float32Array }[], lateral: number, keepK: number) {
  const [ort, sess, feats, cfg] = await Promise.all([getOrt(), getStatic(), getFeatures(), getConfig()])
  const B = rows.length, N = Math.max(...rows.map((r) => r.idx.length)), F = cfg.model_config.n_features, R = cfg.receptor_ids.length
  const f = new Float32Array(B * N * F), c = new Float32Array(B * N), m = new Float32Array(B * N), g = new Float32Array(B * R)
  rows.forEach((row, b) => {
    row.idx.forEach((i, k) => { f.set(feats[i], (b * N + k) * F); c[b * N + k] = row.conc[k]; m[b * N + k] = 1 })
    g.set(row.gain, b * R)
  })
  const out = await serial(() => sess.run({
    features: new ort.Tensor('float32', f, [B, N, F]), conc: new ort.Tensor('float32', c, [B, N]),
    mask: new ort.Tensor('float32', m, [B, N]), gain: new ort.Tensor('float32', g, [B, R]),
    lateral: new ort.Tensor('float32', new Float32Array([lateral]), [1]),
    keep_k: new ort.Tensor('int64', new BigInt64Array([BigInt(keepK)]), [1]),
  }))
  const split = (name: string) => {
    const t = out[name]; const d = t.data as Float32Array; const w = d.length / B
    return Array.from({ length: B }, (_, b) => Array.from(d.subarray(b * w, (b + 1) * w)))
  }
  return { receptor: split('receptor'), bulb: split('bulb'), cortical: split('cortical'), embedding: split('embedding'),
    descriptors: split('descriptors'), intensity: Array.from(out.intensity.data as Float32Array) }
}

async function runTemporal(p: Parsed, gain: Float32Array, lateral: number, keepK: number, scenarioId: string) {
  const [ort, sess, feats, cfg, scenarios] = await Promise.all([getOrt(), getTemporal(), getFeatures(), getConfig(), getScenarios()])
  const sc = scenarios[scenarioId]
  if (!sc) throw new ApiError(422, `unknown scenario '${scenarioId}'`)
  const T = sc.times.length, N = p.idx.length, F = cfg.model_config.n_features, R = cfg.receptor_ids.length
  const f = new Float32Array(N * F), ct = new Float32Array(T * N)
  p.idx.forEach((i, k) => f.set(feats[i], k * F))
  for (let t = 0; t < T; t++) for (let k = 0; k < N; k++) ct[t * N + k] = p.conc[k] * sc.stimulus[t]
  const out = await serial(() => sess.run({
    features: new ort.Tensor('float32', f, [1, N, F]), conc_t: new ort.Tensor('float32', ct, [1, T, N]),
    mask: new ort.Tensor('float32', new Float32Array(N).fill(1), [1, N]), gain: new ort.Tensor('float32', gain, [1, R]),
    lateral: new ort.Tensor('float32', new Float32Array([lateral]), [1]),
    keep_k: new ort.Tensor('int64', new BigInt64Array([BigInt(keepK)]), [1]),
    dt: new ort.Tensor('float32', new Float32Array([sc.dt]), [1]),
  }))
  const rows = (name: string) => {
    const d = out[name].data as Float32Array; const w = d.length / T
    return Array.from({ length: T }, (_, t) => Array.from(d.subarray(t * w, (t + 1) * w)))
  }
  return {
    times: sc.times, dt: sc.dt, stimulus: sc.stimulus, scenario: sc.scenario,
    odor_embedding: rows('embedding'), receptor_activities: rows('receptor'), bulb_activities: rows('bulb'),
    cortical_activities: rows('cortical'), intensity_prediction: Array.from(out.intensity.data as Float32Array),
  }
}

async function novelty(z: number[]) {
  const a = await getAtlas()
  let best = Infinity, j = 0
  a.embeddings.forEach((e, m) => {
    let s = 0
    for (let k = 0; k < e.length; k++) s += (e[k] - z[k]) ** 2
    if (s < best) { best = s; j = m }
  })
  const d = Math.sqrt(best)
  return { nearest_sample: a.samples[j].id, nearest_distance: d, reference_nn_p95: a.nn_distance.p95, outside_reference: d > a.nn_distance.p95 }
}

async function matchingSample(p: Parsed): Promise<string | null> {
  const a = await getAtlas()
  const key = (ids: string[], c: number[]) => ids.map((id, i) => [id, c[i]] as const).sort().map(([id, v]) => `${id}:${v.toFixed(5)}`).join('|')
  const target = key(p.ids, p.conc)
  const s = a.samples.find((x) => key(x.components.map((c) => c.compound_id), x.components.map((c) => c.concentration)) === target)
  return s?.id ?? null
}

const sameMixture = (a: MixtureComponent[], b: MixtureComponent[]) =>
  a.length === b.length && a.every((x) => b.some((y) => y.compound_id === x.compound_id && Math.abs(y.concentration - x.concentration) < 1e-9))

export const staticBackend = {
  health: async () => ({ status: 'ok', model_status: (await getConfig()).model_status }),
  config: getConfig,
  atlas: getAtlas,
  compounds: getCompounds,
  datasets: () => json<DatasetsResponse>('datasets.json'),
  metrics: () => json<MetricsResponse>('metrics.json'),

  async simulate(body: SimulateRequest, signal?: AbortSignal): Promise<SimulateResponse> {
    const cfg = await getConfig()
    const p = await parseMixture(body.mixture)
    const gain = await gainVector(body.receptor_knockdowns)
    const H = cfg.model_config.cortex_hidden
    const keepK = body.disable_sparsity ? H : Math.ceil((body.sparsity ?? cfg.model_config.sparsity ?? 1) * H)
    const lateral = (body.lateral_inhibition ?? cfg.model_config.lateral_inhibition) ? 1 : 0
    const ones = new Float32Array(gain.length).fill(1)
    const s = await runStatic([{ ...p, gain }, { ...p, gain: ones }], lateral, keepK)
    abortIfNeeded(signal)
    const trajectory = body.include_trajectory ? await runTemporal(p, gain, lateral, keepK, body.scenario_id) : undefined
    abortIfNeeded(signal)
    const z = s.embedding[0], zb = s.embedding[1]
    const shift = Math.sqrt(z.reduce((a, v, i) => a + (v - zb[i]) ** 2, 0))
    // the same input warnings the Python engine produces
    const { compounds } = await getCompounds()
    const warnings: string[] = []
    if (p.conc.some((c) => c > cfg.max_training_concentration)) warnings.push(`concentration above the training range (> ${cfg.max_training_concentration}); extrapolation`)
    if (p.idx.length > 5) warnings.push('more than 5 components; training mixtures had at most 5')
    const held = p.ids.filter((id) => compounds.find((c) => c.compound_id === id)?.heldout)
    if (held.length) warnings.push(`compounds held out from training: ${held.join(', ')}`)
    if (Object.values(body.receptor_knockdowns).some((v) => v > 0)) warnings.push('receptor knockdown is a counterfactual manipulation never seen during training')
    if (body.lateral_inhibition !== null && body.lateral_inhibition !== cfg.model_config.lateral_inhibition) warnings.push('lateral inhibition setting differs from training (inference-time ablation)')
    if (body.disable_sparsity || (body.sparsity !== null && body.sparsity !== cfg.model_config.sparsity)) warnings.push('cortical sparsity differs from training (inference-time ablation)')
    const res: SimulateResponse = {
      odor_embedding: z, receptor_activities: s.receptor[0], bulb_activities: s.bulb[0], cortical_activities: s.cortical[0],
      descriptor_predictions: Object.fromEntries(cfg.descriptor_labels.map((l, i) => [l, s.descriptors[0][i]])),
      intensity_prediction: s.intensity[0],
      baseline: { odor_embedding: zb, receptor_activities: s.receptor[1], embedding_shift_norm: shift },
      novelty: await novelty(z), warnings, provenance: 'synthetic_model_prediction', model_version: cfg.model_version,
      model_status: cfg.model_status, trajectory,
    }
    // teacher ground truth is available for reference mixtures (exported from the Python teacher)
    const sid = Object.keys(body.receptor_knockdowns).length ? null : await matchingSample(p)
    if (sid) {
      const t = (await getTeacher())[sid]
      res.teacher_reference = {
        provenance: 'synthetic_teacher_ground_truth', receptor_activities: t.receptor, intensity: t.intensity,
        descriptor_targets: Object.fromEntries(cfg.descriptor_labels.map((l, i) => [l, t.descriptors[i]])),
      }
    }
    return res
  },

  async fourier(body: { signal: number[]; sample_spacing: number; band?: [number, number] | null; remove_mean?: boolean }): Promise<FourierResponse> {
    try {
      return { ...analyze(body.signal, body.sample_spacing, body.band ?? null, body.remove_mean ?? true), frequency_units: 'cycles per s (Hz)' }
    } catch (e) {
      throw new ApiError(422, (e as Error).message)
    }
  },

  async taylor(body: { mixture: MixtureComponent[]; receptor_id: string; selected: string[]; receptor_knockdowns: Record<string, number>; span: number }): Promise<TaylorResponse> {
    const t = await getTaylor()
    const ok = sameMixture(body.mixture, t.mixture) && [...body.selected].sort().join() === [...t.selected].sort().join()
      && !Object.keys(body.receptor_knockdowns).length && Math.abs(body.span - t.span) < 1e-9
    if (!ok || !t.results[body.receptor_id]) throw new ApiError(409, 'STATIC_TAYLOR_UNAVAILABLE')
    return t.results[body.receptor_id]
  },

  async doseResponse(body: { compound_id: string; base_mixture: MixtureComponent[]; n_points?: number }): Promise<DoseResponse> {
    const cfg = await getConfig()
    const dt = await getDoseTeacher()
    const base = await parseMixture([...body.base_mixture.filter((c) => c.compound_id !== body.compound_id), { compound_id: body.compound_id, concentration: 0 }])
    const ones = new Float32Array(cfg.receptor_ids.length).fill(1)
    const grid = dt.concentrations
    const H = cfg.model_config.cortex_hidden
    const out = await runStatic(grid.map((c) => ({ idx: base.idx, conc: [...base.conc.slice(0, -1), c], gain: ones })),
      cfg.model_config.lateral_inhibition ? 1 : 0, Math.ceil((cfg.model_config.sparsity ?? 1) * H))
    return {
      compound_id: body.compound_id, concentrations: grid, receptor_activities: out.receptor,
      teacher_receptor_activities: base.idx.length === 1 ? dt.curves[body.compound_id] : undefined,
      training_range_max: cfg.max_training_concentration,
    }
  },

  async inverse(body: Record<string, unknown>): Promise<InverseResponse> {
    const inv = await getInverse()
    const a = await getAtlas()
    const z = body.target_embedding as number[] | undefined
    const id = Object.keys(inv.results).find((tid) => {
      const e = a.embeddings[a.samples.findIndex((s) => s.id === tid)]
      return z && e.every((v, i) => Math.abs(v - z[i]) < 1e-6)
    })
    if (!id) throw new ApiError(409, 'STATIC_INVERSE_UNAVAILABLE')
    const r = inv.results[id]
    return { ...r, warnings: [...r.warnings, `PAGES_PRECOMPUTED`] }
  },

  precomputedInverseTargets: async () => Object.keys((await getInverse()).results),
  precomputedTaylor: async () => { const t = await getTaylor(); return { mixture: t.mixture, selected: t.selected } },
}
