// functions/services/scheduleEngineService.js

// --- 引入相依性 ---
// 這個服務也需要日期處理工具
const { getTaipeiDayIndex } = require('../utils/dateUtils')

// ===================================================================
// 核心常數 (從 index.js 移轉過來，使其獨立)
// ===================================================================

const FREQ_MAP_TO_DAY_INDEX = {
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
  每日: [0, 1, 2, 3, 4, 5],
  每周一: [0],
  每周二: [1],
  每周三: [2],
  每周四: [3],
  每周五: [4],
  每周六: [5],
}

const SHIFTS = ['early', 'noon', 'late']

// ===================================================================
// 核心輔助函式 (從 index.js 移轉過來，使其獨立)
// ===================================================================

/**
 * 根據床號和班別代碼生成唯一的排程 key
 * @param {string|number} bedNum - 床號
 * @param {string} shiftCode - 班別 ('early', 'noon', 'late')
 * @returns {string}
 */
const getScheduleKey = (bedNum, shiftCode) => {
  const prefix = String(bedNum).startsWith('peripheral') ? '' : 'bed-'
  return `${prefix}${bedNum}-${shiftCode}`
}

// ===================================================================
// 核心商業邏輯函式
// ===================================================================

/**
 * 根據總表規則生成基礎排程
 * @param {object} masterRules - 完整的總表規則物件
 * @param {Date} targetDate - 目標日期的 Date 物件
 * @returns {object} - 生成的基礎 schedule 物件
 */
function generateDailyScheduleFromRules(masterRules, targetDate) {
  const dailySchedule = {}
  const systemDayIndex = getTaipeiDayIndex(targetDate)

  for (const patientId in masterRules) {
    const rule = masterRules[patientId]
    if (!rule || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []
    if (freqDays.includes(systemDayIndex)) {
      const { bedNum, shiftIndex } = rule
      if (bedNum === undefined || shiftIndex === undefined) continue

      const shiftCode = SHIFTS[shiftIndex]
      const key = getScheduleKey(bedNum, shiftCode)
      dailySchedule[key] = {
        patientId: patientId,
        patientName: rule.patientName || '',
        shiftId: shiftCode,
        autoNote: rule.autoNote || '',
        manualNote: rule.manualNote || '',
        baseRuleId: patientId,
      }
    }
  }
  return dailySchedule
}

/**
 * ✨【核心演算引擎】✨
 * 根據總表和所有有效調班，計算出指定日期的最終正確排程。
 * 這是一個 "純函式"，只負責計算，不執行任何資料庫寫入。
 * @param {string} dateStr - 目標日期 'YYYY-MM-DD'
 * @param {object} masterRules - 完整的總表規則
 * @param {Map<string, object>} allAppliedExceptions - 所有有效的調班申請 Map
 * @returns {object} - 計算出的最終 schedule 物件
 */
function recalculateDailySchedule(dateStr, masterRules, allAppliedExceptions) {
  const targetDate = new Date(dateStr + 'T00:00:00Z')

  // 1. 根據總表規則生成當天的「乾淨」基礎排程
  let finalSchedule = generateDailyScheduleFromRules(masterRules, targetDate)

  // 2. 疊加所有在當天生效的有效調班
  // 為了處理依賴性，最好先對調班按創建時間排序
  const sortedExceptions = [...allAppliedExceptions.values()].sort((a, b) => {
    const timeA = a.createdAt?.toMillis() || 0
    const timeB = b.createdAt?.toMillis() || 0
    return timeA - timeB
  })

  for (const ex of sortedExceptions) {
    try {
      // 根據不同調班類型，修改 finalSchedule 物件
      switch (ex.type) {
        case 'MOVE':
          // 只有目標日期是今天時才處理加入，來源日期是今天時才處理移除
          if (ex.to.goalDate === dateStr || ex.from.sourceDate === dateStr) {
            // 為確保 MOVE 的優先級，先移除該病人在今天的所有排程
            Object.keys(finalSchedule).forEach((key) => {
              if (finalSchedule[key].patientId === ex.patientId) {
                delete finalSchedule[key]
              }
            })
          }
          // 如果目標是今天，則加入
          if (ex.to.goalDate === dateStr) {
            const targetKey = getScheduleKey(ex.to.bedNum, ex.to.shiftCode)
            finalSchedule[targetKey] = {
              patientId: ex.patientId,
              patientName: ex.patientName,
              exceptionId: ex.id,
              manualNote: '(換班)',
            }
          }
          break

        case 'ADD_SESSION':
          if (ex.to.goalDate === dateStr) {
            const targetKey = getScheduleKey(ex.to.bedNum, ex.to.shiftCode)
            finalSchedule[targetKey] = {
              patientId: ex.patientId,
              patientName: ex.patientName,
              exceptionId: ex.id,
              manualNote: '(臨時加洗)',
            }
          }
          break

        case 'SWAP':
          if (ex.date === dateStr) {
            const key1 = getScheduleKey(ex.patient1.fromBedNum, ex.patient1.fromShiftCode)
            const key2 = getScheduleKey(ex.patient2.fromBedNum, ex.patient2.fromShiftCode)
            const slot1Data = finalSchedule[key1]
              ? { ...finalSchedule[key1] }
              : { patientId: ex.patient1.patientId, patientName: ex.patient1.patientName }
            const slot2Data = finalSchedule[key2]
              ? { ...finalSchedule[key2] }
              : { patientId: ex.patient2.patientId, patientName: ex.patient2.patientName }

            // 執行交換
            finalSchedule[key1] = {
              ...slot2Data,
              exceptionId: ex.id,
              manualNote: `(與${ex.patient1.patientName}互調)`,
            }
            finalSchedule[key2] = {
              ...slot1Data,
              exceptionId: ex.id,
              manualNote: `(與${ex.patient2.patientName}互調)`,
            }
          }
          break

        case 'SUSPEND':
          const start = new Date(ex.startDate + 'T00:00:00Z')
          const end = new Date(ex.endDate + 'T00:00:00Z')
          if (targetDate >= start && targetDate <= end) {
            // 從排程中移除這位病人的所有班次
            Object.keys(finalSchedule).forEach((key) => {
              if (finalSchedule[key].patientId === ex.patientId) {
                delete finalSchedule[key]
              }
            })
          }
          break
      }
    } catch (applyError) {
      console.error(`[scheduleEngine] 在套用調班 ${ex.id} 時發生錯誤:`, applyError)
      // 在純函式中，我們記錄錯誤但繼續執行，以確保最大程度的正確性
    }
  }

  // ✨✨✨【核心修正：加入資料清理步驟】✨✨✨
  // 遍歷最終排程中的每一個位置，確保沒有 undefined 的值
  for (const key in finalSchedule) {
    const slot = finalSchedule[key]
    if (slot && typeof slot === 'object') {
      // 遍歷該位置物件的所有屬性
      for (const prop in slot) {
        if (slot[prop] === undefined) {
          // 如果任何屬性的值是 undefined，將其轉換為 null，這是 Firestore 接受的空值
          slot[prop] = null
        }
      }
    }
  }

  return finalSchedule
}

// ===================================================================
// 模組導出
// ===================================================================

module.exports = {
  recalculateDailySchedule,
  generateDailyScheduleFromRules, // 也導出它，以防其他地方需要單獨使用
  // 也導出常數和輔助函式，讓引入此模組的地方可以使用
  FREQ_MAP_TO_DAY_INDEX,
  SHIFTS,
  getScheduleKey,
}
