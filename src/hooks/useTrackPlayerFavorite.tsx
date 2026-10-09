import { useFavorites } from '@/store/library'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { likeNeteaseSong } from '@/helpers/userApi/netease-music-api'
import { useCallback } from 'react'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { addLog } from '@/utils/appLogger'

export const useTrackPlayerFavorite = () => {
	const currentMusic = myTrackPlayer.useCurrentMusic()

	const { favorites, toggleTrackFavorite } = useFavorites()
	const { isLoggedIn, cookie } = useDailyRecommendStore()

	const isFavorite = favorites.find((track) => track.id === currentMusic?.id)?.id === currentMusic?.id

	// 我们正在更新轨道播放器内部状态和应用程序内部状态
	const toggleFavorite = useCallback(async () => {
		if (currentMusic) {
			const willBeFavorite = !isFavorite
			toggleTrackFavorite(currentMusic as any)

			const songInfo = {
				id: currentMusic.id,
				title: currentMusic.title,
				artist: currentMusic.artist,
				platform: (currentMusic as any).platform,
				source: (currentMusic as any).source,
				songmid: (currentMusic as any).songmid,
			}

			addLog('收藏同步', `点击收藏: ${willBeFavorite ? '收藏' : '取消收藏'} - ${songInfo.title} - ${songInfo.artist}`, 'info')
			addLog('收藏同步', `歌曲信息: ${JSON.stringify(songInfo)}`, 'info')
			addLog('收藏同步', `登录状态: isLoggedIn=${isLoggedIn}, hasCookie=${!!cookie}`, 'info')

			if (isLoggedIn && cookie) {
				const platform = (currentMusic as any).platform || (currentMusic as any).source
				const songId = (currentMusic as any).songmid || (currentMusic as any).id || ''
				const isNetease =
					platform === 'netease' ||
					platform === 'wy' ||
					String(songId).startsWith('netease_') ||
					String(songId).startsWith('wy_')

				addLog('收藏同步', `判断结果: platform=${platform}, songId=${songId}, isNetease=${isNetease}`, 'info')

				if (isNetease && songId) {
					addLog('收藏同步', `开始调用网易云API: songId=${songId}, like=${willBeFavorite}`, 'info')

					likeNeteaseSong(songId, willBeFavorite, cookie).then((result) => {
						if (result.success) {
							addLog('收藏同步', `同步成功: ${willBeFavorite ? '收藏' : '取消收藏'} ${songId}`, 'success')
						} else {
							const errMsg = result.data ? `API返回: ${JSON.stringify(result.data)}` : `错误: ${result.error || '未知'}`
							addLog('收藏同步', `同步失败: ${errMsg}`, 'error')
						}
					}).catch((err) => {
						addLog('收藏同步', `同步异常: ${err?.message || String(err)}`, 'error')
					})
				} else {
					addLog('收藏同步', `跳过同步: 非网易云歌曲或songId为空`, 'warn')
				}
			} else {
				addLog('收藏同步', `跳过同步: 未登录或无cookie`, 'warn')
			}
		}
	}, [isFavorite, toggleTrackFavorite, currentMusic, isLoggedIn, cookie])

	return { isFavorite, toggleFavorite }
}
