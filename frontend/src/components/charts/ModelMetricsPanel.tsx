import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatasetStore } from '../../store/datasetStore'
import { fmt } from '../../utils/format'
import { axisProps, gridProps, num, tooltipProps } from './chartTheme'

const SPLITS = [
  ['train', 'אימון'], ['val', 'ולידציה'], ['test_unseen_mixtures', 'פרוטוקול 1: תערובות חדשות'],
  ['test_heldout_compounds', 'פרוטוקול 2: תרכובות מוחזקות'],
] as const

export function ModelMetricsPanel() {
  const m = useDatasetStore((s) => s.metrics)
  if (!m?.metrics) return <div className="p-3 text-[12px] text-amber-300">אין מודל מאומן — הריצו <code>make train</code>.</div>
  type Block = NonNullable<NonNullable<typeof m>['metrics']>['train']
  const rows: [string, (b: Block) => string][] = [
    ['n', (b) => String(b.n)],
    ['loss', (b) => fmt(b.loss, 4)],
    ['receptor MAE', (b) => fmt(b.receptor_mae, 4)],
    ['MAE baseline (mean)', (b) => fmt(b.receptor_mae_mean_baseline, 4)],
    ['receptor R²', (b) => fmt(b.receptor_r2, 3)],
    ['descriptor MAE', (b) => fmt(b.descriptor_mae, 4)],
    ['descriptor AUROC', (b) => fmt(b.descriptor_auroc_macro, 3)],
    ['intensity MAE', (b) => fmt(b.intensity_mae, 4)],
    ['intensity r', (b) => fmt(b.intensity_pearson, 3)],
    ['similarity ρ (Spearman)', (b) => fmt(b.similarity_spearman, 3)],
  ]
  return (
    <div className="grid h-full grid-cols-[1.2fr_1fr] gap-3 p-2" data-testid="metrics-panel">
      <div className="overflow-auto">
        <table className="metrics w-full text-[11.5px]" dir="ltr">
          <thead><tr><th />{SPLITS.map(([k, he]) => <th key={k} dir="rtl">{he}</th>)}</tr></thead>
          <tbody>
            {rows.map(([name, f]) => (
              <tr key={name}><td className="text-slate-400" style={{ textAlign: 'left' }}>{name}</td>
                {SPLITS.map(([k]) => <td key={k} className="num" data-testid={`metric-${k}-${name.replace(/\W+/g, '_')}`}>{f(m.metrics![k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-slate-500">
          כל המדדים חושבו ע״י הערכה בפועל של המודל על פיצולים מוחזקים של נתוני המורה הסינתטי. הם מודדים קירוב של מורה מתמטי — לא דיוק ביולוגי.
          תרכובות מוחזקות: {m.dataset?.heldout_compounds.join(', ')}.
        </p>
      </div>
      <div dir="ltr">
        <div className="mb-1 text-[11px] text-slate-400" dir="rtl">עקומות אימון (best epoch {m.best_epoch})</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={m.history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="epoch" type="number" {...axisProps} />
            <YAxis {...axisProps} width={40} domain={['auto', 'auto']} />
            <Tooltip {...tooltipProps} formatter={num(4)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={m.best_epoch} stroke="#d7a54a" strokeDasharray="3 3" />
            <Line dataKey="train_loss" name="train loss" stroke="#5b8def" dot={false} isAnimationActive={false} />
            <Line dataKey="val_loss" name="val loss" stroke="#3ec7c2" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
