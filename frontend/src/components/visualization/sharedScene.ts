/** Mutable render-side state shared between scene components (never used for numbers shown to the user). */
export const sceneShared = {
  displayPositions: null as Float32Array | null, // interpolated atlas positions currently drawn
  markerPosition: [0, 0, 0] as [number, number, number],
  /** screen positions (canvas CSS px) of the inverse target and a point on its X drag handle — used by e2e tests */
  inverseHandles: null as null | { center: [number, number]; xHandle: [number, number] },
}
export const AXIS_LENGTH = 6
