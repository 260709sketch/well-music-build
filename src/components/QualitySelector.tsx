import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import SFSymbol from '@/components/SFSymbol'
import { Ionicons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import React, { useCallback, useState } from 'react'
import {
	Modal,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

// 音质选项
const QUALITY_OPTIONS = [
	{ id: '128k', label: '标准', bitrate: '128k' },
	{ id: '320k', label: '高清', bitrate: '320k' },
	{ id: 'flac', label: '无损', bitrate: 'FLAC' },
]

type QualitySelectorProps = {
	currentQuality?: string
	onQualityChange?: (quality: string) => void
}

export const QualitySelector = React.memo(({ currentQuality = '320k', onQualityChange }: QualitySelectorProps) => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const [visible, setVisible] = useState(false)

	const currentOption = QUALITY_OPTIONS.find((q) => q.id === currentQuality) || QUALITY_OPTIONS[1]

	const handleSelect = useCallback(
		(qualityId: string) => {
			onQualityChange?.(qualityId)
			setVisible(false)
		},
		[onQualityChange],
	)

	return (
		<>
			{/* 音质显示按钮 - 液态玻璃效果，居中拉伸 */}
			<TouchableOpacity
				onPress={() => setVisible(true)}
				activeOpacity={0.8}
				style={styles.qualityButtonWrapper}
			>
				<View style={styles.qualityButtonOuter}>
					<BlurView
						intensity={20}
						tint={isDark ? 'dark' : 'light'}
						style={styles.qualityButtonBlur}
					/>
					<View style={styles.qualityButtonContent}>
						<Text style={[styles.qualityText, { color: colors.text }]}>{currentOption.label}</Text>
						<SFSymbol systemName="chevron.down" size={12} color={colors.textMuted} />
					</View>
				</View>
			</TouchableOpacity>

			{/* 音质选择弹窗 - 液态玻璃效果 */}
			<Modal
				visible={visible}
				transparent
				animationType="fade"
				onRequestClose={() => setVisible(false)}
			>
				<TouchableOpacity
					style={styles.modalOverlay}
					activeOpacity={1}
					onPress={() => setVisible(false)}
				>
					<View style={styles.modalWrapper}>
						<BlurView
							intensity={30}
							tint={isDark ? 'dark' : 'light'}
							style={styles.modalBlur}
						/>
						<View style={styles.modalContent}>
							<Text style={[styles.modalTitle, { color: colors.text }]}>选择音质</Text>
							{QUALITY_OPTIONS.map((option) => {
								const isSelected = option.id === currentQuality
								return (
									<TouchableOpacity
										key={option.id}
										style={[
											styles.qualityOption,
											isSelected && { backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' },
										]}
										onPress={() => handleSelect(option.id)}
										activeOpacity={0.7}
									>
										<Text style={[styles.qualityOptionLabel, { color: colors.text }]}>{option.label}</Text>
										{isSelected && <SFSymbol systemName="checkmark" size={18} color={colors.primary} />}
									</TouchableOpacity>
								)
							})}
						</View>
					</View>
				</TouchableOpacity>
			</Modal>
		</>
	)
})

const styles = StyleSheet.create({
	qualityButtonWrapper: {
		alignSelf: 'center',
		width: '60%',
	},
	qualityButtonOuter: {
		borderRadius: 20,
		overflow: 'hidden',
		borderWidth: 0.5,
		borderColor: 'rgba(255,255,255,0.2)',
	},
	qualityButtonBlur: {
		...StyleSheet.absoluteFillObject,
	},
	qualityButtonContent: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 16,
		paddingVertical: 8,
		gap: 6,
	},
	qualityText: {
		fontSize: 13,
		fontWeight: '500',
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.4)',
		justifyContent: 'center',
		alignItems: 'center',
	},
	modalWrapper: {
		width: '80%',
		maxWidth: 320,
		borderRadius: 20,
		overflow: 'hidden',
		borderWidth: 0.5,
		borderColor: 'rgba(255,255,255,0.2)',
	},
	modalBlur: {
		...StyleSheet.absoluteFillObject,
	},
	modalContent: {
		padding: 16,
	},
	modalTitle: {
		fontSize: 16,
		fontWeight: '500',
		marginBottom: 12,
		textAlign: 'center',
	},
	qualityOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 12,
		paddingHorizontal: 12,
		borderRadius: 12,
		marginBottom: 4,
	},
	qualityOptionLabel: {
		fontSize: 15,
		fontWeight: '500',
	},
})
