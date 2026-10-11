/**
 * Discrete Fourier analysis for the static (GitHub Pages) build — a TypeScript twin of
 * backend/app/mathematics/fourier.py, checked against a Python fixture. Exact DFT, O(n²):
 * signals here have ~120 samples.
 */
export interface FourierResult {
  frequencies: number[]
  amplitude: number[]
  power: number[]
  dominant: { frequency: number; amplitude: number }[]
  sample_spacing: number
  sampling_rate: number
  nyquist: number
  frequency_resolution: number
  n_samples: number
  mean: number
  band?: [number, number]
  reconstruction?: number[]
  reconstruction_rmse?: number
}

export function analyze(signal: number[], dt: number, band: [number, number] | null = null, removeMean = true, nPeaks = 3): FourierResult {
  const n = signal.length
  if (n < 4) throw new Error('signal must have at least 4 samples')
  if (!(dt > 0)) throw new Error('sample_spacing must be positive')
  if (signal.some((v) => !Number.isFinite(v))) throw new Error('signal contains non-finite values')
  const mean = signal.reduce((a, b) => a + b, 0) / n
  const x = removeMean ? signal.map((v) => v - mean) : signal.slice()
  const K = Math.floor(n / 2) + 1
  const re = new Float64Array(K), im = new Float64Array(K)
  for (let k = 0; k < K; k++) {
    let sr = 0, si = 0
    for (let j = 0; j < n; j++) {
      const a = (-2 * Math.PI * k * j) / n
      sr += x[j] * Math.cos(a)
      si += x[j] * Math.sin(a)
    }
    re[k] = sr; im[k] = si
  }
  const freqs = Array.from({ length: K }, (_, k) => k / (n * dt))
  const amp = Array.from({ length: K }, (_, k) => Math.hypot(re[k], im[k]) / n)
  for (let k = 1; k < K; k++) amp[k] *= 2
  if (n % 2 === 0) amp[K - 1] /= 2
  const peaks: number[] = []
  for (let k = 1; k < K; k++) if (amp[k] >= amp[k - 1] && (k === K - 1 || amp[k] >= amp[k + 1])) peaks.push(k)
  peaks.sort((a, b) => amp[b] - amp[a])
  const result: FourierResult = {
    frequencies: freqs, amplitude: amp, power: amp.map((a) => a * a),
    dominant: peaks.slice(0, nPeaks).filter((k) => amp[k] > 1e-12).map((k) => ({ frequency: freqs[k], amplitude: amp[k] })),
    sample_spacing: dt, sampling_rate: 1 / dt, nyquist: 0.5 / dt, frequency_resolution: 1 / (n * dt), n_samples: n, mean,
  }
  if (band) {
    const [lo, hi] = band
    if (lo < 0 || hi < lo) throw new Error('band must satisfy 0 <= low <= high')
    // inverse real DFT of the band-masked half spectrum (numpy.fft.irfft semantics)
    const recon = new Array<number>(n).fill(0)
    for (let j = 0; j < n; j++) {
      let s = 0
      for (let k = 0; k < K; k++) {
        if (freqs[k] < lo || freqs[k] > hi) continue
        const a = (2 * Math.PI * k * j) / n
        const edge = k === 0 || (n % 2 === 0 && k === K - 1)
        const term = edge ? re[k] * Math.cos(a) : re[k] * Math.cos(a) - im[k] * Math.sin(a)
        s += edge ? term : 2 * term
      }
      recon[j] = s / n + (removeMean ? mean : 0)
    }
    result.band = [lo, hi]
    result.reconstruction = recon
    result.reconstruction_rmse = Math.sqrt(recon.reduce((a, v, j) => a + (v - signal[j]) ** 2, 0) / n)
  }
  return result
}
