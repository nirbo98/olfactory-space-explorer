export const axisProps = {
  stroke: '#4b5869',
  tick: { fill: '#8a97a8', fontSize: 10.5, fontFamily: 'IBM Plex Mono, monospace' },
  tickLine: { stroke: '#2a3542' },
}
export const gridProps = { stroke: '#1c2530', strokeDasharray: '2 4' }
export const tooltipProps = {
  contentStyle: { background: '#0f141b', border: '1px solid #2a3542', fontSize: 11, direction: 'ltr' as const },
  labelStyle: { color: '#9fb0c4' },
}
export const num = (d: number) => (v: unknown) => (typeof v === 'number' ? v.toFixed(d) : String(v ?? ''))
export const numExp = (d: number) => (v: unknown) => (typeof v === 'number' ? v.toExponential(d) : String(v ?? ''))
