import React, { useState, useEffect, useRef } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Image, ActivityIndicator, AppState, ScrollView } from 'react-native'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { sendCaptcha, loginByPhone, generateLoginKey, checkLoginStatus, getQRCodeImage } from '@/helpers/userApi/netease-music-api'
import { showToast } from '@/utils/utils'
import { useAppTheme } from '@/hooks/useAppTheme'

export const NeteaseLoginModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
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

	// 对齐缓存管理弹窗的颜色
	const bgColor = isDark ? '#1c1c1e' : '#fff'
	const textColor = isDark ? '#fff' : '#000'
	const subTextColor = isDark ? '#888' : '#666'
	const cardBg = isDark ? '#2c2c2e' : '#f5f5f5'

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

	/**
	 * 对齐 Kumone：轮询间隔 1.2s，网络错误连续 15 次才放弃，
	 * 前台恢复时可复用已有 unikey 继续轮询。
	 */
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
				// 对齐 Kumone：本地生成二维码（M 级容错），不用第三方服务
				const qrDataUrl = await getQRCodeImage(key)
				if (qrDataUrl) {
					setQrUrl(qrDataUrl)
				}
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
				console.log(`[二维码轮询] code=${code}, message=${res.message || ''}, nickname=${res.nickname || ''}`)
				if (code === 803) {
					stopPolling()
					setQrStatus('success')
					setQrMessage('登录成功！')
					let fullCookie = res.cookie || ''
					const hasMusicU = fullCookie.includes('MUSIC_U=')
					const hasCsrf = fullCookie.includes('__csrf=')
					console.log(`[二维码登录成功] code=803, cookie有MUSIC_U=${hasMusicU}, 有__csrf=${hasCsrf}, cookie长度=${fullCookie.length}`)
					console.log(`[二维码登录成功] cookie前150字: ${fullCookie.substring(0, 150)}`)
					try {
						const userRes = await fetch('https://music.163.com/api/nuser/account/get', {
							credentials: 'omit',
							headers: {
								Cookie: fullCookie,
								'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
								Referer: 'https://music.163.com',
								Accept: 'application/json',
							},
						})
						const userData = await userRes.json()
						console.log(`[二维码登录成功] 获取用户信息 code=${userData.code}, hasProfile=${!!userData.profile}`)
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
						onClose()
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
		if (loginTab === 'qrcode' && visible) {
			startQRLogin(false)
		}
		if (loginTab !== 'qrcode') {
			stopPolling()
		}
		return () => stopPolling()
	}, [loginTab, visible])

	// 前台恢复时复用 unikey 继续轮询
	useEffect(() => {
		const subscription = AppState.addEventListener('change', (nextAppState) => {
			if (nextAppState === 'active' && loginTab === 'qrcode' && visible) {
				if (qrStatus === 'failed' || qrStatus === 'expired') {
					startQRLogin(false, true)
				} else if (unikeyRef.current) {
					startQRLogin(true, true)
				}
			}
		})
		return () => subscription.remove()
	}, [loginTab, visible, qrStatus])

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
			onClose()
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
				onClose()
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
		onClose()
		setTimeout(() => showToast('已退出登录', '', 'success'), 300)
	}

	// 样式 100% 照搬 CacheManagerModal
	const styles = StyleSheet.create({
		overlay: {
			flex: 1,
			justifyContent: 'flex-end',
		},
		backdrop: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: 'transparent',
		},
		modalContainer: {
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			maxHeight: '85%',
			minHeight: '70%',
			paddingBottom: 34,
		},
		handle: {
			width: 40,
			height: 5,
			borderRadius: 3,
			backgroundColor: '#ccc',
			alignSelf: 'center',
			marginTop: 12,
			marginBottom: 8,
		},
		header: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 20,
			paddingVertical: 12,
		},
		title: {
			fontSize: 20,
			fontWeight: '500',
		},
		closeButton: {
			padding: 4,
		},
		content: {
			paddingHorizontal: 20,
		},
		// 登录内容样式
		tabRow: { flexDirection: 'row', marginBottom: 16, borderRadius: 10, overflow: 'hidden', backgroundColor: isDark ? '#3a3a3c' : '#e5e5ea' },
		tab: { flex: 1, paddingVertical: 8, alignItems: 'center' },
		tabActive: { backgroundColor: colors.primary },
		tabText: { fontSize: 14, color: subTextColor, fontWeight: '500' },
		tabTextActive: { color: '#fff' },
		input: {
			borderRadius: 12,
			paddingHorizontal: 14,
			paddingVertical: 12,
			fontSize: 15,
			color: textColor,
			marginBottom: 12,
			backgroundColor: cardBg,
		},
		row: { flexDirection: 'row', gap: 10 },
		btn: {
			backgroundColor: colors.primary, borderRadius: 22, paddingVertical: 12,
			alignItems: 'center', marginTop: 4,
		},
		btnDisabled: { opacity: 0.5 },
		btnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
		loggedContainer: { alignItems: 'center', paddingVertical: 20 },
		avatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 12 },
		nickname: { fontSize: 18, fontWeight: '500', color: textColor, marginBottom: 4 },
		uid: { fontSize: 13, color: subTextColor, marginBottom: 20 },
		logoutBtn: { borderWidth: 1, borderColor: '#ff4444', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 30 },
		logoutText: { color: '#ff4444', fontWeight: '500' },
		qrContainer: { alignItems: 'center', paddingVertical: 4 },
		qrBox: {
			width: 190, height: 190, borderRadius: 16,
			backgroundColor: cardBg, justifyContent: 'center', alignItems: 'center',
			overflow: 'hidden',
		},
		qrImage: { width: 172, height: 172 },
		qrOverlay: {
			...StyleSheet.absoluteFillObject,
			backgroundColor: 'rgba(0,0,0,0.6)',
			justifyContent: 'center', alignItems: 'center',
		},
		qrRefreshBtn: {
			flexDirection: 'row', alignItems: 'center',
			backgroundColor: colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8,
		},
		qrRefreshText: { color: '#fff', fontSize: 14, fontWeight: '500', marginLeft: 6 },
		qrStatusContainer: { marginTop: 14, alignItems: 'center' },
		qrStatusRow: { flexDirection: 'row', alignItems: 'center' },
		qrStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
		qrStatusText: { fontSize: 14, color: textColor },
		qrTip: { fontSize: 12, color: subTextColor, textAlign: 'center', marginTop: 12, paddingHorizontal: 16, lineHeight: 18 },
		smsWarn: {
			flexDirection: 'row', alignItems: 'flex-start', gap: 6,
			backgroundColor: colors.primary + '12', borderRadius: 12,
			paddingHorizontal: 12, paddingVertical: 9, marginBottom: 14,
		},
		smsWarnText: { fontSize: 12, color: colors.primary, flex: 1, lineHeight: 17 },
		phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: cardBg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
		phonePrefix: { fontSize: 15, fontWeight: '600', color: textColor },
		phoneDivider: { width: 1, height: 20, backgroundColor: isDark ? '#48484a' : '#c7c7cc' },
	})

	return (
		<Modal
			visible={visible}
			animationType="slide"
			transparent
			onRequestClose={onClose}
		>
			<View style={styles.overlay}>
				<TouchableOpacity style={styles.backdrop} onPress={onClose} activeOpacity={1} />
				<View style={[styles.modalContainer, { backgroundColor: bgColor }]}>
					{/* 顶部手柄 */}
					<View style={styles.handle} />

					{/* 标题 */}
					<View style={styles.header}>
						<Text style={[styles.title, { color: textColor }]}>登录网易云音乐</Text>
					</View>

					<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
						{isLoggedIn ? (
							<View style={styles.loggedContainer}>
								{avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.primary }]} />}
								<Text style={styles.nickname}>{nickname || '网易云用户'}</Text>
								<Text style={styles.uid}>UID: {userId || '-'}</Text>
								<TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
									<Text style={styles.logoutText}>退出登录</Text>
								</TouchableOpacity>
							</View>
						) : (
							<>
								<View style={styles.tabRow}>
									<TouchableOpacity style={[styles.tab, loginTab === 'qrcode' && styles.tabActive]} onPress={() => setLoginTab('qrcode')}>
										<Text style={[styles.tabText, loginTab === 'qrcode' && styles.tabTextActive]}>扫码登录</Text>
									</TouchableOpacity>
									<TouchableOpacity style={[styles.tab, loginTab === 'phone' && styles.tabActive]} onPress={() => setLoginTab('phone')}>
										<Text style={[styles.tabText, loginTab === 'phone' && styles.tabTextActive]}>手机验证码</Text>
									</TouchableOpacity>
									<TouchableOpacity style={[styles.tab, loginTab === 'cookie' && styles.tabActive]} onPress={() => setLoginTab('cookie')}>
										<Text style={[styles.tabText, loginTab === 'cookie' && styles.tabTextActive]}>Cookie</Text>
									</TouchableOpacity>
								</View>

								{loginTab === 'phone' && (
									<>
										<View style={styles.smsWarn}>
											<SFSymbol systemName="exclamationmark.triangle.fill" size={14} color={colors.primary} />
											<Text style={styles.smsWarnText}>可能被网易云风控拦截而不可用，推荐使用扫码登录</Text>
										</View>
										<View style={styles.phoneRow}>
											<SFSymbol systemName="iphone" size={16} color={subTextColor} />
											<Text style={styles.phonePrefix}>+86</Text>
											<View style={styles.phoneDivider} />
											<TextInput style={{ flex: 1, fontSize: 15, color: textColor, padding: 0 }} placeholder="手机号" placeholderTextColor={subTextColor} keyboardType="phone-pad" value={phone} onChangeText={setPhone} maxLength={11} />
										</View>
										<View style={styles.row}>
											<TextInput style={[styles.input, { flex: 1 }]} placeholder="验证码" placeholderTextColor={subTextColor} keyboardType="number-pad" value={captcha} onChangeText={setCaptcha} maxLength={6} />
											<TouchableOpacity style={[styles.btn, { width: 104, marginTop: 0, marginBottom: 12, paddingVertical: 11 }, (sending || countdown > 0) && styles.btnDisabled]} onPress={handleSendCaptcha} disabled={sending || countdown > 0}>
												<Text style={styles.btnText}>{sending ? '发送中' : countdown > 0 ? `${countdown}s` : '获取验证码'}</Text>
											</TouchableOpacity>
										</View>
										<TouchableOpacity style={[styles.btn, loginLoading && styles.btnDisabled]} onPress={handlePhoneLogin} disabled={loginLoading}>
											{loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>登录</Text>}
										</TouchableOpacity>
									</>
								)}

								{loginTab === 'cookie' && (
									<>
										<TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} placeholder="粘贴网易云Cookie" placeholderTextColor={subTextColor} value={cookieInput} onChangeText={setCookieInput} multiline />
										<TouchableOpacity style={[styles.btn, loginLoading && styles.btnDisabled]} onPress={handleCookieLogin} disabled={loginLoading}>
											{loginLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>登录</Text>}
										</TouchableOpacity>
									</>
								)}

								{loginTab === 'qrcode' && (
									<View style={styles.qrContainer}>
										<View style={styles.qrBox}>
											{qrStatus === 'loading' ? (
												<View style={{ alignItems: 'center' }}>
													<ActivityIndicator size="large" color={colors.primary} />
													<Text style={[styles.qrStatusText, { marginTop: 8, color: subTextColor }]}>{qrMessage}</Text>
												</View>
											) : qrUrl ? (
												<Image source={{ uri: qrUrl }} style={styles.qrImage} resizeMode="contain" />
											) : (
												<SFSymbol systemName="qrcode" size={50} color={subTextColor} />
											)}
											{(qrStatus === 'expired' || qrStatus === 'failed') && (
												<View style={styles.qrOverlay}>
													<TouchableOpacity style={styles.qrRefreshBtn} onPress={() => startQRLogin(false)}>
														<SFSymbol systemName="arrow.clockwise" size={16} color="#fff" />
														<Text style={styles.qrRefreshText}>点击刷新</Text>
													</TouchableOpacity>
												</View>
											)}
										</View>
										<View style={styles.qrStatusContainer}>
											{qrStatus === 'waiting' && (
												<View style={styles.qrStatusRow}>
													<View style={[styles.qrStatusDot, { backgroundColor: colors.primary }]} />
													<Text style={styles.qrStatusText}>{qrMessage}</Text>
												</View>
											)}
											{qrStatus === 'scanned' && (
												<View style={styles.qrStatusRow}>
													<View style={[styles.qrStatusDot, { backgroundColor: '#FFA500' }]} />
													<Text style={styles.qrStatusText}>{qrNickname ? `${qrNickname}，` : ''}{qrMessage}</Text>
												</View>
											)}
											{qrStatus === 'success' && (
												<View style={styles.qrStatusRow}>
													<View style={[styles.qrStatusDot, { backgroundColor: '#30d158' }]} />
													<Text style={styles.qrStatusText}>{qrMessage}</Text>
												</View>
											)}
											{(qrStatus === 'expired' || qrStatus === 'failed' || qrStatus === 'loading') && (
												<Text style={[styles.qrStatusText, { color: subTextColor }]}>{qrMessage}</Text>
											)}
										</View>
										<Text style={styles.qrTip}>只有一台设备？截图二维码，到网易云音乐 App 的扫一扫里选择相册识别，然后回到这里即可</Text>
									</View>
								)}
							</>
						)}
					</ScrollView>
				</View>
			</View>
		</Modal>
	)
}
