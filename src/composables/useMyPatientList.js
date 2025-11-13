// 檔案路徑: src/composables/useMyPatientList.js (v13 - 最終修正 targetDate 邏輯)

import { ref, watch, computed } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useTaskStore } from '@/stores/taskStore.js'
import { usePatientStore } from '@/stores/patientStore.js'
import { useMedicationStore } from '@/stores/medicationStore.js'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils.js'

const assignmentsApi = ApiManager('nurse_assignments')
const schedulesApi = ApiManager('schedules')

export function useMyPatientList() {
  const { currentUser } = useAuth()
  const taskStore = useTaskStore()
  const patientStore = usePatientStore()
  const medicationStore = useMedicationStore()
  const isLoading = ref(true)
  const patientList = ref([])
  const patientMap = computed(() => new Map(patientStore.allPatients.map((p) => [p.id, p])))

  const processAndBuildList = async () => {
    if (!currentUser.value) {
      patientList.value = []
      isLoading.value = false
      return
    }
    isLoading.value = true
    try {
      const today = formatDateToYYYYMMDD(new Date())
      const currentUserName = currentUser.value.name
      const assignmentsSnapshot = await assignmentsApi.fetchAll([where('date', '==', today)])
      const myAssignedIds = new Set()
      if (assignmentsSnapshot.length > 0) {
        const { names, teams } = assignmentsSnapshot[0]
        if (names && teams) {
          const myTeamCodes = Object.keys(names).filter(
            (teamCode) => names[teamCode]?.trim() === currentUserName?.trim(),
          )
          if (myTeamCodes.length > 0) {
            for (const teamKey in teams) {
              const [pId] = teamKey.split('-')
              const teamAssignment = teams[teamKey]
              if (
                myTeamCodes.some((code) =>
                  [
                    teamAssignment.nurseTeam,
                    teamAssignment.nurseTeamIn,
                    teamAssignment.nurseTeamOut,
                    teamAssignment.nurseTeamTakeOff,
                  ].includes(code),
                )
              ) {
                myAssignedIds.add(pId)
              }
            }
          }
        }
      }
      if (myAssignedIds.size === 0) {
        patientList.value = []
        isLoading.value = false
        return
      }
      const schedulesSnapshot = await schedulesApi.fetchAll([where('date', '==', today)])
      const myFinalListWithBedInfo = []
      if (schedulesSnapshot.length > 0 && schedulesSnapshot[0].schedule) {
        const scheduleData = schedulesSnapshot[0].schedule
        for (const shiftKey in scheduleData) {
          const slot = scheduleData[shiftKey]
          if (slot?.patientId && myAssignedIds.has(slot.patientId)) {
            myFinalListWithBedInfo.push({ patientId: slot.patientId, shiftKey: shiftKey })
          }
        }
      }
      const allMyPatientIds = Array.from(myAssignedIds)
      if (allMyPatientIds.length > 0) {
        await medicationStore.fetchDailyInjections(today, allMyPatientIds)
      }
      const allInjections = medicationStore.getInjectionsForDate(today) || []
      const injectionsMap = allInjections.reduce((map, injection) => {
        if (!map.has(injection.patientId)) {
          map.set(injection.patientId, [])
        }
        map.get(injection.patientId).push(injection)
        return map
      }, new Map())
      const detailedPromises = myFinalListWithBedInfo.map(async (slot) => {
        const patientFromStore = patientMap.value.get(slot.patientId)
        if (!patientFromStore) return null
        const dailyBedNum = getBedNumberFromKey(slot.shiftKey)
        const finalBedNum = !isNaN(dailyBedNum) ? dailyBedNum : patientFromStore.bed || 'N/A'
        const shiftCode = slot.shiftKey.split('-').pop()
        const preparationInfo = {
          ak: patientFromStore.dialysisOrders?.ak || '–',
          dialysateCa: patientFromStore.dialysisOrders?.dialysateCa || '–',
          heparin: `${patientFromStore.dialysisOrders?.heparinInitial ?? '–'}/${patientFromStore.dialysisOrders?.heparinMaintenance ?? '–'}`,
          bloodFlow: patientFromStore.dialysisOrders?.bloodFlow ?? '–',
          vascAccess: `${patientFromStore.dialysisOrders?.vascAccess || '–'} (${patientFromStore.dialysisOrders?.arterialNeedle || 'N/A'}/${patientFromStore.dialysisOrders?.venousNeedle || 'N/A'})`,
        }
        const injectionsForPatient = injectionsMap.get(slot.patientId) || []

        // ✨✨✨【最終核心修正】✨✨✨
        // 邏輯更正為：顯示所有沒有 targetDate，或者 targetDate 是今天或未來的待辦事項
        const memos = (taskStore.feedMessages || []).filter(
          (msg) =>
            msg.patientId === slot.patientId &&
            msg.status === 'pending' &&
            (!msg.targetDate || msg.targetDate >= today), // <-- 確認條件為 >=
        )

        return {
          id: slot.patientId,
          shift: translateShift(shiftCode),
          shiftCode: shiftCode,
          mrn: patientFromStore.medicalRecordNumber || patientFromStore.mrn,
          bedNum: finalBedNum,
          name: patientFromStore.name,
          preparation: preparationInfo,
          injections: injectionsForPatient.map((injection) => {
            const parts = [
              injection.orderName || '未知藥品',
              `${injection.dose || ''} ${injection.unit || ''}`.trim(),
              injection.note || '',
            ]
            return parts.filter((part) => part).join(' / ')
          }),
          memos: memos,
        }
      })
      const results = (await Promise.all(detailedPromises)).filter((p) => p !== null)
      results.sort((a, b) => {
        const shiftOrder = { early: 1, noon: 2, late: 3 }
        const orderA = shiftOrder[a.shiftCode] || 99
        const orderB = shiftOrder[b.shiftCode] || 99
        if (orderA !== orderB) return orderA - orderB
        if (a.bedNum === 'N/A') return 1
        if (b.bedNum === 'N/A') return -1
        return a.bedNum - b.bedNum
      })
      patientList.value = results
    } catch (error) {
      console.error('[useMyPatientList] 錯誤:', error)
      patientList.value = []
    } finally {
      isLoading.value = false
    }
  }

  watch(
    () => [
      currentUser.value?.uid,
      patientStore.allPatients,
      taskStore.feedMessages,
      medicationStore.dailyInjectionsCache,
    ],
    ([uid]) => {
      if (uid && !patientStore.isLoading) {
        processAndBuildList()
      } else if (!uid) {
        isLoading.value = false
        patientList.value = []
      }
    },
    { immediate: true, deep: true },
  )
  const getBedNumberFromKey = (shiftId) => {
    if (!shiftId) return NaN
    const parts = shiftId.split('-')
    if (parts.length < 2) return NaN
    if (parts[0] === 'peripheral') {
      return 1000 + parseInt(parts[1], 10)
    }
    return parseInt(parts[1], 10)
  }
  const translateShift = (shiftKey) => {
    const map = { early: '早班', noon: '午班', late: '晚班' }
    return map[shiftKey] || shiftKey
  }
  const refreshData = () => {
    if (!isLoading.value) {
      medicationStore.clearCache()
      processAndBuildList()
    }
  }

  return {
    isLoading,
    patientList,
    fetchMyPatientData: refreshData,
  }
}
