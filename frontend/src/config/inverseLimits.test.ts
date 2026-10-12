import { describe, expect, it } from 'vitest'
import precomputed from '../../public/static/inverse.json'
import { INVERSE_API_MAX_COMPONENTS, INVERSE_UI_DEFAULT_COMPONENTS, PAGES_INVERSE_PARAMS } from './inverseLimits'
import { useInverseDesignStore } from '../store/inverseDesignStore'

describe('inverse-design component limits', () => {
  it('Pages constants match the settings the static results were precomputed with', () => {
    const p = precomputed.params
    expect(PAGES_INVERSE_PARAMS.maxComponents).toBe(p.max_components)
    expect(PAGES_INVERSE_PARAMS.nStarts).toBe(p.n_starts)
    expect(PAGES_INVERSE_PARAMS.steps).toBe(p.steps)
    expect(PAGES_INVERSE_PARAMS.sparsityWeight).toBe(p.sparsity_weight)
  })

  it('every precomputed Pages candidate respects the 3-component limit', () => {
    const results = Object.values(precomputed.results) as { candidates: { components: unknown[] }[] }[]
    expect(results.length).toBeGreaterThan(0)
    for (const r of results) for (const c of r.candidates) {
      expect(c.components.length).toBeGreaterThan(0)
      expect(c.components.length).toBeLessThanOrEqual(PAGES_INVERSE_PARAMS.maxComponents)
    }
  })

  it('UI default is 3 and never exceeds the API maximum of 5', () => {
    expect(INVERSE_API_MAX_COMPONENTS).toBe(5)
    expect(useInverseDesignStore.getState().maxComponents).toBe(INVERSE_UI_DEFAULT_COMPONENTS)
    expect(INVERSE_UI_DEFAULT_COMPONENTS).toBeLessThanOrEqual(INVERSE_API_MAX_COMPONENTS)
  })
})
