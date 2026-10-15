import { useMemo } from 'react'
import { useDisplayedState } from '../../hooks/useDisplayedState'
import { useSimulationStore } from '../../store/simulationStore'
import { useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { BarStrip, Heatmap } from '../charts/Heatmap'
import { div, seq } from '../../utils/colors'

export function ReceptorActivityPanel() {
  const st = useDisplayedState()
  const result = useSimulationStore((s) => s.result)
  const rids = useDatasetStore((s) => s.config?.receptor_ids ?? [])
  const knockdowns = useMixtureStore((s) => s.knockdowns)
  const selected = useMixtureStore((s) => s.selectedReceptor)
  const selectReceptor = useMixtureStore((s) => s.selectReceptor)
  const view = useVisualizationStore((s) => s.receptorView)
  const setVis = useVisualizationStore((s) => s.set)
  const highlight = useMemo(() => new Set(Object.keys(knockdowns).map((r) => rids.indexOf(r))), [knockdowns, rids])
  const diff = useMemo(() => {
    if (!result || !st) return null
    return st.receptor.map((v, i) => v - result.baseline.receptor_activities[i])
  }, [st, result])
  if (!st || !result) return null
  const teacher = result.teacher_reference?.receptor_activities
  const mae = teacher && !st.temporal ? st.receptor.reduce((a, v, i) => a + Math.abs(v - teacher[i]), 0) / st.receptor.length : null
  const values = view === 'difference' && diff && !st.temporal ? diff : st.receptor
  const maxAbs = Math.max(1e-6, ...values.map(Math.abs))
  return (
    <div className="panel-section" data-testid="receptor-panel">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="section-title">פעילות רצפטורים r (64)</h3>
        <div className="flex gap-1">
          <button className={`seg ${view === 'activity' ? 'seg-on' : ''}`} onClick={() => setVis({ receptorView: 'activity' })}>r</button>
          <button className={`seg ${view === 'difference' ? 'seg-on' : ''}`} onClick={() => setVis({ receptorView: 'difference' })}
            data-testid="receptor-diff" disabled={st.temporal}>Δ מול בסיס</button>
        </div>
      </header>
      <div className="flex items-start gap-3">
        <Heatmap values={values} cols={8} cell={21} testId="receptor-heatmap" ariaLabel="מפת חום של פעילות 64 הרצפטורים"
          color={(v) => (view === 'difference' && !st.temporal ? div(v / maxAbs) : seq(v))}
          labels={(i) => rids[i]} highlight={highlight} selected={rids.indexOf(selected)}
          onSelect={(i) => selectReceptor(rids[i])} format={(v) => v.toFixed(4)} />
        <div className="flex-1 space-y-1 t-xs text-[var(--text-2)]">
          <div>{selected}: <span className="num text-[var(--text-1)]" data-testid="selected-receptor-value">{st.receptor[rids.indexOf(selected)]?.toFixed(4)}</span></div>
          {teacher && !st.temporal && <div>מורה: <span className="num text-[var(--text-1)]">{teacher[rids.indexOf(selected)]?.toFixed(4)}</span></div>}
          {mae !== null && <div title="שגיאה מוחלטת ממוצעת מול מודל המורה הסינתטי עבור התערובת הנוכחית">MAE מול מורה: <span className="num text-[var(--text-1)]">{mae.toFixed(4)}</span></div>}
          <div className="text-[var(--text-3)]">לחיצה על תא בוחרת רצפטור. ⟋ = מעוכב.</div>
        </div>
      </div>
      {!st.temporal && <BarStrip values={st.receptor} ref2={teacher} testId="receptor-bars" />}
      {!st.temporal && teacher && <div className="t-xs text-[var(--text-3)]">עמודות: תחזית התלמיד · קווים: מורה סינתטי (אמת-מידה מדומה)</div>}
    </div>
  )
}
