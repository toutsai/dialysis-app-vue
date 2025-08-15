// 【完整優化版 - 2025-08-15】
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onTaskDispatched } = require('firebase-functions/v2/tasks') // 🔥 新增 Task Queue import
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
const { getFunctions } = require('firebase-admin/functions')

// ===================================================================
// Initialization (初始化)
// ===================================================================

// ✨✨✨ ---【核心、最終的修正】適用於多環境的初始化方式 --- ✨✨✨
// 從 Node.js 的 process.env 中讀取由 Firebase 自動設定的環境變數 GCLOUD_PROJECT。
// 這確保了無論您部署到哪個環境 (develop 或 production)，
// Admin SDK 都會自動使用正確的專案 ID，從而解決 'Queue does not exist' 的根本問題。
admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
})

const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

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

// 🔥 新增輔助函式：查找例外
async function findExceptionByPatientAndDate(patientId, targetDate) {
  try {
    const query = db
      .collection('schedule_exceptions')
      .where('patientId', '==', patientId)
      .where('status', 'in', ['applied', 'processing'])
      .limit(10)

    const snapshot = await query.get()

    for (const doc of snapshot.docs) {
      const ex = doc.data()
      if (ex.type === 'MOVE' && ex.to?.goalDate === targetDate) {
        return { id: doc.id, ...ex }
      }
      if (ex.type === 'SUSPEND') {
        const start = new Date(ex.startDate + 'T00:00:00Z')
        const end = new Date(ex.endDate + 'T00:00:00Z')
        const target = new Date(targetDate + 'T00:00:00Z')
        if (target >= start && target <= end) {
          return { id: doc.id, ...ex }
        }
      }
    }
    return null
  } catch (error) {
    logger.error(`Error finding exception for patient ${patientId} on ${targetDate}:`, error)
    return null
  }
}

// ===================================================================
// Scheduled Functions (定時執行的函式)
// ===================================================================
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '256MiB',
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

exports.cleanupExpiredExceptionsScheduled = onSchedule(
  {
    schedule: 'every day 02:05',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (event) => {
    logger.info('[Scheduler] Running daily check for expired schedule exceptions...')
    const todayStr = formatDateForQuery(new Date())
    try {
      const query = db
        .collection('schedule_exceptions')
        .where('status', '==', 'applied')
        .where('endDate', '<', todayStr)
      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('[Scheduler] No expired schedule exceptions found to clean up.')
        return null
      }
      logger.info(`[Scheduler] Found ${snapshot.size} expired exceptions. Preparing to delete...`)
      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`[Scheduler] Scheduling exception ${doc.id} for deletion.`)
        batch.delete(doc.ref)
      })
      await batch.commit()
      logger.info(`[Scheduler] Successfully deleted ${snapshot.size} expired schedule exceptions.`)
    } catch (error) {
      logger.error('[Scheduler] Failed to clean up expired exceptions:', error)
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
    throw new HttpsError('invalid-argument', '請提供使用者名稱和密碼。')
  }
  try {
    const usersRef = db.collection('users')
    const snapshot = await usersRef.where('username', '==', username).limit(1).get()
    if (snapshot.empty) {
      throw new HttpsError('not-found', '使用者名稱不存在。')
    }
    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()
    if (userData.password !== password) {
      throw new HttpsError('unauthenticated', '密碼不正確。')
    }
    const uid = userDoc.id
    const customToken = await admin
      .auth()
      .createCustomToken(uid, { role: userData.role, name: userData.name })
    return { token: customToken }
  } catch (error) {
    logger.error('[customLogin] Login function error:', error)
    if (error instanceof HttpsError) throw error
    throw new HttpsError('internal', '發生未知的伺服器錯誤。')
  }
})

exports.changeUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '使用者未經驗證，無法更改密碼。')
  }
  const { oldPassword, newPassword } = request.data
  if (!oldPassword || !newPassword || newPassword.length < 6) {
    throw new HttpsError('invalid-argument', '提供的密碼無效，或新密碼長度不足 6 個字元。')
  }
  const uid = request.auth.uid
  try {
    const userDocRef = db.collection('users').doc(uid)
    const userDoc = await userDocRef.get()
    if (!userDoc.exists) {
      throw new HttpsError('not-found', '在資料庫中找不到對應的使用者紀錄。')
    }
    const userData = userDoc.data()
    if (userData.password !== oldPassword) {
      throw new HttpsError('unauthenticated', '舊密碼不正確。')
    }
    await userDocRef.update({ password: newPassword })
    try {
      await admin.auth().updateUser(uid, { password: newPassword })
    } catch (authError) {
      logger.warn(
        `[changeUserPassword] Updated password in Firestore for user ${uid}, but failed to update in Firebase Auth. Reason:`,
        authError.message,
      )
    }
    logger.info(`User ${uid} successfully changed their password.`)
    return { success: true, message: '密碼已成功更新！' }
  } catch (error) {
    logger.error(`[changeUserPassword] Error changing password for user ${uid}:`, error)
    if (error instanceof HttpsError) {
      throw error
    }
    throw new HttpsError('internal', '更新密碼時發生未知的伺服器錯誤。')
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
// 🔥 優化後的 Firestore Triggers (資料庫觸發的函式)
// ===================================================================

// --- ✨✨✨ 智能同步總表到未來排程 (Flow 1 優化版) ✨✨✨ ---
exports.syncMasterScheduleToFuture = onDocumentWritten(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [Flow 1] 智能同步器啟動 (智能保留例外模式)！')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    try {
      if (!pubsub) {
        pubsub = new PubSub()
      }

      // 先獲取所有有效例外，建立保護映射表
      logger.info('[Sync] 正在分析現有例外...')
      const exceptionsQuery = db
        .collection('schedule_exceptions')
        .where('endDate', '>=', formatDateForQuery(new Date()))
        .where('status', 'in', ['applied', 'processing'])

      const exceptionsSnapshot = await exceptionsQuery.get()

      // 建立例外映射表：記錄哪些位置被例外佔用
      const exceptionsByDateAndSlot = new Map()
      const exceptionsByPatientAndDate = new Map()

      exceptionsSnapshot.docs.forEach((doc) => {
        const ex = { id: doc.id, ...doc.data() }

        if (ex.type === 'MOVE' && ex.to?.goalDate) {
          // 記錄目標位置被例外佔用
          const slotKey = `${ex.to.goalDate}_${getScheduleKey(ex.to.bedNum, ex.to.shiftCode)}`
          exceptionsByDateAndSlot.set(slotKey, {
            type: 'MOVE_TARGET',
            exception: ex,
            patientId: ex.patientId,
            patientName: ex.patientName,
          })

          // 記錄病人在特定日期的例外
          const patientKey = `${ex.patientId}_${ex.to.goalDate}`
          exceptionsByPatientAndDate.set(patientKey, ex)
        }

        if (ex.type === 'SUSPEND') {
          // 記錄暫停期間
          const start = new Date(ex.startDate + 'T00:00:00Z')
          const end = new Date(ex.endDate + 'T00:00:00Z')

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDateForQuery(new Date(d))
            const patientKey = `${ex.patientId}_${dateStr}`
            exceptionsByPatientAndDate.set(patientKey, ex)
          }
        }
      })

      logger.info(`[Sync] 發現 ${exceptionsSnapshot.size} 個有效例外，建立保護映射表完成`)

      const masterRules = event.data.after.data().schedule || {}
      logger.info(`[Sync] 成功讀取 ${Object.keys(masterRules).length} 條最新規則。`)
      logger.info(`[Sync] 開始對「明天起」的60天排程進行【智能同步】...`)

      const updatePromises = []
      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setHours(0, 0, 0, 0)
        targetDate.setDate(targetDate.getDate() + i)
        const dateStr = formatDateForQuery(targetDate)

        // 從主規則生成基礎排程
        const dailyScheduleFromRules = generateDailyScheduleFromRules(masterRules, targetDate)

        const promise = db.runTransaction(async (transaction) => {
          const dailyDocRef = db.collection('schedules').doc(dateStr)
          const doc = await transaction.get(dailyDocRef)

          let finalSchedule = {}

          // 第一步：加入基礎規則生成的排程
          for (const [key, slot] of Object.entries(dailyScheduleFromRules)) {
            const patientKey = `${slot.patientId}_${dateStr}`

            // 檢查這個病人在這天是否有例外（SUSPEND）
            if (exceptionsByPatientAndDate.has(patientKey)) {
              const exception = exceptionsByPatientAndDate.get(patientKey)
              if (exception.type === 'SUSPEND') {
                logger.info(`[Sync] 跳過 ${dateStr} ${key}：病人 ${slot.patientId} 有暫停例外`)
                continue // 跳過被暫停的病人
              }
            }

            // 檢查這個位置是否被例外佔用
            const slotKey = `${dateStr}_${key}`
            if (exceptionsByDateAndSlot.has(slotKey)) {
              const occupation = exceptionsByDateAndSlot.get(slotKey)
              logger.info(
                `[Sync] 位置衝突 ${dateStr} ${key}：被例外 ${occupation.exception.id} 佔用`,
              )
              // 這裡可以根據需要決定是否覆蓋，目前選擇跳過
              continue
            }

            finalSchedule[key] = slot
          }

          // 第二步：保留現有的例外產生的排程
          if (doc.exists) {
            const currentSchedule = doc.data().schedule || {}

            for (const [key, slot] of Object.entries(currentSchedule)) {
              // 檢查是否是例外產生的排程
              if (
                slot.manualNote?.includes('例外') ||
                exceptionsByDateAndSlot.has(`${dateStr}_${key}`)
              ) {
                finalSchedule[key] = slot // 保留例外排程
                logger.info(`[Sync] 保留例外排程: ${dateStr} ${key} for ${slot.patientName}`)
              }
            }
          }

          // 更新排程
          if (!doc.exists) {
            transaction.set(dailyDocRef, {
              date: dateStr,
              schedule: finalSchedule,
              createdAt: FieldValue.serverTimestamp(),
              lastSynced: FieldValue.serverTimestamp(),
              syncMode: 'smart_preserve_exceptions',
            })
          } else {
            transaction.update(dailyDocRef, {
              schedule: finalSchedule,
              lastSynced: FieldValue.serverTimestamp(),
              syncMode: 'smart_preserve_exceptions',
            })
          }
        })

        updatePromises.push(promise)
      }

      await Promise.all(updatePromises)
      logger.info('✅ [Flow 1] 智能同步完成，例外已保留！')

      // 觸發重新校正流程（驗證和修復剩餘衝突）
      const topicName = 'resync-exceptions'
      await pubsub.topic(topicName).publishMessage({
        data: Buffer.from(
          JSON.stringify({
            reason: `Master schedule smart sync completed at ${new Date().toISOString()}`,
            mode: 'verify_and_fix_conflicts',
          }),
        ),
      })
      logger.info('✅ [Flow 1] 已發布訊息，觸發例外驗證和修復流程。')
    } catch (error) {
      logger.error('❌ [Flow 1] 在智能同步 MASTER_SCHEDULE 時發生錯誤:', error)
    }
    return null
  },
)

// --- ✨✨✨ 簡化的新例外申請處理器 (直接使用 Cloud Tasks) ✨✨✨ ---
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

    logger.info(`🚀 [NewException] 新例外申請: ${exceptionId} (${exceptionData.type})`)

    if (exceptionData.status !== 'pending') {
      logger.info(`申請 ${exceptionId} 狀態為 "${exceptionData.status}"，非 "pending"，不予處理。`)
      return
    }

    // 更新狀態為處理中
    await exceptionDoc.ref.update({ status: 'processing' })

    try {
      // 直接使用 Cloud Tasks 處理（與批量處理使用相同佇列）
      const queue = getFunctions().taskQueue('exceptionHandlerQueue')

      const payload = {
        id: exceptionId,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        type: exceptionData.type,
        reason: exceptionData.reason,
        startDate: exceptionData.startDate,
        endDate: exceptionData.endDate,
        from: exceptionData.from,
        to: exceptionData.to,
        status: exceptionData.status,
        createdAtISO: exceptionData.createdAt?.toDate().toISOString() || null,
        processingOrder: 1,
        totalCount: 1,
        triggerMode: 'immediate_single',
      }

      // 立即處理，無延遲
      await queue.enqueue(payload, {
        scheduleDelaySeconds: 0,
      })

      logger.info(`✅ [NewException] 例外 ${exceptionId} 已加入即時處理佇列`)
    } catch (error) {
      logger.error(`❌ [NewException] 處理例外 ${exceptionId} 失敗:`, error)
      await exceptionDoc.ref.update({
        status: 'error',
        errorMessage: error.message,
        lastFailedAt: FieldValue.serverTimestamp(),
      })
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

// --- ✨✨✨ 優化的任務分派總管 (Pub/Sub 觸發 - 流程三) ✨✨✨ ---
exports.reapplyAllActiveExceptions = onMessagePublished(
  {
    topic: 'resync-exceptions',
    timeoutSeconds: 540,
    memory: '1GiB',
    region: 'asia-east1',
  },
  async (event) => {
    logger.info('🚀 [TaskDispatcher] 優化任務分派總管啟動！')

    try {
      // 解析觸發訊息
      const messageData = event.data ? JSON.parse(Buffer.from(event.data, 'base64').toString()) : {}
      const triggerMode = messageData.mode || 'standard'

      logger.info(`[TaskDispatcher] 觸發模式: ${triggerMode}`)

      const exceptionsQuery = db
        .collection('schedule_exceptions')
        .where('endDate', '>=', formatDateForQuery(new Date()))

      const exceptionsSnapshot = await exceptionsQuery.get()

      if (exceptionsSnapshot.empty) {
        logger.info('✅ [TaskDispatcher] 沒有需要校正的有效例外。')
        return null
      }

      const exceptions = exceptionsSnapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => {
          // 🔥 多層智能排序邏輯

          // 1. 先按類型排序：SUSPEND 優先 (釋放床位)
          if (a.type !== b.type) {
            if (a.type === 'SUSPEND' && b.type === 'MOVE') return -1
            if (a.type === 'MOVE' && b.type === 'SUSPEND') return 1
          }

          // 2. 對於相同類型，按創建時間排序
          const aTime = a.createdAt?.toMillis() || 0
          const bTime = b.createdAt?.toMillis() || 0

          if (aTime !== bTime) {
            return aTime - bTime
          }

          // 3. 如果時間相同，MOVE 類型按目標日期排序（較早日期優先）
          if (a.type === 'MOVE' && b.type === 'MOVE') {
            const aDate = a.to?.goalDate || '9999-12-31'
            const bDate = b.to?.goalDate || '9999-12-31'
            return aDate.localeCompare(bDate)
          }

          return 0
        })

      // 統計分析
      const suspendCount = exceptions.filter((e) => e.type === 'SUSPEND').length
      const moveCount = exceptions.filter((e) => e.type === 'MOVE').length

      logger.info(`[TaskDispatcher] 找到 ${exceptions.length} 個例外，已優化排序。`)
      logger.info(`[TaskDispatcher] SUSPEND: ${suspendCount}, MOVE: ${moveCount}`)
      logger.info(
        `[TaskDispatcher] 處理順序預覽: ${exceptions
          .slice(0, 5)
          .map((e) => `${e.type}#${e.id}`)
          .join(', ')}...`,
      )

      // 🔥 修正：使用正確的佇列名稱
      const queue = getFunctions().taskQueue('exceptionHandlerQueue')
      const tasks = []

      for (let i = 0; i < exceptions.length; i++) {
        const ex = exceptions[i]

        const payload = {
          id: ex.id,
          patientId: ex.patientId,
          patientName: ex.patientName,
          type: ex.type,
          reason: ex.reason,
          startDate: ex.startDate,
          endDate: ex.endDate,
          from: ex.from,
          to: ex.to,
          status: ex.status,
          createdAtISO: ex.createdAt?.toDate().toISOString() || null,
          processingOrder: i + 1,
          totalCount: exceptions.length,
          triggerMode: triggerMode,
        }

        // 🔥 優化的延遲策略
        let scheduleDelay = 0

        if (ex.type === 'SUSPEND') {
          // SUSPEND 立即處理或很短延遲
          scheduleDelay = i * 1
        } else if (ex.type === 'MOVE') {
          // MOVE 稍微延遲，確保 SUSPEND 先完成
          scheduleDelay = suspendCount * 1 + (i - suspendCount) * 3
        }

        tasks.push(
          queue.enqueue(payload, {
            scheduleDelaySeconds: Math.max(0, scheduleDelay),
          }),
        )
      }

      await Promise.all(tasks)
      logger.info(
        `[TaskDispatcher] ✅ 成功將 ${exceptions.length} 個任務加入佇列，預計 ${Math.max(...tasks.map((_, i) => (exceptions[i].type === 'SUSPEND' ? i : suspendCount + (i - suspendCount) * 3)))} 秒內完成。`,
      )
    } catch (error) {
      logger.error('❌ [TaskDispatcher] 執行任務分派時發生嚴重錯誤:', error)
    }
    return null
  },
)

// --- ✨✨✨ 優化的 Cloud Tasks 任務執行者 (Task Queue 觸發 - 流程三的子流程) ✨✨✨ ---
exports.exceptionHandlerQueue = onTaskDispatched(
  {
    // 關鍵配置：確保任務按順序執行
    rateLimits: {
      maxConcurrentDispatches: 1, // 一次只處理一個任務
      maxDispatchesPerSecond: 1, // 每秒最多處理一個任務
    },
    retryConfig: {
      maxAttempts: 3,
      minBackoffSeconds: 30,
      maxBackoffSeconds: 120,
      maxDoublings: 2,
    },
    timeoutSeconds: 300,
    memory: '512MiB',
    region: 'asia-east1',
  },
  async (req) => {
    const startTime = Date.now()

    try {
      const ex = req.data // Task Queue 使用 req.data

      // 驗證輸入資料
      if (!ex || !ex.id || !ex.patientId || !ex.type) {
        logger.error('[TaskWorker] ❌ Received invalid or incomplete exception data.', ex)
        throw new Error('Invalid exception data provided.')
      }

      logger.info(
        `[TaskWorker] 👷‍♂️ Processing exception ${ex.processingOrder}/${ex.totalCount}: #${ex.id} (${ex.type} for ${ex.patientName}) - CreatedAt: ${ex.createdAtISO}...`,
      )

      // 先檢查例外是否仍然有效
      const exceptionRef = db.collection('schedule_exceptions').doc(ex.id)
      const exceptionDoc = await exceptionRef.get()

      if (!exceptionDoc.exists) {
        logger.info(`[TaskWorker] Exception ${ex.id} no longer exists, skipping`)
        return
      }

      const currentStatus = exceptionDoc.data().status
      if (currentStatus === 'applied') {
        logger.info(`[TaskWorker] Exception ${ex.id} already applied, skipping`)
        return
      }

      // 處理 MOVE 類型例外
      if (ex.type === 'MOVE') {
        await db.runTransaction(async (transaction) => {
          // 驗證 MOVE 必要欄位
          if (!ex.from?.sourceDate || !ex.to?.goalDate) {
            throw new Error('MOVE exception is missing sourceDate or goalDate.')
          }

          const { from, to, patientId, patientName } = ex
          const targetScheduleRef = db.collection('schedules').doc(to.goalDate)
          const targetKey = getScheduleKey(to.bedNum, to.shiftCode)

          let isConflict = false
          let conflictReason = ''
          let conflictResolution = null

          // 檢查目標位置是否有衝突
          const targetScheduleDoc = await transaction.get(targetScheduleRef)
          const currentSchedule = targetScheduleDoc.exists
            ? targetScheduleDoc.data().schedule || {}
            : {}

          if (currentSchedule[targetKey]) {
            const occupant = currentSchedule[targetKey]
            isConflict = true

            // 🔥 智能衝突解決邏輯
            if (occupant.manualNote?.includes('例外')) {
              // 如果是另一個例外佔用，比較優先級（創建時間）
              try {
                const occupantException = await findExceptionByPatientAndDate(
                  occupant.patientId,
                  to.goalDate,
                )

                if (occupantException && ex.createdAtISO) {
                  const currentExceptionTime = new Date(ex.createdAtISO).getTime()
                  const occupantExceptionTime = occupantException.createdAt?.toMillis() || 0

                  if (currentExceptionTime < occupantExceptionTime) {
                    // 當前例外較早創建，優先級較高
                    conflictReason = `位置被較晚例外 ${occupantException.id} 佔用，當前例外優先級較高`
                    conflictResolution = 'override_later_exception'
                    isConflict = false // 可以強制執行

                    logger.info(
                      `[TaskWorker] 解決衝突：${ex.id} 優先級較高，將覆蓋後創建的例外 ${occupantException.id}`,
                    )
                  } else {
                    conflictReason = `位置被較早例外 ${occupantException.id} 佔用 (${occupant.patientName})`
                    conflictResolution = 'yield_to_earlier_exception'
                  }
                } else {
                  conflictReason = `位置被例外佔用 (${occupant.patientName})，但無法確定優先級`
                  conflictResolution = 'unknown_priority'
                }
              } catch (error) {
                logger.warn(`[TaskWorker] 檢查例外優先級時發生錯誤: ${error.message}`)
                conflictReason = `位置被例外佔用 (${occupant.patientName})，優先級檢查失敗`
                conflictResolution = 'priority_check_failed'
              }
            } else {
              // 與基礎排程衝突
              conflictReason = `床位已被基礎排程 ${occupant.patientName || '未知病人'} 佔用`
              conflictResolution = 'conflict_with_base_schedule'
            }
          }

          if (isConflict) {
            // 有衝突且無法解決：更新例外狀態為需要解決
            logger.warn(`[TaskWorker] 💥 Conflict detected for #${ex.id}: ${conflictReason}`)
            transaction.update(exceptionRef, {
              status: 'conflict_requires_resolution',
              errorMessage: `與排程衝突：${conflictReason}`,
              conflictResolution: conflictResolution,
              processedAt: FieldValue.serverTimestamp(),
            })
          } else {
            // 無衝突或可以強制執行：執行移動操作
            const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
            const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)

            // 從原位置移除
            transaction.update(sourceScheduleRef, {
              [`schedule.${sourceKey}`]: FieldValue.delete(),
            })

            // 新增到目標位置
            const newSlotData = {
              patientId,
              patientName,
              shiftId: to.shiftCode,
              manualNote: `(例外調班${conflictResolution ? ` - ${conflictResolution}` : ''})`,
            }

            transaction.set(
              targetScheduleRef,
              { schedule: { [targetKey]: newSlotData } },
              { merge: true },
            )

            // 更新例外狀態為已套用
            if (ex.status !== 'applied') {
              transaction.update(exceptionRef, {
                status: 'applied',
                errorMessage: '',
                conflictResolution: conflictResolution,
                processedAt: FieldValue.serverTimestamp(),
              })
            }

            const actionDescription =
              conflictResolution === 'override_later_exception' ? `強制移動 (覆蓋較晚例外)` : '移動'

            logger.info(
              `[TaskWorker] ✅ Successfully ${actionDescription} patient from ${from.sourceDate} to ${to.goalDate}`,
            )
          }
        })

        // 處理 SUSPEND 類型例外
      } else if (ex.type === 'SUSPEND') {
        // 驗證 SUSPEND 必要欄位
        if (!ex.startDate || !ex.endDate) {
          throw new Error('SUSPEND exception is missing startDate or endDate.')
        }

        const { patientId, startDate, endDate, patientName } = ex
        const start = new Date(startDate + 'T00:00:00Z')
        const end = new Date(endDate + 'T00:00:00Z')

        let processedDays = 0
        let skippedDays = 0

        // 遍歷暫停期間的每一天
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateForQuery(new Date(d))

          await db.runTransaction(async (transaction) => {
            const scheduleRef = db.collection('schedules').doc(dateStr)
            const doc = await transaction.get(scheduleRef)

            if (doc.exists) {
              const scheduleData = doc.data().schedule || {}
              let foundAndRemoved = false

              // 尋找並移除該病人的排程
              for (const key in scheduleData) {
                if (scheduleData[key].patientId === patientId) {
                  transaction.update(scheduleRef, {
                    [`schedule.${key}`]: FieldValue.delete(),
                  })
                  processedDays++
                  foundAndRemoved = true
                  logger.info(
                    `[TaskWorker] Removed schedule for ${patientName} on ${dateStr} (${key})`,
                  )
                  break
                }
              }

              if (!foundAndRemoved) {
                skippedDays++
              }
            } else {
              skippedDays++
            }
          })
        }

        // 更新例外狀態為已套用
        if (ex.status !== 'applied') {
          await exceptionRef.update({
            status: 'applied',
            errorMessage: '',
            processedAt: FieldValue.serverTimestamp(),
            processedDaysCount: processedDays,
            skippedDaysCount: skippedDays,
          })
        }

        logger.info(
          `[TaskWorker] ✅ Successfully suspended ${patientName} for ${processedDays} days (skipped ${skippedDays} days)`,
        )
      } else {
        // 未知的例外類型
        throw new Error(`Unknown exception type: ${ex.type}`)
      }

      const processingTime = Date.now() - startTime
      logger.info(
        `[TaskWorker] ✅ Successfully processed exception #${ex.id} in ${processingTime}ms`,
      )
    } catch (error) {
      const processingTime = Date.now() - startTime
      logger.error(
        `[TaskWorker] ❌ Failed to process exception #${req.data?.id || 'unknown'} after ${processingTime}ms:`,
        error,
      )

      // 更新例外狀態為處理失敗
      if (req.data?.id) {
        try {
          await db
            .collection('schedule_exceptions')
            .doc(req.data.id)
            .update({
              status: 'processing_failed',
              errorMessage: error.message,
              lastFailedAt: FieldValue.serverTimestamp(),
              processingTimeMs: Date.now() - startTime,
            })
        } catch (updateError) {
          logger.error(`[TaskWorker] Failed to update error status:`, updateError)
        }
      }

      // 重新拋出錯誤讓 Cloud Tasks 處理重試
      throw error
    }
  },
)

exports.onExceptionDeleted = onDocumentDeleted(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const deletedException = event.data.data()
    const exceptionId = event.params.exceptionId
    logger.info(`🚀 [Reverter v2] 例外恢復處理器啟動: ${exceptionId}`)
    if (!deletedException || !deletedException.patientId || !deletedException.type) {
      logger.error(`❌ [Reverter v2] 失敗：被刪除的例外資料不完整。`, deletedException)
      return
    }
    const { patientId } = deletedException
    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.error('❌ [Reverter v2] 嚴重錯誤：找不到總表規則，無法恢復排班。')
        return
      }
      const masterRules = masterScheduleDoc.data().schedule || {}
      const patientRule = masterRules[patientId]
      let affectedDates = []
      if (deletedException.type === 'MOVE') {
        const dates = new Set()
        if (deletedException.from?.sourceDate) dates.add(deletedException.from.sourceDate)
        if (deletedException.to?.goalDate) dates.add(deletedException.to.goalDate)
        affectedDates = Array.from(dates)
      } else if (deletedException.type === 'SUSPEND') {
        if (deletedException.startDate && deletedException.endDate) {
          const start = new Date(deletedException.startDate + 'T00:00:00Z')
          const end = new Date(deletedException.endDate + 'T00:00:00Z')
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            affectedDates.push(formatDateForQuery(new Date(d)))
          }
        }
      }
      const restorePromises = affectedDates.map((dateStr) => {
        const scheduleRef = db.collection('schedules').doc(dateStr)
        return db.runTransaction(async (transaction) => {
          const scheduleDoc = await transaction.get(scheduleRef)
          if (!scheduleDoc.exists) return
          const currentSchedule = scheduleDoc.data().schedule || {}
          const updates = {}
          for (const key in currentSchedule) {
            if (currentSchedule[key].patientId === patientId) {
              updates[`schedule.${key}`] = FieldValue.delete()
            }
          }
          if (patientRule && patientRule.freq) {
            const freqDays = FREQ_MAP_TO_DAY_INDEX[patientRule.freq] || []
            const targetDate = new Date(dateStr + 'T00:00:00Z')
            const dayOfWeek = targetDate.getDay()
            const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1
            if (freqDays.includes(systemDayIndex)) {
              const { bedNum, shiftIndex, autoNote, manualNote } = patientRule
              const shiftCode = SHIFTS[shiftIndex]
              const scheduleKey = getScheduleKey(bedNum, shiftCode)
              updates[`schedule.${scheduleKey}`] = {
                patientId: patientId,
                shiftId: shiftCode,
                autoNote: autoNote || '',
                manualNote: manualNote || '',
                baseRuleId: patientId,
              }
            }
          }
          if (Object.keys(updates).length > 0) {
            transaction.update(scheduleRef, updates)
          }
        })
      })
      await Promise.all(restorePromises)
    } catch (error) {
      logger.error(`❌ [Reverter v2] 恢復例外 ${exceptionId} 時發生錯誤:`, error)
    }
  },
)

// ===================================================================
// Lab Report Functions (檢驗報告相關函式)
// ===================================================================
exports.processLabReport = onCall({ timeoutSeconds: 300, memory: '1GiB' }, async (request) => {
  const XLSX = require('xlsx')
  const allowedRoles = ['admin', 'editor', 'contributor']
  if (!request.auth || !allowedRoles.includes(request.auth.token.role)) {
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
})
