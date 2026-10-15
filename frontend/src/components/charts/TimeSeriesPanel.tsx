import { useEffect, useMemo, useRef } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useSimulationStore } from '../../store/simulationStore'
import { useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import { CHART, seq } from '../../utils/colors'
import { axisProps, gridProps, num, tooltipProps } from './chartTheme'

function ReceptorTimeHeatmap({ data, time, dt }: { data: number[][]; time: number; dt: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const T = data.length, R = data[0]?.length ?? 0
  useEffect(() => {
    const c = ref.current
    if (!c || !T) return
    c.width = T; c.height = R
    const ctx = c.getContext('2d')
    if (!ctx) return
    for (let t = 0; t < T; t++) for (let r = 0; r < R; r++) { ctx.fillStyle = seq(data[t][r]); ctx.fillRect(t, r, 1, 1) }
  }, [data, T, R])
  return (
    <div className="relative" dir="ltr">
      <canvas ref={ref} style={{ width: '100%', height: 128, imageRendering: 'pixelated' }} role="img"
        aria-label="פעילות רצפטורים לאורך זמן" />
      <div className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${Math.min(100, ((time / dt) / T) * 100)}%` }} />
    </div>
  )
}

export function TimeSeriesPanel() {
  const result = useSimulationStore((s) => s.result)
  const compare = useSimulationStore((s) => s.compare)
  const setCompare = useSimulationStore((s) => s.setCompare)
  const time = useSimulationStore((s) => s.time)
  const selected = useMixtureStore((s) => s.selectedReceptor)
  const rids = useDatasetStore((s) => s.config?.receptor_ids ?? [])
  const samples = useDatasetStore((s) => s.samples)
  const j = Math.max(0, rids.indexOf(selected))
  const tr = result?.trajectory
  const ctr = compare?.result?.trajectory
  const data = useMemo(() => tr?.times.map((t, k) => ({
    t, stimulus: tr.stimulus[k], receptor: tr.receptor_activities[k][j], bulb: tr.bulb_activities[k][j],
    intensity: tr.intensity_prediction[k] / 4, compare: ctr?.receptor_activities[k]?.[j],
  })) ?? [], [tr, ctr, j])
  if (!tr) return <div className="p-3 t-sm text-[var(--text-3)]">אין מסלול זמן.</div>
  const sc = tr.scenario
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[1fr_300px] gap-3 p-2">
      <div dir="ltr" data-testid="timeseries-chart">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 6, right: 12, bottom: 2, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" type="number" domain={[0, tr.times.at(-1)!]} {...axisProps} unit="s" tickFormatter={(v) => Number(v).toFixed(1)} />
            <YAxis {...axisProps} width={40} />
            <Tooltip {...tooltipProps} formatter={num(4)} labelFormatter={(t) => `t = ${Number(t).toFixed(3)} s`} />
            <ReferenceArea x1={sc.onset} x2={sc.onset + sc.duration} fill={CHART.band} fillOpacity={0.12} />
            <ReferenceLine x={time} stroke={CHART.reference} strokeOpacity={0.7} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="stimulus" name="stimulus m(t)" stroke={CHART.muted} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
            <Line dataKey="receptor" name={`r ${selected}`} stroke={CHART.primary} dot={false} strokeWidth={1.8} isAnimationActive={false} />
            <Line dataKey="bulb" name={`h bulb ${j + 1}`} stroke={CHART.secondary} dot={false} isAnimationActive={false} />
            <Line dataKey="intensity" name="intensity/4" stroke={CHART.quaternary} dot={false} isAnimationActive={false} />
            {ctr && <Line dataKey="compare" name={`r ${selected} (${compare?.sampleId})`} stroke={CHART.quinary} dot={false} isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        <div className="t-xs text-[var(--text-2)]">רצפטורים × זמן (שורה לכל רצפטור)</div>
        <ReceptorTimeHeatmap data={tr.receptor_activities} time={time} dt={tr.dt} />
        <label className="flex items-center gap-1 t-sm text-[var(--text-2)]">
          השוואת מסלול עם
          <select className="input flex-1" value={compare?.sampleId ?? ''} onChange={(e) => setCompare(e.target.value || null)}
            data-testid="compare-select">
            <option value="">—</option>
            {samples.map((s) => <option key={s.id} value={s.id}>{s.id} · {s.components.map((c) => c.compound_id).join('+')}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
}
