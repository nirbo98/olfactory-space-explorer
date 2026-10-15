import { useDatasetStore } from '../../store/datasetStore'
import { useProjectionStore } from '../../store/projectionStore'
import { useSelectionStore } from '../../store/selectionStore'
import { axisLabel } from '../../mathematics/projection'
import { DESCRIPTOR_HE, SPLIT_HE } from '../../utils/format'
import { AXIS_COLORS } from './ProjectionAxes'

/** DOM overlays for the 3-D view: axis definitions and the hover tooltip (kept outside WebGL). */
export function SceneOverlays() {
  const spec = useProjectionStore()
  const ref = useDatasetStore((s) => s.reference)
  const samples = useDatasetStore((s) => s.samples)
  const hovered = useSelectionStore((s) => s.hoveredIndex)
  const pos = useSelectionStore((s) => s.hoverPos)
  const h = hovered !== null ? samples[hovered] : null
  return (
    <>
      <div className="pointer-events-none absolute bottom-2 left-3 space-y-0.5 rounded bg-black/40 px-2 py-1" dir="ltr">
        {[0, 1, 2].map((k) => (
          <div key={k} className="axis-label" style={{ color: AXIS_COLORS[k], background: 'none', padding: 0 }}
            data-testid={`axis-label-${'xyz'[k]}`}>
            <b>{'XYZ'[k]}</b> = {axisLabel(spec, ref, k as 0 | 1 | 2)}
          </div>
        ))}
      </div>
      {h && pos && (
        <div className="tooltip pointer-events-none absolute" style={{ left: pos[0], top: pos[1] }} dir="rtl" data-testid="point-tooltip">
          <div className="num t-xs text-sky-200">{h.id} · אשכול {h.cluster + 1}</div>
          <div dir="ltr" className="num t-xs">{h.components.map((c) => `${c.compound_id}·${c.concentration}`).join('  ')}</div>
          <div className="t-xs text-[var(--text-2)]">{SPLIT_HE[h.split]}</div>
          <div className="t-xs text-[var(--text-2)]">מתארים חזויים (סינתטי): {h.top_descriptors.map((d) => DESCRIPTOR_HE[d] ?? d).join(', ')}</div>
        </div>
      )}
    </>
  )
}
