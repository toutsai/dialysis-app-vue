// 【最終修正與整理版】
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  onDocumentWritten,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore')
const { onMessagePublished } = require('firebase-functions/v2/pubsub')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')
const { PubSub } = require('@google-cloud/pubsub')

// ===================================================================
// Initialization (初始化)
// ===================================================================

// ✨ 最佳實踐：只在需要時才初始化服務
admin.initializeApp()
const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

// 延遲初始化 PubSub，避免部署超時
let pubsub

// ===================================================================
// Helper Functions (輔助函式)
// ===================================================================
function formatDateForQuery(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

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
    timeoutSeconds: 540, // 增加超時時間到 9 分鐘
    memory: '256MiB', // 設定記憶體限制
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

exports.syncMasterScheduleToFuture = onDocumentWritten(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [Flow 1 v3] 總表同步器啟動 (手動完全覆蓋模式)！')
    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }
    try {
      // 在函式內部，第一次使用時才初始化 PubSub
      if (!pubsub) {
        pubsub = new PubSub()
      }

      const masterRules = event.data.after.data().schedule || {}
      logger.info(`[Sync] 成功讀取 ${Object.keys(masterRules).length} 條最新規則。`)
      logger.info(`[Sync] 開始對「明天起」的60天排程進行【手動完全覆蓋】...`)

      const updatePromises = []
      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        targetDate.setDate(targetDate.getDate() + i)
        const dateStr = formatDateForQuery(targetDate)
        const dailyScheduleFromRules = generateDailyScheduleFromRules(masterRules, targetDate)
        const dailyDocRef = db.collection('schedules').doc(dateStr)
        const promise = db.runTransaction(async (transaction) => {
          const doc = await transaction.get(dailyDocRef)
          if (!doc.exists) {
            transaction.set(dailyDocRef, {
              date: dateStr,
              schedule: dailyScheduleFromRules,
              createdAt: FieldValue.serverTimestamp(),
              lastSynced: FieldValue.serverTimestamp(),
            })
          } else {
            transaction.update(dailyDocRef, { schedule: FieldValue.delete() })
            transaction.set(
              dailyDocRef,
              {
                schedule: dailyScheduleFromRules,
                lastSynced: FieldValue.serverTimestamp(),
              },
              { merge: true },
            )
          }
        })
        updatePromises.push(promise)
      }
      await Promise.all(updatePromises)
      logger.info('✅ [Flow 1 v3] 總表基礎排程同步完成！')
      const topicName = 'resync-exceptions'
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(
          JSON.stringify({ reason: `Master schedule updated at ${new Date().toISOString()}` }),
        ),
      })
      logger.info(`✅ [Flow 1 v3] 已發布訊息，觸發流程三 (例外校正)。`)
    } catch (error) {
      logger.error('❌ [Flow 1 v3] 在同步 MASTER_SCHEDULE 時發生錯誤:', error)
    }
    return null
  },
)

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

        const targetScheduleRef = db.collection('schedules').doc(targetDate)
        const targetScheduleKey = getScheduleKey(to.bedNum, to.shiftCode)
        const newSlotData = {
          patientId,
          patientName,
          shiftId: to.shiftCode,
          manualNote: `(例外調班)`,
        }

        transaction.set(
          targetScheduleRef,
          { schedule: { [targetScheduleKey]: newSlotData } },
          { merge: true },
        )
      } else if (taskData.type === 'SUSPEND') {
        const { targetDate, patientId } = taskData
        const scheduleRef = db.collection('schedules').doc(targetDate)
        const scheduleDoc = await transaction.get(scheduleRef)

        if (!scheduleDoc.exists) {
          logger.warn(`[SUSPEND] 日期 ${targetDate} 的排班表不存在，跳過此任務。`)
          return
        }

        const scheduleData = scheduleDoc.data().schedule || {}
        for (const key in scheduleData) {
          if (scheduleData[key].patientId === patientId) {
            transaction.update(scheduleRef, { [`schedule.${key}`]: FieldValue.delete() })
            break
          }
        }
      }
    })

    await taskDoc.ref.update({ status: 'completed', completedAt: FieldValue.serverTimestamp() })
    const siblingTasksQuery = db
      .collection('exception_tasks')
      .where('parentExceptionId', '==', taskData.parentExceptionId)
      .where('status', 'in', ['pending', 'processing'])

    const pendingSiblings = await siblingTasksQuery.get()
    if (pendingSiblings.empty) {
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

exports.reapplyAllActiveExceptions = onMessagePublished(
  { topic: 'resync-exceptions', timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    logger.info('🚀 [Re-applier] 例外校正器啟動！')
    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      const masterRules = masterScheduleDoc.exists ? masterScheduleDoc.data().schedule || {} : {}
      const today = formatDateForQuery(new Date())
      const exceptionsQuery = db.collection('schedule_exceptions').where('endDate', '>=', today)

      const exceptionsSnapshot = await exceptionsQuery.get()
      if (exceptionsSnapshot.empty) {
        logger.info('✅ [Re-applier] 沒有需要校正的有效例外。')
        return null
      }

      const exceptions = exceptionsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

      for (const ex of exceptions) {
        if (!ex.id || !ex.patientId || !ex.type) {
          logger.warn(`[Re-applier] 發現資料結構不完整的例外，已跳過。ID: ${ex.id}`, ex)
          continue
        }

        if (ex.type === 'MOVE') {
          await db.runTransaction(async (transaction) => {
            if (!ex.from?.sourceDate || !ex.to?.goalDate) return
            const { from, to, patientId, patientName } = ex
            const targetScheduleRef = db.collection('schedules').doc(to.goalDate)
            const targetKey = getScheduleKey(to.bedNum, to.shiftCode)
            let isConflictWithMaster = false
            let conflictPatientId = null
            for (const masterPatientId in masterRules) {
              if (masterPatientId === patientId) continue
              const rule = masterRules[masterPatientId]
              const ruleKey = getScheduleKey(rule.bedNum, SHIFTS[rule.shiftIndex])
              const ruleFreqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []
              const targetDate = new Date(to.goalDate + 'T00:00:00Z')
              const targetDayIndex = targetDate.getDay() === 0 ? 6 : targetDate.getDay() - 1
              if (ruleKey === targetKey && ruleFreqDays.includes(targetDayIndex)) {
                isConflictWithMaster = true
                conflictPatientId = masterPatientId
                break
              }
            }
            const exceptionRef = db.collection('schedule_exceptions').doc(ex.id)
            if (isConflictWithMaster) {
              transaction.update(exceptionRef, {
                status: 'conflict_requires_resolution',
                errorMessage: `與總表衝突：床位已被 ${conflictPatientId} 預定`,
              })
            } else {
              const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
              const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)
              transaction.update(sourceScheduleRef, {
                [`schedule.${sourceKey}`]: FieldValue.delete(),
              })
              const newSlotData = {
                patientId,
                patientName,
                shiftId: to.shiftCode,
                manualNote: `(例外調班)`,
              }
              transaction.set(
                targetScheduleRef,
                { schedule: { [targetKey]: newSlotData } },
                { merge: true },
              )
              if (ex.status !== 'applied') {
                transaction.update(exceptionRef, { status: 'applied', errorMessage: '' })
              }
            }
          })
        } else if (ex.type === 'SUSPEND') {
          if (!ex.startDate || !ex.endDate) continue
          const { patientId, startDate, endDate } = ex
          const start = new Date(startDate + 'T00:00:00Z')
          const end = new Date(endDate + 'T00:00:00Z')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDateForQuery(new Date(d))
            try {
              await db.runTransaction(async (transaction) => {
                const scheduleRef = db.collection('schedules').doc(dateStr)
                const doc = await transaction.get(scheduleRef)
                if (doc.exists) {
                  const scheduleData = doc.data().schedule || {}
                  for (const key in scheduleData) {
                    if (scheduleData[key].patientId === patientId) {
                      transaction.update(scheduleRef, { [`schedule.${key}`]: FieldValue.delete() })
                      break
                    }
                  }
                }
              })
            } catch (dailyError) {
              logger.error(`❌ [Re-applier] 日期 ${dateStr} 錯誤:`, dailyError)
            }
          }
          const exceptionRef = db.collection('schedule_exceptions').doc(ex.id)
          if (ex.status !== 'applied') {
            await exceptionRef.update({ status: 'applied', errorMessage: '' })
          }
        }
      }
    } catch (error) {
      logger.error('❌ [Re-applier] 執行例外校正時發生嚴重錯誤:', error)
    }
    return null
  },
)

exports.onExceptionDeleted = onDocumentDeleted(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const deletedException = event.data.data()
    const exceptionId = event.params.exceptionId
    logger.info(`🚀 [Reverter] 例外恢復處理器啟動: ${exceptionId}`)
    if (!deletedException || !deletedException.patientId || !deletedException.type) {
      logger.error(`❌ [Reverter] 失敗：被刪除的例外資料不完整。`, deletedException)
      return
    }

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.error('❌ [Reverter] 嚴重錯誤：找不到總表規則，無法恢復排班。')
        return
      }
      const masterRules = masterScheduleDoc.data().schedule || {}

      let datesToRestore = []
      if (deletedException.type === 'MOVE') {
        if (deletedException.from?.sourceDate && deletedException.to?.goalDate) {
          datesToRestore = _.uniq([deletedException.from.sourceDate, deletedException.to.goalDate])
        }
      } else if (deletedException.type === 'SUSPEND') {
        if (deletedException.startDate && deletedException.endDate) {
          const start = new Date(deletedException.startDate + 'T00:00:00Z')
          const end = new Date(deletedException.endDate + 'T00:00:00Z')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            datesToRestore.push(formatDateForQuery(new Date(d)))
          }
        }
      }

      const restorePromises = datesToRestore.map((dateStr) => {
        const targetDate = new Date(dateStr + 'T00:00:00Z')
        const scheduleFromRules = generateDailyScheduleFromRules(masterRules, targetDate)
        const scheduleRef = db.collection('schedules').doc(dateStr)
        return db.runTransaction(async (transaction) => {
          transaction.update(scheduleRef, { schedule: FieldValue.delete() })
          transaction.set(
            scheduleRef,
            {
              schedule: scheduleFromRules,
              lastRevertedAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
          )
        })
      })

      await Promise.all(restorePromises)
    } catch (error) {
      logger.error(`❌ [Reverter] 恢復例外 ${exceptionId} 時發生錯誤:`, error)
    }
  },
)

// ===================================================================
// Lab Report Functions (檢驗報告相關函式)
// ===================================================================

exports.processLabReport = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
    const XLSX = require('xlsx')
    if (!request.auth || !['admin', 'editor'].includes(request.auth.token.role)) {
      throw new HttpsError('permission-denied', '您沒有權限執行此操作。')
    }

    const { fileName, fileContent } = request.data
    if (!fileName || !fileContent) {
      throw new HttpsError('invalid-argument', '請求中缺少檔案名稱或內容。')
    }

    logger.info(`接收到檔案 ${fileName}，開始解析...`)

    try {
      const buffer = Buffer.from(fileContent, 'base64')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const sheetAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (sheetAsArray.length < 2) {
        throw new HttpsError('invalid-argument', 'Excel 檔案內容行數不足。')
      }

      let headerRowIndex = -1
      let headers = []
      for (let i = 0; i < sheetAsArray.length; i++) {
        const row = sheetAsArray[i]
        if (row.includes('病歷號') && row.includes('細項名稱')) {
          headerRowIndex = i
          headers = row
          break
        }
      }

      if (headerRowIndex === -1) {
        throw new HttpsError(
          'invalid-argument',
          "找不到有效的標題行 (需包含 '病歷號' 和 '細項名稱')。",
        )
      }

      const dataRows = sheetAsArray.slice(headerRowIndex + 1)
      const headerToIndex = {}
      headers.forEach((header, index) => {
        if (header) headerToIndex[String(header).trim()] = index
      })

      const labItemMapping = {
        白血球: 'WBC',
        紅血球: 'RBC',
        血色素: 'Hb',
        血球容積比: 'Hct',
        平均紅血球容積: 'MCV',
        平均紅血球血紅素量: 'MCH',
        平均紅血球血紅素濃度: 'MCHC',
        血小板: 'Platelet',
        '總膽固醇(血)': 'Cholesterol',
        'BUN(Blood)': 'BUN',
        '三酸甘油酯(血)': 'Triglyceride',
        飯前血糖: 'GlucoseAC',
        'Calcium(Blood)': 'Ca',
        磷: 'P',
        'Uric Acid (B)': 'UricAcid',
        eGFR: 'eGFR',
        '肌酐、血(洗腎專用)': 'Creatinine',
        血中鈉: 'Na',
        血中鉀: 'K',
        總鐵結合能力TIBC: 'TIBC',
        Iron: 'Iron',
        '白蛋白(BCG法)': 'Albumin',
        '總蛋白(血)': 'TotalProtein',
        高密度脂蛋白: 'HDL',
        低密度脂蛋白: 'LDL',
        副甲狀腺素: 'iPTH',
        '血中尿素氮(洗後專用)': 'PostBUN',
        鐵蛋白: 'Ferritin',
      }

      const reports = new Map()
      let errors = []
      const patientCache = new Map()

      for (const rowArray of dataRows) {
        let medicalRecordNumber = String(rowArray[headerToIndex['病歷號']] || '').trim()
        if (medicalRecordNumber) {
          medicalRecordNumber = medicalRecordNumber.replace(/^0+/, '')
        }

        const reportDateStr = String(rowArray[headerToIndex['報告日']] || '').trim()
        const labItemName = String(rowArray[headerToIndex['細項名稱']] || '').trim()
        const labResult = rowArray[headerToIndex['結果']]

        if (
          !medicalRecordNumber ||
          !reportDateStr ||
          !labItemName ||
          labResult === undefined ||
          labResult === null
        ) {
          if (
            rowArray.every(
              (cell) => cell === null || cell === undefined || String(cell).trim() === '',
            )
          )
            continue
          errors.push({
            rowData: JSON.stringify(rowArray),
            reason: '該行缺少 病歷號/報告日/細項名稱/結果',
          })
          continue
        }

        const reportKey = `${medicalRecordNumber}_${reportDateStr}`
        if (!reports.has(reportKey)) {
          let patientDoc
          if (patientCache.has(medicalRecordNumber)) {
            patientDoc = patientCache.get(medicalRecordNumber)
          } else {
            const patientQuery = await db
              .collection('patients')
              .where('medicalRecordNumber', '==', medicalRecordNumber)
              .limit(1)
              .get()
            if (patientQuery.empty) {
              patientCache.set(medicalRecordNumber, null)
            } else {
              patientDoc = patientQuery.docs[0]
              patientCache.set(medicalRecordNumber, patientDoc)
            }
          }

          if (!patientDoc) {
            errors.push({ rowData: `病歷號: ${medicalRecordNumber}`, reason: `找不到對應的病人` })
            continue
          }

          const year = reportDateStr.substring(0, 4)
          const month = reportDateStr.substring(4, 6)
          const day = reportDateStr.substring(6, 8)
          let parsedDate = new Date(`${year}-${month}-${day}`)
          if (isNaN(parsedDate.getTime())) {
            parsedDate = new Date()
          }

          reports.set(reportKey, {
            patientId: patientDoc.id,
            patientName: patientDoc.data().name,
            medicalRecordNumber: patientDoc.data().medicalRecordNumber,
            reportDate: parsedDate,
            sourceFile: fileName,
            createdAt: FieldValue.serverTimestamp(),
            data: {},
          })
        }

        const report = reports.get(reportKey)
        if (report) {
          const dbField = labItemMapping[labItemName]
          if (dbField) {
            const value = parseFloat(labResult)
            report.data[dbField] = isNaN(value) ? String(labResult) : value
          }
        }
      }

      if (reports.size > 0) {
        const batch = db.batch()
        for (const reportData of reports.values()) {
          const newReportRef = db.collection('lab_reports').doc()
          batch.set(newReportRef, reportData)
        }
        await batch.commit()
      }

      return {
        success: true,
        message: `處理完成！成功聚合並匯入 ${reports.size} 份報告，發現 ${errors.length} 個問題行。`,
        processedCount: reports.size,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      }
    } catch (error) {
      logger.error(`處理檔案 ${fileName} 時發生嚴重錯誤:`, error)
      throw new HttpsError('internal', `處理 Excel 檔案時發生錯誤: ${error.message}`)
    }
  },
)
