import { useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import { Section, Slider, Toggle } from './Slider'

/** Receptor inhibition, virtual knockout and network ablation switches (all feed the model). */
export function ReceptorKnockoutControls() {
  const m = useMixtureStore()
  const cfg = useDatasetStore((s) => s.config)
  const rids = cfg?.receptor_ids ?? []
  const kd = m.knockdowns[m.selectedReceptor] ?? 0
  const trainedSparsity = cfg?.model_config.sparsity
  return (
    <>
      <Section title="רצפטורים מדומים" aside={<span className="t-xs text-[var(--text-3)]">ערוצים חישוביים, לא רצפטורים אנושיים</span>}>
        <select className="input w-full" value={m.selectedReceptor} onChange={(e) => m.selectReceptor(e.target.value)}
          aria-label="בחירת רצפטור" data-testid="receptor-select">
          {rids.map((r) => <option key={r} value={r}>{r}{m.knockdowns[r] ? ` (−${Math.round(m.knockdowns[r] * 100)}%)` : ''}</option>)}
        </select>
        <Slider label={`עיכוב ${m.selectedReceptor}`} value={Math.round(kd * 100)} min={0} max={100} step={1}
          onChange={(v) => m.setKnockdown(m.selectedReceptor, v / 100)} format={(v) => `${v}%`} testId="receptor-inhibition" />
        <div className="flex gap-1">
          <button className="btn flex-1" onClick={() => m.knockout(m.selectedReceptor)} data-testid="receptor-knockout">נטרול מלא (knockout)</button>
          <button className="btn flex-1" onClick={m.clearKnockdowns} disabled={!Object.keys(m.knockdowns).length}>ביטול הכול</button>
        </div>
        {Object.keys(m.knockdowns).length > 0 && (
          <div className="flex flex-wrap gap-1" dir="ltr">
            {Object.entries(m.knockdowns).map(([r, f]) => (
              <span key={r} className="chip">{r} −{Math.round(f * 100)}%</span>
            ))}
          </div>
        )}
      </Section>
      <Section title="מנגנונים רשתיים">
        <Toggle label="עיכוב צידי בבולבוס" checked={m.lateralInhibition ?? cfg?.model_config.lateral_inhibition ?? true}
          onChange={(v) => m.setLateralInhibition(v === cfg?.model_config.lateral_inhibition ? null : v)} testId="lateral-toggle" />
        <div role="radiogroup" aria-label="דלילות קורטיקלית" className="grid grid-cols-3 gap-1">
          {([['trained', `כמו באימון (${trainedSparsity ? Math.round(trainedSparsity * 100) + '%' : 'כבוי'})`], ['custom', 'מותאם'], ['off', 'כבוי']] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={m.sparsityMode === k} className={`seg ${m.sparsityMode === k ? 'seg-on' : ''}`}
              onClick={() => m.setSparsityMode(k)}>{l}</button>
          ))}
        </div>
        {m.sparsityMode === 'custom' && (
          <Slider label="שיעור יחידות פעילות" value={m.sparsity} min={0.05} max={1} step={0.01} onChange={m.setSparsity}
            format={(v) => `${Math.round(v * 100)}%`} testId="sparsity-slider" />
        )}
        {(m.sparsityMode !== 'trained' || m.lateralInhibition !== null) && (
          <p className="t-xs text-amber-300/90">אבלציה בזמן היסק: המודל אומן בתנאים אחרים.</p>
        )}
      </Section>
    </>
  )
}
