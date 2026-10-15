import { STATIC_MODE } from './mode'
import type {
  AtlasResponse, Compound, ConfigResponse, DatasetsResponse, DoseResponse, FourierResponse, InverseResponse,
  MetricsResponse, MixtureComponent, SimulateRequest, SimulateResponse, TaylorResponse, ValidationResponse,
} from '../types/api'

const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail ?? body)
    } catch { /* non-JSON error */ }
    throw new ApiError(res.status, msg)
  }
  return res.json() as Promise<T>
}

const post = <T>(path: string, body: unknown, signal?: AbortSignal) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body), signal })

/** HTTP client for the Python backend (/api/v1). */
const httpApi = {
  health: () => request<{ status: string; model_status: string }>('/health'),
  config: () => request<ConfigResponse>('/config'),
  atlas: () => request<AtlasResponse>('/atlas'),
  compounds: () => request<{ compounds: Compound[] }>('/compounds'),
  datasets: () => request<DatasetsResponse>('/datasets'),
  metrics: () => request<MetricsResponse>('/model/metrics'),
  validation: () => request<ValidationResponse>('/validation'),
  simulate: (body: SimulateRequest, signal?: AbortSignal) => post<SimulateResponse>('/simulate', body, signal),
  fourier: (body: { signal: number[]; sample_spacing: number; band?: [number, number] | null; remove_mean?: boolean }, signal?: AbortSignal) =>
    post<FourierResponse>('/analyze/fourier', body, signal),
  taylor: (body: { mixture: MixtureComponent[]; receptor_id: string; selected: string[]; receptor_knockdowns: Record<string, number>; span: number; direction?: number[] | null }, signal?: AbortSignal) =>
    post<TaylorResponse>('/analyze/taylor', body, signal),
  doseResponse: (body: { compound_id: string; base_mixture: MixtureComponent[]; n_points?: number }, signal?: AbortSignal) =>
    post<DoseResponse>('/analyze/dose-response', body, signal),
  inverse: (body: Record<string, unknown>, signal?: AbortSignal) => post<InverseResponse>('/inverse-design', body, signal),
}


/**
 * All backend calls go through this object so tests can replace individual methods.
 * In the static (GitHub Pages) build every method is served by staticBackend instead.
 */
type Methods = typeof httpApi
const loadStatic = () => import('./staticBackend').then((m) => m.staticBackend)
export const api: Methods = STATIC_MODE
  ? (Object.fromEntries(Object.keys(httpApi).map((k) => [k, async (...args: unknown[]) => {
      const sb = await loadStatic()
      return (sb[k as keyof typeof sb] as (...a: unknown[]) => unknown)(...args)
    }])) as unknown as Methods)
  : httpApi

export type Api = typeof api
