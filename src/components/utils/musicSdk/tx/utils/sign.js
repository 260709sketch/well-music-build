import CryptoJS from 'crypto-js'

const PART_1_INDEXES = [23, 14, 6, 36, 16, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

function pickHashByIdx(hash, indexes) {
	return indexes.map((idx) => hash[idx]).join('')
}

function base64Encode(data) {
	return Buffer.from(data).toString('base64').replace(/[\/+=]/g, '')
}

export async function zzcSign(text) {
	const hash = CryptoJS.SHA1(text).toString().toUpperCase()
	const part1 = pickHashByIdx(hash, PART_1_INDEXES)
	const part2 = pickHashByIdx(hash, PART_2_INDEXES)
	const part3 = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
	const b64Part = base64Encode(part3).replace(/[\/+=]/g, '')
	return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}

export const getComm = (overrides = {}) => ({
	ct: '11',
	cv: '14090508',
	v: '14090508',
	tmeAppID: 'qqmusic',
	phonetype: 'EBG-AN10',
	deviceScore: '553.47',
	devicelevel: '50',
	newdevicelevel: '20',
	rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
	os_ver: '12',
	OpenUDID: '0',
	OpenUDID2: '0',
	QIMEI36: '0',
	udid: '0',
	chid: '0',
	aid: '0',
	oaid: '0',
	taid: '0',
	tid: '0',
	wid: '0',
	uid: '0',
	sid: '0',
	modeSwitch: '6',
	teenMode: '0',
	ui_mode: '2',
	nettype: '1020',
	v4ip: '',
	...overrides,
})

export const signRequest = async (data) => {
	const sign = await zzcSign(JSON.stringify(data))
	const response = await fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
		method: 'POST',
		headers: {
			'User-Agent': 'QQMusic 14090508(android 12)',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(data),
	})
	const body = await response.json()
	return { body }
}
