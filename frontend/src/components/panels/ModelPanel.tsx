import { useDatasetStore } from '../../store/datasetStore'
import { Section } from '../controls/Slider'

const STAGE_HE: Record<string, string> = {
  molecular_encoder: 'מקודד מולקולרי', receptor_interaction: 'קשירה מולקולה–רצפטור', olfactory_bulb: 'בולבוס הריח',
  piriform_cortex: 'קורטקס פיריפורמי (GRU דליל)', odor_embedding: 'שיכון ריח',
}

export function ModelPanel() {
  const cfg = useDatasetStore((s) => s.config)
  if (!cfg) return null
  const mc = cfg.model_config
  return (
    <>
      <Section title="ארכיטקטורה">
        <ol className="space-y-1 t-sm">
          {cfg.architecture.map((a) => (
            <li key={a.stage} className="flex justify-between rounded bg-[var(--surface-2)] px-2 py-1">
              <span>{STAGE_HE[a.stage] ?? a.stage}</span>
              <span className="num text-[var(--text-2)]" dir="ltr">{a.space} ∈ ℝ^{a.shape[0]}</span>
            </li>
          ))}
        </ol>
        <p className="t-xs text-[var(--text-3)]"><span dir="ltr" className="num">ℋ_M ⊗ ℋ_E → ℋ_R → ℋ_B → ℋ_P</span> הם מרחבי תכונות קלאסיים; הסימון אינו מרמז על חישוב קוונטי.</p>
      </Section>
      <Section title="תצורה">
        <dl className="kv">
          <dt>גרסה</dt><dd className="num">{cfg.model_version} · {cfg.model_status === 'trained' ? 'מאומן' : 'לא מאומן'}</dd>
          <dt>דלילות קורטקס</dt><dd className="num">{mc.sparsity ? `${Math.round(mc.sparsity * 100)}%` : 'כבוי'}</dd>
          <dt>עיכוב צידי</dt><dd>{mc.lateral_inhibition ? 'פעיל' : 'כבוי'}</dd>
          <dt>קורטקס</dt><dd className="num">{mc.cortex_type}, {mc.settle_steps} צעדי התייצבות</dd>
          <dt>τ בולבוס</dt><dd className="num">[{mc.tau_min}, {mc.tau_max}] s</dd>
          {cfg.training && <><dt>אימון</dt><dd className="num">{cfg.training.epochs_run} epochs (best {cfg.training.best_epoch}), {cfg.training.training_seconds}s, lr {cfg.training.train_config.lr}</dd></>}
        </dl>
        <p className="t-xs text-[var(--text-3)]"><span dir="ltr" className="num">r_j = Σᵢ εᵢⱼ cᵢ/Kᵢⱼ / (1 + Σᵢ cᵢ/Kᵢⱼ)</span> — מודל קשירה תחרותית מפושט, לא חוק פיזיקלי כללי.</p>
      </Section>
    </>
  )
}
