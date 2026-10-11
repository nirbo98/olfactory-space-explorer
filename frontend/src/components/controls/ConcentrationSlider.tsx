import { useDatasetStore } from '../../store/datasetStore'
import { Slider } from './Slider'

export function ConcentrationSlider({ compoundId, value, onChange }: { compoundId: string; value: number; onChange: (v: number) => void }) {
  const maxTrain = useDatasetStore((s) => s.config?.max_training_concentration ?? 2)
  const out = value > maxTrain
  return (
    <Slider label={`ריכוז ${compoundId}`} value={value} min={0} max={4} step={0.01} onChange={onChange}
      format={(v) => v.toFixed(2)} testId={`conc-${compoundId}`} warn={out}
      hint={out ? `מעל טווח האימון (${maxTrain}) — אקסטרפולציה` : undefined} />
  )
}
