import { useEffect } from 'react'
import TrackPlayer, { Capability } from 'react-native-track-player'
import { useFavorites } from '@/store/library'
import { currentMusicStore } from '@/player/PlayerStore'

// 原生 updateOptions 会用传入的 capabilities 整体替换远程命令，缺失即全部禁用，
// 因此这里必须带上与 useSetupTrackPlayer 一致的完整 capabilities 列表
const REMOTE_CAPABILITIES = [
	Capability.Play,
	Capability.Pause,
	Capability.SkipToNext,
	Capability.SkipToPrevious,
	Capability.Stop,
	Capability.SeekTo,
	Capability.Like,
]

// 锁屏 / 控制中心收藏按钮（星标）状态同步：
// 当前播放歌曲或收藏列表变化时，更新 likeOptions.isActive，让系统星形按钮实心/空心跟随收藏状态
export const useSyncRemoteLike = () => {
	const { favorites } = useFavorites()
	const currentSong = currentMusicStore.useValue()

	useEffect(() => {
		const isActive = !!currentSong && favorites.some((f: any) => f.id === currentSong.id)
		TrackPlayer.updateOptions({
			capabilities: REMOTE_CAPABILITIES,
			likeOptions: { isActive, title: '收藏' },
		}).catch(() => {})
	}, [favorites, currentSong])
}
