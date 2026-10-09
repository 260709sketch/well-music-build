import React, { useState, useCallback } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native'
import { router } from 'expo-router'
import { musicApiStore } from '@/player/PlayerStore'
import { reloadLxMusicScript } from '@/helpers/userApi/lxMusicSourceAdapter'
import { createMusicApiFromScript } from '@/helpers/userApi/importMusicSource'
import { useThemeColors } from '@/hooks/useAppTheme'
import { ThemeColors } from '@/constants/tokens'

type TestStatus = 'idle' | 'testing' | 'success' | 'fail'

interface SourceTestItem {
  id: string
  name: string
  status: TestStatus
  responseTime: number | null
  errorMsg: string
}

const SourceTestScreen = () => {
  const colors = useThemeColors()
  const styles = createStyles(colors)
  const [items, setItems] = useState<SourceTestItem[]>([])
  const [testingAll, setTestingAll] = useState(false)

  const loadSources = useCallback(() => {
    const apis = musicApiStore.getValue() || []
    setItems(apis.map(api => ({
      id: api.id,
      name: api.name,
      status: 'idle',
      responseTime: null,
      errorMsg: '',
    })))
  }, [])

  React.useEffect(() => {
    loadSources()
  }, [loadSources])

  const testSingle = async (id: string) => {
    const apis = musicApiStore.getValue() || []
    const api = apis.find(a => a.id === id)
    if (!api) return

    setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'testing', responseTime: null, errorMsg: '' } : item))
    const startTime = Date.now()
    try {
      let testApi = api
      if (api.scriptType === 'lxmusic') {
        testApi = await reloadLxMusicScript(api)
      } else if (api.script) {
        testApi = await createMusicApiFromScript(api.script)
      }
      if (typeof testApi.getMusicUrl !== 'function') {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'fail', errorMsg: '无getMusicUrl方法' } : item))
        return
      }

      // 先搜索歌曲，获取 songmid，再获取 URL（QQ音乐等音源需要先搜索才能获取URL）
      let songmid = ''
      if (typeof (testApi as any).searchMusic === 'function') {
        try {
          // 搜索所有平台，不指定 source
          const searchResult = await Promise.race([
            (testApi as any).searchMusic('晴天 周杰伦', '', { requestKey: 'test_search', requestType: 'current', timeoutMs: 8000 }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('搜索超时')), 8000)),
          ])
          // 兼容多种返回格式
          let songList: any[] = []
          if (searchResult && Array.isArray(searchResult.list)) {
            songList = searchResult.list
          } else if (Array.isArray(searchResult)) {
            songList = searchResult
          } else if (searchResult && Array.isArray(searchResult.songs)) {
            songList = searchResult.songs
          }
          if (songList.length > 0) {
            const firstSong = songList[0]
            songmid = firstSong.songmid || firstSong.id || firstSong.musicId || ''
          }
        } catch (e) {
          // 搜索失败就用空 songmid 试试
          console.log('搜索失败，直接尝试获取URL:', e)
        }
      }

      const url = await Promise.race([
        testApi.getMusicUrl('晴天', '周杰伦', songmid, 'flac', { requestKey: 'test', requestType: 'current', timeoutMs: 8000 } as any),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('请求超时')), 8000)),
      ])
      const duration = Date.now() - startTime
      if (url && url !== '') {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'success', responseTime: duration } : item))
      } else {
        setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'fail', responseTime: duration, errorMsg: '返回空URL' } : item))
      }
    } catch (error: any) {
      const duration = Date.now() - startTime
      setItems(prev => prev.map(item => item.id === id ? { ...item, status: 'fail', responseTime: duration, errorMsg: error?.message || '测试失败' } : item))
    }
  }

  const testAll = async () => {
    if (testingAll) return
    setTestingAll(true)
    const apis = musicApiStore.getValue() || []
    for (const api of apis) {
      await testSingle(api.id)
    }
    setTestingAll(false)
  }

  const successCount = items.filter(i => i.status === 'success').length
  const failCount = items.filter(i => i.status === 'fail').length

  const renderItem = ({ item }: { item: SourceTestItem }) => (
    <View style={[styles.item, item.status === 'success' && styles.itemSuccess, item.status === 'fail' && styles.itemFail]}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemName}>{item.name}</Text>
        <View style={styles.itemStatusRow}>
          {item.status === 'success' && (
            <>
              <SFSymbol systemName="checkmark.circle.fill" size={14} color="#30d158" />
              <Text style={[styles.itemStatus, { color: '#30d158' }]}>正常</Text>
              {item.responseTime !== null && <Text style={styles.itemTime}>{item.responseTime}ms</Text>}
            </>
          )}
          {item.status === 'fail' && (
            <>
              <SFSymbol systemName="xmark.circle.fill" size={14} color="#ff453a" />
              <Text style={[styles.itemStatus, { color: '#ff453a' }]} numberOfLines={1}>{item.errorMsg || '失败'}</Text>
              {item.responseTime !== null && <Text style={styles.itemTime}>{item.responseTime}ms</Text>}
            </>
          )}
          {item.status === 'testing' && (
            <>
              <ActivityIndicator size={14} color={colors.text} />
              <Text style={styles.itemStatus}>测试中…</Text>
            </>
          )}
          {item.status === 'idle' && (
            <>
              <SFSymbol systemName="circle" size={14} color={colors.textMuted} />
              <Text style={[styles.itemStatus, { color: colors.textMuted }]}>未测试</Text>
            </>
          )}
        </View>
      </View>
      <TouchableOpacity
        style={[styles.testBtn, item.status === 'testing' && styles.testBtnDisabled]}
        onPress={() => testSingle(item.id)}
        disabled={item.status === 'testing'}
      >
        {item.status === 'testing' ? (
          <ActivityIndicator size={14} color={colors.primary} />
        ) : (
          <SFSymbol systemName="arrow.clockwise" size={16} color={colors.primary} />
        )}
      </TouchableOpacity>
    </View>
  )

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.container}>
        {/* 导航栏 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <SFSymbol systemName="chevron.left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>源测试</Text>
          <TouchableOpacity onPress={testAll} disabled={testingAll} style={[styles.testAllBtn, testingAll && styles.testAllBtnDisabled]}>
            {testingAll ? (
              <ActivityIndicator size={14} color="#fff" />
            ) : (
              <Text style={styles.testAllBtnText}>全部测试</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* 统计卡片 */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{items.length}</Text>
            <Text style={styles.statLabel}>总数</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: '#30d158' }]}>{successCount}</Text>
            <Text style={styles.statLabel}>正常</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, { color: '#ff453a' }]}>{failCount}</Text>
            <Text style={styles.statLabel}>失败</Text>
          </View>
        </View>

        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={items.length === 0 && styles.emptyContainer}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <SFSymbol systemName="music.note.slash" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>暂无音源</Text>
            </View>
          }
          style={styles.list}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        />
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    // 导航栏
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    backBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
    testAllBtn: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      backgroundColor: colors.primary,
      borderRadius: 16,
    },
    testAllBtnDisabled: { opacity: 0.5 },
    testAllBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
    // 统计卡片
    statsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      marginBottom: 16,
      paddingVertical: 16,
      backgroundColor: colors.card,
      borderRadius: 16,
    },
    statItem: { flex: 1, alignItems: 'center' },
    statNum: { fontSize: 22, fontWeight: '700', color: colors.text },
    statLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    statDivider: { width: 1, height: 28, backgroundColor: colors.border },
    // 列表
    list: { flex: 1 },
    emptyContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
    emptyInner: { alignItems: 'center', padding: 40 },
    emptyText: { color: colors.textMuted, fontSize: 15, marginTop: 12 },
    // 音源项卡片
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 14,
      marginBottom: 10,
      backgroundColor: colors.card,
      borderRadius: 14,
    },
    itemSuccess: { backgroundColor: '#30d15810' },
    itemFail: { backgroundColor: '#ff453a10' },
    itemLeft: { flex: 1, marginRight: 12 },
    itemName: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 5 },
    itemStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    itemStatus: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
    itemTime: { fontSize: 12, color: colors.textMuted, marginLeft: 2 },
    // 测试按钮
    testBtn: {
      width: 38,
      height: 38,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      borderRadius: 12,
    },
    testBtnDisabled: { opacity: 0.4 },
  })

export default SourceTestScreen
