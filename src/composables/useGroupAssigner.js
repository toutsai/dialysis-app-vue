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
  // 分組統計儀表板 - 加入預備75班統計
  const groupCountsDashboard = computed(() => {
    const schedule = scheduleSource.value
    if (!schedule || !schedule.scheduleByNurse) {
      return { header: ['護理師'], nurses: [] }
    }

    const nurses = {}
    const dayGroups = new Set()
    const nightGroups = new Set()

    // 收集所有護理師和組別資料
    Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
      if (!nurses[nurseId]) {
        nurses[nurseId] = {
          id: nurseId,
          name: nurseData.nurseName,
          dayCounts: {},
          nightCounts: {},
          standby75Count: 0, // 預備75班次數
        }
      }

      // 統計組別
      if (nurseData.groups && nurseData.shifts) {
        nurseData.groups.forEach((group, index) => {
          if (group) {
            const shift = nurseData.shifts[index]
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

      // 統計預備75班
      if (nurseData.standby75Days && nurseData.standby75Days.length > 0) {
        nurses[nurseId].standby75Count = nurseData.standby75Days.length
      }
    })

    // 排序組別
    const sortedDayGroups = Array.from(dayGroups).sort()
    const sortedNightGroups = Array.from(nightGroups).sort()

    // 建立表頭
    const header = ['護理師']
    sortedDayGroups.forEach((group) => header.push(`白${group}`))
    sortedNightGroups.forEach((group) => header.push(`晚${group}`))
    header.push('預備75') // 新增預備75欄位

    // 整理資料
    const nursesList = Object.values(nurses)
    nursesList.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'))

    nursesList.forEach((nurse) => {
      nurse.counts = {}
      sortedDayGroups.forEach((group) => {
        nurse.counts[`白${group}`] = nurse.dayCounts[group] || 0
      })
      sortedNightGroups.forEach((group) => {
        nurse.counts[`晚${group}`] = nurse.nightCounts[group] || 0
      })
      nurse.counts['預備75'] = nurse.standby75Count
    })

    return { header, nurses: nursesList }
  })

  // 判斷函式
  const isDayShift = (shift) => {
    const s = (shift || '').trim()
    const EARLY_SHIFTS = ['74', '75', '84']
    return EARLY_SHIFTS.some((es) => s.includes(es))
  }

  const isNightShift = (shift) => {
    const s = (shift || '').trim()
    const LATE_SHIFTS = ['311', '3-11']
    return LATE_SHIFTS.some((ls) => s.includes(ls))
  }

  // 自動分組並分配預備75班
  const generateGroupAssignments = (originalSchedule) => {
    if (!originalSchedule) return null

    const schedule = JSON.parse(JSON.stringify(originalSchedule))

    // 初始化
    Object.values(schedule.scheduleByNurse).forEach((nurseData) => {
      if (!nurseData.groups) {
        nurseData.groups = new Array(nurseData.shifts?.length || 0).fill('')
      }
      if (!nurseData.standby75Days) {
        nurseData.standby75Days = []
      }
    })

    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)
    const daysInMonth = schedule.maxDaysInMonth || new Date(year, month, 0).getDate()

    // 用於追蹤每個護理師被分配預備75班的次數
    const standby75Counts = {}
    Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
      standby75Counts[nurseId] = 0
    })

    for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
      const date = new Date(year, month - 1, dayIndex + 1)
      const dayOfWeek = date.getDay()

      // 收集當天的白班和晚班護理師
      const dayShiftNurses = []
      const nightShiftNurses = []
      const eligibleFor75Standby = [] // 可以當預備75班的護理師

      Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
        const shift = nurseData.shifts?.[dayIndex]
        if (!shift) return

        const s = shift.trim()

        // 特殊班別不分組
        if (s.includes('74/L') || s.includes('816')) return
        if (s.includes('休') || s.includes('例') || s.includes('國定')) return

        if (isDayShift(s)) {
          dayShiftNurses.push(nurseId)

          // 74班的護理師可以當預備75班（排除原本就是75和74/L）
          if (s === '74' && !s.includes('74/L')) {
            eligibleFor75Standby.push(nurseId)
          }
        } else if (isNightShift(s)) {
          nightShiftNurses.push(nurseId)
        }
      })

      // 分配白班組別
      const dayGroups = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
      dayShiftNurses.forEach((nurseId, index) => {
        if (index < dayGroups.length) {
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = dayGroups[index]
        }
      })

      // 分配晚班組別
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

      // 分配預備75班（從符合資格的護理師中選擇分配次數最少的）
      if (eligibleFor75Standby.length > 0) {
        // 根據已分配次數排序，選擇最少的
        eligibleFor75Standby.sort((a, b) => standby75Counts[a] - standby75Counts[b])

        // 如果有多個人次數相同，隨機選一個
        const minCount = standby75Counts[eligibleFor75Standby[0]]
        const candidates = eligibleFor75Standby.filter((id) => standby75Counts[id] === minCount)
        const selectedNurseId = candidates[Math.floor(Math.random() * candidates.length)]

        // 記錄預備75班
        schedule.scheduleByNurse[selectedNurseId].standby75Days.push(dayIndex)
        standby75Counts[selectedNurseId]++
      }
    }

    return schedule
  }

  return {
    groupCountsDashboard,
    generateGroupAssignments,
  }
}
