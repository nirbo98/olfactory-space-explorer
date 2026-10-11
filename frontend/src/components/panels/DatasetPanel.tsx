import { useDatasetStore } from '../../store/datasetStore'
import { Section } from '../controls/Slider'
import { SPLIT_HE } from '../../utils/format'

export function DatasetPanel() {
  const d = useDatasetStore((s) => s.datasets)
  const ds = d?.datasets[0]
  if (!ds) return null
  return (
    <>
      <Section title="מערך הנתונים הפעיל">
        <div className="warn">{ds.label_he}</div>
        <dl className="kv">
          <dt>מקור</dt><dd>מודל מורה מתמטי דטרמיניסטי (seed {ds.seed})</dd>
          <dt>מולקולות וירטואליות</dt><dd>{ds.n_compounds}</dd>
          <dt>ערוצי רצפטור מדומים</dt><dd>{ds.n_receptors}</dd>
          <dt>תערובות</dt><dd>{ds.n_mixtures} (1–5 רכיבים)</dd>
          <dt>תרכובות מוחזקות</dt><dd dir="ltr">{ds.heldout_compounds.join(', ')}</dd>
          <dt>תוויות חסרות</dt><dd>מתארים: {ds.missing_labels.descriptor_rows} שורות · עוצמה: {ds.missing_labels.intensity} (מוסוות, לא אפס)</dd>
        </dl>
        <div className="space-y-0.5 text-[11.5px]">
          {Object.entries(ds.split_counts).map(([k, v]) => (
            <div key={k} className="flex justify-between"><span className="text-slate-400">{SPLIT_HE[k] ?? k}</span><span className="num">{v}</span></div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500">הפיצול נעשה לפי קבוצת רכיבים (כל וריאציות הריכוז של אותה קבוצה באותו פיצול), וכל תערובת המכילה תרכובת מוחזקת הוצאה מהאימון — למניעת דליפה.</p>
      </Section>
      <Section title="ייבוא נתונים ניסויים">
        <p className="text-[11.5px] text-slate-400">ממשק הייבוא מאמת סכמה (רכיבים, SMILES, ריכוזים, תנאי סביבה, מדידות רצפטור, מתארים, עוצמה ואי-ודאות). שום נתון אינו מורד אוטומטית.</p>
        <div className="num text-[11px] text-slate-300" dir="ltr">{d.experimental_import.schema}<br />{d.experimental_import.example}</div>
        <div className="text-[11.5px] text-slate-500">נטענו: {d.experimental_import.loaded.length || 'אין'}</div>
      </Section>
    </>
  )
}
