import { TOKENS } from '../../theme/tokens'

export const axisProps = {
  stroke: TOKENS['chart-axis'],
  tick: { fill: TOKENS['chart-tick'], fontSize: 11, fontFamily: 'IBM Plex Mono, monospace' },
  tickLine: { stroke: TOKENS['line-2'] },
}
export const gridProps = { stroke: TOKENS['chart-grid'] }
export const tooltipProps = {
  contentStyle: { background: TOKENS['surface-1'], border: `1px solid ${TOKENS['line-2']}`, borderRadius: 5, fontSize: 11, direction: 'ltr' as const },
  labelStyle: { color: TOKENS['text-2'] },
}
export const num = (d: number) => (v: unknown) => (typeof v === 'number' ? v.toFixed(d) : String(v ?? ''))
export const numExp = (d: number) => (v: unknown) => (typeof v === 'number' ? v.toExponential(d) : String(v ?? ''))
