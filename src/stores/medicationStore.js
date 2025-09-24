// 檔案路徑: src/stores/medicationStore.js (繁體中文修正版)

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/composables/useFirebase.js'

export const useMedicationStore = defineStore('medication', () => {
  // --- State ---
  // 用來快取每日針劑資料。Key 是 'YYYY-MM-DD' 格式的日期。
  const dailyInjectionsCache = ref({})
  const isLoading = ref(false)
  const error = ref(null)

  // --- Getters ---
  const getInjectionsForDate = computed(() => {
    return (targetDate) => dailyInjectionsCache.value[targetDate] || null
  })

  // --- Actions ---

  /**
   * 獲取指定日期的應打針劑清單。
   * 此函式會先檢查快取，如果快取中沒有資料，才會向後端請求。
   * @param {string} targetDate - 'YYYY-MM-DD' 格式的日期
   * @param {Array<string>} patientIds - 要查詢的病人 ID 陣列
   * @returns {Promise<Array>} 應打針劑清單
   */
  async function fetchDailyInjections(targetDate, patientIds) {
    // 如果沒有病人 ID，直接返回空陣列，避免不必要的請求
    if (!patientIds || patientIds.length === 0) {
      return []
    }

    // 檢查快取中是否已有當天的資料
    if (dailyInjectionsCache.value[targetDate]) {
      console.log(`[MedicationStore] 從快取載入 ${targetDate} 的針劑資料。`)
      return dailyInjectionsCache.value[targetDate]
    }

    isLoading.value = true
    error.value = null
    try {
      console.log(`[MedicationStore] 正在從後端請求 ${targetDate} 的針劑資料...`)
      const getDailyInjections = httpsCallable(functions, 'getDailyInjections')

      // 考慮到 Cloud Function 可能有 payload 大小限制，可以選擇分批次請求
      const CHUNK_SIZE = 30 // 與您前端現有邏輯保持一致
      const promises = []
      for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
        const chunk = patientIds.slice(i, i + CHUNK_SIZE)
        promises.push(getDailyInjections({ targetDate, patientIds: chunk }))
      }

      const results = await Promise.all(promises)

      let combinedInjections = []
      for (const result of results) {
        if (result.data && result.data.success) {
          combinedInjections = combinedInjections.concat(result.data.injections)
        } else {
          // 即使部分失敗，也繼續處理成功的，但記錄錯誤
          console.error('部分針劑資料獲取失敗:', result.data?.message)
        }
      }

      // 將結果存入快取
      dailyInjectionsCache.value[targetDate] = combinedInjections

      return combinedInjections
    } catch (e) {
      console.error('獲取每日應打針劑失敗:', e)
      error.value = e
      // 即使失敗，也返回空陣列，避免前端出錯
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 清除指定日期的快取，或清除所有快取。
   * @param {string|null} targetDate - 'YYYY-MM-DD' 格式的日期，若為 null 則清除所有
   */
  function clearCache(targetDate = null) {
    if (targetDate) {
      console.log(`[MedicationStore] 清除 ${targetDate} 的快取。`)
      delete dailyInjectionsCache.value[targetDate]
    } else {
      console.log('[MedicationStore] 清除所有針劑快取。')
      dailyInjectionsCache.value = {}
    }
  }

  return {
    // State
    dailyInjectionsCache,
    isLoading,
    error,
    // Getters
    getInjectionsForDate,
    // Actions
    fetchDailyInjections,
    clearCache,
  }
})
