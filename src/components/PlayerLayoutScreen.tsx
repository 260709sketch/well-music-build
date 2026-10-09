import React, { useState, memo } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useLayoutStore, DEFAULT_LAYOUT, type LayoutSettings } from '@/store/playerLayoutStore'
import PersistStatus from '@/store/PersistStatus'

interface PlayerLayoutScreenProps {
	onClose?: () => void
}

// 数值调节行（移到组件外部，避免父组件重渲染时卸载重建 TextInput 导致键盘闪烁）
interface ValueRowProps {
	label: string
	value: number
	min: number
	max: number
	step?: number
	onChange: (value: number) => void
	separatorColor: string
	textColor: string
}

const ValueRow = memo(({ label, value, min, max, step = 1, onChange, separatorColor, textColor }: ValueRowProps) => {
	const [text, setText] = useState(String(value))

	// 外部 value 变化时同步（如 +/- 按钮、重置）
	React.useEffect(() => {
		setText(String(value))
	}, [value])

	const handleChange = (t: string) => {
		if (t === '' || t === '-' || /^-?\d+$/.test(t)) {
			setText(t)
		}
	}

	const commitValue = () => {
		const n = parseInt(text, 10)
		if (!isNaN(n)) {
			const clamped = Math.max(min, Math.min(max, n))
			setText(String(clamped))
			onChange(clamped)
		} else {
			setText(String(value))
		}
	}

	const stepChange = (delta: number) => {
		const next = Math.max(min, Math.min(max, value + delta))
		setText(String(next))
		onChange(next)
	}

	return (
		<View style={[styles.valueRow, { borderBottomColor: separatorColor + '30' }]}>
			<Text style={[styles.rowLabel, { color: textColor }]}>{label}</Text>
			<View style={styles.controlRow}>
				<TouchableOpacity
					style={[styles.stepBtn, { backgroundColor: separatorColor + '30' }]}
					onPress={() => stepChange(-step)}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Text style={[styles.stepBtnText, { color: textColor }]}>-</Text>
				</TouchableOpacity>
				<TextInput
					style={[styles.valueInput, { backgroundColor: separatorColor + '20', color: textColor }]}
					value={text}
					keyboardType="numbers-and-punctuation"
					onChangeText={handleChange}
					onEndEditing={commitValue}
					onBlur={commitValue}
					onSubmitEditing={commitValue}
					returnKeyType="done"
					selectTextOnFocus
					blurOnSubmit
				/>
				<TouchableOpacity
					style={[styles.stepBtn, { backgroundColor: separatorColor + '30' }]}
					onPress={() => stepChange(step)}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Text style={[styles.stepBtnText, { color: textColor }]}>+</Text>
				</TouchableOpacity>
			</View>
		</View>
	)
})

export const PlayerLayoutScreen = ({ onClose }: PlayerLayoutScreenProps) => {
	const { colors } = useAppTheme()
	const insets = useSafeAreaInsets()
	const settings = useLayoutStore((state) => state.settings)
	const updateSettings = useLayoutStore((state) => state.updateSettings)
	const resetSettings = useLayoutStore((state) => state.resetSettings)

	const getValue = (key: keyof LayoutSettings): number => {
		const v = settings[key]
		return (typeof v === 'number' && !isNaN(v)) ? v : (DEFAULT_LAYOUT[key] as number)
	}

	const updateSetting = (key: keyof LayoutSettings, value: number) => {
		updateSettings({ [key]: value })
	}

	const updateTextAlign = (value: 'left' | 'center' | 'right') => {
		updateSettings({ lyricTextAlign: value })
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			{/* 导航栏：加安全区域顶部间距，避免被状态栏/灵动岛遮挡 */}
			<View style={[styles.header, { paddingTop: insets.top + 8 }]}>
				<TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<SFSymbol systemName="chevron.left" size={22} color={colors.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: colors.text }]}>播放器布局调整</Text>
				<TouchableOpacity onPress={resetSettings} style={styles.resetBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Text style={[styles.resetText, { color: colors.primary }]}>重置</Text>
				</TouchableOpacity>
			</View>

			<ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
				{/* 歌词界面（小封面） */}
				<Text style={[styles.sectionHeader, { color: colors.textMuted }]}>歌词界面（小封面）</Text>
				<View style={[styles.group, { backgroundColor: colors.card, borderRadius: 14 }]}>
					<ValueRow label="小封面 水平位移 X" value={getValue('miniArtworkTranslateX')} min={-1200} max={200} step={10} onChange={(v) => updateSetting('miniArtworkTranslateX', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="小封面 垂直位移 Y" value={getValue('miniArtworkTranslateY')} min={-1200} max={100} step={10} onChange={(v) => updateSetting('miniArtworkTranslateY', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌曲信息 水平位移 X" value={getValue('miniSongInfoTranslateX')} min={-200} max={400} step={5} onChange={(v) => updateSetting('miniSongInfoTranslateX', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌曲信息 垂直位移 Y" value={getValue('miniSongInfoTranslateY')} min={-700} max={100} step={5} onChange={(v) => updateSetting('miniSongInfoTranslateY', v)} separatorColor={colors.separator} textColor={colors.text} />
				</View>

				{/* 播放器主界面 */}
				<Text style={[styles.sectionHeader, { color: colors.textMuted }]}>播放器主界面</Text>
				<View style={[styles.group, { backgroundColor: colors.card, borderRadius: 14 }]}>
					<ValueRow label="底部控制区 上边距" value={getValue('bottomControlsMarginTop')} min={-100} max={200} step={1} onChange={(v) => updateSetting('bottomControlsMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="播放控制栏 上边距" value={getValue('playControlsMarginTop')} min={-100} max={200} step={1} onChange={(v) => updateSetting('playControlsMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="音质图标 上边距" value={getValue('qualityBadgeMarginTop')} min={-100} max={200} step={1} onChange={(v) => updateSetting('qualityBadgeMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="音质图标 水平位移" value={getValue('qualityBadgeTranslateX')} min={-200} max={200} step={1} onChange={(v) => updateSetting('qualityBadgeTranslateX', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="音量条 上边距" value={getValue('volumeRowMarginTop')} min={-100} max={200} step={1} onChange={(v) => updateSetting('volumeRowMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="底部功能按钮 上边距" value={getValue('bottomButtonsRowMarginTop')} min={-100} max={200} step={1} onChange={(v) => updateSetting('bottomButtonsRowMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
				</View>

				{/* 歌词设置 */}
				<Text style={[styles.sectionHeader, { color: colors.textMuted }]}>歌词设置</Text>
				<View style={[styles.group, { backgroundColor: colors.card, borderRadius: 14 }]}>
					<ValueRow label="歌词区域顶部位置" value={getValue('lyricAreaTop')} min={100} max={400} step={1} onChange={(v) => updateSetting('lyricAreaTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="AMLL 歌词底部位置" value={getValue('amllLyricBottom')} min={100} max={500} step={1} onChange={(v) => updateSetting('amllLyricBottom', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="当前歌词位置(%)" value={getValue('lyricActiveOffset')} min={10} max={70} step={1} onChange={(v) => updateSetting('lyricActiveOffset', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词顶部空白" value={getValue('lyricPaddingTop')} min={0} max={200} step={1} onChange={(v) => updateSetting('lyricPaddingTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词左边距" value={getValue('lyricPaddingLeft')} min={0} max={100} step={1} onChange={(v) => updateSetting('lyricPaddingLeft', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词右边距" value={getValue('lyricPaddingRight')} min={0} max={100} step={1} onChange={(v) => updateSetting('lyricPaddingRight', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词底部空白" value={getValue('lyricPaddingBottom')} min={0} max={400} step={5} onChange={(v) => updateSetting('lyricPaddingBottom', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词行间距" value={getValue('lyricLineMargin')} min={5} max={50} step={1} onChange={(v) => updateSetting('lyricLineMargin', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词字重" value={getValue('lyricFontWeight')} min={400} max={900} step={100} onChange={(v) => updateSetting('lyricFontWeight', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="AMLL 歌词字重" value={getValue('amllLyricFontWeight')} min={400} max={900} step={100} onChange={(v) => updateSetting('amllLyricFontWeight', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="当前歌词字号" value={getValue('lyricFontSize')} min={20} max={60} step={1} onChange={(v) => updateSetting('lyricFontSize', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="非当前歌词字号" value={getValue('lyricInactiveFontSize')} min={12} max={40} step={1} onChange={(v) => updateSetting('lyricInactiveFontSize', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌词翻译字号" value={getValue('lyricTranslationFontSize')} min={10} max={30} step={1} onChange={(v) => updateSetting('lyricTranslationFontSize', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="歌曲信息上边距" value={getValue('songInfoRowMarginTop')} min={0} max={150} step={1} onChange={(v) => updateSetting('songInfoRowMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="小封面大小" value={getValue('lyricMiniArtworkSize')} min={30} max={100} step={1} onChange={(v) => updateSetting('lyricMiniArtworkSize', v)} separatorColor={colors.separator} textColor={colors.text} />
				</View>

				{/* 播放队列 */}
				<Text style={[styles.sectionHeader, { color: colors.textMuted }]}>播放队列</Text>
				<View style={[styles.group, { backgroundColor: colors.card, borderRadius: 14 }]}>
					<ValueRow label="队列顶部位置" value={getValue('queueContentTop')} min={50} max={400} step={1} onChange={(v) => updateSetting('queueContentTop', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="队列标题字号" value={getValue('queueTitleFontSize')} min={14} max={36} step={1} onChange={(v) => updateSetting('queueTitleFontSize', v)} separatorColor={colors.separator} textColor={colors.text} />
					<ValueRow label="队列标题上下位置" value={getValue('queueTitleMarginTop')} min={-30} max={60} step={1} onChange={(v) => updateSetting('queueTitleMarginTop', v)} separatorColor={colors.separator} textColor={colors.text} />
				</View>

				{/* 其他 */}
				<Text style={[styles.sectionHeader, { color: colors.textMuted }]}>其他</Text>
				<View style={[styles.group, { backgroundColor: colors.card, borderRadius: 14 }]}>
					<View style={[styles.valueRow, { borderBottomColor: colors.separator + '30' }]}>
						<Text style={[styles.rowLabel, { color: colors.text }]}>歌词对齐方式</Text>
						<View style={styles.alignRow}>
							{(['left', 'center', 'right'] as const).map((align) => (
								<TouchableOpacity
									key={align}
									style={[
										styles.alignBtn,
										{ backgroundColor: colors.separator + '30' },
										settings.lyricTextAlign === align && { backgroundColor: colors.primary },
									]}
									onPress={() => updateTextAlign(align)}
								>
									<Text style={[
										styles.alignBtnText,
										{ color: settings.lyricTextAlign === align ? '#fff' : colors.textMuted }
									]}>
										{align === 'left' ? '左' : align === 'center' ? '中' : '右'}
									</Text>
								</TouchableOpacity>
							))}
						</View>
					</View>
				</View>

				<Text style={[styles.tip, { color: colors.textMuted }]}>调整后返回播放器立即生效，无需重启</Text>
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 8,
		paddingBottom: 8,
	},
	backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
	headerTitle: { fontSize: 17, fontWeight: '500' },
	resetBtn: { paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center', alignItems: 'center' },
	resetText: { fontSize: 15, fontWeight: '500' },
	scroll: { flex: 1 },
	scrollContent: { padding: 16, paddingBottom: 60 },
	sectionHeader: {
		fontSize: 12,
		fontWeight: '500',
		marginTop: 16,
		marginBottom: 6,
		marginLeft: 4,
		letterSpacing: 0.2,
	},
	group: { overflow: 'hidden', marginBottom: 4, borderRadius: 12 },
	valueRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 14,
		paddingVertical: 10,
		borderBottomWidth: 0.5,
	},
	rowLabel: { fontSize: 14, fontWeight: '500', flex: 1 },
	controlRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
	stepBtn: {
		width: 28,
		height: 28,
		borderRadius: 14,
		justifyContent: 'center',
		alignItems: 'center',
	},
	stepBtnText: { fontSize: 16, fontWeight: '500' },
	valueInput: {
		width: 50,
		height: 32,
		borderRadius: 8,
		textAlign: 'center',
		fontSize: 13,
		fontWeight: '500',
	},
	alignRow: { flexDirection: 'row', gap: 6 },
	alignBtn: {
		paddingHorizontal: 14,
		paddingVertical: 5,
		borderRadius: 10,
		minWidth: 36,
		alignItems: 'center',
	},
	alignBtnText: { fontSize: 13, fontWeight: '500' },
	tip: { fontSize: 12, marginTop: 20, textAlign: 'center' },
})
