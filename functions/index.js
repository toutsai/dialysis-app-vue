// 檔案路徑: functions/index.js (最終修正版)

// ✨ --- 核心修正：合併 require 語句 --- ✨
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')

admin.initializeApp()

const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

// ===================================================================
// Helper Functions (輔助函式)
// ===================================================================
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

function generateDailyScheduleFromRules(masterRules, targetDate) {
  const dailySchedule = {}
  const dayOfWeek = targetDate.getDay()
  const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  for (const ruleId in masterRules) {
    const rule = masterRules[ruleId]
    if (!rule || !rule.patientId || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

    if (freqDays.includes(systemDayIndex)) {
      const parts = ruleId.split('-')
      let bedNum

      if (parts[0] === 'peripheral') {
        if (parts.length < 4) {
          logger.warn(`[generateDaily] Skipping malformed peripheral ruleId: ${ruleId}`)
          continue
        }
        bedNum = `${parts[0]}-${parts[1]}`
      } else {
        if (parts.length < 3) {
          logger.warn(`[generateDaily] Skipping malformed ruleId: ${ruleId}`)
          continue
        }
        bedNum = parts[0]
      }

      const shiftCode = rule.shiftId
      if (!shiftCode || !SHIFTS.includes(shiftCode)) {
        logger.warn(`[generateDaily] Invalid shiftId in rule ${ruleId}: "${shiftCode}", skipping.`)
        continue
      }

      const dailyShiftId = bedNum.startsWith('peripheral')
        ? `${bedNum}-${shiftCode}`
        : `bed-${bedNum}-${shiftCode}`

      if (dailySchedule[dailyShiftId]) {
        logger.warn(
          `[generateDaily] Duplicate schedule detected at ${dailyShiftId}. Rule ${ruleId} will overwrite.`,
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
// Scheduled Functions (定時執行的函式)
// ===================================================================
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('[Scheduler] Running daily check for expired memos...')
    const todayStr = formatDateForQuery(new Date())
    try {
      const query = db
        .collection('memos')
        .where('status', '==', 'pending')
        .where('targetDate', '<=', todayStr)
      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('[Scheduler] No expired memos found.')
        return null
      }
      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`[Scheduler] Memo ${doc.id} has expired. Updating status.`)
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()
      logger.info(`[Scheduler] Successfully updated ${snapshot.size} memos to 'expired'.`)
    } catch (error) {
      logger.error('[Scheduler] Failed to check for expired memos:', error)
    }
    return null
  },
)

exports.initializeFutureSchedules = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('[Scheduler] Initializing future 60-day schedules...')
    const schedulesRef = db.collection('schedules')
    const today = new Date()

    const datesToCheck = Array.from({ length: 60 }, (_, i) => {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      return formatDateForQuery(targetDate)
    })

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      const masterRules = masterScheduleDoc.exists ? masterScheduleDoc.data().schedule || {} : {}

      // Firestore 'in' queries are limited to 30 items
      const part1 = schedulesRef.where('date', 'in', datesToCheck.slice(0, 30))
      const part2 = schedulesRef.where('date', 'in', datesToCheck.slice(30, 60))

      const [snapshot1, snapshot2] = await Promise.all([part1.get(), part2.get()])
      const existingDates = new Set([
        ...snapshot1.docs.map((doc) => doc.id),
        ...snapshot2.docs.map((doc) => doc.id),
      ])

      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('[Scheduler] All future schedules already exist.')
        return null
      }

      logger.info(`[Scheduler] Found ${datesToCreate.length} missing daily schedules. Creating...`)
      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const dateParts = dateStr.split('-')
        const targetDate = new Date(
          parseInt(dateParts[0]),
          parseInt(dateParts[1]) - 1,
          parseInt(dateParts[2]),
        )
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        const newDocRef = schedulesRef.doc(dateStr)
        batch.set(newDocRef, {
          date: dateStr,
          schedule: dailySchedule,
          createdAt: FieldValue.serverTimestamp(),
        })
      })
      await batch.commit()
      logger.info(`[Scheduler] Successfully created ${datesToCreate.length} daily schedules.`)
    } catch (error) {
      logger.error('❌ 排程初始化失敗:', error)
    }
    return null
  },
)

// ===================================================================
// Callable Functions (可由前端呼叫的函式)
// ===================================================================
exports.customLogin = onCall(async (request) => {
  const { username, password } = request.data
  if (!username || !password) {
    throw new HttpsError('invalid-argument', 'Please provide a username and password.')
  }
  try {
    const usersRef = db.collection('users')
    const snapshot = await usersRef.where('username', '==', username).limit(1).get()
    if (snapshot.empty) {
      throw new HttpsError('not-found', 'Username does not exist.')
    }
    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()
    if (userData.password !== password) {
      throw new HttpsError('unauthenticated', 'Incorrect password.')
    }
    const uid = userDoc.id
    const customToken = await admin.auth().createCustomToken(uid, {
      role: userData.role,
      name: userData.name,
    })
    return { token: customToken }
  } catch (error) {
    logger.error('[customLogin] Login function error:', error)
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', 'An unknown server error occurred.')
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
 * @description 【最終版 - onDocumentWritten】當總表被建立、更新或刪除時觸發。
 *              對「未來60天(從明天起)」進行簡單、全面的覆蓋。
 *              這個版本是基於「總表 + 例外清單」的新架構設計，且最為穩健。
 */
exports.syncMasterScheduleToFuture = onDocumentWritten(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [syncMasterSchedule - Set/Merge最終版] 觸發器啟動！')

    // 處理文件被刪除的情況
    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    const beforeRules = event.data.before?.data()?.schedule || {}
    const afterRules = event.data.after.data().schedule || {}

    if (_.isEqual(beforeRules, afterRules)) {
      logger.info('✅ 規則無實質變化，無需同步。')
      return null
    }

    logger.info(`📝 總表規則已更新，開始對「明天起」的60天排程進行全面覆蓋...`)

    const batch = db.batch()

    for (let i = 1; i <= 60; i++) {
      const targetDate = new Date()
      targetDate.setHours(0, 0, 0, 0)
      targetDate.setDate(targetDate.getDate() + i)

      const dateStr = formatDateForQuery(targetDate)

      const dailySchedule = generateDailyScheduleFromRules(afterRules, targetDate)

      const dailyDocRef = db.collection('schedules').doc(dateStr)

      // ✨ --- 正確的寫法 --- ✨
      // 這個寫法會處理所有情況：
      // 1. 如果 schedules/${dateStr} 文件不存在，它會「創建」它。
      // 2. 如果文件已存在，它會用全新的 dailySchedule 物件「完整替換」掉舊的 schedule 欄位。
      // 3. { merge: true } 確保了如果文件上還有 createdAt 等其他頂層欄位，它們會被保留。
      batch.set(
        dailyDocRef,
        {
          date: dateStr,
          schedule: dailySchedule,
          lastSynced: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }

    try {
      await batch.commit()
      logger.info('✅ 總表規則 set/merge 同步完成！')
    } catch (error) {
      logger.error('❌ set/merge 同步時發生錯誤:', error)
    }

    return null
  },
)

// ✨ --- 函式一：例外申請的「調度員」--- ✨
/**
 * @name handleNewExceptionRequest
 * @description 監聽新的例外申請，驗證後將其拆分為每日任務。
 */
exports.handleNewExceptionRequest = onDocumentCreated(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const exceptionDoc = event.data
    if (!exceptionDoc) {
      logger.error(`[ExceptionDispatcher] 無法獲取例外申請文件資料。`)
      return
    }
    const exceptionData = exceptionDoc.data()
    const exceptionId = exceptionDoc.id

    logger.info(`🚀 [ExceptionDispatcher] 接收到新的例外申請: ${exceptionId}`)

    // 1. 基礎驗證
    if (exceptionData.status !== 'pending') {
      logger.warn(`[ExceptionDispatcher] 申請 ${exceptionId} 狀態不為 pending，跳過。`)
      return
    }

    // 2. 將主任務狀態更新為「處理中」，防止重複觸發
    await exceptionDoc.ref.update({ status: 'processing' })

    // 3. 根據日期區間，生成每日任務 (Fan-out 模式)
    const batch = db.batch()
    const startDate = new Date(exceptionData.startDate + 'T00:00:00Z') // 使用 UTC 避免時區問題
    const endDate = new Date(exceptionData.endDate + 'T00:00:00Z')

    let taskCount = 0
    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = formatDateForQuery(new Date(d)) // 確保轉換回 YYYY-MM-DD
      const taskDocRef = db.collection('exception_tasks').doc() // 創建一個新的任務文件

      const taskData = {
        parentExceptionId: exceptionId,
        targetDate: dateStr,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        to: exceptionData.to || null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      }
      batch.set(taskDocRef, taskData)
      taskCount++
    }

    try {
      await batch.commit()
      logger.info(
        `✅ [ExceptionDispatcher] 成功為例外申請 ${exceptionId} 分發了 ${taskCount} 個每日任務。`,
      )
      // 注意：這裡可以增加一個機制，在所有子任務完成後，將主任務設為 applied
    } catch (error) {
      logger.error(`❌ [ExceptionDispatcher] 分發任務失敗: ${error}`)
      await exceptionDoc.ref.update({ status: 'error', errorMessage: '分發每日任務失敗' })
    }
  },
)

// ✨ --- 函式二：每日任務的「工人」--- ✨
/**
 * @name processExceptionTask
 * @description 處理單一的每日例外任務，修改對應日期的排程。
 */
exports.processExceptionTask = onDocumentCreated('exception_tasks/{taskId}', async (event) => {
  const taskDoc = event.data
  if (!taskDoc) {
    logger.error('[ExceptionWorker] 無法獲取任務文件資料。')
    return
  }
  const taskData = taskDoc.data()
  const taskId = taskDoc.id

  logger.info(
    `👷 [ExceptionWorker] 開始執行任務 ${taskId} (日期: ${taskData.targetDate}, 病人: ${taskData.patientName})`,
  )

  const { targetDate, patientId, type, to } = taskData
  const dailyScheduleRef = db.collection('schedules').doc(targetDate)

  try {
    await db.runTransaction(async (transaction) => {
      const dailyDoc = await transaction.get(dailyScheduleRef)

      // 如果那天的排程文件不存在，直接視為任務完成 (因為沒有東西可以修改)
      if (!dailyDoc.exists) {
        logger.warn(`[ExceptionWorker] 日期 ${targetDate} 的排程文件不存在，任務 ${taskId} 跳過。`)
        transaction.update(taskDoc.ref, { status: 'skipped', message: '當日無排程文件' })
        return
      }

      const dailySchedule = dailyDoc.data().schedule || {}
      let originalShiftId = null

      // 在當天排程中找到這位病人原本在哪個床位
      for (const shiftId in dailySchedule) {
        if (dailySchedule[shiftId].patientId === patientId) {
          originalShiftId = shiftId
          break
        }
      }

      // 如果那天本來就沒有這位病人的排班，對於 SUSPEND 來說任務已完成
      if (!originalShiftId) {
        if (type === 'SUSPEND') {
          logger.info(
            `[ExceptionWorker] 病人 ${patientId} 在 ${targetDate} 本無排班，暫停任務 ${taskId} 完成。`,
          )
          transaction.update(taskDoc.ref, { status: 'applied', message: '當日無此病人排班' })
          return
        } else if (type === 'MOVE') {
          // 如果是 MOVE 且找不到原始排班，這是一個錯誤
          throw new Error(`在 ${targetDate} 找不到病人 ${patientId} 的原始排班可供移動。`)
        }
      }

      // 根據類型執行操作
      if (type === 'SUSPEND') {
        delete dailySchedule[originalShiftId]
        logger.info(
          `[ExceptionWorker] 已從 ${targetDate} 移除病人 ${patientId} (原位置: ${originalShiftId})`,
        )
      } else if (type === 'MOVE') {
        const slotDataToMove = { ...dailySchedule[originalShiftId] }
        delete slotDataToMove.baseRuleId // 重要！移動後視為手動例外

        delete dailySchedule[originalShiftId] // 從原位刪除

        const newShiftId = `bed-${to.bedNum}-${to.shiftCode}`
        dailySchedule[newShiftId] = slotDataToMove // 放入新位
        logger.info(
          `[ExceptionWorker] 已將病人 ${patientId} 從 ${originalShiftId} 移動至 ${newShiftId}`,
        )
      }

      transaction.update(dailyScheduleRef, { schedule: dailySchedule })
      transaction.update(taskDoc.ref, { status: 'applied' }) // 將子任務標記為完成
    })

    logger.info(`✅ [ExceptionWorker] 成功執行任務 ${taskId}。`)
  } catch (error) {
    logger.error(`❌ [ExceptionWorker] 執行任務 ${taskId} 失敗:`, error)
    await taskDoc.ref.update({ status: 'error', errorMessage: error.message })
  }
})
