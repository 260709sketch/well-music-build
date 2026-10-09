import { create } from 'zustand'

interface SearchState {
	keyword: string
	setKeyword: (keyword: string) => void
	isSearchBarExpanded: boolean
	setSearchBarExpanded: (expanded: boolean) => void
}

export const useSearchStore = create<SearchState>((set) => ({
	keyword: '',
	setKeyword: (keyword) => set({ keyword }),
	isSearchBarExpanded: false,
	setSearchBarExpanded: (expanded) => set({ isSearchBarExpanded: expanded }),
}))
