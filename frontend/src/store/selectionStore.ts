import { create } from 'zustand'

/** selectedOdorState — which reference odor (if any) the current mixture came from. */
export interface SelectionState {
  selectedSampleId: string | null
  hoveredIndex: number | null
  hoverPos: [number, number] | null
  select: (id: string | null) => void
  hover: (i: number | null, pos?: [number, number] | null) => void
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedSampleId: null,
  hoveredIndex: null,
  hoverPos: null,
  select: (selectedSampleId) => set({ selectedSampleId }),
  hover: (hoveredIndex, hoverPos = null) => set({ hoveredIndex, hoverPos }),
}))
