import { CHART } from '../../utils/colors'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useDatasetStore } from '../../store/datasetStore'
import { useVisualizationStore } from '../../store/visualizationStore'
import { TOKENS } from '../../theme/tokens'
import { fmt } from '../../utils/format'
import { axisProps, gridProps, num, tooltipProps } from './chartTheme'

const SPLITS = [
  ['train', 'אימון'], ['val', 'ולידציה'], ['test_unseen_mixtures', 'פרוטוקול 1: תערובות חדשות'],
  ['test_heldout_compounds', 'פרוטוקול 2: תרכובות מוחזקות'],
] as const

export function ModelMetricsPanel() {
  const m = useDatasetStore((s) => s.metrics)
  if (!m?.metrics) return <div className="p-3 t-sm text-amber-300">אין מודל מאומן — הריצו <code>make train</code>.</div>
  type Block = NonNullable<NonNullable<typeof m>['metrics']>['train']
  // third entry: value in [0, 1] drawn as an inline bar (higher is better)
  const rows: [string, (b: Block) => string, ((b: Block) => number | undefined)?][] = [
    ['n', (b) => String(b.n)],
    ['loss', (b) => fmt(b.loss, 4)],
    ['receptor MAE', (b) => fmt(b.receptor_mae, 4)],
    ['MAE baseline (mean)', (b) => fmt(b.receptor_mae_mean_baseline, 4)],
    ['receptor R²', (b) => fmt(b.receptor_r2, 3), (b) => b.receptor_r2],
    ['descriptor MAE', (b) => fmt(b.descriptor_mae, 4)],
    ['descriptor AUROC', (b) => fmt(b.descriptor_auroc_macro, 3), (b) => b.descriptor_auroc_macro ?? undefined],
    ['intensity MAE', (b) => fmt(b.intensity_mae, 4)],
    ['intensity r', (b) => fmt(b.intensity_pearson, 3), (b) => b.intensity_pearson],
    ['similarity ρ (Spearman)', (b) => fmt(b.similarity_spearman, 3), (b) => b.similarity_spearman],
  ]
  return (
    <div className="grid h-full grid-cols-1 gap-3 p-2 lg:grid-cols-[1.2fr_1fr]" data-testid="metrics-panel">
      <div className="overflow-auto">
        <div className="warn mb-2 flex flex-wrap items-center justify-between gap-2" data-testid="metrics-caveat">
          <span>מדדים מול מורה סינתטי שכתבנו — לא מול ביולוגיה.</span>
          <button className="btn-ghost t-xs underline" onClick={() => useVisualizationStore.getState().set({ mode: 'validation' })}
            data-testid="goto-validation">לאימות מול נתוני בני אדם ←</button>
        </div>
        <table className="metrics w-full t-sm" dir="ltr">
          <thead><tr><th />{SPLITS.map(([k, he]) => <th key={k} dir="rtl">{he}</th>)}</tr></thead>
          <tbody>
            {rows.map(([name, f, bar]) => (
              <tr key={name}><td className="text-[var(--text-3)]" style={{ textAlign: 'start' }}>{name}</td>
                {SPLITS.map(([k]) => {
                  const v = bar?.(m.metrics![k])
                  return (
                    <td key={k}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {v !== undefined && Number.isFinite(v) && (
                          <span className="inline-block h-1.5 w-10 rounded-sm bg-[var(--surface-3)]" aria-hidden>
                            <span className="block h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: TOKENS['series-1'] }} />
                          </span>
                        )}
                        <span className="num" data-testid={`metric-${k}-${name.replace(/\W+/g, '_')}`}>{f(m.metrics![k])}</span>
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 t-xs text-[var(--text-3)]">
          כל המדדים חושבו ע״י הערכה בפועל של המודל על פיצולים מוחזקים של נתוני המורה הסינתטי. הם מודדים קירוב של מורה מתמטי — לא דיוק ביולוגי.
          תרכובות מוחזקות: {m.dataset?.heldout_compounds.join(', ')}.
        </p>
      </div>
      <div dir="ltr">
        <div className="mb-1 t-xs text-[var(--text-2)]" dir="rtl">עקומות אימון (best epoch {m.best_epoch})</div>
        <ResponsiveContainer width="100%" height={190}>
          <LineChart data={m.history} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="epoch" type="number" {...axisProps} />
            <YAxis {...axisProps} width={40} domain={['auto', 'auto']} />
            <Tooltip {...tooltipProps} formatter={num(4)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine x={m.best_epoch} stroke={CHART.secondary} strokeDasharray="3 3" />
            <Line dataKey="train_loss" name="train loss" stroke={CHART.primary} dot={false} isAnimationActive={false} />
            <Line dataKey="val_loss" name="val loss" stroke={CHART.tertiary} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
