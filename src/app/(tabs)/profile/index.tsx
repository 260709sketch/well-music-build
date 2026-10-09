// 「我的」页：Beans Music nativeClean（Apple 简洁）一比一复刻
// 卡片 = ultraThinMaterial 原生毛玻璃（iOS 17 可渲染，expo-blur 同 API）
// 阴影 = Beans beansCardShadow：userCard black8% r10 y4 / 菜单卡 black8% r9 y3（深色 35%）
// 骨架沿用 r28 已验证结构；设置入口在菜单列表原位置，导航栏不动
import SFSymbol from '@/components/SFSymbol'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useNeteaseStatsStore } from '@/store/neteaseStatsStore'
import * as Haptics from 'expo-haptics'
import { BlurView } from 'expo-blur'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'

// Beans 品牌红（图标填充）
const RED = '#e53935'
// 未设置昵称占位灰
const PLACEHOLDER = '#9a9a9e'

// 分钟 → 「X小时Y分 / X分钟」
const formatCompactMinutes = (minutes: number): string => {
	const totalMinutes = Math.floor(Number(minutes) || 0)
	if (totalMinutes <= 0) return '0分钟'
	if (totalMinutes < 60) return `${totalMinutes}分钟`
	const h = Math.floor(totalMinutes / 60)
	const m = totalMinutes % 60
	return m === 0 ? `${h}小时` : `${h}小时${m}分`
}

// 板块错落入场（仿 Beans sectionEntrance：淡入 + 轻微上移）
const Entrance = ({ delay = 0, children }: { delay?: number; children: React.ReactNode }) => {
	const opacity = useRef(new Animated.Value(0)).current
	const translateY = useRef(new Animated.Value(14)).current
	useEffect(() => {
		Animated.parallel([
			Animated.timing(opacity, { toValue: 1, duration: 450, delay, useNativeDriver: true }),
			Animated.timing(translateY, { toValue: 0, duration: 450, delay, useNativeDriver: true }),
		]).start()
	}, [delay, opacity, translateY])
	return (
		<Animated.View style={{ opacity, transform: [{ translateY }] }}>
			{children}
		</Animated.View>
	)
}

// Beans 卡片：ultraThinMaterial 毛玻璃 + beansCardShadow
// shadowRadius/y 按 Beans 参数：大卡(10,4) 菜单卡(9,3)；浅色 black 8% / 深色 35%
const Card = ({
	children,
	radius = 22,
	style,
	shadow = { radius: 9, y: 3 },
}: {
	children: React.ReactNode
	radius?: number
	style?: any
	shadow?: { radius: number; y: number } | null
}) => {
	const { isDark } = useAppTheme()
	const inner = (
		<View style={{ borderRadius: radius, overflow: 'hidden' }}>
			<BlurView
				tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
				intensity={100}
				style={StyleSheet.absoluteFill}
			/>
			{children}
		</View>
	)
	if (!shadow) {
		return <View style={[{ borderRadius: radius, overflow: 'hidden' }, style]}>{inner}</View>
	}
	return (
		<View
			style={[
				{
					borderRadius: radius,
					backgroundColor: 'transparent',
					shadowColor: '#000',
					shadowOpacity: isDark ? 0.35 : 0.08,
					shadowRadius: shadow.radius,
					shadowOffset: { width: 0, height: shadow.y },
				},
				style,
			]}
		>
			{inner}
		</View>
	)
}

const ProfileScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const router = useRouter()
	const navigation = useNavigation()
	const insets = useSafeAreaInsets()

	const { isLoggedIn, nickname, avatar, userId, cookie, logout } = useDailyRecommendStore()
	const neteaseStats = useNeteaseStatsStore()
	const { refresh: refreshNeteaseStats } = neteaseStats

	// 每次进入「我的」页实时刷新网易云统计（每周听歌/连续收听等）
	useFocusEffect(
		useCallback(() => {
			if (isLoggedIn && cookie) {
				refreshNeteaseStats(cookie, userId)
			}
		}, [isLoggedIn, cookie, userId, refreshNeteaseStats])
	)

	// 右上角不显示任何按钮（设置入口在页面菜单列表），导航栏保持原样
	useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: null,
		})
	}, [navigation])

	// 点击账号卡：已登录显示退出弹窗，未登录进入登录
	const onAccountPress = () => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		if (isLoggedIn) {
			Alert.alert(nickname || '网易云用户', '网易云音乐账号', [
				{ text: '退出登录', style: 'destructive', onPress: () => logout() },
				{ text: '关闭', style: 'cancel' },
			])
		} else {
			router.push('/(modals)/neteaseLogin')
		}
	}

	// 六个菜单（Beans 卡片布局：红色裸图标 + 标题14semibold + 副标题11 + 右箭头；摆放保持原顺序）
	const menus = [
		{
			title: '我喜欢的音乐',
			subtitle: '网易云收藏的喜欢的歌曲',
			symbol: 'heart.fill',
			onPress: () => router.push('/(tabs)/profile/neteaseLiked' as any),
		},
		{
			title: '最近播放',
			subtitle: '本地保存的播放记录',
			symbol: 'clock.arrow.circlepath',
			onPress: () => router.push('/(tabs)/profile/playHistory' as any),
		},
		{
			title: '听歌排行',
			subtitle: '最近一周听歌统计',
			symbol: 'chart.bar.fill',
			onPress: () => router.push('/(tabs)/profile/record' as any),
		},
		{
			title: '收藏专辑',
			subtitle: '网易云收藏的专辑',
			symbol: 'square.stack.fill',
			onPress: () => router.push('/(tabs)/profile/favoriteAlbums' as any),
		},
		{
			title: '设置',
			subtitle: '应用偏好与功能开关',
			symbol: 'gearshape.fill',
			onPress: () => router.push('/(modals)/settings' as any),
		},
	]

	const displayName = isLoggedIn && nickname ? nickname : '点击登录'
	const statusLine = isLoggedIn ? '网易云用户' : '登录后同步我喜欢的音乐与歌单'

	// 统计区（Beans 截图样式：红色小图标 + 灰色标签，下方黑色粗体大数值）
	// 左：每周听歌；右：连续收听
	const stats: { icon: string; label: string; value: string }[] = [
		{ icon: 'clock.arrow.circlepath', label: '每周听歌', value: neteaseStats.weeklyMinutes >= 0 ? formatCompactMinutes(neteaseStats.weeklyMinutes) : '--' },
		{ icon: 'calendar', label: '连续收听', value: neteaseStats.streakDays >= 0 ? `${neteaseStats.streakDays}天` : '--' },
	]

	const hairlineColor = isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.10)'
	const commentColor = colors.textMuted

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{
					paddingHorizontal: 24,
					paddingTop: 4,
					paddingBottom: insets.bottom + 190,
				}}
			>
				{/* 账号卡（Beans userCard r24：头像64+相机钮 + 昵称20bold + mono状态行 + ID胶囊 + 右侧声波图标；下半统计区） */}
				<Entrance delay={0}>
					<Card radius={24} shadow={{ radius: 10, y: 4 }}>
						<TouchableOpacity activeOpacity={0.85} onPress={onAccountPress} style={styles.accountCard}>
							<View style={styles.avatarWrap}>
								<View style={[styles.avatarInner, { backgroundColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(120,120,128,0.12)' }]}>
									{isLoggedIn && avatar ? (
										<FastImage source={{ uri: avatar }} style={styles.avatarImg} resizeMode={FastImage.resizeMode.cover} />
									) : (
										<SFSymbol systemName="person.fill" size={26} color={commentColor} />
									)}
								</View>
							</View>
							<View style={{ flex: 1, marginLeft: 14 }}>
								<Text style={[styles.accountName, { color: isLoggedIn && nickname ? colors.text : PLACEHOLDER }]} numberOfLines={1}>
									{displayName}
								</Text>
								<Text style={[styles.statusLine, { color: commentColor }]} numberOfLines={1}>
									{statusLine}
								</Text>
							</View>
							{/* 右侧红色声波品牌图标（Beans 截图） */}
							<SFSymbol systemName="waveform" size={22} color={RED} weight="semibold" />
						</TouchableOpacity>

						{/* 统计区（分割线下方：红色图标 + 灰标签，下方黑色粗体大数值） */}
						<View style={[styles.statsStrip, { borderTopColor: hairlineColor }]}>
							{stats.map((s, i) => (
								<View key={s.label} style={[styles.statCell, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: hairlineColor }]}>
									<View style={styles.statHead}>
										<SFSymbol systemName={s.icon} size={13} color={RED} weight="medium" />
										<Text style={[styles.statLabel, { color: commentColor }]} numberOfLines={1}>
											{s.label}
										</Text>
									</View>
									<Text style={[styles.statValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
										{s.value}
									</Text>
								</View>
							))}
						</View>
					</Card>
				</Entrance>

				{/* 菜单分组卡（一整张圆角卡，行间细分隔线 + 红色图标 + chevron） */}
				<Entrance delay={80}>
					<Card radius={18} shadow={null} style={{ marginTop: 28 }}>
						{menus.map((cell, index) => (
							<React.Fragment key={cell.title}>
								{index > 0 && <View style={[styles.rowDivider, { backgroundColor: hairlineColor }]} />}
								<TouchableOpacity activeOpacity={0.85} onPress={cell.onPress} style={styles.kumoneRow}>
									<SFSymbol systemName={cell.symbol} size={20} color={RED} weight="medium" />
									<Text style={[styles.menuTitle, { color: colors.text }]} numberOfLines={1}>
										{cell.title}
									</Text>
									<SFSymbol systemName="chevron.right" size={14} color={isDark ? 'rgba(235,235,245,0.3)' : 'rgba(60,60,67,0.28)'} weight="semibold" />
								</TouchableOpacity>
							</React.Fragment>
						))}
					</Card>
				</Entrance>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	accountCard: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 18,
		paddingBottom: 16,
	},
	avatarWrap: {
		width: 64,
		height: 64,
	},
	avatarInner: {
		width: 64,
		height: 64,
		borderRadius: 32,
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'hidden',
	},
	avatarImg: { width: 64, height: 64, borderRadius: 32 },
	accountName: { fontSize: 20, fontWeight: '700' },
	statusLine: { fontSize: 12, fontFamily: 'Menlo', marginTop: 3 },
	kumoneRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 15,
		minHeight: 48,
	},
	rowDivider: {
			height: StyleSheet.hairlineWidth,
			// 对齐文字起点（padding16 + 图标20 + title margin12 = 64），避免分隔线比文字靠左显得"前面短一截"
			marginLeft: 64,
		},
	statsStrip: {
		flexDirection: 'row',
		alignItems: 'stretch',
		borderTopWidth: StyleSheet.hairlineWidth,
		paddingVertical: 16,
		paddingHorizontal: 16,
	},
	statCell: {
		flex: 1,
		alignItems: 'center',
		paddingHorizontal: 4,
	},
	statHead: { flexDirection: 'row', alignItems: 'center' },
	statLabel: { fontSize: 12, marginLeft: 5 },
	statValue: { fontSize: 17, fontWeight: '700', marginTop: 5 },
	menuTitle: { fontSize: 16, fontWeight: '500', flex: 1, marginLeft: 12, marginRight: 8 },
})

export default ProfileScreen
