import { create } from 'zustand'

type DockHideState = {
  isHidden: boolean
  setHidden: (v: boolean) => void
}

export const useDockHideStore = create<DockHideState>((set) => ({
  isHidden: false,
  setHidden: (v) => set({ isHidden: v }),
}))
