import { screenPadding } from '@/constants/tokens'
import SFSymbol from '@/components/SFSymbol'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { getLogs, clearLogs, LogEntry } from '@/utils/appLogger'
import React, { useMemo, useState, useEffect, useCallback } from 'react'
import {
	Alert,
	Animated,
	Clipboard,
	FlatList,
	Modal,
	Pressable,
	ScrollView,
	Share,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'

const LEVEL_LABEL: Record<string, string> = {
	info: '信息',
	warn: '警告',
	error: '错误',
	success: '成功',
}

const MSG_REPLACEMENTS: Array<[RegExp, string]> = [
	[/Network Error/gi, '网络错误'],
	[/Network request failed/gi, '网络请求失败'],
	[/JSON Parse error[^\n]*/gi, 'JSON 解析错误'],
	[/Failed to fetch[^\n]*/gi, '网络获取失败'],
	[/timeout(?: of)? ?(\d+ms)?/gi, '请求超时'],
	[/No active track[^\n]*/gi, '无正在播放歌曲'],
	[/cannot read propert(?:y|ies)[^\n]*/gi, '读取属性失败'],
	[/undefined is not an object[^\n]*/gi, '对象为空'],
	[/is not a function[^\n]*/gi, '方法不存在'],
	[/Possible Unhandled Promise Rejection[^\n]*/gi, '异步错误'],
	[/\b404\b/gi, '404'],
	[/\b50[0-9]\b/gi, '服务器错误'],
]

const localizeMessage = (msg: string) => {
	let out = msg
	for (const [re, zh] of MSG_REPLACEMENTS) out = out.replace(re, zh)
	return out.trim()
}

const LEVEL_COLORS: Record<string, string> = {
	error: '#FF3B30',
	warn: '#FF9500',
	success: '#34C759',
	info: '#007AFF',
}

const FILTERS = ['all', 'flac', 'error', 'warn', 'info', 'success']
const FILTER_LABELS: Record<string, string> = {
	all: '全部',
	flac: '高音质',
	error: '错误',
	warn: '警告',
	info: '信息',
	success: '成功',
}

const LogScreen = ({ onClose }: { onClose?: () => void }) => {
	const { isDark } = useAppTheme()
	const colors = useThemeColors()
	const [logs, setLogs] = useState<LogEntry[]>([])
	const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
	const [searchText, setSearchText] = useState('')
	const [selectedLevel, setSelectedLevel] = useState<string>('all')
	const slideAnim = React.useRef(new Animated.Value(400)).current

	const bg = colors.background
	const cardBg = colors.card
	const text = colors.text
	const subText = colors.textMuted
	const inputBg = colors.separator
	const separator = colors.separator
	const blue = colors.primary

	const loadLogs = useCallback(async () => {
		const data = await getLogs()
		setLogs(data)
	}, [])

	useEffect(() => {
		loadLogs()
	}, [loadLogs])

	useEffect(() => {
		if (selectedLog) {
			Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 320 }).start()
		} else {
			Animated.timing(slideAnim, { toValue: 400, duration: 280, useNativeDriver: true }).start()
		}
	}, [selectedLog, slideAnim])

	const filteredLogs = useMemo(() => {
		return logs.filter((log) => {
			let matchLevel = selectedLevel === 'all' || log.level === selectedLevel
			// 高音质筛选：匹配 tag 包含"高音质"的日志
			if (selectedLevel === 'flac') {
				matchLevel = log.tag.includes('高音质') || log.message.includes('高音质歌词同步')
			}
			const matchSearch = !searchText ||
				log.message.toLowerCase().includes(searchText.toLowerCase()) ||
				log.tag.toLowerCase().includes(searchText.toLowerCase())
			return matchLevel && matchSearch
		})
	}, [logs, selectedLevel, searchText])

	const levelCounts = useMemo(() => {
		const counts: Record<string, number> = { all: logs.length }
		for (const log of logs) counts[log.level] = (counts[log.level] || 0) + 1
		return counts
	}, [logs])

	const handleClear = () => {
		Alert.alert('清空日志', '确定清空所有日志？', [
			{ text: '取消', style: 'cancel' },
			{ text: '清空', style: 'destructive', onPress: async () => { await clearLogs(); setLogs([]) } },
		])
	}

	const handleShare = async () => {
		const text = filteredLogs.map((l) => `[${l.time}] [${l.level}] [${l.tag}] ${l.message}`).join('\n')
		try { await Share.share({ message: text }) } catch {}
	}

	const handleCopy = (item: LogEntry) => {
		Clipboard.setString(`[${item.time}] [${item.level}] [${item.tag}] ${item.message}`)
	}

	const renderItem = ({ item, index }: { item: LogEntry; index: number }) => {
		const isLast = index === filteredLogs.length - 1
		return (
			<Pressable
				onPress={() => setSelectedLog(item)}
				onLongPress={() => handleCopy(item)}
				style={({ pressed }) => [
					styles.logItem,
					!isLast && { borderBottomWidth: 0.5, borderBottomColor: separator },
					pressed && { backgroundColor: isDark ? '#2C2C2E' : '#D1D1D6' },
				]}
			>
				<View style={styles.logHeader}>
					<Text style={[styles.logTag, { color: text }]}>{item.tag === 'console' ? '系统' : item.tag}</Text>
					<Text style={[styles.logTime, { color: subText }]}>{item.time}</Text>
					<Text style={[styles.logLevel, { color: LEVEL_COLORS[item.level] || subText }]}>{LEVEL_LABEL[item.level] || item.level}</Text>
				</View>
				<Text style={[styles.logMsg, { color: text }]} numberOfLines={2}>{localizeMessage(item.message)}</Text>
			</Pressable>
		)
	}

	return (
		<View style={[styles.container, { backgroundColor: bg }]}>
			<View style={styles.handle} />

			<View style={styles.header}>
				<Text style={[styles.title, { color: text }]}>应用日志</Text>
				<View style={styles.headerBtns}>
					<TouchableOpacity onPress={loadLogs} style={styles.iconBtn}>
						<SFSymbol systemName="arrow.clockwise" size={16} color={blue} />
					</TouchableOpacity>
					<TouchableOpacity onPress={handleShare} style={styles.iconBtn}>
						<SFSymbol systemName="square.and.arrow.up" size={16} color={blue} />
					</TouchableOpacity>
					<TouchableOpacity onPress={handleClear} style={styles.iconBtn}>
						<SFSymbol systemName="trash" size={16} color="#FF3B30" />
					</TouchableOpacity>
				</View>
			</View>

			<View style={[styles.searchBox, { backgroundColor: inputBg }]}>
				<SFSymbol systemName="magnifyingglass" size={14} color={subText} />
				<TextInput
					style={[styles.searchInput, { color: text }]}
					placeholder="搜索"
					placeholderTextColor={subText}
					value={searchText}
					onChangeText={setSearchText}
				/>
				{searchText ? (
					<TouchableOpacity onPress={() => setSearchText('')}>
						<SFSymbol systemName="xmark.circle.fill" size={14} color={subText} />
					</TouchableOpacity>
				) : null}
			</View>

			<View style={[styles.segmentWrap, { backgroundColor: inputBg }]}>
				{FILTERS.map((level) => {
					const active = selectedLevel === level
					return (
						<TouchableOpacity
							key={level}
							style={[styles.segmentItem, active && { backgroundColor: cardBg }]}
							onPress={() => setSelectedLevel(level)}
						>
							<Text style={[styles.segmentText, { color: active ? text : subText, fontWeight: active ? '600' : '400' }]}>
								{FILTER_LABELS[level] || level}
							</Text>
						</TouchableOpacity>
					)
				})}
			</View>

			<FlatList
				data={filteredLogs}
				keyExtractor={(item, index) => `${item.timestamp}-${index}`}
				renderItem={renderItem}
				ListEmptyComponent={<Text style={[styles.empty, { color: subText }]}>暂无日志</Text>}
				contentContainerStyle={filteredLogs.length === 0 && styles.emptyWrap}
				style={styles.list}
			/>

			<Modal
				visible={!!selectedLog}
				animationType="slide"
				presentationStyle="pageSheet"
				onRequestClose={() => setSelectedLog(null)}
			>
				{selectedLog && (
					<View style={[styles.detailContainer, { backgroundColor: bg }]}>
						<View style={styles.detailHandle} />
						<Text style={[styles.detailTitle, { color: text }]}>日志详情</Text>

						<View style={[styles.detailMeta, { backgroundColor: cardBg }]}>
							<View style={styles.detailMetaRow}>
								<Text style={[styles.detailMetaLabel, { color: subText }]}>标签</Text>
								<Text style={[styles.detailMetaValue, { color: text }]}>{selectedLog.tag === 'console' ? '系统' : selectedLog.tag}</Text>
							</View>
							<View style={styles.detailMetaRow}>
								<Text style={[styles.detailMetaLabel, { color: subText }]}>时间</Text>
								<Text style={[styles.detailMetaValue, { color: text }]}>{selectedLog.time}</Text>
							</View>
							<View style={styles.detailMetaRow}>
								<Text style={[styles.detailMetaLabel, { color: subText }]}>级别</Text>
								<Text style={[styles.detailMetaValue, { color: LEVEL_COLORS[selectedLog.level] || text }]}>{LEVEL_LABEL[selectedLog.level] || selectedLog.level}</Text>
							</View>
						</View>

						<ScrollView style={styles.detailMsgWrap}>
							<Text style={[styles.detailMsg, { color: text }]}>{localizeMessage(selectedLog.message)}</Text>
						</ScrollView>

						<TouchableOpacity
							style={[styles.detailCopyBtn, { backgroundColor: cardBg }]}
							onPress={() => handleCopy(selectedLog)}
						>
							<SFSymbol systemName="doc.on.doc" size={16} color={blue} />
							<Text style={[styles.detailCopyBtnText, { color: blue }]}>复制日志</Text>
						</TouchableOpacity>
					</View>
				)}
			</Modal>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1, paddingHorizontal: screenPadding.horizontal },
	handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(120,120,128,0.3)', alignSelf: 'center', marginTop: 8, marginBottom: 10 },
	header: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginBottom: 14, position: 'relative' },
	title: { fontSize: 17, fontWeight: '600' },
	headerBtns: { flexDirection: 'row', gap: 4, position: 'absolute', right: 0 },
	iconBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
	searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, paddingHorizontal: 10, height: 36, gap: 6, marginBottom: 12 },
	searchInput: { flex: 1, fontSize: 15, padding: 0 },
	segmentWrap: { flexDirection: 'row', borderRadius: 9, padding: 2, marginBottom: 14 },
	segmentItem: { flex: 1, paddingVertical: 7, borderRadius: 7, alignItems: 'center' },
	segmentText: { fontSize: 13 },
	list: { flex: 1 },
	logItem: { paddingVertical: 12, paddingHorizontal: 14 },
	logHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
	logTag: { fontSize: 14, fontWeight: '600', marginRight: 8 },
	logTime: { fontSize: 12, color: '#8E8E93', flex: 1 },
	logLevel: { fontSize: 12, fontWeight: '500' },
	logMsg: { fontSize: 15, lineHeight: 22 },
	empty: { textAlign: 'center', marginTop: 80, fontSize: 15 },
	emptyWrap: { flexGrow: 1, justifyContent: 'center' },
	detailContainer: { flex: 1, padding: 16, paddingBottom: 34 },
	detailHandle: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(120,120,128,0.3)', alignSelf: 'center', marginBottom: 16 },
	detailTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
	detailMeta: { borderRadius: 12, marginBottom: 12 },
	detailMetaRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: 'rgba(120,120,128,0.2)' },
	detailMetaLabel: { fontSize: 14 },
	detailMetaValue: { fontSize: 14, marginLeft: 'auto', fontWeight: '500' },
	detailMsgWrap: { flex: 1, marginBottom: 12 },
	detailMsg: { fontSize: 15, lineHeight: 22 },
	detailCopyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
	detailCopyBtnText: { fontSize: 16, fontWeight: '600' },
})

export default LogScreen
