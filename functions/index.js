// functions/index.js (✨ 最終整理版 ✨)

// --- Firebase Functions V2 全局設定 ---
const { setGlobalOptions } = require('firebase-functions/v2')
// 建議在此處設定您的全局選項
setGlobalOptions({ region: 'asia-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 100 })

// --- Firebase Functions V2 模組引入 ---
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  onDocumentWritten,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')

// --- Firebase Admin SDK 初始化 (只需一次) ---
const admin = require('firebase-admin')
admin.initializeApp()

// --- 從 Admin SDK 中獲取服務實例 ---
const db = admin.firestore()
const auth = admin.auth()
const storage = admin.storage()
const { FieldValue, FieldPath } = require('firebase-admin/firestore')

// --- 第三方函式庫 ---
const { google } = require('googleapis')
const stream = require('stream')
const path = require('path')

// --- ✨ 引入統一的日期處理工具 ✨ ---
const {
  formatDateToYYYYMMDD,
  getTaipeiTodayString,
  getTaipeiNow, // <--- ✨✨✨ 請確保已將 getTaipeiNow 加入此處 ✨✨✨
  TIME_ZONE,
} = require('./utils/dateUtils')

// ===================================================================
// 全域設定 (Global Configurations)
// ===================================================================

const PROJECT_ID = process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT

// --- Google Drive 動態設定 ---
let SHARED_DRIVE_FOLDER_ID
if (PROJECT_ID === 'dialysis-schedule-cd36c') {
  SHARED_DRIVE_FOLDER_ID = '1uGKoMfJicJoNR2CYOznEj_62Wh_FSrg8'
  logger.info(`Running in PRODUCTION environment. Using Production Google Drive Folder.`)
} else {
  SHARED_DRIVE_FOLDER_ID = '1FPdK5sHy90zXzUAv0dHuF6fzpdilwjVe'
  logger.info(
    `Running in DEVELOPMENT or EMULATOR environment. Using Development Google Drive Folder.`,
  )
}

// --- CORS 跨來源請求設定 ---
const allowedOrigins = [
  'https://my-dialysis-app-develop.web.app', // 開發版前端網址
  'https://dialysis-schedule-cd36c.web.app', // 正式版前端網址
  'http://localhost:5173', // 本地 Vite 開發伺服器
]

// ===================================================================
// 輔助函式 (Helper Functions)
// ===================================================================

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

  const todayStr = getTaipeiTodayString() // ✨ 使用統一函式
  const batch = db.batch()
  let updatesCount = 0

  try {
    if (clearTeams) {
      const assignmentsSnapshot = await db
        .collection('nurse_assignments')
        .where('date', '>', todayStr) // 保護今天的資料
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
      const schedulesSnapshot = await db
        .collection('schedules')
        .where('date', '>', todayStr) // 保護今天的資料
        .get()
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

// 輔助函式：取消病人所有未來的調班申請
async function cancelFutureExceptionsForPatient(patientId) {
  if (!patientId) return

  logger.info(`[Exception Cleanup] Cancelling exceptions for deleted patient ${patientId}`)

  const todayStr = getTaipeiTodayString() // ✨ 使用統一函式
  const batch = db.batch()
  let cancelledCount = 0

  try {
    // 1. 該病人的調班
    const mainQuery = await db
      .collection('schedule_exceptions')
      .where('patientId', '==', patientId)
      .where('status', 'in', ['pending', 'applied', 'processing', 'conflict_requires_resolution'])
      .get()

    mainQuery.forEach((doc) => {
      const ex = doc.data()
      const latestDate = ex.endDate || ex.to?.goalDate || ex.date || ex.startDate
      if (!latestDate || latestDate > todayStr) {
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelReason: '病人已刪除',
          cancelledAt: FieldValue.serverTimestamp(),
        })
        cancelledCount++
      }
    })

    // 2. SWAP 中涉及該病人的調班
    const swapQuery = await db
      .collection('schedule_exceptions')
      .where('type', '==', 'SWAP')
      .where('status', 'in', ['pending', 'applied', 'processing', 'conflict_requires_resolution'])
      .get()

    swapQuery.forEach((doc) => {
      const swap = doc.data()
      if (
        (swap.patient1?.patientId === patientId || swap.patient2?.patientId === patientId) &&
        (!swap.date || swap.date >= todayStr)
      ) {
        batch.update(doc.ref, {
          status: 'cancelled',
          cancelReason: '病人已刪除',
          cancelledAt: FieldValue.serverTimestamp(),
        })
        cancelledCount++
      }
    })

    if (cancelledCount > 0) {
      await batch.commit()
      logger.info(`✅ Cancelled ${cancelledCount} exceptions for deleted patient ${patientId}`)
    }
  } catch (error) {
    logger.error(`❌ Error cancelling exceptions for patient ${patientId}:`, error)
  }
}

// ===================================================================
// Firestore 文件觸發器 - 病人資料變更處理（完整版）
// ===================================================================
/**
 * 處理病人資料變更
 */
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

  // === 處理新增病人 ===
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
  // === 處理病人刪除 ===
  else if (
    beforeData &&
    afterData &&
    beforeData.isDeleted !== true &&
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

    logger.info(
      `[Cleanup Trigger] Patient ${patientId} was deleted. Starting comprehensive cleanup...`,
    )
    tasks.push(cleanupFuturePatientMetadata(patientId, { clearTeams: true }))
    if (afterData.wardNumber) {
      tasks.push(event.data.after.ref.update({ wardNumber: null }))
    }
    tasks.push(cancelFutureExceptionsForPatient(patientId))
    tasks.push(
      db
        .collection('base_schedules')
        .doc('MASTER_SCHEDULE')
        .update({
          [`schedule.${patientId}`]: FieldValue.delete(),
        }),
    )

    // 清理未來排程
    const todayStr = getTaipeiTodayString() // ✨ 使用統一函式
    const cleanupBatch = db.batch()
    let cleanupCount = 0
    const BATCH_SIZE = 450
    for (let i = 0; i <= 60; i++) {
      const targetDate = new Date(today)
      targetDate.setDate(targetDate.getDate() + i)
      const dateStr = formatDateToYYYYMMDD(targetDate)
      if (dateStr >= todayStr) {
        const scheduleRef = db.collection('schedules').doc(dateStr)
        const scheduleDoc = await scheduleRef.get()
        if (scheduleDoc.exists) {
          const schedule = scheduleDoc.data().schedule || {}
          const updates = {}
          for (const key in schedule) {
            if (schedule[key].patientId === patientId) {
              updates[`schedule.${key}`] = FieldValue.delete()
              cleanupCount++
            }
          }
          if (Object.keys(updates).length > 0) {
            cleanupBatch.update(scheduleRef, updates)
            if (cleanupCount >= BATCH_SIZE) {
              await cleanupBatch.commit()
              cleanupCount = 0
              cleanupBatch = db.batch()
            }
          }
        }
      }
    }
    if (cleanupCount > 0) {
      tasks.push(cleanupBatch.commit())
    }
  }
  // === 處理病人復原 ===
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
  // === 處理狀態轉換 ===
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
    if ((beforeData.status === 'ipd' || beforeData.status === 'er') && afterData.status === 'opd') {
      tasks.push(
        cleanupFuturePatientMetadata(patientId, {
          clearManualNote: true,
          clearTeams: true,
        }),
      )
      if (afterData.wardNumber) {
        tasks.push(event.data.after.ref.update({ wardNumber: null }))
      }
    }
  }

  // === 一般資料更新（不記錄歷史） ===
  if (!historyWritten) {
    if (beforeData && afterData) {
      if (beforeData.freq !== afterData.freq && afterData.freq) {
        tasks.push(
          db
            .collection('base_schedules')
            .doc('MASTER_SCHEDULE')
            .update({
              [`schedule.${patientId}.freq`]: afterData.freq,
            }),
        )
      }
    }
  }

  // === 執行所有任務 ===
  if (tasks.length > 0) {
    try {
      await Promise.all(tasks)
      logger.info(`✅ Successfully executed ${tasks.length} tasks for patient ${patientId}.`)
    } catch (error) {
      logger.error(`❌ Error executing tasks for patient ${patientId}:`, error)
      await db.collection('error_logs').add({
        function: 'onPatientDataChange',
        patientId: patientId,
        error: error.message,
        stack: error.stack,
        timestamp: FieldValue.serverTimestamp(),
      })
    }
  }
  return null
})

// ===================================================================
// 排程函式 (Scheduled Functions)
// ===================================================================
exports.checkExpiredTasks = onSchedule(
  { schedule: 'every day 02:00', timeZone: 'Asia/Taipei', timeoutSeconds: 300 },
  async (event) => {
    logger.info('[Scheduler] Running daily check for expired tasks (messages)...')
    const todayStr = getTaipeiTodayString() // ✨ 使用統一函式
    try {
      const query = db
        .collection('tasks')
        .where('status', '==', 'pending')
        .where('category', '==', 'message')
        .where('targetDate', '>=', '1970-01-01')
        .where('targetDate', '<', todayStr)

      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('[Scheduler] No expired tasks (messages) with valid targetDate found.')
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
    const today = getTaipeiNow() // ✨ 使用統一函式
    const datesToCheck = Array.from({ length: 60 }, (_, i) => {
      const targetDate = new Date(today) // ✨ 從正確的起點複製
      targetDate.setDate(today.getDate() + i)
      return formatDateToYYYYMMDD(targetDate) // ✨ 使用統一函式
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
// 可呼叫函式 (Callable Functions) - ✨ 全面加入 CORS 設定 ✨
// ===================================================================
exports.customLogin = onCall({ cors: allowedOrigins }, async (request) => {
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

exports.changeUserPassword = onCall({ cors: allowedOrigins }, async (request) => {
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
  { cors: allowedOrigins, timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '使用者未登入，無法執行此操作。')
    }

    logger.info(
      `🚀 [ensureFutureSchedules] 由使用者 ${request.auth.uid} 觸發，開始檢查未來60天排程...`,
    )

    const schedulesRef = db.collection('schedules')
    const today = getTaipeiNow() // ✨ 使用統一函式
    const datesToCheck = []

    for (let i = 0; i < 60; i++) {
      const targetDate = new Date(today) // ✨ 從正確的起點複製
      targetDate.setDate(today.getDate() + i)
      datesToCheck.push(formatDateToYYYYMMDD(targetDate)) // ✨ 使用統一函式
    }

    try {
      // 載入總表規則
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      const masterRules = masterScheduleDoc.exists ? masterScheduleDoc.data().schedule || {} : {}

      // 分批查詢現有排程（Firestore in 查詢限制30個）
      const existingDates = new Set()
      for (let i = 0; i < datesToCheck.length; i += 30) {
        const chunk = datesToCheck.slice(i, i + 30)
        const snapshot = await schedulesRef.where('date', 'in', chunk).get()
        snapshot.forEach((doc) => existingDates.add(doc.data().date))
      }

      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('✅ [ensureFutureSchedules] 所有未來60天排程均已存在。')
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
          syncMethod: 'initial_create',
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

/**
 * 儲存護理師月班表 - 完整掃描版（避免重複）
 */
exports.saveNursingSchedule = onCall({ cors: allowedOrigins }, async (request) => {
  // 1. 安全性檢查
  if (!request.auth || request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', '此操作需要管理員權限。')
  }

  // 2. 驗證傳入的檔案內容
  if (!request.data.fileContentBase64 || !request.data.fileName) {
    throw new HttpsError('invalid-argument', '缺少檔案內容或檔名。')
  }

  logger.log(`由使用者 ${request.auth.uid} 開始處理班表檔案: ${request.data.fileName}`)

  try {
    const db = admin.firestore()

    // 3. 解析 Excel
    const fileBuffer = Buffer.from(request.data.fileContentBase64, 'base64')
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

    logger.log(`Excel 解析完成，共 ${jsonData.length} 行資料`)

    // 4. 驗證資料完整性
    if (!jsonData || jsonData.length < 5) {
      throw new Error('Excel 檔案內容不足，請確認檔案格式正確')
    }

    // 5. 解析標題取得年月
    let title = ''
    let year, month, yearMonth

    for (let i = 0; i < Math.min(jsonData.length, 5); i++) {
      const cell = jsonData[i][0]
      if (cell && typeof cell === 'string') {
        const match = cell.match(/(\d{3})年(\d{1,2})月/)
        if (match) {
          title = cell
          year = parseInt(match[1], 10) + 1911
          month = String(match[2]).padStart(2, '0')
          yearMonth = `${year}-${month}`
          logger.log(`找到標題: ${title}, 解析年月: ${yearMonth}`)
          break
        }
      }
    }

    if (!yearMonth) {
      throw new Error('無法在 Excel 中找到有效的年月標題')
    }

    // 6. 取得該月份的總天數
    const maxDaysInMonth = new Date(year, parseInt(month, 10), 0).getDate()
    logger.log(`${yearMonth} 共有 ${maxDaysInMonth} 天`)

    // 7. 獲取護理師資料（修改版 - 包含 username）
    const usersSnapshot = await db.collection('users').where('title', '==', '護理師').get()
    const nurseMap = new Map()
    const nurseDataMap = new Map() // 新增：儲存完整的護理師資料

    usersSnapshot.forEach((doc) => {
      const userData = doc.data()
      nurseMap.set(userData.name, doc.id)
      // 儲存完整資料，包含 username
      nurseDataMap.set(doc.id, {
        name: userData.name,
        username: userData.username || '',
      })
    })

    logger.log(`資料庫中有 ${nurseMap.size} 位護理師`)
    logger.log(`護理師名單: ${Array.from(nurseMap.keys()).join(', ')}`)

    // 8. 找護理師資料開始的行
    let nurseStartRow = -1

    for (let i = 2; i < Math.min(jsonData.length, 20); i++) {
      const firstCell = String(jsonData[i]?.[0] || '').trim()

      if (!firstCell) continue

      // 檢查是否為護理師名字
      for (const fullName of nurseMap.keys()) {
        if (fullName.endsWith(firstCell)) {
          nurseStartRow = i
          logger.log(`找到第一位護理師 "${firstCell}" 在第 ${i} 行`)
          break
        }
      }

      if (nurseStartRow !== -1) break
    }

    if (nurseStartRow === -1) {
      throw new Error('找不到護理師資料，請確認 Excel 格式')
    }

    // 9. 解析護理師班表 - 完整掃描所有行
    const scheduleByNurse = {}
    const scheduleByWeek = {}
    const processedNurses = new Set() // 記錄已處理的護理師，避免重複
    const processingOrder = [] // 新增：記錄 Excel 中的原始順序

    // 班別定義
    const EARLY_SHIFTS = ['74', '75', '84', '74/L', '816', '815', '7-3', '8-4', '7-5']
    const LATE_SHIFTS = ['3-11', '311']
    const REST_TYPES = ['休', '例', '例假', '國定', 'off', 'OFF', '例教']

    // 從找到的護理師行開始，掃描到檔案結尾
    for (let rowIndex = nurseStartRow; rowIndex < jsonData.length; rowIndex++) {
      const row = jsonData[rowIndex]
      if (!row || !row[0]) {
        continue // 跳過空行但繼續掃描
      }

      const nurseFirstName = String(row[0]).trim()

      // 跳過明確的無關行
      if (
        !nurseFirstName ||
        nurseFirstName.includes('COUNT') ||
        nurseFirstName.includes('合計') ||
        nurseFirstName.includes('總計') ||
        nurseFirstName === '例假' ||
        nurseFirstName.includes('備註')
      ) {
        logger.log(`跳過無關行: "${nurseFirstName}"`)
        continue
      }

      // 找對應的護理師
      let matchedFullName = null
      let matchedId = null
      for (const [fullName, id] of nurseMap.entries()) {
        if (fullName && fullName.endsWith(nurseFirstName)) {
          matchedFullName = fullName
          matchedId = id
          break
        }
      }

      if (!matchedFullName) {
        logger.log(`第 ${rowIndex} 行: 未匹配的名字 "${nurseFirstName}"`)
        continue // 繼續掃描下一行
      }

      // 檢查是否已處理過這個護理師
      if (processedNurses.has(matchedId)) {
        logger.warn(`第 ${rowIndex} 行: 護理師 "${matchedFullName}" 已經處理過，跳過重複資料`)
        continue
      }

      // 初始化整個月的班表陣列
      const shifts = new Array(maxDaysInMonth).fill('')

      // 直接從第二欄開始按順序抓取
      let workDays = 0
      let restDays = 0
      let emptyDays = 0

      for (let day = 1; day <= maxDaysInMonth; day++) {
        const columnIndex = day // 第1欄對應1號（第0欄是姓名）

        if (columnIndex < row.length) {
          const cellValue = row[columnIndex]
          const shift = String(cellValue || '').trim()

          if (shift) {
            shifts[day - 1] = shift

            // 統計班別類型
            if (REST_TYPES.some((r) => shift.includes(r))) {
              restDays++
            } else if (shift) {
              workDays++
            }
          } else {
            emptyDays++
          }
        } else {
          emptyDays++
        }
      }

      // 從 nurseDataMap 獲取完整資料（包含 username）
      const nurseData = nurseDataMap.get(matchedId)

      // 儲存護理師班表（修改版 - 包含 username 和原始順序）
      scheduleByNurse[matchedId] = {
        nurseName: matchedFullName,
        nurseUsername: nurseData?.username || '', // 新增：儲存員工編號
        orderIndex: processingOrder.length, // 新增：記錄原始順序
        shifts: shifts,
      }

      // 記錄處理順序
      processingOrder.push(matchedId)

      // 標記為已處理
      processedNurses.add(matchedId)

      logger.log(
        `✓ 處理護理師 ${matchedFullName} (ID: ${matchedId}, 員工編號: ${nurseData?.username || '無'})：` +
          `上班 ${workDays} 天，休息 ${restDays} 天，空白 ${emptyDays} 天`,
      )

      // 建立週班表
      shifts.forEach((shift, index) => {
        if (!shift) return

        const day = index + 1
        let type = null

        if (EARLY_SHIFTS.some((s) => shift.includes(s))) {
          type = 'early'
        } else if (LATE_SHIFTS.some((s) => shift.includes(s))) {
          type = 'late'
        }

        if (type) {
          const date = new Date(year, parseInt(month, 10) - 1, day)
          const dayOfWeek = (date.getDay() + 6) % 7
          const weekNumber = Math.ceil(day / 7)

          if (!scheduleByWeek[weekNumber]) {
            scheduleByWeek[weekNumber] = {}
          }
          if (!scheduleByWeek[weekNumber][dayOfWeek]) {
            scheduleByWeek[weekNumber][dayOfWeek] = { early: [], late: [] }
          }

          scheduleByWeek[weekNumber][dayOfWeek][type].push({
            id: matchedId,
            name: matchedFullName,
            username: nurseData?.username || '', // 新增：也在週班表中包含員工編號
            shift: shift,
          })
        }
      })
    }

    const processedCount = processedNurses.size

    if (processedCount === 0) {
      throw new Error('沒有找到任何可處理的護理師資料')
    }

    // 10. 寫入 Firestore
    const dataToSave = {
      title,
      yearMonth,
      maxDaysInMonth,
      scheduleByNurse,
      scheduleByWeek,
      processingOrder, // 新增：儲存原始順序
      lastUpdatedAt: FieldValue.serverTimestamp(),
      updatedBy: {
        uid: request.auth.uid,
        name: request.auth.token.name || '未知管理員',
      },
    }

    await db.collection('nursing_schedules').doc(yearMonth).set(dataToSave)

    const nurseList = Object.values(scheduleByNurse)
      .sort((a, b) => a.orderIndex - b.orderIndex) // 按原始順序排列
      .map((n) => n.nurseName)
      .join(', ')

    logger.log(
      `✅ 班表 ${yearMonth} 已成功儲存\n` +
        `   處理護理師數: ${processedCount}\n` +
        `   月份天數: ${maxDaysInMonth}\n` +
        `   護理師名單: ${nurseList}`,
    )

    return {
      success: true,
      message: `班表 ${yearMonth} 已成功儲存，包含 ${processedCount} 位護理師的完整資料。`,
      stats: {
        month: yearMonth,
        nurseCount: processedCount,
        daysInMonth: maxDaysInMonth,
        nurses: nurseList,
      },
    }
  } catch (error) {
    logger.error('儲存護理班表失敗:', error)
    throw new HttpsError('internal', error.message || '儲存班表時發生未預期的錯誤。')
  }
})

// ===================================================================
// 串接google drive
// ===================================================================
/**
 * 【超簡化最終版】取得 Google API 的授權客戶端。
 * 直接使用開發人員的 OAuth 2.0 憑證進行授權。
 * @returns {Promise<object>} Authorized Google Auth client.
 */
async function getGoogleAuthClient() {
  // 從環境變數讀取 OAuth 2.0 憑證
  const clientId = process.env.GDRIVE_CLIENT_ID
  const clientSecret = process.env.GDRIVE_CLIENT_SECRET
  const refreshToken = process.env.GDRIVE_REFRESH_TOKEN

  if (!clientId || !clientSecret || !refreshToken) {
    logger.error('Missing Google Drive OAuth 2.0 credentials in environment variables.')
    throw new Error('Server configuration error for Google Drive access.')
  }

  // 建立 OAuth2 客戶端
  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    'https://developers.google.com/oauthplayground', // 重新導向 URI 必須與設定時一致
  )

  // 設定 Refresh Token，客戶端會自動用它來獲取 Access Token
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  logger.info(`Successfully created OAuth2 client for user.`)
  return oauth2Client
}

/**
 * (新輔助函式) 在指定的父資料夾中，尋找或建立一個子資料夾。
 * @param {object} drive - 已授權的 Google Drive API 實例。
 * @param {string} folderName - 要尋找或建立的子資料夾名稱。
 * @param {string} parentFolderId - 父資料夾的 ID。
 * @returns {Promise<string>} 子資料夾的 ID。
 */
async function findOrCreateFolder(drive, folderName, parentFolderId) {
  // 1. 建立搜尋查詢
  const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${parentFolderId}' in parents and trashed=false`

  // 2. 執行搜尋
  const response = await drive.files.list({
    q: query,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })

  // 3. 判斷結果
  if (response.data.files && response.data.files.length > 0) {
    // 如果找到了，直接回傳第一個匹配項的 ID
    const existingFolderId = response.data.files[0].id
    logger.info(`Found existing folder: "${folderName}" (ID: ${existingFolderId})`)
    return existingFolderId
  } else {
    // 如果沒找到，就建立一個新的
    logger.info(`Folder "${folderName}" not found. Creating new one...`)
    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    }
    const newFolder = await drive.files.create({
      resource: fileMetadata,
      fields: 'id',
      supportsAllDrives: true,
    })
    const newFolderId = newFolder.data.id
    logger.info(`Successfully created new folder: "${folderName}" (ID: ${newFolderId})`)
    return newFolderId
  }
}

//------------------------------------------------------------------
/**
 * 【可呼叫函式 - 最終統一版】上傳檔案到 Google Drive 中指定的路徑。
 * 此函式會自動遞迴地尋找或建立 targetPath 中定義的子資料夾結構。
 */
/**
 * 【可呼叫函式 - 最終簡化版】上傳檔案到 Google Drive 中指定的路徑。
 * 此函式會自動遞迴地尋找或建立 targetPath 中定義的子資料夾結構。
 */
exports.uploadFile = onCall({ cors: allowedOrigins }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '您必須登入才能上傳檔案。')
  }

  const { fileName, fileContentBase64, mimeType, targetPath } = request.data

  if (
    !fileName ||
    !fileContentBase64 ||
    !mimeType ||
    !Array.isArray(targetPath) ||
    targetPath.length === 0
  ) {
    throw new HttpsError('invalid-argument', '請求中缺少必要的檔案資訊或目標路徑 (targetPath)。')
  }

  try {
    // 取得代表目標 Google 帳號的授權
    const auth = await getGoogleAuthClient()
    const drive = google.drive({ version: 'v3', auth })

    // 1. 遞迴地尋找或建立資料夾結構
    let currentParentFolderId = SHARED_DRIVE_FOLDER_ID // 從對應環境的共享根目錄開始
    for (const folderName of targetPath) {
      // 依序尋找或建立路徑中的每一個資料夾
      currentParentFolderId = await findOrCreateFolder(drive, folderName, currentParentFolderId)
    }

    // 最終得到的 currentParentFolderId 就是我們要上傳檔案的目標位置
    const finalTargetFolderId = currentParentFolderId
    logger.info(`Final target folder ID for upload: ${finalTargetFolderId}`)

    // 2. 準備並上傳檔案
    const fileBuffer = Buffer.from(fileContentBase64, 'base64')
    const bufferStream = new stream.PassThrough()
    bufferStream.end(fileBuffer)

    const fileMetadata = {
      name: fileName,
      parents: [finalTargetFolderId],
    }

    const media = {
      mimeType: mimeType,
      body: bufferStream,
    }

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink',
      supportsAllDrives: true, // 保留此參數是好的實踐
    })

    const fileData = response.data
    logger.info(
      `File uploaded successfully to path "${targetPath.join('/')}": ${fileData.name} (ID: ${fileData.id})`,
    )

    // 所有權轉移的邏輯已移除，因為 Refresh Token 的所有者就是檔案的所有者，不再需要轉移。

    return {
      success: true,
      message: `檔案成功上傳至 [${targetPath.join(' / ')}]！`,
      file: {
        id: fileData.id,
        name: fileData.name,
        viewLink: fileData.webViewLink,
        downloadLink: fileData.webContentLink,
      },
    }
  } catch (error) {
    logger.error('Error uploading file to Google Drive:', error)
    throw new HttpsError('internal', '上傳檔案至 Google Drive 時發生錯誤。', error.message)
  }
})

//------------------------------------------------------------------
/**
 * 【新增的可呼叫函式 - 最終修正版 v2.2】根據指定的路徑，在 Google Drive 中搜尋檔案。
 */
exports.getDriveFiles = onCall({ cors: allowedOrigins }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '您必須登入才能查詢檔案。')
  }

  const { targetPath } = request.data
  if (!Array.isArray(targetPath) || targetPath.length === 0) {
    throw new HttpsError('invalid-argument', '請求中缺少目標路徑 (targetPath)。')
  }

  try {
    const auth = await getGoogleAuthClient()
    const drive = google.drive({ version: 'v3', auth })

    // 1. 遞迴找到最終的目標資料夾 ID
    let currentParentFolderId = SHARED_DRIVE_FOLDER_ID
    for (const folderName of targetPath) {
      const query = `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and '${currentParentFolderId}' in parents and trashed=false`
      const response = await drive.files.list({
        q: query,
        fields: 'files(id)',
        supportsAllDrives: true,
        // ✨ --- [核心修正 1] 必須加入此參數才能在共享雲端硬碟中搜尋 --- ✨
        includeItemsFromAllDrives: true,
      })

      if (response.data.files && response.data.files.length > 0) {
        currentParentFolderId = response.data.files[0].id
      } else {
        logger.info(`查詢路徑 ${targetPath.join('/')} 時，找不到資料夾 ${folderName}。`)
        return { success: true, files: [] }
      }
    }
    const finalTargetFolderId = currentParentFolderId

    // 2. 在最終的資料夾中搜尋所有檔案
    const fileQuery = `'${finalTargetFolderId}' in parents and trashed = false`
    const response = await drive.files.list({
      q: fileQuery,
      fields: 'files(id, name, thumbnailLink, webViewLink, createdTime, iconLink)',
      orderBy: 'createdTime desc',
      pageSize: 50,
      supportsAllDrives: true,
      // ✨ --- [核心修正 2] 這裡同樣需要加入此參數 --- ✨
      includeItemsFromAllDrives: true,
    })

    // ✨ --- [健壯性改進] 確保即使 API 回應沒有 files 屬性也不會出錯 --- ✨
    const files = response.data.files || []
    logger.info(`Found ${files.length} files in path: ${targetPath.join('/')}`)

    return {
      success: true,
      files: files,
    }
  } catch (error) {
    logger.error(`Error searching files in Google Drive for path ${targetPath.join('/')}:`, error)
    throw new HttpsError('internal', '在 Google Drive 中搜尋檔案時發生錯誤。', error.message)
  }
})

// ===================================================================
// 自動備份輔助函式 (如果您的檔案中已有，請勿重複添加)
// ===================================================================
const XLSX = require('xlsx') // 確保在檔案頂部引入

/**
 * 在指定的 Google Drive 資料夾中尋找特定名稱的檔案並刪除。
 * @param {object} drive - 已授權的 Google Drive API 實例。
 * @param {string} fileName - 要尋找並刪除的檔案名稱。
 * @param {string} parentFolderId - 檔案所在的父資料夾 ID。
 * @returns {Promise<boolean>} 是否成功刪除。
 */
async function findAndDeleteFile(drive, fileName, parentFolderId) {
  try {
    const query = `'${parentFolderId}' in parents and name = '${fileName}' and trashed = false`
    const res = await drive.files.list({
      q: query,
      fields: 'files(id, name)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })

    if (res.data.files && res.data.files.length > 0) {
      const fileId = res.data.files[0].id
      logger.info(`[Backup] Found old pre-backup file "${fileName}" (ID: ${fileId}). Deleting...`)
      await drive.files.delete({
        fileId: fileId,
        supportsAllDrives: true,
      })
      logger.info(`[Backup] Successfully deleted old pre-backup file.`)
      return true
    } else {
      logger.info(`[Backup] No old pre-backup file named "${fileName}" found to delete.`)
      return false
    }
  } catch (error) {
    logger.error(`[Backup] Error during findAndDeleteFile for "${fileName}":`, error)
    return false
  }
}

/**
 * 將 Buffer 內容上傳到 Google Drive 的指定路徑。
 * @param {object} drive - 已授權的 Google Drive API 實例。
 * @param {Buffer} fileBuffer - 檔案的 Buffer 內容。
 * @param {string} fileName - 檔案名稱。
 * @param {string} mimeType - 檔案的 MIME 類型。
 * @param {Array<string>} targetPath - 目標路徑陣列，例如 ['資料備份', '2025 年']。
 */
async function uploadBufferToDrive(drive, fileBuffer, fileName, mimeType, targetPath) {
  let currentParentFolderId = SHARED_DRIVE_FOLDER_ID
  for (const folderName of targetPath) {
    currentParentFolderId = await findOrCreateFolder(drive, folderName, currentParentFolderId)
  }

  const bufferStream = new stream.PassThrough()
  bufferStream.end(fileBuffer)

  const fileMetadata = { name: fileName, parents: [currentParentFolderId] }
  const media = { mimeType: mimeType, body: bufferStream }

  await drive.files.create({
    resource: fileMetadata,
    media: media,
    fields: 'id',
    supportsAllDrives: true,
  })
  logger.info(`[Backup] Successfully uploaded "${fileName}" to Google Drive.`)
}

/**
 * [後端版 effectiveStatsData]
 * 根據排班、分組、病人資料，產生用於統計和匯出的結構化護理分組資料。
 * @param {object} schedule - 當日的排班資料 (來自 schedules 集合)
 * @param {object} teams - 當日的護理師分組資料 (來自 nurse_assignments 集合的 teams 欄位)
 * @param {object} names - 當日的護理師姓名指派 (來自 nurse_assignments 集合的 names 欄位)
 * @param {Map<string, object>} patientMap - 病人資料的 Map
 * @returns {object} - 包含 early, late, lateTakeOff 分組的完整資料物件
 */
function generateAssignmentsData(schedule, teams, names, patientMap) {
  // --- 在函式內部定義常數，使其自給自足 ---
  const SHIFT_CODES = { EARLY: 'early', NOON: 'noon', LATE: 'late' }
  const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍', '未分組']
  const earlyTeams = baseTeams.map((t) => `早${t}`)
  const lateTeams = baseTeams.map((t) => `晚${t}`)
  const lateTakeOffTeams = baseTeams.map((t) => `夜間收針${t}`)

  const createTeamStats = (teamList, shiftType) => {
    const stats = {}
    teamList.forEach((team) => {
      stats[team] = {
        nurseName: names?.[team] || '',
        totalOpdCount: 0,
        totalIpdCount: 0,
        totalErCount: 0,
      }
      if (shiftType === 'early') {
        stats[team].earlyShift = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].noonShiftOn = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].noonShiftOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      } else if (shiftType === 'late') {
        stats[team].noonShiftOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
        stats[team].lateShift = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      } else if (shiftType === 'lateTakeOff') {
        stats[team].lateShiftTakeOff = { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 }
      }
    })
    return stats
  }

  const stats = {
    early: createTeamStats(earlyTeams, 'early'),
    late: createTeamStats(lateTeams, 'late'),
    lateTakeOff: createTeamStats(lateTakeOffTeams, 'lateTakeOff'),
  }

  for (const shiftId in schedule) {
    const slot = schedule[shiftId]
    if (!slot || !slot.patientId) continue

    const patientDetails = patientMap.get(slot.patientId)
    if (!patientDetails) continue

    const detail = {
      id: slot.patientId,
      shiftId,
      name: patientDetails.name,
      status: patientDetails.status,
      dialysisBed: shiftId.startsWith('peripheral') ? '外圍' : shiftId.split('-')[1] || '',
      finalTags: `${slot.autoNote || ''} ${slot.manualNote || ''}`.trim(),
    }

    const assignAndCount = (group, pDetail) => {
      if (!group) return
      group.patients.push(pDetail)
      if (pDetail.status === 'ipd') group.ipdCount++
      else if (pDetail.status === 'er') group.erCount++
      else group.opdCount++
    }

    const shiftCode = shiftId.split('-')[2]
    const teamKey = `${slot.patientId}-${shiftCode}`
    const teamInfo = teams[teamKey] || {}

    if (shiftCode === SHIFT_CODES.EARLY) {
      const targetTeam = teamInfo.nurseTeam || '早未分組'
      if (stats.early[targetTeam]) assignAndCount(stats.early[targetTeam].earlyShift, detail)
    } else if (shiftCode === SHIFT_CODES.LATE) {
      const targetTeam = teamInfo.nurseTeam || '晚未分組'
      if (stats.late[targetTeam]) assignAndCount(stats.late[targetTeam].lateShift, detail)

      const targetTakeOffTeam = teamInfo.nurseTeamTakeOff || '夜間收針未分組'
      if (stats.lateTakeOff[targetTakeOffTeam])
        assignAndCount(stats.lateTakeOff[targetTakeOffTeam].lateShiftTakeOff, detail)
    } else if (shiftCode === SHIFT_CODES.NOON) {
      const targetInTeam = teamInfo.nurseTeamIn || '早未分組'
      if (stats.early[targetInTeam]) assignAndCount(stats.early[targetInTeam].noonShiftOn, detail)

      const targetOutTeam = teamInfo.nurseTeamOut || '晚未分組'
      if (stats.late[targetOutTeam]) assignAndCount(stats.late[targetOutTeam].noonShiftOff, detail)
    }
  }

  // 計算總人數
  Object.values(stats).forEach((shiftGroup) => {
    for (const team in shiftGroup) {
      const teamData = shiftGroup[team]
      if (!teamData) continue
      teamData.totalOpdCount = Object.values(teamData).reduce(
        (sum, part) => sum + (part.opdCount || 0),
        0,
      )
      teamData.totalIpdCount = Object.values(teamData).reduce(
        (sum, part) => sum + (part.ipdCount || 0),
        0,
      )
      teamData.totalErCount = Object.values(teamData).reduce(
        (sum, part) => sum + (part.erCount || 0),
        0,
      )
    }
  })

  return stats
}

/**
 * 根據處理好的護理分組資料，產生 Excel 檔案的 Buffer。
 * @param {object} statsData - 從 generateAssignmentsData 函式得到的資料
 * @param {object} names - 護理師姓名指派
 * @returns {Buffer|null} Excel 檔案的 Buffer，或在無資料時返回 null
 */
function generateAssignmentsExcelBuffer(statsData, names) {
  if (!statsData) return null

  const aoa = []
  const formatPatientCell = (patients) => {
    if (!patients || patients.length === 0) return ''
    return patients
      .map((p) => `${p.dialysisBed} - ${p.name} ${p.finalTags ? '(' + p.finalTags + ')' : ''}`)
      .join('\n')
  }
  const formatCountCell = (teamData) =>
    `門${teamData?.totalOpdCount || 0} 住${teamData?.totalIpdCount || 0} 急${teamData?.totalErCount || 0}`

  // --- 早班 ---
  const sortedEarlyTeams = Object.keys(statsData.early).sort((a, b) => a.localeCompare(b))
  aoa.push(['早班', ...sortedEarlyTeams.map((name) => name.replace('早', '') + '組')])
  aoa.push(['姓名', ...sortedEarlyTeams.map((name) => names[name] || '-- 未指派 --')])
  aoa.push([
    '早班',
    ...sortedEarlyTeams.map((name) =>
      formatPatientCell(statsData.early[name]?.earlyShift.patients),
    ),
  ])
  aoa.push([
    '午班(上針)',
    ...sortedEarlyTeams.map((name) =>
      formatPatientCell(statsData.early[name]?.noonShiftOn.patients),
    ),
  ])
  aoa.push([
    '午班(收針)',
    ...sortedEarlyTeams.map((name) =>
      formatPatientCell(statsData.early[name]?.noonShiftOff.patients),
    ),
  ])
  aoa.push(['照護人數', ...sortedEarlyTeams.map((name) => formatCountCell(statsData.early[name]))])

  aoa.push([]) // 分隔

  // --- 晚班 ---
  const sortedLateTeams = Object.keys(statsData.late).sort((a, b) => a.localeCompare(b))
  aoa.push(['晚班', ...sortedLateTeams.map((name) => name.replace('晚', '') + '組')])
  aoa.push(['姓名', ...sortedLateTeams.map((name) => names[name] || '-- 未指派 --')])
  aoa.push([
    '午班(收針)',
    ...sortedLateTeams.map((name) =>
      formatPatientCell(statsData.late[name]?.noonShiftOff.patients),
    ),
  ])
  aoa.push([
    '晚班',
    ...sortedLateTeams.map((name) => formatPatientCell(statsData.late[name]?.lateShift.patients)),
  ])
  aoa.push(['照護人數', ...sortedLateTeams.map((name) => formatCountCell(statsData.late[name]))])

  // --- 夜班收針 (如果存在) ---
  const lateTakeOffTeams = Object.keys(statsData.lateTakeOff).filter(
    (t) =>
      statsData.lateTakeOff[t].totalOpdCount +
        statsData.lateTakeOff[t].totalIpdCount +
        statsData.lateTakeOff[t].totalErCount >
      0,
  )
  if (lateTakeOffTeams.length > 0) {
    aoa.push([]) // 分隔
    const sortedTakeoffTeams = lateTakeOffTeams.sort((a, b) => a.localeCompare(b))
    aoa.push(['夜班收針', ...sortedTakeoffTeams.map((name) => name.replace('夜間收針', '') + '組')])
    aoa.push(['姓名', ...sortedTakeoffTeams.map((name) => names[name] || '-- 未指派 --')])
    aoa.push([
      '夜班收針',
      ...sortedTakeoffTeams.map((name) =>
        formatPatientCell(statsData.lateTakeOff[name]?.lateShiftTakeOff.patients),
      ),
    ])
    aoa.push([
      '照護人數',
      ...sortedTakeoffTeams.map((name) => formatCountCell(statsData.lateTakeOff[name])),
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const colWidths = [
    { wch: 12 },
    ...Array(Math.max(sortedEarlyTeams.length, sortedLateTeams.length)).fill({ wch: 25 }),
  ]
  ws['!cols'] = colWidths
  // ... (可以添加更多樣式設定) ...

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '護理分組表')
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
}

// ===================================================================
// ✨ 每日自動資料備份 (Excel) ✨
// ===================================================================
exports.scheduledDataBackup = onSchedule(
  {
    schedule: '30 23 * * *', // 每日 23:30
    timeZone: 'Asia/Taipei',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('[Backup] Starting scheduled Excel data backup to Google Drive...')

    try {
      const auth = await getGoogleAuthClient()
      const drive = google.drive({ version: 'v3', auth })

      // --- 1. 準備日期和資料夾路徑 ---
      // ✨ 只需要呼叫一次 getTaipeiNow() 作為所有日期計算的基準
      const today = getTaipeiNow()

      // 產生明天日期的 Date 物件
      const tomorrow = new Date(today)
      tomorrow.setDate(today.getDate() + 1)

      // 格式化今天和明天的日期字串
      const todayStr = getTaipeiTodayString()
      const tomorrowStr = formatDateToYYYYMMDD(tomorrow)

      // 取得年份和月份字串 (用於資料夾路徑)
      // 直接從 today 物件取得，並確保月份是 1-12 且有補零
      const yearForPath = today.getFullYear()
      const monthForPath = (today.getMonth() + 1).toString().padStart(2, '0')
      const targetPath = ['資料備份', `${yearForPath} 年`, `${monthForPath} 月`]

      // --- 2. 刪除前一天為今天建立的預備檔 ---
      const oldPreBackupScheduleName = `${todayStr}_Schedule_PREBACKUP.xlsx`
      const oldPreBackupAssignmentsName = `${todayStr}_Assignments_PREBACKUP.xlsx`

      let parentFolderId = SHARED_DRIVE_FOLDER_ID
      for (const folderName of targetPath) {
        parentFolderId = await findOrCreateFolder(drive, folderName, parentFolderId)
      }
      await findAndDeleteFile(drive, oldPreBackupScheduleName, parentFolderId)
      await findAndDeleteFile(drive, oldPreBackupAssignmentsName, parentFolderId)

      // --- 3. 獲取所有需要的資料 ---
      const [
        patientsSnapshot,
        todayScheduleDoc,
        tomorrowScheduleDoc,
        todayAssignmentsDoc,
        tomorrowAssignmentsDoc,
        masterScheduleDoc,
      ] = await Promise.all([
        db.collection('patients').get(),
        db.collection('schedules').doc(todayStr).get(),
        db.collection('schedules').doc(tomorrowStr).get(),
        db.collection('nurse_assignments').doc(todayStr).get(),
        db.collection('nurse_assignments').doc(tomorrowStr).get(),
        db.collection('base_schedules').doc('MASTER_SCHEDULE').get(),
      ])

      const patientMap = new Map(patientsSnapshot.docs.map((doc) => [doc.id, doc.data()]))
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

      // --- 4. 備份「每日排程」 ---
      const generateScheduleExcel = (scheduleDoc, dateStr) => {
        if (!scheduleDoc.exists) return null
        const scheduleData = scheduleDoc.data().schedule || {}
        const aoa = [['床號', '班別', '姓名', '病歷號', '狀態', '手動備註', '自動備註']]
        for (const shiftId in scheduleData) {
          const slot = scheduleData[shiftId]
          const patient = patientMap.get(slot.patientId)
          if (patient) {
            const parts = shiftId.split('-')
            const type = parts[0]
            const bedNum = parts[1]
            const shift = parts[2]
            aoa.push([
              type === 'peripheral' ? `外圍${bedNum}` : bedNum,
              shift,
              patient.name,
              patient.medicalRecordNumber,
              patient.status,
              slot.manualNote || '',
              slot.autoNote || '',
            ])
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!cols'] = [
          { wch: 10 },
          { wch: 10 },
          { wch: 12 },
          { wch: 12 },
          { wch: 10 },
          { wch: 20 },
          { wch: 20 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `排程 ${dateStr}`)
        return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
      }

      const todayScheduleBuffer = generateScheduleExcel(todayScheduleDoc, todayStr)
      if (todayScheduleBuffer) {
        await uploadBufferToDrive(
          drive,
          todayScheduleBuffer,
          `${todayStr}_Schedule.xlsx`,
          mimeType,
          targetPath,
        )
      }
      const tomorrowScheduleBuffer = generateScheduleExcel(tomorrowScheduleDoc, tomorrowStr)
      if (tomorrowScheduleBuffer) {
        await uploadBufferToDrive(
          drive,
          tomorrowScheduleBuffer,
          `${tomorrowStr}_Schedule_PREBACKUP.xlsx`,
          mimeType,
          targetPath,
        )
      }

      // --- 5. ✨ 備份「護理分組」(使用新函式) ✨ ---
      const processAndUploadAssignments = async (
        assignmentsDoc,
        scheduleDoc,
        dateStr,
        isPreBackup = false,
      ) => {
        if (!assignmentsDoc.exists || !scheduleDoc.exists) return
        const assignmentsData = assignmentsDoc.data()
        const scheduleData = scheduleDoc.data().schedule || {}

        const processedData = generateAssignmentsData(
          scheduleData,
          assignmentsData.teams || {},
          assignmentsData.names || {},
          patientMap,
        )
        const excelBuffer = generateAssignmentsExcelBuffer(
          processedData,
          assignmentsData.names || {},
        )

        if (excelBuffer) {
          const fileName = isPreBackup
            ? `${dateStr}_Assignments_PREBACKUP.xlsx`
            : `${dateStr}_Assignments.xlsx`
          await uploadBufferToDrive(drive, excelBuffer, fileName, mimeType, targetPath)
        }
      }

      await processAndUploadAssignments(todayAssignmentsDoc, todayScheduleDoc, todayStr, false)
      await processAndUploadAssignments(
        tomorrowAssignmentsDoc,
        tomorrowScheduleDoc,
        tomorrowStr,
        true,
      )

      // --- 6. 備份「床位總表」 ---
      if (masterScheduleDoc.exists) {
        const masterScheduleData = masterScheduleDoc.data().schedule || {}
        const aoa = [['姓名', '病歷號', '狀態', '頻率', '床號', '班別', '手動備註', '自動備註']]
        const shiftMap = { 0: '早班', 1: '午班', 2: '晚班' }
        for (const patientId in masterScheduleData) {
          const rule = masterScheduleData[patientId]
          const patient = patientMap.get(patientId)
          if (patient) {
            aoa.push([
              patient.name,
              patient.medicalRecordNumber,
              patient.status,
              rule.freq,
              rule.bedNum,
              shiftMap[rule.shiftIndex] || '未知',
              rule.manualNote || '',
              rule.autoNote || '',
            ])
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa)
        ws['!cols'] = [
          { wch: 12 },
          { wch: 12 },
          { wch: 10 },
          { wch: 12 },
          { wch: 10 },
          { wch: 10 },
          { wch: 25 },
          { wch: 25 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, '總床位表')
        const masterScheduleBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })
        await uploadBufferToDrive(
          drive,
          masterScheduleBuffer,
          `${todayStr}_MasterSchedule.xlsx`,
          mimeType,
          targetPath,
        )
      }

      logger.info('[Backup] Scheduled Excel data backup to Google Drive completed successfully.')
    } catch (error) {
      logger.error('[Backup] Scheduled Excel data backup failed:', error)
    }
  },
)

// ===================================================================
// 🔥 智慧同步總表 - 完整版（不需要 reapplyAllExceptionsInternal）
// ===================================================================
exports.syncMasterScheduleToFuture = onDocumentWritten(
  {
    document: 'base_schedules/MASTER_SCHEDULE',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (event) => {
    logger.info('🚀 [SmartSync-v4] 智慧同步流程啟動')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }

    try {
      const beforeRules = event.data.before?.data()?.schedule || {}
      const afterRules = event.data.after.data().schedule || {}

      // 分析變更
      const changes = {
        added: [],
        modified: [],
        deleted: [],
      }

      // 找出新增和修改的規則
      for (const patientId in afterRules) {
        if (!beforeRules[patientId]) {
          changes.added.push({
            id: patientId,
            rule: afterRules[patientId],
          })
        } else if (
          JSON.stringify(beforeRules[patientId]) !== JSON.stringify(afterRules[patientId])
        ) {
          changes.modified.push({
            id: patientId,
            before: beforeRules[patientId],
            after: afterRules[patientId],
          })
        }
      }

      // 找出刪除的規則
      for (const patientId in beforeRules) {
        if (!afterRules[patientId]) {
          changes.deleted.push({
            id: patientId,
            rule: beforeRules[patientId],
          })
        }
      }

      logger.info(
        `[SmartSync-v4] 變更分析：新增 ${changes.added.length}，修改 ${changes.modified.length}，刪除 ${changes.deleted.length}`,
      )

      // 如果沒有變更，直接返回
      if (
        changes.added.length === 0 &&
        changes.modified.length === 0 &&
        changes.deleted.length === 0
      ) {
        logger.info('[SmartSync-v4] 無變更，跳過同步')
        return null
      }

      // 收集所有遇到的衝突調班
      const conflictedExceptions = []

      // 處理未來60天
      const today = getTaipeiNow() // 使用 getTaipeiNow() 取得台北時區的 Date 物件
      today.setHours(0, 0, 0, 0) // 將時間設為台北時區的凌晨

      for (let i = 1; i <= 60; i++) {
        // 從一個正確的台北時區 Date 物件開始計算
        const targetDate = new Date(today)
        targetDate.setDate(today.getDate() + i)

        const dateStr = formatDateToYYYYMMDD(targetDate)
        const dayOfWeek = targetDate.getDay() // getDay() 在任何時區下對於同一個 Date 物件的結果是一致的
        const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

        // 使用 transaction 確保原子性操作
        await db.runTransaction(async (transaction) => {
          const scheduleRef = db.collection('schedules').doc(dateStr)
          const scheduleDoc = await transaction.get(scheduleRef)
          const currentSchedule = scheduleDoc.exists ? scheduleDoc.data().schedule || {} : {}
          let finalSchedule = { ...currentSchedule }
          let hasChanges = false

          // 處理刪除的規則
          for (const deleted of changes.deleted) {
            const freqDays = FREQ_MAP_TO_DAY_INDEX[deleted.rule.freq] || []
            if (freqDays.includes(systemDayIndex)) {
              const key = getScheduleKey(deleted.rule.bedNum, SHIFTS[deleted.rule.shiftIndex])

              // 只刪除非調班產生的排程
              if (
                finalSchedule[key] &&
                finalSchedule[key].patientId === deleted.id &&
                !finalSchedule[key].exceptionId
              ) {
                delete finalSchedule[key]
                hasChanges = true
                logger.info(`  └─ 刪除 ${dateStr} 的 ${key} (病人: ${deleted.rule.patientName})`)
              }
            }
          }

          // 處理修改的規則
          for (const modified of changes.modified) {
            const beforeRule = modified.before
            const afterRule = modified.after

            // 先清理舊位置（如果位置有變）
            const beforeFreqDays = FREQ_MAP_TO_DAY_INDEX[beforeRule.freq] || []
            if (beforeFreqDays.includes(systemDayIndex)) {
              const oldKey = getScheduleKey(beforeRule.bedNum, SHIFTS[beforeRule.shiftIndex])

              if (
                finalSchedule[oldKey] &&
                finalSchedule[oldKey].patientId === modified.id &&
                !finalSchedule[oldKey].exceptionId
              ) {
                delete finalSchedule[oldKey]
                hasChanges = true
              }
            }

            // 新增到新位置
            const afterFreqDays = FREQ_MAP_TO_DAY_INDEX[afterRule.freq] || []
            if (afterFreqDays.includes(systemDayIndex)) {
              const newKey = getScheduleKey(afterRule.bedNum, SHIFTS[afterRule.shiftIndex])

              // 檢查新位置是否被調班佔用
              if (finalSchedule[newKey] && finalSchedule[newKey].exceptionId) {
                // 收集衝突資訊
                conflictedExceptions.push({
                  exceptionId: finalSchedule[newKey].exceptionId,
                  date: dateStr,
                  position: newKey,
                  conflictWith: {
                    patientId: modified.id,
                    patientName: afterRule.patientName,
                  },
                })
                logger.warn(`  └─ ⚠️ 衝突：${dateStr} ${newKey} 調班將被新規則取代`)
              }

              // 無論是否有調班，都套用新規則（總表優先）
              finalSchedule[newKey] = {
                patientId: modified.id,
                patientName: afterRule.patientName || '',
                shiftId: SHIFTS[afterRule.shiftIndex],
                autoNote: afterRule.autoNote || '',
                manualNote: afterRule.manualNote || '',
                baseRuleId: modified.id,
              }
              hasChanges = true
              logger.info(`  └─ 更新 ${dateStr} 的 ${newKey} (病人: ${afterRule.patientName})`)
            }
          }

          // 處理新增的規則
          for (const added of changes.added) {
            const rule = added.rule
            const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

            if (freqDays.includes(systemDayIndex)) {
              const key = getScheduleKey(rule.bedNum, SHIFTS[rule.shiftIndex])

              // 檢查位置是否被調班佔用
              if (finalSchedule[key] && finalSchedule[key].exceptionId) {
                // 收集衝突資訊
                conflictedExceptions.push({
                  exceptionId: finalSchedule[key].exceptionId,
                  date: dateStr,
                  position: key,
                  conflictWith: {
                    patientId: added.id,
                    patientName: rule.patientName,
                  },
                })
                logger.warn(`  └─ ⚠️ 衝突：${dateStr} ${key} 調班將被新規則取代`)
              }

              // 無論是否有調班，都套用新規則（總表優先）
              finalSchedule[key] = {
                patientId: added.id,
                patientName: rule.patientName || '',
                shiftId: SHIFTS[rule.shiftIndex],
                autoNote: rule.autoNote || '',
                manualNote: rule.manualNote || '',
                baseRuleId: added.id,
              }
              hasChanges = true
              logger.info(`  └─ 新增 ${dateStr} 的 ${key} (病人: ${rule.patientName})`)
            }
          }

          // 如果有變更，更新文件
          if (hasChanges) {
            if (scheduleDoc.exists) {
              transaction.update(scheduleRef, {
                schedule: finalSchedule,
                lastSyncAt: FieldValue.serverTimestamp(),
                syncMethod: 'smart_merge',
              })
            } else {
              transaction.set(scheduleRef, {
                date: dateStr,
                schedule: finalSchedule,
                createdAt: FieldValue.serverTimestamp(),
                syncMethod: 'smart_create',
              })
            }
          }
        })
      }

      // 批次更新衝突調班的狀態
      if (conflictedExceptions.length > 0) {
        // 去重：同一個調班可能在多天有衝突
        const uniqueExceptionIds = [...new Set(conflictedExceptions.map((c) => c.exceptionId))]
        logger.info(`🚨 [SmartSync-v4] 發現 ${uniqueExceptionIds.length} 個調班與新規則衝突`)

        const exceptionBatch = db.batch()

        for (const exceptionId of uniqueExceptionIds) {
          // 找出這個調班的所有衝突
          const conflicts = conflictedExceptions.filter((c) => c.exceptionId === exceptionId)
          const firstConflict = conflicts[0]

          // 建立衝突訊息
          let conflictMessage = `床位已被 ${firstConflict.conflictWith.patientName} 的新排班規則佔用，請選擇其他床位`

          if (conflicts.length > 1) {
            conflictMessage += `（影響 ${conflicts.length} 天）`
          }

          exceptionBatch.update(db.collection('schedule_exceptions').doc(exceptionId), {
            status: 'conflict_requires_resolution',
            errorMessage: conflictMessage,
            conflictDetectedAt: FieldValue.serverTimestamp(),
            conflictDetails: conflicts.map((c) => ({
              date: c.date,
              position: c.position,
              conflictWith: c.conflictWith.patientName,
            })),
          })

          logger.info(`  └─ 標記調班 ${exceptionId} 為衝突待解決`)
        }

        await exceptionBatch.commit()
        logger.info(`✅ [SmartSync-v4] 已更新 ${uniqueExceptionIds.length} 個調班狀態為衝突待解決`)
      }

      logger.info(`✅ [SmartSync-v4] 智慧同步完成，處理了 ${conflictedExceptions.length} 個衝突`)

      // ✅ 不需要呼叫 reapplyAllExceptionsInternal
      // ✅ 不需要重新套用調班，因為我們已經智慧處理了
    } catch (error) {
      logger.error('❌ [SmartSync-v4] 智慧同步失敗:', error)
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

      // ✨✨✨ 核心修正 1: 開始 [時區感知日期守門員] ✨✨✨
      // 1. 獲取「台北時區」的今天日期字串
      const taipeiDateString = new Date()
        .toLocaleDateString('zh-TW', {
          timeZone: 'Asia/Taipei',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        .replace(/\//g, '-')
      // 2. 根據此字串建立一個標準化的 Date 物件，代表台北今天的凌晨
      const todayInTaipei = new Date(taipeiDateString + 'T00:00:00Z')

      const parseDateString = (dateStr) => {
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
        return new Date(dateStr + 'T00:00:00Z') // 使用 UTC 避免時區問題
      }

      // 根據不同類型，找出這次申請「最早會影響的日期」
      let relevantStartDateStr
      switch (exceptionData.type) {
        case 'MOVE':
          const fromDate = parseDateString(exceptionData.from?.sourceDate)
          const toDate = parseDateString(exceptionData.to?.goalDate)
          if (fromDate < todayInTaipei || toDate < todayInTaipei) {
            throw new Error('無法為過去的日期建立「調班」申請。')
          }
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

      // 最終的核心檢查：如果最早影響日期在台北今天之前，則拒絕操作
      if (relevantStartDate < todayInTaipei) {
        throw new Error('無法為過去的日期建立或執行此調班申請。')
      }
      // ✨✨✨ 核心修正 1: 結束 ✨✨✨

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
          // 情況 1: 同日移動 (sourceDate 與 goalDate 相同)
          if (from.sourceDate === to.goalDate) {
            logger.info(`  └─ 執行同日移動: ${from.sourceDate}`)
            const scheduleRef = db.collection('schedules').doc(from.sourceDate)
            const scheduleDoc = await transaction.get(scheduleRef)

            if (!scheduleDoc.exists) {
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

            // ✨ 修改：檢查目標位置是否有調班
            if (schedule[targetKey]) {
              const occupant = schedule[targetKey]

              // 如果是調班 vs 調班，標記為衝突
              if (occupant.exceptionId) {
                await exceptionDoc.ref.update({
                  status: 'conflict_requires_resolution',
                  errorMessage: `目標床位已被 ${occupant.patientName} 的調班佔用，請選擇其他床位`,
                  conflictDetectedAt: FieldValue.serverTimestamp(),
                })
                logger.error(`❌ 系統異常：調班衝突不應該發生 - ${targetKey} 已被調班佔用`)
                return // 提早結束，不套用調班
              }

              // 如果是一般排程，記錄衝突但仍覆蓋（理論上不應該發生）
              conflicts.push({
                date: to.goalDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
              })
              logger.warn(`  └─ 異常衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
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

            // 情況 2: 跨日移動 (sourceDate 與 goalDate 不同)
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

            // ✨ 修改：檢查目標位置是否有調班
            if (targetSchedule[targetKey]) {
              const occupant = targetSchedule[targetKey]

              // 如果是調班 vs 調班，標記為衝突
              if (occupant.exceptionId) {
                await exceptionDoc.ref.update({
                  status: 'conflict_requires_resolution',
                  errorMessage: `目標床位已被 ${occupant.patientName} 的調班佔用，請選擇其他床位`,
                  conflictDetectedAt: FieldValue.serverTimestamp(),
                })
                logger.error(`❌ 系統異常：調班衝突不應該發生 - ${targetKey} 已被調班佔用`)
                return // 提早結束，不套用調班
              }

              // 如果是一般排程，記錄衝突但仍覆蓋（理論上不應該發生）
              conflicts.push({
                date: to.goalDate,
                position: targetKey,
                occupiedBy: occupant.patientName || occupant.patientId,
              })
              logger.warn(`  └─ 異常衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
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

          // ✨ 修改：檢查目標位置是否有調班
          if (scheduleData[targetKey]) {
            const occupant = scheduleData[targetKey]

            // 如果是調班 vs 調班，標記為衝突
            if (occupant.exceptionId) {
              await exceptionDoc.ref.update({
                status: 'conflict_requires_resolution',
                errorMessage: `目標床位已被 ${occupant.patientName} 的調班佔用，請選擇其他床位`,
                conflictDetectedAt: FieldValue.serverTimestamp(),
              })
              logger.error(`❌ 系統異常：臨時加洗衝突不應該發生 - ${targetKey} 已被調班佔用`)
              return // 提早結束，不套用調班
            }

            // 如果是一般排程，記錄衝突但仍覆蓋（理論上不應該發生）
            conflicts.push({
              date: targetDate,
              position: targetKey,
              occupiedBy: occupant.patientName || occupant.patientId,
              action: 'override',
            })
            logger.warn(`  └─ 異常衝突：${targetKey} 被 ${occupant.patientName} 佔用，將覆蓋`)
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
      let relevantEndDateStr
      if (exceptionData.endDate) {
        relevantEndDateStr = exceptionData.endDate
      } else if (exceptionData.type === 'MOVE') {
        relevantEndDateStr =
          exceptionData.to?.goalDate > exceptionData.from?.sourceDate
            ? exceptionData.to.goalDate
            : exceptionData.from.sourceDate
      } else if (exceptionData.type === 'ADD_SESSION') {
        relevantEndDateStr = exceptionData.to?.goalDate
      } else if (exceptionData.type === 'SWAP') {
        relevantEndDateStr = exceptionData.date
      } else {
        relevantEndDateStr = exceptionData.startDate
      }

      let expireAt = null
      if (relevantEndDateStr) {
        const endDate = new Date(relevantEndDateStr)
        endDate.setMonth(endDate.getMonth() + 1)
        expireAt = endDate
        logger.info(
          `[NewException] Calculated expireAt for ${exceptionId}: ${expireAt.toISOString()}`,
        )
      } else {
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
        expireAt: expireAt,
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
// 處理調班刪除 - 精準恢復版本
// ===================================================================
exports.onExceptionDeleted = onDocumentDeleted(
  'schedule_exceptions/{exceptionId}',
  async (event) => {
    const deletedException = event.data.data()
    const exceptionId = event.params.exceptionId
    logger.info(`🚀 [SmartReverter] 調班恢復處理器啟動: ${exceptionId}`)

    if (!deletedException || !deletedException.type) {
      logger.error(`❌ [SmartReverter] 失敗：被刪除的調班資料不完整`)
      return
    }

    try {
      // 檢查病人是否已被刪除
      const patientId = deletedException.patientId || deletedException.patient1?.patientId
      if (patientId) {
        const patientDoc = await db.collection('patients').doc(patientId).get()
        if (patientDoc.exists && patientDoc.data().isDeleted) {
          logger.warn(`[SmartReverter] 病人 ${patientId} 已被刪除，跳過恢復`)
          return
        }

        // 刪除相關的系統留言
        const targetDate =
          deletedException.date ||
          deletedException.startDate ||
          deletedException.from?.sourceDate ||
          deletedException.to?.goalDate
        if (targetDate) {
          const typeMap = {
            MOVE: '臨時調班',
            SUSPEND: '區間暫停',
            ADD_SESSION: '臨時加洗',
            SWAP: '同日互調',
          }
          const keyword = typeMap[deletedException.type]
            ? `【${typeMap[deletedException.type]}】`
            : null

          if (keyword) {
            const messagesQuery = db
              .collection('tasks')
              .where('patientId', '==', patientId)
              .where('targetDate', '==', targetDate)
              .where('category', '==', 'message')

            const messagesSnapshot = await messagesQuery.get()
            const messageBatch = db.batch()
            let deletedMessagesCount = 0

            messagesSnapshot.forEach((doc) => {
              if (doc.data().content?.startsWith(keyword)) {
                messageBatch.delete(doc.ref)
                deletedMessagesCount++
              }
            })

            if (deletedMessagesCount > 0) {
              await messageBatch.commit()
              logger.info(`[SmartReverter] 刪除 ${deletedMessagesCount} 則相關留言`)
            }
          }
        }
      }

      // 取得總表規則用於恢復
      const masterDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      const masterRules = masterDoc.exists ? masterDoc.data().schedule || {} : {}

      // 收集需要恢復的位置和衝突的調班
      const positionsToRestore = []
      const conflictedExceptions = [] // ✨ 新增：收集衝突的調班

      switch (deletedException.type) {
        case 'MOVE':
          // 恢復來源位置
          positionsToRestore.push({
            date: deletedException.from.sourceDate,
            key: getScheduleKey(deletedException.from.bedNum, deletedException.from.shiftCode),
            action: 'restore',
            patientId: deletedException.patientId,
            patientName: deletedException.patientName,
          })
          // 清除目標位置
          positionsToRestore.push({
            date: deletedException.to.goalDate,
            key: getScheduleKey(deletedException.to.bedNum, deletedException.to.shiftCode),
            action: 'clear',
            checkExceptionId: exceptionId,
          })
          break

        case 'ADD_SESSION':
          // 清除加洗位置
          positionsToRestore.push({
            date: deletedException.to.goalDate,
            key: getScheduleKey(deletedException.to.bedNum, deletedException.to.shiftCode),
            action: 'clear',
            checkExceptionId: exceptionId,
          })
          break

        case 'SUSPEND':
          // 恢復暫停期間的所有排程
          const start = new Date(deletedException.startDate + 'T00:00:00Z')
          const end = new Date(deletedException.endDate + 'T00:00:00Z')

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDateToYYYYMMDD(new Date(d)) // ✨ 使用統一函式
            const dayOfWeek = d.getDay()
            const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

            const patientRule = masterRules[deletedException.patientId]
            if (patientRule) {
              const freqDays = FREQ_MAP_TO_DAY_INDEX[patientRule.freq] || []
              if (freqDays.includes(systemDayIndex)) {
                positionsToRestore.push({
                  date: dateStr,
                  key: getScheduleKey(patientRule.bedNum, SHIFTS[patientRule.shiftIndex]),
                  action: 'restore',
                  patientData: {
                    patientId: deletedException.patientId,
                    patientName: patientRule.patientName,
                    shiftId: SHIFTS[patientRule.shiftIndex],
                    autoNote: patientRule.autoNote || '',
                    manualNote: patientRule.manualNote || '',
                    baseRuleId: deletedException.patientId,
                  },
                })
              }
            }
          }
          break

        case 'SWAP':
          // 恢復兩個交換的位置
          const key1 = getScheduleKey(
            deletedException.patient1.fromBedNum,
            deletedException.patient1.fromShiftCode,
          )
          const key2 = getScheduleKey(
            deletedException.patient2.fromBedNum,
            deletedException.patient2.fromShiftCode,
          )

          positionsToRestore.push(
            {
              date: deletedException.date,
              key: key1,
              action: 'restore',
              swapBack: true,
              originalPatientId: deletedException.patient1.patientId,
              originalPatientName: deletedException.patient1.patientName,
            },
            {
              date: deletedException.date,
              key: key2,
              action: 'restore',
              swapBack: true,
              originalPatientId: deletedException.patient2.patientId,
              originalPatientName: deletedException.patient2.patientName,
            },
          )
          break
      }

      // 執行恢復
      const batch = db.batch()

      for (const position of positionsToRestore) {
        const scheduleRef = db.collection('schedules').doc(position.date)
        const scheduleDoc = await scheduleRef.get()

        if (scheduleDoc.exists) {
          const currentSchedule = scheduleDoc.data().schedule || {}

          if (position.action === 'restore') {
            // 計算該位置原本應該是什麼
            const targetDate = new Date(position.date + 'T00:00:00Z')
            const baseSchedule = generateDailyScheduleFromRules(masterRules, targetDate)

            // ✨ 新增：檢查原位置是否已被其他病人佔用
            if (
              currentSchedule[position.key] &&
              currentSchedule[position.key].patientId !==
                (position.patientId || position.originalPatientId)
            ) {
              const occupant = currentSchedule[position.key]

              // 如果是調班產生的，標記為衝突
              if (occupant.exceptionId) {
                conflictedExceptions.push({
                  exceptionId: occupant.exceptionId,
                  date: position.date,
                  position: position.key,
                  conflictReason: `原病人 ${position.patientName || position.originalPatientName} 的調班已撤銷，此床位需重新安排`,
                })
                logger.warn(
                  `  └─ ⚠️ 衝突：${position.date} ${position.key} 被調班 ${occupant.patientName} 佔用`,
                )
              }
            }

            // 恢復原本應該在這個位置的病人
            if (position.patientData) {
              // SUSPEND 的恢復，使用提供的資料
              batch.update(scheduleRef, {
                [`schedule.${position.key}`]: position.patientData,
              })
              logger.info(
                `  └─ 恢復 ${position.date} ${position.key} (${position.patientData.patientName})`,
              )
            } else if (position.swapBack) {
              // SWAP 的恢復
              const originalData = baseSchedule[position.key]
              if (originalData && originalData.patientId === position.originalPatientId) {
                batch.update(scheduleRef, {
                  [`schedule.${position.key}`]: originalData,
                })
                logger.info(
                  `  └─ 恢復 ${position.date} ${position.key} (${position.originalPatientName})`,
                )
              }
            } else if (baseSchedule[position.key]) {
              // 一般恢復（MOVE 的來源位置）
              batch.update(scheduleRef, {
                [`schedule.${position.key}`]: baseSchedule[position.key],
              })
              logger.info(`  └─ 恢復 ${position.date} ${position.key}`)
            } else {
              // 該位置原本就是空的
              batch.update(scheduleRef, {
                [`schedule.${position.key}`]: FieldValue.delete(),
              })
              logger.info(`  └─ 清空 ${position.date} ${position.key}`)
            }
          } else if (position.action === 'clear') {
            // 清除調班產生的位置
            if (currentSchedule[position.key]?.exceptionId === position.checkExceptionId) {
              // 檢查該位置原本是否有其他病人
              const targetDate = new Date(position.date + 'T00:00:00Z')
              const baseSchedule = generateDailyScheduleFromRules(masterRules, targetDate)

              if (baseSchedule[position.key]) {
                // 恢復原本的病人
                batch.update(scheduleRef, {
                  [`schedule.${position.key}`]: baseSchedule[position.key],
                })
                logger.info(`  └─ 清除並恢復 ${position.date} ${position.key}`)
              } else {
                // 原本就是空的
                batch.update(scheduleRef, {
                  [`schedule.${position.key}`]: FieldValue.delete(),
                })
                logger.info(`  └─ 清除 ${position.date} ${position.key}`)
              }
            }
          }
        }
      }

      await batch.commit()
      logger.info(`✅ [SmartReverter] 成功處理 ${positionsToRestore.length} 個位置`)

      // ✨ 新增：批次更新衝突調班的狀態
      if (conflictedExceptions.length > 0) {
        const uniqueExceptionIds = [...new Set(conflictedExceptions.map((c) => c.exceptionId))]
        logger.info(`🚨 [SmartReverter] 發現 ${uniqueExceptionIds.length} 個調班需要重新安排`)

        const exceptionBatch = db.batch()

        for (const exceptionId of uniqueExceptionIds) {
          const conflicts = conflictedExceptions.filter((c) => c.exceptionId === exceptionId)
          const firstConflict = conflicts[0]

          exceptionBatch.update(db.collection('schedule_exceptions').doc(exceptionId), {
            status: 'conflict_requires_resolution',
            errorMessage: firstConflict.conflictReason,
            conflictDetectedAt: FieldValue.serverTimestamp(),
          })

          logger.info(`  └─ 標記調班 ${exceptionId} 為衝突待解決`)
        }

        await exceptionBatch.commit()
        logger.info(`✅ [SmartReverter] 已更新 ${uniqueExceptionIds.length} 個調班狀態`)
      }
    } catch (error) {
      logger.error(`❌ [SmartReverter] 恢復調班 ${exceptionId} 時發生錯誤:`, error)
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
  { cors: allowedOrigins, timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    const allowedRoles = ['admin', 'editor', 'contributor', 'viewer']
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
  { cors: allowedOrigins, timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
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
// Medication Orders Processing Function (藥囑處理函式) - ✨ 最終修正版 v1.7 (uploadMonth 基於上傳時間) ✨
// ===================================================================

exports.processOrders = onCall(
  { cors: allowedOrigins, timeoutSeconds: 540, memory: '1GiB' },
  async (request) => {
    const allowedRoles = ['admin', 'editor', 'contributor']
    if (!request.auth || !allowedRoles.includes(request.auth.token.role)) {
      throw new HttpsError('permission-denied', '您沒有權限執行此操作。')
    }
    const { fileName, fileContent } = request.data
    if (!fileName || !fileContent) {
      throw new HttpsError('invalid-argument', '請求中缺少檔案名稱或內容。')
    }
    logger.info(`[ProcessOrders V1.8] 接收到檔案 ${fileName}，開始解析...`)

    try {
      // ✨ --- [核心修正] 使用正確的方式呼叫 serverTimestamp --- ✨
      const uploadTimestamp = FieldValue.serverTimestamp()

      const now = new Date()
      const year = now.getFullYear()
      const month = (now.getMonth() + 1).toString().padStart(2, '0')
      const uploadMonth = `${year}-${month}`
      logger.info(`[ProcessOrders V1.8] 本次上傳將歸檔至月份: ${uploadMonth}`)

      const buffer = Buffer.from(fileContent, 'base64')
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheetName = workbook.SheetNames[0]
      const worksheet = workbook.Sheets[sheetName]
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

      const oralMedCodes = ['OALK1', 'OCAA', 'OCAL1', 'OFOS4', 'OUCA1', 'OVAF', 'OORK']
      const injectionMedCodes = ['INES2', 'IPAR1', 'ICAC', 'IFER2', 'IREC1']

      let batch = db.batch()
      const patientCache = new Map()
      let errors = []
      let processedCount = 0
      let batchCounter = 0
      const BATCH_SIZE = 450

      for (let i = headerRowIndex + 1; i < dataRows.length; i++) {
        const row = dataRows[i]
        if (row.every((cell) => String(cell).trim() === '')) continue

        let medicalRecordNumber = String(row[headerToIndex['病歷號']] || '')
          .trim()
          .replace(/^0+/, '')
        const orderCode = String(row[headerToIndex['醫令碼']] || '').trim()
        const orderName = String(row[headerToIndex['名稱']] || '').trim()
        const rawChangeDate = row[headerToIndex['異動日期']]
        let changeDate = ''

        if (rawChangeDate) {
          const dateStr = String(rawChangeDate).trim()
          if (/^\d{8,}/.test(dateStr)) {
            const year = dateStr.substring(0, 4)
            const month = dateStr.substring(4, 6)
            const day = dateStr.substring(6, 8)
            if (
              parseInt(month) >= 1 &&
              parseInt(month) <= 12 &&
              parseInt(day) >= 1 &&
              parseInt(day) <= 31
            ) {
              changeDate = `${year}-${month}-${day}`
            }
          }
          if (!changeDate) {
            try {
              const dateObj = new Date(rawChangeDate)
              if (!isNaN(dateObj.getTime())) {
                const year = dateObj.getUTCFullYear()
                const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0')
                const day = dateObj.getUTCDate().toString().padStart(2, '0')
                changeDate = `${year}-${month}-${day}`
              }
            } catch (e) {
              /* 忽略解析錯誤 */
            }
          }
        }

        if (
          !medicalRecordNumber ||
          !orderCode ||
          !orderName ||
          !changeDate ||
          !/^\d{4}-\d{2}-\d{2}$/.test(changeDate)
        ) {
          let reason = '缺少必要欄位或日期格式不正確'
          if (!changeDate || !/^\d{4}-\d{2}-\d{2}$/.test(changeDate)) {
            reason = `異動日期格式錯誤或為空 (應為 YYYY-MM-DD)，讀取到的值為: "${rawChangeDate}"`
          }
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
          uploadMonth,
          dose: String(row[headerToIndex['次劑量']] || ''),
          action: 'MODIFY',
          sourceFile: fileName,
          uploadTimestamp: uploadTimestamp,
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
          if (batchCounter >= BATCH_SIZE) {
            await batch.commit()
            logger.info(`[ProcessOrders V1.8] 已提交 ${batchCounter} 筆資料...`)
            batch = db.batch()
            batchCounter = 0
          }
        }
      }

      if (batchCounter > 0) {
        await batch.commit()
        logger.info(`[ProcessOrders V1.8] 已提交最後 ${batchCounter} 筆資料。`)
      }

      logger.info(
        `[ProcessOrders V1.8] 處理完成，成功處理 ${processedCount} 筆藥囑，發現 ${errors.length} 個問題。`,
      )

      return {
        success: true,
        message: `處理完成！成功匯入 ${processedCount} 筆藥囑紀錄，發現 ${errors.length} 個問題行。`,
        processedCount,
        errorCount: errors.length,
        errors: errors.slice(0, 50),
      }
    } catch (error) {
      logger.error(`[ProcessOrders V1.8] 處理檔案 ${fileName} 時發生嚴重錯誤:`, error)
      if (error instanceof HttpsError) throw error
      throw new HttpsError('internal', `處理 Excel 檔案時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// Daily Injection Calculation Function - 完整修復版
// ===================================================================

const parseFlexibleDate = (dateStr, targetDate) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null
  }
  const str = dateStr.trim()
  const year = targetDate.getUTCFullYear()

  // 支援 YYYY-MM-DD 或 YYYY/MM/DD
  let match = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (match) {
    const customYear = match[1]
    const month = match[2].padStart(2, '0')
    const day = match[3].padStart(2, '0')
    return `${customYear}-${month}-${day}`
  }

  // 支援 MM/DD
  match = str.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (match) {
    const month = match[1].padStart(2, '0')
    const day = match[2].padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 支援 MMDD
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
  { cors: allowedOrigins, timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '使用者未登入，無法執行此操作。')
    }

    const { targetDate, patientIds } = request.data

    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new HttpsError('invalid-argument', '請提供有效的目標日期 (格式 YYYY-MM-DD)。')
    }

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return { success: true, targetDate, injections: [] }
    }

    if (patientIds.length > 100) {
      throw new HttpsError('invalid-argument', '單次查詢的病人數不能超過100人。')
    }

    logger.info(
      `[getDailyInjections] 開始為 ${patientIds.length} 位病人計算 ${targetDate} 的應打針劑...`,
    )

    try {
      // 步驟 1: 找出最新的上傳月份
      const latestMonthQuery = db
        .collection('medication_orders')
        .where('patientId', 'in', patientIds)
        .where('orderType', '==', 'injection')
        .orderBy('uploadMonth', 'desc')
        .limit(1)

      const latestMonthSnapshot = await latestMonthQuery.get()

      if (latestMonthSnapshot.empty) {
        logger.info(`[getDailyInjections] 在這些病人中找不到任何針劑藥囑紀錄。`)
        return { success: true, targetDate, injections: [] }
      }

      const latestUploadMonth = latestMonthSnapshot.docs[0].data().uploadMonth
      logger.info(`[getDailyInjections] 找到最新的上傳月份為: ${latestUploadMonth}`)

      // 步驟 2: 查詢最新月份的藥囑紀錄
      const effectiveOrdersQuery = db
        .collection('medication_orders')
        .where('patientId', 'in', patientIds)
        .where('orderType', '==', 'injection')
        .where('uploadMonth', '==', latestUploadMonth)

      const effectiveOrdersSnapshot = await effectiveOrdersQuery.get()

      // 步驟 3: 聚合每個病人每個藥物的最新紀錄
      const patientLatestOrders = new Map()

      effectiveOrdersSnapshot.forEach((doc) => {
        const order = doc.data()
        const key = `${order.patientId}-${order.orderCode}`
        const existingOrder = patientLatestOrders.get(key)

        if (!existingOrder || new Date(order.changeDate) > new Date(existingOrder.changeDate)) {
          patientLatestOrders.set(key, order)
        }
      })

      const patientHistory = Array.from(patientLatestOrders.values())
      logger.info(`[getDailyInjections] 已聚合出 ${patientHistory.length} 筆最新的有效藥囑。`)

      // 步驟 4: 撈取排班資料
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

      // 步驟 5: 計算應打針劑
      const finalInjectionList = []
      const dateObj = new Date(targetDate + 'T00:00:00Z')
      const targetDayOfWeek = dateObj.getUTCDay()

      for (const order of patientHistory) {
        const slotInfo = patientSlotMap.get(order.patientId) || { bedNum: 'N/A', shift: 'N/A' }
        const note = (order.note || '').trim()
        let shouldAdminister = false
        let reason = ''

        const noteParts = note.split(/[\s,]+/).filter(Boolean)

        for (const part of noteParts) {
          if (part.toUpperCase().startsWith('QW')) {
            // 解析 QW 規則（如 QW135 表示週一三五）
            const dayString = part.substring(2)
            if (dayString) {
              const days = dayString
                .split('')
                .map((d) => parseInt(d, 10))
                .filter((d) => !isNaN(d))

              // 醫院系統：1=週一, 2=週二, ..., 7=週日
              const hospitalSystemDayOfWeek = targetDayOfWeek === 0 ? 7 : targetDayOfWeek

              if (days.includes(hospitalSystemDayOfWeek)) {
                shouldAdminister = true
                reason = `規則匹配: ${part}`
                break
              }
            }
          } else {
            // 檢查是否為日期
            const parsedDate = parseFlexibleDate(part, dateObj)
            if (parsedDate && parsedDate === targetDate) {
              shouldAdminister = true
              reason = `日期匹配: ${part}`
              break
            }
          }
        }

        // ✨ 關鍵修復：補上完整的 push 內容
        if (shouldAdminister) {
          finalInjectionList.push({
            patientId: order.patientId,
            patientName: order.patientName,
            medicalRecordNumber: order.medicalRecordNumber,
            bedNum: slotInfo.bedNum,
            shift: slotInfo.shift,
            orderCode: order.orderCode,
            orderName: order.orderName,
            dose: order.dose,
            note: order.note,
            reason: reason,
            changeDate: order.changeDate,
          })
        }
      }

      // 步驟 6: 排序結果
      finalInjectionList.sort((a, b) => {
        const shiftOrder = { early: 1, noon: 2, late: 3, N: 98, A: 99 }
        const shiftA = a.shift || 'A'
        const shiftB = b.shift || 'A'

        if (shiftA !== shiftB) {
          return (shiftOrder[shiftA] || 99) - (shiftOrder[shiftB] || 99)
        }

        const bedA = String(a.bedNum).startsWith('外')
          ? 1000 + parseInt(String(a.bedNum).substring(1))
          : parseInt(a.bedNum)
        const bedB = String(b.bedNum).startsWith('外')
          ? 1000 + parseInt(String(b.bedNum).substring(1))
          : parseInt(b.bedNum)

        return bedA - bedB
      })

      logger.info(`[getDailyInjections] 計算完成，找到 ${finalInjectionList.length} 筆應打針劑。`)

      return {
        success: true,
        targetDate,
        injections: finalInjectionList,
      }
    } catch (error) {
      logger.error(`[getDailyInjections] 處理針劑計算時發生嚴重錯誤:`, error)
      throw new HttpsError('internal', `計算應打針劑時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// ✨【最終修正版 V2.3】 - 每日自動歸檔 (使用 dateUtils)
// ===================================================================

exports.archiveDailySchedule = onSchedule(
  { schedule: 'every day 00:05', timeZone: TIME_ZONE, timeoutSeconds: 540, memory: '512MiB' },
  async (event) => {
    // 1. ✨ 使用統一函式獲取台北時區的昨天日期
    const { getTaipeiYesterdayString } = require('./utils/dateUtils') // 引入昨天的函式
    const dateStr = getTaipeiYesterdayString()

    logger.info(`[Archiver V3] 🚀 歸檔任務啟動，目標歸檔日期: ${dateStr}`)

    const sourceScheduleRef = db.collection('schedules').doc(dateStr)
    const targetArchiveRef = db.collection('expired_schedules').doc(dateStr)

    try {
      // 使用 transaction 確保原子操作
      await db.runTransaction(async (transaction) => {
        // 讀取原始排程
        const scheduleDoc = await transaction.get(sourceScheduleRef)

        if (!scheduleDoc.exists) {
          logger.warn(`[Archiver V3] ⚠️ 日期 ${dateStr} 的排班文件不存在，無需歸檔。`)
          return null
        }

        // 檢查是否已經有歸檔文件（避免重複歸檔）
        const existingArchive = await transaction.get(targetArchiveRef)
        if (existingArchive.exists) {
          logger.warn(`[Archiver V3] ⚠️ 日期 ${dateStr} 已經有歸檔文件，將刪除原始文件。`)
          transaction.delete(sourceScheduleRef)
          return null
        }

        const originalData = scheduleDoc.data()
        const originalSchedule = originalData.schedule || {}

        // 收集所有病人ID
        const patientIds = [
          ...new Set(
            Object.values(originalSchedule)
              .map((slot) => slot.patientId)
              .filter(Boolean),
          ),
        ]

        logger.info(`[Archiver V3] 🔍 找到 ${patientIds.length} 位病人，開始處理歸檔資料...`)

        // 如果沒有病人，直接歸檔
        if (patientIds.length === 0) {
          logger.info(`[Archiver V3] 📄 日期 ${dateStr} 的排班中沒有病人，直接歸檔空排班。`)

          transaction.set(targetArchiveRef, {
            ...originalData,
            archivedAt: FieldValue.serverTimestamp(),
            archiveMethod: 'empty_schedule',
          })
          transaction.delete(sourceScheduleRef)
          return null
        }

        // 建立歸檔資料
        const archivedSchedule = { ...originalSchedule }
        const patientDataMap = new Map()

        // 批次查詢病人資料（Transaction 外部查詢，因為 Transaction 內有限制）
        // 注意：這會在 transaction 外執行，但因為病人資料相對穩定，風險較低
        const CHUNK_SIZE = 30
        for (let i = 0; i < patientIds.length; i += CHUNK_SIZE) {
          const chunk = patientIds.slice(i, i + CHUNK_SIZE)
          const patientQuery = db.collection('patients').where(FieldPath.documentId(), 'in', chunk)
          const patientDocs = await patientQuery.get()

          patientDocs.forEach((doc) => {
            patientDataMap.set(doc.id, doc.data())
          })
        }

        // 為每個排程項目添加病人快照
        let missingPatientCount = 0
        for (const shiftId in archivedSchedule) {
          const slot = archivedSchedule[shiftId]
          if (slot?.patientId) {
            const patientData = patientDataMap.get(slot.patientId)
            if (patientData) {
              slot.archivedPatientInfo = {
                status: patientData.status || 'unknown',
                mode: patientData.mode || null,
                wardNumber: patientData.wardNumber || null,
                medicalRecordNumber: patientData.medicalRecordNumber || null,
                freq: patientData.freq || null,
              }
            } else {
              missingPatientCount++
              slot.archivedPatientInfo = {
                status: 'deleted',
                mode: 'N/A',
                wardNumber: null,
                medicalRecordNumber: null,
                name: slot.patientName || '未知 (已刪除)',
                note: 'Patient data not found during archival',
              }
            }
          }
        }

        if (missingPatientCount > 0) {
          logger.warn(
            `[Archiver V3] ⚠️ 有 ${missingPatientCount} 位病人的資料在 patients 集合中找不到。`,
          )
        }

        // 準備歸檔資料
        const dataToArchive = {
          ...originalData,
          schedule: archivedSchedule,
          archivedAt: FieldValue.serverTimestamp(),
          archiveMethod: 'daily_scheduled',
          patientCount: patientIds.length,
          missingPatientCount: missingPatientCount,
        }

        // 在 transaction 中執行歸檔和刪除
        transaction.set(targetArchiveRef, dataToArchive)
        transaction.delete(sourceScheduleRef)

        logger.info(`[Archiver V3] ✅ Transaction 準備完成，即將提交歸檔 ${dateStr}`)
      })

      // Transaction 成功完成
      logger.info(`[Archiver V3] ✅ 成功歸檔並刪除原始排班 ${dateStr}`)

      // 驗證操作結果
      const verifySource = await sourceScheduleRef.get()
      const verifyTarget = await targetArchiveRef.get()

      if (verifySource.exists) {
        logger.error(`[Archiver V3] ❌ 驗證失敗：原始文件 ${dateStr} 仍然存在！`)
        // 嘗試強制刪除
        await sourceScheduleRef.delete()
        logger.info(`[Archiver V3] 🔧 已執行強制刪除`)
      }

      if (!verifyTarget.exists) {
        logger.error(`[Archiver V3] ❌ 驗證失敗：歸檔文件 ${dateStr} 不存在！`)
      }
    } catch (error) {
      logger.error(`[Archiver V3] ❌ 歸檔日期 ${dateStr} 的排班時發生嚴重錯誤:`, error)

      // 錯誤恢復：如果歸檔已建立但原始文件還在，嘗試刪除原始文件
      try {
        const [sourceExists, targetExists] = await Promise.all([
          sourceScheduleRef.get(),
          targetArchiveRef.get(),
        ])

        if (targetExists.exists && sourceExists.exists) {
          logger.info(`[Archiver V3] 🔧 檢測到部分完成的歸檔，嘗試清理原始文件...`)
          await sourceScheduleRef.delete()
          logger.info(`[Archiver V3] ✅ 清理完成`)
        }
      } catch (cleanupError) {
        logger.error(`[Archiver V3] ❌ 清理失敗:`, cleanupError)
      }

      throw error
    }

    return null
  },
)

// ✨ --- 【全新】手動遷移歷史排班的一次性 Cloud Function --- ✨
exports.migrateSchedulesToArchive = onCall(
  { cors: allowedOrigins, timeoutSeconds: 540, memory: '1GiB' },
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

/**
 * ✨✨✨【全新函式】✨✨✨
 * 手動觸發，將所有已過期的 `message` 類型的 task 狀態更新為 `expired`。
 * 僅限管理員使用。
 */
exports.manuallyExpireTasks = onCall(
  { cors: allowedOrigins, timeoutSeconds: 300 },
  async (request) => {
    // 1. 權限檢查：確保只有 admin 角色的使用者可以呼叫
    if (request.auth?.token?.role !== 'admin') {
      throw new HttpsError('permission-denied', '您沒有權限執行此操作。')
    }

    logger.info(`[Manual Trigger] Manually expiring tasks, triggered by admin: ${request.auth.uid}`)

    const todayStr = getTaipeiTodayString()
    try {
      // 2. 執行與排程函式完全相同的查詢邏輯
      const query = db
        .collection('tasks')
        .where('status', '==', 'pending')
        .where('category', '==', 'message')
        .where('targetDate', '<', todayStr)

      const snapshot = await query.get()
      if (snapshot.empty) {
        logger.info('[Manual Trigger] No expired tasks (messages) found to update.')
        return { success: true, message: '找不到需要更新的過期留言。', updatedCount: 0 }
      }

      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`[Manual Trigger] Expiring task (message) ${doc.id}.`)
        batch.update(doc.ref, { status: 'expired' })
      })
      await batch.commit()

      const successMessage = `成功將 ${snapshot.size} 則留言標記為已過期。`
      logger.info(`[Manual Trigger] ${successMessage}`)
      // 3. 回傳詳細的成功訊息給前端
      return { success: true, message: successMessage, updatedCount: snapshot.size }
    } catch (error) {
      logger.error('[Manual Trigger] Failed to manually expire tasks:', error)
      throw new HttpsError('internal', '手動更新過期留言時發生錯誤。', error)
    }
  },
)

// ===================================================================
// 當月當班藥物草稿整理函式 (藥物草稿處理函式) - v1.0
// ===================================================================

exports.getDailyMedicationDrafts = onCall(
  { cors: allowedOrigins, timeoutSeconds: 180, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', '使用者未登入，無法執行此操作。')
    }

    const { targetDate, patientIds } = request.data
    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      throw new HttpsError('invalid-argument', '請提供有效的目標日期 (格式 YYYY-MM-DD)。')
    }

    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return { success: true, targetDate, drafts: [] }
    }
    if (patientIds.length > 100) {
      throw new HttpsError('invalid-argument', '單次查詢的病人數不能超過100人。')
    }

    // 從 targetDate (e.g., "2025-08-15") 推算出 targetMonth (e.g., "2025-08")
    const targetMonth = targetDate.substring(0, 7)

    logger.info(
      `[getDailyMedicationDrafts] 開始為 ${patientIds.length} 位病人計算 ${targetMonth} 的藥囑草稿...`,
    )

    try {
      // --- 步驟 1: 查詢所有相關的藥囑草稿 ---
      const draftsQuery = db
        .collection('medication_drafts')
        .where('patientId', 'in', patientIds)
        .where('targetMonth', '==', targetMonth)
        .where('status', '==', 'pending') // 只撈取待處理的草稿

      const draftsSnapshot = await draftsQuery.get()
      const allDrafts = draftsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

      // --- 步驟 2: 撈取當天的排班資料以取得床號和班別 ---
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

      // --- 步驟 3: 組合資料 ---
      const finalDraftList = allDrafts.map((draft) => {
        const slotInfo = patientSlotMap.get(draft.patientId) || { bedNum: 'N/A', shift: 'N/A' }
        return {
          ...draft,
          bedNum: slotInfo.bedNum,
          shift: slotInfo.shift,
        }
      })

      // --- 步驟 4: 排序 ---
      finalDraftList.sort((a, b) => {
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
        if (bedA !== bedB) return bedA - bedB

        // 如果床位班別都相同，按藥物名稱排序
        return (a.orderName || '').localeCompare(b.orderName || '')
      })

      logger.info(`[getDailyMedicationDrafts] 計算完成，找到 ${finalDraftList.length} 筆藥囑草稿。`)
      return { success: true, targetDate, drafts: finalDraftList }
    } catch (error) {
      logger.error(`[getDailyMedicationDrafts] 處理藥囑草稿計算時發生嚴重錯誤:`, error)
      throw new HttpsError('internal', `計算藥囑草稿時發生錯誤: ${error.message}`)
    }
  },
)

// ===================================================================
// ✨【最終修正版 v1.2】 - 修正 exists 屬性呼叫 & 強化刪除邏輯
// ===================================================================

/**
 * 每日定時執行的 Cloud Function，用於處理所有到期的「預約病人變更」任務。
 * 觸發時間：每日凌晨 01:00 (台北時間)。
 */
exports.applyScheduledPatientUpdates = onSchedule(
  { schedule: '0 1 * * *', timeZone: TIME_ZONE, timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    // ✨ 使用統一函式，並只宣告一次
    const todayStr = getTaipeiTodayString()

    logger.info(`🚀 [Updater] 執行 ${todayStr} 的預約變更任務...`)

    const updatesQuery = db
      .collection('scheduled_patient_updates')
      .where('effectiveDate', '==', todayStr)
      .where('status', '==', 'pending')

    const snapshot = await updatesQuery.get()

    if (snapshot.empty) {
      logger.info('✅ [Updater] 今天沒有待處理的預約變更。')
      return null
    }

    logger.info(`[Updater] 找到 ${snapshot.size} 個待處理的預約。`)

    // 定義 hasFrequencyConflict 輔助函式 (確保在此作用域可用)
    const hasFrequencyConflict = (freq1, freq2) => {
      if (!freq1 || !freq2) return false
      const days1 = FREQ_MAP_TO_DAY_INDEX[freq1] || []
      const days2 = FREQ_MAP_TO_DAY_INDEX[freq2] || []
      return days1.some((day) => days2.includes(day))
    }

    for (const doc of snapshot.docs) {
      const updateTask = doc.data()
      const taskId = doc.id
      const { patientId, changeType, payload } = updateTask

      logger.info(`  - 正在處理任務 ${taskId} for patient ${patientId} (${changeType})...`)

      try {
        switch (changeType) {
          case 'UPDATE_STATUS':
          case 'UPDATE_MODE':
            await db.collection('patients').doc(patientId).update(payload)
            logger.info(`    - 成功更新 patients/${patientId} 的屬性。`)
            break

          case 'UPDATE_FREQ':
            if (!payload.freq) {
              throw new Error("Payload for UPDATE_FREQ is missing 'freq'.")
            }
            await db.collection('patients').doc(patientId).update({ freq: payload.freq })
            logger.info(`    - 成功更新 patients/${patientId} 的預設頻率為 ${payload.freq}。`)
            break

          case 'UPDATE_BASE_SCHEDULE_RULE':
            const { bedNum, shiftIndex, freq } = payload
            if (bedNum === undefined || shiftIndex === undefined || !freq) {
              throw new Error('Payload for UPDATE_BASE_SCHEDULE_RULE is incomplete.')
            }
            const masterScheduleRef = db.collection('base_schedules').doc('MASTER_SCHEDULE')

            await db.runTransaction(async (transaction) => {
              const masterDoc = await transaction.get(masterScheduleRef)
              // ✨✨✨【核心修正 #1】✨✨✨
              // 將 .exists() 改為 .exists
              if (!masterDoc.exists) throw new Error('MASTER_SCHEDULE document not found!')

              const schedule = masterDoc.data().schedule || {}

              for (const otherPatientId in schedule) {
                if (otherPatientId === patientId) continue
                const otherRule = schedule[otherPatientId]
                if (
                  otherRule.bedNum === bedNum &&
                  otherRule.shiftIndex === shiftIndex &&
                  hasFrequencyConflict(freq, otherRule.freq)
                ) {
                  const otherPatientName = otherRule.patientName || `ID:${otherPatientId}`
                  throw new Error(
                    `床位衝突：目標位置已被 ${otherPatientName} (${otherRule.freq}) 佔用。`,
                  )
                }
              }

              transaction.update(db.collection('patients').doc(patientId), { freq })

              const existingRule = schedule[patientId] || {}
              transaction.update(masterScheduleRef, {
                [`schedule.${patientId}`]: {
                  ...existingRule,
                  bedNum: bedNum,
                  shiftIndex: shiftIndex,
                  freq: freq,
                  patientName: updateTask.patientName || existingRule.patientName,
                },
              })
            })
            logger.info(`    - 成功更新 patient/${patientId} 和 base_schedules 的總表規則。`)
            break

          case 'DELETE_PATIENT':
            const patientRef = db.collection('patients').doc(patientId)
            const masterRef = db.collection('base_schedules').doc('MASTER_SCHEDULE')

            await db.runTransaction(async (transaction) => {
              const patientDoc = await transaction.get(patientRef)
              if (!patientDoc.exists) throw new Error(`Patient with ID ${patientId} not found.`)
              const patientData = patientDoc.data()

              // 標記病人為刪除
              transaction.set(
                patientRef,
                {
                  isDeleted: true,
                  status: 'deleted',
                  originalStatus: patientData.status,
                  deleteReason: payload.deleteReason || '預約刪除',
                  remarks: payload.remarks || '',
                  deletedAt: FieldValue.serverTimestamp(),
                },
                { merge: true },
              )

              // 從總表刪除
              transaction.update(masterRef, {
                [`schedule.${patientId}`]: FieldValue.delete(),
              })
            })

            // ✨ 新增：直接清理今天和未來的排程
            logger.info(`    - 開始清理 ${patientId} 的排程...`)

            const cleanupBatch = db.batch()
            let cleanupCount = 0
            const BATCH_SIZE = 450

            // 清理今天和未來60天的排程
            for (let i = 0; i <= 60; i++) {
              const targetDate = new Date(today)
              targetDate.setDate(targetDate.getDate() + i)
              const dateStr = formatDateToYYYYMMDD(targetDate) // ✨ 使用統一函式

              if (dateStr >= todayStr) {
                const scheduleRef = db.collection('schedules').doc(dateStr)
                const scheduleDoc = await scheduleRef.get()

                if (scheduleDoc.exists) {
                  const schedule = scheduleDoc.data().schedule || {}
                  const updates = {}

                  for (const key in schedule) {
                    if (schedule[key].patientId === patientId) {
                      updates[`schedule.${key}`] = FieldValue.delete()
                      cleanupCount++
                      logger.info(`      └─ 移除 ${dateStr} 的 ${key}`)
                    }
                  }

                  if (Object.keys(updates).length > 0) {
                    cleanupBatch.update(scheduleRef, {
                      ...updates,
                      lastModified: FieldValue.serverTimestamp(),
                      modifiedBy: 'scheduled_update',
                    })

                    // 如果批次太大，先提交
                    if (cleanupCount >= BATCH_SIZE) {
                      await cleanupBatch.commit()
                      logger.info(`      └─ 批次提交：已清理 ${cleanupCount} 個項目`)
                      cleanupCount = 0
                      cleanupBatch = db.batch()
                    }
                  }
                }
              }
            }

            if (cleanupCount > 0) {
              await cleanupBatch.commit()
              logger.info(`    - 共清理了 ${cleanupCount} 個排程項目`)
            }

            // ✨ 新增：清理護理師分組
            logger.info(`    - 開始清理 ${patientId} 的護理師分組...`)

            const assignmentsBatch = db.batch()
            let assignmentCount = 0
            const assignmentsSnapshot = await db
              .collection('nurse_assignments')
              .where('date', '>', todayStr) // ✨ 直接使用函式頂部的 todayStr
              .get()

            assignmentsSnapshot.forEach((doc) => {
              const teamsData = doc.data().teams || {}
              const updates = {}
              let needsUpdate = false

              for (const teamKey in teamsData) {
                if (teamKey.startsWith(patientId + '-')) {
                  updates[`teams.${teamKey}`] = FieldValue.delete()
                  needsUpdate = true
                  assignmentCount++
                }
              }

              if (needsUpdate) {
                assignmentsBatch.update(doc.ref, updates)
              }
            })

            if (assignmentCount > 0) {
              await assignmentsBatch.commit()
              logger.info(`    - 共清理了 ${assignmentCount} 個護理分組`)
            }

            // 取消未來的調班申請
            await cancelFutureExceptionsForPatient(patientId)

            logger.info(`    - 成功將 patient/${patientId} 標記為刪除並完成所有清理工作`)
            break

          case 'RESTORE_PATIENT':
            const patientToRestoreRef = db.collection('patients').doc(patientId)

            if (!payload.status) {
              throw new Error("Payload for RESTORE_PATIENT is missing 'status'.")
            }

            const restoreData = {
              isDeleted: false,
              status: payload.status,
              wardNumber: payload.wardNumber || null,
              deleteReason: FieldValue.delete(),
              deletedAt: FieldValue.delete(),
              originalStatus: FieldValue.delete(),
            }

            await patientToRestoreRef.update(restoreData)

            logger.info(`    - 成功將 patient/${patientId} 從刪除名單中復原至 ${payload.status}。`)
            break

          default:
            throw new Error(`未知的變更類型: ${changeType}`)
        }

        await doc.ref.update({ status: 'completed' })
      } catch (error) {
        logger.error(`  - ❌ 處理任務 ${taskId} 失敗:`, error)
        await doc.ref.update({ status: 'error', errorMessage: error.message })
      }
    }

    logger.info('✅ [Updater] 所有預約變更任務處理完畢。')
    return null
  },
)

// ===================================================================
// ✨【全新函式 v5.3 - 含歷史保護版】
// 當護理總班表更新時，讀取手動設定的組別，並同步到每日分組文件。
// 只同步今天(含)以後的日期，保護歷史記錄
// ===================================================================
exports.syncAndCreateAssignments = onDocumentWritten(
  'nursing_schedules/{yearMonth}',
  async (event) => {
    const yearMonth = event.params.yearMonth
    const afterData = event.data?.after.data()

    if (!afterData || !afterData.scheduleByNurse) {
      logger.info(`[SyncManualGroups-v5.3] 總班表 ${yearMonth} 被刪除或無資料，跳過。`)
      return null
    }

    logger.info(`🚀 [SyncManualGroups-v5.3] 偵測到總班表 ${yearMonth} 更新，開始同步手動分組...`)

    try {
      // ✨ 新增：取得今天的日期（台北時區）
      const todayStr = getTaipeiTodayString()

      const [year, month] = yearMonth.split('-').map(Number)
      const daysInMonth = new Date(year, month, 0).getDate()
      const batch = db.batch()
      let updatedCount = 0
      let createdCount = 0
      let skippedCount = 0

      // 對每一天進行處理
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${yearMonth}-${String(day).padStart(2, '0')}`
        const dateIndex = day - 1

        // ✨ 新增：跳過過去的日期
        if (dateStr < todayStr) {
          skippedCount++
          logger.info(`  └─ [跳過] ${dateStr} 為歷史資料，不進行修改`)
          continue
        }

        // 產生新的 names
        const newNames = {}
        for (const nurseId in afterData.scheduleByNurse) {
          const nurseData = afterData.scheduleByNurse[nurseId]
          const shift = (nurseData.shifts?.[dateIndex] || '').trim()
          const group = (nurseData.groups?.[dateIndex] || '').trim()

          if (shift && !['休', '例', '國定', ''].includes(shift)) {
            let prefix = ''
            if (['74', '75', '816', '74/L', '84', '815', '7-3', '8-4', '7-5'].includes(shift)) {
              prefix = '早'
            } else if (['311', '3-11'].includes(shift)) {
              prefix = '晚'
            } else {
              prefix = '早'
            }

            if (group) {
              const teamName = `${prefix}${group}`
              newNames[teamName] = nurseData.nurseName
            }
          }
        }

        // 使用日期作為文件 ID
        const docRef = db.collection('nurse_assignments').doc(dateStr)
        const existingDoc = await docRef.get()

        if (existingDoc.exists) {
          // 文件存在：更新 names，保留 teams
          const existingData = existingDoc.data()
          const existingNames = existingData.names || {}
          const existingTeams = existingData.teams || {}

          // 只有當 names 有變化時才更新
          if (JSON.stringify(newNames) !== JSON.stringify(existingNames)) {
            batch.update(docRef, {
              names: newNames,
              // 保留原有的 teams
              updatedAt: FieldValue.serverTimestamp(),
              syncSource: 'nursing_schedule', // ✨ 標記更新來源
            })
            updatedCount++
            logger.info(`  └─ [更新] ${dateStr} 的護理師指派已更新（保留病人分組）`)
          }
        } else {
          // 文件不存在：創建新文件（只處理未來日期）
          if (Object.keys(newNames).length > 0) {
            batch.set(docRef, {
              date: dateStr,
              names: newNames,
              teams: {},
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
              syncSource: 'nursing_schedule', // ✨ 標記創建來源
            })
            createdCount++
            logger.info(`  └─ [創建] ${dateStr} 的新分組文件已創建`)
          }
        }
      }

      // ✨ 新增：清理重複文件（只處理今天以後的）
      const cleanupQuery = db
        .collection('nurse_assignments')
        .where('date', '>=', todayStr)
        .where('date', '<=', `${yearMonth}-31`)

      const allDocs = await cleanupQuery.get()
      const dateDocMap = new Map()

      // 找出所有重複的文件
      allDocs.docs.forEach((doc) => {
        const docData = doc.data()
        const date = docData.date
        if (date && date >= todayStr) {
          // ✨ 再次確認日期
          if (!dateDocMap.has(date)) {
            dateDocMap.set(date, [])
          }
          dateDocMap.set(date, [...dateDocMap.get(date), doc])
        }
      })

      // 合併並刪除重複文件
      let mergedCount = 0
      for (const [date, docs] of dateDocMap.entries()) {
        if (docs.length > 1) {
          logger.warn(`  └─ 發現 ${date} 有 ${docs.length} 個重複文件，進行合併...`)

          // 合併所有文件的資料
          let mergedTeams = {}
          let mergedNames = {}
          let keepDocId = date // 使用日期作為保留的文件 ID

          docs.forEach((doc) => {
            const data = doc.data()
            // 合併 teams
            if (data.teams) {
              mergedTeams = { ...mergedTeams, ...data.teams }
            }
            // 合併 names（後面的會覆蓋前面的）
            if (data.names) {
              mergedNames = { ...mergedNames, ...data.names }
            }
          })

          // 更新或創建標準文件
          batch.set(db.collection('nurse_assignments').doc(keepDocId), {
            date: date,
            teams: mergedTeams,
            names: mergedNames,
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: FieldValue.serverTimestamp(),
            syncSource: 'nursing_schedule_cleanup', // ✨ 標記合併來源
          })

          // 刪除所有非標準 ID 的文件
          docs.forEach((doc) => {
            if (doc.id !== keepDocId) {
              batch.delete(doc.ref)
              logger.info(`    └─ 刪除重複文件: ${doc.id}`)
            }
          })
          mergedCount++
        }
      }

      if (updatedCount > 0 || createdCount > 0 || mergedCount > 0) {
        await batch.commit()
        logger.info(
          `✅ [SyncManualGroups-v5.3] 批次提交完成！\n` +
            `  - 更新: ${updatedCount} 份\n` +
            `  - 創建: ${createdCount} 份\n` +
            `  - 合併: ${mergedCount} 組重複\n` +
            `  - 跳過: ${skippedCount} 份歷史資料`,
        )
      } else {
        logger.info(
          `✅ [SyncManualGroups-v5.3] 檢查完畢，無需更新。` + `（跳過 ${skippedCount} 份歷史資料）`,
        )
      }
    } catch (error) {
      logger.error(`❌ [SyncManualGroups-v5.3] 同步/創建 ${yearMonth} 的分組文件時發生錯誤:`, error)
    }
    return null
  },
)
