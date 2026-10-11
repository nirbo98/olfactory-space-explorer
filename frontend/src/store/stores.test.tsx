import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useProjectionStore } from './projectionStore'
import { useMixtureStore } from './mixtureStore'
import { useSimulationStore } from './simulationStore'
import { useVisualizationStore } from './visualizationStore'
import { useAtlasPositions, useEffectiveProjection, SCENE_UNIT } from '../hooks/useProjection'
import { DimensionSelector } from '../components/controls/DimensionSelector'
import { startSimulationController } from '../services/simulationController'
import { selectedTarget } from '../components/visualization/SelectedOdorMarker'
import { projectOne } from '../mathematics/projection'
import type { Api } from '../services/api'
import { fakeResult, fixture, seedDataset } from '../test/fixtures'

const positionsFor = () => renderHook(() => useAtlasPositions()).result.current!

beforeEach(() => {
  seedDataset()
  useProjectionStore.getState().reset()
  useProjectionStore.setState({ mode: 'direct', dims: [0, 1, 2] })
  useMixtureStore.getState().reset()
  useSimulationStore.setState({ result: null, time: 0, playing: false, loop: false, speed: 1, compare: null })
  useVisualizationStore.setState({ displayState: 'steady' })
})

describe('dimension sliders (projection only)', () => {
  const axes = [['x', 0], ['y', 1], ['z', 2]] as const
  for (const [name, k] of axes) {
    it(`${name.toUpperCase()} dimension slider updates only ${name.toUpperCase()} coordinates`, () => {
      const embeddingsBefore = Array.from(seedDataset().flat)
      const before = positionsFor().slice()
      render(<DimensionSelector />)
      fireEvent.change(screen.getByTestId(`dim-${name}`), { target: { value: '17' } })
      expect(useProjectionStore.getState().dims[k]).toBe(17)
      expect(screen.getByTestId(`dim-${name}-value`)).toHaveTextContent('z[17]')
      const after = positionsFor()
      for (let m = 0; m < 5; m++) {
        for (let a = 0; a < 3; a++) {
          if (a === k) expect(after[m * 3 + a]).not.toBeCloseTo(before[m * 3 + a], 6)
          else expect(after[m * 3 + a]).toBe(before[m * 3 + a])
        }
      }
      // the underlying 256-D embeddings are unchanged
      const ds = fixture.embeddings.flat()
      expect(embeddingsBefore.slice(0, 10)).toEqual(Array.from(new Float32Array(ds.slice(0, 10))))
    })
  }

  it('X dimension 17 equals the standardized latent coordinate', () => {
    useProjectionStore.getState().setDim(0, 17)
    const p = positionsFor()
    const z = fixture.embeddings[3]
    const expected = ((z[17] - fixture.reference.dim_mean[17]) / fixture.reference.dim_std[17]) * SCENE_UNIT
    expect(p[3 * 3]).toBeCloseTo(expected, 4)
  })

  it('shows a degeneracy warning for repeated dimensions', () => {
    useProjectionStore.setState({ dims: [5, 5, 2] })
    render(<DimensionSelector />)
    expect(screen.getByTestId('degenerate-warning')).toBeInTheDocument()
  })
})

describe('simulation controller', () => {
  let simulate: ReturnType<typeof vi.fn>
  let stop: () => void
  beforeEach(() => {
    vi.useFakeTimers()
    simulate = vi.fn().mockImplementation(async () => fakeResult(fixture.embeddings[0]))
    stop = startSimulationController({ debounceMs: 50, apiImpl: { simulate } as unknown as Api })
  })
  afterEach(() => { stop(); vi.useRealTimers() })

  it('concentration changes trigger a new model prediction', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    simulate.mockClear()
    act(() => useMixtureStore.getState().setConcentration('C001', 1.25))
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(simulate).toHaveBeenCalledTimes(1)
    expect(simulate.mock.calls[0][0].mixture[0]).toEqual({ compound_id: 'C001', concentration: 1.25 })
  })

  it('projection-only changes do not call the simulation endpoint', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    simulate.mockClear()
    act(() => {
      useProjectionStore.getState().setDim(0, 17)
      useProjectionStore.getState().setMode('pca')
      useProjectionStore.getState().setScale(2)
      useVisualizationStore.getState().set({ showNeighbors: false })
      useMixtureStore.getState().selectReceptor('R010') // UI selection, not a model input
    })
    await act(async () => { await vi.advanceTimersByTimeAsync(200) })
    expect(simulate).not.toHaveBeenCalled()
  })

  it('debounces bursts and ignores stale responses', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    simulate.mockClear()
    let resolveSlow: (v: unknown) => void = () => undefined
    simulate.mockImplementationOnce(() => new Promise((r) => { resolveSlow = r }))
    act(() => useMixtureStore.getState().setConcentration('C001', 0.7))
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    act(() => { for (const c of [0.8, 0.9, 1.0]) useMixtureStore.getState().setConcentration('C001', c) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(simulate).toHaveBeenCalledTimes(2) // 0.7 (slow) + one debounced call for the burst
    const newest = useSimulationStore.getState().result
    await act(async () => { resolveSlow(fakeResult(fixture.embeddings[4])) })
    expect(useSimulationStore.getState().result).toBe(newest) // stale response discarded
  })

  it('receptor knockout is sent to the model', async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    simulate.mockClear()
    act(() => useMixtureStore.getState().knockout('R003'))
    await act(async () => { await vi.advanceTimersByTimeAsync(60) })
    expect(simulate.mock.calls[0][0].receptor_knockdowns).toEqual({ R003: 1 })
  })
})

describe('temporal playback', () => {
  beforeEach(() => useSimulationStore.setState({ result: fakeResult(fixture.embeddings[0]) }))
  it('playback advances the timeline', () => {
    useSimulationStore.getState().play()
    useSimulationStore.getState().advance(0.25)
    expect(useSimulationStore.getState().time).toBeCloseTo(0.25)
  })
  it('pause freezes the displayed simulation time', () => {
    const s = useSimulationStore.getState()
    s.play(); s.advance(0.2); s.pause(); s.advance(0.5)
    expect(useSimulationStore.getState().time).toBeCloseTo(0.2)
  })
  it('reset returns to the initial state', () => {
    const s = useSimulationStore.getState()
    s.play(); s.advance(0.4); s.resetTime()
    expect(useSimulationStore.getState()).toMatchObject({ time: 0, playing: false })
  })
  it('stops at the end unless looping', () => {
    const s = useSimulationStore.getState()
    s.play(); s.advance(5)
    expect(useSimulationStore.getState()).toMatchObject({ time: 0.9, playing: false })
    s.setLoop(true); s.setTime(0.8); s.play(); s.advance(0.3)
    expect(useSimulationStore.getState().time).toBeCloseTo(0.2)
  })
})

describe('selected odor marker', () => {
  it('corresponds to the projection of the returned embedding', () => {
    useProjectionStore.setState({ mode: 'pca' })
    const proj = renderHook(() => useEffectiveProjection()).result.current!
    const res = fakeResult(fixture.embeddings[2])
    const t = selectedTarget(res, 'steady', 0, proj)!
    const p = projectOne(res.odor_embedding, proj)
    t.forEach((v, k) => expect(v).toBeCloseTo(p[k] * proj.sceneScale, 10))
  })
})
