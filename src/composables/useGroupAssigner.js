// 檔案路徑: src/composables/useGroupAssigner.js

import { computed, ref } from 'vue'
import { getDefaultConfig } from '@/services/nursingGroupConfigService'

/**
 * 護理師組別分配 Composable
 * @param {Ref} scheduleSource - 班表資料來源
 * @param {Ref} groupConfigSource - 組別配置來源 (可選，預設使用內建預設值)
 */
export function useGroupAssigner(scheduleSource, groupConfigSource = null) {
  // 使用傳入的配置或預設配置
  const getConfig = () => {
    if (groupConfigSource && groupConfigSource.value) {
      return groupConfigSource.value
    }
    return getDefaultConfig()
  }

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

    // 整理資料 - 保持原始的護理師物件陣列
    const nursesList = Object.entries(nurses).map(([id, nurseData]) => {
      const nurse = {
        id: id,
        name: nurseData.name,
        dayCounts: nurseData.dayCounts,
        nightCounts: nurseData.nightCounts,
        standby75Count: nurseData.standby75Count,
        counts: {},
      }

      // 建立 counts 物件供表格顯示
      sortedDayGroups.forEach((group) => {
        nurse.counts[`白${group}`] = nurseData.dayCounts[group] || 0
      })
      sortedNightGroups.forEach((group) => {
        nurse.counts[`晚${group}`] = nurseData.nightCounts[group] || 0
      })
      nurse.counts['預備75'] = nurseData.standby75Count || 0

      return nurse
    })

    // 使用與 sortedSchedule 相同的排序邏輯
    if (schedule.processingOrder && schedule.processingOrder.length > 0) {
      const orderMap = new Map(schedule.processingOrder.map((id, index) => [id, index]))
      nursesList.sort((a, b) => {
        const orderA = orderMap.get(a.id) ?? 999
        const orderB = orderMap.get(b.id) ?? 999
        return orderA - orderB
      })
    } else {
      // 按照 nurseId (員工編號) 排序
      nursesList.sort((a, b) => {
        // 嘗試提取數字進行排序
        const numA = parseInt(a.id) || 999
        const numB = parseInt(b.id) || 999
        if (numA !== numB) {
          return numA - numB
        }
        // 如果數字相同或都不是數字，按字串排序
        return a.id.localeCompare(b.id)
      })
    }

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
    const config = getConfig()
    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)

    // 從配置取得組別設定
    const available74Groups = config.shift74Groups || ['B', 'C', 'D', 'E', 'G', 'H', 'I']
    const available75Groups = config.shift75Groups || ['F', 'J']
    const cannotBeNightLeaderIds = config.cannotBeNightLeader || []

    // 初始化計數器
    if (!groupCounts) {
      groupCounts = {}
      Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
        // 初始化 75 班的計數器（根據配置的組別）
        const init75Counts = {}
        available75Groups.forEach((g) => {
          init75Counts[g] = 0
        })
        groupCounts[nurseId] = {
          74: {}, // 74班各組計數
          75: init75Counts, // 75班組計數（根據配置）
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

    // 用於追蹤75班組的輪流 (用於決定當天主要使用哪一組)
    let next75GroupIndex = 0

    // 檢查最近的75班使用的組別，以決定起始偏好
    if (available75Groups.length > 0) {
      for (let i = dayIndices[0] - 1; i >= 0; i--) {
        let found75 = false
        Object.values(schedule.scheduleByNurse).forEach((nurseData) => {
          if (nurseData.shifts?.[i] === '75' && nurseData.groups?.[i]) {
            const usedGroup = nurseData.groups[i]
            const usedIndex = available75Groups.indexOf(usedGroup)
            if (usedIndex >= 0) {
              // 下一天使用下一個組
              next75GroupIndex = (usedIndex + 1) % available75Groups.length
              found75 = true
            }
          }
        })
        if (found75) break
      }
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

      // 75班分配組別（根據配置的可用組別）
      if (nurses75.length > 0 && available75Groups.length > 0) {
        // 建立每個組的分配清單
        const dayGroups75 = {}
        available75Groups.forEach((g) => {
          dayGroups75[g] = []
        })

        // 先根據每個護理師的歷史次數分配
        nurses75.forEach((nurseId) => {
          // 找出該護理師次數最少的組
          let minCount = Infinity
          let minGroup = available75Groups[next75GroupIndex]

          available75Groups.forEach((group) => {
            const count = groupCounts[nurseId]['75'][group] || 0
            if (count < minCount) {
              minCount = count
              minGroup = group
            }
          })

          dayGroups75[minGroup].push(nurseId)
        })

        // 如果只有一個護理師，使用輪流偏好組
        if (nurses75.length === 1) {
          const nurseId = nurses75[0]
          const group = available75Groups[next75GroupIndex]
          schedule.scheduleByNurse[nurseId].groups[dayIndex] = group
          groupCounts[nurseId]['75'][group] = (groupCounts[nurseId]['75'][group] || 0) + 1
          // 下一天換組
          next75GroupIndex = (next75GroupIndex + 1) % available75Groups.length
        } else {
          // 多個護理師時，確保每個組最多一人（如果可能）
          // 重新分配以確保平衡
          const allNurses75 = [...nurses75]
          const assignedNurses = new Set()

          // 優先分配到每個組一人
          available75Groups.forEach((group, idx) => {
            if (allNurses75.length > idx && !assignedNurses.has(allNurses75[idx])) {
              // 找出這個組次數最少的護理師
              let bestNurse = null
              let minCount = Infinity

              allNurses75.forEach((nurseId) => {
                if (!assignedNurses.has(nurseId)) {
                  const count = groupCounts[nurseId]['75'][group] || 0
                  if (count < minCount) {
                    minCount = count
                    bestNurse = nurseId
                  }
                }
              })

              if (bestNurse) {
                schedule.scheduleByNurse[bestNurse].groups[dayIndex] = group
                groupCounts[bestNurse]['75'][group] = (groupCounts[bestNurse]['75'][group] || 0) + 1
                assignedNurses.add(bestNurse)
              }
            }
          })

          // 如果還有未分配的護理師，分配到已有人的組（平衡分配）
          allNurses75.forEach((nurseId) => {
            if (!assignedNurses.has(nurseId)) {
              // 找出該護理師次數最少的組
              let minCount = Infinity
              let minGroup = available75Groups[0]

              available75Groups.forEach((group) => {
                const count = groupCounts[nurseId]['75'][group] || 0
                if (count < minCount) {
                  minCount = count
                  minGroup = group
                }
              })

              schedule.scheduleByNurse[nurseId].groups[dayIndex] = minGroup
              groupCounts[nurseId]['75'][minGroup] =
                (groupCounts[nurseId]['75'][minGroup] || 0) + 1
              assignedNurses.add(nurseId)
            }
          })

          // 更新下一天的偏好
          next75GroupIndex = (next75GroupIndex + 1) % available75Groups.length
        }
      }

      // 74班分配組別（考慮平衡）
      if (nurses74.length > 0 && available74Groups.length > 0) {
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

        // 根據星期從配置取得夜班組別
        const nightRules = config.nightShiftRules || {}
        if ([1, 3, 5].includes(dayOfWeek)) {
          nightGroups = nightRules['135']?.groups || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
        } else if ([2, 4, 6].includes(dayOfWeek)) {
          nightGroups = nightRules['246']?.groups || ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
        }

        if (nightGroups.length > 0) {
          // 將護理師分為可以當Leader和不能當Leader兩組
          const canBeLeader = []
          const cannotBeLeader = []

          nurses311.forEach((nurseId) => {
            // 使用 nurseId 比對（配置中存的是 nurseId）
            if (cannotBeNightLeaderIds.includes(nurseId)) {
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

    const config = getConfig()
    const available75Groups = config.shift75Groups || ['F', 'J']

    const yearMonth = schedule.yearMonth
    const [year, month] = yearMonth.split('-').map(Number)

    // 收集已確認週次的統計
    const groupCounts = {}
    const standby75Counts = {}

    Object.keys(schedule.scheduleByNurse).forEach((nurseId) => {
      // 初始化 75 班的計數器（根據配置的組別）
      const init75Counts = {}
      available75Groups.forEach((g) => {
        init75Counts[g] = 0
      })
      groupCounts[nurseId] = {
        74: {},
        75: init75Counts,
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

  // 取得目前配置（供外部參考）
  const currentConfig = computed(() => getConfig())

  return {
    groupCountsDashboard,
    generateGroupAssignments,
    redistributeRemainingWeeks,
    currentConfig,
  }
}
