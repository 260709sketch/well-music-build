/**
 * 逐字（卡拉OK）歌词行 —— 共享组件（歌词页 / AM风格 / AM风格V2 通用）
 *
 * 手感对齐 kumone / Apple Music 的标准卡拉OK扫光：
 * - 统一“逐字符”点亮：把每个词（YRC/QRC token）按字符数均分该词的演唱时长，
 *   中文一个字、英文单词拆成一个个字母，各自在自己的时间段内把透明度从
 *   0.28 线性扫到 1，光带平滑扫过整句，中英文手感完全一致（英文不再是整词
 *   一起缓慢淡入）；
 * - 只做透明度、不做缩放弹跳，干净顺滑不抖动；
 * - 空格也作为字符占位（同样分摊时间），单词间距与自动换行和原文完全一致，
 *   不会丢字、不会把长句压成一行；
 * - 进度用 rAF 每帧直接读取播放器“真实位置”（myTrackPlayer.getProgress），
 *   seek / 切歌 / 换源 / 缓冲后都以真实位置为准，不做墙钟外推，逐字与声音
 *   严格同步、不会漂移；
 * - 外层 Text 宽度 100% + flexWrap 换行（配合父容器的确定宽度）。
 */
import React, { memo, useEffect, useMemo, useRef } from 'react'
import { Animated, Text } from 'react-native'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import type { WordToken } from '@/helpers/userApi/wordLyric'

// 未唱到字符的基准亮度（kumone 取 0.28，Apple Music 同款偏暗底色）
const UNSUNG_OPACITY = 0.28

interface KaraokeCharProps {
	text: string
	start: number
	end: number
	color: string
	fontSize: number
	fontWeight: string
	lineHeight: number
	prog: Animated.Value
}

const KaraokeChar = memo(function KaraokeChar({
	text,
	start,
	end,
	color,
	fontSize,
	fontWeight,
	lineHeight,
	prog,
}: KaraokeCharProps) {
	const opacity = prog.interpolate({
		inputRange: [start, end],
		outputRange: [UNSUNG_OPACITY, 1],
		extrapolate: 'clamp',
	})
	return (
		<Animated.Text
			style={{
				color,
				fontSize,
				lineHeight,
				fontWeight,
				opacity,
			}}
		>
			{text}
		</Animated.Text>
	)
})

interface CharUnit {
	key: string
	text: string
	start: number
	end: number
}

/**
 * 把词级 token 展开成字符级单元（中文逐字、英文逐字母）。
 * 与 kumone alphas(for:words:at:) 完全一致：
 *   per = word.duration / chars.count（含空格一起分摊）
 *   第 i 个字符 charStart = word.start + per * i
 * Array.from 按码点拆分，避免代理对字符被切坏。
 */
function expandToChars(words: WordToken[]): CharUnit[] {
	const units: CharUnit[] = []
	let ord = 0
	for (let wi = 0; wi < words.length; wi++) {
		const w = words[wi]
		const raw = w.text ?? ''
		const chars = Array.from(raw)
		if (chars.length === 0) continue
		const duration = Math.max(0, w.end - w.start)
		const per = duration / chars.length
		for (let ci = 0; ci < chars.length; ci++) {
			const charStart = w.start + per * ci
			const charEnd = per > 0 ? charStart + per : charStart + 0.001
			units.push({
				key: `${wi}-${ord++}`,
				text: chars[ci],
				start: charStart,
				end: charEnd,
			})
		}
	}
	return units
}

export interface KaraokeLineProps {
	words: WordToken[]
	fontSize: number
	color: string
	align?: 'left' | 'center' | 'right'
	fontWeight?: string
	lineHeight?: number
	marginVertical?: number
	paddingHorizontal?: number
	index?: number
	onLayout?: (index: number, height: number) => void
	wrapperStyle?: any
	/** 外部统一播放时钟（Animated.Value，已含歌词延迟）；传入后行内不再自行轮询，保证“当前行切换”和“逐字扫光”同源同帧、不会各跑各的 */
	clock?: Animated.Value
}

function KaraokeLineComponent({
	words,
	fontSize,
	color,
	align = 'center',
	fontWeight = '600',
	lineHeight,
	marginVertical,
	paddingHorizontal,
	index,
	onLayout,
	wrapperStyle,
	clock,
}: KaraokeLineProps) {
	const lh = lineHeight ?? Math.round(fontSize * 1.45)
	// 优先用外部统一时钟（与“当前行切换”同源同帧、已含歌词延迟）；否则自建时钟逐帧直读
	const internalProg = useRef(new Animated.Value(0)).current
	const prog = clock ?? internalProg

	// 词 -> 字符（中文逐字 / 英文逐字母），仅在 words 引用变化时重算
	const units = useMemo(() => expandToChars(Array.isArray(words) ? words : []), [words])

	// 仅在没有外部时钟时，行内自建 rAF 直读播放器真实位置（AM/独立歌词页路径）
	useEffect(() => {
		if (clock) return
		let raf = 0
		let alive = true
		const tick = async () => {
			if (!alive) return
			try {
				const p = await myTrackPlayer.getProgress()
				if (alive && p && typeof p.position === 'number') {
					internalProg.setValue(p.position)
				}
			} catch {
				// 读取失败保持上一帧
			}
			if (alive) raf = requestAnimationFrame(tick)
		}
		raf = requestAnimationFrame(tick)
		return () => {
			alive = false
			cancelAnimationFrame(raf)
		}
	}, [clock, internalProg])

	return (
		<Text
			onLayout={({ nativeEvent }) => {
				if (index !== undefined) onLayout?.(index, nativeEvent.layout.height)
			}}
			style={[
				{
					width: '100%',
					textAlign: align,
					color,
					fontSize,
					lineHeight: lh,
					fontWeight,
					marginVertical: marginVertical ?? 0,
					paddingHorizontal: paddingHorizontal ?? 0,
					flexWrap: 'wrap',
				},
				wrapperStyle,
			]}
		>
			{units.map((u) => (
				<KaraokeChar
					key={u.key}
					text={u.text}
					start={u.start}
					end={u.end}
					color={color}
					fontSize={fontSize}
					fontWeight={fontWeight}
					lineHeight={lh}
					prog={prog}
				/>
			))}
		</Text>
	)
}

export default memo(
	KaraokeLineComponent,
	(prev, curr) => prev.words === curr.words && prev.fontSize === curr.fontSize,
)
