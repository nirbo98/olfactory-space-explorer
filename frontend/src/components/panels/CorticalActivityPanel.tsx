import { useDisplayedState } from '../../hooks/useDisplayedState'
import { Heatmap } from '../charts/Heatmap'
import { div } from '../../utils/colors'

export function CorticalActivityPanel() {
  const st = useDisplayedState()
  if (!st) return null
  const active = st.cortical.filter((v) => v !== 0).length
  const cmax = Math.max(1e-6, ...st.cortical.map(Math.abs))
  return (
    <div className="panel-section" data-testid="cortex-panel">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="section-title">קורטקס פיריפורמי · z</h3>
        <span className="num t-xs text-[var(--text-3)]" data-testid="cortex-active">{active}/256 פעילות</span>
      </header>
      <div className="flex gap-3">
        <div>
          <div className="mb-0.5 t-xs text-[var(--text-3)]">פעילות מוסתרת (אחרי דלילות)</div>
          <Heatmap values={st.cortical} cols={16} cell={9} ariaLabel="פעילות קורטיקלית" color={(v) => div(v / cmax)}
            labels={(i) => `h${i}`} />
        </div>
        <div>
          <div className="mb-0.5 t-xs text-[var(--text-3)]">וקטור ריח z ∈ ℝ²⁵⁶</div>
          <Heatmap values={st.embedding} cols={16} cell={9} ariaLabel="וקטור הריח הלטנטי" color={(v) => div(v / 2.5)}
            labels={(i) => `z[${i}]`} testId="latent-heatmap" />
        </div>
      </div>
    </div>
  )
}
