// 檔案路徑: src/composables/useMyPatientList.js (最終修正版 v8 - 修正 targetDate 邏輯)

import { ref, watch, computed } from 'vue'
import { useAuth } from '@/composables/useAuth.js'
import { useTaskStore } from '@/stores/taskStore.js'
import { usePatientStore } from '@/stores/patientStore.js'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { getMedicationUnit } from '@/utils/medicationUtils.js'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils.js'

const assignmentsApi = ApiManager('nurse_assignments')
const schedulesApi = ApiManager('schedules')
const medicationOrdersApi = ApiManager('medication_orders')

export function useMyPatientList() {
  const { currentUser } = useAuth()
  const taskStore = useTaskStore()
  const patientStore = usePatientStore()

  const isLoading = ref(true)
  const patientList = ref([])

  const patientMap = computed(() => new Map(patientStore.allPatients.map((p) => [p.id, p])))

  const processAndBuildList = async () => {
    if (patientStore.isLoading || taskStore.isLoading || !currentUser.value) {
      if (!patientStore.isLoading && !taskStore.isLoading && !currentUser.value) {
        isLoading.value = false
      }
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

        const injections = await fetchTodayInjectionsForPatient(slot.patientId, today)

        // ✨✨✨【核心修正】✨✨✨
        // 將條件從 <= (小於等於) 修改為 >= (大於等於)
        // 表示 targetDate 是今天或未來
        const memos = (taskStore.feedMessages || []).filter(
          (msg) =>
            msg.patientId === slot.patientId &&
            msg.status === 'pending' &&
            (!msg.targetDate || msg.targetDate >= today), // <-- 修改的就是這一行
        )

        return {
          id: slot.patientId,
          shift: translateShift(shiftCode),
          shiftCode: shiftCode,
          mrn: patientFromStore.medicalRecordNumber || patientFromStore.mrn,
          bedNum: finalBedNum,
          name: patientFromStore.name,
          preparation: preparationInfo,
          injections: injections,
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
    () => [currentUser.value?.uid, patientStore.allPatients, taskStore.feedMessages],
    ([uid, patients, messages]) => {
      if (uid) {
        processAndBuildList()
      } else {
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

  const fetchTodayInjectionsForPatient = async (patientId, date) => {
    try {
      const orders = await medicationOrdersApi.fetchAll([
        where('patientId', '==', patientId),
        where('status', '==', 'active'),
      ])

      const todayInjections = []
      const todayDayOfWeek = new Date(date).getDay()

      for (const order of orders) {
        if (order.category !== 'injection') continue
        const isDueToday =
          order.frequency === 'daily' ||
          (order.frequency === 'weekly' &&
            order.weekdays &&
            order.weekdays.includes(todayDayOfWeek)) ||
          (order.frequency === 'monthly' &&
            new Date(order.dayOfMonth).getDate() === new Date(date).getDate())

        if (isDueToday) {
          todayInjections.push({
            id: order.id,
            name: order.name,
            dose: `${order.dose} ${getMedicationUnit(order)}`,
          })
        }
      }
      return todayInjections
    } catch (e) {
      console.error('Fetch injections error', e)
      return []
    }
  }

  const translateShift = (shiftKey) => {
    const map = {
      early: '早班',
      noon: '午班',
      late: '晚班',
    }
    return map[shiftKey] || shiftKey
  }

  const refreshData = () => {
    if (!isLoading.value) {
      processAndBuildList()
    }
  }

  return {
    isLoading,
    patientList,
    fetchMyPatientData: refreshData,
  }
}
