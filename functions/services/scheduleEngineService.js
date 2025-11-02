// functions/services/scheduleEngineService.js (完整最終版)

// --- 引入相依性 ---
const { getTaipeiDayIndex } = require('../utils/dateUtils')
const { logger } = require('firebase-functions') // 引入 logger 以便記錄警告

// ===================================================================
// 核心常數
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
// 核心輔助函式
// ===================================================================

const getScheduleKey = (bedNum, shiftCode) => {
  const prefix = String(bedNum).startsWith('peripheral') ? '' : 'bed-'
  return `${prefix}${bedNum}-${shiftCode}`
}

// 🔥🔥🔥【全新且完整的 applySingleException 函式 v3.0】🔥🔥🔥
/**
 * 嘗試將單一調班申請應用到排程物件上。
 * 遵循「總表/既有排程優先」原則：如果目標床位已被佔用，則視為衝突。
 * @param {object} schedule - 正在被修改的排程物件 (會被直接修改)。
 * @param {object} ex - 要應用的單一調班申請資料。
 * @param {string} dateStr - 正在處理的目標日期 'YYYY-MM-DD'。
 * @returns {boolean} - 如果發生衝突則返回 true，如果成功應用或無需操作則返回 false。
 */
function applySingleException(schedule, ex, dateStr) {
  try {
    switch (ex.type) {
      case 'MOVE':
      case 'ADD_SESSION':
        const targetDate = ex.to?.goalDate
        // 如果此調班的目標日期不是今天，則跳過，不算衝突也不執行
        if (targetDate !== dateStr) {
          // 但 MOVE 類型需要額外處理「來源」在今天的情況
          if (ex.type === 'MOVE' && ex.from?.sourceDate === dateStr) {
            const sourceKey = getScheduleKey(ex.from.bedNum, ex.from.shiftCode)
            // 確保來源位置上確實是目標病人，然後將其移除
            if (schedule[sourceKey]?.patientId === ex.patientId) {
              delete schedule[sourceKey]
            }
          }
          return false
        }

        const targetKey = getScheduleKey(ex.to.bedNum, ex.to.shiftCode)

        // 🔥 核心簡化邏輯：只要目標床位上有任何人（且不是自己），就視為衝突
        if (schedule[targetKey] && schedule[targetKey].patientId !== ex.patientId) {
          logger.warn(
            `[Engine] 衝突偵測！調班 ${ex.id} 的目標床位 ${targetKey} 已被 ${schedule[targetKey].patientName} 佔據。`,
          )
          return true // 返回 true，通知呼叫者發生了衝突
        }

        // 如果沒有衝突，則正常執行操作
        if (ex.type === 'MOVE' && ex.from?.sourceDate === dateStr) {
          const sourceKey = getScheduleKey(ex.from.bedNum, ex.from.shiftCode)
          if (schedule[sourceKey]?.patientId === ex.patientId) {
            delete schedule[sourceKey]
          }
        }

        schedule[targetKey] = {
          patientId: ex.patientId,
          patientName: ex.patientName,
          exceptionId: ex.id,
          manualNote: ex.type === 'MOVE' ? '(換班)' : '(臨時加洗)',
        }
        return false // 成功執行，返回 false

      case 'SWAP':
        if (ex.date === dateStr) {
          const key1 = getScheduleKey(ex.patient1.fromBedNum, ex.patient1.fromShiftCode)
          const key2 = getScheduleKey(ex.patient2.fromBedNum, ex.patient2.fromShiftCode)

          // 在重建時，我們假設原始位置的病人是正確的，因為不正確的SWAP在創建時就會被攔截
          const slot1Data = schedule[key1]
            ? { ...schedule[key1] }
            : { patientId: ex.patient1.patientId, patientName: ex.patient1.patientName }
          const slot2Data = schedule[key2]
            ? { ...schedule[key2] }
            : { patientId: ex.patient2.patientId, patientName: ex.patient2.patientName }

          schedule[key1] = {
            ...slot2Data,
            exceptionId: ex.id,
            manualNote: `(與${ex.patient1.patientName}互調)`,
          }
          schedule[key2] = {
            ...slot1Data,
            exceptionId: ex.id,
            manualNote: `(與${ex.patient2.patientName}互調)`,
          }
        }
        return false // SWAP 在此階段不主動檢測覆蓋衝突

      case 'SUSPEND':
        const start = new Date(ex.startDate + 'T00:00:00Z')
        const end = new Date(ex.endDate + 'T00:00:00Z')
        const current = new Date(dateStr + 'T00:00:00Z')
        if (current >= start && current <= end) {
          Object.keys(schedule).forEach((key) => {
            if (schedule[key].patientId === ex.patientId) {
              delete schedule[key]
            }
          })
        }
        return false // SUSPEND 不會產生床位衝突
    }
  } catch (error) {
    logger.error(`[Engine] 在套用調班 ${ex.id} 時發生嚴重錯誤:`, error)
  }
  return false // 默認返回無衝突
}

// ===================================================================
// 核心商業邏輯函式
// ===================================================================

/**
 * ✨✨✨【健壯版 v1.1】✨✨✨
 * 根據總表規則，為指定的「日期字串」產生當日的基礎排程。
 * @param {object} masterRules - 總表規則物件。
 * @param {string} dateStr - 目標日期字串 (格式 'YYYY-MM-DD')。
 * @returns {object} - 當日的基礎排程物件。
 */
function generateDailyScheduleFromRules(masterRules, dateStr) {
  const dailySchedule = {}

  // 1. 根據傳入的日期字串，建立一個標準化的 UTC Date 物件
  const targetDate = new Date(dateStr + 'T00:00:00Z')
  if (isNaN(targetDate.getTime())) {
    logger.error(`[Engine] generateDailyScheduleFromRules 收到無效的日期字串: ${dateStr}`)
    return {} // 返回空物件以避免後續錯誤
  }

  // 2. 將此標準化物件傳遞給 getTaipeiDayIndex，以獲得正確的星期索引
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

// 🔥【最終簡化版 v3.1】 - recalculateDailySchedule
/**
 * 職責：純計算，並返回最終排程和檢測到的衝突列表
 * @param {string} dateStr - 目標日期
 * @param {object} masterRules - 最新的總表規則
 * @param {Array<object>} todaysExceptions - 已排序的、當天的調班列表
 * @returns {{finalSchedule: object, conflictingExceptions: Array<object>}} - 返回包含最終排程和衝突列表的物件
 */
function recalculateDailySchedule(dateStr, masterRules, todaysExceptions) {
  // ✨✨✨【核心修正】✨✨✨
  // 將 dateStr (日期字串) 直接傳遞給 generateDailyScheduleFromRules
  let finalSchedule = generateDailyScheduleFromRules(masterRules, dateStr)
  const conflictingExceptions = []

  for (const ex of todaysExceptions) {
    const hasConflict = applySingleException(finalSchedule, ex, dateStr)

    if (hasConflict) {
      conflictingExceptions.push(ex)
    }
  }

  // 清理 undefined 值
  for (const key in finalSchedule) {
    const slot = finalSchedule[key]
    if (slot && typeof slot === 'object') {
      for (const prop in slot) {
        if (slot[prop] === undefined) {
          slot[prop] = null
        }
      }
    }
  }

  return { finalSchedule, conflictingExceptions }
}

// ===================================================================
// 模組導出
// ===================================================================

module.exports = {
  recalculateDailySchedule,
  generateDailyScheduleFromRules,
  // 也導出常數和輔助函式
  FREQ_MAP_TO_DAY_INDEX,
  SHIFTS,
  getScheduleKey,
}
