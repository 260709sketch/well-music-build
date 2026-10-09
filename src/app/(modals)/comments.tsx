import { CommentsScreen } from '@/components/CommentsScreen'
import { useCommentModalStore } from '@/store/commentModalStore'
import { useRouter } from 'expo-router'
import React, { useEffect } from 'react'

const CommentsModalPage = () => {
	const router = useRouter()
	const { params, clearParams } = useCommentModalStore()

	useEffect(() => {
		if (!params) {
			router.back()
		}
	}, [params, router])

	if (!params) return null

	return (
		<CommentsScreen
			songId={params.songId}
			songTitle={params.songTitle}
			songArtist={params.songArtist}
			songCover={params.songCover}
			platform={params.platform}
			onClose={() => {
				clearParams()
				router.back()
			}}
		/>
	)
}

export default CommentsModalPage
