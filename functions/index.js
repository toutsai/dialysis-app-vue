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
  // 星期日 (0) -> 6, 星期一 (1) -> 0, ..., 星期六 (6) -> 5
  const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  // ✨ --- 核心修改：現在 masterRules 的 key 是 patientId --- ✨
  // 我們不再遍歷 "床號-班別-頻率" 這種不穩定的 key
  for (const patientId in masterRules) {
    const rule = masterRules[patientId]
    if (!rule || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

    // 檢查今天的星期是否符合該規則的頻率
    if (freqDays.includes(systemDayIndex)) {
      // ✨ --- 核心修改：直接從規則的「內容」讀取排班資訊 --- ✨
      const { bedNum, shiftIndex } = rule
      const shiftCode = SHIFTS[shiftIndex]

      // 進行必要的驗證
      if (bedNum === undefined || shiftCode === undefined) {
        logger.warn(
          `[generateDaily] Rule for patient ${patientId} is missing bedNum or shiftIndex, skipping.`,
        )
        continue
      }

      // ✨ --- 核心修改：根據讀取到的內容，組合出每日排班的 key --- ✨
      // 例如 bedNum 是 "1", shiftCode 是 "early" -> "bed-1-early"
      const dailyShiftId = String(bedNum).startsWith('peripheral')
        ? `${bedNum}-${shiftCode}`
        : `bed-${bedNum}-${shiftCode}`

      // 建立每日排班的資料
      dailySchedule[dailyShiftId] = {
        patientId: patientId,
        shiftId: shiftCode,
        // 假設您的規則物件中可能包含 autoNote/manualNote
        autoNote: rule.autoNote || '',
        manualNote: rule.manualNote || '',
        // 來源追溯的 baseRuleId 現在就是永不改變的 patientId
        baseRuleId: patientId,
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
    logger.info('🚀 [syncMasterSchedule - Re-fetch版] 觸發器啟動！')

    // 步驟 1: 基礎檢查 (保持不變)
    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    // ✨ --- 核心修正：不再信任 event 物件，直接重新讀取 --- ✨
    try {
      logger.info('🕵️‍♂️ 正在從資料庫重新讀取 MASTER_SCHEDULE 的最新狀態...')
      const masterScheduleRef = db.collection('base_schedules').doc('MASTER_SCHEDULE')
      const masterScheduleDoc = await masterScheduleRef.get()

      if (!masterScheduleDoc.exists) {
        logger.warn('⚠️ MASTER_SCHEDULE 文件不存在，同步中止。')
        return null
      }

      // 使用我們自己讀取到的、100% 乾淨的最新規則
      const masterRules = masterScheduleDoc.data().schedule || {}
      logger.info(`✅ 成功讀取 ${Object.keys(masterRules).length} 條最新規則。`)

      logger.info(`📝 開始根據最新規則，對「明天起」的60天排程進行交易式覆蓋...`)

      const promises = []

      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        targetDate.setDate(targetDate.getDate() + i)

        const dateStr = formatDateForQuery(targetDate)

        // 使用乾淨的 masterRules 來生成每日排班
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)

        const dailyDocRef = db.collection('schedules').doc(dateStr)

        // ✨ 使用之前確認過的最穩健的「交易」寫入模式 ✨
        const updatePromise = db.runTransaction(async (transaction) => {
          const doc = await transaction.get(dailyDocRef)
          if (!doc.exists) {
            transaction.set(dailyDocRef, {
              date: dateStr,
              schedule: dailySchedule,
              createdAt: FieldValue.serverTimestamp(),
              lastSynced: FieldValue.serverTimestamp(),
            })
          } else {
            transaction.update(dailyDocRef, {
              schedule: dailySchedule,
              lastSynced: FieldValue.serverTimestamp(),
            })
          }
        })
        promises.push(updatePromise)
      }

      await Promise.all(promises)
      logger.info('✅ 所有每日排程交易式同步完成！')
    } catch (error) {
      logger.error('❌ 在重新讀取並同步 MASTER_SCHEDULE 時發生錯誤:', error)
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
    /* ... */ return
  }
  const taskData = taskDoc.data()
  const taskId = taskDoc.id

  logger.info(
    `👷 [ExceptionWorker] 開始執行任務 ${taskId} (日期: ${taskData.targetDate}, 病人: ${taskData.patientName})`,
  )

  // ✨ 現在 to 和 from 都是從 taskData 來的
  const { targetDate, patientId, type, to, from } = taskData

  // ✨ 對於 MOVE 類型，我們要操作的是 `from` 的日期
  const dateToModify = type === 'MOVE' && from ? from.sourceDate : targetDate
  const dailyScheduleRef = db.collection('schedules').doc(dateToModify)

  try {
    await db.runTransaction(async (transaction) => {
      const dailyDoc = await transaction.get(dailyScheduleRef)
      if (!dailyDoc.exists) {
        // 如果來源日期文件不存在，對於 MOVE 來說就是個錯誤
        if (type === 'MOVE') throw new Error(`來源日期 ${dateToModify} 的排程文件不存在。`)
        transaction.update(taskDoc.ref, { status: 'skipped', message: '當日無排程文件' })
        return
      }

      const dailySchedule = dailyDoc.data().schedule || {}

      // ✨ 重新定義：對於 MOVE，originalShiftId 是指來源位置
      // 對於 SUSPEND，是指在目標日期的位置
      let originalShiftId = null
      for (const shiftId in dailySchedule) {
        if (dailySchedule[shiftId].patientId === patientId) {
          originalShiftId = shiftId
          break
        }
      }

      if (!originalShiftId) {
        if (type === 'SUSPEND') {
          transaction.update(taskDoc.ref, { status: 'applied', message: '當日無此病人排班' })
          return
        }
        if (type === 'MOVE') {
          throw new Error(`在來源日期 ${dateToModify} 找不到病人 ${patientId} 的原始排班。`)
        }
      }

      // --- 執行操作 ---
      if (type === 'SUSPEND') {
        delete dailySchedule[originalShiftId]
        transaction.update(dailyScheduleRef, { schedule: dailySchedule })
      } else if (type === 'MOVE') {
        const slotDataToMove = { ...dailySchedule[originalShiftId] }
        delete slotDataToMove.baseRuleId

        // 1. 刪除來源日期的排班
        delete dailySchedule[originalShiftId]
        transaction.update(dailyScheduleRef, { schedule: dailySchedule })

        // 2. 在目標日期新增排班 (需要一個新的 transaction 或操作)
        // 為了簡單起見，我們先在同一個函式處理，但這不是嚴格的原子操作
        const targetScheduleRef = db.collection('schedules').doc(targetDate)
        const targetDoc = await transaction.get(targetScheduleRef)
        const targetSchedule = targetDoc.exists ? targetDoc.data().schedule : {}
        const newShiftId = `bed-${to.bedNum}-${to.shiftCode}`

        if (targetSchedule[newShiftId] && targetSchedule[newShiftId].patientId) {
          throw new Error(`目標位置 ${targetDate} - ${newShiftId} 已被佔用。`)
        }
        targetSchedule[newShiftId] = slotDataToMove

        if (targetDoc.exists) {
          transaction.update(targetScheduleRef, { schedule: targetSchedule })
        } else {
          transaction.set(targetScheduleRef, { date: targetDate, schedule: targetSchedule })
        }
      }

      transaction.update(taskDoc.ref, { status: 'applied' })
    })

    logger.info(`✅ [ExceptionWorker] 成功執行任務 ${taskId}。`)
  } catch (error) {
    logger.error(`❌ [ExceptionWorker] 執行任務 ${taskId} 失敗:`, error)
    await taskDoc.ref.update({ status: 'error', errorMessage: error.message })
  }
})
