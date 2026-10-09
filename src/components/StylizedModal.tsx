import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleSheet } from 'react-native'
import { useThemeColors } from '@/hooks/useAppTheme'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 风格标签分类
export const STYLIZED_CATEGORIES = {
  '曲风': {
    categoryId: 1000,
    tags: {
      'hiphop说唱': 10005, '电音': 10004, '民谣': 10010, '华语流行': 10001,
      '轻音乐': 10017, '国风': 10016, '欧美流行': 10002, 'R&B': 10013,
      '二次元': 10015, 'DJ慢摇': 10018, '韩系流行': 10019, '日系流行': 10020,
      '摇滚': 10021, '金属': 10022, '爵士': 10008, '古典': 10009,
      '雷鬼': 10023, '蓝调': 10024, '乡村': 10011, '新世纪': 10007, '独立': 10012
    }
  },
  '语种': {
    categoryId: 2000,
    tags: {
      '华语': 20001, '英语': 20002, '日语': 20003, '韩语': 20004,
      '粤语': 20005, '纯音乐': 20006, '西班牙语': 20007, '俄语': 20008,
      '法语': 20009, '泰语': 20010, '闽南语': 20011
    }
  },
  '情感': {
    categoryId: 3000,
    tags: {
      '伤感': 30001, '放松': 30002, '抒情': 30008, '欢快': 30004,
      '浪漫': 30005, '兴奋': 30009, '思念': 30010, '治愈': 30011
    }
  },
  '主题': {
    categoryId: 4000,
    tags: {
      '偶像': 40001, '草原': 40002, '成熟': 40003, '慢摇': 40004
    }
  },
  '场景': {
    categoryId: 5000,
    tags: {
      '学习': 50001, '助眠': 50002, '运动': 50003, 'KTV': 50004,
      '咖啡厅': 50005, '夜店': 50006, '微醺': 50007
    }
  }
}

const STORAGE_KEY = 'stylized_rec_settings'

export const loadStylizedSelection = async () => {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

export const saveStylizedSelection = async (data) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.error('保存风格化设置失败:', e)
  }
}

interface StylizedModalProps {
  visible: boolean
  onClose: () => void
  onConfirm: (selection: { categoryId: number; tagIds: number[] }) => void
}

export const StylizedModal = ({ visible, onClose, onConfirm }: StylizedModalProps) => {
  const colors = useThemeColors()
  const [selectedCategory, setSelectedCategory] = useState('曲风')
  const [selectedTags, setSelectedTags] = useState<number[]>([])

  useEffect(() => {
    if (visible) {
      loadStylizedSelection().then((data) => {
        if (data && data.categoryId && data.tagIds) {
          const catName = Object.keys(STYLIZED_CATEGORIES).find(
            (k) => STYLIZED_CATEGORIES[k].categoryId === data.categoryId
          )
          if (catName) {
            setSelectedCategory(catName)
            setSelectedTags(data.tagIds || [])
            return
          }
        }
        setSelectedCategory('曲风')
        setSelectedTags([])
      })
    }
  }, [visible])

  const handleSelectCategory = (name: string) => {
    setSelectedCategory(name)
    setSelectedTags([])
  }

  const handleSelectTag = (tagId: number) => {
    const isEmotion = selectedCategory === '情感'
    if (selectedTags.includes(tagId)) {
      setSelectedTags((prev) => prev.filter((id) => id !== tagId))
    } else {
      if (isEmotion) {
        setSelectedTags([tagId])
      } else {
        if (selectedTags.length >= 5) return
        setSelectedTags((prev) => [...prev, tagId])
      }
    }
  }

  const handleConfirm = () => {
    if (selectedTags.length === 0) return
    const cat = STYLIZED_CATEGORIES[selectedCategory]
    const selection = { categoryId: cat.categoryId, tagIds: selectedTags }
    saveStylizedSelection(selection).then(() => {
      onConfirm(selection)
    })
  }

  const currentTags = STYLIZED_CATEGORIES[selectedCategory].tags

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={styles.overlay}>
        <TouchableOpacity activeOpacity={1} style={[styles.container, { backgroundColor: colors.surface || '#1c1c1e' }]}>
          <View style={[styles.header, { borderBottomColor: colors.border || '#333' }]}>
            <Text style={[styles.headerTitle, { color: colors.text || '#fff' }]}>选择风格标签</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: colors.textMuted || '#888' }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={[styles.categoryList, { borderRightColor: colors.border || '#333' }]}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {Object.keys(STYLIZED_CATEGORIES).map((name) => {
                  const isSelected = selectedCategory === name
                  return (
                    <TouchableOpacity
                      key={name}
                      style={[styles.categoryItem, isSelected && { backgroundColor: colors.primary || '#e91e63' }]}
                      onPress={() => handleSelectCategory(name)}
                    >
                      <Text style={[styles.categoryText, { color: isSelected ? '#fff' : colors.text || '#fff' }]}>
                        {name}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>

            <ScrollView style={styles.tagList} contentContainerStyle={styles.tagListContent}>
              <Text style={[styles.tagHint, { color: colors.textMuted || '#888' }]}>
                {selectedCategory === '情感' ? '最多可选择 1 个标签' : '最多可选择 5 个标签'}
              </Text>
              <View style={styles.tagsContainer}>
                {Object.entries(currentTags).map(([tagName, tagId]) => {
                  const isSelected = selectedTags.includes(tagId as number)
                  return (
                    <TouchableOpacity
                      key={tagId}
                      style={[
                        styles.tagItem,
                        { borderColor: colors.border || '#555' },
                        isSelected && { borderColor: colors.primary || '#e91e63', backgroundColor: colors.primary || '#e91e63' }
                      ]}
                      onPress={() => handleSelectTag(tagId as number)}
                    >
                      <Text style={[styles.tagText, { color: isSelected ? '#fff' : colors.text || '#fff' }]}>
                        {tagName}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </ScrollView>
          </View>

          <View style={[styles.footer, { borderTopColor: colors.border || '#333' }]}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={[styles.btnText, { color: colors.textMuted || '#888' }]}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: selectedTags.length > 0 ? colors.primary || '#e91e63' : '#555' }]}
              onPress={handleConfirm}
              disabled={selectedTags.length === 0}
            >
              <Text style={styles.confirmText}>确定</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  container: {
    width: '90%',
    height: '70%',
    borderRadius: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
  },
  closeBtn: {
    padding: 5,
  },
  closeText: {
    fontSize: 16,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
  },
  categoryList: {
    width: 100,
    borderRightWidth: 1,
  },
  categoryItem: {
    padding: 15,
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 14,
  },
  tagList: {
    flex: 1,
    padding: 15,
  },
  tagListContent: {
    paddingBottom: 20,
  },
  tagHint: {
    fontSize: 12,
    marginBottom: 10,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  tagText: {
    fontSize: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 15,
    borderTopWidth: 1,
  },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  confirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  btnText: {
    fontSize: 14,
  },
  confirmText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
})
