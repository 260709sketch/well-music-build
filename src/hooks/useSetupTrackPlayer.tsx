import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useEffect, useRef } from 'react'
import TrackPlayer, { Capability, RatingType, RepeatMode } from 'react-native-track-player'
import { setupFLACSync } from '@/player/FLACPreciseSync'

const setupPlayer = async () => {
	// autoHandleInterruptions：来电/系统音频焦点中断后由 TrackPlayer 自动恢复播放，
	// 避免「播放中突然暂停、过一会又自己打开」的异常表现
	await TrackPlayer.setupPlayer({ autoHandleInterruptions: true })

	await TrackPlayer.updateOptions({
		ratingType: RatingType.Heart,
		capabilities: [
			Capability.Play,
			Capability.Pause,
			Capability.SkipToNext,
			Capability.SkipToPrevious,
			Capability.Stop,
			Capability.SeekTo,
			Capability.Like,
		],
		likeOptions: {
			isActive: false,
			title: '收藏',
		},
		progressUpdateEventInterval: 0.1,
	})

	await TrackPlayer.setVolume(1) // 默认音量1
	await TrackPlayer.setRepeatMode(RepeatMode.Queue)

	// 初始化 FLAC 精准同步的切歌监听
	// 确保每首歌都会检查并启动高音质下载
	setupFLACSync()
}

export const useSetupTrackPlayer = ({ onLoad }: { onLoad?: () => void }) => {
	//useSetupTrackPlayer 这个自定义 Hook 用于初始化音乐播放器，并确保它只初始化一次。
	const isInitialized = useRef(false) //是一个 React Hook，用于持有可变的对象，这些对象在组件的生命周期内保持不变。使用 useRef 创建一个引用 isInitialized，初始值为 false。它用于跟踪播放器是否已经初始化。

	useEffect(() => {
		//是一个 React Hook，用于在函数组件中执行副作用（如数据获取、订阅等）。
		if (isInitialized.current) return

		setupPlayer()
			.then(async () => {
				await myTrackPlayer.setupTrackPlayer()
				isInitialized.current = true
				onLoad?.()
			})
			.catch((error) => {
				isInitialized.current = false
				console.error(error)
			})
	}, [onLoad])
}
