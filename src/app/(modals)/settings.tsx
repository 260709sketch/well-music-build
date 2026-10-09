// 设置页 —— 对齐参考图视觉语言
// 结构：搜索框「搜索设置」+ 一整张圆角大卡；卡内为分组行（图标 + 组名 + 向下箭头），
// 点击组行在卡内展开该分组下的全部功能（箭头旋转 180°）；分组下的功能行中仍可嵌套展开行。
// 普通导航行：图标 + 标题 + 副标题/值 + 右向箭头
// 配色（参考图取色）：图标深红 #C92929（暗色提亮）+ 浅灰卡 #F5F5F5（浅色）/ 深灰卡（暗色）+ 页面白底
// 行规范：图标 18 / 34 宽（红）、标题 16、副标题 13、值 14、chevron 13、行高 54
import { useThemeColors, useThemeMode, useAppTheme } from '@/hooks/useAppTheme'
import SFSymbol from '@/components/SFSymbol'
import { usePlayerStyleStore } from '@/store/playerStyleStore'
import { useAMLLSettingsStore } from '@/store/amllSettingsStore'
import { usePreloadSettingsStore } from '@/store/preloadSettingsStore'
import { useHideBannerStore } from '@/store/hideBannerStore'
import { useSourceSwitchToastStore } from '@/store/sourceSwitchToastStore'
import { useTabBarStyleStore, DOCK_BLUR_LEVEL_LABELS } from '@/store/tabBarStyleStore'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import PersistStatus from '@/store/PersistStatus'
import { useSolidNavBar } from '@/hooks/useSolidNavBar'
import { useCurrentQuality, musicApiStore } from '@/helpers/trackPlayerIndex'
import { setKaraokeLyricEnabled, KARAOKE_LYRIC_NOTE } from '@/helpers/lyricManager'
import { showToast } from '@/utils/utils'
import { DownloadManagerModal } from '@/components/DownloadManagerModal'
import { CacheManagerScreen } from '@/components/CacheManagerScreen'
import { BackupManagerScreen } from '@/components/BackupManagerScreen'
import LogScreen from '@/components/LogScreen'
import SourceCenter from '@/app/(modals)/sourceCenter'
import { PlayerLayoutScreen } from '@/components/PlayerLayoutScreen'
import Constants from 'expo-constants'
import { useRouter , useNavigation } from 'expo-router'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
	Animated,
	LayoutAnimation,
	Modal,
	Pressable,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MenuView } from '@react-native-menu/menu'

const APP_VERSION = Constants?.expoConfig?.version || (Constants as any)?.manifest?.version || '2.1.19'

// 模块级展开状态缓存：主题切换会重挂载设置页，组件内 useState 会丢失，
// 这里用 title 为键缓存分组展开状态，重挂载后恢复，避免切主题时全部分组收起。
const settingsExpandStore: Record<string, boolean> = {}

// 红色主题（参考图取色：图标深红 #C92929，暗色模式提亮保可读性）
const RED = '#C92929'
const RED_DARK = '#FF453A'

const QUALITY_OPTIONS = [
	{ key: '128k', label: '128k' },
	{ key: '320k', label: '320k' },
	{ key: 'flac', label: 'FLAC' },
	{ key: '24bit', label: '24bit' },
	{ key: 'hires', label: 'Hi-Res' },
	{ key: 'master', label: 'Master' },
]

const useSettingsColors = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const red = isDark ? RED_DARK : RED
	// 对齐 Kumone / iOS 原生 grouped Form：卡片纯白（浅色）/ 深灰（暗色），页面浅灰分组背景
	const cardBg = isDark ? '#1c1c1e' : '#FFFFFF'
	const sepColor = isDark ? 'rgba(152,152,159,0.24)' : 'rgba(60,60,67,0.18)'
	const chevronColor = '#C7C7CC'
	const labelColor = isDark ? 'rgba(235,235,245,0.6)' : '#6C6B70'
	const green = '#34C759'
	return { colors, isDark, red, cardBg, sepColor, chevronColor, labelColor, green }
}

// 板块错落入场（同"我的页面"：淡入 + 轻微上移）
const Entrance = ({ delay = 0, children }: { delay?: number; children: React.ReactNode }) => {
	const opacity = useRef(new Animated.Value(0)).current
	const translateY = useRef(new Animated.Value(14)).current
	useEffect(() => {
		Animated.parallel([
			Animated.timing(opacity, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
			Animated.timing(translateY, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
		]).start()
	}, [])
	return (
		<Animated.View style={{ opacity, transform: [{ translateY }] }}>
			{children}
		</Animated.View>
	)
}

// ===== 分组卡片（每组一张圆角卡，组名为卡内头行；卡间留白较大）=====
const GroupCard = ({ children }: any) => {
	const { cardBg } = useSettingsColors()
	return (
		<View style={{ marginBottom: 18 }}>
			<View style={[styles.groupCard, { backgroundColor: cardBg }]}>{children}</View>
		</View>
	)
}

// ===== 行内可展开（大分组行带图标；分组内子行不传 icon，标题左对齐）=====
// 收起时只显示头行；展开时内容行紧跟头行出现，箭头旋转 180°；搜索命中时强制展开。
const ExpandableRow = ({ icon, title, subtitle, forceOpen = false, last = false, children }: any) => {
	const { colors, red, chevronColor, sepColor, cardBg } = useSettingsColors()
	const hasIcon = !!icon
	const cachedOpen = settingsExpandStore[title] ?? false
	const [expanded, setExpanded] = useState(cachedOpen)
	const anim = useRef(new Animated.Value(cachedOpen ? 1 : 0)).current
	const rotate = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] })

	useEffect(() => {
		if (forceOpen && !expanded) {
			settingsExpandStore[title] = true
			setExpanded(true)
			anim.setValue(1)
		}
	}, [forceOpen, expanded])

	const toggle = () => {
		const next = !expanded
		settingsExpandStore[title] = next
		LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
		setExpanded(next)
		Animated.timing(anim, { toValue: next ? 1 : 0, duration: 220, useNativeDriver: true }).start()
	}

	return (
		<View>
			<Pressable onPress={toggle} style={({ pressed }) => [styles.row, pressed && { opacity: 0.55 }]}>
				{hasIcon && (
					<View style={styles.rowIcon}>
						<SFSymbol systemName={icon} size={18} color={red} weight="regular" />
					</View>
				)}
				<View style={{ flex: 1 }}>
					<Text style={[styles.rowTitle, { marginLeft: hasIcon ? 10 : 0, color: colors.text }]} numberOfLines={1}>{title}</Text>
					{subtitle ? <Text style={[styles.rowSubtitle, { marginLeft: hasIcon ? 10 : 0, color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
				</View>
				<Animated.View style={{ transform: [{ rotate }] }}>
					<SFSymbol systemName="chevron.down" size={13} color={chevronColor} weight="regular" />
				</Animated.View>
			</Pressable>
			{expanded && (
				<View style={{ backgroundColor: cardBg }}>
					<View style={[styles.divider, { backgroundColor: sepColor, marginLeft: hasIcon ? 60 : 16 }]} />
					{children}
				</View>
			)}
			{!last && <View style={[styles.divider, { backgroundColor: sepColor, marginLeft: hasIcon ? 60 : 16 }]} />}
		</View>
	)
}

// ===== 行组件（子行默认无图标；大分组行才传 icon）=====
const Row = ({ icon, title, subtitle, value, onPress, trailing, last = false }: any) => {
	const { colors, red, sepColor, chevronColor } = useSettingsColors()
	const hasIcon = !!icon
	return (
		<>
			<Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.55 }]}>
				{hasIcon && (
					<View style={styles.rowIcon}>
						<SFSymbol systemName={icon} size={18} color={red} weight="regular" />
					</View>
				)}
				<View style={{ flex: 1 }}>
					<Text style={[styles.rowTitle, { marginLeft: hasIcon ? 10 : 0, color: colors.text }]} numberOfLines={1}>{title}</Text>
					{subtitle ? <Text style={[styles.rowSubtitle, { marginLeft: hasIcon ? 10 : 0, color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
				</View>
				{value ? <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
				{trailing ?? (
					<SFSymbol systemName="chevron.right" size={13} color={chevronColor} weight="regular" style={{ marginLeft: 6 }} />
				)}
			</Pressable>
			{!last && <View style={[styles.divider, { backgroundColor: sepColor, marginLeft: hasIcon ? 60 : 16 }]} />}
		</>
	)
}

// 菜单选择行（右侧 chevron.down，点击弹出菜单；无图标）
const MenuRow = ({ icon, title, subtitle, value, actions, last = false }: any) => {
	const { colors, sepColor, chevronColor } = useSettingsColors()
	return (
		<>
			<MenuView
				actions={actions}
				onPressAction={({ nativeEvent }: any) => {
					const action = actions.find((a: any) => a.id === nativeEvent.event)
					if (action && action.onPress) action.onPress()
				}}
			>
				<View style={styles.row}>
					<View style={{ flex: 1 }}>
						<Text style={[styles.rowTitle, { marginLeft: 0, color: colors.text }]} numberOfLines={1}>{title}</Text>
						{subtitle ? <Text style={[styles.rowSubtitle, { marginLeft: 0, color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
					</View>
					{value ? <Text style={[styles.rowValue, { color: colors.textMuted }]} numberOfLines={1}>{value}</Text> : null}
					<SFSymbol systemName="chevron.down" size={13} color={chevronColor} weight="regular" style={{ marginLeft: 6 }} />
				</View>
			</MenuView>
			{!last && <View style={[styles.divider, { backgroundColor: sepColor, marginLeft: 16 }]} />}
		</>
	)
}

// 开关行（无图标，绿色 iOS 原生开关）
const SwitchRow = ({ title, subtitle, value, onSwitch, last = false }: any) => {
	const { colors, isDark, green, sepColor } = useSettingsColors()
	return (
		<>
			<View style={styles.row}>
				<View style={{ flex: 1 }}>
					<Text style={[styles.rowTitle, { marginLeft: 0, color: colors.text }]} numberOfLines={1}>{title}</Text>
					{subtitle ? <Text style={[styles.rowSubtitle, { marginLeft: 0, color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text> : null}
				</View>
				<Switch
					value={value}
					trackColor={{ false: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(120,120,128,0.3)', true: green }}
					thumbColor="#ffffff"
					ios_backgroundColor={isDark ? 'rgba(255,255,255,0.16)' : 'rgba(120,120,128,0.3)'}
					onValueChange={onSwitch}
				/>
			</View>
			{!last && <View style={[styles.divider, { backgroundColor: sepColor, marginLeft: 16 }]} />}
		</>
	)
}

// segmented 选择器（iOS 系统风格）
const Segmented = ({ options, value, onChange }: any) => {
	const { colors, isDark } = useSettingsColors()
	return (
		<View style={[styles.segmented, { backgroundColor: isDark ? 'rgba(120,120,128,0.28)' : 'rgba(120,120,128,0.16)' }]}>
			{options.map((opt: any) => {
				const selected = value === opt.value
				return (
					<TouchableOpacity
						key={opt.value}
						activeOpacity={0.7}
						onPress={() => onChange(opt.value)}
						style={[styles.segment, selected && { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : '#ffffff', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }]}
					>
						<Text style={[styles.segmentText, { color: selected ? colors.text : colors.textMuted, fontWeight: selected ? '600' : '400' }]}>{opt.label}</Text>
					</TouchableOpacity>
				)
			})}
		</View>
	)
}

// 音质胶囊（选中红色 14% 填充 + 42% 描边 + checkmark）
const QualityCapsules = ({ value, onChange }: any) => {
	const { colors, isDark, red } = useSettingsColors()
	return (
		<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
			{QUALITY_OPTIONS.map((q: any) => {
				const selected = value === q.key
				return (
					<TouchableOpacity
						key={q.key}
						activeOpacity={0.7}
						onPress={() => onChange(q.key)}
						style={[
							styles.capsule,
							{
								backgroundColor: selected ? `${red}24` : (isDark ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.045)'),
								borderColor: selected ? `${red}6B` : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
							},
						]}
					>
						<Text style={[styles.capsuleText, { color: selected ? red : colors.text, fontWeight: selected ? '600' : '500' }]}>{q.label}</Text>
						{selected && <SFSymbol systemName="checkmark" size={9} color={red} weight="bold" style={{ marginLeft: 5, marginTop: 1 }} />}
					</TouchableOpacity>
				)
			})}
		</ScrollView>
	)
}

const SettingsPage = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { themeMode, setThemeMode } = useThemeMode()
	const { solidNavBarEnabled, setSolidNavBarEnabled } = useSolidNavBar()
	const router = useRouter()
	const insets = useSafeAreaInsets()

	// 红色着色：深色用亮红保可读性
	const red = isDark ? RED_DARK : RED

	const [currentQuality, setCurrentQuality] = useCurrentQuality()
	const { preloadEnabled, preloadCount, preloadDelaySeconds, setPreloadEnabled, setPreloadCount, setPreloadDelaySeconds } = usePreloadSettingsStore()
	const { enabled: sourceSwitchToastEnabled, setEnabled: setSourceSwitchToastEnabled } = useSourceSwitchToastStore()
	const [autoPlayOnLaunch, setAutoPlayOnLaunch] = useState(PersistStatus.get('music.autoPlayOnLaunch' as any) === true)
	const [bluetoothAutoPause, setBluetoothAutoPause] = useState((PersistStatus.get('player.bluetoothAutoPause' as any) as any) === true)
	const [fadeEnabled, setFadeEnabled] = useState((PersistStatus.get('player.fadeEnabled' as any) as any) === true)
	const [fadeDuration, setFadeDuration] = useState<number>(() => {
		const n = Number(PersistStatus.get('player.fadeDuration' as any))
		return isFinite(n) && n > 0 ? n : 0.35
	})
	const [karaokeEnabled, setKaraokeEnabled] = useState(PersistStatus.get('lyric.karaokeEnabled') === true)
	const [builtinSourceEnabled, setBuiltinSourceEnabled] = useState(PersistStatus.get('music.builtinSourceEnabled' as any) === 'true')
	const [builtinSourceToastEnabled, setBuiltinSourceToastEnabled] = useState(PersistStatus.get('music.builtinSourceToastEnabled' as any) !== 'false')

	const [showSearchHistory, setShowSearchHistory] = useState(PersistStatus.get('search.showHistory' as any) !== false)
	const [stylizedRecommend, setStylizedRecommend] = useState(PersistStatus.get('music.showStylizedRecommend' as any) === true)
	const [kbMiniOffset, setKbMiniOffset] = useState(parseInt(PersistStatus.get('app.keyboardMiniPlayerOffset' as any) || '0', 10))

	const { playerStyle, setPlayerStyle } = usePlayerStyleStore()
	const { tabBarStyle, setTabBarStyle, dockBlurLevel, setDockBlurLevel } = useTabBarStyleStore()
	const { hideNeteaseBanner, setHideNeteaseBanner } = useHideBannerStore()
	const { backgroundMode, setBackgroundMode, dynamicCover, setDynamicCover, lyricPerf, setLyricPerf, lyricFontWeight, setLyricFontWeight } = useAMLLSettingsStore()
	const backgroundLabel = () => backgroundMode === 'static' ? '静态背景' : backgroundMode === 'appleMusicDynamic' ? 'Apple Music 动态' : backgroundMode === 'appleMusicStatic' ? 'Apple Music 静态' : '流动背景'
	const [oldArtistPage, setOldArtistPage] = useState(PersistStatus.get('music.oldArtistPage' as any) === true)
	const [songHighlightAnimation, setSongHighlightAnimation] = useState(PersistStatus.get('music.songHighlightAnimation' as any) === true)
	const [songFloatAnimation, setSongFloatAnimation] = useState((PersistStatus.get('music.songFloatAnimation' as any) as any) !== false)
	const [homeFloatAnimation, setHomeFloatAnimation] = useState((PersistStatus.get('music.homeFloatAnimation' as any) as any) !== false)

	const [recentSyncNetease, setRecentSyncNetease] = useState(PersistStatus.get('music.recentSyncNetease' as any) !== false)
	const [scrobbleToNetease, setScrobbleToNetease] = useState(PersistStatus.get('music.scrobbleToNetease' as any) !== false)
	const [miniPlayerLyricEnabled, setMiniPlayerLyricEnabled] = useState(PersistStatus.get('music.miniPlayerLyricEnabled' as any) !== false)
	const [qualityZh, setQualityZh] = useState(PersistStatus.get('music.qualityZh' as any) === true)
	const [preciseFLAC, setPreciseFLAC] = useState(PersistStatus.get('music.preciseFLAC' as any) !== false)
	const [preciseFLACCache, setPreciseFLACCache] = useState(PersistStatus.get('music.preciseFLACCache' as any) === true)
	const [preciseFLACCacheLimit, setPreciseFLACCacheLimit] = useState<number>(Number(PersistStatus.get('music.preciseFLACCacheLimit' as any)) || 1024)

	const { isLoggedIn, nickname } = useDailyRecommendStore()
	const musicApis = musicApiStore.useValue()
	const [showDownloadManager, setShowDownloadManager] = useState(false)
	const [showCacheManager, setShowCacheManager] = useState(false)
	const [showBackupManager, setShowBackupManager] = useState(false)
	const [showLogScreen, setShowLogScreen] = useState(false)
	const [showSourceCenter, setShowSourceCenter] = useState(false)
	const [showPlayerLayout, setShowPlayerLayout] = useState(false)

	// 搜索设置
	const [searchText, setSearchText] = useState('')

	const themeLabel = themeMode === 'light' ? '浅色' : themeMode === 'dark' ? '深色' : '跟随系统'
	const qualityLabel = QUALITY_OPTIONS.find(q => q.key === currentQuality)?.label || currentQuality
	const navigation = useNavigation()
	const pageBg = isDark ? '#000000' : '#F2F2F7' // iOS 原生 grouped 分隔背景：浅色浅灰，深色纯黑

	// 导航栏背景色与页面一致
	useLayoutEffect(() => {
		navigation.setOptions({
			headerStyle: { backgroundColor: pageBg },
			headerTransparent: false,
			headerShadowVisible: false,
		})
	}, [navigation, pageBg])
	const sepColor = isDark ? 'rgba(152,152,159,0.15)' : 'rgba(108,108,112,0.15)'

	// ===== 搜索过滤：按关键词匹配各行标题/副标题，整组不匹配则隐藏；匹配的组强制展开 =====
	const kw = searchText.trim().toLowerCase()
	const match = (...texts: (string | undefined)[]) =>
		!kw || texts.some((t) => t && t.toLowerCase().includes(kw))

	const groups = [
		{
			key: '账号与平台',
			icon: 'person.crop.circle',
			subtitle: isLoggedIn ? (nickname || '已登录') : '登录网易云音乐账号',
			matches: () =>
				match('账号与平台', '账号登录', isLoggedIn ? nickname || '已登录' : '未登录', '平台显示', '最近播放自动同步', '听歌排行同步'),
			children: () => (
				<>
					<Row
						title="账号登录"
						subtitle={isLoggedIn ? (nickname || '已登录') : '登录网易云音乐账号'}
						value={isLoggedIn ? '' : '未登录'}
						onPress={() => router.push('/(modals)/neteaseLogin')}
					/>
					<ExpandableRow title="平台显示" subtitle={recentSyncNetease && scrobbleToNetease ? '自动同步已开启' : '同步设置'} forceOpen={!!kw} last>
						<SwitchRow title="最近播放自动同步" subtitle="将本地播放记录同步至网易云" value={recentSyncNetease} onSwitch={(v: boolean) => { setRecentSyncNetease(v); PersistStatus.set('music.recentSyncNetease' as any, v) }} />
						<SwitchRow title="听歌排行同步" subtitle="将播放记录同步至听歌排行" value={scrobbleToNetease} onSwitch={(v: boolean) => { setScrobbleToNetease(v); PersistStatus.set('music.scrobbleToNetease' as any, v) }} last />
					</ExpandableRow>
				</>
			),
		},
		{
			key: '外观与界面',
			icon: 'paintpalette.fill',
			subtitle: `主题 · ${themeLabel}`,
			matches: () =>
				match(
					'外观与界面', '主题模式', themeLabel, '跟随系统', '浅色', '深色',
					'播放器样式', '播放页样式', '自定义播放器', '播放页背景', '静态背景', '流动背景', '动态封面',
					'背景与状态栏', '逐字歌词', '底部状态栏样式', '悬浮胶囊', '底部栏毛玻璃调节', '迷你播放器', '键盘弹出时迷你播放器位置', '迷你播放器歌词',
					'列表与发现', '隐藏网易Banner', '旧版歌手主页', '歌曲点击展开动画', '歌曲列表上浮动画',
					'搜索历史', '风格化推荐',
				),
			children: () => (
				<>
					<ExpandableRow title="主题模式" subtitle={themeLabel} forceOpen={!!kw}>
						<View style={styles.controlWrap}>
							<Segmented
								options={[
									{ value: 'system', label: '跟随系统' },
									{ value: 'light', label: '浅色' },
									{ value: 'dark', label: '深色' },
								]}
								value={themeMode}
								onChange={(v: any) => setThemeMode(v)}
							/>
						</View>
					</ExpandableRow>
					<SwitchRow title="纯色导航栏" subtitle="开启后所有页面导航栏变白/黑不透明，关闭为毛玻璃透明" value={solidNavBarEnabled} onSwitch={(v: boolean) => setSolidNavBarEnabled(v)} />
					<ExpandableRow title="播放器样式" subtitle={playerStyle === 'apple-music-v2' ? 'Apple Music V2' : 'AM'} forceOpen={!!kw}>
						<MenuRow
							title="播放页样式"
							value={playerStyle === 'apple-music-v2' ? 'Apple Music V2' : 'AM'}
							actions={[
								{ id: 'wellmusic-am', title: 'AM', state: playerStyle === 'wellmusic-am' ? 'on' : 'off', onPress: () => setPlayerStyle('wellmusic-am') },
								{ id: 'apple-music-v2', title: 'Apple Music V2', state: playerStyle === 'apple-music-v2' ? 'on' : 'off', onPress: () => setPlayerStyle('apple-music-v2') },
							]}
						/>
						<Row title="自定义播放器" value="自定义" onPress={() => setShowPlayerLayout(true)} last />
					</ExpandableRow>
					<ExpandableRow title="背景与状态栏" subtitle={backgroundLabel()} forceOpen={!!kw}>
						<MenuRow
							title="播放器背景"
							value={backgroundLabel()}
							actions={[
								{ id: 'flowing', title: '流动背景', state: backgroundMode === 'flowing' ? 'on' : 'off', onPress: () => setBackgroundMode('flowing') },
								{ id: 'static', title: '静态背景', state: backgroundMode === 'static' ? 'on' : 'off', onPress: () => setBackgroundMode('static') },
								{ id: 'appleMusicDynamic', title: 'Apple Music 动态', state: backgroundMode === 'appleMusicDynamic' ? 'on' : 'off', onPress: () => setBackgroundMode('appleMusicDynamic') },
								{ id: 'appleMusicStatic', title: 'Apple Music 静态', state: backgroundMode === 'appleMusicStatic' ? 'on' : 'off', onPress: () => setBackgroundMode('appleMusicStatic') },
							]}
						/>
						<View style={styles.noteRow}>
							<Text style={styles.noteText}>以上均为不同的背景预设效果，可随时切换</Text>
						</View>
						<SwitchRow title="动态封面" subtitle="网易云歌曲有动态封面时自动播放" value={dynamicCover} onSwitch={(v: boolean) => setDynamicCover(v)} />
						<SwitchRow title="逐字歌词" subtitle={KARAOKE_LYRIC_NOTE} value={karaokeEnabled} onSwitch={(v: boolean) => { setKaraokeEnabled(v); setKaraokeLyricEnabled(v) }} />
						<ExpandableRow title="歌词性能优化" subtitle={lyricPerf.spring && lyricPerf.blur && lyricPerf.scale ? '特效全开（默认）' : '已做流畅度优化'} forceOpen={!!kw}>
							<View style={styles.noteRow}>
								<Text style={styles.noteText}>换句卡顿主要来自弹性动画与非活跃行特效，按需关闭可更流畅</Text>
							</View>
							<MenuRow
								title="歌词字重"
								value={lyricFontWeight >= 700 ? '加粗' : lyricFontWeight >= 600 ? '中等' : '细体'}
								actions={[
									{ id: 'w400', title: '细体', state: lyricFontWeight === 400 ? 'on' : 'off', onPress: () => setLyricFontWeight(400) },
									{ id: 'w600', title: '中等（默认）', state: lyricFontWeight === 600 ? 'on' : 'off', onPress: () => setLyricFontWeight(600) },
									{ id: 'w700', title: '加粗', state: lyricFontWeight === 700 ? 'on' : 'off', onPress: () => setLyricFontWeight(700) },
								]}
							/>
							<MenuRow
								title="渲染帧率"
								value={lyricPerf.fps === 0 ? '跟随屏幕' : `${lyricPerf.fps} 帧`}
								actions={[
									{ id: 'f30', title: '30 帧（更省电）', state: lyricPerf.fps === 30 ? 'on' : 'off', onPress: () => setLyricPerf({ fps: 30 }) },
									{ id: 'f60', title: '60 帧', state: lyricPerf.fps === 60 ? 'on' : 'off', onPress: () => setLyricPerf({ fps: 60 }) },
									{ id: 'f80', title: '80 帧（默认）', state: lyricPerf.fps === 80 ? 'on' : 'off', onPress: () => setLyricPerf({ fps: 80 }) },
									{ id: 'fauto', title: '跟随屏幕', state: lyricPerf.fps === 0 ? 'on' : 'off', onPress: () => setLyricPerf({ fps: 0 }) },
								]}
							/>
							<SwitchRow title="弹性滚动动画" subtitle="换句时的弹性缓动，重点耗性能" value={lyricPerf.spring} onSwitch={(v: boolean) => setLyricPerf({ spring: v })} />
							<SwitchRow title="非活跃行模糊" subtitle="未唱行的模糊效果，最耗性能" value={lyricPerf.blur} onSwitch={(v: boolean) => setLyricPerf({ blur: v })} />
							<SwitchRow title="非活跃行缩放" subtitle="未唱行的缩放动画" value={lyricPerf.scale} onSwitch={(v: boolean) => setLyricPerf({ scale: v })} />
							<SwitchRow title="隐藏已播放行" subtitle="唱过的行直接隐藏，只留当前与未唱行" value={lyricPerf.hidePassed} onSwitch={(v: boolean) => setLyricPerf({ hidePassed: v })} last />
						</ExpandableRow>
						<MenuRow
							title="底部状态栏样式"
							value={tabBarStyle === 'floating-pill' ? '悬浮胶囊' : '默认'}
							actions={[
								{ id: 'auto', title: '默认', state: tabBarStyle === 'auto' ? 'on' : 'off', onPress: () => setTabBarStyle('auto') },
								{ id: 'floating-pill', title: '悬浮胶囊底部栏', state: tabBarStyle === 'floating-pill' ? 'on' : 'off', onPress: () => setTabBarStyle('floating-pill') },
							]}
						/>
						<MenuRow
								title="底部栏毛玻璃调节"
								value={DOCK_BLUR_LEVEL_LABELS[dockBlurLevel]}
								actions={['default', 'off', 'low', 'medium', 'high'].map(l => ({ id: l, title: DOCK_BLUR_LEVEL_LABELS[l as keyof typeof DOCK_BLUR_LEVEL_LABELS], state: dockBlurLevel === l ? 'on' : 'off', onPress: () => setDockBlurLevel(l as any) }))}
							/>
							</ExpandableRow>
					<ExpandableRow title="迷你播放器" subtitle="位置与歌词" forceOpen={!!kw}>
						<View style={styles.row}>
							<View style={{ flex: 1 }}>
								<Text style={[styles.rowTitle, { marginLeft: 0, color: colors.text }]} numberOfLines={2}>键盘弹出时迷你播放器位置</Text>
							</View>
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								<TouchableOpacity style={[styles.kbBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]} onPress={() => { const v = Math.max(-500, kbMiniOffset - 10); setKbMiniOffset(v); PersistStatus.set('app.keyboardMiniPlayerOffset' as any, String(v)) }}>
									<Text style={[styles.kbBtnText, { color: red }]}>−</Text>
								</TouchableOpacity>
								<Text style={[styles.kbValue, { color: colors.text, borderColor: sepColor }]}>{kbMiniOffset > 0 ? `+${kbMiniOffset}` : kbMiniOffset}</Text>
								<TouchableOpacity style={[styles.kbBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]} onPress={() => { const v = Math.min(200, kbMiniOffset + 10); setKbMiniOffset(v); PersistStatus.set('app.keyboardMiniPlayerOffset' as any, String(v)) }}>
									<Text style={[styles.kbBtnText, { color: red }]}>+</Text>
								</TouchableOpacity>
							</View>
						</View>
						<View style={[styles.divider, { backgroundColor: sepColor, marginLeft: 16 }]} />
						<SwitchRow title="迷你播放器歌词" subtitle="开启后迷你播放器第二行显示当前歌词" value={miniPlayerLyricEnabled} onSwitch={(v: boolean) => { setMiniPlayerLyricEnabled(v); PersistStatus.set('music.miniPlayerLyricEnabled' as any, v) }} last />
					</ExpandableRow>
					<ExpandableRow title="列表与发现" subtitle="列表动画与推荐显示" forceOpen={!!kw} last>
						<SwitchRow title="隐藏网易Banner" value={hideNeteaseBanner} onSwitch={(v: boolean) => { setHideNeteaseBanner(v); showToast(v ? '已隐藏网易Banner' : '已显示网易Banner', '', 'info') }} />
						<SwitchRow title="旧版歌手主页" value={oldArtistPage} onSwitch={(v: boolean) => { setOldArtistPage(v); PersistStatus.set('music.oldArtistPage' as any, v) }} />
						<SwitchRow title="歌曲点击展开动画" value={songHighlightAnimation} onSwitch={(v: boolean) => { setSongHighlightAnimation(v); PersistStatus.set('music.songHighlightAnimation' as any, v) }} />
						<SwitchRow title="歌曲列表上浮动画" subtitle="进入歌单页面时，歌曲行从底部上浮入场" value={songFloatAnimation} onSwitch={(v: boolean) => { setSongFloatAnimation(v); PersistStatus.set('music.songFloatAnimation' as any, v) }} />
                                            <SwitchRow title="发现页上浮动画" subtitle="进入发现页时，页面内容从底部上浮入场" value={homeFloatAnimation} onSwitch={(v: boolean) => { setHomeFloatAnimation(v); PersistStatus.set('music.homeFloatAnimation' as any, v) }} />
						<SwitchRow title="搜索历史" subtitle="关闭后搜索页不展示历史记录和热搜榜" value={showSearchHistory} onSwitch={(v: boolean) => { setShowSearchHistory(v); PersistStatus.set('search.showHistory' as any, v) }} />
						<SwitchRow title="风格化推荐" subtitle="发现页展示风格化推荐歌单" value={stylizedRecommend} onSwitch={(v: boolean) => { setStylizedRecommend(v); PersistStatus.set('music.showStylizedRecommend' as any, v) }} last />
						</ExpandableRow>
					</>
				),
			},
		{
			key: '播放与音效',
			icon: 'waveform',
			subtitle: `音质 · ${qualityLabel}`,
			matches: () =>
				match(
					'播放与音效', '音源与音质', qualityLabel, '128k', '320k', 'FLAC', '24bit', 'Hi-Res', 'Master',
					'自定义音源', '音源状态', '播放设置', '预加载', '预加载歌曲数量', '开始预加载时间',
					'内置兜底音源', '内置音源切换提示', '换源提醒', '启动时自动播放上次歌曲', '音质中文显示', '标准', '极高', '无损',
					'断开蓝牙自动暂停', '播放暂停淡入淡出', '蓝牙', '淡入淡出',
				),
			children: () => (
				<>
					<ExpandableRow title="音源与音质" subtitle={qualityLabel} forceOpen={!!kw}>
						<View style={styles.controlWrap}>
							<QualityCapsules value={currentQuality} onChange={(v: unknown) => setCurrentQuality(v as any)} />
						</View>
						<SwitchRow title="音质中文显示" subtitle="打开显示标准/极高/无损，关闭显示英文" value={qualityZh} onSwitch={(v: boolean) => { setQualityZh(v); PersistStatus.set('music.qualityZh' as any, v) }} />
						<SwitchRow title="高音质歌词同步" subtitle="播放无损及以上音质时后台下载到本机转PCM，拖动进度条和歌词同步更精准；关闭则直接网络播放，seek可能偏几秒" value={preciseFLAC} onSwitch={(v: boolean) => { setPreciseFLAC(v); PersistStatus.set('music.preciseFLAC' as any, v) }} />
						{preciseFLAC && (
							<>
								<SwitchRow title="精准同步下载" subtitle="开启后下载的高音质歌曲不自动删除，下次播放直接用本地文件，无需重复下载；超出存储限制自动清理最久未播放的歌曲" value={preciseFLACCache} onSwitch={(v: boolean) => { setPreciseFLACCache(v); PersistStatus.set('music.preciseFLACCache' as any, v) }} />
								{preciseFLACCache && (
									<MenuRow
										title="精准同步存储上限"
										value={preciseFLACCacheLimit >= 1024 ? `${preciseFLACCacheLimit / 1024}GB` : `${preciseFLACCacheLimit}MB`}
										actions={[256, 512, 1024, 2048, 5120].map(mb => ({
											id: String(mb),
											title: mb >= 1024 ? `${mb / 1024}GB` : `${mb}MB`,
											state: preciseFLACCacheLimit === mb ? 'on' : 'off',
											onPress: () => { setPreciseFLACCacheLimit(mb); PersistStatus.set('music.preciseFLACCacheLimit' as any, mb) }
										}))}
										last
									/>
								)}
							</>
						)}
					</ExpandableRow>
					<Row title="自定义音源" value={`${Array.isArray(musicApis) ? musicApis.length : 0} 个`} onPress={() => setShowSourceCenter(true)} />
					<Row title="音源状态" subtitle="查看请求日志" onPress={() => router.push('/(modals)/sourceStatus')} />
					<ExpandableRow title="播放设置" forceOpen={!!kw} last>
						<SwitchRow title="预加载下一首" value={preloadEnabled} onSwitch={(v: boolean) => setPreloadEnabled(v)} />
						{preloadEnabled && (
							<MenuRow
								title="预加载歌曲数量"
								value={preloadCount === 0 ? '关闭' : `${preloadCount}首`}
								actions={[0, 1, 2, 3].map(n => ({ id: String(n), title: n === 0 ? '不预加载' : `${n}首`, state: preloadCount === n ? 'on' : 'off', onPress: () => setPreloadCount(n as any) }))}
							/>
						)}
						{preloadEnabled && (
							<MenuRow
								title="开始预加载时间"
								value={`${preloadDelaySeconds}秒后`}
								actions={[3, 5, 10, 15].map(s => ({ id: String(s), title: `${s}秒`, state: preloadDelaySeconds === s ? 'on' : 'off', onPress: () => setPreloadDelaySeconds(s) }))}
							/>
						)}
						<SwitchRow title="内置兜底音源" subtitle="所有音源失败时自动尝试Pyncmd/酷我/酷狗" value={builtinSourceEnabled} onSwitch={(v: boolean) => { setBuiltinSourceEnabled(v); PersistStatus.set('music.builtinSourceEnabled' as any, String(v)); showToast(v ? '已开启内置兜底音源' : '已关闭内置兜底音源', '', 'info') }} />
						{builtinSourceEnabled && (
							<SwitchRow title="内置音源切换提示" value={builtinSourceToastEnabled} onSwitch={(v: boolean) => { setBuiltinSourceToastEnabled(v); PersistStatus.set('music.builtinSourceToastEnabled' as any, String(v)); showToast(v ? '已开启内置音源提示' : '已关闭内置音源提示', '', 'info') }} />
						)}
						<SwitchRow title="换源提醒" subtitle="智能换源或音质降级时显示提示" value={sourceSwitchToastEnabled} onSwitch={(v: boolean) => setSourceSwitchToastEnabled(v)} />
							<SwitchRow title="断开蓝牙自动暂停" subtitle="断开蓝牙耳机或拔出耳机时自动暂停播放" value={bluetoothAutoPause} onSwitch={(v: boolean) => { setBluetoothAutoPause(v); PersistStatus.set('player.bluetoothAutoPause' as any, v) }} />
							<SwitchRow title="播放暂停淡入淡出" subtitle="播放和暂停时音量平滑过渡，避免突然变化" value={fadeEnabled} onSwitch={(v: boolean) => { setFadeEnabled(v); PersistStatus.set('player.fadeEnabled' as any, v) }} />
							{fadeEnabled && (
								<View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
									<Text style={[styles.rowTitle, { fontSize: 15, fontWeight: '600', marginLeft: 0, color: colors.text }]}>淡入淡出时长</Text>
									<Text style={[styles.rowSubtitle, { marginLeft: 0, color: colors.textMuted }]}>调整播放/暂停音量渐变的快慢</Text>
									<Segmented
										options={[{ label: '快速', value: 0.2 }, { label: '标准', value: 0.35 }, { label: '缓慢', value: 0.6 }]}
										value={fadeDuration}
										onChange={(v: number) => { setFadeDuration(v); PersistStatus.set('player.fadeDuration' as any, v) }}
									/>
								</View>
							)}
							<SwitchRow title="启动时自动播放上次歌曲" subtitle="打开软件后自动恢复上次未播放完的歌曲" value={autoPlayOnLaunch} onSwitch={(v: boolean) => { setAutoPlayOnLaunch(v); PersistStatus.set('music.autoPlayOnLaunch' as any, v) }} last />
						</ExpandableRow>
					</>
				),
			},
		{
			key: '数据管理',
			icon: 'internaldrive',
			subtitle: '缓存与下载',
			matches: () => match('数据管理', '缓存管理', '下载歌曲管理'),
			children: () => (
				<>
					<Row title="缓存管理" subtitle="查看与清理图片/歌曲缓存" onPress={() => setShowCacheManager(true)} />
					<Row title="下载歌曲管理" subtitle="查看已下载歌曲" onPress={() => setShowDownloadManager(true)} last />
				</>
			),
		},
		{
			key: '备份与恢复',
			icon: 'externaldrive.badge.checkmark',
			subtitle: '备份管理',
			matches: () => match('备份与恢复', '备份管理', '导出', '导入'),
			children: () => (
				<>
					<Row title="备份管理" subtitle="查看与恢复已保存的配置" onPress={() => setShowBackupManager(true)} last />
				</>
			),
		},
		{
			key: '日志',
			icon: 'doc.text.magnifyingglass',
			subtitle: '运行日志',
			matches: () => match('日志', '查看日志'),
			children: () => (
				<>
					<Row title="查看日志" subtitle="查看运行日志与闪退记录" onPress={() => setShowLogScreen(true)} last />
				</>
			),
		},
	]

	return (
		<View style={{ flex: 1, backgroundColor: pageBg }}>
			<View style={{ flex: 1 }} >
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: insets.bottom + 40 }}
			>
				<View style={styles.pageContent}>
				{/* ===== 搜索框（iOS 原生搜索框样式）===== */}
				<Entrance delay={0}>
					<View style={[styles.searchWrap, { backgroundColor: isDark ? 'rgba(120,120,128,0.24)' : 'rgba(120,120,128,0.12)', marginBottom: 12 }]}>
						<SFSymbol systemName="magnifyingglass" size={17} color={isDark ? 'rgba(152,152,159,0.7)' : 'rgba(108,108,112,0.7)'} weight="medium" />
						<TextInput
							style={[styles.searchInput, { color: colors.text }]}
							placeholder="搜索设置"
							placeholderTextColor={isDark ? 'rgba(152,152,159,0.6)' : 'rgba(108,108,112,0.6)'}
							value={searchText}
							onChangeText={setSearchText}
							clearButtonMode="while-editing"
						/>
					</View>
				</Entrance>

				{/* ===== 每个大分组独立成卡（iOS 原生 grouped 分 Section，灰标头在卡外 + 圆角卡） ===== */}
				<Entrance delay={40}>
					{groups.map((g) => {
						if (!g.matches()) return null
						return (
							<GroupCard key={g.key}>
								<ExpandableRow icon={g.icon} title={g.key} subtitle={g.subtitle} forceOpen={!!kw} last>
									{g.children()}
								</ExpandableRow>
							</GroupCard>
						)
					})}
				</Entrance>

				{/* ===== 页脚 ===== */}
				<Entrance delay={360}>
					<View style={styles.footer}>
						<Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(134,134,134,0.7)' }]}>WellMusic · 仅供学习交流</Text>
						<Text style={[styles.footerText, { color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(134,134,134,0.7)' }]}>接入网易云音乐等公开接口 · v{APP_VERSION}</Text>
					</View>
				</Entrance>
				</View>
			</ScrollView>
			</View>

			<DownloadManagerModal visible={showDownloadManager} onClose={() => setShowDownloadManager(false)} />
			<Modal visible={showCacheManager} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCacheManager(false)}><CacheManagerScreen onClose={() => setShowCacheManager(false)} /></Modal>
			<Modal visible={showBackupManager} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBackupManager(false)}><BackupManagerScreen onClose={() => setShowBackupManager(false)} /></Modal>
			<Modal visible={showLogScreen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowLogScreen(false)}><LogScreen onClose={() => setShowLogScreen(false)} /></Modal>
			<Modal visible={showSourceCenter} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSourceCenter(false)}><SourceCenter onClose={() => setShowSourceCenter(false)} /></Modal>
			<Modal visible={showPlayerLayout} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPlayerLayout(false)}><PlayerLayoutScreen onClose={() => setShowPlayerLayout(false)} /></Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	// iOS 原生 grouped：内容居中，iPad/宽屏最大宽 700
	pageContent: {
		width: '100%',
		maxWidth: 700,
		alignSelf: 'center',
		flex: 1,
	},
	// Section 标头（iOS settings 样式：13 大小、灰色、首字母大写）
	groupHeader: {
		fontSize: 13,
		textTransform: 'uppercase',
		marginLeft: 16,
		marginBottom: 7,
		marginTop: 6,
		fontWeight: '400',
		letterSpacing: 0.3,
	},
	// 分组卡（iOS 原生 grouped 卡，圆角 12）
	groupCard: {
		borderRadius: 12,
		overflow: 'hidden',
	},
	noteRow: {
		paddingHorizontal: 16,
		paddingTop: 4,
		paddingBottom: 8,
	},
	noteText: {
		fontSize: 12,
		opacity: 0.5,
	},
	// 行（iOS 设置行高 54）
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 13,
		minHeight: 54,
	},
	rowIcon: {
		width: 34,
		alignItems: 'center',
		justifyContent: 'center',
	},
	rowTitle: {
		fontSize: 16,
		marginLeft: 10,
	},
	rowSubtitle: {
		fontSize: 13,
		marginTop: 2,
		marginLeft: 10,
	},
	rowValue: {
		fontSize: 14,
		marginLeft: 6,
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginLeft: 60,
		backgroundColor: 'rgba(108,108,112,0.15)',
	},
	// 搜索框
	searchWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		height: 42,
		borderRadius: 11,
	},
	searchInput: {
		flex: 1,
		marginLeft: 8,
		fontSize: 16,
		paddingVertical: 0,
	},
	// segmented
	segmented: {
		flexDirection: 'row',
		borderRadius: 10,
		padding: 2,
		marginHorizontal: 16,
		marginVertical: 8,
	},
	segment: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 8,
		borderRadius: 8,
	},
	segmentText: {
		fontSize: 14,
	},
	// 控件容器
	controlWrap: {
		paddingVertical: 10,
		paddingHorizontal: 16,
	},
	// 音质胶囊
	capsule: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		height: 34,
		borderRadius: 17,
		borderWidth: 0.8,
	},
	capsuleText: {
		fontSize: 13,
	},
	// 键盘偏移
	kbBtn: {
		width: 30,
		height: 30,
		borderRadius: 15,
		alignItems: 'center',
		justifyContent: 'center',
	},
	kbBtnText: {
		fontSize: 17,
		fontWeight: '500',
	},
	kbValue: {
		fontSize: 14,
		marginHorizontal: 10,
		minWidth: 44,
		textAlign: 'center',
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 6,
		paddingVertical: 2,
	},
	// 页脚
	footer: {
		alignItems: 'center',
		paddingTop: 4,
		gap: 4,
	},
	footerText: {
		fontSize: 12,
		textAlign: 'center',
	},
})

export default SettingsPage
