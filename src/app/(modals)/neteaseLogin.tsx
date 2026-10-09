import { NeteaseLoginScreen } from '@/components/NeteaseLoginScreen'
import { useRouter } from 'expo-router'
import React from 'react'

const NeteaseLoginModalPage = () => {
	const router = useRouter()

	return (
		<NeteaseLoginScreen
			onClose={() => router.back()}
		/>
	)
}

export default NeteaseLoginModalPage
