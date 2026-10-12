/**
 * Component limits for inverse design — the single source of truth for the UI.
 *
 * - Backend API (`POST /api/v1/inverse-design`, backend/app/schemas/api.py): 1–5 components, default 5.
 * - Interactive UI with the local backend: default 3, adjustable 1–5 (the API maximum).
 * - Static GitHub Pages build: results precomputed by backend/scripts/export_static.py with exactly 3
 *   components and fixed search settings; the controls are locked to those values there.
 *
 * `src/config/inverseLimits.test.ts` checks the Pages values against public/static/inverse.json.
 */
export const INVERSE_API_MAX_COMPONENTS = 5
export const INVERSE_UI_DEFAULT_COMPONENTS = 3

/** Search settings used to precompute the Pages results (must match public/static/inverse.json). */
export const PAGES_INVERSE_PARAMS = {
  maxComponents: 3,
  nStarts: 8,
  steps: 200,
  sparsityWeight: 1e-3,
} as const
