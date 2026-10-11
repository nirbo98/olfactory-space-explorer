export const fmt = (v: number | null | undefined, d = 3) =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(d)

export const SPLIT_HE: Record<string, string> = {
  train: 'אימון', val: 'ולידציה', test: 'מבחן (תערובות חדשות)', heldout_compound: 'מבחן (תרכובות מוחזקות)',
}

export const DESCRIPTOR_HE: Record<string, string> = {
  fruity: 'פירותי', floral: 'פרחוני', woody: 'עצי', citrus: 'הדרי', green: 'ירוק',
  musky: 'מושקי', spicy: 'מתובל', sweet: 'מתוק', smoky: 'מעושן', minty: 'מנטה',
}

export const WARNING_HE: [RegExp, string][] = [
  [/above the training range/, 'ריכוז מעל טווח האימון — אקסטרפולציה'],
  [/more than \d+ components/, 'יותר רכיבים מאשר בתערובות האימון'],
  [/held out from training/, 'כולל תרכובות שהוחזקו מחוץ לאימון'],
  [/counterfactual/, 'עיכוב רצפטור הוא מניפולציה קונטרפקטואלית שלא נראתה באימון'],
  [/lateral inhibition setting differs/, 'הגדרת העיכוב הצידי שונה מהאימון (אבלציה בזמן היסק)'],
  [/sparsity differs/, 'רמת הדלילות שונה מהאימון (אבלציה בזמן היסק)'],
  [/UNTRAINED/, 'המודל לא אומן (משקלים אקראיים) — הריצו make train'],
  [/non-unique inverse/, 'ההיפוך אינו יחיד: כמה הרכבים שונים מגיעים למרחק דומה'],
  [/PAGES_PRECOMPUTED/, 'גרסת Pages: תוצאה מחושבת מראש (עד 3 רכיבים, 8 אתחולים, 200 צעדים, כל התרכובות) — פרמטרי החיפוש בממשק אינם משפיעים כאן'],
  [/target lies farther/, 'המטרה רחוקה מכל ריח ייחוס — אמינות המודל שם נמוכה'],
]

export function translateWarning(w: string): string {
  for (const [re, he] of WARNING_HE) if (re.test(w)) {
    const m = w.match(/: (C\d{3}.*)$/)
    return m ? `${he}: ${m[1]}` : he
  }
  return w
}
