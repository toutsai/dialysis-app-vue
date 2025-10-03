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

  // 主要的分組分配函式（支援所有天數）
  const assignGroupsForDays = (
    schedule,
    dayIndices,
    groupCounts = null,
    standby75Counts = null,
  ) => {
    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)

    // 初始化計數器
    if (!groupCounts) {
      groupCounts = {}
      Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
        groupCounts[nurseId] = {
          74: {}, // 74班各組計數
          75: { F: 0, J: 0 }, // 75班F/J組計數
          311: {}, // 夜班各組計數
        }
      })
    }

    if (!standby75Counts) {
      standby75Counts = {}
      Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
        standby75Counts[nurseId] = schedule.scheduleByNurse[nurseId].standby75Days?.length || 0
      })
    }

    // 用於追蹤75班F/J組的輪流
    let next75Group = 'F'

    // 檢查最近的75班是哪一組
    for (let i = dayIndices[0] - 1; i >= 0; i--) {
      let found75 = false
      Object.values(schedule.scheduleByNurse).forEach((nurseData) => {
        if (nurseData.shifts?.[i] === '75' && nurseData.groups?.[i]) {
          next75Group = nurseData.groups[i] === 'F' ? 'J' : 'F'
          found75 = true
        }
      })
      if (found75) break
    }

    // 處理每一天
    dayIndices.forEach((dayIndex) => {
      const date = new Date(year, month - 1, dayIndex + 1)
      const dayOfWeek = date.getDay()

      // 收集當天各班別的護理師
      const nurses74 = []
      const nurses75 = []
      const nurses74L = []
      const nurses816 = []
      const nurses311 = []
      const eligibleFor75Standby = []

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

      // 75班輪流 F 或 J 組（考慮平衡）
      if (nurses75.length > 0) {
        nurses75.forEach((nurseId) => {
          // 選擇次數較少的組
          const fCount = groupCounts[nurseId]['75']['F'] || 0
          const jCount = groupCounts[nurseId]['75']['J'] || 0

          let assignedGroup = next75Group
          if (fCount < jCount) {
            assignedGroup = 'F'
          } else if (jCount < fCount) {
            assignedGroup = 'J'
          }

          schedule.scheduleByNurse[nurseId].groups[dayIndex] = assignedGroup
          groupCounts[nurseId]['75'][assignedGroup] =
            (groupCounts[nurseId]['75'][assignedGroup] || 0) + 1
        })
        // 下一個75班換組
        next75Group = next75Group === 'F' ? 'J' : 'F'
      }

      // 74班分配 B、C、D、E、G、H、I、K 組（考慮平衡）
      const available74Groups = ['B', 'C', 'D', 'E', 'G', 'H', 'I', 'K']

      if (nurses74.length > 0) {
        // 計算每個護理師在每個組的次數
        const nurseGroupPriority = nurses74.map((nurseId) => {
          const counts = available74Groups.map((group) => ({
            group,
            count: groupCounts[nurseId]['74'][group] || 0,
          }))
          counts.sort((a, b) => a.count - b.count)
          return { nurseId, priority: counts }
        })

        // 分配組別，優先給次數少的
        const usedGroups = new Set()
        nurseGroupPriority.forEach(({ nurseId, priority }) => {
          for (const { group } of priority) {
            if (!usedGroups.has(group) && available74Groups.includes(group)) {
              schedule.scheduleByNurse[nurseId].groups[dayIndex] = group
              groupCounts[nurseId]['74'][group] = (groupCounts[nurseId]['74'][group] || 0) + 1
              usedGroups.add(group)
              break
            }
          }
        })
      }

      // 分配夜班組別 (311) - 考慮平衡
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

          // 根據已分配次數排序（次數少的優先）
          canBeLeader.sort((a, b) => {
            const aCount = Object.values(groupCounts[a]['311'] || {}).reduce((sum, c) => sum + c, 0)
            const bCount = Object.values(groupCounts[b]['311'] || {}).reduce((sum, c) => sum + c, 0)
            return aCount - bCount
          })

          cannotBeLeader.sort((a, b) => {
            const aCount = Object.values(groupCounts[a]['311'] || {}).reduce((sum, c) => sum + c, 0)
            const bCount = Object.values(groupCounts[b]['311'] || {}).reduce((sum, c) => sum + c, 0)
            return aCount - bCount
          })

          let groupIndex = 0

          // 先分配A組給可以當Leader的護理師
          if (nightGroups[0] === 'A' && canBeLeader.length > 0) {
            // 選擇A組次數最少的人
            let selectedLeader = canBeLeader[0]
            let minACount = groupCounts[selectedLeader]['311']['A'] || 0

            canBeLeader.forEach((nurseId) => {
              const aCount = groupCounts[nurseId]['311']['A'] || 0
              if (aCount < minACount) {
                selectedLeader = nurseId
                minACount = aCount
              }
            })

            schedule.scheduleByNurse[selectedLeader].groups[dayIndex] = 'A'
            groupCounts[selectedLeader]['311']['A'] =
              (groupCounts[selectedLeader]['311']['A'] || 0) + 1
            canBeLeader.splice(canBeLeader.indexOf(selectedLeader), 1)
            groupIndex = 1
          }

          // 分配剩餘的組別
          const remainingNurses = [...canBeLeader, ...cannotBeLeader]
          const remainingGroups = nightGroups.slice(groupIndex)

          if (remainingNurses.length > 0 && remainingGroups.length > 0) {
            // 計算每個護理師對每個組的優先權（基於次數）
            const assignments = []
            remainingNurses.forEach((nurseId) => {
              remainingGroups.forEach((group) => {
                const count = groupCounts[nurseId]['311'][group] || 0
                assignments.push({ nurseId, group, count })
              })
            })

            // 按次數排序
            assignments.sort((a, b) => a.count - b.count)

            // 分配組別
            const assignedNurses = new Set()
            const assignedGroups = new Set()

            assignments.forEach(({ nurseId, group }) => {
              if (!assignedNurses.has(nurseId) && !assignedGroups.has(group)) {
                schedule.scheduleByNurse[nurseId].groups[dayIndex] = group
                groupCounts[nurseId]['311'][group] = (groupCounts[nurseId]['311'][group] || 0) + 1
                assignedNurses.add(nurseId)
                assignedGroups.add(group)
              }
            })
          }
        }
      }

      // 分配預備75班（從74班護理師中選擇，考慮平衡）
      if (eligibleFor75Standby.length > 0) {
        // 根據已分配次數排序，選擇最少的
        eligibleFor75Standby.sort((a, b) => standby75Counts[a] - standby75Counts[b])

        // 如果有多個人次數相同，隨機選一個
        const minCount = standby75Counts[eligibleFor75Standby[0]]
        const candidates = eligibleFor75Standby.filter((id) => standby75Counts[id] === minCount)
        const selectedNurseId = candidates[Math.floor(Math.random() * candidates.length)]

        // 記錄預備75班
        if (!schedule.scheduleByNurse[selectedNurseId].standby75Days) {
          schedule.scheduleByNurse[selectedNurseId].standby75Days = []
        }
        schedule.scheduleByNurse[selectedNurseId].standby75Days.push(dayIndex)
        standby75Counts[selectedNurseId]++
      }
    })

    return { groupCounts, standby75Counts }
  }

  // 自動分組並分配預備75班（初始分配）
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

    // 初始化週次確認狀態
    if (!schedule.weekConfirmed) {
      schedule.weekConfirmed = {
        week1: false,
        week2: false,
        week3: false,
        week4: false,
        week5: false,
      }
    }

    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)
    const daysInMonth = schedule.maxDaysInMonth || new Date(year, month, 0).getDate()

    // 建立所有天數的陣列
    const allDayIndices = []
    for (let i = 0; i < daysInMonth; i++) {
      allDayIndices.push(i)
    }

    // 執行分配
    assignGroupsForDays(schedule, allDayIndices)

    return schedule
  }

  // 基於已確認週次重新分配剩餘週次
  const redistributeRemainingWeeks = (schedule, weeklyData) => {
    if (!schedule || !weeklyData) return schedule

    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)

    // 收集已確認週次的統計
    const groupCounts = {}
    const standby75Counts = {}

    Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
      groupCounts[nurseId] = {
        74: {},
        75: { F: 0, J: 0 },
        311: {},
      }
      standby75Counts[nurseId] = 0
    })

    // 統計已確認週次的分組情況
    weeklyData.forEach((week, weekIndex) => {
      if (schedule.weekConfirmed?.[`week${weekIndex + 1}`]) {
        week.days.forEach((day) => {
          if (day.isCurrentMonth) {
            Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
              const group = nurseData.groups?.[day.dayIndex]
              const shift = nurseData.shifts?.[day.dayIndex]

              if (group && shift) {
                if (shift === '74') {
                  groupCounts[nurseId]['74'][group] = (groupCounts[nurseId]['74'][group] || 0) + 1
                } else if (shift === '75') {
                  groupCounts[nurseId]['75'][group] = (groupCounts[nurseId]['75'][group] || 0) + 1
                } else if (isNightShift(shift)) {
                  groupCounts[nurseId]['311'][group] = (groupCounts[nurseId]['311'][group] || 0) + 1
                }
              }

              if (nurseData.standby75Days?.includes(day.dayIndex)) {
                standby75Counts[nurseId]++
              }
            })
          }
        })
      }
    })

    // 清除並重新分配未確認週次
    weeklyData.forEach((week, weekIndex) => {
      if (!schedule.weekConfirmed?.[`week${weekIndex + 1}`]) {
        // 收集這週的所有當月天數
        const weekDayIndices = []
        week.days.forEach((day) => {
          if (day.isCurrentMonth) {
            weekDayIndices.push(day.dayIndex)

            // 清除原有的分組和預備75班
            Object.entries(schedule.scheduleByNurse).forEach(([nurseId, nurseData]) => {
              if (nurseData.groups) {
                nurseData.groups[day.dayIndex] = ''
              }
              if (nurseData.standby75Days) {
                const idx = nurseData.standby75Days.indexOf(day.dayIndex)
                if (idx > -1) {
                  nurseData.standby75Days.splice(idx, 1)
                }
              }
            })
          }
        })

        // 重新分配這週的組別
        if (weekDayIndices.length > 0) {
          const result = assignGroupsForDays(schedule, weekDayIndices, groupCounts, standby75Counts)
          // 更新計數器供下一週使用
          Object.assign(groupCounts, result.groupCounts)
          Object.assign(standby75Counts, result.standby75Counts)
        }
      }
    })

    return schedule
  }

  return {
    groupCountsDashboard,
    generateGroupAssignments,
    redistributeRemainingWeeks,
    CANNOT_BE_NIGHT_LEADER,
  }
}
