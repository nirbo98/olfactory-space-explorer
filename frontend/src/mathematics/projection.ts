/**
 * Fixed linear views of z ∈ R^E into the 3-D scene:  p = P (z − c).
 * TypeScript twin of backend/app/mathematics/projection.py; both are checked
 * against the same fixture (src/mathematics/__fixtures__/projection_fixture.json).
 *
 * This file contains projection geometry only — no part of the neural model.
 */
import type { ReferenceProjectionJSON } from '../types/api'

export type ProjectionMode = 'pca' | 'direct' | 'weighted'

export interface WeightedAxis {
  primary: number
  secondary: number
  mix: number // 0 → primary only, 1 → secondary only
}

export interface ProjectionSpec {
  mode: ProjectionMode
  dims: [number, number, number]
  axes: [WeightedAxis, WeightedAxis, WeightedAxis]
  orthogonalize: boolean
}

export interface Reference {
  E: number
  mean: Float64Array
  pcaComponents: Float64Array // 3 × E row-major
  pcaScale: Float64Array
  explainedVarianceRatio: number[]
  dimMean: Float64Array
  dimStd: Float64Array
}

export interface EffectiveProjection {
  P: Float64Array // 3 × E row-major
  centre: Float64Array
  warnings: string[]
}

export function referenceFromJSON(j: ReferenceProjectionJSON): Reference {
  const E = j.mean.length
  return {
    E,
    mean: Float64Array.from(j.mean),
    pcaComponents: Float64Array.from(j.pca_components.flat()),
    pcaScale: Float64Array.from(j.pca_scale),
    explainedVarianceRatio: j.explained_variance_ratio,
    dimMean: Float64Array.from(j.dim_mean),
    dimStd: Float64Array.from(j.dim_std),
  }
}

export function effectiveProjection(ref: Reference, spec: ProjectionSpec): EffectiveProjection {
  const { E } = ref
  const P = new Float64Array(3 * E)
  const warnings: string[] = []
  if (spec.mode === 'pca') {
    for (let k = 0; k < 3; k++)
      for (let e = 0; e < E; e++) P[k * E + e] = ref.pcaComponents[k * E + e] / ref.pcaScale[k]
    return { P, centre: ref.mean, warnings }
  }
  if (spec.mode === 'direct') {
    if (new Set(spec.dims).size < 3) warnings.push('degenerate')
    spec.dims.forEach((d, k) => {
      if (d < 0 || d >= E) throw new Error(`dimension ${d} out of range`)
      P[k * E + d] = 1 / ref.dimStd[d]
    })
    return { P, centre: ref.dimMean, warnings }
  }
  // weighted
  const W = new Float64Array(3 * E)
  spec.axes.forEach((ax, k) => {
    W[k * E + ax.primary] += 1 - ax.mix
    W[k * E + ax.secondary] += ax.mix
    const n = Math.hypot(...W.subarray(k * E, (k + 1) * E))
    if (n < 1e-12) throw new Error('zero projection axis')
    for (let e = 0; e < E; e++) W[k * E + e] /= n
  })
  if (spec.orthogonalize) {
    const Q = new Float64Array(3 * E)
    for (let k = 0; k < 3; k++) {
      const v = W.slice(k * E, (k + 1) * E)
      for (let j = 0; j < k; j++) {
        let d = 0
        for (let e = 0; e < E; e++) d += W[k * E + e] * Q[j * E + e]
        for (let e = 0; e < E; e++) v[e] -= d * Q[j * E + e]
      }
      const n = Math.hypot(...v)
      if (n < 1e-8) {
        warnings.push(`dependent-${'XYZ'[k]}`)
        Q.set(W.subarray(k * E, (k + 1) * E), k * E)
      } else {
        for (let e = 0; e < E; e++) Q[k * E + e] = v[e] / n
      }
    }
    W.set(Q)
  }
  if (gramRank(W, E) < 3) warnings.push('degenerate')
  for (let k = 0; k < 3; k++) for (let e = 0; e < E; e++) P[k * E + e] = W[k * E + e] / ref.dimStd[e]
  return { P, centre: ref.dimMean, warnings }
}

/** Project one embedding (pure: never mutates z). */
export function projectOne(z: ArrayLike<number>, proj: EffectiveProjection): [number, number, number] {
  const { P, centre } = proj
  const E = centre.length
  const out: [number, number, number] = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    let s = 0
    const off = k * E
    for (let e = 0; e < E; e++) {
      const w = P[off + e]
      if (w !== 0) s += w * (z[e] - centre[e])
    }
    out[k] = s
  }
  return out
}

/** Project M embeddings stored flat (M × E) into `out` (M × 3), multiplied by `scale`. */
export function projectAll(Z: Float32Array | Float64Array, M: number, proj: EffectiveProjection, scale: number,
  out: Float32Array): Float32Array {
  const { P, centre } = proj
  const E = centre.length
  // collect sparse rows (direct mode has 1 non-zero per row) for speed
  const rows: { idx: number[]; w: number[] }[] = [0, 1, 2].map((k) => {
    const idx: number[] = [], w: number[] = []
    for (let e = 0; e < E; e++) if (P[k * E + e] !== 0) { idx.push(e); w.push(P[k * E + e]) }
    return { idx, w }
  })
  for (let m = 0; m < M; m++) {
    const base = m * E
    for (let k = 0; k < 3; k++) {
      const { idx, w } = rows[k]
      let s = 0
      for (let i = 0; i < idx.length; i++) s += w[i] * (Z[base + idx[i]] - centre[idx[i]])
      out[m * 3 + k] = s * scale
    }
  }
  return out
}

// ---------------------------------------------------------------- linear algebra
function gram(P: Float64Array, E: number): number[][] {
  const G = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
  for (let i = 0; i < 3; i++)
    for (let j = i; j < 3; j++) {
      let s = 0
      for (let e = 0; e < E; e++) s += P[i * E + e] * P[j * E + e]
      G[i][j] = G[j][i] = s
    }
  return G
}

/** Jacobi eigen-decomposition of a symmetric 3×3 matrix. Returns eigenvalues and column eigenvectors. */
export function symEig3(A: number[][]): { values: number[]; vectors: number[][] } {
  const a = A.map((r) => r.slice())
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = a[0][1] ** 2 + a[0][2] ** 2 + a[1][2] ** 2
    if (off < 1e-30) break
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]] as const) {
      if (Math.abs(a[p][q]) < 1e-300) continue
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
      const c = 1 / Math.sqrt(t * t + 1), s = t * c
      for (let k = 0; k < 3; k++) {
        const akp = a[k][p], akq = a[k][q]
        a[k][p] = c * akp - s * akq
        a[k][q] = s * akp + c * akq
      }
      for (let k = 0; k < 3; k++) {
        const apk = a[p][k], aqk = a[q][k]
        a[p][k] = c * apk - s * aqk
        a[q][k] = s * apk + c * aqk
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p], vkq = V[k][q]
        V[k][p] = c * vkp - s * vkq
        V[k][q] = s * vkp + c * vkq
      }
    }
  }
  return { values: [a[0][0], a[1][1], a[2][2]], vectors: V }
}

function gramRank(W: Float64Array, E: number, tol = 1e-8): number {
  const { values } = symEig3(gram(W, E))
  const max = Math.max(...values.map(Math.abs))
  return values.filter((v) => Math.abs(v) > tol * Math.max(max, 1e-300)).length
}

/**
 * Minimum-norm lift of a 3-D displacement: Δz = P⁺ Δp = Pᵀ (P Pᵀ)⁺ Δp.
 * One choice among infinitely many latent vectors with the same projection;
 * it leaves the orthogonal complement of P's row space untouched.
 */
export function liftDisplacement(P: Float64Array, dp: [number, number, number], rcond = 1e-10): Float64Array {
  const E = P.length / 3
  const { values, vectors } = symEig3(gram(P, E))
  const lmax = Math.max(...values)
  const cutoff = rcond * rcond * lmax // singular values σ = √λ; numpy cuts σ ≤ rcond·σmax
  // y = G⁺ dp
  const y = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    if (values[k] <= cutoff) continue
    const v = [vectors[0][k], vectors[1][k], vectors[2][k]]
    const coef = (v[0] * dp[0] + v[1] * dp[1] + v[2] * dp[2]) / values[k]
    for (let i = 0; i < 3; i++) y[i] += coef * v[i]
  }
  const dz = new Float64Array(E)
  for (let e = 0; e < E; e++) dz[e] = P[e] * y[0] + P[E + e] * y[1] + P[2 * E + e] * y[2]
  return dz
}

export function axisLabel(spec: ProjectionSpec, ref: Reference | null, k: 0 | 1 | 2): string {
  if (spec.mode === 'pca') {
    const v = ref ? ` (${(ref.explainedVarianceRatio[k] * 100).toFixed(1)}%)` : ''
    return `PC${k + 1}${v}`
  }
  if (spec.mode === 'direct') return `z[${spec.dims[k]}]`
  const a = spec.axes[k]
  return `${(1 - a.mix).toFixed(2)}·z${a.primary} + ${a.mix.toFixed(2)}·z${a.secondary}`
}
