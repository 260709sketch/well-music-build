import { useEffect, useRef } from 'react'
import TrackPlayer, { Event, usePlaybackState, useProgress } from 'react-native-track-player'
import PersistStatus from '@/store/PersistStatus'

/**
 * 交叉淡入淡出 Hook
 * 上一首声音渐弱，下一首声音渐强，交叉过渡
 * 使用 react-native-track-player 模拟 Apple Music 风格的交叉淡入淡出
 */
export const useCrossfade = () => {
	const { position, duration } = useProgress(50)
	const playbackState = usePlaybackState()
	const fadeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
	const isFadingOutRef = useRef(false)
	const isFadingInRef = useRef(false)
	const lastTrackIdRef = useRef<string | number | null>(null)
	const targetVolumeRef = useRef(1)
	const hasStartedFadeOutRef = useRef(false)

	const clearFade = () => {
		if (fadeIntervalRef.current) {
			clearInterval(fadeIntervalRef.current)
			fadeIntervalRef.current = null
		}
	}

	const fadeOut = (durationSec: number) => {
		if (isFadingOutRef.current || isFadingInRef.current) return
		isFadingOutRef.current = true
		clearFade()

		const steps = Math.max(30, Math.floor(durationSec * 50))
		let currentStep = 0

		fadeIntervalRef.current = setInterval(async () => {
			currentStep++
			const progress = Math.min(1, currentStep / steps)
			const easedProgress = 1 - Math.pow(1 - progress, 2)
			const newVolume = Math.max(0, 1 - easedProgress)
			try {
				await TrackPlayer.setVolume(newVolume)
			} catch (e) {
				// ignore
			}

			if (currentStep >= steps) {
				clearFade()
				isFadingOutRef.current = false
			}
		}, 20)
	}

	const fadeIn = (durationSec: number) => {
		if (isFadingInRef.current) return
		isFadingInRef.current = true
		clearFade()

		const targetVolume = targetVolumeRef.current
		const steps = Math.max(30, Math.floor(durationSec * 50))
		let currentStep = 0

		fadeIntervalRef.current = setInterval(async () => {
			currentStep++
			const progress = Math.min(1, currentStep / steps)
			const easedProgress = 1 - Math.pow(1 - progress, 2)
			const newVolume = Math.min(targetVolume, easedProgress)
			try {
				await TrackPlayer.setVolume(newVolume)
			} catch (e) {
				// ignore
			}

			if (currentStep >= steps) {
				clearFade()
				isFadingInRef.current = false
				try {
					await TrackPlayer.setVolume(targetVolume)
				} catch (e) {
					// ignore
				}
			}
		}, 20)
	}

	useEffect(() => {
		const subscription = TrackPlayer.addEventListener(
			Event.PlaybackTrackChanged,
			async (event: any) => {
				const enabled = PersistStatus.get('music.crossfadeEnabled') ?? false
				const nextTrackId = event.nextTrack ?? event.track

				if (nextTrackId === undefined || nextTrackId === null) return

				hasStartedFadeOutRef.current = false
				isFadingOutRef.current = false

				if (!enabled) {
					try {
						await TrackPlayer.setVolume(targetVolumeRef.current)
					} catch (e) {
						// ignore
					}
					return
				}

				if (nextTrackId !== lastTrackIdRef.current) {
					lastTrackIdRef.current = nextTrackId
					clearFade()

					try {
						const currentVolume = await TrackPlayer.getVolume()
						if (currentVolume > 0.01) {
							targetVolumeRef.current = currentVolume
						}
					} catch (e) {
						// ignore
					}

					const crossfadeDuration = PersistStatus.get('music.crossfadeDuration') ?? 3

					try {
						await TrackPlayer.setVolume(0)
					} catch (e) {
						// ignore
					}

					setTimeout(() => {
						fadeIn(crossfadeDuration)
					}, 100)
				}
			},
		)

		return () => {
			subscription.remove()
		}
	}, [])

	useEffect(() => {
		const enabled = PersistStatus.get('music.crossfadeEnabled') ?? false
		if (!enabled) return
		if (playbackState.state !== 'playing') return

		const crossfadeDuration = PersistStatus.get('music.crossfadeDuration') ?? 3
		if (duration <= 0 || position <= 0) return

		const remaining = duration - position

		if (
			remaining <= crossfadeDuration &&
			remaining > 0.3 &&
			!isFadingOutRef.current &&
			!isFadingInRef.current &&
			!hasStartedFadeOutRef.current
		) {
			hasStartedFadeOutRef.current = true
			fadeOut(Math.min(crossfadeDuration, remaining))
		}
	}, [position, duration, playbackState.state])

	useEffect(() => {
		return () => {
			clearFade()
		}
	}, [])

	return null
}

export default useCrossfade
