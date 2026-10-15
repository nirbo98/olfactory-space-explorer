import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { bestBaseline, ValidationReport } from './ValidationPage'
import { TabList } from '../controls/TabList'
import type { ProtocolResult, ValidationResponse } from '../../types/api'

const targets = ['INTENSITY', 'PLEASANTNESS', 'SWEET']
const score = (r: number) => ({ r, ci: [r - 0.1, r + 0.1] as [number, number], frac_ceiling: r / 0.9 })
const protocol = (ose: number, rf: number, ridge: number): ProtocolResult => ({
  per_target: {
    ose: Object.fromEntries(targets.map((t) => [t, score(ose)])),
    rf_morgan: Object.fromEntries(targets.map((t) => [t, score(rf)])),
    ridge_morgan: Object.fromEntries(targets.map((t) => [t, score(ridge)])),
  },
  summary: {
    ose: { mean_r: ose, mean_r_ci: [ose - 0.05, ose + 0.05], mean_frac_ceiling: ose / 0.9 },
    rf_morgan: { mean_r: rf, mean_r_ci: [rf - 0.05, rf + 0.05], mean_frac_ceiling: rf / 0.9 },
    ridge_morgan: { mean_r: ridge, mean_r_ci: [ridge - 0.05, ridge + 0.05], mean_frac_ceiling: ridge / 0.9 },
  },
  dose: {
    ose: { sign_agreement: 0.86, ci: [0.8, 0.9], n: 470, r_delta: 0.3, observed_increase_fraction: 0.9 },
    rf_morgan: { sign_agreement: 0.7, ci: [0.6, 0.8], n: 470, r_delta: 0.2, observed_increase_fraction: 0.9 },
  },
  verdicts: null,
  deltas: {},
  n_folds: 5,
})

const fixture: ValidationResponse = {
  schema: 'ose.validation.v1',
  dataset: {
    id: 'keller2016', kind: 'experimental', provenance: 'human_psychophysics', citation: 'Keller & Vosshall 2016',
    license: 'CC-BY 4.0', doi: '10.1186/s12868-016-0287-2', source: 'pyrfume', n_subjects: 55, n_stimuli: 960,
    n_molecules_total: 480, n_molecules_used: 478, n_scaffold_groups: 200, targets, coding_rules: ['rule'],
  },
  metric: 'Pearson r',
  models: { ose: 'OSE (bio-structured)', rf_morgan: 'RF · Morgan', ridge_morgan: 'Ridge · Morgan' },
  protocol_labels: { scaffold: 'scaffold', random: 'random' },
  ceilings: Object.fromEntries(targets.map((t, i) => [t, {
    r_half: 0.8, r_half_sd: 0.01, reliability: 0.9 - i * 0.1, ceiling: 0.95 - i * 0.1, n_splits: 200, test_retest: { r: 0.5, n_pairs: 1000 } }])),
  protocols: {
    scaffold: { ...protocol(0.3, 0.4, 0.2), verdicts: {
      H1: { supported: true, evidence: { rank_intensity: 1, rank_pleasantness: 2, n_targets: 3 } },
      H3: { supported: false, outcome: 'ose_worse', evidence: { vs: 'rf_morgan', delta_mean_r: -0.1, ci: [-0.15, -0.05] } },
      H4: { supported: true, evidence: { sign_agreement: 0.95 }, post_hoc: { majority_rate: 0.95, beats_majority: false, note: 'x' } },
    } },
    random: protocol(0.5, 0.45, 0.3),
  },
  config: {}, environment: {},
}

describe('validation report', () => {
  it('picks the best baseline by mean r, excluding OSE', () => {
    expect(bestBaseline(fixture.protocols.scaffold)).toBe('rf_morgan')
    expect(bestBaseline(fixture.protocols.random)).toBe('rf_morgan')
  })

  it('renders real-data provenance, verdicts with text labels, and one dot-plot row per target', () => {
    render(<ValidationReport data={fixture} />)
    expect(screen.getByTestId('real-data-badge').textContent).toContain('55')
    expect(screen.getByTestId('stat-ose').textContent).toContain('0.30')
    expect(within(screen.getByTestId('verdict-H3')).getByText('לא נתמכה')).toBeTruthy()
    expect(within(screen.getByTestId('verdict-H1')).getByText('נתמכה')).toBeTruthy()
    expect(within(screen.getByTestId('verdict-H4')).getByText(/לא אינפורמטיבית/)).toBeTruthy()
    expect(screen.getByTestId('posthoc-H4').textContent).toContain('95%')
    for (const t of targets) expect(screen.getByTestId(`dot-row-${t}`)).toBeTruthy()
  })

  it('switching protocol updates the numbers and hides pre-registered verdicts for the secondary split', () => {
    render(<ValidationReport data={fixture} />)
    fireEvent.click(screen.getByTestId('protocol-random'))
    expect(screen.getByTestId('stat-ose').textContent).toContain('0.50')
    expect(screen.queryByTestId('verdict-H3')).toBeNull()
  })
})

describe('tab list keyboard navigation', () => {
  it('arrow keys move selection in reading direction (RTL: ArrowLeft = next) and wrap', () => {
    let value = 'a'
    const groups = [{ modes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }, { label: 'g', modes: [{ id: 'c', label: 'C' }] }]
    const { rerender } = render(
      <div dir="rtl"><TabList label="t" panelId="p" testPrefix="x" value={value} onChange={(v) => { value = v }} groups={groups} /></div>)
    const list = screen.getByRole('tablist')
    list.style.direction = 'rtl'
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(value).toBe('b')
    rerender(<div dir="rtl"><TabList label="t" panelId="p" testPrefix="x" value={value} onChange={(v) => { value = v }} groups={groups} /></div>)
    fireEvent.keyDown(list, { key: 'End' })
    expect(value).toBe('c')
    rerender(<div dir="rtl"><TabList label="t" panelId="p" testPrefix="x" value={value} onChange={(v) => { value = v }} groups={groups} /></div>)
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(value).toBe('b')
    expect(screen.getByTestId('x-a').getAttribute('aria-controls')).toBe('p')
  })
})
