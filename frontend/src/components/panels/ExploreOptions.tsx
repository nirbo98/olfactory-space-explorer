import { useVisualizationStore, type ColorBy } from '../../store/visualizationStore'
import { Section, Toggle } from '../controls/Slider'

export function ExploreOptions() {
  const v = useVisualizationStore()
  return (
    <Section title="תצוגה" aside={<button className="btn-ghost" onClick={v.resetCamera} data-testid="camera-reset">איפוס מצלמה</button>}>
      <div className="grid grid-cols-2 gap-1.5">
        <Toggle label="ריחות ייחוס" checked={v.showReference} onChange={(x) => v.set({ showReference: x })} testId="toggle-reference" />
        <Toggle label="שכנים (256D)" checked={v.showNeighbors} onChange={(x) => v.set({ showNeighbors: x })} />
        <Toggle label="סדרות ריכוז" checked={v.showConnections} onChange={(x) => v.set({ showConnections: x })} />
        <Toggle label="מסלול זמני" checked={v.showTrajectory} onChange={(x) => v.set({ showTrajectory: x })} />
        <Toggle label="רשת" checked={v.showGrid} onChange={(x) => v.set({ showGrid: x })} />
      </div>
      <label className="flex items-center justify-between t-sm text-[var(--text-2)]">
        צביעה לפי
        <select className="input" value={v.colorBy} onChange={(e) => v.set({ colorBy: e.target.value as ColorBy })}>
          <option value="cluster">אשכול (k-means ב-256D)</option>
          <option value="split">פיצול אימון/מבחן</option>
          <option value="family">משפחת הרכיב הראשון</option>
        </select>
      </label>
    </Section>
  )
}
