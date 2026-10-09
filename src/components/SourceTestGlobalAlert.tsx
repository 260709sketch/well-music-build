import { useEffect, useRef } from 'react'
import { Alert } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import { useSourceTestStore, type TestReport } from '@/store/sourceTestStore'

/**
 * 挂在根布局，源测试（全部 / 单个）在后台跑完后，无论用户当前停留在哪个页面，
 * 都弹出完成提示：可「关闭」或「查看结果」（自动跳回音源中心的源测试 Tab）。
 */
export default function SourceTestGlobalAlert() {
  const report = useSourceTestStore((s) => s.lastReport)
  const pathname = usePathname()
  const router = useRouter()
  const shownIdRef = useRef(0)

  useEffect(() => {
    if (!report || report.id === shownIdRef.current) return
    shownIdRef.current = report.id
    const store = useSourceTestStore.getState()

    const title = report.mode === 'all' ? '源测试完成' : '音源测试完成'
    const message =
      report.mode === 'all'
        ? `成功 ${report.ok} 个 · 失败 ${report.fail} 个 · 总耗时 ${report.elapsed}s`
        : report.success
          ? `「${report.sourceName}」可用${
              report.bestPlatform ? ` · 最佳音质 ${report.bestPlatform} ${report.maxLabel || ''}` : ''
            }`
          : `「${report.sourceName}」所有平台均无可用音质`

    const gotoResult = () => {
      store.consumeReport()
      store.requestGotoTest()
      if (!pathname.includes('sourceCenter')) {
        router.push({ pathname: '/(modals)/sourceCenter', params: { tab: 'test' } } as any)
      }
    }

    Alert.alert(title, message, [
      { text: '关闭', style: 'cancel', onPress: () => store.consumeReport() },
      { text: '查看结果', onPress: gotoResult },
    ])
  }, [report, pathname])

  return null
}
