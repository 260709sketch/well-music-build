import React, { useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	Alert,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useCurrentQuality } from '@/helpers/trackPlayerIndex'
import { usePreloadSettingsStore } from '@/store/preloadSettingsStore'
import { useCrossPlatformFallbackStore } from '@/store/crossPlatformFallbackStore'
import { useAutoSourceSwitchStore } from '@/store/autoSourceSwitchStore'
import { useSourceSwitchToastStore } from '@/store/sourceSwitchToastStore'
import { useTabBarStyleStore, DOCK_BLUR_LEVEL_LABELS } from '@/store/tabBarStyleStore'
import { BlurView } from 'expo-blur'
import { Modal } from 'react-native'
import PersistStatus from '@/store/PersistStatus'
import { setKaraokeLyricEnabled, KARAOKE_LYRIC_NOTE } from '@/helpers/lyricManager'
import { showToast } from '@/utils/utils'
import LxSourceManagerModal from '@/components/LxSourceManagerModal'

const PlaySettings = () => {
	const router = useRouter()
	const colors = useThemeColors()
	const { top, bottom } = useSafeAreaInsets()
	const [currentQuality, setCurrentQuality] = useCurrentQuality()
	const { preloadEnabled, preloadCount, preloadDelaySeconds, setPreloadEnabled, setPreloadCount, setPreloadDelaySeconds } = usePreloadSettingsStore()
	const { enabled: crossFallbackEnabled, setEnabled: setCrossFallbackEnabled } = useCrossPlatformFallbackStore()
	const [autoPlayOnLaunch, setAutoPlayOnLaunch] = useState(PersistStatus.get('music.autoPlayOnLaunch') ?? false)
	const [showStylizedRecommend, setShowStylizedRecommend] = useState(PersistStatus.get('music.showStylizedRecommend') === true ? true : PersistStatus.get('music.showStylizedRecommend') === 'true' ? true : false)
	const [builtinSourceEnabled, setBuiltinSourceEnabled] = useState(PersistStatus.get('music.builtinSourceEnabled') === 'true')
	const [showLxSourceModal, setShowLxSourceModal] = useState(false)
	const { enabled: autoSwitchEnabled, setEnabled: setAutoSwitchEnabled } = useAutoSourceSwitchStore()
	const { enabled: sourceSwitchToastEnabled, setEnabled: setSourceSwitchToastEnabled } = useSourceSwitchToastStore()
	const { dockBlurLevel, setDockBlurLevel } = useTabBarStyleStore()
	const [showQualityModal, setShowQualityModal] = useState(false)
	const karaokeEnabled = PersistStatus.useValue('lyric.karaokeEnabled', false) === true

	const QUALITY_OPTIONS = [
		{ key: '128k', label: '128k', desc: '标准音质' },
		{ key: '320k', label: '320k', desc: '高品质音质' },
		{ key: 'flac', label: 'FLAC', desc: '无损音质' },
		{ key: '24bit', label: '24bit', desc: 'Hi-Res 24bit' },
		{ key: 'hires', label: 'Hi-Res', desc: '高解析度音频' },
		{ key: 'master', label: 'Master', desc: '母带音质' },
	]

	const settingsData = [
		{ id: 'quality', title: '播放音质', type: 'value', value: currentQuality?.toUpperCase() || 'FLAC', icon: 'musical-notes' },
		{ id: 'preloadEnabled', title: '自动预加载下一首', type: 'switch', value: preloadEnabled, icon: 'refresh' },
		{ id: 'preloadCount', title: '预加载歌曲数量', type: 'value', value: preloadCount === 0 ? '关闭' : preloadCount + '首', icon: 'list' },
		{ id: 'preloadDelay', title: '开始预加载时间', type: 'value', value: preloadDelaySeconds + '秒后', icon: 'time' },
		// { id: 'crossFallback', title: '自动换音源', type: 'switch', value: crossFallbackEnabled, icon: 'swap-horizontal' },
		{ id: 'builtinSource', title: '内置兜底音源', type: 'switch', value: builtinSourceEnabled, icon: 'musical-note' },
		{ id: 'sourceSwitchToast', title: '换源提醒', type: 'switch', value: sourceSwitchToastEnabled, icon: 'notifications' },
		{ id: 'autoPlay', title: '启动时自动播放上次歌曲', type: 'switch', value: autoPlayOnLaunch, icon: 'play' },
		{ id: 'stylizedRecommend', title: '风格化推荐', type: 'switch', value: showStylizedRecommend, icon: 'color-palette' },
		{ id: 'karaokeLyric', title: '逐字歌词', type: 'switch', value: karaokeEnabled, icon: 'mic', note: KARAOKE_LYRIC_NOTE },
		{ id: 'lxSourceManager', title: 'LX音源管理', type: 'value', icon: 'cloud' },
		{ id: 'playerLayout', title: '播放器组件位置调整', type: 'value', value: '自定义', icon: 'move' },
		{ id: 'dockBlur', title: 'dock栏与迷你播放器模糊程度', type: 'value', value: DOCK_BLUR_LEVEL_LABELS[dockBlurLevel], icon: 'water' },
	]


	const showToastStyleSubMenu = () => {
		Alert.alert(
			'提示框样式',
			'选择标题文字大小',
			[
				{ text: '12号', onPress: () => { setToastTitleSize(12); showToastSubtitleMenu() } },
				{ text: '14号（默认）', onPress: () => { setToastTitleSize(14); showToastSubtitleMenu() } },
				{ text: '16号', onPress: () => { setToastTitleSize(16); showToastSubtitleMenu() } },
				{ text: '18号', onPress: () => { setToastTitleSize(18); showToastSubtitleMenu() } },
				{ text: '取消', style: 'cancel' },
			],
		)
	}
	const showToastSubtitleMenu = () => {
		Alert.alert(
			'提示框样式',
			'选择副标题文字大小',
			[
				{ text: '10号', onPress: () => { setToastSubtitleSize(10); showToastBgMenu() } },
				{ text: '12号（默认）', onPress: () => { setToastSubtitleSize(12); showToastBgMenu() } },
				{ text: '14号', onPress: () => { setToastSubtitleSize(14); showToastBgMenu() } },
				{ text: '取消', style: 'cancel' },
			],
		)
	}
	const showToastBgMenu = () => {
		Alert.alert(
			'提示框样式',
			'选择背景透明度',
			[
				{ text: '70%（更透明）', onPress: () => setToastBgOpacity(0.7) },
				{ text: '82%（默认）', onPress: () => setToastBgOpacity(0.82) },
				{ text: '90%（更不透明）', onPress: () => setToastBgOpacity(0.9) },
				{ text: '100%（完全不透明）', onPress: () => setToastBgOpacity(1.0) },
				{ text: '取消', style: 'cancel' },
			],
		)
	}

	const handleItemPress = (item: any) => {
		switch (item.id) {
			case 'quality':
				Alert.alert(
					'选择播放音质',
					'选择默认播放音质',
					QUALITY_OPTIONS.map(q => ({
						text: (currentQuality === q.key ? '✓ ' : '') + q.label + ' - ' + q.desc,
						onPress: () => setCurrentQuality(q.key),
					})).concat([{ text: '取消', style: 'cancel' as const }]),
				)
				break
			case 'preloadEnabled':
				setPreloadEnabled(!preloadEnabled)
				showToast(!preloadEnabled ? '已开启自动预加载' : '已关闭自动预加载', '', 'info')
				break
			case 'preloadCount':
				Alert.alert(
					'预加载歌曲数量',
					'选择播放时预加载后面几首歌',
					[
						{ text: '不预加载', onPress: () => setPreloadCount(0) },
						{ text: '1首', onPress: () => setPreloadCount(1) },
						{ text: '2首', onPress: () => setPreloadCount(2) },
						{ text: '3首', onPress: () => setPreloadCount(3) },
						{ text: '取消', style: 'cancel' },
					],
				)
				break
			case 'preloadDelay':
				Alert.alert(
					'开始预加载时间',
					'播放多少秒后开始预加载',
					[
						{ text: '3秒', onPress: () => setPreloadDelaySeconds(3) },
						{ text: '5秒', onPress: () => setPreloadDelaySeconds(5) },
						{ text: '10秒', onPress: () => setPreloadDelaySeconds(10) },
						{ text: '15秒', onPress: () => setPreloadDelaySeconds(15) },
						{ text: '取消', style: 'cancel' },
					],
				)
				break
			case 'crossFallback':
				setCrossFallbackEnabled(!crossFallbackEnabled)
				break
			case 'builtinSource':
				const nextBuiltin = !builtinSourceEnabled
				setBuiltinSourceEnabled(nextBuiltin)
				PersistStatus.set('music.builtinSourceEnabled', String(nextBuiltin))
				showToast(nextBuiltin ? '已开启内置兜底音源' : '已关闭内置兜底音源', '', 'info')
				break
			case 'autoPlay':
				const next = !autoPlayOnLaunch
				setAutoPlayOnLaunch(next)
				PersistStatus.set('music.autoPlayOnLaunch', next)
				showToast(next ? '已开启启动自动播放' : '已关闭启动自动播放', '', 'info')
				break
			case 'stylizedRecommend':
				const nextStylized = !showStylizedRecommend
				setShowStylizedRecommend(nextStylized)
				PersistStatus.set('music.showStylizedRecommend', nextStylized)
				showToast(nextStylized ? '已开启风格化推荐' : '已关闭风格化推荐', '', 'info')
				break
			case 'karaokeLyric':
				setKaraokeLyricEnabled(!karaokeEnabled)
				break
			case 'lxSourceManager':
				setShowLxSourceModal(true)
				break
			case 'dockBlur':
				Alert.alert(
					'dock栏与迷你播放器模糊程度',
					'调节悬浮胶囊 dock 栏与迷你播放器的背景模糊强度',
					[
						{ text: (dockBlurLevel === 'default' ? '✓ ' : '') + '默认', onPress: () => setDockBlurLevel('default') },
						{ text: (dockBlurLevel === 'off' ? '✓ ' : '') + '关闭模糊', onPress: () => setDockBlurLevel('off') },
						{ text: (dockBlurLevel === 'low' ? '✓ ' : '') + '低', onPress: () => setDockBlurLevel('low') },
						{ text: (dockBlurLevel === 'medium' ? '✓ ' : '') + '中', onPress: () => setDockBlurLevel('medium') },
						{ text: (dockBlurLevel === 'high' ? '✓ ' : '') + '高', onPress: () => setDockBlurLevel('high') },
						{ text: '取消', style: 'cancel' },
					],
				)
				break
			case 'playerLayout':
				Alert.alert('提示', '请在「我的」右上角新设置页中调整播放器布局')
				break
		}
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			{/* 头部 */}
			<View style={[styles.header, { paddingTop: top + 12 }]}>
				<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
					<SFSymbol systemName="chevron.left" size={24} color={colors.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: colors.text }]}>播放设置</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: bottom + 40 }}>
				{settingsData.map((item, index) => (
					<View key={item.id}>
						<TouchableOpacity
							style={styles.item}
							onPress={() => item.type !== 'switch' && handleItemPress(item)}
							disabled={item.type === 'switch'}
						>
							<View style={styles.itemLeft}>
								<View style={[styles.itemIconWrapper, { backgroundColor: colors.surfaceElevated }]}>
									<SFSymbol systemName={item.icon} size={20} color={colors.text} />
								</View>
								<Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text>
							</View>
							<View style={styles.itemRight}>
								{item.type === 'switch' ? (
									<Switch
										value={item.value}
										onValueChange={() => handleItemPress(item)}
										trackColor={{ false: '#767577', true: '#34c759' }}
									/>
								) : (
									<View style={styles.itemValueWrapper}>
										{item.value && <Text style={[styles.itemValue, { color: colors.textMuted }]}>{item.value}</Text>}
										<SFSymbol systemName="chevron.right" size={16} color="#C6C6C6" />
									</View>
								)}
							</View>
						</TouchableOpacity>
						{(item as any).note ? (
							<Text style={[styles.itemNote, { color: colors.textMuted }]}>{(item as any).note}</Text>
						) : null}
						{index !== settingsData.length - 1 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}
					</View>
				))}
			</ScrollView>

			{/* LX音源管理弹窗 */}
			<LxSourceManagerModal
				visible={showLxSourceModal}
				onClose={() => setShowLxSourceModal(false)}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		paddingBottom: 12,
	},
	backButton: {
		width: 40,
		height: 40,
		justifyContent: 'center',
		alignItems: 'center',
	},
	headerTitle: {
		fontSize: 22,
		fontWeight: '500',
	},
	scrollView: {
		flex: 1,
	},
	item: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 20,
		paddingVertical: 14,
	},
	itemLeft: {
		flexDirection: 'row',
		alignItems: 'center',
		flex: 1,
	},
	itemIconWrapper: {
		width: 32,
		height: 32,
		borderRadius: 8,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 12,
	},
	itemTitle: {
		fontSize: 16,
		fontWeight: '500',
	},
	itemNote: {
		fontSize: 12,
		lineHeight: 17,
		paddingLeft: 64,
		paddingRight: 20,
		marginTop: -6,
		marginBottom: 8,
	},
	itemRight: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	itemValueWrapper: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	itemValue: {
		fontSize: 14,
		marginRight: 4,
	},
	separator: {
		height: 0.5,
		marginLeft: 64,
	},
	modalContainer: {
		borderTopLeftRadius: 28,
		borderTopRightRadius: 28,
		overflow: 'hidden',
		marginHorizontal: 8,
		marginBottom: 8,
		borderRadius: 28,
	},
	modalContent: {
		paddingHorizontal: 20,
		paddingTop: 12,
	},
	modalHandle: {
		width: 40,
		height: 5,
		borderRadius: 3,
		backgroundColor: '#99999950',
		alignSelf: 'center',
		marginBottom: 12,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: '500',
		textAlign: 'center',
	},
	modalSubtitle: {
		fontSize: 14,
		textAlign: 'center',
		marginTop: 4,
	},
	settingRow: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 14,
		paddingHorizontal: 16,
		paddingVertical: 14,
	},
	settingRowTitle: {
		fontSize: 16,
		fontWeight: '500',
	},
})

export default PlaySettings
