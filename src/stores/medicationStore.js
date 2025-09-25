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
    console.log(`[Store] 接到請求: 日期=${targetDate}, 病人數=${patientIds.length}`)

    if (!patientIds || patientIds.length === 0) {
      return []
    }

    isLoading.value = true
    error.value = null

    try {
      // 確保該日期的快取陣列存在
      if (!dailyInjectionsCache.value[targetDate]) {
        dailyInjectionsCache.value[targetDate] = []
      }

      // ✅ 1. 找出哪些病人資料已經在快取裡了
      const cachedPatientIds = new Set(
        dailyInjectionsCache.value[targetDate].map((inj) => inj.patientId),
      )

      // ✅ 2. 計算出這次請求中，哪些是需要向後端查詢的新病人
      const idsToFetch = patientIds.filter((id) => !cachedPatientIds.has(id))

      // ✅ 3. 如果有需要查詢的新病人，才執行後端請求
      if (idsToFetch.length > 0) {
        console.log(
          `[Store] ❌ 快取不完整，需為 ${idsToFetch.length} 位新病人請求資料。`,
          idsToFetch,
        )

        const getDailyInjections = httpsCallable(functions, 'getDailyInjections')
        const CHUNK_SIZE = 30
        const promises = []
        for (let i = 0; i < idsToFetch.length; i += CHUNK_SIZE) {
          const chunk = idsToFetch.slice(i, i + CHUNK_SIZE)
          promises.push(getDailyInjections({ targetDate, patientIds: chunk }))
        }

        const results = await Promise.all(promises)
        let newlyFetchedInjections = []
        for (const result of results) {
          if (result.data && result.data.success) {
            newlyFetchedInjections = newlyFetchedInjections.concat(result.data.injections)
          }
        }

        // ✅ 4. 將新獲取的資料合併到當日的快取中
        dailyInjectionsCache.value[targetDate].push(...newlyFetchedInjections)
        console.log(
          `[Store] 💾 快取已更新，${targetDate} 現在共有 ${dailyInjectionsCache.value[targetDate].length} 筆資料。`,
        )
      } else {
        console.log(`[Store] ✅ 快取完整！本次請求的所有病人資料都已存在。`)
      }

      // ✅ 5. 最後，從更新後的完整快取中，篩選出本次呼叫所需要的病人資料並回傳
      const patientIdSet = new Set(patientIds)
      return dailyInjectionsCache.value[targetDate].filter((inj) => patientIdSet.has(inj.patientId))
    } catch (e) {
      console.error('[Store] 獲取每日應打針劑時發生嚴重錯誤:', e)
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
