// 评论区弹窗参数store
import { create } from 'zustand'

interface CommentModalParams {
	songId: string
	songTitle: string
	songArtist?: string
	songCover?: string
	platform?: string
}

interface CommentModalStore {
	params: CommentModalParams | null
	setParams: (params: CommentModalParams) => void
	clearParams: () => void
}

export const useCommentModalStore = create<CommentModalStore>((set) => ({
	params: null,
	setParams: (params) => set({ params }),
	clearParams: () => set({ params: null }),
}))
