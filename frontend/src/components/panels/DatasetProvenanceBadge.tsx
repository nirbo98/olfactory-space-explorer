import { useDatasetStore } from '../../store/datasetStore'

/** Permanent provenance indicator: simulated / experimental / model prediction. */
export function DatasetProvenanceBadge() {
  const ds = useDatasetStore((s) => s.datasets?.datasets[0])
  const status = useDatasetStore((s) => s.config?.model_status)
  const synthetic = !ds || ds.kind === 'synthetic'
  const items = [
    { k: 'sim', label: 'מדומה', on: synthetic },
    { k: 'exp', label: 'ניסויי', on: !synthetic },
    { k: 'pred', label: 'תחזית מודל', on: true },
  ]
  return (
    <div className="flex items-center gap-2" data-testid="provenance-badge">
      <div className="flex overflow-hidden rounded border border-amber-500/40 text-[11px]">
        {items.map((i) => (
          <span key={i.k} className={`px-2 py-0.5 ${i.on ? 'bg-amber-500/20 text-amber-200' : 'text-slate-600 line-through'}`}>{i.label}</span>
        ))}
      </div>
      {synthetic && <span className="text-[11.5px] font-semibold text-amber-300">נתונים מדומים — לא אומתו בניסוי</span>}
      {status === 'untrained' && <span className="rounded bg-red-500/20 px-2 py-0.5 text-[11px] text-red-300">מודל לא מאומן</span>}
    </div>
  )
}
