import { defineStore } from 'pinia'
import { ref, computed, type Ref } from 'vue'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService'
// 從 firebase/firestore 引入 writeBatch
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'

// 引入 ApiManager 以便操作多個集合

interface Patient {
  id: string
  name?: string
  status?: string
  isDeleted?: boolean
  [key: string]: unknown
}

// 使用 Setup Store 語法，更靈活且有利於 TypeScript
export const usePatientStore = defineStore('patient', () => {
  // --- State (狀態) ---
  const allPatients: Ref<Patient[]> = ref([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const hasFetched = ref(false)
  const patientsVersion = ref(0)

  const bumpPatientsVersion = () => {
    patientsVersion.value += 1
  }

  // --- Getters (計算屬性) ---
  const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

  const opdPatients = computed(() =>
    allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted),
  )

  // --- Actions (動作) ---

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
      bumpPatientsVersion()
      console.log('✅ [Pinia] Patient data fetched and stored successfully.')
    } catch (err) {
      error.value = '讀取病人資料失敗'
      console.error('❌ [Pinia] Failed to fetch patients:', err)
      hasFetched.value = false
    } finally {
      isLoading.value = false
    }
  }

  async function forceRefreshPatients() {
    isLoading.value = true
    error.value = null
    try {
      const patients = await optimizedFetchAllPatients()
      allPatients.value = patients
      hasFetched.value = true
      bumpPatientsVersion()
      console.log('🔄 [Pinia] Patient data force refreshed.')
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

  function addPatientInStore(newPatient: Patient) {
    const exists = allPatients.value.some((p) => p.id === newPatient.id)
    if (!exists) {
      allPatients.value.unshift(newPatient)
      bumpPatientsVersion()
      console.log(`[Pinia] Patient added in store: ${newPatient.name}`)
    }
  }

  function updatePatientInStore(updatedData: Patient) {
    const index = allPatients.value.findIndex((p) => p.id === updatedData.id)
    if (index !== -1) {
      allPatients.value[index] = { ...allPatients.value[index], ...updatedData }
      bumpPatientsVersion()
      console.log(`[Pinia] Patient updated in store: ${allPatients.value[index].name}`)
    } else {
      console.warn(
        `[Pinia] Patient with ID ${updatedData.id} not found for update, triggering refresh.`,
      )
      void forceRefreshPatients()
    }
  }

  function removePatientInStore(patientId: string) {
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
  async function removeRuleFromMasterSchedule(patientId: string) {
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

      const schedule = (docSnap.data().schedule || {}) as Record<string, unknown>

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
      if (error instanceof Error) {
        throw new Error(`移除總表規則時發生錯誤: ${error.message}`)
      }
      throw error
    }
  }

  function $reset() {
    allPatients.value = []
    isLoading.value = false
    error.value = null
    hasFetched.value = false
    bumpPatientsVersion()
  }

  return {
    // State
    allPatients,
    isLoading,
    error,
    hasFetched,
    patientsVersion,

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
