import { View, Text, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native'
import SFSymbol from '@/components/SFSymbol'
import { useRouter } from 'expo-router'
import { useThemeColors } from '@/hooks/useAppTheme'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function DonateScreen() {
	const router = useRouter()
	const colors = useThemeColors()
	const { bottom } = useSafeAreaInsets()

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
			{/* 顶部栏 */}
			<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
				<TouchableOpacity onPress={() => router.back()} style={{ width: 40, height: 40, justifyContent: 'center', alignItems: 'center' }}>
					<SFSymbol systemName="chevron.left" size={24} color={colors.text} />
				</TouchableOpacity>
				<Text style={{ fontSize: 17, fontWeight: '500', color: colors.text }}>打赏作者</Text>
				<View style={{ width: 40 }} />
			</View>

			<ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: bottom + 40 }}>
				{/* 标题区 */}
				<View style={{ alignItems: 'center', paddingVertical: 24 }}>
					<SFSymbol systemName="heart" size={56} color="#ff6b6b" />
					<Text style={{ fontSize: 22, fontWeight: '500', color: colors.text, marginTop: 16 }}>
						打赏作者
					</Text>
					<Text style={{ fontSize: 14, color: colors.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
						如果 Well Music 对你有帮助，欢迎请作者喝杯咖啡
					</Text>
				</View>

				{/* 内容卡片 */}
				<View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 24, alignItems: 'center', marginVertical: 16 }}>
					<SFSymbol systemName="questionmark.circle" size={40} color={colors.textMuted} />
					<Text style={{ fontSize: 16, color: colors.text, marginTop: 12, fontWeight: '500' }}>
						打赏功能开发中
					</Text>
					<Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 6, textAlign: 'center' }}>
						后续会添加微信、支付宝等打赏方式
					</Text>
				</View>
			</ScrollView>
		</SafeAreaView>
	)
}
