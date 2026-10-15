import { useMixtureStore } from '../../store/mixtureStore'
import { useSimulationStore, frameIndex } from '../../store/simulationStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { useDatasetStore } from '../../store/datasetStore'

export function TemporalPlaybackControls() {
  const sim = useSimulationStore()
  const scenarioId = useMixtureStore((s) => s.scenarioId)
  const setScenario = useMixtureStore((s) => s.setScenario)
  const scenarios = useDatasetStore((s) => s.config?.scenarios ?? [])
  const displayState = useVisualizationStore((s) => s.displayState)
  const setVis = useVisualizationStore((s) => s.set)
  const tr = sim.result?.trajectory
  const end = tr?.times.at(-1) ?? 4
  const k = tr ? frameIndex(tr.times, sim.time) : 0
  const sc = tr?.scenario
  const timeMode = () => setVis({ displayState: 'time' })
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid="timeline">
      <div className="flex gap-1">
        <button className="btn" onClick={() => { timeMode(); sim.play() }} disabled={!tr || sim.playing} data-testid="play">▶ הפעלה</button>
        <button className="btn" onClick={sim.pause} disabled={!sim.playing} data-testid="pause">❚❚ השהיה</button>
        <button className="btn" onClick={() => { sim.resetTime(); setVis({ displayState: 'steady' }) }} data-testid="reset-time">↺ איפוס</button>
        <label className="flex items-center gap-1 t-sm text-[var(--text-2)]">
          <input type="checkbox" checked={sim.loop} onChange={(e) => sim.setLoop(e.target.checked)} data-testid="loop" /> לולאה
        </label>
      </div>
      <div className="flex min-w-[260px] flex-1 items-center gap-2">
        <span className="t-sm text-[var(--text-2)]">זמן</span>
        <div className="relative flex-1" dir="ltr">
          {sc && (
            <div className="pointer-events-none absolute top-0 h-1 rounded bg-sky-500/30"
              style={{ left: `${(sc.onset / end) * 100}%`, width: `${(sc.duration / end) * 100}%` }} />
          )}
          <input type="range" min={0} max={end} step={0.001} value={Math.min(sim.time, end)} dir="ltr" className="w-full"
            aria-label="זמן סימולציה" data-testid="time-slider"
            onChange={(e) => { timeMode(); sim.pause(); sim.setTime(Number(e.target.value)) }} />
        </div>
        <output className="num w-[190px] whitespace-nowrap t-sm text-sky-100" data-testid="time-value" dir="ltr">
          t = {sim.time.toFixed(3)} s · frame {k}/{(tr?.times.length ?? 1) - 1}
        </output>
      </div>
      <label className="flex items-center gap-1 t-sm text-[var(--text-2)]">
        מהירות
        <select className="input" value={sim.speed} onChange={(e) => sim.setSpeed(Number(e.target.value))} data-testid="speed">
          {[0.1, 0.25, 0.5, 1, 2].map((v) => <option key={v} value={v}>×{v}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1 t-sm text-[var(--text-2)]">
        פרוטוקול
        <select className="input" value={scenarioId} onChange={(e) => setScenario(e.target.value)} data-testid="scenario">
          {scenarios.map((s) => <option key={s.id} value={s.id}>{s.name_he}</option>)}
        </select>
      </label>
      <div role="radiogroup" aria-label="מצב תצוגה" className="flex gap-1">
        <button role="radio" aria-checked={displayState === 'steady'} className={`seg ${displayState === 'steady' ? 'seg-on' : ''}`}
          onClick={() => setVis({ displayState: 'steady' })}>מצב יציב</button>
        <button role="radio" aria-checked={displayState === 'time'} className={`seg ${displayState === 'time' ? 'seg-on' : ''}`}
          onClick={timeMode} data-testid="display-time">רגע t</button>
      </div>
      {sc && (
        <div className="w-full t-xs text-[var(--text-3)]" dir="rtl">
          הופעה {sc.onset.toFixed(2)}s · גירוי {sc.duration.toFixed(2)}s · התאוששות {sc.recovery.toFixed(2)}s · סה״כ {sc.total.toFixed(1)}s
          · {tr?.times.length} פריימים (Δt = {(tr!.dt * 1000).toFixed(1)}ms){sc.frequency ? ` · קצב רחרוח ${sc.frequency}Hz` : ''}
        </div>
      )}
    </div>
  )
}
