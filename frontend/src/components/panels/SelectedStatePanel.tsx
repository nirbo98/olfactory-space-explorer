import { useDisplayedState } from '../../hooks/useDisplayedState'
import { toScene, useEffectiveProjection } from '../../hooks/useProjection'
import { useSimulationStore } from '../../store/simulationStore'
import { useMixtureStore } from '../../store/mixtureStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { fmt, translateWarning } from '../../utils/format'

export function SelectedStatePanel() {
  const st = useDisplayedState()
  const result = useSimulationStore((s) => s.result)
  const status = useSimulationStore((s) => s.status)
  const error = useSimulationStore((s) => s.error)
  const source = useMixtureStore((s) => s.sourceSampleId)
  const proj = useEffectiveProjection()
  const focus = useVisualizationStore((s) => s.focusSelected)
  const p = st && proj ? toScene(st.embedding, proj)?.map((v) => v / proj.sceneScale) : null
  return (
    <div className="panel-section" data-testid="selected-state">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="section-title">ריח נבחר</h3>
        <button className="btn-ghost" onClick={focus}>מיקוד מצלמה</button>
      </header>
      {status === 'error' && <div className="warn" role="alert">שגיאת מודל: {error}</div>}
      {!st ? <div className="text-[12px] text-slate-500">ממתין לתוצאת מודל…</div> : (
        <div className="space-y-1 text-[12px]">
          <div className="flex justify-between text-slate-400">
            <span>{source ? `ריח ייחוס ${source}` : 'תערובת שנערכה'}</span>
            <span>{st.temporal ? `פריים ${st.frame} · t=${fmt(st.time, 3)}s · גירוי ${fmt(st.stimulus, 2)}` : 'מצב יציב'}</span>
          </div>
          <div className="grid grid-cols-3 gap-1 text-center" dir="ltr">
            {(['x', 'y', 'z'] as const).map((a, k) => (
              <div key={a} className="rounded bg-slate-800/60 py-0.5">
                <div className="text-[10px] uppercase text-slate-500">{a}</div>
                <div className="num text-sky-100" data-testid={`coord-${a}`}>{p ? p[k].toFixed(3) : '—'}</div>
              </div>
            ))}
          </div>
          {result && (
            <div className="grid grid-cols-2 gap-x-2 text-[11.5px] text-slate-400">
              <span>‖Δz‖ מול בסיס (ללא עיכוב)</span>
              <span className="num text-left text-slate-200" data-testid="baseline-shift">{fmt(result.baseline.embedding_shift_norm, 4)}</span>
              <span>שכן קרוב בייחוס</span>
              <span className="num text-left text-slate-200">{result.novelty.nearest_sample} · {fmt(result.novelty.nearest_distance, 2)}</span>
              <span>עוצמה (תחזית / מורה)</span>
              <span className="num text-left text-slate-200">{fmt(st.intensity, 3)} / {fmt(result.teacher_reference?.intensity, 3)}</span>
            </div>
          )}
          {result?.novelty.outside_reference && <div className="warn">מחוץ להתפלגות הייחוס (מרחק לשכן הקרוב &gt; אחוזון 95).</div>}
          {result?.warnings.map((w) => <div key={w} className="warn">{translateWarning(w)}</div>)}
        </div>
      )}
    </div>
  )
}
