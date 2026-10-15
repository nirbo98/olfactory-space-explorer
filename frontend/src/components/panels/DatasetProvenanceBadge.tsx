import { useDatasetStore } from '../../store/datasetStore'
import { useVisualizationStore } from '../../store/visualizationStore'

/** Permanent provenance indicator: simulated / experimental / model prediction. */
export function DatasetProvenanceBadge() {
  const ds = useDatasetStore((s) => s.datasets?.datasets[0])
  const status = useDatasetStore((s) => s.config?.model_status)
  const mode = useVisualizationStore((s) => s.mode)
  if (mode === 'validation') {
    return (
      <div className="real t-xs flex items-center gap-1.5 py-0.5" data-testid="provenance-badge">
        <span aria-hidden>●</span> נתוני בני אדם אמיתיים · Keller &amp; Vosshall 2016
      </div>
    )
  }
  const synthetic = !ds || ds.kind === 'synthetic'
  const items = [
    { k: 'sim', label: 'מדומה', on: synthetic },
    { k: 'exp', label: 'ניסויי', on: !synthetic },
    { k: 'pred', label: 'תחזית מודל', on: true },
  ]
  return (
    <div className="flex items-center gap-2" data-testid="provenance-badge">
      <div className="t-xs flex overflow-hidden rounded border border-[var(--simulated-line)]">
        {items.map((i) => (
          <span key={i.k} className={`px-2 py-0.5 ${i.on ? 'bg-[var(--simulated-bg)] text-[var(--simulated)]' : 'text-[var(--text-4)] line-through'}`}>{i.label}</span>
        ))}
      </div>
      {synthetic && <span className="t-sm font-semibold text-[var(--simulated)]">נתונים מדומים — לא אומתו בניסוי</span>}
      {status === 'untrained' && <span className="t-xs rounded bg-red-500/20 px-2 py-0.5 text-red-300">מודל לא מאומן</span>}
    </div>
  )
}
