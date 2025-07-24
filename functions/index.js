// ✨ --- 核心修正：合併 require 語句 --- ✨
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentWritten, onDocumentCreated } = require('firebase-functions/v2/firestore')
const { onMessagePublished } = require('firebase-functions/v2/pubsub') // ✨ 1. 引入 Pub/Sub 觸發器
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')
const { PubSub } = require('@google-cloud/pubsub') // ✨ 2. 引入 Pub/Sub 客戶端

admin.initializeApp()
const pubsub = new PubSub() // ✨ 3. 初始化 Pub/Sub 客戶端

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

/**
 * 根據床號和班別產生排程表的 key
 * @param {string|number} bedNum - 床號，如 15 或 'peripheral-1'
 * @param {string} shiftCode - 班別代碼，如 'early', 'noon', 'late'
 * @returns {string} 排程表中的 key，如 'bed-15-early' 或 'peripheral-1-late'
 */
const getScheduleKey = (bedNum, shiftCode) => {
  const prefix = String(bedNum).startsWith('peripheral') ? '' : 'bed-'
  return `${prefix}${bedNum}-${shiftCode}`
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

  for (const patientId in masterRules) {
    const rule = masterRules[patientId]
    if (!rule || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

    if (freqDays.includes(systemDayIndex)) {
      const { bedNum, shiftIndex } = rule
      const shiftCode = SHIFTS[shiftIndex]

      if (bedNum === undefined || shiftCode === undefined) {
        logger.warn(
          `[generateDaily] Rule for patient ${patientId} is missing bedNum or shiftIndex, skipping.`,
        )
        continue
      }

      const dailyShiftId = String(bedNum).startsWith('peripheral')
        ? `${bedNum}-${shiftCode}`
        : `bed-${bedNum}-${shiftCode}`

      dailySchedule[dailyShiftId] = {
        patientId: patientId,
        shiftId: shiftCode,
        autoNote: rule.autoNote || '',
        manualNote: rule.manualNote || '',
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
      let masterRules = {}
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()

      if (masterScheduleDoc.exists) {
        masterRules = masterScheduleDoc.data().schedule || {}
        logger.info(`🔍 [ensureFutureSchedules] 成功載入 MASTER_SCHEDULE 規則。`)
      } else {
        logger.warn('⚠️ [ensureFutureSchedules] 找不到 MASTER_SCHEDULE 文件，將創建空白排程。')
      }

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
 * ✨ --- 階段一：總表同步器 --- ✨
 * @name syncMasterScheduleToFuture
 * @description 當總表被更新時觸發。簡單地用總表規則覆蓋未來排程，然後發布訊息觸發階段二。
 */
exports.syncMasterScheduleToFuture = onDocumentWritten(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [Sync - Stage 1] 總表同步器啟動！')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    try {
      const masterScheduleRef = db.collection('base_schedules').doc('MASTER_SCHEDULE')
      const masterScheduleDoc = await masterScheduleRef.get()

      if (!masterScheduleDoc.exists) {
        logger.warn('⚠️ MASTER_SCHEDULE 文件不存在，同步中止。')
        return null
      }

      const masterRules = masterScheduleDoc.data().schedule || {}
      logger.info(`[Sync] 成功讀取 ${Object.keys(masterRules).length} 條最新規則。`)
      logger.info(`[Sync] 開始對「明天起」的60天排程進行基礎覆蓋...`)

      const promises = []
      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        targetDate.setDate(targetDate.getDate() + i)
        const dateStr = formatDateForQuery(targetDate)
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        const dailyDocRef = db.collection('schedules').doc(dateStr)

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
      logger.info('✅ [Sync - Stage 1] 總表基礎排程同步完成！')

      // ✨ 核心：發布 Pub/Sub 訊息，觸發階段二
      const topicName = 'resync-exceptions'
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(
          JSON.stringify({ reason: `Master schedule updated at ${new Date().toISOString()}` }),
        ),
      })
      logger.info(`✅ [Sync - Stage 1] 已發布訊息到 ${topicName} 主題，觸發例外校正。`)
    } catch (error) {
      logger.error('❌ [Sync - Stage 1] 在同步 MASTER_SCHEDULE 時發生錯誤:', error)
    }
    return null
  },
)

// --- 例外處理 (Dispatcher-Worker) 模式 ---

/**
 * @name handleNewExceptionRequest (調度員)
 * @description 監聽新的例外申請，驗證後將其拆分為每日任務。
 */
exports.handleNewExceptionRequest = onDocumentCreated(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const exceptionDoc = event.data
    if (!exceptionDoc) {
      logger.warn('Event data is missing, exiting function.')
      return
    }
    const exceptionData = exceptionDoc.data()
    const exceptionId = exceptionDoc.id

    logger.info(`🚀 [ExceptionDispatcher] 接收到新的例外申請: ${exceptionId}`)

    if (exceptionData.status !== 'pending') {
      logger.info(`申請 ${exceptionId} 狀態為 "${exceptionData.status}"，非 "pending"，不予處理。`)
      return
    }
    await exceptionDoc.ref.update({ status: 'processing' })

    const batch = db.batch()
    let taskCount = 0

    if (exceptionData.type === 'MOVE') {
      logger.info(`[ExceptionDispatcher] 申請 ${exceptionId} 類型為 MOVE，創建單一任務。`)
      const taskDocRef = db.collection('exception_tasks').doc()
      const targetDate = exceptionData.to.goalDate
      const taskData = {
        parentExceptionId: exceptionId,
        targetDate: targetDate,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        from: exceptionData.from || null,
        to: exceptionData.to || null,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      }
      batch.set(taskDocRef, taskData)
      taskCount = 1
    } else if (exceptionData.type === 'SUSPEND') {
      logger.info(
        `[ExceptionDispatcher] 申請 ${exceptionId} 類型為 SUSPEND，遍歷日期範圍創建任務。`,
      )
      const startDate = new Date(exceptionData.startDate + 'T00:00:00Z')
      const endDate = new Date(exceptionData.endDate + 'T00:00:00Z')
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDateForQuery(new Date(d))
        const taskDocRef = db.collection('exception_tasks').doc()
        const taskData = {
          parentExceptionId: exceptionId,
          targetDate: dateStr,
          type: exceptionData.type,
          patientId: exceptionData.patientId,
          patientName: exceptionData.patientName,
          status: 'pending',
          createdAt: FieldValue.serverTimestamp(),
        }
        batch.set(taskDocRef, taskData)
        taskCount++
      }
    } else {
      logger.warn(`[ExceptionDispatcher] 未知的例外類型: ${exceptionData.type} for ${exceptionId}`)
    }

    try {
      if (taskCount > 0) {
        await batch.commit()
        logger.info(
          `✅ [ExceptionDispatcher] 成功為例外申請 ${exceptionId} 分發了 ${taskCount} 個每日任務。`,
        )
      } else {
        logger.warn(`[ExceptionDispatcher] 沒有為 ${exceptionId} 創建任何任務，可能類型未知。`)
        await exceptionDoc.ref.update({ status: 'error', errorMessage: '未知的例外類型' })
      }
    } catch (error) {
      logger.error(`❌ [ExceptionDispatcher] 分發任務失敗 for ${exceptionId}:`, error)
      await exceptionDoc.ref.update({ status: 'error', errorMessage: '分發每日任務失敗' })
    }
  },
)

/**
 * @name processExceptionTask (工人)
 * @description 監聽每日任務，執行具體的排班修改操作。
 */
exports.processExceptionTask = onDocumentCreated('exception_tasks/{taskId}', async (event) => {
  const taskDoc = event.data
  if (!taskDoc) {
    logger.warn('Event data is missing, exiting function.')
    return
  }
  const taskData = taskDoc.data()
  const taskId = taskDoc.id
  const parentExceptionRef = db.collection('schedule_exceptions').doc(taskData.parentExceptionId)

  logger.info(
    `👷 [ExceptionWorker] 開始處理任務: ${taskId} (來自申請 ${taskData.parentExceptionId})`,
  )

  if (taskData.status !== 'pending') {
    logger.info(`任務 ${taskId} 狀態為 "${taskData.status}"，非 "pending"，不予處理。`)
    return
  }

  await taskDoc.ref.update({ status: 'processing' })

  try {
    await db.runTransaction(async (transaction) => {
      if (taskData.type === 'MOVE') {
        const { from, to, patientId, patientName, targetDate } = taskData
        const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
        const sourceScheduleKey = getScheduleKey(from.bedNum, from.shiftCode)
        transaction.update(sourceScheduleRef, {
          [`schedule.${sourceScheduleKey}`]: FieldValue.delete(),
        })
        logger.info(`[MOVE] 準備從 ${from.sourceDate} 移除 ${sourceScheduleKey}`)

        const targetScheduleRef = db.collection('schedules').doc(targetDate)
        const targetScheduleKey = getScheduleKey(to.bedNum, to.shiftCode)
        transaction.set(
          targetScheduleRef,
          {
            schedule: { [targetScheduleKey]: { patientId, patientName } },
          },
          { merge: true },
        )
        logger.info(`[MOVE] 準備在 ${targetDate} 新增 ${targetScheduleKey}`)
      } else if (taskData.type === 'SUSPEND') {
        const { targetDate, patientId } = taskData
        const scheduleRef = db.collection('schedules').doc(targetDate)
        const scheduleDoc = await transaction.get(scheduleRef)

        if (!scheduleDoc.exists) {
          logger.warn(`[SUSPEND] 日期 ${targetDate} 的排班表不存在，跳過此任務。`)
          return
        }

        const scheduleData = scheduleDoc.data().schedule || {}
        let found = false
        for (const key in scheduleData) {
          if (scheduleData[key].patientId === patientId) {
            transaction.update(scheduleRef, { [`schedule.${key}`]: FieldValue.delete() })
            found = true
            logger.info(
              `[SUSPEND] 在 ${targetDate} 找到並準備移除病人 ${patientId} 的排班 (key: ${key})`,
            )
            break
          }
        }
        if (!found) {
          logger.warn(`[SUSPEND] 在 ${targetDate} 未找到病人 ${patientId} 的排班，無需操作。`)
        }
      }
    })

    await taskDoc.ref.update({ status: 'completed', completedAt: FieldValue.serverTimestamp() })
    logger.info(`✅ [ExceptionWorker] 任務 ${taskId} 成功完成。`)

    const siblingTasksQuery = db
      .collection('exception_tasks')
      .where('parentExceptionId', '==', taskData.parentExceptionId)
      .where('status', 'in', ['pending', 'processing'])

    const pendingSiblings = await siblingTasksQuery.get()
    if (pendingSiblings.empty) {
      logger.info(`所有屬於 ${taskData.parentExceptionId} 的任務均已完成，更新父申請為 "applied"。`)
      await parentExceptionRef.update({
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
      })
    }
  } catch (error) {
    logger.error(`❌ [ExceptionWorker] 處理任務 ${taskId} 失敗:`, error)
    await taskDoc.ref.update({ status: 'error', errorMessage: error.message })
    await parentExceptionRef.update({
      status: 'error',
      errorMessage: `任務 ${taskId} 執行失敗: ${error.message}`,
    })
  }
})

/**
 * ✨ --- 階段二：例外校正器 --- ✨
 * @name reapplyAllActiveExceptions
 * @description 監聽 Pub/Sub 訊息，遍歷所有有效例外並重新應用它們，確保例外優先級。
 */
exports.reapplyAllActiveExceptions = onMessagePublished(
  { topic: 'resync-exceptions', timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    logger.info('🚀 [ExceptionRe-applier - Stage 2] 收到校正請求，開始重新應用所有有效例外...')

    try {
      // 步驟 1: 查詢所有還在有效期內的例外
      const today = formatDateForQuery(new Date())
      const exceptionsQuery = db
        .collection('schedule_exceptions')
        .where('status', 'in', ['pending', 'processing', 'applied'])
        .where('endDate', '>=', today)

      const exceptionsSnapshot = await exceptionsQuery.get()
      if (exceptionsSnapshot.empty) {
        logger.info('✅ [ExceptionRe-applier] 沒有需要重新應用的有效例外。')
        return null
      }

      const exceptions = exceptionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      logger.info(`[ExceptionRe-applier] 找到 ${exceptions.length} 筆例外需要校正。`)

      // 步驟 2: 遍歷每一個例外，並執行修改
      // 這裡使用批量寫入(Batched Writes)來提高效率和可靠性
      const batch = db.batch()

      for (const ex of exceptions) {
        if (ex.type === 'MOVE') {
          // 移除來源的操作實際上在工人函式執行時就已經完成了。
          // 校正器的主要任務是確保「目標」存在。
          // 為了冪等性，我們還是可以執行移除，即使它可能已經被移除了。
          const sourceScheduleRef = db.collection('schedules').doc(ex.from.sourceDate)
          const sourceKey = getScheduleKey(ex.from.bedNum, ex.from.shiftCode)
          // 注意：批量更新不能讀取，所以我們不能像工人函式那樣動態找key。
          // 這裡依賴於例外申請中的from資訊是準確的。
          batch.update(sourceScheduleRef, { [`schedule.${sourceKey}`]: FieldValue.delete() })

          // 新增目標
          const targetScheduleRef = db.collection('schedules').doc(ex.to.goalDate)
          const targetKey = getScheduleKey(ex.to.bedNum, ex.to.shiftCode)
          batch.set(
            targetScheduleRef,
            {
              schedule: { [targetKey]: { patientId: ex.patientId, patientName: ex.patientName } },
            },
            { merge: true },
          )
        } else if (ex.type === 'SUSPEND') {
          // 對於暫停，我們需要為區間內的每一天都執行操作。
          // 這部分因為需要先讀取才能確定要刪除哪個key，所以不能用單一的batch。
          // 我們將其保留為獨立的異步操作。
          const start = new Date(ex.startDate + 'T00:00:00Z')
          const end = new Date(ex.endDate + 'T00:00:00Z')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDateForQuery(new Date(d))
            const scheduleRef = db.collection('schedules').doc(dateStr)

            const doc = await scheduleRef.get()
            if (doc.exists) {
              const scheduleData = doc.data().schedule || {}
              for (const key in scheduleData) {
                if (scheduleData[key].patientId === ex.patientId) {
                  // 為了避免與上面的 batch 衝突，這裡我們直接執行 update
                  await scheduleRef.update({ [`schedule.${key}`]: FieldValue.delete() })
                  break
                }
              }
            }
          }
        }
      }

      // 提交所有 MOVE 類型的批量寫入
      await batch.commit()
      logger.info('✅ [ExceptionRe-applier - Stage 2] 所有例外校正完成！')
    } catch (error) {
      logger.error('❌ [ExceptionRe-applier - Stage 2] 執行例外校正時發生嚴重錯誤:', error)
    }
    return null
  },
)
