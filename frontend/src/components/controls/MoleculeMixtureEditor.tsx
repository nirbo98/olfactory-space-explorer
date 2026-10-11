import { useState } from 'react'
import { MAX_MIXTURE_COMPONENTS, useMixtureStore } from '../../store/mixtureStore'
import { useDatasetStore } from '../../store/datasetStore'
import { useSelectionStore } from '../../store/selectionStore'
import { ConcentrationSlider } from './ConcentrationSlider'
import { Section } from './Slider'

export function MoleculeMixtureEditor() {
  const m = useMixtureStore()
  const compounds = useDatasetStore((s) => s.compounds)
  const select = useSelectionStore((s) => s.select)
  const [pick, setPick] = useState('')
  const available = compounds.filter((c) => !m.components.some((x) => x.compound_id === c.compound_id))
  const byId = new Map(compounds.map((c) => [c.compound_id, c]))
  const edit = (fn: () => void) => { fn(); select(null) }
  return (
    <Section title="הרכב התערובת" aside={<span className="text-[11px] text-slate-500">{m.sourceSampleId ? `מקור: ${m.sourceSampleId}` : 'נערך ידנית'}</span>}>
      {m.components.map((c) => {
        const info = byId.get(c.compound_id)
        return (
          <div key={c.compound_id} className="rounded border border-slate-800 p-2" data-testid={`component-${c.compound_id}`}>
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
              <span>{info?.name ?? c.compound_id} · משפחה {info?.family}{info?.heldout ? ' · הוחזקה מהאימון' : ''}</span>
              <button className="btn-ghost text-[11px]" disabled={m.components.length <= 1}
                onClick={() => edit(() => m.removeComponent(c.compound_id))} aria-label={`הסרת ${c.compound_id}`}>הסרה</button>
            </div>
            <ConcentrationSlider compoundId={c.compound_id} value={c.concentration}
              onChange={(v) => edit(() => m.setConcentration(c.compound_id, v))} />
          </div>
        )
      })}
      <div className="flex gap-1">
        <select className="input flex-1" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="בחירת מולקולה וירטואלית"
          data-testid="compound-select">
          <option value="">בחירת מולקולה וירטואלית…</option>
          {available.map((c) => (
            <option key={c.compound_id} value={c.compound_id}>{c.compound_id} · {c.family}{c.heldout ? ' (מוחזקת)' : ''}</option>
          ))}
        </select>
        <button className="btn" disabled={!pick || m.components.length >= MAX_MIXTURE_COMPONENTS}
          onClick={() => { edit(() => m.addComponent(pick)); setPick('') }} data-testid="add-component">הוספה</button>
      </div>
      <div className="flex gap-1">
        <button className="btn flex-1" onClick={() => edit(m.normalize)} title="קנה מידה כך שסכום הריכוזים = 1">נרמול</button>
        <button className="btn flex-1" onClick={() => edit(m.reset)} data-testid="mixture-reset">איפוס</button>
      </div>
    </Section>
  )
}
