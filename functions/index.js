// functions/index.js (✨ ADD_SESSION 修正版 ✨)
const { setGlobalOptions } = require('firebase-functions/v2')
setGlobalOptions({ region: 'asia-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 100 })
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  onDocumentWritten,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const functions = require('firebase-functions')
const functionsConfig = JSON.parse(process.env.FIREBASE_CONFIG)
admin.initializeApp({ projectId: functionsConfig.projectId })
const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

// ... (所有輔助函式，如 formatDateForQuery 等，保持不變) ...
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
  每日: [0, 1, 2, 3, 4, 5],
  每周一: [0],
  每周二: [1],
  每周三: [2],
  每周四: [3],
  每周五: [4],
  每周六: [5],
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

// ✨ [第 1 步] 請將這個新的輔助函式完整地複製到您的檔案頂部
/**
 * 清理指定病人在未來排程中的附加資料 (護理師分組、手動備註)。
 * @param {string} patientId 病人 ID。
 * @param {object} options 清理選項。
 * @param {boolean} options.clearTeams 是否清理護理師分組。
 * @param {boolean} options.clearManualNote 是否清空手動備註。
 */
async function cleanupFuturePatientMetadata(patientId, options = {}) {
  const { clearTeams = false, clearManualNote = false } = options

  if (!clearTeams && !clearManualNote) {
    logger.info(
      `[Metadata Cleanup] No cleanup options provided for patient ${patientId}. Skipping.`,
    )
    return
  }

  logger.info(`[Metadata Cleanup] Starting for patient ${patientId}...`, options)
  const todayStr = formatDateForQuery(new Date())

  const batch = db.batch()
  let updatesCount = 0

  try {
    // 1. 清理 nurse_assignments
    if (clearTeams) {
      const assignmentsSnapshot = await db
        .collection('nurse_assignments')
        .where('date', '>=', todayStr)
        .get()

      assignmentsSnapshot.forEach((doc) => {
        const teamsData = doc.data().teams || {}
        const updates = {}
        let needsUpdate = false
        for (const teamKey in teamsData) {
          if (teamKey.startsWith(patientId + '-')) {
            updates[`teams.${teamKey}`] = FieldValue.delete()
            needsUpdate = true
          }
        }
        if (needsUpdate) {
          batch.update(doc.ref, updates)
          updatesCount++
        }
      })
    }

    // 2. 清理 schedules 中的 manualNote
    if (clearManualNote) {
      const schedulesSnapshot = await db.collection('schedules').where('date', '>=', todayStr).get()

      schedulesSnapshot.forEach((doc) => {
        const scheduleData = doc.data().schedule || {}
        const updates = {}
        let needsUpdate = false
        for (const shiftId in scheduleData) {
          if (scheduleData[shiftId]?.patientId === patientId) {
            updates[`schedule.${shiftId}.manualNote`] = ''
            needsUpdate = true
          }
        }
        if (needsUpdate) {
          batch.update(doc.ref, updates)
          updatesCount++
        }
      })
    }

    if (updatesCount > 0) {
      await batch.commit()
      logger.info(`[Metadata Cleanup] Successfully committed cleanup for patient ${patientId}.`)
    } else {
      logger.info(`[Metadata Cleanup] No future metadata found to clean for patient ${patientId}.`)
    }
  } catch (error) {
    logger.error(`[Metadata Cleanup] Error cleaning metadata for patient ${patientId}:`, error)
  }
}

async function reapplyAllExceptionsInternal(baseSchedules) {
  logger.info('🔄 [ReapplyExceptions] 開始兩階段調班處理')
  try {
    const exceptionsSnapshot = await db
      .collection('schedule_exceptions')
      .where('status', 'in', ['applied', 'pending', 'processing', 'conflict_requires_resolution'])
      .get()
    if (exceptionsSnapshot.empty) {
      logger.info('✅ 沒有需要套用的調班')
      return { success: true, processed: 0, schedulesToWrite: baseSchedules }
    }
    const exceptions = exceptionsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis() || 0,
    }))
    logger.info(`找到 ${exceptions.length} 個調班需要處理`)
    const modifiedSchedules = new Map(JSON.parse(JSON.stringify(Array.from(baseSchedules))))
    logger.info('📝 第一階段：處理所有刪除')
    let deletionsCount = 0
    for (const exception of exceptions) {
      if (exception.type === 'SUSPEND') {
        const start = new Date(exception.startDate + 'T00:00:00Z')
        const end = new Date(exception.endDate + 'T00:00:00Z')
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = formatDateForQuery(new Date(d))
          if (modifiedSchedules.has(dateStr)) {
            const schedule = modifiedSchedules.get(dateStr)
            for (const [position, slot] of Object.entries(schedule)) {
              if (slot.patientId === exception.patientId) {
                delete schedule[position]
                deletionsCount++
                logger.info(`  └─ 標記刪除: ${dateStr} ${position} (${exception.patientName})`)
                break
              }
            }
          }
        }
      } else if (exception.type === 'MOVE' && exception.from) {
        const { sourceDate, bedNum, shiftCode } = exception.from
        if (modifiedSchedules.has(sourceDate)) {
          const position = getScheduleKey(bedNum, shiftCode)
          const schedule = modifiedSchedules.get(sourceDate)
          if (schedule[position]?.patientId === exception.patientId) {
            delete schedule[position]
            deletionsCount++
            logger.info(`  └─ 標記移除: ${sourceDate} ${position} (${exception.patientName})`)
          }
        }
      }
    }
    logger.info(`第一階段完成：標記了 ${deletionsCount} 個位置要刪除`)
    logger.info('📝 第二階段：處理所有新增')
    const conflicts = []
    let additionsCount = 0
    exceptions.sort((a, b) => a.createdAt - b.createdAt)
    for (const exception of exceptions) {
      if (exception.type === 'MOVE' && exception.to) {
        const { goalDate, bedNum, shiftCode } = exception.to
        if (modifiedSchedules.has(goalDate)) {
          const position = getScheduleKey(bedNum, shiftCode)
          const schedule = modifiedSchedules.get(goalDate)
          if (schedule[position]) {
            const occupant = schedule[position]
            conflicts.push({
              exceptionId: exception.id,
              date: goalDate,
              position,
              wantedBy: exception.patientName,
              occupiedBy: occupant.patientName || occupant.patientId,
            })
            logger.warn(`  └─ 衝突: ${goalDate} ${position} 已被 ${occupant.patientName} 佔用`)
            await db
              .collection('schedule_exceptions')
              .doc(exception.id)
              .update({
                status: 'conflict_requires_resolution',
                errorMessage: `目標床位已被 ${occupant.patientName} 佔用`,
              })
            continue
          }
          schedule[position] = {
            patientId: exception.patientId,
            patientName: exception.patientName,
            shiftId: shiftCode,
            manualNote: '(換班)',
            exceptionId: exception.id,
          }
          additionsCount++
          logger.info(`  └─ 標記新增: ${goalDate} ${position} (${exception.patientName})`)
          if (exception.status !== 'applied') {
            await db
              .collection('schedule_exceptions')
              .doc(exception.id)
              .update({ status: 'applied', errorMessage: '' })
          }
        }
      }
    }
    logger.info(
      `第二階段完成：標記了 ${additionsCount} 個位置要新增，發現 ${conflicts.length} 個衝突。`,
    )
    return {
      success: true,
      processed: exceptions.length,
      schedulesToWrite: modifiedSchedules,
      stats: { deletions: deletionsCount, additions: additionsCount, conflicts: conflicts.length },
    }
  } catch (error) {
    logger.error('❌ [ReapplyExceptions] 兩階段處理失敗:', error)
    throw error
  }
}

// ✨ [第 2 步] 請用以下完整函式替換您現有的 onPatientDataChange
exports.onPatientDataChange = onDocumentWritten('patients/{patientId}', async (event) => {
  const patientId = event.params.patientId
  const beforeData = event.data?.before.data()
  const afterData = event.data?.after.data()

  // 建立一個任務陣列，用來收集所有需要執行的非同步操作
  const tasks = []

  // 輔助函式，建立一個包含所有必要欄位的快照
  const createSnapshot = (data) => ({
    medicalRecordNumber: data.medicalRecordNumber || null,
    firstDialysisDate: data.firstDialysisDate || null,
    vascAccess: data.vascAccess || null,
    accessCreationDate: data.accessCreationDate || null,
    hospitalInfo: data.hospitalInfo || { source: '', transferOut: '' },
    inpatientReason: data.inpatientReason || null,
    dialysisReason: data.dialysisReason || null,
  })

  // --- 任務 1: 寫入病人歷史記錄 ---
  let historyWritten = false

  // 情況 1: 新增病人
  if (!beforeData && afterData) {
    logger.info(`[History] 新增病人 ${afterData.name} (ID: ${patientId})`)
    tasks.push(
      db.collection('patient_history').add({
        patientId,
        patientName: afterData.name,
        timestamp: FieldValue.serverTimestamp(),
        eventType: 'CREATE',
        eventDetails: { status: afterData.status },
        snapshot: createSnapshot(afterData),
      }),
    )
    historyWritten = true
  }
  // 情況 2: 刪除病人
  else if (
    beforeData &&
    afterData &&
    beforeData.isDeleted === false &&
    afterData.isDeleted === true
  ) {
    logger.info(`[History] 刪除病人 ${afterData.name} (ID: ${patientId})`)
    tasks.push(
      db.collection('patient_history').add({
        patientId,
        patientName: afterData.name,
        timestamp: FieldValue.serverTimestamp(),
        eventType: 'DELETE',
        eventDetails: {
          reason: afterData.deleteReason || '未知',
          fromStatus: beforeData.status,
        },
        snapshot: createSnapshot(afterData),
      }),
    )
    historyWritten = true
  }
  // 情況 3: 復原病人
  else if (
    beforeData &&
    afterData &&
    beforeData.isDeleted === true &&
    afterData.isDeleted === false
  ) {
    logger.info(`[History] 復原病人 ${afterData.name} (ID: ${patientId}) 至 ${afterData.status}`)
    tasks.push(
      db.collection('patient_history').add({
        patientId,
        patientName: afterData.name,
        timestamp: FieldValue.serverTimestamp(),
        eventType: 'RESTORE_AND_TRANSFER',
        eventDetails: {
          restoredTo: afterData.status,
          fromReason: beforeData.deleteReason || '未知',
        },
        snapshot: createSnapshot(afterData),
      }),
    )
    historyWritten = true
  }
  // 情況 4: 狀態轉移
  else if (
    beforeData &&
    afterData &&
    beforeData.isDeleted === false &&
    afterData.isDeleted === false &&
    beforeData.status !== afterData.status
  ) {
    logger.info(
      `[History] 轉移病人 ${afterData.name} 從 ${beforeData.status} 到 ${afterData.status}`,
    )
    tasks.push(
      db.collection('patient_history').add({
        patientId,
        patientName: afterData.name,
        timestamp: FieldValue.serverTimestamp(),
        eventType: 'TRANSFER',
        eventDetails: {
          from: beforeData.status,
          to: afterData.status,
        },
        snapshot: createSnapshot(afterData),
      }),
    )
    historyWritten = true
  }

  if (!historyWritten) {
    logger.info(`[History] 病人 ${patientId} 的一般資料更新，無需記錄動向歷史。`)
  }

  // --- 任務 2: 根據狀態變更，執行資料清理 ---

  // 情況 A: 病人被標記為刪除。
  if (beforeData && afterData && beforeData.isDeleted === false && afterData.isDeleted === true) {
    logger.info(`[Cleanup Trigger] Patient ${patientId} was deleted. Cleaning up...`)
    // 清理護理師分組 (排程本身會由 syncMasterScheduleToFuture 處理)
    tasks.push(cleanupFuturePatientMetadata(patientId, { clearTeams: true }))
    // 如果病人身上還有 wardNumber，則清空它
    if (afterData.wardNumber) {
      tasks.push(event.data.after.ref.update({ wardNumber: null }))
    }
  }

  // 情況 B: 病人從住院/急診轉為門診。
  if (
    beforeData &&
    afterData &&
    !afterData.isDeleted &&
    (beforeData.status === 'ipd' || beforeData.status === 'er') &&
    afterData.status === 'opd'
  ) {
    logger.info(`[Cleanup Trigger] Patient ${patientId} transferred to OPD. Cleaning up...`)
    // 清理未來的 manualNote 和護理師分組
    tasks.push(cleanupFuturePatientMetadata(patientId, { clearManualNote: true, clearTeams: true }))
    // 如果病人身上還有 wardNumber，則清空它
    if (afterData.wardNumber) {
      tasks.push(event.data.after.ref.update({ wardNumber: null }))
    }
  }

  // --- 統一執行所有收集到的任務 ---
  try {
    if (tasks.length > 0) {
      await Promise.all(tasks)
      logger.info(`Successfully executed ${tasks.length} tasks for patient ${patientId}.`)
    }
  } catch (error) {
    logger.error(`Error executing tasks for patient ${patientId}:`, error)
  }

  return null
})

// ... (所有其他函式，如 checkExpiredMemos, customLogin, syncMasterScheduleToFuture 等，保持不變) ...
exports.checkExpiredMemos = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'Asia/Taipei', timeoutSeconds: 540 },
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
  { schedule: 'every day 02:05', timeZone: 'Asia/Taipei', timeoutSeconds: 300 },
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
  { schedule: 'every day 03:00', timeZone: 'Asia/Taipei', timeoutSeconds: 540, memory: '1GiB' },
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

    // ==========================================================
    // ✨✨✨ 核心修改點在這裡 ✨✨✨
    // ==========================================================
    const customToken = await admin.auth().createCustomToken(uid, {
      role: userData.role,
      name: userData.name,
      title: userData.title, // 從 Firestore user document 讀取 title 並加入 token
    })
    // ==========================================================

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
// 🔥 基礎同步 + 兩階調班處理（統一流程）
// ===================================================================
exports.syncMasterScheduleToFuture = onDocumentWritten(
  {
    document: 'base_schedules/MASTER_SCHEDULE',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('🚀 [UnifiedSync] 統一同步流程啟動')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }
    try {
      // ===== 步驟 1：根據總表生成60天基礎排程 (在記憶體中) =====
      const masterRules = event.data.after.data().schedule || {}
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const baseSchedules = new Map()
      for (let i = 1; i <= 60; i++) {
        const targetDate = new Date()
        targetDate.setDate(today.getDate() + i)
        const dateStr = formatDateForQuery(targetDate)
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)
        baseSchedules.set(dateStr, dailySchedule)
      }
      logger.info(
        `[UnifiedSync] 步驟 1/3 完成：已在記憶體中生成 ${baseSchedules.size} 天的基礎排程`,
      )

      // ===== 步驟 2：呼叫兩階段調班處理，直接在基礎排程上修改 =====
      const result = await reapplyAllExceptionsInternal(baseSchedules)
      logger.info(`[UnifiedSync] 步驟 2/3 完成：已套用 ${result.processed} 個調班`)

      const finalSchedules = result.schedulesToWrite

      // ===== 步驟 3：將最終結果批次寫入資料庫 (完全覆蓋) =====
      logger.info('[UnifiedSync] 步驟 3/3：開始批次寫入最終排程...')
      const BATCH_SIZE = 400
      let batch = db.batch()
      let count = 0
      for (const [dateStr, schedule] of finalSchedules) {
        batch.set(
          db.collection('schedules').doc(dateStr),
          {
            date: dateStr,
            schedule: schedule,
            syncedAt: FieldValue.serverTimestamp(),
            syncMethod: 'unified_overwrite',
          },
          { merge: false },
        )
        count++
        if (count >= BATCH_SIZE) {
          await batch.commit()
          logger.info(`[UnifiedSync] 批次提交：${count} 個文件`)
          batch = db.batch()
          count = 0
        }
      }
      if (count > 0) {
        await batch.commit()
        logger.info(`[UnifiedSync] 最終批次：${count} 個文件`)
      }

      logger.info('✅ [UnifiedSync] 全部流程成功完成！')
    } catch (error) {
      logger.error('❌ [UnifiedSync] 統一同步流程失敗:', error)
      // 可以在此處加入錯誤日誌記錄
      throw error
    }
    return null
  },
)

// ===================================================================
// 🔥 即時調班處理 - 立即修改排程
// ===================================================================
exports.handleNewExceptionRequest = onDocumentCreated(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const exceptionDoc = event.data
    const exceptionData = exceptionDoc.data()
    const exceptionId = exceptionDoc.id

    logger.info(
      `🚀 [NewException] 新調班申請: ${exceptionId} (${exceptionData.type} - ${exceptionData.patientName})`,
    )

    if (exceptionData.status !== 'pending') {
      logger.info(`[NewException] 調班 ${exceptionId} 狀態為 ${exceptionData.status}，跳過處理`)
      return null
    }

    try {
      await exceptionDoc.ref.update({
        status: 'processing',
        processingStarted: FieldValue.serverTimestamp(),
      })

      if (!exceptionData.patientId || !exceptionData.type) {
        throw new Error('調班資料不完整：缺少 patientId 或 type')
      }

      let processedDates = []
      let conflicts = []

      // ===== 處理 MOVE 類型 =====
      if (exceptionData.type === 'MOVE') {
        const { from, to, patientId, patientName } = exceptionData
        if (
          !from?.sourceDate ||
          !from?.bedNum ||
          !from?.shiftCode ||
          !to?.goalDate ||
          !to?.bedNum ||
          !to?.shiftCode
        ) {
          throw new Error('MOVE 調班資料不完整：缺少來源或目標資訊')
        }

        await db.runTransaction(async (transaction) => {
          const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
          const targetScheduleRef = db.collection('schedules').doc(to.goalDate)
          const [sourceDoc, targetDoc] = await Promise.all([
            transaction.get(sourceScheduleRef),
            transaction.get(targetScheduleRef),
          ])

          const updates = []

          // 1. 處理來源位置
          if (sourceDoc.exists) {
            const sourceSchedule = sourceDoc.data().schedule || {}
            const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)
            if (sourceSchedule[sourceKey] && sourceSchedule[sourceKey].patientId === patientId) {
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

          // 2. 處理目標位置
          const targetKey = getScheduleKey(to.bedNum, to.shiftCode)
          let hasConflict = false
          if (targetDoc.exists) {
            const targetSchedule = targetDoc.data().schedule || {}
            if (targetSchedule[targetKey]) {
              const occupant = targetSchedule[targetKey]
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
            updates.push({
              ref: targetScheduleRef,
              data: {
                [`schedule.${targetKey}`]: {
                  patientId: patientId,
                  patientName: patientName,
                  shiftId: to.shiftCode,
                  manualNote: `(換班${hasConflict ? '-覆蓋' : ''})`,
                  exceptionId: exceptionId,
                  appliedAt: FieldValue.serverTimestamp(),
                },
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              },
            })
          } else {
            updates.push({
              ref: targetScheduleRef,
              data: {
                date: to.goalDate,
                schedule: {
                  [targetKey]: {
                    patientId: patientId,
                    patientName: patientName,
                    shiftId: to.shiftCode,
                    manualNote: '(換班)',
                    exceptionId: exceptionId,
                    appliedAt: FieldValue.serverTimestamp(),
                  },
                },
                createdAt: FieldValue.serverTimestamp(),
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              },
              isCreate: true,
            })
          }

          for (const update of updates) {
            if (update.isCreate) transaction.set(update.ref, update.data)
            else transaction.update(update.ref, update.data)
          }

          logger.info(`  └─ 新增 ${patientName} 到 ${to.goalDate} ${targetKey}`)
          processedDates = [from.sourceDate, to.goalDate]
        })
      }

      // ===== 處理 SUSPEND 類型 =====
      else if (exceptionData.type === 'SUSPEND') {
        const { patientId, patientName, startDate, endDate } = exceptionData
        if (!startDate || !endDate) {
          throw new Error('SUSPEND 調班資料不完整：缺少開始或結束日期')
        }
        const start = new Date(startDate + 'T00:00:00Z')
        const end = new Date(endDate + 'T00:00:00Z')
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
        logger.info(`  └─ 暫停 ${patientName} 從 ${startDate} 到 ${endDate} (${days} 天)`)

        const BATCH_SIZE = 450
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
            for (const key in scheduleData) {
              if (scheduleData[key].patientId === patientId) {
                updates[`schedule.${key}`] = FieldValue.delete()
                updateNeeded = true
                removedCount++
                logger.info(`    └─ 移除 ${dateStr} 的 ${key}`)
                break
              }
            }
            if (updateNeeded) {
              batch.update(scheduleRef, updates)
              operationCount++
              if (operationCount >= BATCH_SIZE) {
                await batch.commit()
                logger.info(`  └─ 批次提交：已處理 ${operationCount} 個操作`)
                batch = db.batch()
                operationCount = 0
              }
            }
          }
        }
        if (operationCount > 0) {
          await batch.commit()
          logger.info(`  └─ 最終批次提交：處理了 ${operationCount} 個操作`)
        }
        logger.info(`  └─ 完成暫停：共移除 ${removedCount} 個排班`)
      }

      // ✨✨✨ 核心修正：新增 ADD_SESSION 的處理區塊 ✨✨✨
      else if (exceptionData.type === 'ADD_SESSION') {
        const { to, patientId, patientName } = exceptionData

        // 1. 驗證必要欄位
        if (!to?.goalDate || !to?.bedNum || !to?.shiftCode) {
          throw new Error('ADD_SESSION 調班資料不完整：缺少目標資訊')
        }

        const targetDate = to.goalDate
        const scheduleRef = db.collection('schedules').doc(targetDate)
        const targetKey = getScheduleKey(to.bedNum, to.shiftCode)

        // 2. 使用 transaction 來確保操作的原子性
        await db.runTransaction(async (transaction) => {
          const scheduleDoc = await transaction.get(scheduleRef)
          let hasConflict = false

          // 準備要寫入的新排班資料
          const newSlotData = {
            patientId: patientId,
            patientName: patientName,
            shiftId: to.shiftCode,
            manualNote: `(臨時加洗)`, // 加上註記
            exceptionId: exceptionId,
            appliedAt: FieldValue.serverTimestamp(),
          }

          if (scheduleDoc.exists) {
            // 文件已存在，使用 update
            const scheduleData = scheduleDoc.data().schedule || {}
            if (scheduleData[targetKey]) {
              const occupant = scheduleData[targetKey]
              conflicts.push({
                date: targetDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
                action: 'override',
              })
              logger.warn(`  └─ 衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
              hasConflict = true
              newSlotData.manualNote = `(臨時加洗-覆蓋)`
            }

            transaction.update(scheduleRef, {
              [`schedule.${targetKey}`]: newSlotData,
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            })
          } else {
            // 文件不存在，使用 set 來創建
            transaction.set(scheduleRef, {
              date: targetDate,
              schedule: { [targetKey]: newSlotData },
              createdAt: FieldValue.serverTimestamp(),
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            })
          }
        })

        logger.info(`  └─ 新增 ${patientName} 到 ${targetDate} ${targetKey}`)
        processedDates = [targetDate]
      }

      // ===== 更新調班狀態為已套用 =====
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
          `✅ [NewException] 調班 ${exceptionId} 已套用（有 ${conflicts.length} 個衝突被覆蓋）`,
        )
      } else {
        logger.info(`✅ [NewException] 調班 ${exceptionId} 已成功套用`)
      }
    } catch (error) {
      logger.error(`❌ [NewException] 處理調班 ${exceptionId} 失敗:`, error)
      await exceptionDoc.ref.update({
        status: 'error',
        errorMessage: error.message,
        errorAt: FieldValue.serverTimestamp(),
      })
      await db.collection('exception_logs').add({
        exceptionId: exceptionId,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        action: 'error',
        timestamp: FieldValue.serverTimestamp(),
        error: { message: error.message, stack: error.stack },
        success: false,
      })
      throw error
    }
    return null
  },
)

// ===================================================================
// 處理調班刪除（恢復原始排程）
// ===================================================================
exports.onExceptionDeleted = onDocumentDeleted(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const deletedException = event.data.data()
    const exceptionId = event.params.exceptionId
    logger.info(`🚀 [Reverter] 調班恢復處理器啟動: ${exceptionId}`)

    if (!deletedException || !deletedException.patientId || !deletedException.type) {
      logger.error(`❌ [Reverter] 失敗：被刪除的調班資料不完整。`, deletedException)
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
      logger.error(`❌ [Reverter] 恢復調班 ${exceptionId} 時發生錯誤:`, error)
    }
  },
)

// ===================================================================
// 處理調班任務（舊系統備用 - 保留以防需要）
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
          manualNote: `(換班)`,
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
        // ✨ 您可以根據新的 Excel 內容，在這裡增加更多對應項目
      }
      const reports = new Map()
      let errors = []
      const patientCache = new Map()
      for (const rowArray of dataRows) {
        let medicalRecordNumber = String(rowArray[headerToIndex['病歷號']] || '').trim()
        if (medicalRecordNumber) {
          medicalRecordNumber = medicalRecordNumber.replace(/^0+/, '')
        }

        // ✨ ===================== 核心修正點在這裡 ===================== ✨
        // 1. 讀取原始的、可能包含時分秒的日期字串
        let originalReportDateStr = String(rowArray[headerToIndex['報告日']] || '').trim()

        // 2. 標準化日期：只取前 8 位 (YYYYMMDD)，忽略後面的時分秒
        const reportDateStr = originalReportDateStr.substring(0, 8)
        // ✨ ========================================================== ✨

        const labItemName = String(rowArray[headerToIndex['細項名稱']] || '').trim()
        const labResult = rowArray[headerToIndex['結果']]
        if (
          !medicalRecordNumber ||
          !reportDateStr || // 使用標準化後的日期字串做判斷
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

        // 使用標準化後的 reportDateStr 來建立 key，確保同一天的資料能聚合
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

          // 解析日期時，同樣使用標準化後的 reportDateStr
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

// ===================================================================
// Consumables Report Functions (耗材報告相關函式) - v3.1 (支援同類型多項目)
// ===================================================================

exports.processConsumables = onCall(
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

    logger.info(`[Consumables V3.1] 接收到檔案 ${fileName}，開始解析...`)

    try {
      // (步驟 1-5 的邏輯與之前相同，保持不變)
      const buffer = Buffer.from(fileContent, 'base64')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const sheetAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (sheetAsArray.length < 3) {
        throw new HttpsError('invalid-argument', 'Excel 檔案內容行數不足。')
      }

      const dateString = sheetAsArray[1][0] || ''
      const monthMatch = dateString.match(/&起日(\d{4})(\d{2})/)
      if (!monthMatch) {
        throw new HttpsError('invalid-argument', 'Excel 格式錯誤，在第二列找不到有效的起日。')
      }
      const reportMonth = `${monthMatch[1]}-${monthMatch[2]}`

      let headerRowIndex = -1
      for (let i = 0; i < sheetAsArray.length; i++) {
        if (sheetAsArray[i].includes('病歷號')) {
          headerRowIndex = i
          break
        }
      }
      if (headerRowIndex === -1) {
        throw new HttpsError('invalid-argument', "找不到有效的標題行 (需包含 '病歷號')。")
      }

      const headers = sheetAsArray[headerRowIndex]
      const dataRows = sheetAsArray.slice(headerRowIndex + 1)

      let consumableHeader = ''
      let firestoreField = ''
      if (headers.includes('人工腎臟')) {
        consumableHeader = '人工腎臟'
        firestoreField = 'artificialKidney'
      } else if (headers.includes('透析藥水CA')) {
        consumableHeader = '透析藥水CA'
        firestoreField = 'dialysateCa'
      } else if (headers.includes('B液種類')) {
        consumableHeader = 'B液種類'
        firestoreField = 'bicarbonateType'
      } else {
        throw new HttpsError('invalid-argument', '在標題行中找不到關鍵的耗材欄位。')
      }

      const headerToIndex = {}
      headers.forEach((header, index) => {
        if (header) headerToIndex[String(header).trim()] = index
      })

      // (步驟 6 的邏輯進行核心修改)
      const patientCache = new Map()
      const updatesMap = new Map()
      let errors = []
      let processedRowCount = 0

      for (const rowArray of dataRows) {
        let medicalRecordNumber = String(rowArray[headerToIndex['病歷號']] || '').trim()
        const consumableValue = rowArray[headerToIndex[consumableHeader]]
        const count = rowArray[headerToIndex['COUNT(*)']]

        if (!medicalRecordNumber || consumableValue === undefined || consumableValue === null) {
          if (
            rowArray.every(
              (cell) => cell === null || cell === undefined || String(cell).trim() === '',
            )
          )
            continue
          errors.push({ rowData: JSON.stringify(rowArray), reason: '該行缺少病歷號或耗材數值' })
          continue
        }

        medicalRecordNumber = medicalRecordNumber.replace(/^0+/, '')

        let patientData
        if (patientCache.has(medicalRecordNumber)) {
          patientData = patientCache.get(medicalRecordNumber)
        } else {
          const patientQuery = await db
            .collection('patients')
            .where('medicalRecordNumber', '==', medicalRecordNumber)
            .limit(1)
            .get()
          patientData = patientQuery.empty
            ? null
            : { id: patientQuery.docs[0].id, ...patientQuery.docs[0].data() }
          patientCache.set(medicalRecordNumber, patientData)
        }

        if (!patientData) {
          errors.push({ rowData: `病歷號: ${medicalRecordNumber}`, reason: `找不到對應的病人` })
          continue
        }

        const reportId = `${reportMonth}_${patientData.id}`
        if (!updatesMap.has(reportId)) {
          updatesMap.set(reportId, {
            patientId: patientData.id,
            patientName: patientData.name,
            medicalRecordNumber: patientData.medicalRecordNumber,
            data: {},
          })
        }

        const patientUpdate = updatesMap.get(reportId)

        // ✨ --- 核心修正：將資料存為陣列 --- ✨
        // 1. 如果這個耗材類別的陣列還不存在，就先建立一個空陣列
        if (!patientUpdate.data[firestoreField]) {
          patientUpdate.data[firestoreField] = []
        }
        // 2. 將新的耗材物件 push 進這個陣列
        patientUpdate.data[firestoreField].push({
          item: consumableValue,
          count: count || 0,
        })
        // ✨ --- (修正結束) --- ✨

        processedRowCount++
      }

      // (步驟 7 的邏輯不變)
      if (updatesMap.size > 0) {
        const batch = db.batch()
        for (const [reportId, updateData] of updatesMap.entries()) {
          const docRef = db.collection('consumables_reports').doc(reportId)
          batch.set(
            docRef,
            {
              patientId: updateData.patientId,
              patientName: updateData.patientName,
              medicalRecordNumber: updateData.medicalRecordNumber,
              reportDate: new Date(`${reportMonth}-01`),
              sourceFile: fileName,
              updatedAt: FieldValue.serverTimestamp(),
              data: updateData.data,
            },
            { merge: true },
          )
        }
        await batch.commit()
      }

      return {
        success: true,
        message: `處理完成！成功處理 ${processedRowCount} 筆耗材資料，聚合為 ${updatesMap.size} 份月報表，發現 ${errors.length} 個問題行。`,
        processedCount: updatesMap.size,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      }
    } catch (error) {
      logger.error(`[Consumables V3.1] 處理檔案 ${fileName} 時發生嚴重錯誤:`, error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', `處理 Excel 檔案時發生錯誤: ${error.message}`)
    }
  },
)
