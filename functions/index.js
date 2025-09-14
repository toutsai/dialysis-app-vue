// functions/index.js (✨ 訊息中心整合 + TTL 優化最終版 ✨)
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
const { FieldValue, FieldPath } = require('firebase-admin/firestore')

//============ 輔助函式 =====================
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
  logger.info('🔄 [ReapplyExceptions] 開始執行升級版兩階段調班處理')
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
      createdAt: doc.data().createdAt?.toMillis() || Date.parse(doc.createTime) || 0,
    }))
    logger.info(`找到 ${exceptions.length} 個調班需要處理`)
    const moveChains = new Map()
    const otherExceptions = []
    exceptions.sort((a, b) => a.createdAt - b.createdAt)
    for (const ex of exceptions) {
      if (ex.type === 'MOVE' && ex.from && ex.to) {
        const date = ex.from.sourceDate
        const key = `${ex.patientId}-${date}`
        if (!moveChains.has(key)) {
          moveChains.set(key, {
            initialFrom: { ...ex.from },
            finalTo: { ...ex.to },
            patientId: ex.patientId,
            patientName: ex.patientName,
            exceptionIds: [ex.id],
            finalException: ex,
          })
        } else {
          const chain = moveChains.get(key)
          chain.finalTo = { ...ex.to }
          chain.exceptionIds.push(ex.id)
          chain.finalException = ex
        }
      } else {
        otherExceptions.push(ex)
      }
    }
    logger.info(
      `預處理完成：發現 ${moveChains.size} 個 MOVE 調班鏈，以及 ${otherExceptions.length} 個其他調班。`,
    )
    const modifiedSchedules = new Map(JSON.parse(JSON.stringify(Array.from(baseSchedules))))
    logger.info('📝 第一階段：處理所有刪除')
    let deletionsCount = 0
    for (const chain of moveChains.values()) {
      const { sourceDate, bedNum, shiftCode } = chain.initialFrom
      if (modifiedSchedules.has(sourceDate)) {
        const position = getScheduleKey(bedNum, shiftCode)
        const schedule = modifiedSchedules.get(sourceDate)
        if (schedule[position]?.patientId === chain.patientId) {
          delete schedule[position]
          deletionsCount++
          logger.info(`  └─ (MOVE鏈) 標記移除: ${sourceDate} ${position} (${chain.patientName})`)
        }
      }
    }
    for (const exception of otherExceptions) {
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
                logger.info(
                  `  └─ (SUSPEND) 標記刪除: ${dateStr} ${position} (${exception.patientName})`,
                )
                break
              }
            }
          }
        }
      } else if (exception.type === 'SWAP') {
        const { date, patient1, patient2 } = exception
        if (modifiedSchedules.has(date)) {
          const schedule = modifiedSchedules.get(date)
          const key1 = getScheduleKey(patient1.fromBedNum, patient1.fromShiftCode)
          if (schedule[key1]?.patientId === patient1.patientId) {
            delete schedule[key1]
            deletionsCount++
            logger.info(`  └─ (SWAP) 標記移除: ${date} ${key1} (${patient1.patientName})`)
          }
          const key2 = getScheduleKey(patient2.fromBedNum, patient2.fromShiftCode)
          if (schedule[key2]?.patientId === patient2.patientId) {
            delete schedule[key2]
            deletionsCount++
            logger.info(`  └─ (SWAP) 標記移除: ${date} ${key2} (${patient2.patientName})`)
          }
        }
      }
    }
    logger.info(`第一階段完成：標記了 ${deletionsCount} 個位置要刪除`)
    logger.info('📝 第二階段：處理所有新增')
    const conflicts = []
    let additionsCount = 0
    for (const chain of moveChains.values()) {
      const { goalDate, bedNum, shiftCode } = chain.finalTo
      if (modifiedSchedules.has(goalDate)) {
        const position = getScheduleKey(bedNum, shiftCode)
        const schedule = modifiedSchedules.get(goalDate)
        if (schedule[position]) {
          const occupant = schedule[position]
          conflicts.push({
            exceptionId: chain.finalException.id,
            date: goalDate,
            position,
            wantedBy: chain.patientName,
            occupiedBy: occupant.patientName || occupant.patientId,
          })
          logger.warn(`  └─ 衝突: ${goalDate} ${position} 已被 ${occupant.patientName} 佔用`)
          for (const exId of chain.exceptionIds) {
            await db
              .collection('schedule_exceptions')
              .doc(exId)
              .update({
                status: 'conflict_requires_resolution',
                errorMessage: `目標床位已被 ${occupant.patientName} 佔用`,
              })
          }
          continue
        }
        schedule[position] = {
          patientId: chain.patientId,
          patientName: chain.patientName,
          shiftId: shiftCode,
          manualNote: '(換班)',
          exceptionId: chain.finalException.id,
        }
        additionsCount++
        logger.info(`  └─ (MOVE鏈) 標記新增: ${goalDate} ${position} (${chain.patientName})`)
        for (const exId of chain.exceptionIds) {
          const exDoc = await db.collection('schedule_exceptions').doc(exId).get()
          if (exDoc.exists && exDoc.data().status !== 'applied') {
            await exDoc.ref.update({ status: 'applied', errorMessage: '' })
          }
        }
      }
    }
    for (const exception of otherExceptions) {
      if (exception.type === 'ADD_SESSION' && exception.to) {
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
            logger.warn(
              `  └─ (加洗) 衝突: ${goalDate} ${position} 已被 ${occupant.patientName} 佔用`,
            )
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
            manualNote: '(臨時加洗)',
            exceptionId: exception.id,
          }
          additionsCount++
          logger.info(`  └─ (加洗) 標記新增: ${goalDate} ${position} (${exception.patientName})`)
          if (exception.status !== 'applied') {
            await db
              .collection('schedule_exceptions')
              .doc(exception.id)
              .update({ status: 'applied', errorMessage: '' })
          }
        }
      } else if (exception.type === 'SWAP') {
        const { date, patient1, patient2, id: exceptionId } = exception
        if (modifiedSchedules.has(date)) {
          const schedule = modifiedSchedules.get(date)
          const keyForPatient1 = getScheduleKey(patient2.fromBedNum, patient2.fromShiftCode)
          schedule[keyForPatient1] = {
            patientId: patient1.patientId,
            patientName: patient1.patientName,
            shiftId: patient2.fromShiftCode,
            manualNote: '(互調)',
            exceptionId: exceptionId,
          }
          additionsCount++
          logger.info(`  └─ (SWAP) 標記新增: ${date} ${keyForPatient1} (${patient1.patientName})`)
          const keyForPatient2 = getScheduleKey(patient1.fromBedNum, patient1.fromShiftCode)
          schedule[keyForPatient2] = {
            patientId: patient2.patientId,
            patientName: patient2.patientName,
            shiftId: patient1.fromShiftCode,
            manualNote: '(互調)',
            exceptionId: exceptionId,
          }
          additionsCount++
          logger.info(`  └─ (SWAP) 標記新增: ${date} ${keyForPatient2} (${patient2.patientName})`)
          if (exception.status !== 'applied') {
            await db
              .collection('schedule_exceptions')
              .doc(exceptionId)
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
    logger.error('❌ [ReapplyExceptions] 升級版兩階段處理失敗:', error)
    throw error
  }
}

//============ Firestore Triggers =====================
exports.onPatientDataChange = onDocumentWritten('patients/{patientId}', async (event) => {
  const patientId = event.params.patientId
  const beforeData = event.data?.before.data()
  const afterData = event.data?.after.data()
  const tasks = []
  const createSnapshot = (data) => ({
    medicalRecordNumber: data.medicalRecordNumber || null,
    firstDialysisDate: data.firstDialysisDate || null,
    vascAccess: data.vascAccess || null,
    accessCreationDate: data.accessCreationDate || null,
    hospitalInfo: data.hospitalInfo || { source: '', transferOut: '' },
    inpatientReason: data.inpatientReason || null,
    dialysisReason: data.dialysisReason || null,
  })
  let historyWritten = false
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
  } else if (
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
  } else if (
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
  } else if (
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
  if (beforeData && afterData && beforeData.isDeleted === false && afterData.isDeleted === true) {
    logger.info(`[Cleanup Trigger] Patient ${patientId} was deleted. Cleaning up...`)
    tasks.push(cleanupFuturePatientMetadata(patientId, { clearTeams: true }))
    if (afterData.wardNumber) {
      tasks.push(event.data.after.ref.update({ wardNumber: null }))
    }
  }
  if (
    beforeData &&
    afterData &&
    !afterData.isDeleted &&
    (beforeData.status === 'ipd' || beforeData.status === 'er') &&
    afterData.status === 'opd'
  ) {
    logger.info(`[Cleanup Trigger] Patient ${patientId} transferred to OPD. Cleaning up...`)
    tasks.push(cleanupFuturePatientMetadata(patientId, { clearManualNote: true, clearTeams: true }))
    if (afterData.wardNumber) {
      tasks.push(event.data.after.ref.update({ wardNumber: null }))
    }
  }
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

//============ Scheduled Functions =====================
exports.checkExpiredTasks = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'Asia/Taipei', timeoutSeconds: 300 },
  async (event) => {
    logger.info('[Scheduler] Running daily check for expired tasks (messages)...')
    const todayStr = formatDateForQuery(new Date())
    try {
      const query = db
        .collection('tasks')
        .where('status', '==', 'pending')
        .where('category', '==', 'message')
        .where('targetDate', '<', todayStr)
      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('[Scheduler] No expired tasks (messages) found.')
        return null
      }
      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`[Scheduler] Task (message) ${doc.id} has expired. Updating status.`)
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()
      logger.info(`[Scheduler] Successfully updated ${snapshot.size} tasks to 'expired'.`)
    } catch (error) {
      logger.error('[Scheduler] Failed to check for expired tasks:', error)
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

//============ Callable Functions =====================
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
    const customToken = await admin.auth().createCustomToken(uid, {
      role: userData.role,
      name: userData.name,
      title: userData.title,
    })
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
// 🔥 即時調班處理 - 立即修改排程 (✨ 最終、最嚴謹的日期驗證版 ✨)
// ===================================================================
exports.handleNewExceptionRequest = onDocumentCreated(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const exceptionDoc = event.data
    const exceptionData = exceptionDoc.data()
    const exceptionId = exceptionDoc.id

    const logPatientName =
      exceptionData.type === 'SWAP'
        ? `${exceptionData.patient1?.patientName} <=> ${exceptionData.patient2?.patientName}`
        : exceptionData.patientName

    logger.info(
      `🚀 [NewException] 新調班申請: ${exceptionId} (${exceptionData.type} - ${
        logPatientName || 'N/A'
      })`,
      { data: JSON.stringify(exceptionData) },
    )

    try {
      if (exceptionData.status !== 'pending') {
        logger.info(`[NewException] 調班 ${exceptionId} 狀態為 ${exceptionData.status}，跳過處理`)
        return null
      }

      // ✨✨✨ START: [核心安全修正] 更嚴謹的日期守門員 ✨✨✨
      const today = new Date()
      today.setHours(0, 0, 0, 0) // 設定為今天凌晨0點，以便比較

      const parseDateString = (dateStr) => {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
        return new Date(dateStr + 'T00:00:00Z') // 使用 Zulu time (UTC) 避免時區問題
      }

      // 根據不同類型，找出這次申請「最早會影響的日期」
      let relevantStartDateStr
      switch (exceptionData.type) {
        case 'MOVE':
          // 對於 MOVE，來源日期和目標日期都不能在過去
          const fromDate = parseDateString(exceptionData.from?.sourceDate)
          const toDate = parseDateString(exceptionData.to?.goalDate)
          if (fromDate < today || toDate < today) {
            throw new Error('無法為過去的日期建立「調班」申請。')
          }
          // 如果日期合法，我們用 sourceDate 作為後續流程的基準（雖然這裡用不上）
          relevantStartDateStr = exceptionData.from?.sourceDate
          break
        case 'ADD_SESSION':
          relevantStartDateStr = exceptionData.to?.goalDate
          break
        case 'SWAP':
          relevantStartDateStr = exceptionData.date
          break
        case 'SUSPEND':
        case 'RANGE_MOVE':
        default:
          relevantStartDateStr = exceptionData.startDate
          break
      }

      if (!relevantStartDateStr) {
        throw new Error('調班資料缺少必要的起始日期欄位 (startDate/sourceDate/goalDate/date)。')
      }

      const relevantStartDate = parseDateString(relevantStartDateStr)
      if (!relevantStartDate || isNaN(relevantStartDate.getTime())) {
        throw new Error(`調班起始日期格式無效: ${relevantStartDateStr}`)
      }

      // 最終的核心檢查：如果最早影響日期在今天之前，則拒絕操作
      if (relevantStartDate < today) {
        // 提供一個更通用的錯誤訊息
        throw new Error('無法為過去的日期建立或執行此調班申請。')
      }
      // ✨✨✨ END: [核心安全修正] ✨✨✨

      await exceptionDoc.ref.update({
        status: 'processing',
        processingStarted: FieldValue.serverTimestamp(),
      })

      let processedDates = []
      let conflicts = []

      // ===== 處理 MOVE 類型 =====
      if (exceptionData.type === 'MOVE') {
        const { from, to, patientId, patientName } = exceptionData
        if (
          !patientId ||
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
          // ✨✨✨ 核心修正開始 ✨✨✨

          // 情況 1: 同日移動 (sourceDate 與 goalDate 相同)
          if (from.sourceDate === to.goalDate) {
            logger.info(`  └─ 執行同日移動: ${from.sourceDate}`)
            const scheduleRef = db.collection('schedules').doc(from.sourceDate)
            const scheduleDoc = await transaction.get(scheduleRef)

            if (!scheduleDoc.exists) {
              // 理論上來源日期應該要有排班，如果沒有就報錯
              throw new Error(`MOVE 失敗：找不到來源日期 ${from.sourceDate} 的排班表`)
            }

            const schedule = scheduleDoc.data().schedule || {}
            const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)
            const targetKey = getScheduleKey(to.bedNum, to.shiftCode)

            // 步驟 A: 驗證並刪除來源位置
            if (schedule[sourceKey]?.patientId === patientId) {
              delete schedule[sourceKey]
              logger.info(`  └─ 移除 ${patientName} 從 ${from.sourceDate} ${sourceKey}`)
            } else {
              logger.warn(`  └─ 警告：原位置 ${sourceKey} 的病人不是 ${patientName}，不執行移除。`)
            }

            // 步驟 B: 檢查衝突並新增到目標位置
            const newSlotData = {
              patientId: patientId,
              patientName: patientName,
              shiftId: to.shiftCode,
              manualNote: `(換班)`,
              exceptionId: exceptionId,
              appliedAt: FieldValue.serverTimestamp(),
            }
            if (schedule[targetKey]) {
              const occupant = schedule[targetKey]
              conflicts.push({
                date: to.goalDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
              })
              logger.warn(`  └─ 衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
              newSlotData.manualNote = `(換班-覆蓋)`
            }
            schedule[targetKey] = newSlotData
            logger.info(`  └─ 新增 ${patientName} 到 ${to.goalDate} ${targetKey}`)

            // 步驟 C: 執行一次性的更新
            transaction.update(scheduleRef, {
              schedule: schedule,
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            })
            processedDates = [from.sourceDate]

            // 情況 2: 跨日移動 (sourceDate 與 goalDate 不同) - 維持原邏輯
          } else {
            logger.info(`  └─ 執行跨日移動: 從 ${from.sourceDate} 到 ${to.goalDate}`)
            const sourceScheduleRef = db.collection('schedules').doc(from.sourceDate)
            const targetScheduleRef = db.collection('schedules').doc(to.goalDate)
            const [sourceDoc, targetDoc] = await Promise.all([
              transaction.get(sourceScheduleRef),
              transaction.get(targetScheduleRef),
            ])

            // 刪除來源
            if (sourceDoc.exists) {
              const sourceKey = getScheduleKey(from.bedNum, from.shiftCode)
              const sourceSchedule = sourceDoc.data().schedule || {}
              if (sourceSchedule[sourceKey]?.patientId === patientId) {
                delete sourceSchedule[sourceKey]
                transaction.update(sourceScheduleRef, {
                  schedule: sourceSchedule,
                  lastModified: FieldValue.serverTimestamp(),
                  modifiedBy: 'exception_handler',
                })
                logger.info(`  └─ 移除 ${patientName} 從 ${from.sourceDate} ${sourceKey}`)
              } else {
                logger.warn(
                  `  └─ 警告：原位置 ${sourceKey} 的病人不是 ${patientName}，不執行移除。`,
                )
              }
            }

            // 新增到目標
            const targetKey = getScheduleKey(to.bedNum, to.shiftCode)
            const newSlotData = {
              patientId: patientId,
              patientName: patientName,
              shiftId: to.shiftCode,
              manualNote: `(換班)`,
              exceptionId: exceptionId,
              appliedAt: FieldValue.serverTimestamp(),
            }
            const targetSchedule = targetDoc.exists ? targetDoc.data().schedule || {} : {}
            if (targetSchedule[targetKey]) {
              const occupant = targetSchedule[targetKey]
              conflicts.push({
                date: to.goalDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
              })
              logger.warn(`  └─ 衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
              newSlotData.manualNote = `(換班-覆蓋)`
            }
            targetSchedule[targetKey] = newSlotData

            if (targetDoc.exists) {
              transaction.update(targetScheduleRef, {
                schedule: targetSchedule,
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              })
            } else {
              transaction.set(targetScheduleRef, {
                date: to.goalDate,
                schedule: targetSchedule,
                createdAt: FieldValue.serverTimestamp(),
                lastModified: FieldValue.serverTimestamp(),
                modifiedBy: 'exception_handler',
              })
            }
            logger.info(`  └─ 新增 ${patientName} 到 ${to.goalDate} ${targetKey}`)
            processedDates = [from.sourceDate, to.goalDate]
          }
          // ✨✨✨ 核心修正結束 ✨✨✨
        })
      }

      // ===== 處理 SUSPEND 類型 =====
      else if (exceptionData.type === 'SUSPEND') {
        const { patientId, patientName, startDate, endDate } = exceptionData
        if (!patientId || !startDate || !endDate) {
          throw new Error('SUSPEND 調班資料不完整：缺少 patientId 或日期區間')
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

      // ===== 處理 ADD_SESSION 類型 =====
      else if (exceptionData.type === 'ADD_SESSION') {
        const { to, patientId, patientName } = exceptionData
        if (!patientId || !to?.goalDate || !to?.bedNum || !to?.shiftCode) {
          throw new Error('ADD_SESSION 調班資料不完整：缺少 patientId 或目標資訊')
        }
        const targetDate = to.goalDate
        const scheduleRef = db.collection('schedules').doc(targetDate)
        const targetKey = getScheduleKey(to.bedNum, to.shiftCode)
        await db.runTransaction(async (transaction) => {
          const scheduleDoc = await transaction.get(scheduleRef)
          const newSlotData = {
            patientId: patientId,
            patientName: patientName,
            shiftId: to.shiftCode,
            manualNote: `(臨時加洗)`,
            exceptionId: exceptionId,
            appliedAt: FieldValue.serverTimestamp(),
          }
          const scheduleData = scheduleDoc.exists ? scheduleDoc.data().schedule || {} : {}
          if (scheduleData[targetKey]) {
            const occupant = scheduleData[targetKey]
            conflicts.push({
              date: targetDate,
              position: targetKey,
              occupiedBy: occupant.patientName || occupant.patientId,
              action: 'override',
            })
            logger.warn(`  └─ 衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
            newSlotData.manualNote = `(臨時加洗-覆蓋)`
          }
          scheduleData[targetKey] = newSlotData
          if (scheduleDoc.exists) {
            transaction.update(scheduleRef, {
              schedule: scheduleData,
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            })
          } else {
            transaction.set(scheduleRef, {
              date: targetDate,
              schedule: scheduleData,
              createdAt: FieldValue.serverTimestamp(),
              lastModified: FieldValue.serverTimestamp(),
              modifiedBy: 'exception_handler',
            })
          }
        })
        logger.info(`  └─ 新增 ${patientName} 到 ${targetDate} ${targetKey}`)
        processedDates = [targetDate]
      }

      // ===== 處理 SWAP 類型 =====
      else if (exceptionData.type === 'SWAP') {
        const { date, patient1, patient2 } = exceptionData
        if (
          !date ||
          !patient1 ||
          !patient2 ||
          !patient1.patientId ||
          !patient1.fromBedNum ||
          !patient1.fromShiftCode ||
          !patient2.patientId ||
          !patient2.fromBedNum ||
          !patient2.fromShiftCode
        ) {
          throw new Error(
            'SWAP 調班資料不完整：缺少日期或完整的 patient1/patient2 物件及其內部欄位',
          )
        }
        const scheduleRef = db.collection('schedules').doc(date)
        const key1 = getScheduleKey(patient1.fromBedNum, patient1.fromShiftCode)
        const key2 = getScheduleKey(patient2.fromBedNum, patient2.fromShiftCode)
        await db.runTransaction(async (transaction) => {
          const scheduleDoc = await transaction.get(scheduleRef)
          if (!scheduleDoc.exists) {
            throw new Error(`SWAP 失敗：找不到日期 ${date} 的排班表`)
          }
          const scheduleData = scheduleDoc.data().schedule || {}
          if (scheduleData[key1]?.patientId !== patient1.patientId) {
            throw new Error(`SWAP 驗證失敗：${patient1.patientName} 不在預期的位置 ${key1}`)
          }
          if (scheduleData[key2]?.patientId !== patient2.patientId) {
            throw new Error(`SWAP 驗證失敗：${patient2.patientName} 不在預期的位置 ${key2}`)
          }
          const slot1Data = { ...scheduleData[key1] }
          const slot2Data = { ...scheduleData[key2] }
          transaction.update(scheduleRef, {
            [`schedule.${key1}`]: {
              ...slot2Data,
              manualNote: `(與${patient1.patientName}互調)`,
              exceptionId: exceptionId,
            },
            [`schedule.${key2}`]: {
              ...slot1Data,
              manualNote: `(與${patient2.patientName}互調)`,
              exceptionId: exceptionId,
            },
            lastModified: FieldValue.serverTimestamp(),
            modifiedBy: 'exception_handler',
          })
        })
        logger.info(
          `  └─ 成功交換 ${patient1.patientName} (${key1}) 與 ${patient2.patientName} (${key2})`,
        )
        processedDates = [date]
      }

      // ===== 更新調班狀態為已套用 =====
      // ✨✨✨【核心修改】基於 endDate 計算一個月後的過期時間 ✨✨✨

      // 1. 找出這次申請的「結束日期」。對於單日事件，endDate 就是 startDate 或 date。
      let relevantEndDateStr
      if (exceptionData.endDate) {
        relevantEndDateStr = exceptionData.endDate
      } else if (exceptionData.type === 'MOVE') {
        // 對於 MOVE，取來源日和目標日中較晚的那個
        relevantEndDateStr =
          exceptionData.to?.goalDate > exceptionData.from?.sourceDate
            ? exceptionData.to.goalDate
            : exceptionData.from.sourceDate
      } else if (exceptionData.type === 'ADD_SESSION') {
        relevantEndDateStr = exceptionData.to?.goalDate
      } else if (exceptionData.type === 'SWAP') {
        relevantEndDateStr = exceptionData.date
      } else {
        // 作為備用，使用 startDate
        relevantEndDateStr = exceptionData.startDate
      }

      let expireAt = null
      if (relevantEndDateStr) {
        // 2. 將結束日期字串轉為 Date 物件
        const endDate = new Date(relevantEndDateStr)

        // 3. 在結束日期的基礎上，增加一個月
        endDate.setMonth(endDate.getMonth() + 1)
        expireAt = endDate // 直接賦值
        logger.info(
          `[NewException] Calculated expireAt for ${exceptionId}: ${expireAt.toISOString()}`,
        )
      } else {
        // 如果找不到任何有效日期，則設定一個預設的過期時間（例如從現在起一個月）
        const now = new Date()
        now.setMonth(now.getMonth() + 1)
        expireAt = now
        logger.warn(
          `[NewException] Could not determine endDate for ${exceptionId}. Setting default expireAt.`,
        )
      }

      const updateData = {
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
        processedDates: processedDates,
        conflicts: conflicts.length > 0 ? conflicts : null,
        conflictCount: conflicts.length,
        applyMethod: 'realtime',
        expireAt: expireAt, // ✨ 將計算出的過期時間加入
      }
      await exceptionDoc.ref.update(updateData)

      // ===== 記錄操作日誌 (保持不變) =====
      await db.collection('exception_logs').add({
        exceptionId: exceptionId,
        type: exceptionData.type,
        patientId: exceptionData.patientId,
        patientName: exceptionData.patientName,
        action: 'applied',
        timestamp: FieldValue.serverTimestamp(),
        details: exceptionData,
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
// 處理調班刪除（✨ 採用「重新計算」模式的最終安全版 ✨）
// ===================================================================
exports.onExceptionDeleted = onDocumentDeleted(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const deletedException = event.data.data()
    const exceptionId = event.params.exceptionId
    logger.info(`🚀 [Reverter-V2] 調班恢復處理器(重新計算模式)啟動: ${exceptionId}`)

    if (!deletedException || !deletedException.type) {
      logger.error(`❌ [Reverter-V2] 失敗：被刪除的調班資料不完整，缺少 type。`, deletedException)
      return
    }

    try {
      // --- 步驟 1: 找出所有受影響的日期 ---
      const todayStr = formatDateForQuery(new Date())
      const affectedDates = new Set()

      // 根據不同類型，計算出所有可能受影響的日期
      if (deletedException.from?.sourceDate) affectedDates.add(deletedException.from.sourceDate)
      if (deletedException.to?.goalDate) affectedDates.add(deletedException.to.goalDate)
      if (deletedException.date) affectedDates.add(deletedException.date)
      if (deletedException.startDate && deletedException.endDate) {
        const start = new Date(deletedException.startDate + 'T00:00:00Z')
        const end = new Date(deletedException.endDate + 'T00:00:00Z')
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          affectedDates.add(formatDateForQuery(new Date(d)))
        }
      }

      const futureAffectedDates = Array.from(affectedDates).filter((dateStr) => dateStr >= todayStr)

      if (futureAffectedDates.length === 0) {
        logger.warn(`[Reverter-V2] 該調班申請只影響過去的日期，無需執行恢復操作 for ${exceptionId}`)
        return
      }

      logger.info(
        `[Reverter-V2] 該申請影響未來的 ${futureAffectedDates.length} 個日期，開始重新計算...`,
      )

      // --- 步驟 2: 載入總表規則 ---
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.error('❌ [Reverter-V2] 嚴重錯誤：找不到總表規則，無法恢復排班。')
        return
      }
      const masterRules = masterScheduleDoc.data().schedule || {}

      // --- 步驟 3: 針對每一個受影響的未來日期，執行完整的重新計算 ---
      const resyncPromises = futureAffectedDates.map(async (dateStr) => {
        logger.info(`  └─ 正在重新計算日期: ${dateStr}`)

        // 3.1 根據總表，生成當天的「乾淨」基礎排班
        const targetDate = new Date(dateStr + 'T00:00:00Z')
        const dailySchedule = generateDailyScheduleFromRules(masterRules, targetDate)

        // 3.2 建立一個只包含當天基礎排程的 Map，以符合 reapplyAllExceptionsInternal 的輸入格式
        const singleDayBaseSchedule = new Map()
        singleDayBaseSchedule.set(dateStr, dailySchedule)

        // 3.3 呼叫強大的內部函式，它會自動抓取「所有」有效的調班，並套用到我們提供的基礎排程上
        // 重要的！reapplyAllExceptionsInternal 現在不會包含剛剛被刪除的那一筆，所以結果是正確的
        const result = await reapplyAllExceptionsInternal(singleDayBaseSchedule)

        const finalScheduleForDay = result.schedulesToWrite.get(dateStr)

        if (finalScheduleForDay) {
          // 3.4 用全新計算出的結果，完全覆蓋當天的排班表
          const scheduleRef = db.collection('schedules').doc(dateStr)
          await scheduleRef.set(
            {
              date: dateStr,
              schedule: finalScheduleForDay,
              syncedAt: FieldValue.serverTimestamp(),
              syncMethod: 'reverter_recalculation',
            },
            { merge: false },
          ) // merge: false 確保是完全覆蓋
          logger.info(`    └─ ✅ 日期 ${dateStr} 重新計算並覆蓋成功。`)
        } else {
          logger.warn(`    └─ ⚠️ 日期 ${dateStr} 重新計算後沒有產生排程資料。`)
        }
      })

      await Promise.all(resyncPromises)

      logger.info(`✅ [Reverter-V2] 成功完成對 ${futureAffectedDates.length} 個日期的排班恢復。`)
    } catch (error) {
      logger.error(`❌ [Reverter-V2] 恢復調班 ${exceptionId} 時發生嚴重錯誤:`, error)
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
        丙胺酸轉胺酶: 'ALT',
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
// Consumables Report Functions (耗材報告相關函式) - v3.2 (使用迄日歸檔)
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

    logger.info(`[Consumables V3.2] 接收到檔案 ${fileName}，開始解析...`)

    try {
      const buffer = Buffer.from(fileContent, 'base64')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      const sheetAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

      if (sheetAsArray.length < 3) {
        throw new HttpsError('invalid-argument', 'Excel 檔案內容行數不足。')
      }

      // ✨ --- [核心修正] 修改正規表達式，抓取「迄日」 --- ✨
      const dateString = sheetAsArray[1][0] || ''
      // 原本的: const monthMatch = dateString.match(/&起日(\d{4})(\d{2})/)
      const monthMatch = dateString.match(/&迄日(\d{4})(\d{2})/) // 改為匹配 &迄日

      if (!monthMatch) {
        // 更新錯誤訊息，讓它更清晰
        throw new HttpsError(
          'invalid-argument',
          'Excel 格式錯誤，在第二列找不到有效的迄日(需為 &迄日YYYYMM 格式)。',
        )
      }
      const reportMonth = `${monthMatch[1]}-${monthMatch[2]}`
      logger.info(`[Consumables V3.2] 解析到報表月份為 (迄日): ${reportMonth}`)
      // ✨ --- (修正結束) --- ✨

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

        if (!patientUpdate.data[firestoreField]) {
          patientUpdate.data[firestoreField] = []
        }
        patientUpdate.data[firestoreField].push({
          item: consumableValue,
          count: count || 0,
        })

        processedRowCount++
      }

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
      logger.error(`[Consumables V3.2] 處理檔案 ${fileName} 時發生嚴重錯誤:`, error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', `處理 Excel 檔案時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// Medication Orders Processing Function (藥囑處理函式) - v1.3 (批次處理最終版)
// ===================================================================

exports.processOrders = onCall(
  {
    timeoutSeconds: 540,
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

    logger.info(`[ProcessOrders V1.3] 接收到檔案 ${fileName}，開始解析...`)

    try {
      // 1. 解析 Excel，增加 { cellDates: true } 選項
      const buffer = Buffer.from(fileContent, 'base64')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
      // ✨ [核心修正 1] 使用 sheet_to_json 搭配 header:1，並讓 xlsx 幫我們處理日期
      const dataRows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: false,
        dateNF: 'YYYY-MM-DD',
      })

      let headerRowIndex = -1
      let headers = []
      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i].map((h) => String(h).trim())
        if (row.includes('病歷號') && row.includes('醫令碼') && row.includes('名稱')) {
          headerRowIndex = i
          headers = row
          break
        }
      }
      if (headerRowIndex === -1) {
        throw new HttpsError(
          'invalid-argument',
          "找不到有效的標題行 (需包含 '病歷號', '醫令碼', '名稱')。",
        )
      }

      const headerToIndex = {}
      headers.forEach((header, index) => {
        if (header) headerToIndex[header.trim()] = index
      })

      const requiredHeaders = ['病歷號', '醫令碼', '名稱', '異動日期', '次劑量']
      const missingHeaders = requiredHeaders.filter((h) => headerToIndex[h] === undefined)
      if (missingHeaders.length > 0) {
        throw new HttpsError(
          'invalid-argument',
          `Excel 檔案缺少必要的欄位: ${missingHeaders.join(', ')}`,
        )
      }

      // 2. 定義藥物類別 (已移除 OFOL 和 OKEN)
      const oralMedCodes = ['OALK1', 'OCAA', 'OCAL1', 'OFOS4', 'OUCA1', 'OVAF']
      const injectionMedCodes = ['INES2', 'IPAR1', 'ICAC', 'IFER2', 'IREC1']

      // 3. 遍歷資料行並處理
      let batch = db.batch() // 初始化第一個批次
      const patientCache = new Map()
      let errors = []
      let processedCount = 0
      let batchCounter = 0 // 當前批次的計數器
      const BATCH_SIZE = 450 // 設定批次大小

      for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
        const row = dataRows[i]
        if (row.every((cell) => String(cell).trim() === '')) continue

        let medicalRecordNumber = String(row[headerToIndex['病歷號']] || '')
          .trim()
          .replace(/^0+/, '')
        const orderCode = String(row[headerToIndex['醫令碼']] || '').trim()
        // ✨ [核心修正 2] 直接使用 xlsx 解析好的日期字串
        const changeDate = String(row[headerToIndex['異動日期']] || '').trim()
        const orderName = String(row[headerToIndex['名稱']] || '').trim()

        if (!medicalRecordNumber || !orderCode || !changeDate || !orderName) {
          let reason = '缺少必要欄位'
          if (!changeDate) reason = `異動日期格式錯誤或為空`
          errors.push({ rowNumber: i + 1, reason })
          continue
        }

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
          errors.push({
            rowNumber: i + 1,
            reason: `病歷號 ${medicalRecordNumber} 找不到對應的病人`,
          })
          continue
        }

        let orderType = null
        const orderPayload = {
          patientId: patientData.id,
          medicalRecordNumber: patientData.medicalRecordNumber,
          patientName: patientData.name,
          orderCode,
          orderName,
          changeDate,
          dose: String(row[headerToIndex['次劑量']] || ''),
          action: 'MODIFY',
          sourceFile: fileName,
          uploadTimestamp: FieldValue.serverTimestamp(),
        }

        if (oralMedCodes.includes(orderCode)) {
          orderType = 'oral'
          orderPayload.frequency = String(row[headerToIndex['頻率服法']] || '')
        } else if (injectionMedCodes.includes(orderCode)) {
          orderType = 'injection'
          orderPayload.note = String(row[headerToIndex['備註']] || '')
        }

        if (orderType) {
          orderPayload.orderType = orderType
          const newOrderRef = db.collection('medication_orders').doc()
          batch.set(newOrderRef, orderPayload)
          processedCount++
          batchCounter++

          // ✨ [核心修正 3] 檢查是否達到批次大小
          if (batchCounter >= BATCH_SIZE) {
            await batch.commit() // 提交當前批次
            logger.info(`[ProcessOrders V1.3] 已提交 ${batchCounter} 筆資料...`)
            batch = db.batch() // 建立新批次
            batchCounter = 0 // 重設計數器
          }
        }
      }

      // 4. 提交剩餘的批次
      if (batchCounter > 0) {
        await batch.commit()
        logger.info(`[ProcessOrders V1.3] 已提交最後 ${batchCounter} 筆資料。`)
      }

      logger.info(
        `[ProcessOrders V1.3] 處理完成，成功處理 ${processedCount} 筆藥囑，發現 ${errors.length} 個問題。`,
      )

      return {
        success: true,
        message: `處理完成！成功匯入 ${processedCount} 筆藥囑紀錄，發現 ${errors.length} 個問題行。`,
        processedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      }
    } catch (error) {
      logger.error(`[ProcessOrders V1.3] 處理檔案 ${fileName} 時發生嚴重錯誤:`, error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', `處理 Excel 檔案時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// Daily Injection Calculation Function (每日應打針劑計算函式) - v2.5 (最終修正版)
// ===================================================================

/**
 * 解析從資料庫讀取的、只包含年月日的日期字串 (YYYYMMDDHHMMSS...)。
 * 會截斷輸入字串的前8碼進行處理，並將其轉換為 UTC 零時區的 Date 物件以避免時區問題。
 * @param {string} dateStr - 來源日期字串，例如 '2025051805...'。
 * @returns {Date} 一個代表該日期零點零分零秒的 Date 物件，或是一個無效日期。
 */
function parseCustomDateString(dateStr) {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim().length < 8) {
    return new Date(null) // Return an invalid date
  }
  const yyyymmdd = dateStr.substring(0, 8)
  const year = yyyymmdd.substring(0, 4)
  const month = yyyymmdd.substring(4, 6)
  const day = yyyymmdd.substring(6, 8)
  const isoString = `${year}-${month}-${day}T00:00:00.000Z`
  const date = new Date(isoString)
  if (isNaN(date.getTime())) {
    return new Date(null)
  }
  return date
}

/**
 * ✨ [核心修正] 加回這個被遺忘的函式 ✨
 * 解析多種格式的醫師手寫日期字串，並返回標準化的 YYYY-MM-DD 格式。
 * @param {string} dateStr - 醫師輸入的日期字串 (例如 "8/7", "0807", "2025/8/7")。
 * @param {Date} targetDate - 用於獲取年份的基準日期。
 * @returns {string|null} 返回 "YYYY-MM-DD" 格式的字串，或在無法解析時返回 null。
 */
const parseFlexibleDate = (dateStr, targetDate) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }

  const str = dateStr.trim()
  const year = targetDate.getUTCFullYear()

  let match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (match) {
    const customYear = match[1]
    const month = match[2].padStart(2, '0')
    const day = match[3].padStart(2, '0')
    return `${customYear}-${month}-${day}`
  }

  match = str.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (match) {
    const month = match[1].padStart(2, '0')
    const day = match[2].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  match = str.match(/^(\d{2})(\d{2})$/)
  if (match && str.length === 4) {
    const month = match[1]
    const day = match[2]
    if (
      parseInt(month, 10) > 0 &&
      parseInt(month, 10) <= 12 &&
      parseInt(day, 10) > 0 &&
      parseInt(day, 10) <= 31
    ) {
      return `${year}-${month}-${day}`
    }
  }

  return null
}

exports.getDailyInjections = onCall(
  {
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '使用者未登入，無法執行此操作。')
    }

    const { targetDate, patientIds, allowedMedications } = request.data
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new HttpsError('invalid-argument', '請提供有效的目標日期 (格式 YYYY-MM-DD)。')
    }

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return { success: true, targetDate, injections: [] }
    }
    // ✨ 為了方便測試，暫時放寬病人數限制。正式上線時建議改回 30 或 50。
    if (patientIds.length > 100) {
      throw new HttpsError('invalid-argument', '單次查詢的病人數不能超過100人。')
    }

    logger.info(
      `[getDailyInjections V2.5] 開始為 ${patientIds.length} 位病人計算 ${targetDate} 的應打針劑...`,
      allowedMedications ? `篩選藥物: [${allowedMedications.join(', ')}]` : '無特定藥物篩選',
    )

    try {
      // --- 步驟 1: 查詢所有相關藥囑 ---
      const allOrdersQuery = db
        .collection('medication_orders')
        .where('patientId', 'in', patientIds)
        .where('orderType', '==', 'injection')
      const allOrdersSnapshot = await allOrdersQuery.get()
      const allOrdersHistory = allOrdersSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

      // --- 步驟 2: 撈取當天的排班資料 ---
      const scheduleDoc = await db.collection('schedules').doc(targetDate).get()
      const scheduleData = scheduleDoc.exists ? scheduleDoc.data().schedule : {}
      const patientSlotMap = new Map()
      for (const shiftId in scheduleData) {
        const slot = scheduleData[shiftId]
        if (slot.patientId) {
          patientSlotMap.set(slot.patientId, {
            bedNum: shiftId.startsWith('peripheral')
              ? `外${shiftId.split('-')[1]}`
              : shiftId.split('-')[1],
            shift: shiftId.split('-')[2],
          })
        }
      }

      // --- 步驟 3: 為每個病人計算有效藥囑 ---
      const finalInjectionList = []
      const dateObj = new Date(targetDate + 'T00:00:00Z')
      const targetDayOfWeek = dateObj.getUTCDay()

      for (const patientId of patientIds) {
        const patientHistory = allOrdersHistory.filter((order) => order.patientId === patientId)

        const effectiveOrders = patientHistory.filter((record) => {
          // 此處的 parseCustomDateString 是我們整理過的唯一版本
          const changeDate = parseCustomDateString(record.changeDate)
          return !isNaN(changeDate.getTime()) && changeDate <= dateObj
        })

        const latestEffectiveOrdersMap = new Map()
        effectiveOrders.sort(
          (a, b) => parseCustomDateString(b.changeDate) - parseCustomDateString(a.changeDate),
        )

        for (const order of effectiveOrders) {
          const uniqueKey = `${order.orderCode}_${(order.note || '').trim()}`
          if (!latestEffectiveOrdersMap.has(uniqueKey)) {
            latestEffectiveOrdersMap.set(uniqueKey, order)
          }
        }

        const slotInfo = patientSlotMap.get(patientId) || { bedNum: 'N/A', shift: 'N/A' }

        for (const order of latestEffectiveOrdersMap.values()) {
          if (
            Array.isArray(allowedMedications) &&
            allowedMedications.length > 0 &&
            !allowedMedications.includes(order.orderName)
          ) {
            continue
          }

          const note = (order.note || '').trim()
          let shouldAdminister = false
          let reason = ''

          if (note.toUpperCase().startsWith('QW')) {
            const days = note
              .substring(2)
              .split('')
              .map((d) => parseInt(d, 10))
              .filter((d) => !isNaN(d))
            const firebaseDayOfWeek = targetDayOfWeek === 0 ? 7 : targetDayOfWeek
            if (days.includes(firebaseDayOfWeek)) {
              shouldAdminister = true
              reason = `規則匹配: ${note}`
            }
          } else {
            const dateEntries = note.split(/[\s,]+/).filter(Boolean)
            for (const entry of dateEntries) {
              // ✨ 現在這裡可以正確呼叫到 parseFlexibleDate 了 ✨
              const parsedDate = parseFlexibleDate(entry, dateObj)
              if (parsedDate && parsedDate === targetDate) {
                shouldAdminister = true
                reason = `日期匹配: ${entry}`
                break
              }
            }
          }

          if (shouldAdminister) {
            finalInjectionList.push({
              patientId: order.patientId,
              patientName: order.patientName,
              bedNum: slotInfo.bedNum,
              shift: slotInfo.shift,
              orderCode: order.orderCode,
              orderName: order.orderName,
              dose: order.dose,
              note: order.note,
              reason,
            })
          }
        }
      }

      // 排序 (不變)
      finalInjectionList.sort((a, b) => {
        const shiftOrder = { early: 1, noon: 2, late: 3, N: 98, A: 99 }
        const shiftA = a.shift || 'A'
        const shiftB = b.shift || 'A'
        if (shiftA !== shiftB) return (shiftOrder[shiftA] || 99) - (shiftOrder[shiftB] || 99)
        const bedA = String(a.bedNum).startsWith('外')
          ? 1000 + parseInt(String(a.bedNum).substring(1))
          : parseInt(a.bedNum)
        const bedB = String(b.bedNum).startsWith('外')
          ? 1000 + parseInt(String(b.bedNum).substring(1))
          : parseInt(b.bedNum)
        return bedA - bedB
      })

      logger.info(
        `[getDailyInjections V2.5] 計算完成，找到 ${finalInjectionList.length} 筆應打針劑。`,
      )
      return { success: true, targetDate, injections: finalInjectionList }
    } catch (error) {
      logger.error(`[getDailyInjections V2.5] 處理針劑計算時發生嚴重錯誤:`, error)
      throw new HttpsError('internal', `計算應打針劑時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// // ✨ --- 【最終修正版 V2.3】每日自動歸檔 (徹底修正時區計算) --- ✨
// ===================================================================

exports.archiveDailySchedule = onSchedule(
  { schedule: 'every day 00:05', timeZone: 'Asia/Taipei', timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    // 1. 直接獲取「台北時區」當下的日期字串 (YYYY-MM-DD)
    const taipeiDateString = new Date()
      .toLocaleDateString('zh-TW', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })
      .replace(/\//g, '-')

    // 2. 基於這個台北日期字串，建立一個 Date 物件來計算昨天
    const todayInTaipei = new Date(taipeiDateString)
    const yesterdayInTaipei = new Date(todayInTaipei)
    yesterdayInTaipei.setDate(todayInTaipei.getDate() - 1)

    // 3. 將計算出的「昨天的日期」格式化為我們需要的 YYYY-MM-DD 格式
    const dateStr = formatDateForQuery(yesterdayInTaipei)

    logger.info(
      `[Archiver V2.3] 🚀 歸檔任務啟動，當前台北日期: ${taipeiDateString}，目標歸檔日期: ${dateStr}`,
    )

    const sourceScheduleRef = db.collection('schedules').doc(dateStr)
    const targetArchiveRef = db.collection('expired_schedules').doc(dateStr)

    try {
      const scheduleDoc = await sourceScheduleRef.get()
      if (!scheduleDoc.exists) {
        logger.warn(`[Archiver V2.3] ⚠️ 日期 ${dateStr} 的排班文件不存在，無需歸檔。`)
        return null
      }

      const originalData = scheduleDoc.data()
      const originalSchedule = originalData.schedule || {}
      const patientIds = [
        ...new Set(
          Object.values(originalSchedule)
            .map((slot) => slot.patientId)
            .filter(Boolean),
        ),
      ]

      if (patientIds.length === 0) {
        logger.info(`[Archiver V2.3] 📄 日期 ${dateStr} 的排班中沒有病人，直接歸檔空排班。`)
        await targetArchiveRef.set({ ...originalData, archivedAt: FieldValue.serverTimestamp() })
        await sourceScheduleRef.delete()
        logger.info(`[Archiver V2.3] ✅ 成功歸檔並刪除空的原始排班 ${dateStr}。`)
        return null
      }

      logger.info(`[Archiver V2.3] 🔍 找到 ${patientIds.length} 位病人，開始分批查詢其狀態快照...`)

      const patientDataMap = new Map()
      const CHUNK_SIZE = 30

      for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
        const chunk = patientIds.slice(i, i + CHUNK_SIZE)
        const patientQuery = db.collection('patients').where(FieldPath.documentId(), 'in', chunk)
        const patientDocs = await patientQuery.get()

        patientDocs.forEach((doc) => {
          patientDataMap.set(doc.id, doc.data())
        })
      }
      logger.info(
        `[Archiver V2.3] ✅ 所有批次查詢完成，成功獲取 ${patientDataMap.size} 位病人的資料。`,
      )

      const archivedSchedule = { ...originalSchedule }
      let missingPatientCount = 0
      for (const shiftId in archivedSchedule) {
        const slot = archivedSchedule[shiftId]
        if (slot?.patientId) {
          const patientData = patientDataMap.get(slot.patientId)
          if (patientData) {
            slot.archivedPatientInfo = {
              status: patientData.status || 'unknown', // 如果 status 不存在，給個預設值
              mode: patientData.mode || null, // 如果 mode 不存在，存入 null
              wardNumber: patientData.wardNumber || null, // 這行原本就是安全的
            }
          } else {
            missingPatientCount++
            slot.archivedPatientInfo = {
              status: 'deleted',
              mode: 'N/A',
              wardNumber: null,
              name: slot.patientName || '未知 (已刪除)',
            }
          }
        }
      }

      if (missingPatientCount > 0) {
        logger.warn(
          `[Archiver V2.3] ⚠️ 有 ${missingPatientCount} 位病人的資料在 patients 集合中找不到，可能已被刪除。`,
        )
      }

      const dataToArchive = {
        ...originalData,
        schedule: archivedSchedule,
        archivedAt: FieldValue.serverTimestamp(),
      }

      const batch = db.batch()
      batch.set(targetArchiveRef, dataToArchive)
      batch.delete(sourceScheduleRef)
      await batch.commit()

      logger.info(`[Archiver V2.3] ✅ 成功歸檔並刪除原始排班 ${dateStr}。`)
    } catch (error) {
      logger.error(`[Archiver V2.3] ❌ 歸檔日期 ${dateStr} 的排班時發生嚴重錯誤:`, error)
      throw error
    }
    return null
  },
)

// ✨ --- 【全新】手動遷移歷史排班的一次性 Cloud Function --- ✨
exports.migrateSchedulesToArchive = onCall(
  { timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    if (request.auth?.token?.role !== 'admin') {
      throw new HttpsError('permission-denied', '您沒有權限執行此操作。')
    }

    const { startDate, endDate } = request.data
    if (!startDate || !endDate) {
      throw new HttpsError('invalid-argument', '請提供 startDate 和 endDate (格式 YYYY-MM-DD)。')
    }

    logger.info(`[Migrator V2.1] 🚀 手動遷移啟動，範圍: ${startDate} 至 ${endDate}`)

    try {
      const schedulesSnapshot = await db
        .collection('schedules')
        .where('date', '>=', startDate)
        .where('date', '<=', endDate)
        .get()

      if (schedulesSnapshot.empty) {
        logger.info('[Migrator V2.1] 在此日期範圍內找不到需要遷移的排班文件。')
        return {
          success: true,
          message: '在此日期範圍內找不到需要遷移的排班文件。',
          migratedCount: 0,
        }
      }

      logger.info(`[Migrator V2.1] 🔍 找到 ${schedulesSnapshot.size} 份排班文件準備遷移...`)
      let migratedCount = 0

      for (const scheduleDoc of schedulesSnapshot.docs) {
        const dateStr = scheduleDoc.id
        const originalData = scheduleDoc.data()
        const originalSchedule = originalData.schedule || {}

        logger.info(`  └─ 正在處理 ${dateStr}...`)

        const patientIds = [
          ...new Set(
            Object.values(originalSchedule)
              .map((slot) => slot.patientId)
              .filter(Boolean),
          ),
        ]
        const archivedSchedule = { ...originalSchedule }

        if (patientIds.length > 0) {
          const patientDataMap = new Map()
          const CHUNK_SIZE = 30
          for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
            const chunk = patientIds.slice(i, i + CHUNK_SIZE)
            const patientDocs = await db
              .collection('patients')
              .where(FieldPath.documentId(), 'in', chunk)
              .get()
            patientDocs.forEach((doc) => patientDataMap.set(doc.id, doc.data()))
          }

          for (const shiftId in archivedSchedule) {
            const slot = archivedSchedule[shiftId]
            if (slot?.patientId) {
              const patientData = patientDataMap.get(slot.patientId)
              if (patientData) {
                // ✨ --- 核心修正點 --- ✨
                slot.archivedPatientInfo = {
                  status: patientData.status || 'unknown',
                  mode: patientData.mode || null,
                  wardNumber: patientData.wardNumber || null,
                }
              } else {
                slot.archivedPatientInfo = {
                  status: 'deleted',
                  mode: 'N/A',
                  wardNumber: null,
                  name: slot.patientName || '未知(已刪除)',
                }
              }
            }
          }
        }

        const dataToArchive = {
          ...originalData,
          schedule: archivedSchedule,
          archivedAt: FieldValue.serverTimestamp(),
          migrationNote: 'Manually migrated on ' + new Date().toISOString(),
        }

        const batch = db.batch()
        batch.set(db.collection('expired_schedules').doc(dateStr), dataToArchive)
        batch.delete(db.collection('schedules').doc(dateStr))
        await batch.commit()
        migratedCount++
        logger.info(`    └─ ✅ ${dateStr} 遷移成功！`)
      }

      const successMessage = `成功遷移 ${migratedCount} 份排班文件！`
      logger.info(`[Migrator V2.1] ✅ ${successMessage}`)
      return { success: true, message: successMessage, migratedCount }
    } catch (error) {
      logger.error(`[Migrator V2.1] ❌ 遷移過程中發生嚴重錯誤:`, error)
      throw new HttpsError('internal', `遷移失敗: ${error.message}`)
    }
  },
)
