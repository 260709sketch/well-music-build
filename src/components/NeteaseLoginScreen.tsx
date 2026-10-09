import React, { useState, useEffect, useRef } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator, AppState, ScrollView } from 'react-native'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { sendCaptcha, loginByPhone, generateLoginKey, checkLoginStatus } from '@/helpers/userApi/netease-music-api'
import { showToast } from '@/utils/utils'

interface NeteaseLoginScreenProps {
	onClose?: () => void
}

// 登录页（对齐 Beans Music LoginView：品牌图标 + 应用名 + 副标题 + 大圆角阴影二维码卡片 + 状态区）
// 登录方式保持原样：扫码登录 / 手机验证码 / Cookie，仅重构视觉层
export const NeteaseLoginScreen = ({ onClose }: NeteaseLoginScreenProps) => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { isLoggedIn, nickname, avatar, userId, setLoginInfo, logout } = useDailyRecommendStore()
	const [phone, setPhone] = useState('')
	const [captcha, setCaptcha] = useState('')
	const [sending, setSending] = useState(false)
	const [countdown, setCountdown] = useState(0)
	const [loginLoading, setLoginLoading] = useState(false)
	const [loginTab, setLoginTab] = useState<'phone' | 'qrcode' | 'cookie'>('qrcode')
	const [cookieInput, setCookieInput] = useState('')

	// 扫码登录状态
	const [qrStatus, setQrStatus] = useState<'loading' | 'waiting' | 'scanned' | 'expired' | 'success' | 'failed'>('loading')
	const [qrMessage, setQrMessage] = useState('正在获取二维码…')
	const [qrNickname, setQrNickname] = useState('')
	const [qrUrl, setQrUrl] = useState('')
	const unikeyRef = useRef<string>('')
	const pollTimerRef = useRef<NodeJS.Timeout | null>(null)
	const consecutiveErrorsRef = useRef(0)
	const isPollingActiveRef = useRef(false)

	const pageBg = isDark ? '#0a0a0c' : '#f2f2f7'
	const cardBg = isDark ? '#1c1c1e' : '#ffffff'
	const textColor = isDark ? '#fff' : '#000'
	const subTextColor = isDark ? '#98989f' : '#6c6c70'
	const inputBg = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(118,118,128,0.12)'
	const segmentBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(118,118,128,0.14)'
	const segmentActive = isDark ? 'rgba(255,255,255,0.22)' : '#ffffff'

	useEffect(() => {
		if (countdown > 0) {
			const t = setTimeout(() => setCountdown(countdown - 1), 1000)
			return () => clearTimeout(t)
		}
	}, [countdown])

	const stopPolling = () => {
		isPollingActiveRef.current = false
		if (pollTimerRef.current) {
			clearTimeout(pollTimerRef.current)
			pollTimerRef.current = null
		}
	}

	const startQRLogin = async (reuseKey = false, immediate = false) => {
		stopPolling()
		let key = reuseKey ? unikeyRef.current : ''

		if (!key) {
			setQrStatus('loading')
			setQrMessage('正在获取二维码…')
			setQrUrl('')
			try {
				key = await generateLoginKey()
				if (!key) {
					setQrStatus('failed')
					setQrMessage('获取二维码失败，请重试')
					return
				}
				unikeyRef.current = key
				const qrContent = `https://music.163.com/login?codekey=${key}`
				const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(qrContent)}`
				setQrUrl(qrImageUrl)
				setQrStatus('waiting')
				setQrMessage('打开网易云音乐 App，扫一扫登录')
			} catch (e) {
				setQrStatus('failed')
				setQrMessage('获取二维码失败，请重试')
				return
			}
		} else {
			setQrStatus('waiting')
			setQrMessage('打开网易云音乐 App，扫一扫登录')
		}

		isPollingActiveRef.current = true
		consecutiveErrorsRef.current = 0

		const poll = async () => {
			if (!isPollingActiveRef.current) return
			try {
				const res = await checkLoginStatus(key)
				consecutiveErrorsRef.current = 0

				if (!res || res.code === undefined || res.code === null) {
					scheduleNext()
					return
				}

				const code = res.code
				if (code === 803) {
					stopPolling()
					setQrStatus('success')
					setQrMessage('登录成功！')
					let fullCookie = res.cookie || ''
					try {
						const userRes = await fetch('https://music.163.com/api/nuser/account/get', {
							headers: {
								Cookie: fullCookie,
								'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
							},
						})
						const userData = await userRes.json()
						if (userData.code === 200 && userData.profile) {
							const profile = userData.profile
							const userIdStr = String(profile.userId || profile.id || '')
							const nicknameStr = profile.nickname || '网易云用户'
							const avatarStr = profile.avatarUrl || profile.img1v1Url || ''
							try {
								const homeRes = await fetch('https://music.163.com/', {
									headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
								})
								const setCookieStr = homeRes.headers.get('set-cookie') || ''
								const csrfMatch = setCookieStr.match(/__csrf=([^;]+)/)
								if (csrfMatch && !fullCookie.includes('__csrf=')) {
									fullCookie = fullCookie ? `${fullCookie}; __csrf=${csrfMatch[1]}` : `__csrf=${csrfMatch[1]}`
								}
							} catch (e) { /* ignore */ }
							if (!fullCookie.includes('os=')) {
								fullCookie = `${fullCookie}; os=pc; appver=3.1.17`
							}
							setLoginInfo(fullCookie, nicknameStr, avatarStr, userIdStr)
						} else {
							const profile = res.profile || {}
							const userIdStr = String(profile.userId || profile.id || res.account?.id || '')
							const nicknameStr = profile.nickname || res.nickname || '网易云用户'
							const avatarStr = profile.avatarUrl || res.avatarUrl || ''
							setLoginInfo(fullCookie, nicknameStr, avatarStr, userIdStr)
						}
					} catch (e) {
						const profile = res.profile || {}
						const userIdStr = String(profile.userId || profile.id || '')
						const nicknameStr = profile.nickname || res.nickname || '网易云用户'
						const avatarStr = profile.avatarUrl || res.avatarUrl || ''
						setLoginInfo(fullCookie, nicknameStr, avatarStr, userIdStr)
					}
					setTimeout(() => {
						onClose?.()
						showToast('登录成功', '', 'success')
					}, 600)
					return
				} else if (code === 802) {
					setQrStatus('scanned')
					setQrNickname(res.nickname || '')
					setQrMessage('已扫码，请在手机上确认登录')
				} else if (code === 801) {
					if (qrStatus !== 'waiting') {
						setQrStatus('waiting')
						setQrMessage('打开网易云音乐 App，扫一扫登录')
					}
				} else if (code === 800) {
					stopPolling()
					setQrStatus('expired')
					setQrMessage('二维码已过期，请点击刷新')
					unikeyRef.current = ''
					return
				}
				scheduleNext()
			} catch (e) {
				consecutiveErrorsRef.current += 1
				if (consecutiveErrorsRef.current >= 15) {
					stopPolling()
					setQrStatus('failed')
					setQrMessage('网络异常，请检查网络后重试')
					return
				}
				scheduleNext()
			}
		}

		const scheduleNext = () => {
			if (!isPollingActiveRef.current) return
			pollTimerRef.current = setTimeout(poll, 1200)
		}

		pollTimerRef.current = immediate ? setTimeout(poll, 0) : setTimeout(poll, 1200)
	}

	useEffect(() => {
		if (loginTab === 'qrcode') {
			startQRLogin(false)
		}
		if (loginTab !== 'qrcode') {
			stopPolling()
		}
		return () => stopPolling()
	}, [loginTab])

	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState) => {
			if (nextAppState === 'active' && loginTab === 'qrcode') {
				if (qrStatus === 'failed' || qrStatus === 'expired') {
					startQRLogin(false, true)
				} else if (unikeyRef.current) {
					startQRLogin(true, true)
				}
			}
		})
		return () => subscription.remove()
	}, [loginTab, qrStatus])

	const handleSendCaptcha = async () => {
		if (!phone || phone.length !== 11) {
			showToast('请输入正确的手机号', '', 'error')
			return
		}
		setSending(true)
		const res = await sendCaptcha(phone)
		setSending(false)
		if (res.success) {
			showToast('验证码已发送', '', 'success')
			setCountdown(30)
		} else {
			showToast(res.data?.message || '发送失败', '', 'error')
		}
	}

	const handlePhoneLogin = async () => {
		if (!phone || !captcha) {
			showToast('请输入手机号和验证码', '', 'error')
			return
		}
		setLoginLoading(true)
		const res = await loginByPhone(phone, captcha)
		setLoginLoading(false)
		if (res.success) {
			const profile = res.data?.profile || res.data?.account || {}
			const userIdStr = profile.userId || profile.id || res.data?.userId || ''
			const nicknameStr = profile.nickname || profile.userName || '网易云用户'
			const avatarStr = profile.avatarUrl || profile.img1v1Url || ''
			let fullCookie = res.cookie
			try {
				const homeRes = await fetch('https://music.163.com/', {
					headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
				})
				const setCookie = homeRes.headers.get('set-cookie') || ''
				const csrfMatch = setCookie.match(/__csrf=([^;]+)/)
				if (csrfMatch && !fullCookie.includes('__csrf=')) {
					fullCookie = fullCookie ? `${fullCookie}; __csrf=${csrfMatch[1]}` : `__csrf=${csrfMatch[1]}`
				}
			} catch (e) { /* ignore */ }
			setLoginInfo(fullCookie, nicknameStr, avatarStr, String(userIdStr))
			onClose?.()
			setTimeout(() => showToast('登录成功', '', 'success'), 300)
		} else {
			showToast(res.message || '登录失败', '', 'error')
		}
	}

	const handleCookieLogin = async () => {
		if (!cookieInput.trim()) {
			showToast('请输入Cookie', '', 'error')
			return
		}
		setLoginLoading(true)
		try {
			let finalCookie = cookieInput.trim()
			const response = await fetch('https://music.163.com/api/nuser/account/get', {
				headers: {
					Cookie: finalCookie,
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
				},
			})
			const data = await response.json()
			if (data.code === 200 && data.profile) {
				try {
					const homeRes = await fetch('https://music.163.com/', {
						headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
					})
					const setCookieStr = homeRes.headers.get('set-cookie') || ''
					const csrfMatch = setCookieStr.match(/__csrf=([^;]+)/)
					if (csrfMatch && !finalCookie.includes('__csrf=')) {
						finalCookie = `${finalCookie}; __csrf=${csrfMatch[1]}`
					}
				} catch (e) { /* ignore */ }
				if (!finalCookie.includes('os=')) {
					finalCookie = `${finalCookie}; os=pc; appver=3.1.17`
				}
				setLoginInfo(finalCookie, data.profile.nickname, data.profile.avatarUrl, String(data.profile.userId))
				onClose?.()
				setTimeout(() => showToast('登录成功', '', 'success'), 300)
			} else {
				showToast('Cookie无效或已过期', '', 'error')
			}
		} catch (e) {
			showToast('验证Cookie失败', '', 'error')
		}
		setLoginLoading(false)
	}

	const handleLogout = () => {
		logout()
		onClose?.()
		setTimeout(() => showToast('已退出登录', '', 'success'), 300)
	}

	// ===== 扫码状态区（Beans 同款 44pt 状态行） =====
	const renderQrStatus = () => {
		if (qrStatus === 'loading') {
			return <Text style={[styles.statusText, { color: subTextColor }]}>{qrMessage}</Text>
		}
		if (qrStatus === 'waiting') {
			return (
				<View style={styles.statusRow}>
					<SFSymbol systemName="qrcode.viewfinder" size={15} color={subTextColor} weight="regular" />
					<Text style={[styles.statusText, { color: subTextColor }]}>{qrMessage}</Text>
				</View>
			)
		}
		if (qrStatus === 'scanned') {
			return (
				<View style={styles.statusRow}>
					<SFSymbol systemName="checkmark.circle" size={15} color={colors.success} weight="regular" />
					<Text style={[styles.statusText, { color: colors.success }]}>{qrNickname ? `${qrNickname}，` : ''}{qrMessage}</Text>
				</View>
			)
		}
		if (qrStatus === 'success') {
			return (
				<View style={styles.statusRow}>
					<SFSymbol systemName="checkmark.seal.fill" size={15} color={colors.success} weight="regular" />
					<Text style={[styles.statusText, { color: colors.success }]}>{qrMessage}</Text>
				</View>
			)
		}
		return (
			<Text style={[styles.statusText, { color: qrStatus === 'failed' ? colors.error : subTextColor }]}>{qrMessage}</Text>
		)
	}

	const renderQrArea = () => (
		<View style={[styles.card, { backgroundColor: cardBg }]}>
			<View style={styles.qrBox}>
				{qrStatus === 'loading' ? (
					<View style={styles.qrLoading}>
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={[styles.qrLoadingText, { color: subTextColor }]}>{qrMessage}</Text>
					</View>
				) : qrUrl ? (
					<Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
				) : (
					<SFSymbol systemName="qrcode" size={54} color={subTextColor} weight="light" />
				)}
				{(qrStatus === 'expired' || qrStatus === 'failed') && (
					<View style={styles.qrOverlay}>
						<SFSymbol systemName="arrow.clockwise.circle.fill" size={34} color="#fff" weight="light" />
						<Text style={styles.qrOverlayText}>{qrStatus === 'expired' ? '二维码已过期' : qrMessage}</Text>
						<TouchableOpacity style={[styles.refreshBtn, { backgroundColor: colors.primary }]} onPress={() => startQRLogin(false)} activeOpacity={0.8}>
							<SFSymbol systemName="arrow.clockwise" size={13} color="#fff" weight="semibold" style={{ marginRight: 5 }} />
							<Text style={styles.refreshBtnText}>刷新</Text>
						</TouchableOpacity>
					</View>
				)}
			</View>
		</View>
	)

	const renderPhoneForm = () => (
		<View style={[styles.card, { backgroundColor: cardBg }]}>
			<View style={styles.formInner}>
				<View style={styles.smsWarn}>
					<SFSymbol systemName="exclamationmark.triangle.fill" size={14} color={colors.primary} weight="regular" />
					<Text style={[styles.smsWarnText, { color: colors.primary }]}>可能被网易云风控拦截而不可用，推荐使用扫码登录</Text>
				</View>
				<View style={[styles.phoneRow, { backgroundColor: inputBg }]}>
					<SFSymbol systemName="iphone" size={16} color={subTextColor} weight="regular" />
					<Text style={[styles.phonePrefix, { color: textColor }]}>+86</Text>
					<View style={[styles.phoneDivider, { backgroundColor: isDark ? '#48484a' : '#c7c7cc' }]} />
					<TextInput style={[styles.inputFlex, { color: textColor }]} placeholder="手机号" placeholderTextColor={subTextColor} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={11} />
				</View>
				<View style={styles.row}>
					<TextInput style={[styles.input, { flex: 1, backgroundColor: inputBg, color: textColor }]} placeholder="验证码" placeholderTextColor={subTextColor} keyboardType="number-pad" value={captcha} onChangeText={setCaptcha} maxLength={6} />
					<TouchableOpacity
						style={[styles.captchaBtn, { backgroundColor: colors.primary }, (sending || countdown > 0) && styles.btnDisabled]}
						onPress={handleSendCaptcha}
						disabled={sending || countdown > 0}
						activeOpacity={0.8}
					>
						<Text style={styles.btnTextSmall}>{sending ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
					</TouchableOpacity>
				</View>
				<TouchableOpacity style={[styles.loginBtn, { backgroundColor: colors.primary }, loginLoading && styles.btnDisabled]} onPress={handlePhoneLogin} disabled={loginLoading} activeOpacity={0.85}>
					{loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>登录</Text>}
				</TouchableOpacity>
			</View>
		</View>
	)

	const renderCookieForm = () => (
		<View style={[styles.card, { backgroundColor: cardBg }]}>
			<View style={styles.formInner}>
				<TextInput
					style={[styles.cookieInput, { backgroundColor: inputBg, color: textColor }]}
					placeholder="粘贴网易云 Cookie（MUSIC_U=...）"
					placeholderTextColor={subTextColor}
					value={cookieInput}
					onChangeText={setCookieInput}
					multiline
					textAlignVertical="top"
				/>
				<TouchableOpacity style={[styles.loginBtn, { backgroundColor: colors.primary }, loginLoading && styles.btnDisabled]} onPress={handleCookieLogin} disabled={loginLoading} activeOpacity={0.85}>
					{loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.loginBtnText}>登录</Text>}
				</TouchableOpacity>
			</View>
		</View>
	)

	const styles = StyleSheet.create({
		container: { flex: 1 },
		handle: {
			width: 40, height: 5, borderRadius: 3,
			backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(120,120,128,0.45)',
			alignSelf: 'center', marginTop: 12, marginBottom: 2,
		},
		scroll: { paddingHorizontal: 24, paddingBottom: 56 },
		// 品牌区
		brand: { alignItems: 'center', marginTop: 10, marginBottom: 28 },
		brandIcon: { marginBottom: 16 },
		brandTitle: { fontSize: 34, fontWeight: '700', letterSpacing: 0.5 },
		brandSubtitle: { fontSize: 14, marginTop: 8 },
		// 方式切换
		segmented: {
			flexDirection: 'row', alignSelf: 'center', borderRadius: 11, padding: 3,
			marginBottom: 20, minWidth: 280,
		},
		segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: 8 },
		segmentText: { fontSize: 13, fontWeight: '500' },
		// 大圆角卡片
		card: {
			borderRadius: 30,
			overflow: 'hidden',
			shadowColor: '#000',
			shadowOpacity: 0.2,
			shadowRadius: 20,
			shadowOffset: { width: 0, height: 10 },
			elevation: 8,
		},
		// 扫码区
		qrBox: { padding: 24, alignItems: 'center', justifyContent: 'center' },
		qrImage: { width: 214, height: 214 },
		qrLoading: { width: 214, height: 214, alignItems: 'center', justifyContent: 'center' },
		qrLoadingText: { fontSize: 13, marginTop: 12 },
		qrOverlay: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: 'rgba(0,0,0,0.55)',
			alignItems: 'center', justifyContent: 'center',
			padding: 16,
		},
		qrOverlayText: { color: '#fff', fontSize: 13, marginTop: 8, marginBottom: 14, textAlign: 'center' },
		refreshBtn: {
			flexDirection: 'row', alignItems: 'center',
			paddingHorizontal: 18, paddingVertical: 9, borderRadius: 18,
		},
		refreshBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
		// 状态区
		statusWrap: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
		statusRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
		statusText: { fontSize: 13, textAlign: 'center' },
		qrTip: { fontSize: 12, color: subTextColor, textAlign: 'center', marginTop: 14, paddingHorizontal: 16, lineHeight: 18 },
		// 表单
		formInner: { padding: 24 },
		smsWarn: {
			flexDirection: 'row', alignItems: 'flex-start', gap: 6,
			backgroundColor: colors.primary + '12', borderRadius: 12,
			paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
		},
		smsWarnText: { fontSize: 12, flex: 1, lineHeight: 17 },
		phoneRow: {
			flexDirection: 'row', alignItems: 'center', gap: 10,
			borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12,
		},
		phonePrefix: { fontSize: 15, fontWeight: '600' },
		phoneDivider: { width: 1, height: 20 },
		inputFlex: { flex: 1, fontSize: 15, padding: 0 },
		row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
		input: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15 },
		captchaBtn: {
			borderRadius: 14, paddingHorizontal: 16, justifyContent: 'center',
			alignItems: 'center', minWidth: 110,
		},
		btnTextSmall: { color: '#fff', fontSize: 13, fontWeight: '600' },
		loginBtn: {
			borderRadius: 24, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
			marginTop: 4, minHeight: 48,
		},
		loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
		cookieInput: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 13, fontSize: 14, height: 96 },
		btnDisabled: { opacity: 0.5 },
		// 已登录
		loggedWrap: { alignItems: 'center', paddingVertical: 40 },
		avatar: { width: 84, height: 84, borderRadius: 42, marginBottom: 14 },
		nickname: { fontSize: 20, fontWeight: '600', marginBottom: 4 },
		uid: { fontSize: 13, marginBottom: 26 },
		logoutBtn: {
			borderWidth: 1, borderColor: colors.error, borderRadius: 22,
			paddingVertical: 10, paddingHorizontal: 40, alignItems: 'center',
		},
		logoutText: { color: colors.error, fontSize: 14, fontWeight: '600' },
	})

	return (
		<View style={[styles.container, { backgroundColor: pageBg }]}>
			{/* 顶部手柄 */}
			<View style={styles.handle} />

			<ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
				{isLoggedIn ? (
					<View style={styles.loggedWrap}>
						{avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }]}><SFSymbol systemName="person.fill" size={38} color="#fff" weight="regular" /></View>}
						<Text style={[styles.nickname, { color: textColor }]}>{nickname || '网易云用户'}</Text>
						<Text style={[styles.uid, { color: subTextColor }]}>UID: {userId || '-'}</Text>
						<TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
							<Text style={styles.logoutText}>退出登录</Text>
						</TouchableOpacity>
					</View>
				) : (
					<>
						{/* 品牌区（对齐 Beans LoginView） */}
						<View style={styles.brand}>
							<View style={styles.brandIcon}>
								<SFSymbol systemName="beats.headphones" size={54} color={colors.primary} weight="light" />
							</View>
							<Text style={[styles.brandTitle, { color: textColor }]}>WellMusic</Text>
							<Text style={[styles.brandSubtitle, { color: subTextColor }]}>登录网易云音乐，同步你的歌单</Text>
						</View>

						{/* 登录方式切换 */}
						<View style={[styles.segmented, { backgroundColor: segmentBg }]}>
							{([['qrcode', '扫码登录'], ['phone', '手机验证码'], ['cookie', 'Cookie']] as const).map(([tab, label]) => {
								const active = loginTab === tab
								return (
									<TouchableOpacity
										key={tab}
										activeOpacity={0.75}
										onPress={() => setLoginTab(tab)}
										style={[styles.segment, active && { backgroundColor: segmentActive, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }]}
									>
										<Text style={[styles.segmentText, { color: active ? textColor : subTextColor, fontWeight: active ? '600' : '400' }]}>{label}</Text>
									</TouchableOpacity>
								)
							})}
						</View>

						{/* 内容卡片 */}
						{loginTab === 'qrcode' && renderQrArea()}
						{loginTab === 'phone' && renderPhoneForm()}
						{loginTab === 'cookie' && renderCookieForm()}

						{/* 状态区（仅扫码） */}
						{loginTab === 'qrcode' && (
							<View style={styles.statusWrap}>
								{renderQrStatus()}
							</View>
						)}

						{/* 提示 */}
						{loginTab === 'qrcode' && (
							<Text style={styles.qrTip}>只有一台设备？截图二维码，到网易云音乐 App 的扫一扫里选择相册识别，然后回到这里即可</Text>
						)}
					</>
				)}
			</ScrollView>
		</View>
	)
}
