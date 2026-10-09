
/**
 * 获取网易云"我喜欢的音乐"收藏列表
 */
export async function getLikedSongList(uid, cookie = '') {
	try {
		const url = `https://music.163.com/weapi/song/like/get?csrf_token=${getCsrfToken(cookie)}`
		const body = weapiBody({ uid: String(uid), offset: 0, limit: 1000 })
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			Referer: 'https://music.163.com/',
			Origin: 'https://music.163.com',
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers['Cookie'] = cookie
		const response = await fetch(url, { method: 'POST', headers, body })
		const data = await response.json()
		if (data.code !== 200 || !data.ids) return []
		return data.ids.map(id => String(id))
	} catch (error) {
		console.error('获取网易云收藏列表失败:', error)
		return []
	}
}

function getCsrfToken(cookie) {
	if (!cookie) return ''
	const m = cookie.match(/__csrf=([^;]+)/)
	return m ? m[1] : ''
}
