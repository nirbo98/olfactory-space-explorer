import { TOKENS } from '../theme/tokens'

// Categorical palette for the dark surface, fixed order (validated for colour-vision deficiency
// on adjacent pairs; see theme/tokens.ts). Used for clusters and inverse-design runs.
export const CATEGORICAL = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767']
export const CLUSTER_COLORS = CATEGORICAL

/** Named chart roles: charts reference these, never raw hex. */
export const CHART = {
  primary: TOKENS['series-1'],
  secondary: TOKENS['series-2'],
  tertiary: TOKENS['series-3'],
  quaternary: TOKENS['series-4'],
  quinary: TOKENS['series-5'],
  reference: TOKENS['text-1'],
  muted: TOKENS['series-muted'],
  band: TOKENS['accent-strong'],
} as const
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
