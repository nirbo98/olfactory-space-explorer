import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, ReferenceLine } from 'recharts'
import { useInverseDesignStore } from '../../store/inverseDesignStore'
import { useDatasetStore } from '../../store/datasetStore'
import { useMixtureStore } from '../../store/mixtureStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { useSelectionStore } from '../../store/selectionStore'
import { Section, Slider } from '../controls/Slider'
import { fmt, translateWarning } from '../../utils/format'
import { axisProps } from '../charts/chartTheme'
import { useEffectiveProjection } from '../../hooks/useProjection'
import { liftDisplacement } from '../../mathematics/projection'
import { useEffect, useState } from 'react'
import { STATIC_MODE } from '../../services/mode'
import { selectSample } from '../../services/actions'

const RUN_COLORS = ['#7ee0ff', '#5b8def', '#3ec7c2', '#d7a54a', '#c26fd6', '#7fbf6a', '#e07a6a', '#9aa7b8']

export function InverseDesignPanel() {
  const inv = useInverseDesignStore()
  const compounds = useDatasetStore((s) => s.compounds)
  const setMixture = useMixtureStore((s) => s.setMixture)
  const setVis = useVisualizationStore((s) => s.set)
  const select = useSelectionStore((s) => s.select)
  const allowed = inv.allowed ?? compounds.map((c) => c.compound_id)
  const toggle = (id: string) => {
    const next = allowed.includes(id) ? allowed.filter((x) => x !== id) : [...allowed, id]
    inv.setParams({ allowed: next.length === compounds.length ? null : next })
  }
  const lifted = Math.hypot(...inv.liftedDelta) > 1e-6
  const proj = useEffectiveProjection()
  const [precomputed, setPrecomputed] = useState<string[]>([])
  useEffect(() => {
    if (STATIC_MODE) import('../../services/staticBackend').then((m) => m.staticBackend.precomputedInverseTargets()).then(setPrecomputed)
  }, [])
  const canLift = !STATIC_MODE && !!proj && !proj.warnings.some((w) => w.startsWith('degenerate') || w.startsWith('dependent'))
  /** Controlled latent modification: z_target = z_base + P⁺Δp for an absolute view-space offset Δp. */
  const setOffset = (k: number, v: number) => {
    if (!proj || !inv.baseEmbedding) return
    const dp = [...inv.liftedDelta] as [number, number, number]
    dp[k] = v
    const dz = liftDisplacement(proj.P, dp)
    inv.setModifiedTarget(inv.baseEmbedding.map((x, i) => x + dz[i]), dp)
  }
  const res = inv.result
  const hist = res ? res.history[0].map((_, k) => Object.fromEntries([['k', k], ...res.history.map((h, s) => [`s${s}`, h[k]])])) : []
  return (
    <>
      <Section title="מטרה">
        <p className="text-[11.5px] text-slate-400">בחרו ריח ייחוס בענן כמטרה. ניתן לגרור את המטרה (◆) בתלת-ממד: z_target = z + P⁺Δp — הרמה במינימום נורמה, בחירה אחת מתוך אינסוף וקטורים בעלי אותה הטלה.</p>
        <div className="text-[12px]" data-testid="inverse-target">
          {inv.targetSampleId ? <>מטרה: <b className="text-pink-300">{inv.targetSampleId}</b>{lifted && <> · הוזזה Δp = <span className="num" dir="ltr">({inv.liftedDelta.map((v) => v.toFixed(2)).join(', ')})</span></>}</> : <span className="text-slate-500">לא נבחרה מטרה</span>}
        </div>
        {inv.baseEmbedding && canLift && (['X', 'Y', 'Z'] as const).map((a, k) => (
          <Slider key={a} label={`הזזה מבוקרת Δp ${a}`} value={inv.liftedDelta[k]} min={-3} max={3} step={0.05}
            onChange={(v) => setOffset(k, v)} format={(v) => v.toFixed(2)} testId={`inv-offset-${a.toLowerCase()}`} />
        ))}
        {!canLift && !STATIC_MODE && <div className="warn">ההטלה הנוכחית מנוונת — הרמה הופכית מושבתת.</div>}
        {STATIC_MODE && (
          <div className="space-y-1" data-testid="inverse-static-note">
            <div className="warn">בגרסת Pages האופטימיזציה (מבוססת גרדיאנט) רצה מראש בשרת עבור המטרות הבאות; הזזת מטרה ופרמטרי חיפוש זמינים בהרצה מקומית.</div>
            <div className="flex flex-wrap gap-1" dir="ltr">
              {precomputed.map((id) => (
                <button key={id} className={`chip ${inv.targetSampleId === id ? 'text-pink-300' : ''}`} onClick={() => selectSample(id)}>{id}</button>
              ))}
            </div>
          </div>
        )}
        {lifted && <button className="btn" onClick={inv.clearModification}>ביטול ההזזה</button>}
      </Section>
      <Section title="מרחב החיפוש">
        <Slider label="מספר רכיבים מרבי" value={inv.maxComponents} min={1} max={5} onChange={(v) => inv.setParams({ maxComponents: v })} testId="inv-max" />
        <Slider label="אתחולים מרובים" value={inv.nStarts} min={1} max={16} onChange={(v) => inv.setParams({ nStarts: v })} />
        <Slider label="צעדי אופטימיזציה" value={inv.steps} min={50} max={600} step={10} onChange={(v) => inv.setParams({ steps: v })} />
        <Slider label="משקל דלילות λ" value={Math.log10(inv.sparsityWeight)} min={-5} max={0} step={0.1}
          onChange={(v) => inv.setParams({ sparsityWeight: 10 ** v })} format={(v) => `1e${v.toFixed(1)}`} />
        <div>
          <div className="mb-1 flex justify-between text-[11.5px] text-slate-400"><span>תרכובות מותרות ({allowed.length})</span>
            <button className="btn-ghost" onClick={() => inv.setParams({ allowed: null })}>הכול</button></div>
          <div className="grid grid-cols-6 gap-0.5" dir="ltr">
            {compounds.map((c) => (
              <button key={c.compound_id} onClick={() => toggle(c.compound_id)} title={`${c.name} · ${c.family}${c.heldout ? ' · מוחזקת' : ''}`}
                className={`rounded px-0.5 py-0.5 text-[10px] ${allowed.includes(c.compound_id) ? 'bg-sky-800/60 text-sky-100' : 'bg-slate-800/40 text-slate-600'} ${c.heldout ? 'underline decoration-red-400/70' : ''}`}>
                {c.compound_id.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <button className="btn-primary w-full" disabled={!inv.targetEmbedding || inv.status === 'running' || !allowed.length}
          onClick={inv.run} data-testid="inverse-run">
          {inv.status === 'running' ? 'מבצע אופטימיזציה…' : 'הרצת אופטימיזציה מבוססת-מודל'}
        </button>
        {inv.error && <div className="warn">{inv.error === 'STATIC_INVERSE_UNAVAILABLE' ? 'למטרה זו אין תוצאה מחושבת מראש בגרסת Pages — בחרו אחת מהמטרות שלמעלה.' : inv.error}</div>}
      </Section>
      {res && (
        <Section title="מועמדים">
          <div className="warn">אופטימיזציה על המודל המאומן בלבד — אין זו הוכחה שהתערובת משחזרת ריח פיזיקלית.</div>
          {res.warnings.map((w) => <div key={w} className="warn">{translateWarning(w)}</div>)}
          <div className="text-[11px] text-slate-400">מרחק טיפוסי לשכן קרוב בייחוס: <span className="num">{fmt(res.reference_nn_median, 2)}</span></div>
          <div className="space-y-1" data-testid="inverse-candidates">
            {res.candidates.map((c, i) => (
              <div key={i} className={`rounded border p-1.5 text-[11.5px] ${i === 0 ? 'border-sky-500/50' : 'border-slate-800'}`}>
                <div className="flex justify-between">
                  <span>#{i + 1} · מרחק חזוי <b className="num text-slate-100">{c.distance.toFixed(3)}</b></span>
                  <button className="btn-ghost" onClick={() => { setMixture(c.components); select(null); setVis({ mode: 'simulate' }) }}>לסימולציה</button>
                </div>
                <div className="num text-slate-300" dir="ltr">{c.components.map((x) => `${x.compound_id}:${x.concentration.toFixed(3)}`).join('  ')}</div>
                {(c.on_bound.length > 0 || c.uses_heldout_compounds.length > 0 || c.novelty.outside_reference) && (
                  <div className="text-[10.5px] text-amber-300">
                    {c.on_bound.length > 0 && `בגבול הריכוז: ${c.on_bound.join(',')} `}
                    {c.uses_heldout_compounds.length > 0 && `· תרכובות מוחזקות: ${c.uses_heldout_compounds.join(',')} `}
                    {c.novelty.outside_reference && '· מחוץ להתפלגות הייחוס'}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div dir="ltr">
            <div className="text-[11px] text-slate-400" dir="rtl">התכנסות: ‖F(c) − z_target‖ לכל אתחול</div>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={hist} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
                <XAxis dataKey="k" type="number" {...axisProps} />
                <YAxis {...axisProps} width={34} domain={[0, 'auto']} />
                <ReferenceLine x={res.phase1_steps} stroke="#d7a54a" strokeDasharray="3 3" />
                {res.history.map((_, s) => <Line key={s} dataKey={`s${s}`} stroke={RUN_COLORS[s % RUN_COLORS.length]} dot={false} strokeWidth={1} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
            <div className="text-[10.5px] text-slate-500" dir="rtl">קו מקווקו: אכיפת מגבלת מספר הרכיבים ושלב עידון.</div>
          </div>
        </Section>
      )}
    </>
  )
}
