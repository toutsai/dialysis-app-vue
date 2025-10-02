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
export function useGroupAssigner(scheduleSource) {
  // 分組統計儀表板 - 分開統計白班和晚班
  const groupCountsDashboard = computed(() => {
    const schedule = scheduleSource.value
    if (!schedule || !schedule.scheduleByNurse) {
      return { header: ['護理師'], nurses: [] }
    }

    const nurses = {}
    const dayGroups = new Set() // 白班組別
    const nightGroups = new Set() // 晚班組別

    // 收集所有護理師和組別
    Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
      if (!nurses[nurseId]) {
        nurses[nurseId] = {
          id: nurseId,
          name: nurseData.nurseName,
          dayCounts: {}, // 白班組別計數
          nightCounts: {}, // 晚班組別計數
        }
      }

      if (nurseData.groups && nurseData.shifts) {
        nurseData.groups.forEach((group, index) => {
          if (group) {
            const shift = nurseData.shifts[index]
            // 判斷是白班還是晚班
            if (shift && isDayShift(shift)) {
              dayGroups.add(group)
              nurses[nurseId].dayCounts[group] = (nurses[nurseId].dayCounts[group] || 0) + 1
            } else if (shift && isNightShift(shift)) {
              nightGroups.add(group)
              nurses[nurseId].nightCounts[group] = (nurses[nurseId].nightCounts[group] || 0) + 1
            }
          }
        })
      }
    })

    // 排序組別
    const sortedDayGroups = Array.from(dayGroups).sort()
    const sortedNightGroups = Array.from(nightGroups).sort()

    // 建立表頭 - 白班組別加上"白"前綴，晚班組別加上"晚"前綴
    const header = ['護理師']
    sortedDayGroups.forEach((group) => header.push(`白${group}`))
    sortedNightGroups.forEach((group) => header.push(`晚${group}`))

    // 整理資料
    const nursesList = Object.values(nurses)
    nursesList.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))

    // 為每個護理師建立統計資料
    nursesList.forEach((nurse) => {
      nurse.counts = {}
      // 白班組別
      sortedDayGroups.forEach((group) => {
        nurse.counts[`白${group}`] = nurse.dayCounts[group] || 0
      })
      // 晚班組別
      sortedNightGroups.forEach((group) => {
        nurse.counts[`晚${group}`] = nurse.nightCounts[group] || 0
      })
    })

    return { header, nurses: nursesList }
  })

  // 判斷是否為白班
  const isDayShift = (shift) => {
    const s = (shift || '').trim()
    const EARLY_SHIFTS = ['74', '75', '84']
    return EARLY_SHIFTS.some((es) => s.includes(es))
  }

  // 判斷是否為晚班
  const isNightShift = (shift) => {
    const s = (shift || '').trim()
    const LATE_SHIFTS = ['311', '3-11']
    return LATE_SHIFTS.some((ls) => s.includes(ls))
  }

  // 自動分組功能（保持原有邏輯）
  const generateGroupAssignments = (originalSchedule) => {
    if (!originalSchedule) return null

    const schedule = JSON.parse(JSON.stringify(originalSchedule))

    // 為每個護理師初始化 groups 陣列
    Object.values(schedule.scheduleByNurse).forEach((nurseData) => {
      if (!nurseData.groups) {
        nurseData.groups = new Array(nurseData.shifts?.length || 0).fill('')
      }
    })

    // 自動分配組別的邏輯
    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)
    const daysInMonth = schedule.maxDaysInMonth || new Date(year, month, 0).getDate()

    for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
      const date = new Date(year, month - 1, dayIndex + 1)
      const dayOfWeek = date.getDay()

      // 收集當天的白班和晚班護理師
      const dayShiftNurses = []
      const nightShiftNurses = []

      Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
        const shift = nurseData.shifts?.[dayIndex]
        if (!shift) return

        const s = shift.trim()

        // 特殊班別不分組
        if (s.includes('74/L') || s.includes('816')) return
        if (s.includes('休') || s.includes('例') || s.includes('國定')) return

        if (isDayShift(s)) {
          dayShiftNurses.push(nurseId)
        } else if (isNightShift(s)) {
          nightShiftNurses.push(nurseId)
        }
      })

      // 分配白班組別 (B-K組)
      const dayGroups = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
      dayShiftNurses.forEach((nurseId, index) => {
        if (index < dayGroups.length) {
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = dayGroups[index]
        }
      })

      // 分配晚班組別 (根據星期幾)
      let nightGroups = []
      if ([1, 3, 5].includes(dayOfWeek)) {
        nightGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
      } else if ([2, 4, 6].includes(dayOfWeek)) {
        nightGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      }

      nightShiftNurses.forEach((nurseId, index) => {
        if (index < nightGroups.length) {
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = nightGroups[index]
        }
      })
    }

    return schedule
  }

  return {
    groupCountsDashboard,
    generateGroupAssignments,
  }
}
