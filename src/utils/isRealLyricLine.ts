/**
 * 判断是否为真正在唱的歌词行
 * 跳过段落标记、间奏、制作人员、空行等非演唱内容
 */
export function isRealLyricLine(text: string): boolean {
	if (!text || !text.trim()) return false
	const t = text.trim()
	// [Chorus] [Verse] [主歌] 等段落标记
	if (/^\[.*\]$/.test(t)) return false
	// （间奏）（伴奏）（solo）（intro）等括号注释
	if (/^[（(](间奏|伴奏|solo|intro|outro|bridge|hook|verse|chorus|副歌|主歌|桥段|前奏|尾奏|器乐|音乐|melody|rap|ad-lib|adlib)[)）]*$/i.test(t)) return false
	if (/^[（(].*[)）]$/.test(t) && !/[\u4e00-\u9fa5]/.test(t)) return false
	// 制作人员/credits
	if (/^(作词|作曲|编曲|制作|监制|混音|录音|吉他|贝斯|鼓|钢琴|和声|编写|配唱|制作人|出品|发行|OP|SP|演唱|歌手|专辑|词曲|原唱|翻唱|和声编写|录音师|混音师|母带|伴奏|间奏|主唱|歌词|和声演唱|program|programming|弦乐|小号|萨克斯|长笛|小提琴|大提琴|中提琴|鼓组|打击乐|键盘|合成器|和声设计|人声制作|配器|录音棚|录音室|混音室|母带工程|母带处理|发行公司|出品公司|唱片公司|经纪公司|版权所有|版权提供)/i.test(t)) return false
	// Leland Wayne/Brittany... 等英文创作人员名单
	if (/^[A-Z][a-z]+ [A-Za-z]+\/[A-Z]/.test(t) && t.includes('/')) return false
	return true
}
