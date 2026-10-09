import { Redirect } from 'expo-router'

export default function Unmatched() {
	// 未匹配路由直接进发现页（避免经 / 再跳 /radio 的双重跳转）
	return <Redirect href="/radio" />
}
