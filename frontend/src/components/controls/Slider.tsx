import { useId } from 'react'

interface Props {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  testId?: string
  hint?: string
  warn?: boolean
  disabled?: boolean
}

/** Accessible range input with a always-visible numeric value. Ranges run left→right regardless of RTL. */
export function Slider({ label, value, min, max, step = 1, onChange, format, testId, hint, warn, disabled }: Props) {
  const id = useId()
  return (
    <div className="slider-row">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="t-sm text-[var(--text-2)]">{label}</label>
        <output htmlFor={id} className={`num ${warn ? 'text-amber-300' : 'text-sky-100'}`} data-testid={testId ? `${testId}-value` : undefined}>
          {format ? format(value) : value}
        </output>
      </div>
      <input id={id} type="range" dir="ltr" min={min} max={max} step={step} value={value} disabled={disabled}
        aria-label={label} data-testid={testId} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
      {hint && <div className="t-xs text-[var(--text-3)]">{hint}</div>}
    </div>
  )
}

export function Toggle({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 t-sm text-[var(--text-2)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} data-testid={testId} className="accent-sky-400" />
      {label}
    </label>
  )
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="panel-section">
      <header className="mb-2 flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {aside}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}
