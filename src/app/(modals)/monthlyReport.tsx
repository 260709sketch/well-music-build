import React, { useMemo } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import { useMonthlyReportStore, monthKeyOf, aggregateArtists } from '@/store/monthlyReportStore'
import { unknownTrackImageUri } from '@/constants/images'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const MonthReportScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { bottom } = useSafeAreaInsets()
	const months = useMonthlyReportStore((s) => s.months)
	const monthKey = monthKeyOf()
	const month = months[monthKey]

	const songsTop = useMemo(() => {
		if (!month) return []
		return Object.values(month.songs)
			.sort((a, b) => b.seconds - a.seconds || b.count - a.count)
			.slice(0, 10)
	}, [month])

	const artistsTop = useMemo(() => aggregateArtists(month).slice(0, 5), [month])

	const days = useMemo(() => {
		if (!month) return []
		return Object.entries(month.days).sort((a, b) => a[0].localeCompare(b[0]))
	}, [month])
	const maxDaySeconds = Math.max(1, ...days.map(([, s]) => s))

	if (!month || (month.totalSeconds <= 0 && month.totalCount <= 0)) {
		return (
			<View style={[styles.empty, { backgroundColor: colors.background }]}>
				<Text style={[styles.emptyTitle, { color: colors.text }]}>本月还没有听歌记录</Text>
				<Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
					播放一些歌曲后，这里会生成你的听歌月报
				</Text>
			</View>
		)
	}

	const totalHours = month.totalSeconds / 3600
	const totalMinutes = month.totalSeconds / 60
	const hourText = totalHours >= 1
		? `${totalHours.toFixed(1)} 小时`
		: `${Math.round(totalMinutes)} 分钟`

	return (
		<ScrollView
			style={{ backgroundColor: colors.background }}
			contentContainerStyle={[styles.container, { paddingBottom: bottom + 24 }]}
			showsVerticalScrollIndicator={false}
		>
			<Text style={[styles.pageTitle, { color: colors.text }]}>我的听歌月报</Text>
			<Text style={[styles.pageSub, { color: colors.textSecondary }]}>{monthKey.replace('-', ' 年 ').replace('-', ' 月 ') + ' 月'}</Text>

			{/* 本月概览 */}
			<View style={[styles.statRow]}>
				<View style={[styles.statCard, { backgroundColor: colors.card }]}>
					<Text style={[styles.statValue, { color: colors.primary }]}>{hourText}</Text>
					<Text style={[styles.statLabel, { color: colors.textSecondary }]}>本月听歌时长</Text>
				</View>
				<View style={[styles.statCard, { backgroundColor: colors.card }]}>
					<Text style={[styles.statValue, { color: colors.primary }]}>{month.totalCount}</Text>
					<Text style={[styles.statLabel, { color: colors.textSecondary }]}>完整听完（次）</Text>
				</View>
				<View style={[styles.statCard, { backgroundColor: colors.card }]}>
					<Text style={[styles.statValue, { color: colors.primary }]}>{days.length}</Text>
					<Text style={[styles.statLabel, { color: colors.textSecondary }]}>有听歌的天数</Text>
				</View>
			</View>

			{/* 每日听歌柱状图 */}
			<View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
				<Text style={[styles.sectionTitle, { color: colors.text }]}>每日听歌时长</Text>
				<View style={styles.barChart}>
					{days.map(([day, sec]) => (
						<View key={day} style={styles.barCol}>
							<View
								style={[
									styles.bar,
									{
										height: Math.max(3, (sec / maxDaySeconds) * 90),
										backgroundColor: colors.primary,
									},
								]}
							/>
							<Text style={[styles.barLabel, { color: colors.textSecondary }]}>
								{day.slice(8)}
							</Text>
						</View>
					))}
				</View>
			</View>

			{/* 最爱歌曲 TOP10 */}
			<View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
				<Text style={[styles.sectionTitle, { color: colors.text }]}>最爱歌曲 TOP{Math.min(10, songsTop.length)}</Text>
				{songsTop.map((s, i) => (
					<View key={i} style={styles.songRow}>
						<Text style={[styles.rank, { color: i < 3 ? colors.primary : colors.textSecondary }]}>{i + 1}</Text>
						<FastImage
							source={{ uri: s.artwork || unknownTrackImageUri }}
							style={styles.songArtwork}
							resizeMode={FastImage.resizeMode.cover}
						/>
						<View style={styles.songMeta}>
							<Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>{s.title}</Text>
							<Text style={[styles.songArtist, { color: colors.textSecondary }]} numberOfLines={1}>{s.artist}</Text>
						</View>
						<View style={styles.songRight}>
							<Text style={[styles.songCount, { color: colors.textSecondary }]}>{s.count} 次</Text>
							<Text style={[styles.songSeconds, { color: colors.textSecondary }]}>
								{Math.round(s.seconds / 60)} 分钟
							</Text>
						</View>
					</View>
				))}
			</View>

			{/* 最爱歌手 TOP5 */}
			{artistsTop.length > 0 && (
				<View style={[styles.sectionCard, { backgroundColor: colors.card }]}>
					<Text style={[styles.sectionTitle, { color: colors.text }]}>最爱歌手 TOP{Math.min(5, artistsTop.length)}</Text>
					{artistsTop.map((a, i) => (
						<View key={i} style={styles.artistRow}>
							<Text style={[styles.rank, { color: i < 3 ? colors.primary : colors.textSecondary }]}>{i + 1}</Text>
							<Text style={[styles.artistName, { color: colors.text }]} numberOfLines={1}>{a.name}</Text>
							<Text style={[styles.songCount, { color: colors.textSecondary }]}>{a.count} 次</Text>
						</View>
					))}
				</View>
			)}
		</ScrollView>
	)
}

const styles = StyleSheet.create({
	container: { paddingHorizontal: 20, paddingTop: 8 },
	empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
	emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
	emptyHint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
	pageTitle: { fontSize: 24, fontWeight: '700', marginBottom: 2 },
	pageSub: { fontSize: 14, marginBottom: 16 },
	statRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
	statCard: {
		flex: 1,
		borderRadius: 14,
		paddingVertical: 16,
		paddingHorizontal: 8,
		alignItems: 'center',
	},
	statValue: { fontSize: 18, fontWeight: '700', marginBottom: 6 },
	statLabel: { fontSize: 11, textAlign: 'center' },
	sectionCard: { borderRadius: 16, padding: 16, marginBottom: 14 },
	sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 14 },
	barChart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 112 },
	barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
	bar: { width: '100%', maxWidth: 14, borderRadius: 3 },
	barLabel: { fontSize: 9, marginTop: 5 },
	songRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
	rank: { width: 22, fontSize: 14, fontWeight: '700', textAlign: 'center' },
	songArtwork: { width: 42, height: 42, borderRadius: 8 },
	songMeta: { flex: 1, minWidth: 0 },
	songTitle: { fontSize: 14, fontWeight: '500' },
	songArtist: { fontSize: 12, marginTop: 2 },
	songRight: { alignItems: 'flex-end', gap: 2 },
	songCount: { fontSize: 12 },
	songSeconds: { fontSize: 11, opacity: 0.7 },
	artistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
	artistName: { flex: 1, fontSize: 14, fontWeight: '500' },
})

export default MonthReportScreen
