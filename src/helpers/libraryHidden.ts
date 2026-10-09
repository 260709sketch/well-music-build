import PersistStatus from '@/store/PersistStatus'

const KEY = 'music.hiddenPlaylistIds'

export const getHiddenPlaylistIds = (): string[] => {
	try {
		const v = PersistStatus.get(KEY as any)
		return Array.isArray(v) ? v : []
	} catch (e) {
		return []
	}
}

const setHidden = (ids: string[]) => {
	PersistStatus.set(KEY as any, ids)
}

export const toggleHiddenPlaylist = (id: string): void => {
	const cur = getHiddenPlaylistIds()
	const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
	setHidden(next)
}

export const isPlaylistHidden = (id: string): boolean => getHiddenPlaylistIds().includes(id)