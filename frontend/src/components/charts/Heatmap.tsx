import { useEffect, useRef, useState } from 'react'

interface Props {
  values: ArrayLike<number>
  cols: number
  color: (v: number, i: number) => string
  labels?: (i: number) => string
  format?: (v: number) => string
  highlight?: Set<number>
  selected?: number
  onSelect?: (i: number) => void
  cell?: number
  testId?: string
  ariaLabel: string
}

/** Canvas heat-map grid with hover readout (values shown verbatim from the model output). */
export function Heatmap({ values, cols, color, labels, format = (v) => v.toFixed(3), highlight, selected, onSelect, cell = 22, testId, ariaLabel }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const n = values.length
  const rows = Math.ceil(n / cols)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const dpr = window.devicePixelRatio || 1
    c.width = cols * cell * dpr
    c.height = rows * cell * dpr
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, cols * cell, rows * cell)
    for (let i = 0; i < n; i++) {
      const x = (i % cols) * cell, y = Math.floor(i / cols) * cell
      ctx.fillStyle = color(values[i], i)
      ctx.fillRect(x + 1, y + 1, cell - 2, cell - 2)
      if (highlight?.has(i)) {
        ctx.strokeStyle = '#d7a54a'; ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + cell - 3, y + cell - 3); ctx.stroke()
      }
      if (i === selected || i === hover) {
        ctx.strokeStyle = i === selected ? '#e8f1ff' : '#8fb4d9'; ctx.lineWidth = 1.5
        ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3)
      }
    }
  }, [values, cols, cell, color, highlight, selected, hover, n, rows])
  const idx = (e: React.MouseEvent) => {
    const r = (e.target as HTMLCanvasElement).getBoundingClientRect()
    const i = Math.floor((e.clientY - r.top) / cell) * cols + Math.floor((e.clientX - r.left) / cell)
    return i >= 0 && i < n ? i : null
  }
  return (
    <div dir="ltr">
      <canvas ref={ref} style={{ width: cols * cell, height: rows * cell, cursor: onSelect ? 'pointer' : 'default' }}
        role="img" aria-label={ariaLabel} data-testid={testId}
        onMouseMove={(e) => setHover(idx(e))} onMouseLeave={() => setHover(null)}
        onClick={(e) => { const i = idx(e); if (i !== null) onSelect?.(i) }} />
      <div className="num h-4 text-[11px] text-slate-400">
        {hover !== null ? `${labels ? labels(hover) : hover}: ${format(values[hover])}` : ' '}
      </div>
    </div>
  )
}

/** Small bar strip for vectors (each bar one channel). */
export function BarStrip({ values, ref2, max = 1, height = 46, color = '#5b8def', testId }: {
  values: ArrayLike<number>; ref2?: ArrayLike<number>; max?: number; height?: number; color?: string; testId?: string
}) {
  const n = values.length
  const w = 100 / n
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height, direction: 'ltr' }} data-testid={testId}>
      {Array.from({ length: n }, (_, i) => {
        const h = Math.max(0, Math.min(1, values[i] / max)) * (height - 2)
        return <rect key={i} x={i * w + w * 0.12} width={w * 0.76} y={height - h} height={h} fill={color} />
      })}
      {ref2 && Array.from({ length: n }, (_, i) => {
        const y = height - Math.max(0, Math.min(1, ref2[i] / max)) * (height - 2)
        return <line key={`r${i}`} x1={i * w} x2={(i + 1) * w} y1={y} y2={y} stroke="#e8f1ff" strokeWidth={0.6} />
      })}
    </svg>
  )
}
