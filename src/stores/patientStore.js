import { defineStore } from 'pinia'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService.js'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'

export const usePatientStore = defineStore('patients', {
  // 1. State: 存放應用程式的狀態
  state: () => ({
    allPatients: [],
    isLoading: false,
    error: null,
    hasFetched: false, // ✨ 新增一個旗標來判斷是否已獲取過
  }),

  // 2. Getters: 類似 computed 屬性，用於衍生狀態
  getters: {
    patientMap: (state) => new Map(state.allPatients.map((p) => [p.id, p])),
    opdPatients: (state) => state.allPatients.filter((p) => p.status === 'opd' && !p.isDeleted),
    ipdPatients: (state) => state.allPatients.filter((p) => p.status === 'ipd' && !p.isDeleted),
    erPatients: (state) => state.allPatients.filter((p) => p.status === 'er' && !p.isDeleted),
    deletedPatients: (state) => state.allPatients.filter((p) => p.isDeleted),
  },

  // 3. Actions: 用於執行異步操作或修改 state
  actions: {
    /**
     * 按需獲取所有病人資料。
     * 只有在資料尚未獲取過時，才會真正觸發 API 請求。
     */
    async fetchPatientsIfNeeded() {
      if (this.hasFetched || this.isLoading) {
        return
      }

      this.isLoading = true
      this.error = null
      try {
        const patients = await optimizedFetchAllPatients()
        this.allPatients = patients
        this.hasFetched = true // 標記為已獲取
        console.log('✅ [Pinia] Patient data fetched and stored successfully.')
      } catch (err) {
        this.error = '讀取病人資料失敗'
        console.error('❌ [Pinia] Failed to fetch patients:', err)
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 強制刷新病人列表，忽略 hasFetched 旗標。
     */
    async forceRefreshPatients() {
      this.isLoading = true
      this.error = null
      try {
        const patients = await optimizedFetchAllPatients()
        this.allPatients = patients
        this.hasFetched = true
        console.log('🔄 [Pinia] Patient data force refreshed.')
      } catch (err) {
        this.error = '刷新病人資料失敗'
        console.error('❌ [Pinia] Failed to force refresh patients:', err)
      } finally {
        this.isLoading = false
      }
    },

    /**
     * 從總表中移除指定病人的排班規則。
     * @param {string} patientId - 病人 ID。
     */
    async removeRuleFromMasterSchedule(patientId) {
      if (!patientId) {
        console.error('[Pinia] 無效的 patientId，無法從總表移除。')
        return
      }
      const masterScheduleRef = doc(db, 'base_schedules', 'MASTER_SCHEDULE')
      try {
        const docSnap = await getDoc(masterScheduleRef)
        if (docSnap.exists()) {
          const masterRules = docSnap.data().schedule || {}
          if (masterRules[patientId]) {
            delete masterRules[patientId]
            await updateDoc(masterScheduleRef, { schedule: masterRules })
            const { createGlobalNotification } = useGlobalNotifier()
            createGlobalNotification(`已從總表移除病人排班規則`, 'info')
            console.log(`✅ [Pinia] 已成功從總表中移除病人 ${patientId} 的規則。`)
          }
        }
      } catch (error) {
        console.error(`❌ [Pinia] 從總表移除病人規則時失敗:`, error)
        throw new Error('從總床位表移除規則失敗，請檢查權限或網路。')
      }
    },
  },
})
