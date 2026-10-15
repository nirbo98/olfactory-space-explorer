import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError } from '../../services/api'
import { STATIC_MODE } from '../../services/mode'
import { TOKENS } from '../../theme/tokens'
import type { ProtocolResult, ValidationResponse, Verdict } from '../../types/api'

export const TARGET_HE: Record<string, string> = {
  INTENSITY: 'עוצמה', PLEASANTNESS: 'נעימות', EDIBLE: 'אכיל', BAKERY: 'מאפייה', SWEET: 'מתוק', FRUIT: 'פירותי',
  FISH: 'דגי', GARLIC: 'שום', SPICES: 'תבלינים', COLD: 'קריר', SOUR: 'חמוץ', BURNT: 'שרוף', ACID: 'חומצי',
  WARM: 'חמים', MUSKY: 'מאסקי', SWEATY: 'זיעה', 'AMMONIA/URINOUS': 'אמוניה/שתן', DECAYED: 'רקוב', WOOD: 'עצי',
  GRASS: 'עשבי', FLOWER: 'פרחוני', CHEMICAL: 'כימי',
}
const OSE = 'ose'
const f2 = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(2))
const pct = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? '—' : `${Math.round(x * 100)}%`)
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

export function bestBaseline(p: ProtocolResult): string {
  return Object.keys(p.summary).filter((m) => m !== OSE)
    .sort((a, b) => p.summary[b].mean_r - p.summary[a].mean_r)[0]
}

function useValidation() {
  const [state, setState] = useState<{ data?: ValidationResponse; error?: string; missing?: boolean }>({})
  useEffect(() => {
    let live = true
    api.validation().then((data) => live && setState({ data }))
      .catch((e: unknown) => live && setState({ error: String((e as Error).message), missing: e instanceof ApiError && e.status === 404 }))
    return () => { live = false }
  }, [])
  return state
}

export function ValidationPage() {
  const { data, error, missing } = useValidation()
  if (error) {
    return (
      <div className="card space-y-2" data-testid="validation-missing">
        <h2 className="t-lg font-semibold">אין עדיין תוצאות אימות</h2>
        {missing && !STATIC_MODE
          ? <p className="t-sm text-[var(--text-2)]">הריצו <code dir="ltr">make fetch-real benchmark</code> (כ-30 דקות על CPU) ורעננו.</p>
          : <p className="t-sm text-[var(--text-2)]">{error}</p>}
      </div>
    )
  }
  if (!data) return <div className="t-sm text-[var(--text-3)]" role="status">טוען תוצאות אימות…</div>
  return <ValidationReport data={data} />
}

export function ValidationReport({ data }: { data: ValidationResponse }) {
  const protocols = Object.keys(data.protocols)
  const [proto, setProto] = useState(protocols.includes('scaffold') ? 'scaffold' : protocols[0])
  const [showAll, setShowAll] = useState(false)
  const p = data.protocols[proto]
  const best = bestBaseline(p)
  const ceilMedian = median(Object.values(data.ceilings).map((c) => c.ceiling))
  const ose = p.summary[OSE]
  const verdicts = data.protocols.scaffold?.verdicts
  const d = data.dataset

  return (
    <article className="space-y-6" data-testid="validation-page">
      <header className="space-y-3">
        <div className="real inline-flex items-center gap-2" data-testid="real-data-badge">
          <span aria-hidden>●</span> נתוני בני אדם אמיתיים · {d.n_subjects} נבדקים · {d.n_molecules_used} מולקולות
        </div>
        <h2 className="text-[22px] font-semibold leading-snug text-[var(--text-1)]">
          האם המבנה ה״ביולוגי״ של המודל חוזה תפיסת ריח אנושית טוב יותר ממודל כימי פשוט?
        </h2>
        <p className="t-base leading-relaxed text-[var(--text-2)]">
          כל המדדים בשאר האפליקציה מודדים התאמה למורה סינתטי. כאן המודל נבחן על דירוגי ריח אמיתיים, על מולקולות שלא ראה באימון,
          מול ארבעה מודלים כימיים ובהשוואה לתקרת הרעש — הגבול העליון שהסכמה בין הנבדקים מאפשרת. ההשערות וכללי ההכרעה
          נרשמו מראש, לפני ההרצה
          (<code dir="ltr">documentation/PREREGISTRATION_KELLER_HE.md</code>).
        </p>
        <p className="t-xs text-[var(--text-3)]" dir="ltr">
          {d.citation.replace(/\s*doi:\S+$/, '')} <a className="text-sky-300 hover:underline" href={`https://doi.org/${d.doi}`} target="_blank" rel="noopener noreferrer">doi:{d.doi}</a> · {d.license}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="t-sm text-[var(--text-3)]">חלוקה:</span>
        {protocols.map((k) => (
          <button key={k} className={`seg ${proto === k ? 'seg-on' : ''}`} aria-pressed={proto === k} onClick={() => setProto(k)}
            data-testid={`protocol-${k}`}>{k === 'scaffold' ? 'לפי שלד כימי (ראשית)' : 'אקראית (השוואה)'}</button>
        ))}
        <span className="t-xs text-[var(--text-4)]" dir="ltr">{data.protocol_labels[proto]}</span>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="סיכום">
        <Stat label="תקרת רעש (חציון)" value={f2(ceilMedian)} hint="√ אמינות Spearman–Brown" />
        <Stat label={`הטוב מבין הבסיסיים · ${data.models[best]}`} value={f2(p.summary[best].mean_r)} hint={`r ממוצע · CI ${f2(p.summary[best].mean_r_ci[0])}–${f2(p.summary[best].mean_r_ci[1])}`} />
        {ose && <Stat label="OSE" value={f2(ose.mean_r)} hint={`r ממוצע · CI ${f2(ose.mean_r_ci[0])}–${f2(ose.mean_r_ci[1])}`} testId="stat-ose" />}
        {ose && <Stat label="OSE מתוך התקרה" value={pct(ose.mean_frac_ceiling)} hint={`${data.models[best]}: ${pct(p.summary[best].mean_frac_ceiling)}`} />}
      </section>

      {verdicts && proto === 'scaffold' && <Verdicts v={verdicts} models={data.models} />}

      <section className="card space-y-3" aria-labelledby="dotplot-title">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 id="dotplot-title" className="t-base font-semibold">דיוק החיזוי לכל תכונת ריח</h3>
          <label className="t-xs flex items-center gap-1.5 text-[var(--text-2)]">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} data-testid="show-all-baselines" />
            הצג את כל המודלים הבסיסיים
          </label>
        </div>
        <p className="t-xs text-[var(--text-3)]">
          Pearson r בין חיזוי לממוצע הנבדקים, על מולקולות מוחזקות (out-of-fold). הפס האפור: תקרת הרעש של אותה תכונה. קווים: רווח סמך 95% (bootstrap על מולקולות).
        </p>
        <DotPlot data={data} p={p} best={best} showAll={showAll} />
      </section>

      {ose && <DoseCard p={p} best={best} models={data.models} />}

      <details className="card" data-testid="validation-table">
        <summary className="t-sm cursor-pointer font-medium">טבלת כל הערכים</summary>
        <ScoreTable data={data} p={p} />
      </details>

      <details className="card space-y-2">
        <summary className="t-sm cursor-pointer font-medium">שיטות</summary>
        <ul className="t-sm list-disc space-y-1 ps-5 text-[var(--text-2)]">
          <li>{data.metric}.</li>
          <li>5 חלוקות לפי שלד Bemis–Murcko ({d.n_scaffold_groups} קבוצות; מולקולות ללא טבעת מקובצות לפי שלד פחמני). שני הדילולים של מולקולה תמיד באותה חלוקה.</li>
          <li>תקרת רעש: חציית הנבדקים אקראית 200 פעמים, תיקון Spearman–Brown, ‏√אמינות.</li>
          <li>בסיסיים: Ridge, Random Forest (Morgan / RDKit 2D), MLP — היפר-פרמטרים קבועים מראש.</li>
          <li>OSE: אותה ארכיטקטורה של הדמו (קשירה תחרותית → בולבוס → קורטקס), מאומנת מאפס בכל חלוקה, בלי נתוני קולטנים — 64 הערוצים הם שכבה לטנטית.</li>
          {d.coding_rules.map((r) => <li key={r} dir="ltr" className="text-start">{r}</li>)}
        </ul>
      </details>

      <details className="card space-y-2">
        <summary className="t-sm cursor-pointer font-medium">מה המבחן הזה לא אומר</summary>
        <ul className="t-sm list-disc space-y-1 ps-5 text-[var(--text-2)]">
          <li>מבחן אחד, על מולקולות בודדות. אין כאן תערובות, ולכן החלקים של המודל שעוסקים בתחרות בין מולקולות לא נבדקו.</li>
          <li>אין נתוני קולטנים: ה״קולטנים״ ב-OSE הם ייצוג לטנטי, ושום דבר כאן לא מאמת שהם דומים לקולטנים אמיתיים.</li>
          <li>ריכוז ה-headspace לא נמדד; הדילול בשמן ממופה לריכוז בהנחה מוצהרת, ולחץ אדים לא ממודל.</li>
          <li>55 נבדקים מניו-יורק; אין הכללה לאוכלוסיות אחרות.</li>
        </ul>
      </details>
    </article>
  )
}

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="card" data-testid={testId}>
      <div className="t-xs text-[var(--text-3)]">{label}</div>
      <div className="num mt-1 text-[28px] font-semibold leading-none text-[var(--text-1)]" dir="ltr" style={{ textAlign: 'start', fontVariantNumeric: 'normal' }}>{value}</div>
      {hint && <div className="t-xs mt-1.5 text-[var(--text-4)]" dir="ltr" style={{ textAlign: 'start' }}>{hint}</div>}
    </div>
  )
}

const OUTCOME = {
  supported: { icon: '✓', label: 'נתמכה', color: TOKENS.good },
  rejected: { icon: '✕', label: 'לא נתמכה', color: TOKENS.critical },
  null: { icon: '≈', label: 'אין הבדל מובהק', color: TOKENS.warning },
  uninformative: { icon: '!', label: 'נתמכה לפי הכלל — אך לא אינפורמטיבית', color: TOKENS.warning },
} as const

function Verdicts({ v, models }: { v: Record<string, Verdict>; models: Record<string, string> }) {
  const ev = (h: string) => v[h]?.evidence as Record<string, unknown>
  const deltaText = (h: string) => {
    const e = ev(h) as { vs: string; delta_mean_r: number; ci: [number, number] } | undefined
    return e ? `Δr = ${e.delta_mean_r >= 0 ? '+' : ''}${f2(e.delta_mean_r)} (CI ${f2(e.ci[0])}…${f2(e.ci[1])}) מול ${models[e.vs]}` : ''
  }
  const items: { id: string; title: string; detail: ReactNode }[] = [
    { id: 'H1', title: 'עוצמה ונעימות הן התכונות האמינות ביותר',
      detail: `דירוג אמינות: עוצמה ${ev('H1')?.rank_intensity}, נעימות ${ev('H1')?.rank_pleasantness} מתוך ${ev('H1')?.n_targets} (סף: 5)` },
    { id: 'H2', title: 'מבנה כימי מנבא תפיסה במולקולות חדשות',
      detail: `RF · Morgan — CI תחתון: עוצמה ${f2((ev('H2')?.intensity_ci as number[])?.[0])}, נעימות ${f2((ev('H2')?.pleasantness_ci as number[])?.[0])} (סף: > 0)` },
    { id: 'H3', title: 'OSE עדיף על הבסיסי הטוב ביותר', detail: deltaText('H3') },
    { id: 'H3b', title: 'המבנה ה״ביולוגי״ מוסיף על רשת נוירונים כללית', detail: deltaText('H3b') },
    { id: 'H4', title: 'כיוון השפעת הריכוז על העוצמה נלמד נכון',
      detail: `התאמת כיוון: ${pct(ev('H4')?.sign_agreement as number)} (סף: 80%, מקרי: 50%)` },
  ].filter((i) => v[i.id])
  return (
    <section aria-labelledby="verdicts-title" className="space-y-2">
      <h3 id="verdicts-title" className="t-base font-semibold">השערות שנרשמו מראש</h3>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((i) => {
          const vv = v[i.id]
          const uninformative = vv.supported && vv.post_hoc && !vv.post_hoc.beats_majority
          const o = vv.outcome === 'no_detectable_difference' ? OUTCOME.null : uninformative ? OUTCOME.uninformative
            : vv.supported ? OUTCOME.supported : OUTCOME.rejected
          return (
            <div key={i.id} className="card flex gap-3" data-testid={`verdict-${i.id}`}>
              <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full t-sm font-semibold"
                style={{ background: `${o.color}26`, color: o.color, border: `1px solid ${o.color}66` }} aria-hidden>{o.icon}</span>
              <div className="min-w-0 space-y-0.5">
                <div className="t-sm"><span className="num text-[var(--text-3)]">{i.id}</span> · {i.title}</div>
                <div className="t-xs font-semibold" style={{ color: o.color }}>{o.label}</div>
                <div className="t-xs text-[var(--text-3)]">{i.detail}</div>
                {uninformative && (
                  <div className="t-xs text-[var(--text-2)]" data-testid={`posthoc-${i.id}`}>
                    הערה שנוספה בדיעבד: מנבא קבוע ״תמיד עולה״ משיג {pct(vv.post_hoc!.majority_rate)} — אותו ציון. רף המקריות שנרשם (50%) היה שגוי; הכלל לא שונה.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function DotPlot({ data, p, best, showAll }: { data: ValidationResponse; p: ProtocolResult; best: string; showAll: boolean }) {
  const targets = useMemo(() => [...data.dataset.targets].sort((a, b) => data.ceilings[b].ceiling - data.ceilings[a].ceiling), [data])
  const models = Object.keys(p.per_target)
  const others = models.filter((m) => m !== OSE && m !== best)
  const lo = Math.min(0, ...models.flatMap((m) => targets.map((t) => p.per_target[m][t].ci[0] ?? 0)))
  const x0 = Math.floor(lo * 10) / 10
  const x = (v: number) => `${((v - x0) / (1 - x0)) * 100}%`
  const ticks = Array.from({ length: Math.round((1 - x0) / 0.2) + 1 }, (_, i) => +(x0 + i * 0.2).toFixed(1)).filter((t) => t <= 1)
  const [hover, setHover] = useState<string | null>(null)
  const series = [
    ...(p.per_target[OSE] ? [{ id: OSE, color: TOKENS['series-1'], label: data.models[OSE], size: 10 }] : []),
    { id: best, color: TOKENS['series-2'], label: data.models[best], size: 10 },
    ...(showAll ? others.map((m) => ({ id: m, color: TOKENS['series-muted'], label: data.models[m], size: 7 })) : []),
  ]
  return (
    <div data-testid="dotplot">
      <div className="t-xs mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[var(--text-2)]" aria-label="מקרא">
        {[...series.filter((s) => s.size > 7), ...(showAll ? [{ id: 'others', color: TOKENS['series-muted'], label: 'מודלים בסיסיים אחרים' }] : [])].map((s) => (
          <span key={s.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block rounded-full" style={{ width: 9, height: 9, background: s.color }} />
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: TOKENS['surface-hover'] }} />תקרת רעש
        </span>
      </div>
      <div className="grid grid-cols-[minmax(76px,104px)_1fr] items-center gap-x-3">
        {targets.map((t) => {
          const c = data.ceilings[t].ceiling
          return (
            <div key={t} className="contents" onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover((h) => (h === t ? null : h))}>
              <div className={`t-sm truncate py-[5px] ${hover === t ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]'}`} title={t}>{TARGET_HE[t] ?? t}</div>
              <div className="relative h-[26px]" dir="ltr" data-testid={`dot-row-${t}`}>
                <div className="absolute inset-y-[7px] rounded-sm" style={{ left: x(Math.max(x0, 0)), width: `calc(${x(c)} - ${x(Math.max(x0, 0))})`, background: TOKENS['surface-hover'] }} />
                <div className="absolute inset-y-[4px] w-[2px]" style={{ left: x(c), background: TOKENS['text-4'] }} />
                {x0 < 0 && <div className="absolute inset-y-0 w-px" style={{ left: x(0), background: TOKENS['line-2'] }} />}
                {[...series].reverse().map((s) => {
                  const sc = p.per_target[s.id][t]
                  if (sc.r == null) return null
                  return (
                    <div key={s.id}>
                      {sc.ci[0] != null && sc.ci[1] != null && s.color !== TOKENS['series-muted'] && (
                        <div className="absolute top-1/2 h-[2px] -translate-y-1/2 rounded" style={{ left: x(sc.ci[0]), width: `calc(${x(sc.ci[1])} - ${x(sc.ci[0])})`, background: s.color, opacity: 0.45 }} />
                      )}
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ left: x(sc.r), width: s.size, height: s.size, background: s.color, boxShadow: `0 0 0 2px ${TOKENS['surface-1']}` }} />
                    </div>
                  )
                })}
                {hover === t && (
                  <div className="tooltip t-xs pointer-events-none absolute z-10" style={{ left: `min(${x(Math.max(...series.map((s) => p.per_target[s.id][t].r ?? 0), c))}, 70%)`, top: '50%', transform: 'translate(14px,-50%)' }} role="tooltip">
                    <div className="mb-1 font-semibold text-[var(--text-1)]">{TARGET_HE[t]} · {t}</div>
                    <div className="text-[var(--text-3)]">ceiling {f2(c)}</div>
                    {models.map((m) => (
                      <div key={m} className="num flex justify-between gap-4"><span className="text-[var(--text-2)]">{data.models[m]}</span><span>{f2(p.per_target[m][t].r)}</span></div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div />
        <div className="relative mt-1 h-5 border-t border-[var(--line-2)]" dir="ltr" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="axis-tick absolute top-1 -translate-x-1/2" style={{ left: x(t), fontSize: 11, color: TOKENS['chart-tick'] }}>{t.toFixed(1)}</span>
          ))}
        </div>
        <div />
        <div className="t-xs text-center text-[var(--text-3)]">Pearson r</div>
      </div>
    </div>
  )
}

function DoseCard({ p, best, models }: { p: ProtocolResult; best: string; models: Record<string, string> }) {
  const rows = [OSE, best].filter((m) => p.dose[m])
  return (
    <section className="card space-y-3" aria-labelledby="dose-title">
      <h3 id="dose-title" className="t-base font-semibold">מינון: האם העוצמה החזויה עולה עם הריכוז כמו אצל בני אדם?</h3>
      <p className="t-xs text-[var(--text-3)]">
        לכל מולקולה נמדדו שני דילולים. אצל הנבדקים העוצמה עלתה עם הריכוז ב-{pct(p.dose[OSE]?.observed_increase_fraction)} מהמולקולות.
        המדד: בכמה מהמולקולות כיוון השינוי החזוי זהה לנצפה.
      </p>
      <div className="space-y-2">
        {rows.map((m, i) => {
          const d = p.dose[m]
          return (
            <div key={m} className="grid grid-cols-[minmax(110px,160px)_1fr_56px] items-center gap-3">
              <span className="t-sm text-[var(--text-2)]">{models[m]}</span>
              <div className="relative h-3 rounded-sm bg-[var(--surface-2)]" dir="ltr">
                <div className="absolute inset-y-0 left-0 rounded-e-[4px]" style={{ width: `${d.sign_agreement * 100}%`, background: i === 0 ? TOKENS['series-1'] : TOKENS['series-2'] }} />
                <div className="absolute inset-y-[-3px] w-px" style={{ left: '50%', background: TOKENS['text-4'] }} title="מקרי" />
                <div className="absolute inset-y-[-3px] w-px" style={{ left: '80%', background: TOKENS['text-2'] }} title="סף H4" />
              </div>
              <span className="num t-sm" dir="ltr">{pct(d.sign_agreement)}</span>
            </div>
          )
        })}
        <div className="t-xs grid grid-cols-[minmax(110px,160px)_1fr_56px] gap-3 text-[var(--text-4)]">
          <span /><span dir="ltr" className="relative h-4"><span className="absolute -translate-x-1/2" style={{ left: '50%' }}>מקרי 50%</span><span className="absolute -translate-x-1/2" style={{ left: '80%' }}>סף 80%</span></span><span />
        </div>
      </div>
    </section>
  )
}

function ScoreTable({ data, p }: { data: ValidationResponse; p: ProtocolResult }) {
  const models = Object.keys(p.per_target)
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="metrics t-xs w-full" dir="ltr">
        <thead><tr><th style={{ textAlign: 'start' }}>target</th><th>ceiling</th><th>test–retest</th>{models.map((m) => <th key={m}>{data.models[m]}</th>)}</tr></thead>
        <tbody>
          {data.dataset.targets.map((t) => (
            <tr key={t}>
              <td style={{ textAlign: 'start' }} className="text-[var(--text-2)]">{t} · {TARGET_HE[t]}</td>
              <td className="num">{f2(data.ceilings[t].ceiling)}</td>
              <td className="num">{f2(data.ceilings[t].test_retest?.r)}</td>
              {models.map((m) => <td key={m} className="num">{f2(p.per_target[m][t].r)}</td>)}
            </tr>
          ))}
          <tr>
            <td style={{ textAlign: 'start' }} className="font-semibold">mean r</td><td /><td />
            {models.map((m) => <td key={m} className="num font-semibold">{f2(p.summary[m].mean_r)}</td>)}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
