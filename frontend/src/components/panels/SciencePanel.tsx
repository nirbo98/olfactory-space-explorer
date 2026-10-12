import type { ReactNode } from 'react'
import { Section } from '../controls/Slider'
import { INVERSE_API_MAX_COMPONENTS, INVERSE_UI_DEFAULT_COMPONENTS, PAGES_INVERSE_PARAMS } from '../../config/inverseLimits'

/** References and implementation notes are intentionally static, not predictions. */
const references = [
  { author: 'Buck & Axel (1991)', topic: 'משפחת גני קולטני ריח', doi: '10.1016/0092-8674(91)90418-X' },
  { author: 'Malnic et al. (1999)', topic: 'קידוד ריח קומבינטורי', doi: '10.1016/S0092-8674(00)80581-4' },
  { author: 'Singh et al. (2019)', topic: 'קשירה תחרותית ותערובות', doi: '10.1073/pnas.1813230116' },
  { author: 'Blazing & Franks (2020)', topic: 'קידוד בקורטקס הפיריפורמי', doi: '10.1016/j.conb.2020.03.001' },
  { author: 'Mainland et al. (2014)', topic: 'שונות קולטנים בין אנשים', doi: '10.1038/nn.3598' },
  { author: 'Lalis et al. (2024)', topic: 'מאגר תגובות מולקולה–קולטן (M2OR)', doi: '10.1093/nar/gkad886' },
  { author: 'Lee et al. (2023)', topic: 'מפת הריחות POM', doi: '10.1126/science.ade4401' },
  { author: 'Hamel et al. (2024)', topic: 'מאגר נתוני ריח Pyrfume', doi: '10.1038/s41597-024-04051-z' },
]

function Note({ title, formula, children }: { title: string; formula?: string; children: ReactNode }) {
  return (
    <details className="border-b border-slate-800/70 py-2 last:border-b-0">
      <summary className="cursor-pointer text-[12px] font-medium text-slate-200">{title}</summary>
      <div className="space-y-2 pt-2 text-[11.5px] leading-relaxed text-slate-400">
        {children}
        {formula && <div className="rounded bg-slate-950/70 p-2 font-mono text-[11px] text-cyan-200" dir="ltr" style={{ overflowWrap: 'anywhere' }}>{formula}</div>}
      </div>
    </details>
  )
}

export function SciencePanel() {
  return (
    <div data-testid="science-panel">
      <Section title="מה מדעי ומה סימולציה?">
        <div className="warn">נתוני הדמו סינתטיים: 32 תרכובות וירטואליות, 64 קולטנים מדומים ווקטור ריח בן 256 ממדים. אין כאן מדידות אנושיות.</div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-300">
          בספרות יש בסיס ניסויי לקידוד קומבינטורי, קשירה תחרותית, עיכוב בתערובות וייצוגים קורטיקליים מבוזרים.
          נוסחאות המודל הן <strong>קירובים הנדסיים ניתנים לבדיקה</strong>, לא שחזור מאומת של המוח.
        </p>
      </Section>
      <Section title="מסלול הריח — מן האוויר לקורטקס">
        <ol className="list-decimal space-y-1 pr-4 text-[11.5px] leading-relaxed text-slate-400">
          <li>מולקולות נדיפות מגיעות לרירית האף — הריכוז באוויר שונה לעיתים מהריכוז בבקבוק.</li>
          <li>מולקולות מפעילות או מעכבות צירופים של סוגי קולטנים.</li>
          <li>פקעת ההרחה מבצעת עיבוד, נרמול וקשרי עיכוב/משוב.</li>
          <li>מערכות קורטיקליות מייצגות זהות, עוצמה ומשמעויות נלמדות של ריחות.</li>
        </ol>
      </Section>
      <Section title="מה בדיוק מחושב? פתח כל שלב">
        <Note title="1 · קידוד מולקולות (MLP, לא GNN)">
          כל וקטור תכונות [256] עובר Linear → LayerNorm → GELU → Linear ומתקבל embedding בן 128 ערכים. בדמו התכונות סינתטיות; החיבור ל-SMILES/RDKit הוא הרחבה אופציונלית.
          <div dir="ltr" className="font-mono text-[10px] text-slate-500">backend/app/models/molecular_encoder.py</div>
        </Note>
        <Note title="2 · קולטנים: קשירה תחרותית" formula="r_j = g_j [Σ_i ε_ij (c_i/K_ij)] / [1 + Σ_i(c_i/K_ij)]">
          הרשת מעריכה K חיובי ויעילות הפעלה ε בטווח 0–1. שינוי ריכוז או knockout מעדכן את כל תגובות הקולטנים. נוסחה מפושטת שנשענת על רעיון קשירה תחרותית, לא מדידות של הקולטנים המדומים.
        </Note>
        <Note title="3 · פקעת ההרחה: נרמול ועיכוב" formula="r̂ = r/(1+κ mean(r)); b = softplus(W_E r̂ − W_I r̂ + b₀)">
          הקוד מנרמל פעילות ומחשב עירור פחות עיכוב. המשקולות נלמדות ואינן מתארות אנטומיה אמיתית של פקעת ההרחה.
        </Note>
        <Note title="4 · דינמיקה וקבוע אוילר" formula="h(t+Δt) = exp(−Δt/τ)h(t) + (1−exp(−Δt/τ))b(t)">
          הפתרון המדויק למשוואת דליפה מסדר ראשון, כאשר הגירוי קבוע בתוך הצעד. זה המקור של e; לא עדות למודל קוונטי.
        </Note>
        <Note title="5 · קורטקס מדומה (GRU + top-k)">
          רשת חוזרת בת 256 יחידות שומרת 20% מהאקטיבציות החזקות ביותר כברירת מחדל, ומוציאה וקטור ריח בן 256 ממדים. GRU אינו שחזור נוירונים ביולוגיים.
        </Note>
        <Note title="6 · הקרנה לתלת-ממד" formula="p = P(z − μ),  P ∈ ℝ^(3×256)">
          PCA, בחירת 3 רכיבים או צירים משוקללים. הזזת סליידר ממדים משנה רק את זווית ההקרנה — לא את הייצוג הבסיסי. קרבה על המסך עלולה לעוות מרחקים במרחב המלא.
        </Note>
        <Note title="7 · טיילור ופורייה" formula="f(c₀+δ) ≈ f(c₀) + ∇fᵀδ + ½δᵀHδ">
          טיילור מקרב מקומית תגובת קולטן בעזרת גרדיאנט והסיאן של המודל. FFT מנתח תנודות *בזמן* של פעילות הקולטנים, לא את הרכב המולקולות.
        </Note>
        <Note title="8 · תכנון הפוך" formula="argmin_c ||F(c) − z_target||² + λΩ(c),  ||c||₀ ≤ k">
          אופטימיזציה בריכוזים מוגבלים, עם לכל היותר k רכיבים בתערובת: ה-API של השרת מאפשר עד {INVERSE_API_MAX_COMPONENTS};
          הממשק המקומי משתמש כברירת מחדל ב-{INVERSE_UI_DEFAULT_COMPONENTS} (ניתן להגדיל עד {INVERSE_API_MAX_COMPONENTS});
          גרסת GitHub Pages מציגה תוצאות שחושבו מראש עם {PAGES_INVERSE_PARAMS.maxComponents} בדיוק.
          הפתרון עשוי לא להיות יחיד, והוא אינו מתכון ריח מאומת בלי ניסויי הרחה.
        </Note>
      </Section>
      <Section title="מחקרים מרכזיים לקריאה">
        <p className="mb-2 text-[11px] text-slate-500">קישורים למאמרי מקור ולמחקרים יישומיים. סקירת הספרות המורחבת והנוסחאות המלאות נמצאות בתיקיית documentation של הפרויקט.</p>
        <ul className="space-y-2">
          {references.map((ref) => (
            <li key={ref.doi} className="border-r-2 border-slate-700 pr-2 text-[11.5px]">
              <a href={`https://doi.org/${ref.doi}`} target="_blank" rel="noopener noreferrer" className="font-medium text-sky-300 hover:underline">{ref.author} ↗</a>
              <div className="text-slate-400">{ref.topic}</div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="מה צריך כדי לטעון לדיוק מדעי?">
        <p className="text-[11.5px] leading-relaxed text-slate-400">מדידות ריכוזי headspace; תגובות קולטנים מזוהים; ניסויי דירוג דמיון בין תערובות; חלוקה נכונה לסטים בלתי תלויים; השוואה למודלים פשוטים; ובדיקה בנבדקים חדשים. עד אז התוצאות הן תחזיות של סימולטור בלבד.</p>
      </Section>
    </div>
  )
}
