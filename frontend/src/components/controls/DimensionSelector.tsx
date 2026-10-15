import { useProjectionStore } from '../../store/projectionStore'
import { useEffectiveProjection } from '../../hooks/useProjection'
import { Section, Slider, Toggle } from './Slider'

const AX = ['X', 'Y', 'Z'] as const

export function DimensionSelector() {
  const s = useProjectionStore()
  const proj = useEffectiveProjection()
  const degenerate = proj?.warnings.some((w) => w.startsWith('degenerate'))
  if (s.mode === 'pca') return null
  return (
    <Section title={s.mode === 'direct' ? 'בחירת ממדים (0–255)' : 'צירים משוקללים'}>
      {s.mode === 'direct' && AX.map((a, k) => (
        <Slider key={a} label={`ממד לציר ${a}`} value={s.dims[k]} min={0} max={255} step={1}
          onChange={(v) => s.setDim(k as 0 | 1 | 2, v)} format={(v) => `z[${v}]`} testId={`dim-${a.toLowerCase()}`} />
      ))}
      {s.mode === 'weighted' && AX.map((a, k) => {
        const ax = s.axes[k]
        return (
          <div key={a} className="rounded border border-[var(--line-1)] p-2">
            <div className="mb-1 t-xs font-semibold text-[var(--text-2)]" dir="ltr">
              {a} = {(1 - ax.mix).toFixed(2)}·z{ax.primary} + {ax.mix.toFixed(2)}·z{ax.secondary}
            </div>
            <Slider label="ממד ראשי" value={ax.primary} min={0} max={255} onChange={(v) => s.setAxis(k as 0 | 1 | 2, { primary: v })}
              testId={`w-${a.toLowerCase()}-primary`} />
            <Slider label="ממד משני" value={ax.secondary} min={0} max={255} onChange={(v) => s.setAxis(k as 0 | 1 | 2, { secondary: v })}
              testId={`w-${a.toLowerCase()}-secondary`} />
            <Slider label="מקדם ערבוב" value={ax.mix} min={0} max={1} step={0.01} onChange={(v) => s.setAxis(k as 0 | 1 | 2, { mix: v })}
              format={(v) => v.toFixed(2)} testId={`w-${a.toLowerCase()}-mix`} />
          </div>
        )
      })}
      {s.mode === 'weighted' && <Toggle label="אורתוגונליזציה של הצירים (Gram–Schmidt)" checked={s.orthogonalize} onChange={s.setOrthogonalize} />}
      {degenerate && (
        <div className="warn" role="alert" data-testid="degenerate-warning">
          אזהרה: אותו כיוון משמש ליותר מציר אחד — ההטלה מנוונת (דרגה &lt; 3). גרירת מטרה הופכית מושבתת.
        </div>
      )}
    </Section>
  )
}
