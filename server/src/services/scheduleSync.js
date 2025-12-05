/**
 * 排程同步服務
 * 當總表 (MASTER_SCHEDULE) 更新時，同步到未來 60 天的排程
 */

import { getDatabase } from '../db/init.js'

// 頻率對應星期索引 (0=週一, 5=週六)
const FREQ_MAP_TO_DAY_INDEX = {
  '一三五': [0, 2, 4],
  '二四六': [1, 3, 5],
  '一四': [0, 3],
  '二五': [1, 4],
  '三六': [2, 5],
  '一五': [0, 4],
  '二六': [1, 5],
  '每日': [0, 1, 2, 3, 4, 5],
  '每周一': [0],
  '每周二': [1],
  '每周三': [2],
  '每周四': [3],
  '每周五': [4],
  '每周六': [5],
}

const SHIFTS = ['early', 'noon', 'late']

// 兩班頻率定義
const BIWEEKLY_FREQUENCIES = ['一四', '二五', '三六', '一五', '二六']
const FREQ_NUMBER_MAP = {
  '一四': '14',
  '二五': '25',
  '三六': '36',
  '一五': '15',
  '二六': '26',
}

/**
 * 取得台北時區的日期字串 (YYYY-MM-DD)
 */
function getTaipeiTodayString() {
  return new Date().toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-')
}

/**
 * 根據日期取得台北時區的星期索引 (0=週一, 6=週日)
 */
function getTaipeiDayIndex(date) {
  const taipeiDateStr = date.toLocaleDateString('zh-TW', {
    timeZone: 'Asia/Taipei',
    weekday: 'short',
  })
  const dayMap = { '週一': 0, '週二': 1, '週三': 2, '週四': 3, '週五': 4, '週六': 5, '週日': 6 }
  return dayMap[taipeiDateStr] ?? date.getDay() // fallback
}

/**
 * 格式化日期為 YYYY-MM-DD
 */
function formatDateToYYYYMMDD(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 產生排程的 key (例如: bed-1-early)
 */
function getScheduleKey(bedNum, shiftCode) {
  const prefix = String(bedNum).startsWith('peripheral') ? '' : 'bed-'
  return `${prefix}${bedNum}-${shiftCode}`
}

/**
 * 根據病人資料產生自動備註
 */
function generateAutoNote(patient) {
  if (!patient) return ''
  const autoNotes = new Set()

  // 兩班頻率自動備註
  if (patient.freq && BIWEEKLY_FREQUENCIES.includes(patient.freq)) {
    const freqNumber = FREQ_NUMBER_MAP[patient.freq]
    if (freqNumber) autoNotes.add(freqNumber)
  }

  // 狀態標籤
  if (patient.status === 'ipd') autoNotes.add('住')
  if (patient.status === 'er') autoNotes.add('急')

  // 首透標籤
  const patientStatus = typeof patient.patient_status === 'string'
    ? JSON.parse(patient.patient_status || '{}')
    : (patient.patient_status || {})
  if (patientStatus.isFirstDialysis?.active) autoNotes.add('新')

  // 疾病標籤
  let diseases = patient.diseases
  if (typeof diseases === 'string') {
    diseases = JSON.parse(diseases || '[]')
  }
  if (Array.isArray(diseases)) {
    if (diseases.includes('HBV')) autoNotes.add('B')
    if (diseases.includes('HCV')) autoNotes.add('C')
    if (diseases.includes('HIV')) autoNotes.add('H')
    if (diseases.includes('RPR')) autoNotes.add('R')
    if (diseases.includes('隔離')) autoNotes.add('隔')
    if (diseases.includes('COVID')) autoNotes.add('冠')
    if (diseases.includes('BC肝?')) autoNotes.add('BC?')
    if (diseases.includes('C肝治癒')) autoNotes.add('C癒')
  }

  return Array.from(autoNotes).join(' ')
}

/**
 * 根據總表規則產生當日排程
 */
function generateDailyScheduleFromRules(masterRules, dateStr, patientsMap = null) {
  const dailySchedule = {}
  const targetDate = new Date(dateStr + 'T00:00:00Z')

  if (isNaN(targetDate.getTime())) {
    console.error(`[ScheduleSync] 無效的日期: ${dateStr}`)
    return {}
  }

  const dayIndex = getTaipeiDayIndex(targetDate)

  for (const patientId in masterRules) {
    const rule = masterRules[patientId]
    if (!rule || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []
    if (freqDays.includes(dayIndex)) {
      const { bedNum, shiftIndex } = rule
      if (bedNum === undefined || shiftIndex === undefined) continue

      const shiftCode = SHIFTS[shiftIndex]
      if (!shiftCode) continue

      const key = getScheduleKey(bedNum, shiftCode)

      // 動態生成 autoNote
      let autoNote = rule.autoNote || ''
      if (patientsMap) {
        const patient = patientsMap.get ? patientsMap.get(patientId) : patientsMap[patientId]
        if (patient) {
          autoNote = generateAutoNote(patient)
        }
      }

      dailySchedule[key] = {
        patientId: patientId,
        patientName: rule.patientName || '',
        shiftId: shiftCode,
        autoNote: autoNote,
        manualNote: rule.manualNote || '',
        baseRuleId: patientId,
      }
    }
  }
  return dailySchedule
}

/**
 * 同步總表變更到未來排程
 * @param {Object} beforeRules - 變更前的總表規則
 * @param {Object} afterRules - 變更後的總表規則
 * @param {Object} modifiedBy - 修改者資訊 {uid, name}
 * @returns {Object} 同步結果
 */
export async function syncMasterScheduleToFuture(beforeRules, afterRules, modifiedBy = {}) {
  console.log('🚀 [ScheduleSync] 開始同步總表到未來 60 天排程...')

  // 如果規則沒有實質變更，跳過同步
  if (JSON.stringify(beforeRules) === JSON.stringify(afterRules)) {
    console.log('✅ [ScheduleSync] 總表無實質變更，跳過同步')
    return { success: true, message: '無需同步', updatedCount: 0 }
  }

  const db = getDatabase()

  try {
    // 載入所有病人資料用於動態生成 autoNote
    const patients = db.prepare(`
      SELECT * FROM patients WHERE is_deleted = 0
    `).all()

    const patientsMap = new Map()
    patients.forEach(p => {
      patientsMap.set(p.id, p)
    })
    console.log(`  [ScheduleSync] 已載入 ${patientsMap.size} 位病人資料`)

    // 計算從明天起的 60 天日期
    const todayStr = getTaipeiTodayString()
    const futureDates = Array.from({ length: 60 }, (_, i) => {
      const futureDate = new Date(todayStr + 'T00:00:00Z')
      futureDate.setUTCDate(futureDate.getUTCDate() + i + 1) // i+1 確保從明天開始
      return formatDateToYYYYMMDD(futureDate)
    })

    console.log(`  [ScheduleSync] 同步範圍: ${futureDates[0]} ~ ${futureDates[59]}`)

    // 取得現有排程
    const existingSchedules = new Map()
    const placeholders = futureDates.map(() => '?').join(',')
    const existingRows = db.prepare(`
      SELECT id, date, schedule FROM schedules WHERE date IN (${placeholders})
    `).all(...futureDates)

    existingRows.forEach(row => {
      existingSchedules.set(row.date, JSON.parse(row.schedule || '{}'))
    })
    console.log(`  [ScheduleSync] 找到 ${existingSchedules.size} 份現有排程`)

    // 計算所有受影響的病人
    const allPatientIds = new Set([...Object.keys(beforeRules), ...Object.keys(afterRules)])
    let updatedCount = 0
    let createdCount = 0

    // 處理每一天
    for (const dateStr of futureDates) {
      const targetDate = new Date(dateStr + 'T00:00:00Z')
      const dayIndex = getTaipeiDayIndex(targetDate)

      // 如果該日期的排程不存在，創建新的
      if (!existingSchedules.has(dateStr)) {
        const newSchedule = generateDailyScheduleFromRules(afterRules, dateStr, patientsMap)

        db.prepare(`
          INSERT INTO schedules (id, date, schedule, sync_method, last_modified_by, created_at, updated_at)
          VALUES (?, ?, ?, 'sync_from_master', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(
          dateStr,
          dateStr,
          JSON.stringify(newSchedule),
          JSON.stringify(modifiedBy)
        )
        createdCount++
        continue
      }

      // 計算需要更新的內容
      const currentSchedule = existingSchedules.get(dateStr)
      const updates = {}
      let hasChanges = false

      allPatientIds.forEach(patientId => {
        const ruleBefore = beforeRules[patientId]
        const ruleAfter = afterRules[patientId]

        const wasScheduled = ruleBefore && (FREQ_MAP_TO_DAY_INDEX[ruleBefore.freq] || []).includes(dayIndex)
        const isScheduled = ruleAfter && (FREQ_MAP_TO_DAY_INDEX[ruleAfter.freq] || []).includes(dayIndex)

        // 產生新的 slot 物件
        const createSlotObject = (rule) => {
          if (!rule) return null
          const shiftCode = SHIFTS[rule.shiftIndex]
          if (!shiftCode) return null

          const patient = patientsMap.get(patientId)
          const dynamicAutoNote = patient ? generateAutoNote(patient) : (rule.autoNote || '')

          return {
            patientId: patientId,
            patientName: rule.patientName || '',
            shiftId: shiftCode,
            autoNote: dynamicAutoNote,
            manualNote: rule.manualNote || '',
            baseRuleId: patientId,
          }
        }

        if (wasScheduled && !isScheduled) {
          // 病人被移除
          const oldShiftCode = SHIFTS[ruleBefore.shiftIndex]
          if (ruleBefore.bedNum !== undefined && oldShiftCode) {
            const oldKey = getScheduleKey(ruleBefore.bedNum, oldShiftCode)
            if (currentSchedule[oldKey]?.patientId === patientId) {
              delete currentSchedule[oldKey]
              hasChanges = true
            }
          }
        } else if (!wasScheduled && isScheduled) {
          // 新增病人
          const newSlot = createSlotObject(ruleAfter)
          if (newSlot && ruleAfter.bedNum !== undefined) {
            const newKey = getScheduleKey(ruleAfter.bedNum, newSlot.shiftId)
            currentSchedule[newKey] = newSlot
            hasChanges = true
          }
        } else if (wasScheduled && isScheduled) {
          // 病人位置或設定變更
          const oldShiftCode = SHIFTS[ruleBefore.shiftIndex]
          const newSlot = createSlotObject(ruleAfter)

          if (newSlot && ruleBefore.bedNum !== undefined && oldShiftCode && ruleAfter.bedNum !== undefined) {
            const oldKey = getScheduleKey(ruleBefore.bedNum, oldShiftCode)
            const newKey = getScheduleKey(ruleAfter.bedNum, newSlot.shiftId)

            if (oldKey !== newKey) {
              // 床位或班別變更，需要移除舊的
              if (currentSchedule[oldKey]?.patientId === patientId) {
                delete currentSchedule[oldKey]
              }
            }
            currentSchedule[newKey] = newSlot
            hasChanges = true
          }
        }
      })

      if (hasChanges) {
        db.prepare(`
          UPDATE schedules
          SET schedule = ?,
              sync_method = 'sync_from_master',
              last_modified_by = ?,
              updated_at = datetime('now', 'localtime')
          WHERE date = ?
        `).run(
          JSON.stringify(currentSchedule),
          JSON.stringify(modifiedBy),
          dateStr
        )
        updatedCount++
      }
    }

    db.close()

    console.log(`✅ [ScheduleSync] 同步完成！創建 ${createdCount} 份，更新 ${updatedCount} 份排程`)

    return {
      success: true,
      message: `同步完成：創建 ${createdCount} 份，更新 ${updatedCount} 份排程`,
      createdCount,
      updatedCount,
    }

  } catch (error) {
    console.error('❌ [ScheduleSync] 同步失敗:', error)
    db.close()
    throw error
  }
}

/**
 * 初始化未來 60 天的排程（用於首次設定或重建）
 */
export async function initializeFutureSchedules(modifiedBy = {}) {
  console.log('🔄 [ScheduleSync] 初始化未來 60 天排程...')

  const db = getDatabase()

  try {
    // 取得總表規則
    const masterDoc = db.prepare(`
      SELECT schedule FROM base_schedules WHERE id = 'MASTER_SCHEDULE'
    `).get()

    const masterRules = masterDoc ? JSON.parse(masterDoc.schedule || '{}') : {}

    // 載入病人資料
    const patients = db.prepare(`
      SELECT * FROM patients WHERE is_deleted = 0
    `).all()

    const patientsMap = new Map()
    patients.forEach(p => patientsMap.set(p.id, p))

    // 計算日期範圍
    const todayStr = getTaipeiTodayString()
    const datesToCheck = Array.from({ length: 60 }, (_, i) => {
      const targetDate = new Date(todayStr + 'T00:00:00Z')
      targetDate.setUTCDate(targetDate.getUTCDate() + i)
      return formatDateToYYYYMMDD(targetDate)
    })

    // 取得已存在的排程日期
    const placeholders = datesToCheck.map(() => '?').join(',')
    const existingRows = db.prepare(`
      SELECT date FROM schedules WHERE date IN (${placeholders})
    `).all(...datesToCheck)

    const existingDates = new Set(existingRows.map(r => r.date))

    // 創建缺少的排程
    let createdCount = 0
    for (const dateStr of datesToCheck) {
      if (!existingDates.has(dateStr)) {
        const dailySchedule = generateDailyScheduleFromRules(masterRules, dateStr, patientsMap)

        db.prepare(`
          INSERT INTO schedules (id, date, schedule, sync_method, last_modified_by, created_at, updated_at)
          VALUES (?, ?, ?, 'initialize_future', ?, datetime('now', 'localtime'), datetime('now', 'localtime'))
        `).run(
          dateStr,
          dateStr,
          JSON.stringify(dailySchedule),
          JSON.stringify(modifiedBy)
        )
        createdCount++
      }
    }

    db.close()

    console.log(`✅ [ScheduleSync] 初始化完成！創建 ${createdCount} 份排程`)

    return {
      success: true,
      message: `初始化完成：創建 ${createdCount} 份排程`,
      createdCount,
    }

  } catch (error) {
    console.error('❌ [ScheduleSync] 初始化失敗:', error)
    db.close()
    throw error
  }
}

export default {
  syncMasterScheduleToFuture,
  initializeFutureSchedules,
}
