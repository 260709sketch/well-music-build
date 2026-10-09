// 网易云音乐 weapi 加密
import CryptoJS from 'crypto-js'

// 固定参数
const AES_KEY = '0CoJUm6Qyw8W8jud'
const AES_IV = '0102030405060708'
const RSA_MODULUS = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7'
const RSA_PUB_EXP = '010001'

// 随机字符串生成
function randomString(length) {
	const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
	let result = ''
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length))
	}
	return result
}

// 大数模幂运算 (m^e mod n)
function modPow(base, exp, mod) {
	let result = 1n
	base = base % mod
	while (exp > 0n) {
		if (exp % 2n === 1n) {
			result = (result * base) % mod
		}
		exp = exp / 2n
		base = (base * base) % mod
	}
	return result
}

// RSA 加密
function rsaEncrypt(text, pubExp, modulus) {
	// 反转文本
	const reversed = text.split('').reverse().join('')
	// 转换为十六进制
	let hex = ''
	for (let i = 0; i < reversed.length; i++) {
		hex += reversed.charCodeAt(i).toString(16).padStart(2, '0')
	}
	// 大数模幂
	const m = BigInt('0x' + hex)
	const e = BigInt('0x' + pubExp)
	const n = BigInt('0x' + modulus)
	const result = modPow(m, e, n)
	// 转换为十六进制字符串，补齐256位
	return result.toString(16).padStart(256, '0')
}

/**
 * AES-CBC 加密
 */
function aesEncrypt(text, key) {
	const encrypted = CryptoJS.AES.encrypt(text, CryptoJS.enc.Utf8.parse(key), {
		iv: CryptoJS.enc.Utf8.parse(AES_IV),
		mode: CryptoJS.mode.CBC,
		padding: CryptoJS.pad.Pkcs7,
	})
	return encrypted.toString()
}

/**
 * weapi 加密
 * @param {object} params - 明文参数
 * @returns {{params: string, encSecKey: string}}
 */
export function weapiEncrypt(params) {
	const text = JSON.stringify(params)
	// 生成随机字符串
	const secret = 'kumone2026abcDEF'
	// 第一次 AES 加密
	const firstEnc = aesEncrypt(text, AES_KEY)
	// 第二次 AES 加密
	const secondEnc = aesEncrypt(firstEnc, secret)
	// RSA 加密
	const encSecKey = '38cef2efdbcc1cfd6a44d81620dae5d23091f50ef27e01a1b1bb7e998e0fde2d7ab6002a9e79a3c195f661cbde80e21e6245997b11b54d28407115822f95d4477cc06b5a77de46fab6568410abf1229abef81b4c8588f386149010d190bb0b04f064be330bd877a4d4b99514febbdb4335b10744b13d9f7ee24d314d6e62cdc9'
	return {
		params: secondEnc,
		encSecKey,
	}
}

/**
 * 生成 weapi 格式的请求 body
 */
export function weapiBody(params) {
	const encrypted = weapiEncrypt(params)
	return `params=${encodeURIComponent(encrypted.params)}&encSecKey=${encrypted.encSecKey}`
}

export default { weapiEncrypt, weapiBody, eapiEncrypt, eapiBody, buildEapiHeader, makeNMTID }

/**
 * 生成 NMTID 设备令牌（对齐 apienhanced 的 processCookieObject）：
 * 形如 00O+38位hex。网易对不带 NMTID 的 eapi/web 请求会判定"设备存在安全风险"。
 */
export function makeNMTID() {
	return '00O' + CryptoJS.lib.WordArray.random(19).toString()
}

/**
 * eapi 加密（网易云 EAPI 接口用）
 * @param {string} url - 接口路径，如 /api/song/lyric/v1
 * @param {object} params - 明文参数
 * @returns {string} 加密后的 hex 字符串
 */
export function eapiEncrypt(url, params) {
	const text = JSON.stringify(params)
	const digest = CryptoJS.MD5(`nobody${url}use${text}md5forencrypt`).toString()
	const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`
	const key = CryptoJS.enc.Utf8.parse('e82ckenh8dichen8')
	const encrypted = CryptoJS.AES.encrypt(data, key, {
		mode: CryptoJS.mode.ECB,
		padding: CryptoJS.pad.Pkcs7,
	})
	return encrypted.ciphertext.toString(CryptoJS.enc.Hex).toUpperCase()
}

/**
 * 生成 eapi 格式的请求 body
 */
export function eapiBody(url, params) {
	return `params=${eapiEncrypt(url, params)}`
}

/**
 * 构造 eapi 请求 payload 中的 header 字段（对齐 Kumone）。
 * eapi 接口必须在加密 body 内携带客户端 header，否则服务端静默忽略请求。
 * @param {string} cookie - 登录 cookie 字符串，用于提取 MUSIC_U 和 __csrf
 * @returns {object} header 对象
 */
export function buildEapiHeader(cookie = '') {
	// 对齐 Kumone neteaseClient.eapi 的 header（逐字段照搬）：appver=3.1.17、channel 为空、不带 NMTID，
	// 与官方桌面网页客户端会话特征一致，反馈(weblog)等 eapi 接口才会计入听歌排行/最近播放
	const header = {
		os: 'pc',
		appver: '3.1.17',
		osver: 'Version 14.0 (Build 23A344)',
		deviceId: 'wellmusic',
		requestId: String(Math.floor(Math.random() * 10000000) + 20000000),
		clientSign: '',
		versioncode: '140',
		buildver: String(Math.floor(Date.now() / 1000)),
		resolution: '1920x1080',
		channel: '',
	}
	try {
		const musicU = cookie.match(/MUSIC_U\s*=\s*([^;]+)/)
		if (musicU) header.MUSIC_U = musicU[1].trim()
		const csrf = cookie.match(/__csrf\s*=\s*([^;]+)/)
		if (csrf) header.__csrf = csrf[1].trim()
	} catch (e) {
		// ignore
	}
	return header
}
