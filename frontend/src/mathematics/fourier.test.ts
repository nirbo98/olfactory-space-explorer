import { describe, expect, it } from 'vitest'
import { analyze } from './fourier'
import cases from './__fixtures__/fourier_fixture.json'

describe('fourier (TypeScript twin of backend fourier.py)', () => {
  cases.forEach((c, i) => {
    it(`case ${i}: spectrum, peaks and band-limited reconstruction match numpy`, () => {
      const r = analyze(c.signal, c.dt, c.band as [number, number])
      const e = c.expected
      expect(r.frequencies.length).toBe(e.frequencies.length)
      r.amplitude.forEach((a, k) => expect(a).toBeCloseTo(e.amplitude[k], 9))
      r.dominant.forEach((d, k) => expect(d.frequency).toBeCloseTo(e.dominant[k].frequency, 9))
      r.reconstruction!.forEach((v, k) => expect(v).toBeCloseTo(e.reconstruction[k], 8))
      expect(r.nyquist).toBeCloseTo(e.nyquist, 12)
    })
  })
})
