import { describe, expect, it } from 'vitest'
import { effectiveProjection, liftDisplacement, projectAll, projectOne, symEig3, type ProjectionSpec } from './projection'
import { fixture, reference, E } from '../test/fixtures'

const spec = (c: (typeof fixture.cases)[number]): ProjectionSpec => ({
  mode: c.mode as ProjectionSpec['mode'],
  dims: ((c.params as { dims?: number[] }).dims ?? [0, 1, 2]) as ProjectionSpec['dims'],
  axes: ((c.params as { axes?: ProjectionSpec['axes'] }).axes ?? [
    { primary: 0, secondary: 1, mix: 0 }, { primary: 2, secondary: 3, mix: 0 }, { primary: 4, secondary: 5, mix: 0 }]) as ProjectionSpec['axes'],
  orthogonalize: Boolean((c.params as { orthogonalize?: boolean }).orthogonalize),
})

describe('projection (TypeScript twin of backend projection.py)', () => {
  for (const c of fixture.cases) {
    it(`${c.mode}: coordinates match the Python reference`, () => {
      const proj = effectiveProjection(reference, spec(c))
      fixture.embeddings.forEach((z, m) => {
        const p = projectOne(z, proj)
        p.forEach((v, k) => expect(v).toBeCloseTo(c.coords[m][k], 8))
      })
    })
    it(`${c.mode}: minimum-norm lift matches pinv in Python and reproduces Δp`, () => {
      const proj = effectiveProjection(reference, spec(c))
      const dz = liftDisplacement(proj.P, c.lift_delta as [number, number, number])
      const lifted = fixture.embeddings[0].map((v, i) => v + dz[i])
      lifted.forEach((v, i) => expect(v).toBeCloseTo(c.lifted[i], 7))
      const p0 = projectOne(fixture.embeddings[0], proj), p1 = projectOne(lifted, proj)
      p1.forEach((v, k) => expect(v - p0[k]).toBeCloseTo(c.lift_delta[k], 8))
    })
  }

  it('PCA projection returns three coordinates and is deterministic', () => {
    const proj = effectiveProjection(reference, spec(fixture.cases[0]))
    const a = projectOne(fixture.embeddings[2], proj), b = projectOne([...fixture.embeddings[2]], proj)
    expect(a).toHaveLength(3)
    expect(a).toEqual(b)
  })

  it('projection never mutates embeddings', () => {
    const Z = new Float32Array(fixture.embeddings.flat())
    const copy = Z.slice()
    projectAll(Z, 5, effectiveProjection(reference, spec(fixture.cases[1])), 2.2, new Float32Array(15))
    expect(Array.from(Z)).toEqual(Array.from(copy))
  })

  it('flags degenerate direct selections', () => {
    const s = { ...spec(fixture.cases[1]), dims: [4, 4, 9] as [number, number, number] }
    expect(effectiveProjection(reference, s).warnings).toContain('degenerate')
  })

  it('symmetric 3×3 eigen-decomposition reconstructs the matrix', () => {
    const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 1]]
    const { values, vectors } = symEig3(A)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let s = 0
      for (let k = 0; k < 3; k++) s += vectors[i][k] * values[k] * vectors[j][k]
      expect(s).toBeCloseTo(A[i][j], 10)
    }
  })

  it('reference dimension is 256', () => expect(E).toBe(256))
})
