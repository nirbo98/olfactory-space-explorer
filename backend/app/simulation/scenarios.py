"""Temporal stimulation scenarios (simulated inhalation protocols).

Each scenario defines onset, stimulation duration, a concentration profile
m(t) ∈ [0, 1] (multiplying the mixture concentrations), a recovery period and
the total duration. Frames are sampled at t_k = k·Δt, Δt = total / frame_count.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

import numpy as np


@dataclass
class Scenario:
    id: str
    name: str
    name_he: str
    onset: float = 0.5
    duration: float = 1.5
    total: float = 4.0
    profile: str = "pulse"         # pulse | double | sniff | ramp
    frequency: float | None = None  # Hz, for 'sniff'
    edge: float = 0.06             # s, raised-cosine rise/fall time

    @property
    def recovery(self) -> float:
        return max(self.total - self.onset - self.duration, 0.0)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["recovery"] = self.recovery
        return d


SCENARIOS: dict[str, Scenario] = {s.id: s for s in [
    Scenario("single_pulse", "Single inhalation pulse", "שאיפה בודדת", 0.5, 1.5, 4.0, "pulse"),
    Scenario("double_pulse", "Two inhalations", "שתי שאיפות", 0.4, 2.4, 4.0, "double"),
    Scenario("sniff_4hz", "Rhythmic sniffing (4 Hz)", "רחרוח קצבי (4Hz)", 0.5, 2.5, 4.0, "sniff", 4.0),
    Scenario("ramp", "Slow concentration ramp", "עלייה הדרגתית בריכוז", 0.3, 2.5, 4.0, "ramp"),
]}


def _smooth_window(t: np.ndarray, start: float, end: float, edge: float) -> np.ndarray:
    w = np.zeros_like(t)
    rise = (t >= start) & (t < start + edge)
    flat = (t >= start + edge) & (t < end - edge)
    fall = (t >= end - edge) & (t < end)
    w[rise] = 0.5 * (1 - np.cos(np.pi * (t[rise] - start) / edge))
    w[flat] = 1.0
    w[fall] = 0.5 * (1 + np.cos(np.pi * (t[fall] - (end - edge)) / edge))
    return w


def profile(s: Scenario, t: np.ndarray) -> np.ndarray:
    on, off = s.onset, s.onset + s.duration
    if s.profile == "pulse":
        return _smooth_window(t, on, off, s.edge)
    if s.profile == "double":
        L = s.duration / 2.5
        return _smooth_window(t, on, on + L, s.edge) + _smooth_window(t, off - L, off, s.edge)
    if s.profile == "sniff":
        f = s.frequency or 4.0
        inside = (t >= on) & (t < off)
        out = np.zeros_like(t)
        out[inside] = 0.5 * (1 - np.cos(2 * np.pi * f * (t[inside] - on)))
        return out
    if s.profile == "ramp":
        out = np.clip((t - on) / max(s.duration, 1e-9), 0, 1)
        out[t >= off] = 0.0
        return out
    raise ValueError(f"unknown profile {s.profile!r}")


def time_grid(total: float, frame_count: int) -> tuple[np.ndarray, float]:
    if frame_count < 4:
        raise ValueError("frame_count must be ≥ 4")
    dt = total / frame_count
    return np.arange(frame_count) * dt, dt
