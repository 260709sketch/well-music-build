import React, { useEffect, useRef, useState } from 'react'
import {
	Animated,
	Dimensions,
	Modal,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useThemeColors } from '@/hooks/useAppTheme'

export interface CustomAlertButton {
	text: string
	onPress?: (inputText?: string) => void
	style?: 'default' | 'cancel' | 'destructive'
}

export interface CustomAlertOptions {
	title: string
	message?: string
	buttons?: CustomAlertButton[]
	// 输入框模式（prompt）
	isPrompt?: boolean
	placeholder?: string
	defaultValue?: string
	keyboardType?: 'default' | 'number-pad' | 'numeric' | 'email-address'
}

interface CustomAlertProps {
	visible: boolean
	options: CustomAlertOptions | null
	onClose: () => void
}

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const CustomAlert: React.FC<CustomAlertProps> = ({ visible, options, onClose }) => {
	const colors = useThemeColors()
	const fadeAnim = useRef(new Animated.Value(0)).current
	const slideAnim = useRef(new Animated.Value(0)).current
	const [isShown, setIsShown] = useState(false)
	const [inputText, setInputText] = useState('')

	// 显示时重置输入框
	useEffect(() => {
		if (visible) {
			setInputText(options?.defaultValue || '')
		}
	}, [visible, options?.defaultValue])

	useEffect(() => {
		if (visible) {
			setIsShown(true)
			Animated.parallel([
				Animated.timing(fadeAnim, {
					toValue: 1,
					duration: 200,
					useNativeDriver: true,
				}),
				Animated.timing(slideAnim, {
					toValue: 1,
					duration: 200,
					useNativeDriver: true,
				}),
			]).start()
		} else if (isShown) {
			Animated.parallel([
				Animated.timing(fadeAnim, {
					toValue: 0,
					duration: 180,
					useNativeDriver: true,
				}),
				Animated.timing(slideAnim, {
					toValue: 0,
					duration: 180,
					useNativeDriver: true,
				}),
			]).start(() => {
				setIsShown(false)
			})
		}
	}, [visible, fadeAnim, slideAnim, isShown])

	if (!isShown || !options) return null

	const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] })

	const buttons = options.buttons && options.buttons.length > 0
		? options.buttons
		: [{ text: '确定', style: 'default' as const }]

	const handleButtonPress = (btn: CustomAlertButton) => {
		// 先执行关闭动画，再执行回调
		Animated.parallel([
			Animated.timing(fadeAnim, {
				toValue: 0,
				duration: 160,
				useNativeDriver: true,
			}),
			Animated.timing(slideAnim, {
				toValue: 0,
				duration: 160,
				useNativeDriver: true,
			}),
		]).start(() => {
			onClose()
			btn.onPress?.(inputText)
		})
	}

	return (
		<Modal transparent visible={isShown} onRequestClose={onClose}>
			<Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
				<BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
				<View style={styles.overlayColor} />
				<Animated.View
					style={[
						styles.alertBox,
						{
							opacity: fadeAnim,
							transform: [{ translateY }],
							backgroundColor: colors.overlayStrong,
							borderColor: colors.border,
						},
					]}
				>
					<Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
						{options.title}
					</Text>
					{options.message ? (
						<Text style={[styles.message, { color: colors.text + 'CC' }]}>
							{options.message}
						</Text>
					) : null}
					{options.isPrompt && (
						<TextInput
							style={[styles.input, {
								color: colors.text,
								borderColor: colors.border,
								backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
							}]}
							value={inputText}
							onChangeText={setInputText}
							placeholder={options.placeholder || ''}
							placeholderTextColor={colors.text + '55'}
							keyboardType={options.keyboardType || 'default'}
							autoFocus
						/>
					)}
					<View style={styles.buttonContainer}>
						{buttons.map((btn, index) => {
							const isLast = index === buttons.length - 1
							const btnColor =
								btn.style === 'destructive'
									? '#FF3B30'
									: btn.style === 'cancel'
										? colors.text + '99'
										: '#E53935'
							return (
								<React.Fragment key={index}>
									{index > 0 && <View style={[styles.buttonDivider, { backgroundColor: colors.border }]} />}
									<TouchableOpacity
										style={[styles.button, !isLast && { borderRightWidth: 0 }]}
										onPress={() => handleButtonPress(btn)}
										activeOpacity={0.6}
									>
										<Text style={[styles.buttonText, { color: btnColor }]}>{btn.text}</Text>
									</TouchableOpacity>
								</React.Fragment>
							)
						})}
					</View>
				</Animated.View>
			</Animated.View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	overlayColor: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.35)',
	},
	alertBox: {
		width: SCREEN_WIDTH * 0.66,
		borderRadius: 14,
		borderWidth: StyleSheet.hairlineWidth,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 6 },
		shadowOpacity: 0.22,
		shadowRadius: 18,
		elevation: 10,
	},
	title: {
		fontSize: 16,
		fontWeight: '500',
		textAlign: 'center',
		marginTop: 18,
		marginHorizontal: 18,
	},
	message: {
		fontSize: 13,
		textAlign: 'center',
		marginTop: 6,
		marginHorizontal: 18,
		marginBottom: 14,
		lineHeight: 19,
	},
	input: {
		height: 38,
		borderWidth: StyleSheet.hairlineWidth,
		borderRadius: 8,
		paddingHorizontal: 12,
		fontSize: 14,
		marginHorizontal: 18,
		marginBottom: 14,
	},
	buttonContainer: {
		flexDirection: 'row',
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: 'rgba(255,255,255,0.1)',
	},
	button: {
		flex: 1,
		paddingVertical: 12,
		justifyContent: 'center',
		alignItems: 'center',
	},
	buttonDivider: {
		width: StyleSheet.hairlineWidth,
	},
	buttonText: {
		fontSize: 15,
		fontWeight: '500',
		textAlign: 'center',
	},
})

export default CustomAlert
