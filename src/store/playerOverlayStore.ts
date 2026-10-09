import { create } from 'zustand'

type PlayerOverlayState = {
	open: boolean
	setOpen: (open: boolean) => void
}

// 全局常驻播放器 overlay：open 为 true 表示播放器全屏可见（进入 /player 时打开，返回时关闭）
export const usePlayerOverlayStore = create<PlayerOverlayState>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
}))