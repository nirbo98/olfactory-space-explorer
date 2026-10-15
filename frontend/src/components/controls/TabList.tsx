import { useRef, type KeyboardEvent } from 'react'

interface Group<T extends string> { label?: string; modes: readonly { id: T; label: string }[] }

/**
 * WAI-ARIA tablist with optional labelled groups. Arrow keys move between tabs
 * (direction-aware: in RTL, ArrowLeft goes to the next tab), Home/End jump.
 */
export function TabList<T extends string>({ label, panelId, testPrefix, value, onChange, groups }: {
  label: string; panelId: string; testPrefix: string; value: T; onChange: (id: T) => void; groups: Group<T>[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const ids = groups.flatMap((g) => g.modes.map((m) => m.id))
  const onKey = (e: KeyboardEvent) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const i = ids.indexOf(value)
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key as 'ArrowRight' | 'ArrowLeft']
    let next = -1
    if (step) next = (i + step + ids.length) % ids.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = ids.length - 1
    if (next < 0) return
    e.preventDefault()
    onChange(ids[next])
    ref.current?.querySelector<HTMLButtonElement>(`[data-testid="${testPrefix}-${ids[next]}"]`)?.focus()
  }
  return (
    <div ref={ref} role="tablist" aria-label={label} className="flex flex-wrap items-center" onKeyDown={onKey}>
      {groups.map((g, gi) => (
        <div key={gi} className="tab-group" role="presentation">
          {gi > 0 && <span className="tab-divider" aria-hidden />}
          {g.label && <span className="tab-group-label" aria-hidden>{g.label}</span>}
          {g.modes.map((m) => {
            const on = value === m.id
            return (
              <button key={m.id} id={`${testPrefix}-${m.id}`} role="tab" aria-selected={on} aria-controls={panelId}
                tabIndex={on ? 0 : -1} className={`tab ${on ? 'tab-on' : ''}`} onClick={() => onChange(m.id)}
                data-testid={`${testPrefix}-${m.id}`}>{m.label}</button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
