import { useDisplayedState } from '../../hooks/useDisplayedState'
import { useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import { Heatmap } from '../charts/Heatmap'
import { seq } from '../../utils/colors'

export function BulbActivityPanel() {
  const st = useDisplayedState()
  const lat = useMixtureStore((s) => s.lateralInhibition)
  const trained = useDatasetStore((s) => s.config?.model_config.lateral_inhibition)
  if (!st) return null
  const max = Math.max(1e-6, ...st.bulb)
  return (
    <div className="panel-section" data-testid="bulb-panel">
      <header className="mb-1 flex items-center justify-between">
        <h3 className="section-title">בולבוס הריח b (64)</h3>
        <span className="t-xs text-[var(--text-3)]">עיכוב צידי: {(lat ?? trained) ? 'פעיל' : 'כבוי'} · max {max.toFixed(3)}</span>
      </header>
      <Heatmap values={st.bulb} cols={16} cell={14} ariaLabel="פעילות יחידות הבולבוס" color={(v) => seq(v / max)}
        labels={(i) => `B${i + 1}`} testId="bulb-heatmap" />
    </div>
  )
}
