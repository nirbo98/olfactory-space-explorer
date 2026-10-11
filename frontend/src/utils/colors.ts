// Restrained categorical palette for dark backgrounds (cluster colouring).
export const CLUSTER_COLORS = ['#5b8def', '#3ec7c2', '#d7a54a', '#c26fd6', '#7fbf6a', '#e07a6a', '#9aa7b8', '#4fa3d9']
export const SPLIT_COLORS: Record<string, string> = {
  train: '#6b7a8f', val: '#d7a54a', test: '#3ec7c2', heldout_compound: '#e07a6a',
}
export const ACCENT = '#e8f1ff'
export const SELECTED = '#7ee0ff'
export const BASELINE = '#d7a54a'
export const TARGET = '#f08bd0'
export const COMPARE = '#c26fd6'

/** Sequential (dark → bright) colour for a value in [0, 1]. */
export function seq(v: number): string {
  const t = Math.max(0, Math.min(1, v))
  const a = [20, 28, 40], b = [46, 110, 170], c = [126, 224, 255]
  const mix = (x: number[], y: number[], u: number) => x.map((xi, i) => Math.round(xi + (y[i] - xi) * u))
  const rgb = t < 0.5 ? mix(a, b, t * 2) : mix(b, c, (t - 0.5) * 2)
  return `rgb(${rgb.join(',')})`
}

/** Diverging colour for v in [-1, 1] (blue negative, warm positive). */
export function div(v: number): string {
  const t = Math.max(-1, Math.min(1, v))
  const mid = [24, 30, 40]
  const pos = [235, 140, 90], neg = [90, 150, 240]
  const target = t >= 0 ? pos : neg
  const u = Math.abs(t)
  return `rgb(${mid.map((m, i) => Math.round(m + (target[i] - m) * u)).join(',')})`
}
