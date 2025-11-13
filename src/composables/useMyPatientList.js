// 檔案路徑: src/composables/useMyPatientList.js (v14 - 按班別分組 - 完整無省略版)

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

  // patientListByShift 現在是一個物件，用來儲存分組後的列表
  const patientListByShift = ref({})

  const patientMap = computed(() => new Map(patientStore.allPatients.map((p) => [p.id, p])))

  const processAndBuildList = async () => {
    if (!currentUser.value) {
      patientListByShift.value = {}
      isLoading.value = false
      return
    }
    isLoading.value = true
    try {
      const today = formatDateToYYYYMMDD(new Date())
      const currentUserName = currentUser.value.name
      const assignmentsSnapshot = await assignmentsApi.fetchAll([where('date', '==', today)])
      const myAssignedIds = new Set()
      // myAssignments 現在是一個 Map，儲存 patientId -> Set[班別責任]
      const myAssignments = new Map()

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
              const roles = []
              if (myTeamCodes.includes(teamAssignment.nurseTeam)) roles.push('main') // 主責
              if (myTeamCodes.includes(teamAssignment.nurseTeamIn)) roles.push('noonOn') // 午班上針
              if (myTeamCodes.includes(teamAssignment.nurseTeamOut)) roles.push('noonOff') // 午班收針
              if (myTeamCodes.includes(teamAssignment.nurseTeamTakeOff)) roles.push('lateOff') // 夜班收針

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
      const allInjections = medicationStore.getInjectionsForDate(today) || []
      const injectionsMap = allInjections.reduce((map, injection) => {
        if (!map.has(injection.patientId)) map.set(injection.patientId, [])
        map.get(injection.patientId).push(injection)
        return map
      }, new Map())

      const groupedResults = {
        early: [],
        noonOn: [],
        noonOff: [],
        late: [],
      }

      const patientProcessingPromises = myFinalListWithBedInfo.map(async (slot) => {
        const patientFromStore = patientMap.value.get(slot.patientId)
        if (!patientFromStore) return

        const shiftCode = slot.shiftKey.split('-').pop()
        const patientRoles = myAssignments.get(slot.patientId) || new Set()

        const createPatientObject = (roleOverride = null) => {
          const dailyBedNum = getBedNumberFromKey(slot.shiftKey)
          const finalBedNum = !isNaN(dailyBedNum) ? dailyBedNum : patientFromStore.bed || 'N/A'
          const preparationInfo = {
            ak: patientFromStore.dialysisOrders?.ak || '–',
            dialysateCa: patientFromStore.dialysisOrders?.dialysateCa || '–',
            heparin: `${patientFromStore.dialysisOrders?.heparinInitial ?? '–'}/${patientFromStore.dialysisOrders?.heparinMaintenance ?? '–'}`,
            bloodFlow: patientFromStore.dialysisOrders?.bloodFlow ?? '–',
            vascAccess: `${patientFromStore.dialysisOrders?.vascAccess || '–'} (${patientFromStore.dialysisOrders?.arterialNeedle || 'N/A'}/${patientFromStore.dialysisOrders?.venousNeedle || 'N/A'})`,
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
        }

        // 根據病人的職責，將他放到不同的組別中
        if (patientRoles.has('main') && shiftCode === 'early') {
          groupedResults.early.push(createPatientObject())
        }
        if (patientRoles.has('main') && shiftCode === 'late') {
          groupedResults.late.push(createPatientObject())
        }
        if (patientRoles.has('noonOn') && shiftCode === 'noon') {
          groupedResults.noonOn.push(createPatientObject('noonOn'))
        }
        if (patientRoles.has('noonOff') && shiftCode === 'noon') {
          groupedResults.noonOff.push(createPatientObject('noonOff'))
        }
      })

      await Promise.all(patientProcessingPromises)

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

  watch(
    () => [
      currentUser.value?.uid,
      patientStore.allPatients,
      taskStore.feedMessages,
      medicationStore.dailyInjectionsCache,
    ],
    ([uid]) => {
      if (uid && !patientStore.isLoading) processAndBuildList()
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

  return {
    isLoading,
    patientListByShift,
    fetchMyPatientData: refreshData,
  }
}
