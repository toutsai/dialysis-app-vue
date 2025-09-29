import { computed } from 'vue'

// --- 定義班別與分組常數 ---
const DAY_SHIFTS = ['74', '75']
const LEADER_SHIFT = '74/L'
const PERIPHERAL_SHIFT = '816'
const NIGHT_SHIFTS = ['311', '3-11']

const AVAILABLE_DAY_GROUPS = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const NIGHT_GROUPS_MWF = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
const NIGHT_GROUPS_TTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const ALL_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']

/**
 * @param {import('vue').Ref<Object>} scheduleDataRef - 一個包含班表資料的 ref 或 computed ref
 */
export function useGroupAssigner(scheduleDataRef) {
  /**
   * 計算屬性：根據傳入的班表資料，即時產生護理師分組儀表板所需的數據
   */
  const groupCountsDashboard = computed(() => {
    const scheduleByNurse = scheduleDataRef.value?.scheduleByNurse
    if (!scheduleByNurse) {
      return { header: [], nurses: [] }
    }

    const dashboard = {
      header: ['護理師', ...ALL_GROUPS],
      nurses: [],
    }

    const sourceForOrder = scheduleDataRef.value
    const nurseEntries = Object.entries(scheduleByNurse)

    if (sourceForOrder?.processingOrder) {
      const orderMap = new Map(sourceForOrder.processingOrder.map((id, index) => [id, index]))
      nurseEntries.sort((a, b) => (orderMap.get(a[0]) ?? 999) - (orderMap.get(b[0]) ?? 999))
    } else {
      nurseEntries.sort((a, b) => a[1].nurseName.localeCompare(b[1].nurseName, 'zh-TW'))
    }

    nurseEntries.forEach(([nurseId, nurseData]) => {
      if (!nurseData) return
      const counts = {}
      ALL_GROUPS.forEach((g) => (counts[g] = 0))

      if (nurseData.groups) {
        nurseData.groups.forEach((group) => {
          if (group && counts[group] !== undefined) {
            counts[group]++
          }
        })
      }

      dashboard.nurses.push({
        id: nurseId,
        name: nurseData.nurseName,
        counts: counts,
      })
    })

    return dashboard
  })

  /**
   * 核心演算法：為月班表自動指派護理分組
   * @param {object} monthlySchedule - 原始月班表資料
   * @returns {object} - 一個新的、附加了 group 資訊的班表物件
   */
  const generateGroupAssignments = (monthlySchedule) => {
    if (!monthlySchedule || !monthlySchedule.scheduleByNurse) {
      return null
    }

    const newSchedule = JSON.parse(JSON.stringify(monthlySchedule))
    const { yearMonth, maxDaysInMonth, scheduleByNurse } = newSchedule
    const [year, month] = yearMonth.split('-').map(Number)
    const nurseIds = Object.keys(scheduleByNurse)

    const nurseGroupCounts = {}
    const lastAssignedGroup = {}
    nurseIds.forEach((id) => {
      nurseGroupCounts[id] = {}
      ALL_GROUPS.forEach((group) => {
        nurseGroupCounts[id][group] = 0
      })
      lastAssignedGroup[id] = null
      if (!scheduleByNurse[id].groups) {
        scheduleByNurse[id].groups = new Array(maxDaysInMonth).fill('')
      }
    })

    for (let dayIndex = 0; dayIndex < maxDaysInMonth; dayIndex++) {
      const currentDate = new Date(year, month - 1, dayIndex + 1)
      const dayOfWeek = currentDate.getDay()

      let availableDayGroupsToday = [...AVAILABLE_DAY_GROUPS]
      const workingDayNurses = nurseIds.filter((id) => {
        const shift = (scheduleByNurse[id].shifts[dayIndex] || '').trim()
        return (
          DAY_SHIFTS.some((s) => shift.includes(s)) &&
          !shift.includes(LEADER_SHIFT) &&
          !shift.includes(PERIPHERAL_SHIFT)
        )
      })

      workingDayNurses.forEach((nurseId) => {
        if (availableDayGroupsToday.length === 0) return
        availableDayGroupsToday.sort((groupA, groupB) => {
          let scoreA = nurseGroupCounts[nurseId][groupA] * 10
          let scoreB = nurseGroupCounts[nurseId][groupB] * 10
          if (groupA === lastAssignedGroup[nurseId]) scoreA += 5
          if (groupB === lastAssignedGroup[nurseId]) scoreB += 5
          return scoreA - scoreB
        })
        const bestGroup = availableDayGroupsToday.shift()
        scheduleByNurse[nurseId].groups[dayIndex] = bestGroup
        nurseGroupCounts[nurseId][bestGroup]++
      })

      let nightGroupPool = null
      if ([1, 3, 5].includes(dayOfWeek)) nightGroupPool = [...NIGHT_GROUPS_MWF]
      else if ([2, 4, 6].includes(dayOfWeek)) nightGroupPool = [...NIGHT_GROUPS_TTS]

      if (nightGroupPool) {
        const workingNightNurses = nurseIds.filter((id) =>
          NIGHT_SHIFTS.some((s) => (scheduleByNurse[id].shifts[dayIndex] || '').includes(s)),
        )
        workingNightNurses.forEach((nurseId) => {
          if (nightGroupPool.length === 0) return
          nightGroupPool.sort((groupA, groupB) => {
            let scoreA = nurseGroupCounts[nurseId][groupA] * 10
            let scoreB = nurseGroupCounts[nurseId][groupB] * 10
            if (groupA === lastAssignedGroup[nurseId]) scoreA += 5
            if (groupB === lastAssignedGroup[nurseId]) scoreB += 5
            return scoreA - scoreB
          })
          const bestGroup = nightGroupPool.shift()
          scheduleByNurse[nurseId].groups[dayIndex] = bestGroup
          nurseGroupCounts[nurseId][bestGroup]++
        })
      }

      nurseIds.forEach((nurseId) => {
        const shift = (scheduleByNurse[nurseId].shifts[dayIndex] || '').trim()
        if (shift.includes(LEADER_SHIFT)) {
          scheduleByNurse[nurseId].groups[dayIndex] = 'A'
          nurseGroupCounts[nurseId]['A']++
        } else if (shift.includes(PERIPHERAL_SHIFT)) {
          scheduleByNurse[nurseId].groups[dayIndex] = '外圍'
          nurseGroupCounts[nurseId]['外圍']++
        }
        lastAssignedGroup[nurseId] = scheduleByNurse[nurseId].groups[dayIndex] || null
      })
    }

    return newSchedule
  }

  return {
    groupCountsDashboard,
    generateGroupAssignments,
  }
}
