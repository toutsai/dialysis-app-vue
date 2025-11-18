import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService.js'
// 從 firebase/firestore 引入 writeBatch
import { doc, getDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

// 引入 ApiManager 以便操作多個集合
import ApiManager from '@/services/api_manager.js'

// 建立 schedule_exceptions 的 ApiManager 實例
const scheduleExceptionsApi = ApiManager('schedule_exceptions')
const BACKGROUND_REFRESH_INTERVAL = 5 * 60 * 1000

// 使用 Setup Store 語法，更靈活且有利於 TypeScript
export const usePatientStore = defineStore('patient', () => {
  // --- State (狀態) ---
  const allPatients = ref([])
  const isLoading = ref(false)
  const error = ref(null)
  const hasFetched = ref(false)
  const patientsVersion = ref(0)
  const lastFetchedAt = ref(null)
  let backgroundRefreshTimer = null

  const bumpPatientsVersion = () => {
    patientsVersion.value += 1
  }

  const markFetchedNow = () => {
    lastFetchedAt.value = new Date()
  }

  // --- Getters (計算屬性) ---
  const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

  const opdPatients = computed(() =>
    allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted),
  )

  const applyPatientUpdates = (patients) => {
    let hasChanged = false

    patients.forEach((patient) => {
      const index = allPatients.value.findIndex((p) => p.id === patient.id)
      if (index !== -1) {
        allPatients.value[index] = { ...allPatients.value[index], ...patient }
      } else {
        allPatients.value.unshift(patient)
      }
      hasChanged = true
    })

    if (hasChanged) {
      bumpPatientsVersion()
    }
  }

  // --- Actions (動作) ---

  async function fetchPatientsIfNeeded() {
    if (isLoading.value) {
      return
    }
    if (hasFetched.value) {
      const isStale =
        lastFetchedAt.value && Date.now() - lastFetchedAt.value.getTime() > BACKGROUND_REFRESH_INTERVAL
      if (isStale) {
        backgroundRefreshPatients()
      }
      return
    }
    isLoading.value = true
    error.value = null
    try {
      const patients = await optimizedFetchAllPatients()
      allPatients.value = patients
      hasFetched.value = true
      bumpPatientsVersion()
      markFetchedNow()
      scheduleBackgroundRefresh()
      console.log('✅ [Pinia] Patient data fetched and stored successfully.')
    } catch (err) {
      error.value = '讀取病人資料失敗'
      console.error('❌ [Pinia] Failed to fetch patients:', err)
      hasFetched.value = false
    } finally {
      isLoading.value = false
    }
  }

  const backgroundRefreshPatients = async () => {
    if (isLoading.value || !lastFetchedAt.value) {
      return
    }

    try {
      const updates = await optimizedFetchAllPatients({
        updatedAfter: lastFetchedAt.value,
        useCache: false,
      })

      if (Array.isArray(updates) && updates.length > 0) {
        applyPatientUpdates(updates)
        console.log('🔄 [Pinia] Background patient updates applied.')
      }
      markFetchedNow()
    } catch (err) {
      console.warn('⚠️ [Pinia] Background refresh failed:', err)
    }
  }

  const scheduleBackgroundRefresh = () => {
    if (backgroundRefreshTimer) {
      clearTimeout(backgroundRefreshTimer)
    }

    // 📡 若資料更新頻繁，可改為 onSnapshot 監聽，以取代週期性背景刷新。
    backgroundRefreshTimer = setTimeout(async () => {
      await backgroundRefreshPatients()
      scheduleBackgroundRefresh()
    }, BACKGROUND_REFRESH_INTERVAL)
  }

  async function forceRefreshPatients({ preferIncremental = true } = {}) {
    isLoading.value = true
    error.value = null
    try {
      const shouldUseDelta = preferIncremental && lastFetchedAt.value
      const patients = await optimizedFetchAllPatients({
        updatedAfter: shouldUseDelta ? lastFetchedAt.value : undefined,
        useCache: !shouldUseDelta,
      })

      if (shouldUseDelta) {
        applyPatientUpdates(patients)
        console.log('🔄 [Pinia] Patient data incrementally refreshed.')
      } else {
        allPatients.value = patients
        hasFetched.value = true
        bumpPatientsVersion()
        console.log('🔄 [Pinia] Patient data fully refreshed.')
      }

      markFetchedNow()
      scheduleBackgroundRefresh()
      return patients
    } catch (err) {
      // 🔥【核心修正】補上缺失的大括號 {
      error.value = '刷新病人資料失敗'
      console.error('❌ [Pinia] Failed to force refresh patients:', err)
      return []
    } finally {
      // 🔥【核心修正】補上缺失的大括號 }
      isLoading.value = false
    }
  }

  function addPatientInStore(newPatient) {
    const exists = allPatients.value.some((p) => p.id === newPatient.id)
    if (!exists) {
      allPatients.value.unshift(newPatient)
      bumpPatientsVersion()
      console.log(`[Pinia] Patient added in store: ${newPatient.name}`)
    }
  }

  function updatePatientInStore(updatedData) {
    const index = allPatients.value.findIndex((p) => p.id === updatedData.id)
    if (index !== -1) {
      allPatients.value[index] = { ...allPatients.value[index], ...updatedData }
      bumpPatientsVersion()
      console.log(`[Pinia] Patient updated in store: ${allPatients.value[index].name}`)
    } else {
      console.warn(
        `[Pinia] Patient with ID ${updatedData.id} not found for update, triggering refresh.`,
      )
      forceRefreshPatients()
    }
  }

  function removePatientInStore(patientId) {
    const index = allPatients.value.findIndex((p) => p.id === patientId)
    if (index !== -1) {
      allPatients.value.splice(index, 1)
      console.log(`[Pinia] Patient removed from store: ${patientId}`)
      bumpPatientsVersion()
    }
  }

  /**
   * 🔥【架構修正版】🔥
   * 職責簡化：只負責從後端總表中移除規則。
   * 後端的 syncMasterScheduleToFuture 將會自動處理後續的排程重建。
   * @param {string} patientId - 病人 ID。
   * @returns {Promise<boolean>} 操作是否成功。
   */
  async function removeRuleFromMasterSchedule(patientId) {
    if (!patientId) {
      console.error('[Store] removeRuleFromMasterSchedule: patientId is missing.')
      return false
    }

    console.log(`[Store] Sending request to remove rule for patient ${patientId}...`)

    try {
      // --- ✨ 核心修改：移除所有關於 schedule_exceptions 的操作 ---
      // 讓後端 Cloud Function 自己去處理資料一致性

      // --- 只保留對總表文件的操作 ---
      const masterScheduleRef = doc(db, 'base_schedules', 'MASTER_SCHEDULE')
      const docSnap = await getDoc(masterScheduleRef)

      if (!docSnap.exists()) {
        console.warn('[Store] MASTER_SCHEDULE document does not exist.')
        return true // 文件不存在，視為成功
      }

      const schedule = docSnap.data().schedule || {}

      if (schedule[patientId]) {
        delete schedule[patientId]
        await updateDoc(masterScheduleRef, {
          schedule: schedule,
          updatedAt: new Date(),
        })
        console.log(`[Store] Successfully sent update to remove rule from Firestore.`)
      } else {
        console.log(`[Store] Rule for patient ${patientId} already absent.`)
      }

      console.log(`✅ [Store] Rule removal request for patient ${patientId} completed.`)
      return true
    } catch (error) {
      console.error('❌ [Store] Error removing rule from master schedule:', error)
      throw new Error(`移除總表規則時發生錯誤: ${error.message}`)
    }
  }

  function $reset() {
    allPatients.value = []
    isLoading.value = false
    error.value = null
    hasFetched.value = false
    lastFetchedAt.value = null
    if (backgroundRefreshTimer) {
      clearTimeout(backgroundRefreshTimer)
      backgroundRefreshTimer = null
    }
    bumpPatientsVersion()
  }

  return {
    // State
    allPatients,
    isLoading,
    error,
    hasFetched,
    patientsVersion,
    lastFetchedAt,

    // Getters
    patientMap,
    opdPatients,

    // Actions
    fetchPatientsIfNeeded,
    backgroundRefreshPatients,
    forceRefreshPatients,
    addPatientInStore,
    updatePatientInStore,
    removePatientInStore,
    removeRuleFromMasterSchedule,
    $reset,
  }
})
