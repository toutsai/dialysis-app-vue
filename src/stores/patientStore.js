import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService.js'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

// 使用 Setup Store 語法，更靈活且有利於 TypeScript
export const usePatientStore = defineStore('patient', () => {
  // --- State (狀態) ---
  const allPatients = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const hasFetched = ref(false)

  // --- Getters (計算屬性) ---
  const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

  const opdPatients = computed(() =>
    allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted),
  )
  // 您可以根據需要添加 ipdPatients, erPatients 等 getters

  // --- Actions (動作) ---

  /**
   * 按需獲取所有病人資料。
   * 只有在資料尚未獲取過時，才會真正觸發 API 請求。
   */
  async function fetchPatientsIfNeeded() {
    if (hasFetched.value || isLoading.value) {
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const patients = await optimizedFetchAllPatients()
      allPatients.value = patients
      hasFetched.value = true
      console.log('✅ [Pinia] Patient data fetched and stored successfully.')
    } catch (err) {
      error.value = '讀取病人資料失敗'
      console.error('❌ [Pinia] Failed to fetch patients:', err)
      hasFetched.value = false // 允許重試
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 強制刷新病人列表，忽略 hasFetched 旗標。
   * @returns {Promise<Array>} 返回獲取的最新病人列表
   */
  async function forceRefreshPatients() {
    isLoading.value = true
    error.value = null
    try {
      const patients = await optimizedFetchAllPatients()
      allPatients.value = patients
      hasFetched.value = true
      console.log('🔄 [Pinia] Patient data force refreshed.')
      return patients
    } catch (err) {
      error.value = '刷新病人資料失敗'
      console.error('❌ [Pinia] Failed to force refresh patients:', err)
      return [] // 失敗時返回空陣列
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 在 Store 中新增一位病人，用於避免全量刷新。
   * @param {object} newPatient - 新增的病人完整物件。
   */
  function addPatientInStore(newPatient) {
    // 檢查病人是否已存在，避免重複添加
    const exists = allPatients.value.some((p) => p.id === newPatient.id)
    if (!exists) {
      allPatients.value.unshift(newPatient)
      console.log(`[Pinia] Patient added in store: ${newPatient.name}`)
    }
  }

  /**
   * 在 Store 中更新一位病人資料，用於避免全量刷新。
   * @param {object} updatedData - 包含病人 id 和要更新欄位的物件。
   */
  function updatePatientInStore(updatedData) {
    const index = allPatients.value.findIndex((p) => p.id === updatedData.id)
    if (index !== -1) {
      // 使用 Object.assign 確保響應性，並保留原始物件的引用
      allPatients.value[index] = { ...allPatients.value[index], ...updatedData }
      console.log(`[Pinia] Patient updated in store: ${allPatients.value[index].name}`)
    } else {
      // 如果在列表中找不到（例如，一個被復原的病人），則將其新增
      console.warn(
        `[Pinia] Patient with ID ${updatedData.id} not found for update, adding instead.`,
      )
      addPatientInStore(updatedData)
    }
  }

  /**
   * 從 Store 中移除一位病人，用於避免全量刷新。
   * @param {string} patientId - 要移除的病人 ID。
   */
  function removePatientInStore(patientId) {
    const index = allPatients.value.findIndex((p) => p.id === patientId)
    if (index !== -1) {
      allPatients.value.splice(index, 1)
      console.log(`[Pinia] Patient removed from store: ${patientId}`)
    }
  }

  /**
   * 從總表中移除指定病人的排班規則。
   * 採用最可靠的「讀取-修改-寫回」模式，確保資料同步。
   * @param {string} patientId - 病人 ID。
   * @returns {Promise<boolean>} 操作是否成功。
   */
  async function removeRuleFromMasterSchedule(patientId) {
    if (!patientId) {
      console.error('[Store] removeRuleFromMasterSchedule: patientId is missing.')
      return false
    }

    const masterScheduleRef = doc(db, 'base_schedules', 'MASTER_SCHEDULE')

    try {
      // 【核心】在執行任何操作前，先從後台獲取最新的文件快照
      const docSnap = await getDoc(masterScheduleRef)

      if (!docSnap.exists()) {
        console.warn('[Store] MASTER_SCHEDULE document does not exist.')
        return false // 文件不存在，自然也無規則可刪
      }

      const schedule = docSnap.data().schedule || {}

      // 根據「最新的資料」來判斷規則是否存在
      if (schedule[patientId]) {
        console.log(`[Store] Found rule for patient ${patientId}. Preparing to delete...`)

        // 從 schedule 物件中刪除該病人的 key
        delete schedule[patientId]

        // 將修改後的整個 schedule 物件寫回後台
        await updateDoc(masterScheduleRef, {
          schedule: schedule,
          updatedAt: new Date(),
        })

        console.log(
          `[Store] Successfully removed rule for patient ${patientId} and updated Firestore.`,
        )
        // 只有在真正執行了刪除和更新後，才回傳 true
        return true
      } else {
        // 如果在最新的資料中找不到規則，明確告知並回傳 false
        console.log(`[Store] No rule found for patient ${patientId} in the latest master schedule.`)
        return false
      }
    } catch (error) {
      console.error('[Store] Error removing rule from master schedule:', error)
      return false // 發生任何錯誤都應回傳 false
    }
  }

  /**
   * 重置 Store 狀態，通常在登出時使用。
   */
  function $reset() {
    allPatients.value = []
    isLoading.value = false
    error.value = null
    hasFetched.value = false
  }

  // 導出所有 state, getters, 和 actions，讓外部元件可以使用
  return {
    // State
    allPatients,
    isLoading,
    error,
    hasFetched,

    // Getters
    patientMap,
    opdPatients,

    // Actions
    fetchPatientsIfNeeded,
    forceRefreshPatients,
    addPatientInStore,
    updatePatientInStore,
    removePatientInStore,
    removeRuleFromMasterSchedule,
    $reset,
  }
})
