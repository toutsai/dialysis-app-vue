// 檔案路徑: src/stores/medicationStore.js (帶有詳細日誌的除錯版本)

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/composables/useFirebase.js'

export const useMedicationStore = defineStore('medication', () => {
  const dailyInjectionsCache = ref({})
  const isLoading = ref(false)
  const error = ref(null)

  const getInjectionsForDate = computed(() => {
    return (targetDate) => dailyInjectionsCache.value[targetDate] || null
  })

  async function fetchDailyInjections(targetDate, patientIds) {
    // --- 📍 日誌點 1: 檢查傳入的參數 ---
    console.log(
      `[MedicationStore] 接到請求: 日期=${targetDate}, 病人數=${patientIds.length}`,
      patientIds,
    )

    if (!patientIds || patientIds.length === 0) {
      console.log('[MedicationStore] 病人ID陣列為空，直接返回。')
      return []
    }

    // --- 📍 日誌點 2: 檢查快取 ---
    if (dailyInjectionsCache.value[targetDate]) {
      console.log(`[MedicationStore] ✅ 快取命中！從現有資料中過濾 ${targetDate} 的針劑。`, {
        allCachedData: dailyInjectionsCache.value[targetDate],
      })
      // 從已有的全天快取中篩選出本次請求需要的病人資料
      const patientIdSet = new Set(patientIds)
      return dailyInjectionsCache.value[targetDate].filter((inj) => patientIdSet.has(inj.patientId))
    }

    // --- 📍 日誌點 3: 快取未命中，準備請求後端 ---
    console.log(`[MedicationStore] ❌ 快取未命中，準備向後端請求 ${targetDate} 的資料。`)
    isLoading.value = true
    error.value = null

    try {
      const getDailyInjections = httpsCallable(functions, 'getDailyInjections')

      const CHUNK_SIZE = 30
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
          console.error('[MedicationStore] 後端回傳部分錯誤:', result.data?.message)
        }
      }

      // --- 📍 日誌點 4: 顯示從後端拿到的原始資料 ---
      console.log(
        `[MedicationStore] ☁️ 從後端成功獲取 ${combinedInjections.length} 筆針劑資料。`,
        combinedInjections,
      )

      // ✨ 關鍵邏輯：我們快取的是當天所有請求過的病人的資料總和
      const existingData = dailyInjectionsCache.value[targetDate] || []
      const newDataMap = new Map(
        existingData.map((item) => [`${item.patientId}-${item.orderCode}`, item]),
      )
      combinedInjections.forEach((item) => {
        newDataMap.set(`${item.patientId}-${item.orderCode}`, item)
      })

      dailyInjectionsCache.value[targetDate] = Array.from(newDataMap.values())
      console.log(
        `[MedicationStore] 💾 快取已更新，${targetDate} 現在共有 ${dailyInjectionsCache.value[targetDate].length} 筆資料。`,
      )

      return combinedInjections
    } catch (e) {
      console.error('[MedicationStore] 獲取每日應打針劑時發生嚴重錯誤:', e)
      error.value = e
      return []
    } finally {
      isLoading.value = false
    }
  }

  function clearCache(targetDate = null) {
    if (targetDate) {
      console.log(`[MedicationStore] 🗑️ 清除 ${targetDate} 的快取。`)
      delete dailyInjectionsCache.value[targetDate]
    } else {
      console.log('[MedicationStore] 🗑️ 清除所有針劑快取。')
      dailyInjectionsCache.value = {}
    }
  }

  return {
    dailyInjectionsCache,
    isLoading,
    error,
    getInjectionsForDate,
    fetchDailyInjections,
    clearCache,
  }
})
