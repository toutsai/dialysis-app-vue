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
  // 74班基礎可用組別 (B-J，用於初始化選擇)
  shift74Groups: ['B', 'C', 'D', 'E', 'G', 'H', 'I'],

  // 75班基礎可用組別
  shift75Groups: ['F', 'J'],

  // 固定分配規則（無法修改）
  fixedAssignments: {
    '74/L': 'A',
    '816': '外圍',
  },

  // 星期別設定 - 早班
  dayShiftRules: {
    // 一三五
    '135': {
      shift74Groups: ['B', 'C', 'D', 'E', 'G', 'H', 'I'], // 74班可用組別
      shift75Groups: ['F'],                               // 75班可用組別（一三五只用F）
    },
    // 二四六
    '246': {
      shift74Groups: ['B', 'C', 'D', 'E', 'G', 'H', 'I'], // 74班可用組別
      shift75Groups: ['F', 'J'],                          // 75班可用組別
    },
  },

  // 星期別設定 - 晚班
  nightShiftRules: {
    // 一三五
    '135': {
      groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
    },
    // 二四六
    '246': {
      groups: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
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

  // 檢查基礎 74班和75班組別是否有重複
  const shift74Set = new Set(config.shift74Groups || [])
  const shift75Set = new Set(config.shift75Groups || [])
  const intersection = [...shift74Set].filter((g) => shift75Set.has(g))
  if (intersection.length > 0) {
    errors.push(`74班和75班基礎組別不可重複選擇：${intersection.join(', ')}`)
  }

  // 檢查早班星期別設定
  const dayRules = config.dayShiftRules || {}

  // 一三五早班
  if (dayRules['135']) {
    const day74Groups = dayRules['135'].shift74Groups || []
    const day75Groups = dayRules['135'].shift75Groups || []

    // 檢查74班組別是否都在基礎74班組別中
    const invalid74 = day74Groups.filter((g) => !shift74Set.has(g))
    if (invalid74.length > 0) {
      errors.push(`一三五 74班組別 ${invalid74.join(', ')} 不在基礎74班組別中`)
    }

    // 檢查75班組別是否都在基礎75班組別中
    const invalid75 = day75Groups.filter((g) => !shift75Set.has(g))
    if (invalid75.length > 0) {
      errors.push(`一三五 75班組別 ${invalid75.join(', ')} 不在基礎75班組別中`)
    }
  }

  // 二四六早班
  if (dayRules['246']) {
    const day74Groups = dayRules['246'].shift74Groups || []
    const day75Groups = dayRules['246'].shift75Groups || []

    const invalid74 = day74Groups.filter((g) => !shift74Set.has(g))
    if (invalid74.length > 0) {
      errors.push(`二四六 74班組別 ${invalid74.join(', ')} 不在基礎74班組別中`)
    }

    const invalid75 = day75Groups.filter((g) => !shift75Set.has(g))
    if (invalid75.length > 0) {
      errors.push(`二四六 75班組別 ${invalid75.join(', ')} 不在基礎75班組別中`)
    }
  }

  // 檢查晚班組數
  const nightRules = config.nightShiftRules || {}
  if (nightRules['135']) {
    const groups = nightRules['135'].groups || []
    if (groups.length === 0) {
      errors.push('一三五晚班至少需要選擇一個組別')
    }
  }
  if (nightRules['246']) {
    const groups = nightRules['246'].groups || []
    if (groups.length === 0) {
      errors.push('二四六晚班至少需要選擇一個組別')
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
