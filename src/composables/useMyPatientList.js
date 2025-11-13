// 檔案路徑: src/composables/useMyPatientList.js (v15 - 最終穩定版)

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
  const patientListByShift = ref({})
  const patientMap = computed(() => new Map(patientStore.allPatients.map((p) => [p.id, p])))

  const processAndBuildList = async () => {
    if (!currentUser.value || patientStore.isLoading) {
      if (!currentUser.value) {
        patientListByShift.value = {}
        isLoading.value = false
      }
      return
    }
    isLoading.value = true
    try {
      const today = formatDateToYYYYMMDD(new Date())
      const currentUserName = currentUser.value.name

      // ... (抓取 assignments, schedules 的邏輯保持不變) ...
      const assignmentsSnapshot = await assignmentsApi.fetchAll([where('date', '==', today)])
      const myAssignedIds = new Set()
      const myAssignments = new Map()
      if (assignmentsSnapshot.length > 0) {
        const { names, teams } = assignmentsSnapshot[0]
        if (names && teams) {
          const myTeamCodes = Object.keys(names).filter(
            (teamCode) => names[teamCode]?.trim() === currentUserName,
          )
          if (myTeamCodes.length > 0) {
            for (const teamKey in teams) {
              const [pId] = teamKey.split('-')
              const teamAssignment = teams[teamKey]
              const roles = []
              if (myTeamCodes.includes(teamAssignment.nurseTeam)) roles.push('main')
              if (myTeamCodes.includes(teamAssignment.nurseTeamIn)) roles.push('noonOn')
              if (myTeamCodes.includes(teamAssignment.nurseTeamOut)) roles.push('noonOff')
              if (myTeamCodes.includes(teamAssignment.nurseTeamTakeOff)) roles.push('lateOff')
              if (roles.length > 0) {
                myAssignedIds.add(pId)
                if (!myAssignments.has(pId)) myAssignments.set(pId, new Set())
                roles.forEach((role) => myAssignments.get(pId).add(role))
              }
            }
          }
        }
      }

      if (myAssignedIds.size === 0) {
        patientListByShift.value = {}
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

      const groupedResults = { early: [], noonOn: [], noonOff: [], late: [] }
      const allInjections = medicationStore.getInjectionsForDate(today) || []
      const injectionsMap = allInjections.reduce((map, injection) => {
        if (!map.has(injection.patientId)) map.set(injection.patientId, [])
        map.get(injection.patientId).push(injection)
        return map
      }, new Map())

      myFinalListWithBedInfo.forEach((slot) => {
        const patientFromStore = patientMap.value.get(slot.patientId)
        if (!patientFromStore) return
        const shiftCode = slot.shiftKey.split('-').pop()
        const patientRoles = myAssignments.get(slot.patientId) || new Set()

        const createPatientObject = (roleOverride = null) => {
          const dailyBedNum = getBedNumberFromKey(slot.shiftKey)
          const finalBedNum = !isNaN(dailyBedNum) ? dailyBedNum : patientFromStore.bed || 'N/A'
          const pOrders = patientFromStore.dialysisOrders || {}
          let vascAccessString = pOrders.vascAccess || '–'
          if (pOrders.arterialNeedle && pOrders.venousNeedle) {
            vascAccessString += ` (${pOrders.arterialNeedle}/${pOrders.venousNeedle})`
          }

          const preparationInfo = {
            ak: pOrders.ak || '–',
            dialysateCa: pOrders.dialysateCa || '–',
            heparin: `${pOrders.heparinInitial ?? '–'}/${pOrders.heparinMaintenance ?? '–'}`,
            bloodFlow: pOrders.bloodFlow ?? '–',
            vascAccess: vascAccessString, // 👈 使用新的組合字串
          }
          const injectionsForPatient = injectionsMap.get(slot.patientId) || []
          const memos = (taskStore.feedMessages || []).filter(
            (msg) =>
              msg.patientId === slot.patientId &&
              msg.status === 'pending' &&
              (!msg.targetDate || msg.targetDate >= today),
          )

          return {
            id: `${slot.patientId}-${roleOverride || shiftCode}`,
            patientId: slot.patientId,
            shift: translateShift(roleOverride || shiftCode),
            shiftCode: roleOverride || shiftCode,
            bedNum: finalBedNum,
            name: patientFromStore.name,
            preparation: preparationInfo,
            // ✨ 核心修正 1：直接回傳原始的針劑物件陣列
            injections: injectionsForPatient,
            memos: memos,
          }
        }

        if (patientRoles.has('main') && shiftCode === 'early')
          groupedResults.early.push(createPatientObject())
        if (patientRoles.has('main') && shiftCode === 'late')
          groupedResults.late.push(createPatientObject())
        if (patientRoles.has('noonOn') && shiftCode === 'noon')
          groupedResults.noonOn.push(createPatientObject('noonOn'))
        if (patientRoles.has('noonOff') && shiftCode === 'noon')
          groupedResults.noonOff.push(createPatientObject('noonOff'))
      })

      for (const shift in groupedResults) {
        groupedResults[shift].sort((a, b) => {
          if (a.bedNum === 'N/A') return 1
          if (b.bedNum === 'N/A') return -1
          return a.bedNum - b.bedNum
        })
      }
      patientListByShift.value = groupedResults
    } catch (error) {
      console.error('[useMyPatientList] 錯誤:', error)
      patientListByShift.value = {}
    } finally {
      isLoading.value = false
    }
  }

  // ✨ 核心修正 2：移除對 medicationStore.dailyInjectionsCache 的監聽
  watch(
    () => [currentUser.value?.uid, patientStore.allPatients, taskStore.feedMessages],
    ([uid]) => {
      if (uid && !patientStore.isLoading && !taskStore.isLoading) {
        processAndBuildList()
      } else if (!uid) {
        isLoading.value = false
        patientListByShift.value = {}
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
    const map = {
      early: '早班 (主責)',
      noon: '午班 (主責)',
      late: '晚班 (主責)',
      noonOn: '午班 (上針)',
      noonOff: '午班 (收針)',
    }
    return map[shiftKey] || shiftKey
  }

  const refreshData = () => {
    if (!isLoading.value) {
      medicationStore.clearCache()
      processAndBuildList()
    }
  }

  return { isLoading, patientListByShift, fetchMyPatientData: refreshData }
}
