// 【最終優化簡化版 - 分離架構：基礎同步 + 兩階段例外處理 - 2025-08-16】

// ===================================================================
// 🔥 全域設定 - 必須在所有 require 之前
// ===================================================================
const { setGlobalOptions } = require('firebase-functions/v2')

// 設定全域預設值 - 所有函數都會使用這些設定
setGlobalOptions({
  region: 'asia-east1', // 統一區域到台灣
  timeoutSeconds: 60, // 預設超時時間
  memory: '256MiB', // 預設記憶體
  maxInstances: 100, // 最大實例數
})

// ===================================================================
// Imports (引入模組)
// ===================================================================
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  onDocumentWritten,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')

// ===================================================================
// Initialization (初始化)
// ===================================================================

// 適用於多環境的初始化方式
// 從 process.env 中讀取由 Firebase 自動設定的環境變數 GCLOUD_PROJECT
admin.initializeApp({
  projectId: process.env.GCLOUD_PROJECT,
})

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

// ===================================================================
// 🔥 兩階段例外處理 - 內部函數
// ===================================================================
async function reapplyAllExceptionsInternal() {
  logger.info('🔄 [ReapplyExceptions] 開始兩階段例外處理')

  try {
    // ===== 步驟 1：讀取所有有效的例外 =====
    const exceptionsSnapshot = await db
      .collection('schedule_exceptions')
      .where('status', 'in', ['applied', 'pending', 'processing'])
      .get()

    if (exceptionsSnapshot.empty) {
      logger.info('✅ 沒有需要套用的例外')
      return { success: true, processed: 0 }
    }

    const exceptions = exceptionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || 0,
    }))

    logger.info(`找到 ${exceptions.length} 個例外需要處理`)

    // ===== 步驟 2：計算影響的日期範圍 =====
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const sixtyDaysLater = new Date(today)
    sixtyDaysLater.setDate(today.getDate() + 60)

    // 收集所有受影響的日期
    const affectedDates = new Set()

    for (const exception of exceptions) {
      if (exception.type === 'SUSPEND') {
        const start = new Date(
          Math.max(new Date(exception.startDate + 'T00:00:00Z').getTime(), tomorrow.getTime()),
        )
        const end = new Date(
          Math.min(new Date(exception.endDate + 'T00:00:00Z').getTime(), sixtyDaysLater.getTime()),
        )

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          affectedDates.add(formatDateForQuery(new Date(d)))
        }
      } else if (exception.type === 'MOVE') {
        if (exception.from?.sourceDate) {
          const sourceDate = new Date(exception.from.sourceDate + 'T00:00:00Z')
          if (sourceDate >= tomorrow && sourceDate <= sixtyDaysLater) {
            affectedDates.add(exception.from.sourceDate)
          }
        }
        if (exception.to?.goalDate) {
          const goalDate = new Date(exception.to.goalDate + 'T00:00:00Z')
          if (goalDate >= tomorrow && goalDate <= sixtyDaysLater) {
            affectedDates.add(exception.to.goalDate)
          }
        }
      }
    }

    const datesList = Array.from(affectedDates).sort()
    logger.info(`影響 ${datesList.length} 個日期`)

    // ===== 步驟 3：讀取所有受影響日期的排程 =====
    const scheduleMap = new Map() // key: dateStr, value: schedule data

    // 批次讀取（Firestore 'in' 查詢限制30個）
    for (let i = 0; i < datesList.length; i += 30) {
      const batch = datesList.slice(i, i + 30)
      const snapshot = await db.collection('schedules').where('date', 'in', batch).get()

      snapshot.docs.forEach((doc) => {
        const data = doc.data()
        scheduleMap.set(doc.id, data.schedule || {})
      })
    }

    // 確保所有日期都有排程物件
    datesList.forEach((dateStr) => {
      if (!scheduleMap.has(dateStr)) {
        scheduleMap.set(dateStr, {})
      }
    })

    // ===== 步驟 4：第一階段 - 收集並執行所有刪除 =====
    logger.info('📝 第一階段：處理所有刪除')

    const deletions = new Map() // key: "dateStr|position", value: patientId

    for (const exception of exceptions) {
      if (exception.type === 'SUSPEND') {
        // 收集暫停期間要刪除的所有位置
        const start = new Date(
          Math.max(new Date(exception.startDate + 'T00:00:00Z').getTime(), tomorrow.getTime()),
        )
        const end = new Date(
          Math.min(new Date(exception.endDate + 'T00:00:00Z').getTime(), sixtyDaysLater.getTime()),
        )

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateForQuery(new Date(d))
          const schedule = scheduleMap.get(dateStr) || {}

          // 找到該病人的位置並標記刪除
          for (const [position, slot] of Object.entries(schedule)) {
            if (slot.patientId === exception.patientId) {
              deletions.set(`${dateStr}|${position}`, exception.patientId)
              logger.info(`  └─ 標記刪除: ${dateStr} ${position} (${exception.patientName})`)
              break
            }
          }
        }
      } else if (exception.type === 'MOVE' && exception.from) {
        // 收集調床來源位置要刪除的
        const { sourceDate, bedNum, shiftCode } = exception.from
        if (scheduleMap.has(sourceDate)) {
          const position = getScheduleKey(bedNum, shiftCode)
          const schedule = scheduleMap.get(sourceDate)

          if (schedule[position]?.patientId === exception.patientId) {
            deletions.set(`${sourceDate}|${position}`, exception.patientId)
            logger.info(`  └─ 標記移除: ${sourceDate} ${position} (${exception.patientName})`)
          }
        }
      }
    }

    logger.info(`第一階段完成：標記了 ${deletions.size} 個位置要刪除`)

    // 執行所有刪除
    for (const [key, patientId] of deletions) {
      const [dateStr, position] = key.split('|')
      const schedule = scheduleMap.get(dateStr)

      if (schedule && schedule[position]) {
        delete schedule[position]
      }
    }

    // ===== 步驟 5：第二階段 - 收集並執行所有新增 =====
    logger.info('📝 第二階段：處理所有新增')

    const additions = new Map() // key: "dateStr|position", value: slot data
    const conflicts = []

    // 按創建時間排序，確保先創建的例外有優先權
    exceptions.sort((a, b) => a.createdAt - b.createdAt)

    for (const exception of exceptions) {
      if (exception.type === 'MOVE' && exception.to) {
        const { goalDate, bedNum, shiftCode } = exception.to

        if (scheduleMap.has(goalDate)) {
          const position = getScheduleKey(bedNum, shiftCode)
          const schedule = scheduleMap.get(goalDate)

          // 檢查位置是否已被佔用
          if (schedule[position]) {
            const occupant = schedule[position]
            conflicts.push({
              exceptionId: exception.id,
              date: goalDate,
              position: position,
              wantedBy: exception.patientName,
              occupiedBy: occupant.patientName || occupant.patientId,
              resolution: 'skipped',
            })
            logger.warn(`  └─ 衝突: ${goalDate} ${position} 已被 ${occupant.patientName} 佔用`)
            continue
          }

          // 檢查是否已在 additions 中（另一個例外要用）
          const addKey = `${goalDate}|${position}`
          if (additions.has(addKey)) {
            const existing = additions.get(addKey)
            conflicts.push({
              exceptionId: exception.id,
              date: goalDate,
              position: position,
              wantedBy: exception.patientName,
              occupiedBy: existing.patientName,
              resolution: 'skipped - 另一個例外已預約',
            })
            logger.warn(`  └─ 衝突: ${goalDate} ${position} 已被另一個例外預約`)
            continue
          }

          // 可以新增
          additions.set(addKey, {
            patientId: exception.patientId,
            patientName: exception.patientName,
            shiftId: shiftCode,
            manualNote: '(例外調班)',
            exceptionId: exception.id,
            appliedAt: FieldValue.serverTimestamp(),
          })

          logger.info(`  └─ 標記新增: ${goalDate} ${position} (${exception.patientName})`)
        }
      }
    }

    logger.info(`第二階段完成：標記了 ${additions.size} 個位置要新增`)

    // 執行所有新增
    for (const [key, slotData] of additions) {
      const [dateStr, position] = key.split('|')
      const schedule = scheduleMap.get(dateStr)

      if (schedule) {
        schedule[position] = slotData
      }
    }

    // ===== 步驟 6：批次寫回資料庫 =====
    logger.info('💾 寫回資料庫')

    const BATCH_SIZE = 400
    let batch = db.batch()
    let operationCount = 0
    let totalUpdated = 0

    for (const [dateStr, schedule] of scheduleMap) {
      const docRef = db.collection('schedules').doc(dateStr)

      batch.set(
        docRef,
        {
          date: dateStr,
          schedule: schedule,
          lastModified: FieldValue.serverTimestamp(),
          reappliedAt: FieldValue.serverTimestamp(),
          method: 'two-phase-reapply',
        },
        { merge: true },
      )

      operationCount++
      totalUpdated++

      if (operationCount >= BATCH_SIZE) {
        await batch.commit()
        logger.info(`批次提交：${operationCount} 個操作`)
        batch = db.batch()
        operationCount = 0
      }
    }

    if (operationCount > 0) {
      await batch.commit()
      logger.info(`最終批次：${operationCount} 個操作`)
    }

    // ===== 步驟 7：更新例外狀態 =====
    const exceptionBatch = db.batch()
    let exceptionCount = 0

    for (const exception of exceptions) {
      exceptionBatch.update(db.collection('schedule_exceptions').doc(exception.id), {
        status: 'applied',
        lastReapplied: FieldValue.serverTimestamp(),
        reapplyMethod: 'two-phase',
      })

      exceptionCount++
      if (exceptionCount >= BATCH_SIZE) {
        await exceptionBatch.commit()
        exceptionCount = 0
        exceptionBatch = db.batch()
      }
    }

    if (exceptionCount > 0) {
      await exceptionBatch.commit()
    }

    // ===== 記錄結果 =====
    await db.collection('reapply_logs').add({
      timestamp: FieldValue.serverTimestamp(),
      method: 'two-phase',
      stats: {
        totalExceptions: exceptions.length,
        totalDeletions: deletions.size,
        totalAdditions: additions.size,
        totalConflicts: conflicts.length,
        totalDatesUpdated: scheduleMap.size,
      },
      conflicts: conflicts.length > 0 ? conflicts : null,
    })

    logger.info(`✅ 兩階段例外處理完成：`)
    logger.info(`  - 處理例外：${exceptions.length}`)
    logger.info(`  - 刪除位置：${deletions.size}`)
    logger.info(`  - 新增位置：${additions.size}`)
    logger.info(`  - 衝突：${conflicts.length}`)
    logger.info(`  - 更新天數：${scheduleMap.size}`)

    return {
      success: true,
      processed: exceptions.length,
      deletions: deletions.size,
      additions: additions.size,
      conflicts: conflicts.length,
    }
  } catch (error) {
    logger.error('❌ [ReapplyExceptions] 兩階段處理失敗:', error)
    throw error
  }
}

// ===================================================================
// Scheduled Functions (定時執行的函式)
// ===================================================================

// 檢查過期的備忘錄
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
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

// 清理過期的例外
exports.cleanupExpiredExceptionsScheduled = onSchedule(
  {
    schedule: 'every day 02:05',
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 300,
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

// 初始化未來排程
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

// 自訂登入
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

// 更改使用者密碼
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

// 確保未來排程
exports.ensureFutureSchedules = onCall(
  {
    timeoutSeconds: 300,
    memory: '512MiB',
  },
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
// 🔥 基礎同步 + 兩階段例外處理（分離架構）
// ===================================================================
exports.syncMasterScheduleToFuture = onDocumentWritten(
  {
    document: 'base_schedules/MASTER_SCHEDULE',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('🚀 [BasicSync] Step 1/2: 開始基礎同步')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    try {
      const masterRules = event.data.after.data().schedule || {}
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // ===== 步驟 1：生成60天基礎排程 =====
      logger.info('[BasicSync] 生成60天基礎排程...')
      const schedules = new Map()

      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setDate(today.getDate() + i)
        const dateStr = formatDateForQuery(targetDate)

        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        schedules.set(dateStr, dailySchedule)
      }

      logger.info(`[BasicSync] 生成了 ${schedules.size} 天的基礎排程`)

      // ===== 步驟 2：批次寫入（完全覆蓋）=====
      logger.info('[BasicSync] 開始批次寫入...')
      const BATCH_SIZE = 400
      let batch = db.batch()
      let count = 0
      let totalWritten = 0

      for (const [dateStr, schedule] of schedules) {
        batch.set(
          db.collection('schedules').doc(dateStr),
          {
            date: dateStr,
            schedule: schedule,
            syncedAt: FieldValue.serverTimestamp(),
            syncType: 'basic',
            syncMethod: 'overwrite',
          },
          { merge: false }, // 完全覆蓋
        )

        count++
        totalWritten++

        if (count >= BATCH_SIZE) {
          await batch.commit()
          logger.info(`[BasicSync] 批次提交：${count} 個文件`)
          batch = db.batch()
          count = 0
        }
      }

      if (count > 0) {
        await batch.commit()
        logger.info(`[BasicSync] 最終批次：${count} 個文件`)
      }

      logger.info(`✅ [BasicSync] Step 1/2 完成：已覆蓋 ${totalWritten} 天的基礎排程`)

      // ===== 步驟 3：呼叫兩階段例外處理 =====
      logger.info('🔄 [BasicSync] Step 2/2: 開始套用例外...')

      try {
        const result = await reapplyAllExceptionsInternal()

        logger.info(`✅ [BasicSync] Step 2/2 完成：處理了 ${result.processed} 個例外`)

        // 記錄同步報告
        await db.collection('sync_logs').add({
          type: 'basic_sync_with_exceptions',
          timestamp: FieldValue.serverTimestamp(),
          stats: {
            basicSync: {
              totalDays: totalWritten,
              method: 'overwrite',
            },
            exceptions: result,
          },
        })

        logger.info('✅ [BasicSync] 全部完成！基礎同步 + 例外處理成功')
      } catch (error) {
        logger.error('❌ [BasicSync] Step 2/2 例外處理失敗:', error)

        // 記錄錯誤但不中斷，至少基礎排程已經同步
        await db.collection('sync_logs').add({
          type: 'basic_sync_exception_error',
          timestamp: FieldValue.serverTimestamp(),
          basicSyncSuccess: true,
          exceptionError: {
            message: error.message,
            stack: error.stack,
          },
        })
      }
    } catch (error) {
      logger.error('❌ [BasicSync] 基礎同步失敗:', error)

      await db.collection('sync_logs').add({
        type: 'basic_sync_error',
        timestamp: FieldValue.serverTimestamp(),
        error: {
          message: error.message,
          stack: error.stack,
          code: error.code,
        },
      })

      throw error
    }

    return null
  },
)

// ===================================================================
// 🔥 即時例外處理 - 立即修改排程
// ===================================================================
exports.handleNewExceptionRequest = onDocumentCreated(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const exceptionDoc = event.data
    const exceptionData = exceptionDoc.data()
    const exceptionId = exceptionDoc.id

    logger.info(
      `🚀 [NewException] 新例外申請: ${exceptionId} (${exceptionData.type} - ${exceptionData.patientName})`,
    )

    if (exceptionData.status !== 'pending') {
      logger.info(`[NewException] 例外 ${exceptionId} 狀態為 ${exceptionData.status}，跳過處理`)
      return null
    }

    try {
      // 更新狀態為處理中
      await exceptionDoc.ref.update({
        status: 'processing',
        processingStarted: FieldValue.serverTimestamp(),
      })

      // 驗證必要欄位
      if (!exceptionData.patientId || !exceptionData.type) {
        throw new Error('例外資料不完整：缺少 patientId 或 type')
      }

      let processedDates = []
      let conflicts = []

      // ===== 處理 MOVE 類型 =====
      if (exceptionData.type === 'MOVE') {
        const { from, to, patientId, patientName } = exceptionData

        // 驗證 MOVE 必要欄位
        if (
          !from?.sourceDate ||
          !from?.bedNum ||
          !from?.shiftCode ||
          !to?.goalDate ||
          !to?.bedNum ||
          !to?.shiftCode
        ) {
          throw new Error('MOVE 例外資料不完整：缺少來源或目標資訊')
        }

        await db.runTransaction(async (transaction) => {
          // ===== 第一階段：執行所有讀取操作 =====
          const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
          const targetScheduleRef = db.collection('schedules').doc(to.goalDate)

          // 同時讀取兩個文件
          const [sourceDoc, targetDoc] = await Promise.all([
            transaction.get(sourceScheduleRef),
            transaction.get(targetScheduleRef),
          ])

          // ===== 第二階段：準備所有更新資料 =====
          const updates = []

          // 1. 處理來源位置
          if (sourceDoc.exists) {
            const sourceSchedule = sourceDoc.data().schedule || {}
            const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)

            if (sourceSchedule[sourceKey]) {
              // 確認是同一個病人
              if (sourceSchedule[sourceKey].patientId === patientId) {
                // 準備移除原位置的更新
                updates.push({
                  ref: sourceScheduleRef,
                  data: {
                    [`schedule.${sourceKey}`]: FieldValue.delete(),
                    lastModified: FieldValue.serverTimestamp(),
                    modifiedBy: 'exception_handler',
                  },
                })
                logger.info(`  └─ 移除 ${patientName} 從 ${from.sourceDate} ${sourceKey}`)
              } else {
                logger.warn(`  └─ 警告：原位置 ${sourceKey} 的病人不是 ${patientName}`)
              }
            }
          }

          // 2. 處理目標位置
          const targetKey = getScheduleKey(to.bedNum, to.shiftCode)
          let hasConflict = false

          if (targetDoc.exists) {
            const targetSchedule = targetDoc.data().schedule || {}

            // 檢查衝突
            if (targetSchedule[targetKey]) {
              const occupant = targetSchedule[targetKey]

              // 記錄衝突但仍然執行（例外優先）
              conflicts.push({
                date: to.goalDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
                action: 'override',
                originalExceptionId: occupant.exceptionId || null,
              })

              logger.warn(`  └─ 衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
              hasConflict = true
            }

            // 準備更新目標位置
            updates.push({
              ref: targetScheduleRef,
              data: {
                [`schedule.${targetKey}`]: {
                  patientId: patientId,
                  patientName: patientName,
                  shiftId: to.shiftCode,
                  manualNote: `(例外調班${hasConflict ? '-覆蓋' : ''})`,
                  exceptionId: exceptionId,
                  appliedAt: FieldValue.serverTimestamp(),
                },
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              },
            })
          } else {
            // 目標日期文件不存在，準備創建新文件
            const newSchedule = {
              [targetKey]: {
                patientId: patientId,
                patientName: patientName,
                shiftId: to.shiftCode,
                manualNote: '(例外調班)',
                exceptionId: exceptionId,
                appliedAt: FieldValue.serverTimestamp(),
              },
            }

            updates.push({
              ref: targetScheduleRef,
              data: {
                date: to.goalDate,
                schedule: newSchedule,
                createdAt: FieldValue.serverTimestamp(),
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              },
              isCreate: true, // 標記這是創建操作
            })
          }

          // ===== 第三階段：執行所有寫入操作 =====
          for (const update of updates) {
            if (update.isCreate) {
              transaction.set(update.ref, update.data)
            } else {
              transaction.update(update.ref, update.data)
            }
          }

          logger.info(`  └─ 新增 ${patientName} 到 ${to.goalDate} ${targetKey}`)
          processedDates = [from.sourceDate, to.goalDate]
        })

        // ===== 處理 SUSPEND 類型 =====
      } else if (exceptionData.type === 'SUSPEND') {
        const { patientId, patientName, startDate, endDate } = exceptionData

        // 驗證 SUSPEND 必要欄位
        if (!startDate || !endDate) {
          throw new Error('SUSPEND 例外資料不完整：缺少開始或結束日期')
        }

        const start = new Date(startDate + 'T00:00:00Z')
        const end = new Date(endDate + 'T00:00:00Z')

        // 計算影響天數
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        logger.info(`  └─ 暫停 ${patientName} 從 ${startDate} 到 ${endDate} (${days} 天)`)

        // 批次處理每一天
        const BATCH_SIZE = 450 // 保守的批次大小
        let batch = db.batch()
        let operationCount = 0
        let removedCount = 0

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateForQuery(new Date(d))
          processedDates.push(dateStr)

          const scheduleRef = db.collection('schedules').doc(dateStr)
          const scheduleDoc = await scheduleRef.get()

          if (scheduleDoc.exists) {
            const scheduleData = scheduleDoc.data().schedule || {}
            let updateNeeded = false
            const updates = {
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            }

            // 找到並標記刪除該病人的排班
            for (const key in scheduleData) {
              if (scheduleData[key].patientId === patientId) {
                updates[`schedule.${key}`] = FieldValue.delete()
                updateNeeded = true
                removedCount++
                logger.info(`    └─ 移除 ${dateStr} 的 ${key}`)
                break // 每天只有一個班次
              }
            }

            if (updateNeeded) {
              batch.update(scheduleRef, updates)
              operationCount++

              // 如果接近批次限制，提交並創建新批次
              if (operationCount >= BATCH_SIZE) {
                await batch.commit()
                logger.info(`  └─ 批次提交：已處理 ${operationCount} 個操作`)
                batch = db.batch()
                operationCount = 0
              }
            }
          }
        }

        // 提交最後的批次
        if (operationCount > 0) {
          await batch.commit()
          logger.info(`  └─ 最終批次提交：處理了 ${operationCount} 個操作`)
        }

        logger.info(`  └─ 完成暫停：共移除 ${removedCount} 個排班`)
      }

      // ===== 更新例外狀態為已套用 =====
      const updateData = {
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
        processedDates: processedDates,
        conflicts: conflicts.length > 0 ? conflicts : null,
        conflictCount: conflicts.length,
        applyMethod: 'realtime',
      }

      await exceptionDoc.ref.update(updateData)

      // ===== 記錄操作日誌 =====
      await db.collection('exception_logs').add({
        exceptionId: exceptionId,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        action: 'applied',
        timestamp: FieldValue.serverTimestamp(),
        processedDates: processedDates,
        conflicts: conflicts,
        success: true,
      })

      if (conflicts.length > 0) {
        logger.warn(
          `✅ [NewException] 例外 ${exceptionId} 已套用（有 ${conflicts.length} 個衝突被覆蓋）`,
        )
      } else {
        logger.info(`✅ [NewException] 例外 ${exceptionId} 已成功套用`)
      }
    } catch (error) {
      logger.error(`❌ [NewException] 處理例外 ${exceptionId} 失敗:`, error)

      // 更新例外狀態為錯誤
      await exceptionDoc.ref.update({
        status: 'error',
        errorMessage: error.message,
        errorAt: FieldValue.serverTimestamp(),
      })

      // 記錄錯誤日誌
      await db.collection('exception_logs').add({
        exceptionId: exceptionId,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        action: 'error',
        timestamp: FieldValue.serverTimestamp(),
        error: {
          message: error.message,
          stack: error.stack,
        },
        success: false,
      })

      throw error
    }

    return null
  },
)

// ===================================================================
// 處理例外刪除（恢復原始排程）
// ===================================================================
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

    const { patientId } = deletedException

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.error('❌ [Reverter] 嚴重錯誤：找不到總表規則，無法恢復排班。')
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
          const updates = {
            lastModified: FieldValue.serverTimestamp(),
            modifiedBy: 'exception_reverter',
          }

          // 移除該病人的現有排班
          for (const key in currentSchedule) {
            if (currentSchedule[key].patientId === patientId) {
              updates[`schedule.${key}`] = FieldValue.delete()
            }
          }

          // 如果有原始規則，恢復原始排班
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
                patientName: patientRule.patientName || '',
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
      logger.info(`✅ [Reverter] 成功恢復 ${affectedDates.length} 天的排程`)
    } catch (error) {
      logger.error(`❌ [Reverter] 恢復例外 ${exceptionId} 時發生錯誤:`, error)
    }
  },
)

// ===================================================================
// 處理例外任務（舊系統備用 - 保留以防需要）
// ===================================================================
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
    `👷 [ExceptionWorker-Legacy] 開始處理任務: ${taskId} (來自申請 ${taskData.parentExceptionId})`,
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

    logger.info(`✅ [ExceptionWorker-Legacy] 任務 ${taskId} 處理完成`)
  } catch (error) {
    logger.error(`❌ [ExceptionWorker-Legacy] 處理任務 ${taskId} 失敗:`, error)
    await taskDoc.ref.update({ status: 'error', errorMessage: error.message })
    await parentExceptionRef.update({
      status: 'error',
      errorMessage: `任務 ${taskId} 執行失敗: ${error.message}`,
    })
  }
})

// ===================================================================
// Lab Report Functions (檢驗報告相關函式)
// ===================================================================

// 處理檢驗報告
exports.processLabReport = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
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
  },
)
