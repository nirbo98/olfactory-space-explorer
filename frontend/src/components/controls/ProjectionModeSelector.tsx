import { useState } from 'react'
import { useProjectionStore } from '../../store/projectionStore'
import { useDatasetStore } from '../../store/datasetStore'
import type { ProjectionMode } from '../../mathematics/projection'
import { Section, Slider } from './Slider'

const MODES: { id: ProjectionMode; label: string; desc: string }[] = [
  { id: 'pca', label: 'PCA', desc: 'רכיבים ראשיים, מותאמים פעם אחת לאטלס הייחוס' },
  { id: 'direct', label: 'ממדים ישירים', desc: 'שלושה ממדים של z, מתוקננים לפי הייחוס' },
  { id: 'weighted', label: 'הטלה משוקללת', desc: 'כל ציר הוא צירוף של שני ממדים' },
]

export function ProjectionModeSelector() {
  const s = useProjectionStore()
  const ref = useDatasetStore((d) => d.reference)
  const [name, setName] = useState('')
  return (
    <Section title="הטלה לתלת-ממד" aside={<button className="btn-ghost" onClick={s.reset} data-testid="projection-reset">איפוס</button>}>
      <div role="radiogroup" aria-label="מצב הטלה" className="grid grid-cols-3 gap-1">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={s.mode === m.id} title={m.desc}
            className={`seg ${s.mode === m.id ? 'seg-on' : ''}`} onClick={() => s.setMode(m.id)} data-testid={`mode-${m.id}`}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="t-xs leading-snug text-[var(--text-3)]">{MODES.find((m) => m.id === s.mode)?.desc}. שינוי ההטלה משנה רק את נקודת המבט — המודל אינו מחושב מחדש.</p>
      {s.mode === 'pca' && ref && (
        <div className="grid grid-cols-3 gap-1 text-center" dir="ltr">
          {ref.explainedVarianceRatio.map((v, k) => (
            <div key={k} className="rounded bg-[var(--surface-2)] px-1 py-1">
              <div className="t-xs text-[var(--text-2)]">PC{k + 1}</div>
              <div className="num t-sm text-sky-100">{(v * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
      <Slider label="קנה מידה של הקואורדינטות" value={s.scale} min={0.3} max={3} step={0.05} onChange={s.setScale}
        format={(v) => `×${v.toFixed(2)}`} testId="scale-slider" />
      <div className="flex gap-1">
        <input className="input flex-1" placeholder="שם לשמירת תצורה" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn" disabled={!name} onClick={() => { s.savePreset(name); setName('') }}>שמירה</button>
      </div>
      {Object.keys(s.presets).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {Object.keys(s.presets).map((p) => (
            <span key={p} className="chip">
              <button onClick={() => s.loadPreset(p)}>{p}</button>
              <button aria-label={`מחיקת ${p}`} onClick={() => s.deletePreset(p)} className="text-[var(--text-3)]">×</button>
            </span>
          ))}
        </div>
      )}
    </Section>
  )
}
