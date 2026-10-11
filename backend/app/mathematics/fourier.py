"""Discrete Fourier analysis of time-dependent (simulated or measured) activity.

Frequencies are in cycles per unit of the simulation clock (Hz when the clock is
in seconds). They describe temporal structure of the signal — e.g. a sniffing
rhythm — and say nothing about molecular identity.
"""
from __future__ import annotations

import numpy as np


def analyze(signal, sample_spacing: float, band: tuple[float, float] | None = None,
            remove_mean: bool = True, n_peaks: int = 3) -> dict:
    x = np.asarray(signal, dtype=np.float64)
    if x.ndim != 1 or len(x) < 4:
        raise ValueError("signal must be 1-D with at least 4 samples")
    if not np.all(np.isfinite(x)):
        raise ValueError("signal contains non-finite values")
    if sample_spacing <= 0:
        raise ValueError("sample_spacing must be positive")
    n = len(x)
    mean = float(x.mean())
    xc = x - mean if remove_mean else x
    X = np.fft.rfft(xc)
    freqs = np.fft.rfftfreq(n, d=sample_spacing)
    amp = np.abs(X) / n
    amp[1:] *= 2.0                       # single-sided amplitude
    if n % 2 == 0:
        amp[-1] /= 2.0                   # Nyquist bin is not doubled
    power = amp ** 2

    # dominant frequencies: local maxima of the amplitude spectrum, DC excluded
    peaks = [k for k in range(1, len(amp)) if amp[k] >= amp[k - 1] and (k == len(amp) - 1 or amp[k] >= amp[k + 1])]
    peaks = sorted(peaks, key=lambda k: -amp[k])[:n_peaks]
    dominant = [{"frequency": float(freqs[k]), "amplitude": float(amp[k])} for k in peaks if amp[k] > 1e-12]

    result = {
        "frequencies": freqs.tolist(),
        "amplitude": amp.tolist(),
        "power": power.tolist(),
        "dominant": dominant,
        "sample_spacing": sample_spacing,
        "sampling_rate": 1.0 / sample_spacing,
        "nyquist": 0.5 / sample_spacing,
        "frequency_resolution": 1.0 / (n * sample_spacing),
        "n_samples": n,
        "mean": mean,
    }
    if band is not None:
        lo, hi = band
        if lo < 0 or hi < lo:
            raise ValueError("band must satisfy 0 <= low <= high")
        keep = (freqs >= lo) & (freqs <= hi)
        Xb = np.where(keep, X, 0)
        recon = np.fft.irfft(Xb, n=n) + (mean if remove_mean else 0.0)
        result["band"] = [lo, hi]
        result["reconstruction"] = recon.tolist()
        result["reconstruction_rmse"] = float(np.sqrt(np.mean((recon - x) ** 2)))
    return result
