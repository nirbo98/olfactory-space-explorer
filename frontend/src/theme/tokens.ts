/**
 * Design tokens: the single source for every colour in the app.
 *
 * `applyTheme()` writes them as CSS custom properties (`--surface-1`, …) so
 * stylesheets and Tailwind arbitrary values (`bg-[var(--surface-2)]`) use the
 * same values that canvas/three.js/Recharts code reads from `TOKENS`.
 * Dark-only by design: the 3-D scene is tuned for a dark ground.
 */
export const TOKENS = {
  // surfaces, darkest (page) → raised (controls)
  'surface-0': '#0a0e13',
  'surface-1': '#0e131a',
  'surface-2': '#131a22',
  'surface-3': '#18212b',
  'surface-hover': '#1e2a37',
  // hairlines
  'line-1': '#1c2631',
  'line-2': '#2a3746',
  // ink
  'text-1': '#e3e9f0',
  'text-2': '#aab6c4',
  'text-3': '#7d8a99',
  'text-4': '#56636f',
  // interactive accent
  accent: '#7ee0ff',
  'accent-ui': '#5b8def',
  'accent-strong': '#1f4d73',
  'accent-strong-line': '#2f6a99',
  // provenance / status (never used as data series)
  simulated: '#e9c98a',
  'simulated-line': 'rgba(215,165,74,.38)',
  'simulated-bg': 'rgba(215,165,74,.09)',
  real: '#7fe0c2',
  'real-line': 'rgba(60,200,160,.40)',
  'real-bg': 'rgba(60,200,160,.09)',
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
  // chart chrome
  'chart-grid': '#1a232d',
  'chart-axis': '#3b4856',
  'chart-tick': '#8a97a8',
  // categorical data series (validated: CVD ΔE ≥ 9.4 adjacent, ≥ 3:1 on surface-1)
  'series-1': '#3987e5',
  'series-2': '#d95926',
  'series-3': '#199e70',
  'series-4': '#c98500',
  'series-5': '#d55181',
  'series-muted': '#6b7785',
} as const

export type TokenName = keyof typeof TOKENS
export const token = (name: TokenName) => TOKENS[name]
export const cssVar = (name: TokenName) => `var(--${name})`

export function applyTheme(root: HTMLElement = document.documentElement) {
  for (const [k, v] of Object.entries(TOKENS)) root.style.setProperty(`--${k}`, v)
}
