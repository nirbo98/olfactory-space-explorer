import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { useSimulationStore } from '../../store/simulationStore'
import { useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import type { FourierResponse } from '../../types/api'
import { Slider, Toggle } from '../controls/Slider'
import { axisProps, gridProps, num, tooltipProps } from './chartTheme'

export function FourierAnalysisPanel() {
  const tr = useSimulationStore((s) => s.result?.trajectory)
  const selected = useMixtureStore((s) => s.selectedReceptor)
  const rids = useDatasetStore((s) => s.config?.receptor_ids ?? [])
  const [layer, setLayer] = useState<'receptor' | 'bulb'>('receptor')
  const [useBand, setUseBand] = useState(false)
  const [band, setBand] = useState<[number, number]>([0, 6])
  const [res, setRes] = useState<FourierResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const j = Math.max(0, rids.indexOf(selected))
  const signal = useMemo(() => tr ? (layer === 'receptor' ? tr.receptor_activities : tr.bulb_activities).map((r) => r[j]) : null, [tr, layer, j])

  useEffect(() => {
    if (!signal || !tr) return
    const c = new AbortController()
    const id = setTimeout(() => {
      api.fourier({ signal, sample_spacing: tr.dt, band: useBand ? band : null, remove_mean: true }, c.signal)
        .then((r) => { setRes(r); setErr(null) }).catch((e) => e.name !== 'AbortError' && setErr(e.message))
    }, 120)
    return () => { clearTimeout(id); c.abort() }
  }, [signal, tr, useBand, band])

  if (!tr || !signal) return <div className="p-3 text-[12px] text-slate-500">אין אות זמני.</div>
  const series = tr.times.map((t, k) => ({ t, x: signal[k], rec: res?.reconstruction?.[k] }))
  const spec = res ? res.frequencies.map((f, k) => ({ f: +f.toFixed(3), a: res.amplitude[k] })) : []
  const nyq = res?.nyquist ?? 1 / (2 * tr.dt)
  return (
    <div className="grid h-full grid-cols-[230px_1fr_1fr] gap-3 p-2" data-testid="fft-panel">
      <div className="space-y-2">
        <div role="radiogroup" className="grid grid-cols-2 gap-1">
          <button className={`seg ${layer === 'receptor' ? 'seg-on' : ''}`} onClick={() => setLayer('receptor')}>רצפטור</button>
          <button className={`seg ${layer === 'bulb' ? 'seg-on' : ''}`} onClick={() => setLayer('bulb')}>בולבוס</button>
        </div>
        <div className="text-[11.5px] text-slate-400">ערוץ: {layer === 'receptor' ? selected : `B${j + 1}`} (לפי הרצפטור הנבחר)</div>
        <Toggle label="שחזור מוגבל-פס" checked={useBand} onChange={setUseBand} testId="fft-band-toggle" />
        {useBand && (
          <>
            <Slider label="גבול תחתון" value={band[0]} min={0} max={nyq} step={0.25} onChange={(v) => setBand([Math.min(v, band[1]), band[1]])} format={(v) => `${v.toFixed(2)} Hz`} />
            <Slider label="גבול עליון" value={band[1]} min={0} max={nyq} step={0.25} onChange={(v) => setBand([band[0], Math.max(v, band[0])])} format={(v) => `${v.toFixed(2)} Hz`} />
          </>
        )}
        {res && (
          <div className="space-y-0.5 text-[11px] text-slate-400" dir="rtl">
            <div>קצב דגימה <span className="num text-slate-200">{res.sampling_rate.toFixed(2)} Hz</span> · נייקוויסט <span className="num text-slate-200">{res.nyquist.toFixed(2)} Hz</span></div>
            <div>רזולוציית תדר Δf = <span className="num text-slate-200">{res.frequency_resolution.toFixed(3)} Hz</span></div>
            <div>תדרים דומיננטיים: <span className="num text-sky-200" data-testid="fft-dominant">{res.dominant.map((d) => `${d.frequency.toFixed(2)}Hz`).join(', ')}</span></div>
            {res.reconstruction_rmse !== undefined && <div>RMSE שחזור: <span className="num text-slate-200">{res.reconstruction_rmse.toFixed(4)}</span></div>}
            <div className="text-slate-500">התדרים מתארים את המבנה הזמני של האות המדומה (למשל קצב רחרוח), לא את זהות המולקולות. יחידות: מחזורים לשנייה מדומה.</div>
          </div>
        )}
        {err && <div className="warn">{err}</div>}
      </div>
      <div dir="ltr">
        <div className="mb-1 text-[11px] text-slate-400" dir="rtl">אות מול זמן</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={series} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="t" type="number" domain={[0, tr.times.at(-1)!]} unit="s" {...axisProps} tickFormatter={(v) => Number(v).toFixed(1)} />
            <YAxis {...axisProps} width={44} />
            <Tooltip {...tooltipProps} formatter={num(4)} />
            <Line dataKey="x" name="signal" stroke="#7ee0ff" dot={false} isAnimationActive={false} />
            {useBand && <Line dataKey="rec" name="band-limited" stroke="#d7a54a" dot={false} strokeDasharray="5 3" isAnimationActive={false} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div dir="ltr">
        <div className="mb-1 text-[11px] text-slate-400" dir="rtl">ספקטרום משרעת (חד-צדדי, ממוצע הוסר)</div>
        <ResponsiveContainer width="100%" height={190}>
          <BarChart data={spec} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="f" {...axisProps} unit="Hz" interval={7} />
            <YAxis {...axisProps} width={44} />
            <Tooltip {...tooltipProps} formatter={num(5)} labelFormatter={(f) => `${f} Hz`} />
            <Bar dataKey="a" name="amplitude" fill="#5b8def" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
