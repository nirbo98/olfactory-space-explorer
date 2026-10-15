import { CHART } from '../../utils/colors'
import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { useMixtureStore } from '../../store/mixtureStore'
import type { DoseResponse } from '../../types/api'
import { Toggle } from '../controls/Slider'
import { axisProps, gridProps, num, tooltipProps } from './chartTheme'

/** Receptor-specific concentration–response curves from the trained receptor layer (teacher curve for reference). */
export function DoseResponsePanel() {
  const components = useMixtureStore((s) => s.components)
  const receptor = useMixtureStore((s) => s.selectedReceptor)
  const [cid, setCid] = useState(components[0]?.compound_id ?? 'C001')
  const [inMixture, setInMixture] = useState(false)
  const [res, setRes] = useState<DoseResponse | null>(null)
  const j = Number(receptor.slice(1)) - 1
  useEffect(() => {
    const c = new AbortController()
    api.doseResponse({ compound_id: cid, base_mixture: inMixture ? components.filter((x) => x.compound_id !== cid) : [], n_points: 60 }, c.signal)
      .then(setRes).catch(() => undefined)
    return () => c.abort()
  }, [cid, inMixture, JSON.stringify(components)]) // eslint-disable-line react-hooks/exhaustive-deps
  const data = res?.concentrations.map((c, k) => ({
    lc: Math.log10(c), model: res.receptor_activities[k][j], teacher: res.teacher_receptor_activities?.[k][j],
  })) ?? []
  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[220px_1fr] gap-3 p-2" data-testid="dose-panel">
      <div className="space-y-2 t-sm">
        <label className="block text-[var(--text-2)]">תרכובת
          <select className="input mt-1 w-full" value={cid} onChange={(e) => setCid(e.target.value)}>
            {Array.from({ length: 32 }, (_, i) => `C${String(i + 1).padStart(3, '0')}`).map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <Toggle label="בנוכחות שאר רכיבי התערובת" checked={inMixture} onChange={setInMixture} />
        <div className="text-[var(--text-2)]">רצפטור: <b className="text-[var(--text-1)]">{receptor}</b></div>
        <p className="t-xs text-[var(--text-3)]">התחום המוצלל = טווח הריכוזים באימון. מחוץ לו המודל מבצע אקסטרפולציה.</p>
      </div>
      <div dir="ltr">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="lc" type="number" domain={['dataMin', 'dataMax']} {...axisProps}
              tickFormatter={(v) => `1e${Number(v).toFixed(0)}`} />
            <YAxis {...axisProps} width={44} domain={[0, 'auto']} />
            <ReferenceArea x1={Math.log10(0.02)} x2={Math.log10(res?.training_range_max ?? 2)} fill={CHART.band} fillOpacity={0.14} />
            <Tooltip {...tooltipProps} formatter={num(4)} labelFormatter={(l) => `c = ${(10 ** Number(l)).toPrecision(3)}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="model" name={`model r ${receptor}`} stroke={CHART.primary} dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="teacher" name="synthetic teacher" stroke={CHART.reference} dot={false} strokeDasharray="4 3" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
