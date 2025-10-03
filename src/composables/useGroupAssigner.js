// 檔案路徑: src/composables/useGroupAssigner.js

import { computed } from 'vue'

export function useGroupAssigner(scheduleSource) {
  // 不能當夜班Leader的護理師名單
  const CANNOT_BE_NIGHT_LEADER = ['蘇愛玲', '陳淑玲', '謝慶諭', '林佩佳', '林芳羽', '蔡靜怡']

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
          standby75Count: 0,
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
    header.push('預備75')

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
    return ['74', '74/L', '75', '816'].includes(s)
  }

  const isNightShift = (shift) => {
    const s = (shift || '').trim()
    return ['311', '3-11'].some((ns) => s.includes(ns))
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

    // 用於追蹤75班F/J組的輪流
    let next75Group = 'F' // 開始用F組

    for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
      const date = new Date(year, month - 1, dayIndex + 1)
      const dayOfWeek = date.getDay()

      // 收集當天各班別的護理師
      const nurses74 = [] // 74班護理師
      const nurses75 = [] // 75班護理師
      const nurses74L = [] // 74/L班護理師
      const nurses816 = [] // 816班護理師
      const nurses311 = [] // 311夜班護理師
      const eligibleFor75Standby = [] // 可以當預備75班的護理師

      Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
        const shift = nurseData.shifts?.[dayIndex]
        if (!shift) return

        const s = shift.trim()

        // 跳過休假
        if (s.includes('休') || s.includes('例') || s.includes('國定')) return

        // 依班別分類
        if (s === '74') {
          nurses74.push(nurseId)
          eligibleFor75Standby.push(nurseId)
        } else if (s === '75') {
          nurses75.push(nurseId)
        } else if (s === '74/L') {
          nurses74L.push(nurseId)
        } else if (s === '816') {
          nurses816.push(nurseId)
        } else if (isNightShift(s)) {
          nurses311.push(nurseId)
        }
      })

      // 分配白班組別

      // 74/L 固定 A 組
      nurses74L.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = 'A'
      })

      // 816 固定外圍組
      nurses816.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = '外圍'
      })

      // 75班輪流 F 或 J 組
      nurses75.forEach((nurseId) => {
        schedule.scheduleByNurse[nurseId].groups[dayIndex] = next75Group
      })
      // 下一個75班換組
      if (nurses75.length > 0) {
        next75Group = next75Group === 'F' ? 'J' : 'F'
      }

      // 74班分配 B、C、D、E、G、H、I、K 組
      const available74Groups = ['B', 'C', 'D', 'E', 'G', 'H', 'I', 'K']
      nurses74.forEach((nurseId, index) => {
        if (index < available74Groups.length) {
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = available74Groups[index]
        }
      })

      // 分配夜班組別 (311) - 修正版
      if (nurses311.length > 0) {
        let nightGroups = []
        // 根據星期決定夜班組別數量
        if ([1, 3, 5].includes(dayOfWeek)) {
          nightGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
        } else if ([2, 4, 6].includes(dayOfWeek)) {
          nightGroups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        }

        if (nightGroups.length > 0) {
          // 將護理師分為可以當Leader和不能當Leader兩組
          const canBeLeader = []
          const cannotBeLeader = []

          nurses311.forEach((nurseId) => {
            const nurseName = schedule.scheduleByNurse[nurseId].nurseName
            if (CANNOT_BE_NIGHT_LEADER.includes(nurseName)) {
              cannotBeLeader.push(nurseId)
            } else {
              canBeLeader.push(nurseId)
            }
          })

          // 隨機排序可以當Leader的護理師
          canBeLeader.sort(() => Math.random() - 0.5)
          // 隨機排序不能當Leader的護理師
          cannotBeLeader.sort(() => Math.random() - 0.5)

          let groupIndex = 0

          // 先分配A組給可以當Leader的護理師（如果有的話）
          if (nightGroups[0] === 'A' && canBeLeader.length > 0) {
            schedule.scheduleByNurse[canBeLeader[0]].groups[dayIndex] = 'A'
            canBeLeader.shift() // 移除已分配的護理師
            groupIndex = 1 // 從B組開始分配剩餘的
          }

          // 分配剩餘的組別給剩餘的護理師（先分配給可以當Leader的，再分配給不能的）
          const remainingNurses = [...canBeLeader, ...cannotBeLeader]

          remainingNurses.forEach((nurseId) => {
            if (groupIndex < nightGroups.length) {
              schedule.scheduleByNurse[nurseId].groups[dayIndex] = nightGroups[groupIndex]
              groupIndex++
            }
          })
        }
      }

      // 分配預備75班（從74班護理師中選擇）
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
    CANNOT_BE_NIGHT_LEADER, // 匯出這個常數供其他地方使用
  }
}
