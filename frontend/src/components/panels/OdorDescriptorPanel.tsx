import { useSimulationStore } from '../../store/simulationStore'
import { DESCRIPTOR_HE } from '../../utils/format'

export function OdorDescriptorPanel() {
  const result = useSimulationStore((s) => s.result)
  if (!result) return null
  const teacher = result.teacher_reference?.descriptor_targets
  return (
    <div className="panel-section" data-testid="descriptor-panel">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="section-title">מתארים (סינתטיים)</h3>
        <span className="t-xs text-[var(--text-3)]">לא דיווחים אנושיים</span>
      </header>
      <div className="space-y-0.5">
        {Object.entries(result.descriptor_predictions).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[64px_1fr_40px] items-center gap-2 t-sm">
            <span className="text-[var(--text-2)]">{DESCRIPTOR_HE[k] ?? k}</span>
            <div className="relative h-2.5 rounded bg-[var(--surface-3)]" dir="ltr">
              <div className="absolute inset-y-0 left-0 rounded bg-sky-600/80" style={{ width: `${v * 100}%` }} />
              {teacher && <div className="absolute inset-y-[-2px] w-[2px] bg-[var(--text-1)]" style={{ left: `${teacher[k] * 100}%` }} title="מורה" />}
            </div>
            <span className="num text-left text-[var(--text-1)]">{v.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 t-xs text-[var(--text-3)]">עמודה: הסתברות חזויה · קו לבן: יעד המורה הסינתטי</div>
    </div>
  )
}
