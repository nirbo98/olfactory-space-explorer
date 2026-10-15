import { useEffect } from 'react'
import { useDatasetStore } from '../store/datasetStore'
import { useVisualizationStore, type AppMode, type BottomTab } from '../store/visualizationStore'
import { useSelectionStore } from '../store/selectionStore'
import { useInverseDesignStore } from '../store/inverseDesignStore'
import { useSimulationStore } from '../store/simulationStore'
import { startSimulationController } from '../services/simulationController'
import { usePlaybackLoop } from '../hooks/usePlaybackLoop'
import { OdorSpaceScene } from '../components/visualization/OdorSpaceScene'
import { ProjectionModeSelector } from '../components/controls/ProjectionModeSelector'
import { DimensionSelector } from '../components/controls/DimensionSelector'
import { MoleculeMixtureEditor } from '../components/controls/MoleculeMixtureEditor'
import { ReceptorKnockoutControls } from '../components/controls/ReceptorKnockoutControls'
import { TemporalPlaybackControls } from '../components/controls/TemporalPlaybackControls'
import { ExploreOptions } from '../components/panels/ExploreOptions'
import { InverseDesignPanel } from '../components/panels/InverseDesignPanel'
import { DatasetPanel } from '../components/panels/DatasetPanel'
import { ModelPanel } from '../components/panels/ModelPanel'
import { SciencePanel } from '../components/panels/SciencePanel'
import { ValidationPage } from '../components/pages/ValidationPage'
import { TabList } from '../components/controls/TabList'
import { SelectedStatePanel } from '../components/panels/SelectedStatePanel'
import { ReceptorActivityPanel } from '../components/panels/ReceptorActivityPanel'
import { BulbActivityPanel } from '../components/panels/BulbActivityPanel'
import { CorticalActivityPanel } from '../components/panels/CorticalActivityPanel'
import { OdorDescriptorPanel } from '../components/panels/OdorDescriptorPanel'
import { DatasetProvenanceBadge } from '../components/panels/DatasetProvenanceBadge'
import { TimeSeriesPanel } from '../components/charts/TimeSeriesPanel'
import { FourierAnalysisPanel } from '../components/charts/FourierAnalysisPanel'
import { TaylorApproximationPanel } from '../components/charts/TaylorApproximationPanel'
import { DoseResponsePanel } from '../components/charts/DoseResponsePanel'
import { ModelMetricsPanel } from '../components/charts/ModelMetricsPanel'
import { sampleEmbedding } from '../store/datasetStore'
import { sceneShared } from '../components/visualization/sharedScene'
import { STATIC_MODE } from '../services/mode'

const MODE_GROUPS: { label: string; modes: { id: AppMode; label: string }[] }[] = [
  { label: 'מעבדה', modes: [{ id: 'explore', label: 'חקירה' }, { id: 'simulate', label: 'סימולציה' }, { id: 'inverse', label: 'תכנון הפוך' }] },
  { label: 'תיעוד ותוקף', modes: [{ id: 'dataset', label: 'נתונים' }, { id: 'model', label: 'מודל' },
    { id: 'science', label: 'מדע וחישובים' }, { id: 'validation', label: 'אימות מדעי' }] },
]
/** Reading-heavy modes take the full width instead of the 330px side column. */
const PAGE_MODES: AppMode[] = ['science', 'validation']
const TABS: { id: BottomTab; label: string }[] = [
  { id: 'timeseries', label: 'סדרות זמן' }, { id: 'fft', label: 'FFT' }, { id: 'taylor', label: 'טיילור' },
  { id: 'dose', label: 'עקומות מינון' }, { id: 'metrics', label: 'מדדי מודל' },
]

function Header() {
  const mode = useVisualizationStore((s) => s.mode)
  const set = useVisualizationStore((s) => s.set)
  const cfg = useDatasetStore((s) => s.config)
  const n = useDatasetStore((s) => s.samples.length)
  return (
    <header className="app-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2">
      <div className="flex items-baseline gap-3">
        <h1 className="t-lg font-semibold tracking-wide text-[var(--text-1)]" dir="ltr">OLFACTORY SPACE EXPLORER</h1>
        <span className="t-sm text-[var(--text-3)]">מרחב ריח לטנטי · {n} ריחות ייחוס · z ∈ ℝ²⁵⁶</span>
      </div>
      <TabList label="מצבי עבודה" panelId="main-panel" testPrefix="tab" value={mode} onChange={(id) => set({ mode: id })}
        groups={MODE_GROUPS} />
      <div className="flex items-center gap-3">
        <span className="num t-xs text-[var(--text-3)]" dir="ltr">{cfg?.model_version} · {cfg?.model_status}</span>
        {STATIC_MODE && <span className="chip text-sky-200" title="המודל המאומן רץ בדפדפן (ONNX). טיילור ותכנון הפוך — תוצאות מחושבות מראש." data-testid="static-badge">גרסת דפדפן · ONNX</span>}
        <DatasetProvenanceBadge />
      </div>
    </header>
  )
}

function LeftColumn() {
  const mode = useVisualizationStore((s) => s.mode)
  return (
    <aside className="side-col" aria-label="בקרות" data-testid="controls-column">
      {mode === 'dataset' && <DatasetPanel />}
      {mode === 'model' && <ModelPanel />}
      {(mode === 'explore' || mode === 'simulate') && <><ProjectionModeSelector /><DimensionSelector /></>}
      {mode === 'explore' && <><ExploreOptions /><MoleculeMixtureEditor /></>}
      {mode === 'simulate' && <><MoleculeMixtureEditor /><ReceptorKnockoutControls /></>}
      {mode === 'inverse' && <><InverseDesignPanel /><ProjectionModeSelector /><DimensionSelector /></>}
    </aside>
  )
}

function RightColumn() {
  return (
    <aside className="side-col" aria-label="קריאות מדעיות" data-testid="readouts-column">
      <SelectedStatePanel />
      <ReceptorActivityPanel />
      <BulbActivityPanel />
      <CorticalActivityPanel />
      <OdorDescriptorPanel />
    </aside>
  )
}

function AnalysisTabs() {
  const tab = useVisualizationStore((s) => s.bottomTab)
  const set = useVisualizationStore((s) => s.set)
  return (
    <section className="bottom-strip flex min-h-0 flex-col">
      <div className="px-3 pt-1.5">
        <TabList label="ניתוחים" panelId="analysis-panel" testPrefix="analysis" value={tab} onChange={(id) => set({ bottomTab: id })}
          groups={[{ modes: TABS }]} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto" role="tabpanel" id="analysis-panel" aria-labelledby={`analysis-${tab}`}>
        {tab === 'timeseries' && <TimeSeriesPanel />}
        {tab === 'fft' && <FourierAnalysisPanel />}
        {tab === 'taylor' && <TaylorApproximationPanel />}
        {tab === 'dose' && <DoseResponsePanel />}
        {tab === 'metrics' && <ModelMetricsPanel />}
      </div>
    </section>
  )
}

export default function App() {
  const status = useDatasetStore((s) => s.status)
  const error = useDatasetStore((s) => s.error)
  const load = useDatasetStore((s) => s.load)
  const mode = useVisualizationStore((s) => s.mode)
  usePlaybackLoop()

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (status !== 'ready') return
    return startSimulationController()
  }, [status])
  // entering Inverse mode: use the selected (or first) reference odor as the default target
  useEffect(() => {
    if (mode !== 'inverse' || status !== 'ready' || useInverseDesignStore.getState().targetSampleId) return
    const ds = useDatasetStore.getState()
    const id = useSelectionStore.getState().selectedSampleId ?? ds.samples[0].id
    const z = sampleEmbedding(ds.sampleIndex.get(id)!)
    if (z) useInverseDesignStore.getState().setTarget(id, Array.from(z))
  }, [mode, status])

  if (status === 'error') {
    return (
      <div className="flex h-screen items-center justify-center p-8">
        <div className="max-w-lg space-y-3 rounded border border-red-500/40 bg-red-950/20 p-6">
          <h2 className="text-lg font-semibold text-red-200">אין חיבור לשרת המודל</h2>
          <p className="text-sm text-[var(--text-2)]">{error}</p>
          {STATIC_MODE
            ? <p className="text-sm text-[var(--text-2)]">טעינת קבצי המודל הסטטיים נכשלה. רעננו את הדף.</p>
            : <p className="text-sm text-[var(--text-2)]">הפעילו את ה-backend: <code dir="ltr">make backend</code> (או <code dir="ltr">make bootstrap</code> בפעם הראשונה) ורעננו.</p>}
          <button className="btn" onClick={load}>ניסיון חוזר</button>
        </div>
      </div>
    )
  }
  if (status !== 'ready') {
    return <div className="flex h-screen items-center justify-center text-[var(--text-2)]" role="status">{STATIC_MODE ? 'טוען אטלס ייחוס ואת המודל לדפדפן…' : 'טוען אטלס ייחוס ומודל…'}</div>
  }
  // Page modes hide (not unmount) the lab layout, so the WebGL scene and camera survive a visit.
  const page = PAGE_MODES.includes(mode)
  return (
    <div className={`app-shell ${page ? 'page-mode' : ''}`}>
      <Header />
      {page && (
        <main className="page-scroll" role="tabpanel" id="main-panel" aria-labelledby={`tab-${mode}`}>
          <div className="page">{mode === 'science' ? <SciencePanel /> : <ValidationPage />}</div>
        </main>
      )}
      <main className="main-grid" hidden={page} role={page ? undefined : 'tabpanel'} id={page ? undefined : 'main-panel'}
        aria-labelledby={page ? undefined : `tab-${mode}`}>
        <div style={{ gridArea: 'controls' }} className="min-h-0"><LeftColumn /></div>
        <div style={{ gridArea: 'scene' }} className="scene-cell min-h-0 min-w-0"><OdorSpaceScene /></div>
        <div style={{ gridArea: 'readouts' }} className="min-h-0"><RightColumn /></div>
      </main>
      <div className="bottom-strip" hidden={page}><TemporalPlaybackControls /></div>
      <div className="contents" hidden={page}><AnalysisTabs /></div>
    </div>
  )
}

// test hook for end-to-end tests (read-only use)
declare global { interface Window { __OSE__?: unknown } }
window.__OSE__ = { useDatasetStore, useSimulationStore, useVisualizationStore, sceneShared }
