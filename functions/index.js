// 檔案路徑: functions/index.js (已加入前端觸發的 onCall 函式)

// 引入 v2 版本的函式模組
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')

// 初始化 Firebase Admin SDK
admin.initializeApp()

// 取得 Firestore 資料庫的實例
const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

// ===================================================================
// Helper Functions (輔助函式)
// ===================================================================

/**
 * 格式化日期為 'YYYY-MM-DD' 字串
 * @param {Date} date - 日期物件
 * @returns {string}
 */
function formatDateForQuery(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const FREQ_MAP_TO_DAY_INDEX = {
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
}
const SHIFTS = ['early', 'noon', 'late']

/**
 * 根據總表規則，產生某一天的具體排程
 * @param {object} masterRules - 完整的總表規則物件
 * @param {Date} targetDate - 目標日期物件
 * @returns {object} - 當天的 schedule 物件
 */
function generateDailyScheduleFromRules(masterRules, targetDate) {
  const dailySchedule = {}
  const dayOfWeek = targetDate.getDay()
  // 星期日 (0) -> 6, 星期一 (1) -> 0, ..., 星期六 (6) -> 5
  const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  for (const ruleId in masterRules) {
    const rule = masterRules[ruleId]
    if (!rule || !rule.patientId || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

    // 檢查今天的星期是否符合該規則的頻率
    if (freqDays.includes(systemDayIndex)) {
      // 🔥【核心修正】: 重新設計 ruleId 的解析邏輯
      const parts = ruleId.split('-')
      let bedNum, shiftIndex

      // 預期格式:
      // 1-2-二四六 (一般床)
      // peripheral-1-2-二四六 (外圍床)

      if (parts.length < 3) {
        logger.warn(
          `[generateDailyScheduleFromRules] 偵測到格式不正確的 ruleId: ${ruleId}，已跳過。`,
        )
        continue // 跳過格式不正確的規則
      }

      if (parts[0] === 'peripheral') {
        // 處理外圍床: peripheral-1-2-二四六
        if (parts.length < 4) {
          logger.warn(
            `[generateDailyScheduleFromRules] 偵測到格式不正確的外圍床 ruleId: ${ruleId}，已跳過。`,
          )
          continue
        }
        bedNum = `${parts[0]}-${parts[1]}` // "peripheral-1"
        shiftIndex = parseInt(parts[2], 10) // 2
      } else {
        // 處理一般床: 1-2-二四六
        bedNum = parts[0] // "1"
        shiftIndex = parseInt(parts[1], 10) // 2
      }

      // 驗證解析結果
      if (!bedNum || isNaN(shiftIndex) || shiftIndex < 0 || shiftIndex >= SHIFTS.length) {
        logger.warn(
          `[generateDailyScheduleFromRules] 解析 ruleId (${ruleId}) 失敗，bedNum 或 shiftIndex 無效。`,
        )
        continue
      }

      // 🔥【核心修正】: 使用規則內容中的 shiftId，而不是從 ruleId 推斷
      // 這確保了資料來源的唯一性，避免了您截圖中的班別錯亂問題。
      const shiftCode = rule.shiftId

      if (!shiftCode || !SHIFTS.includes(shiftCode)) {
        logger.warn(
          `[generateDailyScheduleFromRules] 規則 ${ruleId} 中的 shiftId ("${shiftCode}") 無效，已跳過。`,
        )
        continue
      }

      let dailyShiftId
      if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
        dailyShiftId = `${bedNum}-${shiftCode}` // peripheral-1-late
      } else {
        dailyShiftId = `bed-${bedNum}-${shiftCode}` // bed-1-late
      }

      // 檢查是否已存在排程，避免重複（雖然理論上不應發生）
      if (dailySchedule[dailyShiftId]) {
        logger.warn(
          `[generateDailyScheduleFromRules] 偵測到重複排程於 ${dailyShiftId}，舊有資料將被覆蓋。規則ID: ${ruleId}`,
        )
      }

      dailySchedule[dailyShiftId] = {
        patientId: rule.patientId,
        shiftId: shiftCode,
        autoNote: rule.autoNote || '',
        manualNote: rule.manualNote || '',
        baseRuleId: ruleId,
      }
    }
  }

  return dailySchedule
}

// ===================================================================
// Scheduled Functions (定時執行的函式 - 系統的保險)
// ===================================================================

/**
 * @name checkExpiredMemos
 * @description 檢查並更新已到期的備忘錄
 */
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    // ... (此函式邏輯不變)
    logger.info('開始執行每日備忘錄到期檢查...')
    const todayStr = formatDateForQuery(new Date())
    try {
      const query = db
        .collection('memos')
        .where('status', '==', 'pending')
        .where('targetDate', '<=', todayStr)
      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('沒有找到已到期的備忘錄，任務結束。')
        return null
      }
      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`備忘錄 ${doc.id} 已到期，準備更新狀態...`)
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()
      logger.info(`成功更新了 ${snapshot.size} 筆備忘錄為 'expired'。`)
    } catch (error) {
      logger.error('備忘錄到期檢查失敗:', error)
    }
    return null
  },
)

/**
 * @name initializeFutureSchedules
 * @description 【每日定時管家】每日確保未來60天的排程文件存在
 */
exports.initializeFutureSchedules = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('🚀 [initializeFutureSchedules] 開始執行未來60天排程初始化...')
    const schedulesRef = db.collection('schedules')
    const today = new Date()

    // --- 核心修正：將 60 天的日期分成兩批 ---
    const datesToCheck_part1 = []
    for (let i = 0; i < 30; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck_part1.push(formatDateForQuery(targetDate))
    }
    const datesToCheck_part2 = []
    for (let i = 30; i < 60; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck_part2.push(formatDateForQuery(targetDate))
    }

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      let masterRules = {}
      if (masterScheduleDoc.exists) {
        logger.info('✅ 成功讀取 MASTER_SCHEDULE 規則。')
        masterRules = masterScheduleDoc.data().schedule || {}
      } else {
        logger.warn('⚠️ 找不到 MASTER_SCHEDULE，將使用空規則來產生空白排程。')
      }

      // --- 核心修正：分兩次查詢，並合併結果 ---
      const snapshot_part1 = await schedulesRef.where('date', 'in', datesToCheck_part1).get()
      const snapshot_part2 = await schedulesRef.where('date', 'in', datesToCheck_part2).get()

      const existingDocs = [...snapshot_part1.docs, ...snapshot_part2.docs]
      const existingDates = new Set(existingDocs.map((doc) => doc.data().date))
      const allDatesToCheck = [...datesToCheck_part1, ...datesToCheck_part2]
      const datesToCreate = allDatesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('✅ 所有未來60天排程均已存在，無需操作。')
        return null
      }

      logger.info(`⏳ 發現 ${datesToCreate.length} 個缺失的每日排程，正在創建...`)
      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const dateParts = dateStr.split('-')
        const targetDate = new Date(dateParts[0], parseInt(dateParts[1], 10) - 1, dateParts[2])
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        const newDocRef = schedulesRef.doc(dateStr)
        batch.set(newDocRef, {
          date: dateStr,
          schedule: dailySchedule,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      })
      await batch.commit()
      logger.info(`✅ 成功創建了 ${datesToCreate.length} 個每日排程文件。`)
    } catch (error) {
      logger.error('❌ 排程初始化失敗:', error)
    }
    return null
  },
)

// ===================================================================
// Callable Functions (可由前端呼叫的函式 - 滿足即時性需求)
// ===================================================================

/**
 * @name customLogin
 * @description 自訂登入的雲端函式
 */
exports.customLogin = onCall(async (request) => {
  // ... (此函式邏輯不變)
  const { username, password } = request.data
  if (!username || !password) {
    throw new HttpsError('invalid-argument', '請提供帳號和密碼。')
  }
  try {
    const usersRef = db.collection('users')
    const snapshot = await usersRef.where('username', '==', username).limit(1).get()
    if (snapshot.empty) {
      throw new HttpsError('not-found', '帳號不存在。')
    }
    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()
    if (userData.password !== password) {
      throw new HttpsError('unauthenticated', '密碼錯誤。')
    }
    const uid = userDoc.id
    const customToken = await admin.auth().createCustomToken(uid, {
      role: userData.role,
      name: userData.name,
    })
    return { token: customToken }
  } catch (error) {
    logger.error('Login function error:', error)
    if (error instanceof HttpsError) {
      throw error
    }
    throw new HttpsError('internal', '伺服器發生未知錯誤。')
  }
})

/**
 * @name ensureFutureSchedules
 * @description 【前端觸發助理】確保未來60天排程存在，處理冷啟動或即時需求
 */
exports.ensureFutureSchedules = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '使用者未登入，無法執行此操作。')
    }

    logger.info(
      `🚀 [ensureFutureSchedules] 由使用者 ${request.auth.uid} 觸發，開始檢查未來60天排程...`,
    )
    const schedulesRef = db.collection('schedules')
    const today = new Date()

    // --- 核心修正：將 60 天的日期分成兩批 ---
    const datesToCheck_part1 = [] // 第 1-30 天
    for (let i = 0; i < 30; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck_part1.push(formatDateForQuery(targetDate))
    }

    const datesToCheck_part2 = [] // 第 31-60 天
    for (let i = 30; i < 60; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck_part2.push(formatDateForQuery(targetDate))
    }

    try {
      let masterRules = {}
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()

      if (masterScheduleDoc.exists) {
        masterRules = masterScheduleDoc.data().schedule || {}
        logger.info(`🔍 [ensureFutureSchedules] 成功載入 MASTER_SCHEDULE 規則。`)
      } else {
        logger.warn('⚠️ [ensureFutureSchedules] 找不到 MASTER_SCHEDULE 文件，將創建空白排程。')
      }

      // --- 核心修正：分兩次查詢，並合併結果 ---
      const snapshot_part1 = await schedulesRef.where('date', 'in', datesToCheck_part1).get()
      const snapshot_part2 = await schedulesRef.where('date', 'in', datesToCheck_part2).get()

      const existingDocs = [...snapshot_part1.docs, ...snapshot_part2.docs]
      const existingDates = new Set(existingDocs.map((doc) => doc.data().date))
      const allDatesToCheck = [...datesToCheck_part1, ...datesToCheck_part2]
      const datesToCreate = allDatesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('✅ [ensureFutureSchedules] 所有未來60天排程均已存在，無需操作。')
        return { success: true, message: '所有排程均已存在。', createdCount: 0 }
      }

      logger.info(`⏳ [ensureFutureSchedules] 發現 ${datesToCreate.length} 個缺失排程，正在創建...`)
      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const dateParts = dateStr.split('-')
        const targetDate = new Date(dateParts[0], parseInt(dateParts[1], 10) - 1, dateParts[2])
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        const newDocRef = schedulesRef.doc(dateStr)
        batch.set(newDocRef, {
          date: dateStr,
          schedule: dailySchedule,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      })
      await batch.commit()
      const successMsg = `成功創建了 ${datesToCreate.length} 個排程文件。`
      logger.info(`✅ [ensureFutureSchedules] ${successMsg}`)
      return { success: true, message: successMsg, createdCount: datesToCreate.length }
    } catch (error) {
      logger.error('❌ [ensureFutureSchedules] 執行失敗:', error)
      throw new HttpsError('internal', '伺服器展程時發生錯誤。', { details: error.message })
    }
  },
)

// ===================================================================
// Firestore Triggers (資料庫觸發的函式)
// ===================================================================

/**
 * @name syncMasterScheduleToFuture
 * @description 當總表更新時，同步未來60天的排程 (修正時區問題，真正保護歷史資料)
 */
exports.syncMasterScheduleToFuture = onDocumentUpdated(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [syncMasterSchedule] 精確更新版觸發器啟動！(已修正時區)')
    const beforeRules = event.data.before.data().schedule || {}
    const afterRules = event.data.after.data().schedule || {}

    if (_.isEqual(beforeRules, afterRules)) {
      logger.info('✅ 總表規則無實質變化，無需同步。')
      return null
    }

    // --- 1. 找出變更的規則 ---
    const changedRules = {}
    const deletedRuleIds = []
    for (const ruleId in beforeRules) {
      if (!afterRules[ruleId]) {
        deletedRuleIds.push(ruleId)
      }
    }
    for (const ruleId in afterRules) {
      if (!beforeRules[ruleId] || !_.isEqual(beforeRules[ruleId], afterRules[ruleId])) {
        changedRules[ruleId] = afterRules[ruleId]
      }
    }

    if (Object.keys(changedRules).length === 0 && deletedRuleIds.length === 0) {
      logger.info('✅ 總表規則變動，但無須同步到每日排程。')
      return null
    }

    logger.info(
      `📝 偵測到變動：${Object.keys(changedRules).length} 條新增/修改，${deletedRuleIds.length} 條刪除。`,
    )

    // --- 2. 準備批次更新，並以台北時區為基準 ---
    const batch = db.batch()

    // 🔥【核心修正 1】: 獲取台北時區的當前日期和時間，並將其作為所有計算的基準
    const nowInTaipei = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }))
    const currentHourInTaipei = nowInTaipei.getHours()
    const todayStrInTaipei = formatDateForQuery(nowInTaipei)

    logger.info(
      `🌏 當前台北時間: ${nowInTaipei.toISOString()}, 小時: ${currentHourInTaipei}, 日期字串: ${todayStrInTaipei}`,
    )

    for (let i = 0; i < 60; i++) {
      // 🔥【核心修正 2】: 從台北的“今天”開始計算未來的日期
      const targetDate = new Date(nowInTaipei) // 每次都從 nowInTaipei 複製一份新的日期物件
      targetDate.setHours(0, 0, 0, 0)
      targetDate.setDate(targetDate.getDate() + i)
      const dateStr = formatDateForQuery(targetDate)

      const dayOfWeek = targetDate.getDay()
      const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

      // 判斷是否為台北的“今天”
      const isTodayInTaipei = dateStr === todayStrInTaipei
      const isEarlyShiftPast = isTodayInTaipei && currentHourInTaipei >= 13
      const isNoonShiftPast = isTodayInTaipei && currentHourInTaipei >= 18

      const dailyDocRef = db.collection('schedules').doc(dateStr)
      const updates = {}

      // --- 3. 處理被刪除的規則 ---
      for (const ruleId of deletedRuleIds) {
        const ruleData = beforeRules[ruleId]
        if (!ruleData || !ruleData.freq) continue

        const freqDays = FREQ_MAP_TO_DAY_INDEX[ruleData.freq] || []
        if (freqDays.includes(systemDayIndex)) {
          const parts = ruleId.split('-')
          if (parts.length < 2) continue
          let bedNum = parts[0] === 'peripheral' ? `${parts[0]}-${parts[1]}` : parts[0]
          const shiftCode = ruleData.shiftId
          if (!bedNum || !shiftCode) continue

          const dailyShiftId = bedNum.startsWith('peripheral')
            ? `${bedNum}-${shiftCode}`
            : `bed-${bedNum}-${shiftCode}`

          const isPastShift =
            (shiftCode === 'early' && isEarlyShiftPast) || (shiftCode === 'noon' && isNoonShiftPast)
          if (!isPastShift) {
            updates[`schedule.${dailyShiftId}`] = FieldValue.delete()
          }
        }
      }

      // --- 4. 處理新增/修改的規則 ---
      const newDailySchedule = generateDailyScheduleFromRules(changedRules, targetDate)
      for (const dailyShiftId in newDailySchedule) {
        const shiftData = newDailySchedule[dailyShiftId]
        const shiftCode = shiftData.shiftId

        const isPastShift =
          (shiftCode === 'early' && isEarlyShiftPast) || (shiftCode === 'noon' && isNoonShiftPast)
        if (!isPastShift) {
          updates[`schedule.${dailyShiftId}`] = shiftData
        }
      }

      // --- 5. 如果有變動，才加入批次 ---
      if (Object.keys(updates).length > 0) {
        updates.lastSynced = FieldValue.serverTimestamp()
        batch.set(dailyDocRef, { lastSynced: FieldValue.serverTimestamp() }, { merge: true })
        batch.update(dailyDocRef, updates)
      }
    }

    try {
      await batch.commit()
      logger.info('✅ 同步完成！已精確更新未來60天的排程。')
    } catch (error) {
      logger.error('❌ 同步未來排程時發生錯誤:', error)
    }
    return null
  },
)
