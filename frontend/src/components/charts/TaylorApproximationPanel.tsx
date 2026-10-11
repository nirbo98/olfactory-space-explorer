import { useEffect, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { api } from '../../services/api'
import { useMixtureStore } from '../../store/mixtureStore'
import type { TaylorResponse } from '../../types/api'
import { Heatmap } from './Heatmap'
import { Slider } from '../controls/Slider'
import { seq } from '../../utils/colors'
import { axisProps, gridProps, num, numExp, tooltipProps } from './chartTheme'
import { STATIC_MODE } from '../../services/mode'

export function TaylorApproximationPanel() {
  const components = useMixtureStore((s) => s.components)
  const setMixture = useMixtureStore((s) => s.setMixture)
  const clearKnockdowns = useMixtureStore((s) => s.clearKnockdowns)
  const knockdowns = useMixtureStore((s) => s.knockdowns)
  const receptor = useMixtureStore((s) => s.selectedReceptor)
  const ids = components.map((c) => c.compound_id)
  const [sel, setSel] = useState<string[]>(ids.slice(0, 2))
  const [span, setSpan] = useState(1)
  const [res, setRes] = useState<TaylorResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const selected = sel.filter((s) => ids.includes(s))
  const effective = selected.length ? selected : ids.slice(0, 1)

  useEffect(() => {
    const c = new AbortController()
    const id = setTimeout(() => {
      setBusy(true)
      api.taylor({ mixture: components, receptor_id: receptor, selected: effective, receptor_knockdowns: knockdowns, span }, c.signal)
        .then((r) => { setRes(r); setErr(null) })
        .catch((e) => e.name !== 'AbortError' && setErr(e.message))
        .finally(() => setBusy(false))
    }, 200)
    return () => { clearTimeout(id); c.abort() }
  }, [JSON.stringify(components), receptor, JSON.stringify(effective), JSON.stringify(knockdowns), span]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id])
  const data = res ? res.sweep.s.map((s, k) => ({
    s: +s.toFixed(4), actual: res.sweep.actual[k], first: res.sweep.first_order[k], second: res.sweep.second_order[k],
    e1: res.sweep.abs_error_first[k], e2: res.sweep.abs_error_second[k],
  })) : []
  return (
    <div className="grid h-full grid-cols-[250px_1fr_1fr_220px] gap-3 p-2" data-testid="taylor-panel">
      <div className="space-y-2 text-[12px]">
        <div className="text-slate-400">רצפטור: <b className="text-slate-100">{receptor}</b> · f(c) = r_j של שכבת הקשירה המאומנת</div>
        <div className="text-slate-400">רכיבים להסיאן (1–3):</div>
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => (
            <label key={id} className="chip cursor-pointer">
              <input type="checkbox" checked={effective.includes(id)} onChange={() => toggle(id)} data-testid={`taylor-sel-${id}`} /> {id}
            </label>
          ))}
        </div>
        <Slider label="טווח הסריקה (יחסי ל-‖c₀‖)" value={span} min={0.1} max={3} step={0.05} onChange={setSpan} format={(v) => v.toFixed(2)} />
        {busy && <div className="text-sky-300">מחשב נגזרות (autograd)…</div>}
        {err === 'STATIC_TAYLOR_UNAVAILABLE' ? (
          <div className="warn space-y-1" data-testid="taylor-static-note">
            <div>בגרסת Pages הנגזרות (autograd) חושבו מראש עבור התערובת C001 0.5 + C005 0.2, שני הרכיבים, טווח 1.0, ללא עיכוב רצפטורים — לכל 64 הרצפטורים.</div>
            <button className="btn" onClick={() => { setMixture([{ compound_id: 'C001', concentration: 0.5 }, { compound_id: 'C005', concentration: 0.2 }]); clearKnockdowns(); setSel(['C001', 'C005']); setSpan(1) }}>
              טעינת התצורה המחושבת
            </button>
          </div>
        ) : err && <div className="warn">{err}</div>}
        {STATIC_MODE && !err && <div className="text-[10.5px] text-slate-500">גרסת Pages: תוצאה מחושבת מראש בשרת הפייתון.</div>}
        <p className="text-[11px] leading-snug text-slate-500">
          f(c₀+Δc) ≈ f(c₀) + J·Δc + ½ Δcᵀ H Δc. הקירוב מקומי בלבד — השגיאה גדלה ככל שמתרחקים מ-c₀. הסריקה מוגבלת ל-c ≥ 0.
        </p>
      </div>
      <div dir="ltr">
        <div className="mb-1 text-[11px] text-slate-400" dir="rtl">מודל מול קירובי טיילור לאורך הכיוון d</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="s" type="number" domain={['dataMin', 'dataMax']} {...axisProps} />
            <YAxis {...axisProps} width={48} domain={['auto', 'auto']} />
            <Tooltip {...tooltipProps} formatter={num(5)} labelFormatter={(s) => `s = ${s}`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="actual" name="model" stroke="#e8f1ff" dot={false} strokeWidth={2} isAnimationActive={false} />
            <Line dataKey="first" name="1st order" stroke="#d7a54a" dot={false} strokeDasharray="5 3" isAnimationActive={false} />
            <Line dataKey="second" name="2nd order" stroke="#3ec7c2" dot={false} strokeDasharray="2 2" isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div dir="ltr">
        <div className="mb-1 text-[11px] text-slate-400" dir="rtl">שגיאה מוחלטת (RMSE: 1st {res?.rmse_first.toExponential(2)} · 2nd {res?.rmse_second.toExponential(2)})</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="s" type="number" domain={['dataMin', 'dataMax']} {...axisProps} />
            <YAxis {...axisProps} width={48} scale="linear" />
            <Tooltip {...tooltipProps} formatter={numExp(2)} />
            <Line dataKey="e1" name="|err| 1st" stroke="#d7a54a" dot={false} isAnimationActive={false} />
            <Line dataKey="e2" name="|err| 2nd" stroke="#3ec7c2" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-[11px]" dir="ltr">
        {res && (
          <>
            <div className="text-slate-400">f(c₀) = <span className="num text-slate-100">{res.f0.toFixed(5)}</span></div>
            <div className="text-slate-400">∇f (autograd):</div>
            {res.components.map((c, i) => (
              <div key={c} className="num flex justify-between text-slate-200"><span>∂/∂{c}</span><span>{res.gradient[i].toExponential(3)}</span></div>
            ))}
            <div className="text-slate-400">Hessian ({res.selected_ids.join(', ')}):</div>
            {res.hessian.map((row, i) => (
              <div key={i} className="num text-slate-200">[{row.map((v) => v.toExponential(2)).join(', ')}]</div>
            ))}
            <div className="text-slate-500">|autograd − FD|: ∇ {res.max_gradient_fd_error.toExponential(1)} · H {res.max_hessian_fd_error.toExponential(1)}</div>
            {res.grid && (
              <div>
                <div className="text-slate-400" dir="rtl">|שגיאה סדר 2| על רשת Δc ({res.selected_ids[0]}, {res.selected_ids[1]})</div>
                <Heatmap values={res.grid.abs_error_second.flat()} cols={res.grid.delta_b.length} cell={6}
                  ariaLabel="מפת שגיאת הקירוב מסדר שני" color={(v) => seq(Math.min(1, v / Math.max(1e-9, ...res.grid!.abs_error_second.flat())))}
                  labels={(i) => `Δ(${res.grid!.delta_a[Math.floor(i / res.grid!.delta_b.length)].toFixed(2)}, ${res.grid!.delta_b[i % res.grid!.delta_b.length].toFixed(2)})`}
                  format={(v) => v.toExponential(2)} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
