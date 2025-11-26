// 檔案路徑: src/services/nursingGroupConfigService.js

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'

const CONFIG_COLLECTION = 'nursing_group_config'
const CONFIG_DOC_ID = 'default'

// 早班組別字母（B-J，A組保留給74/L）
const DAY_SHIFT_LETTERS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// 晚班組別字母（A-I）
const NIGHT_SHIFT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

/**
 * 根據組數產生早班可用組別（從B開始）
 * @param {number} count - 組數
 * @returns {string[]}
 */
export const generateDayShiftGroups = (count) => {
  const validCount = Math.min(Math.max(count || 0, 0), DAY_SHIFT_LETTERS.length)
  return DAY_SHIFT_LETTERS.slice(0, validCount)
}

/**
 * 根據組數產生晚班可用組別（從A開始）
 * @param {number} count - 組數
 * @returns {string[]}
 */
export const generateNightShiftGroups = (count) => {
  const validCount = Math.min(Math.max(count || 0, 0), NIGHT_SHIFT_LETTERS.length)
  return NIGHT_SHIFT_LETTERS.slice(0, validCount)
}

/**
 * 計算74班可用組別
 * 74班 = 早班可用組別 - 75班組別
 * @param {string[]} dayShiftGroups - 早班可用組別
 * @param {string[]} shift75Groups - 75班使用的組別
 * @returns {string[]}
 */
export const calculate74Groups = (dayShiftGroups, shift75Groups) => {
  const shift75Set = new Set(shift75Groups || [])
  return (dayShiftGroups || []).filter((g) => !shift75Set.has(g))
}

// 早班最大組數
export const MAX_DAY_SHIFT_GROUPS = DAY_SHIFT_LETTERS.length // 9

// 晚班最大組數
export const MAX_NIGHT_SHIFT_GROUPS = NIGHT_SHIFT_LETTERS.length // 9

/**
 * 預設的組別配置
 * @returns {object}
 */
export const getDefaultConfig = () => ({
  // 固定分配規則（無法修改）
  fixedAssignments: {
    '74/L': 'A',
    '816': '外圍',
  },

  // 星期別組數設定
  groupCounts: {
    '135': {
      dayShiftCount: 8,   // 一三五早班共8組 → B-I
      nightShiftCount: 9, // 一三五晚班共9組 → A-I
    },
    '246': {
      dayShiftCount: 9,   // 二四六早班共9組 → B-J
      nightShiftCount: 8, // 二四六晚班共8組 → A-H
    },
  },

  // 早班 75班組別設定（從早班可用組別中選）
  dayShiftRules: {
    '135': {
      shift75Groups: ['F'], // 75班用F，74班自動用剩餘的
    },
    '246': {
      shift75Groups: ['F', 'J'], // 75班用F,J，74班自動用剩餘的
    },
  },

  // 不可擔任晚班組長的護理師 (存放 nurseId)
  cannotBeNightLeader: [],

  // 最後修改資訊
  lastModified: {
    date: null,
    userId: null,
    userName: null,
  },
})

/**
 * 從 Firestore 獲取護理組別配置
 * @returns {Promise<object>}
 */
export async function fetchNursingGroupConfig() {
  try {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID)
    const docSnap = await getDoc(docRef)

    if (docSnap.exists()) {
      console.log('✅ 從 Firestore 成功獲取護理組別配置')
      return docSnap.data()
    } else {
      console.log('⚠️ 在 Firestore 中找不到護理組別配置，回傳預設值。')
      return getDefaultConfig()
    }
  } catch (error) {
    console.error('❌ 獲取護理組別配置失敗:', error)
    throw new Error('無法從資料庫獲取護理組別配置。')
  }
}

/**
 * 將護理組別配置儲存到 Firestore
 * @param {object} config - 要儲存的配置物件
 * @param {object} currentUser - 當前使用者資訊
 * @returns {Promise<void>}
 */
export async function saveNursingGroupConfig(config, currentUser) {
  try {
    const docRef = doc(db, CONFIG_COLLECTION, CONFIG_DOC_ID)

    const dataToSave = {
      ...config,
      lastModified: {
        date: serverTimestamp(),
        userId: currentUser?.uid || null,
        userName: currentUser?.displayName || currentUser?.name || '未知',
      },
    }

    await setDoc(docRef, dataToSave, { merge: true })
    console.log('✅ 護理組別配置已成功儲存到 Firestore')
  } catch (error) {
    console.error('❌ 儲存護理組別配置失敗:', error)
    throw new Error('儲存護理組別配置到資料庫時發生錯誤。')
  }
}

/**
 * 驗證配置是否合法
 * @param {object} config - 配置物件
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateConfig(config) {
  const errors = []
  const groupCounts = config.groupCounts || {}
  const dayRules = config.dayShiftRules || {}

  // 驗證一三五
  const counts135 = groupCounts['135'] || {}
  const dayCount135 = counts135.dayShiftCount || 0
  const nightCount135 = counts135.nightShiftCount || 0
  const dayGroups135 = generateDayShiftGroups(dayCount135)
  const shift75Groups135 = dayRules['135']?.shift75Groups || []

  if (dayCount135 < 1) {
    errors.push('一三五早班至少需要1組')
  }
  if (nightCount135 < 1) {
    errors.push('一三五晚班至少需要1組')
  }
  if (shift75Groups135.length === 0) {
    errors.push('一三五 75班至少需要選擇一個組別')
  }
  // 檢查75班組別是否在早班可用組別內
  const invalid75_135 = shift75Groups135.filter((g) => !dayGroups135.includes(g))
  if (invalid75_135.length > 0) {
    errors.push(`一三五 75班組別 ${invalid75_135.join(', ')} 超出早班可用範圍 (${dayGroups135.join(', ')})`)
  }

  // 驗證二四六
  const counts246 = groupCounts['246'] || {}
  const dayCount246 = counts246.dayShiftCount || 0
  const nightCount246 = counts246.nightShiftCount || 0
  const dayGroups246 = generateDayShiftGroups(dayCount246)
  const shift75Groups246 = dayRules['246']?.shift75Groups || []

  if (dayCount246 < 1) {
    errors.push('二四六早班至少需要1組')
  }
  if (nightCount246 < 1) {
    errors.push('二四六晚班至少需要1組')
  }
  if (shift75Groups246.length === 0) {
    errors.push('二四六 75班至少需要選擇一個組別')
  }
  // 檢查75班組別是否在早班可用組別內
  const invalid75_246 = shift75Groups246.filter((g) => !dayGroups246.includes(g))
  if (invalid75_246.length > 0) {
    errors.push(`二四六 75班組別 ${invalid75_246.join(', ')} 超出早班可用範圍 (${dayGroups246.join(', ')})`)
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
