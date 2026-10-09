import myTrackPlayer from '@/helpers/trackPlayerIndex'
import TrackPlayer, { Event } from 'react-native-track-player'
import { useLibraryStore } from '@/store/library'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { likeNeteaseSong } from '@/helpers/userApi/netease-music-api'

export const playbackService = async () => {
	TrackPlayer.addEventListener(Event.RemotePlay, () => {
		TrackPlayer.play()
	})

	TrackPlayer.addEventListener(Event.RemotePause, () => {
		TrackPlayer.pause()
	})

	TrackPlayer.addEventListener(Event.RemoteStop, () => {
		TrackPlayer.stop()
	})

	TrackPlayer.addEventListener(Event.RemoteNext, () => {
		myTrackPlayer.skipToNext()
	})

	TrackPlayer.addEventListener(Event.RemotePrevious, () => {
		myTrackPlayer.skipToPrevious()
	})

	TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
		const position = event.position
		TrackPlayer.seekTo(position)
	})

	// 锁屏 / 控制中心：星标收藏歌曲
	TrackPlayer.addEventListener(Event.RemoteLike, async () => {
		try {
			const track: any = await TrackPlayer.getActiveTrack()
			if (!track) return
			const { favorites, toggleTrackFavorite } = useLibraryStore.getState()
			const willBeFavorite = !favorites.find((f: any) => f.id === track.id)
			toggleTrackFavorite(track)
			const { isLoggedIn, cookie } = useDailyRecommendStore.getState()
			if (isLoggedIn && cookie) {
				const platform = track.platform || track.source
				const songId = track.songmid || track.id || ''
				const isNetease =
					platform === 'netease' || platform === 'wy' ||
					String(songId).startsWith('netease_') || String(songId).startsWith('wy_')
				if (isNetease && songId) {
					likeNeteaseSong(String(songId), willBeFavorite, cookie).catch(() => {})
				}
			}
		} catch (e) {
			// ignore
		}
	})
}
