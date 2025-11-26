// 檔案路徑: src/services/nursingGroupConfigService.js

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'

const CONFIG_COLLECTION = 'nursing_group_config'
const CONFIG_DOC_ID = 'default'

/**
 * 預設的組別配置
 * @returns {object}
 */
export const getDefaultConfig = () => ({
  // 74班可用組別 (B-J，排除75班已選的)
  shift74Groups: ['B', 'C', 'D', 'E', 'G', 'H', 'I'],

  // 75班可用組別
  shift75Groups: ['F', 'J'],

  // 固定分配規則
  fixedAssignments: {
    '74/L': 'A',
    '816': '外圍',
  },

  // 星期別設定 - 早班
  dayShiftRules: {
    // 一三五
    '135': {
      shift74Count: 7, // 74班組數
      shift75Count: 1, // 75班組數
    },
    // 二四六
    '246': {
      shift74Count: 7,
      shift75Count: 2,
    },
  },

  // 星期別設定 - 晚班
  nightShiftRules: {
    // 一三五
    '135': {
      groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
      count: 9,
    },
    // 二四六
    '246': {
      groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      count: 8,
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

  // 檢查 74班和75班組別是否有重複
  const shift74Set = new Set(config.shift74Groups || [])
  const shift75Set = new Set(config.shift75Groups || [])
  const intersection = [...shift74Set].filter((g) => shift75Set.has(g))
  if (intersection.length > 0) {
    errors.push(`74班和75班組別不可重複選擇：${intersection.join(', ')}`)
  }

  // 檢查星期別設定的組數是否與勾選組數相符
  const dayRules = config.dayShiftRules || {}

  // 一三五
  if (dayRules['135']) {
    const total135 = (dayRules['135'].shift74Count || 0) + (dayRules['135'].shift75Count || 0)
    const available = shift74Set.size + shift75Set.size
    if (total135 > available) {
      errors.push(`一三五早班組數(${total135})超過可用組別數量(${available})`)
    }
  }

  // 二四六
  if (dayRules['246']) {
    const total246 = (dayRules['246'].shift74Count || 0) + (dayRules['246'].shift75Count || 0)
    const available = shift74Set.size + shift75Set.size
    if (total246 > available) {
      errors.push(`二四六早班組數(${total246})超過可用組別數量(${available})`)
    }
  }

  // 檢查晚班組數
  const nightRules = config.nightShiftRules || {}
  if (nightRules['135']) {
    const count = nightRules['135'].count || 0
    const groups = nightRules['135'].groups || []
    if (count !== groups.length) {
      errors.push(`一三五晚班組數(${count})與勾選組別數量(${groups.length})不符`)
    }
  }
  if (nightRules['246']) {
    const count = nightRules['246'].count || 0
    const groups = nightRules['246'].groups || []
    if (count !== groups.length) {
      errors.push(`二四六晚班組數(${count})與勾選組別數量(${groups.length})不符`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
