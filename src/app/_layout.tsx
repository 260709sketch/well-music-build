import { CustomToast } from '@/components/CustomToast'
import { useToastStyleStore } from '@/store/toastStyleStore'
﻿import { playbackService } from '@/constants/playbackService'
import { AppThemeProvider, useAppTheme } from '@/hooks/useAppTheme'
import LyricManager from '@/helpers/lyricManager'
import { checkSourceUpdatesOnLaunch } from '@/helpers/sourceUpdateChecker'
import { logInfo } from '@/helpers/logger'
import { addLog, setupConsoleCapture, clearLogs } from '@/utils/appLogger'
// 日志格式升级，只清一次旧版膨胀日志
const LOG_VERSION_KEY = 'app_log_version'
const CURRENT_LOG_VERSION = '2'
AsyncStorage.getItem(LOG_VERSION_KEY).then(v => {
	if (v !== CURRENT_LOG_VERSION) {
		clearLogs().then(() => AsyncStorage.setItem(LOG_VERSION_KEY, CURRENT_LOG_VERSION))
	}
})
setupConsoleCapture()
addLog('app', '应用启动，全局日志捕获已开启')
import { getPlayHistory } from '@/helpers/playHistory'
import PersistStatus from '@/store/PersistStatus'
import myTrackPlayer, { musicApiStore, musicApiSelectedStore } from '@/helpers/trackPlayerIndex'
import { currentMusicStore } from '@/player/PlayerStore'
import { useCacheManagerStore } from '@/store/cacheManagerStore'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import SourceTestGlobalAlert from '@/components/SourceTestGlobalAlert'
import { useLogTrackPlayerState } from '@/hooks/useLogTrackPlayerState'
import { useListenStats } from '@/hooks/useListenStats'
import { useSetupTrackPlayer } from '@/hooks/useSetupTrackPlayer'
import { useSyncRemoteLike } from '@/hooks/useSyncRemoteLike'
import { useCrossfade } from '@/hooks/useCrossfade'
import { useBluetoothAutoPause } from '@/hooks/useBluetoothAutoPause'
import i18n, { setI18nConfig } from '@/utils/i18n'
import { getDeviceInfo } from '@/utils/responsive'
import { router, Stack } from 'expo-router'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Alert, Animated, View, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Toast, { BaseToast } from 'react-native-toast-message'
import TrackPlayer from 'react-native-track-player'

TrackPlayer.registerPlaybackService(() => playbackService)
setI18nConfig()
const App = () => {
	// 全局屏幕适配初始化
	useEffect(() => {
		const deviceInfo = getDeviceInfo()
		console.log('[全局适配] 设备信息:', {
			width: deviceInfo.width,
			height: deviceInfo.height,
			widthScale: deviceInfo.widthScale.toFixed(3),
			heightScale: deviceInfo.heightScale.toFixed(3),
			minScale: deviceInfo.minScale.toFixed(3),
			isSmallScreen: deviceInfo.isSmallScreen,
			isLargeScreen: deviceInfo.isLargeScreen,
		})
	}, [])

	// 启动时计算图片缓存大小（用于判断是否超过上限）
	useEffect(() => {
		useCacheManagerStore.getState().updateImageCacheSize()
	}, [])

	// 全局闪退错误捕获
	useEffect(() => {
		const defaultHandler = ErrorUtils.getGlobalHandler()
		ErrorUtils.setGlobalHandler((error, isFatal) => {
			try {
				const errorMsg = error?.message || String(error)
				const errorStack = error?.stack || ''
				const prefix = isFatal ? '[致命] ' : '[非致命] '
				addLog(
					'闪退',
					prefix + errorMsg + chr(10) + errorStack.substring(0, 500),
					'error'
				)
			} catch (e) {
				console.error('保存闪退日志失败:', e)
			}
			defaultHandler(error, isFatal)
		})
	}, [])

	const handleTrackPlayerLoaded = useCallback(() => {
		// 播放器加载完成后，setupTrackPlayer已经恢复了队列和歌曲
		// 如果开了自动播放，setupTrackPlayer里已经play了，这里不需要重复play
		// 如果没有恢复的队列（首次使用），才用历史播放
		try {
			const autoPlayOnLaunch = PersistStatus.get('music.autoPlayOnLaunch') ?? false
			if (!autoPlayOnLaunch) {
				logInfo('[auto-play] 未开启启动自动播放，跳过')
				return
			}
			// 检查启动恢复是否成功（currentMusicStore有值说明已恢复）
			if (currentMusicStore.getValue()) {
				logInfo('[auto-play] 启动恢复已处理自动播放，跳过')
				return
			}
			// 没有恢复队列，用历史播放：用完整历史初始化待播队列，
			// 避免只 play 单曲导致队列只剩一首、一直单曲循环
			const history = getPlayHistory()
			if (history && history.length > 0) {
				const firstSong = history[0]
				logInfo(`[auto-play] 自动播放历史第一首:`, firstSong.title, `，用历史初始化队列(共${history.length}首)`)
				myTrackPlayer.playWithReplacePlayList(firstSong, history)
			}
		} catch (error) {
			console.error('[auto-play] 自动播放失败:', error)
		}
	}, [])

	useSetupTrackPlayer({
		onLoad: handleTrackPlayerLoaded, //播放器初始化后调用这个回调函数。这里先传过去。
	})

	useLogTrackPlayerState()
	// 全局听歌统计（播放次数 + 听歌时长）
	useListenStats()
	// 交叉淡入淡出
		useCrossfade()
		// 断蓝牙/拔耳机自动暂停
		useBluetoothAutoPause()
	// 锁屏 / 控制中心收藏按钮状态同步
	useSyncRemoteLike()
	// myTrackPlayer.setupTrackPlayer()

	LyricManager.setup()
	const { hasShareIntent } = useShareIntentContext()

	// App启动时自动刷新日推（每天一次）
	useEffect(() => {
		useDailyRecommendStore.getState().refreshDaily()
		useDailyRecommendStore.getState().refreshBanners()
		// 如果已登录，自动导入用户歌单（静默，不弹提醒）
		const state = useDailyRecommendStore.getState()
		if (state.isLoggedIn && state.userId) {
			setTimeout(() => {
				state.importUserPlaylists(true)
			}, 2000)
		}
	}, [])

	// App启动时自动加载已导入的音源
	useEffect(() => {
		const musicApis = musicApiStore.getValue() || []
		const selectedApi = musicApiSelectedStore.getValue()
		if (musicApis.length > 0 && !selectedApi) {
			// 有音源但没有选中的，自动选择第一个
			const firstApi = musicApis[0]
			logInfo(`[app-init] 自动选择第一个音源: ${firstApi.name}`)
			myTrackPlayer.setMusicApiAsSelectedById(firstApi.id)
		}
	}, [])

	// App启动5秒后检查音源更新
	useEffect(() => {
		const timer = setTimeout(() => {
			checkSourceUpdatesOnLaunch(router)
		}, 5000)
		return () => clearTimeout(timer)
	}, [])

	// App启动时自动导航到首页（已由 index.tsx 的 Redirect 处理，无需延迟跳转）

	useEffect(() => {
		if (hasShareIntent) {
			// we want to handle share intent event in a specific page
			console.log('[expo-router-index111] redirect to ShareIntent screen')
			console.log('[expo-router-index111] hasShareIntent', hasShareIntent)
			router.replace('/(modals)/well')
		}
	}, [hasShareIntent])
	useEffect(() => {
		const initI18n = async () => {
			try {
				// 确保 i18n 配置已加载
				await setI18nConfig()
			} catch (error) {
				console.error('Failed to initialize i18n:', error)
			}
		}

		initI18n()
	}, [])
	return (
		<ShareIntentProvider
			options={{
				debug: true,
				resetOnBackground: false,
				onResetShareIntent: () =>
					// used when app going in background and when the reset button is pressed
					router.replace({
						pathname: '/',
					}),
			}}
		>
			<AppThemeProvider>
				<ThemedAppShell />
			</AppThemeProvider>
		</ShareIntentProvider>
	)
}

const ThemedAppShell = () => {
	const { colors, statusBarStyle, isDark } = useAppTheme()
	const { topOffset: toastTopOffset } = useToastStyleStore()

	const toastConfig = useMemo(
		() => ({
			success: (props: any) => <CustomToast {...props} isDark={isDark} />,
			error: (props: any) => <CustomToast {...props} isDark={isDark} />,
			info: (props: any) => <CustomToast {...props} isDark={isDark} />,
		}),
		[isDark],
	)

	return (
		<SafeAreaProvider>
			<GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
				<RootNavigation />
				<StatusBar style={statusBarStyle} />
				<Toast config={toastConfig} animationConfig={{ type: "timing", duration: 200 }} autoHide={true} visibilityTime={3000} topOffset={120} />
			</GestureHandlerRootView>
		</SafeAreaProvider>
	)
}

const RootNavigation = () => {
	const { colors } = useAppTheme()
	const { topOffset: toastTopOffset } = useToastStyleStore()

	return (
		<View style={{ flex: 1 }}>
		{/* 每个 Stack.Screen 组件定义了一个可导航的屏幕 */}
		<Stack screenOptions={{ headerTintColor: '#fc3c44' }}>
			{/* index 重定向页：隐藏 header + 关闭动画，避免启动时闪现空白 index 页再滑动跳转 */}
			<Stack.Screen name="index" options={{ headerShown: false, animation: 'none' }} />
			<Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none', cardStyle: { backgroundColor: '#000' } }} />
			<Stack.Screen
				name="player"
				options={{
					presentation: 'card',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
					cardStyle: { backgroundColor: '#000', overflow: 'hidden' },
				}}
			/>
			<Stack.Screen
				name="(modals)/playList"
				options={{
					presentation: 'modal',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modals)/addToPlaylist"
				options={{
					presentation: 'modal',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitle: i18n.t('addToPlaylist.title'),
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
			<Stack.Screen
				name="(modals)/settings"
				options={{
					presentation: 'modal',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: true,
					headerTitle: '设置',
					headerShadowVisible: false,
					headerStyle: { backgroundColor: colors.background },
					headerTitleStyle: { color: colors.text },
				}}
			/>
			<Stack.Screen
				name="(modals)/sourceStatus"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
				}}
			/>
			<Stack.Screen
				name="(modals)/importPlayList"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
				}}
			/>
			<Stack.Screen
				name="(modals)/[name]"
					options={{
						presentation: 'modal',
						headerShown: false,
						gestureEnabled: true,
					}}
				/>
			<Stack.Screen
				name="(modals)/monthlyReport"
				options={{
					presentation: 'modal',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: true,
					headerTitle: '听歌月报',
					headerShadowVisible: false,
					headerStyle: { backgroundColor: colors.background },
					headerTitleStyle: { color: colors.text },
				}}
			/>
			<Stack.Screen
				name="(modals)/comments"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
				}}
			/>
			<Stack.Screen
				name="(modals)/neteaseLogin"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
				}}
			/>
			<Stack.Screen
				name="(modals)/backupManager"
				options={{
					presentation: 'modal',
					headerShown: true,
					gestureEnabled: true,
					headerTitle: '数据备份',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
		<Stack.Screen
			name="(modals)/sourceCenter"
			options={{
				presentation: 'card',
				headerShown: false,
				gestureEnabled: true,
				gestureDirection: 'horizontal',
				animationDuration: 350,
			}}
		/>
		<Stack.Screen
					name="(modals)/playlistDetail"
					options={{
						presentation: 'card',
						headerShown: false,
						gestureEnabled: true,
						gestureDirection: 'horizontal',
						animationDuration: 350,
						cardStyle: { backgroundColor: '#000' },
					}}
				/>
		<Stack.Screen
					name="(modals)/artist/[id]"
					options={{
						presentation: 'modal',
						headerShown: false,
						gestureEnabled: true,
					}}
				/>
					<Stack.Screen
							name="(modals)/newArtist"
							options={{
								presentation: 'modal',
								headerShown: false,
								gestureEnabled: true,
							}}
						/>
			</Stack>
			<SourceTestGlobalAlert />
			</View>
	)
}

export default App
