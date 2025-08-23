// functions/index.js (Firebase Auth 遷移最終版 - 完整程式碼)

// 引入 V2 函式，這是新的標準
const { setGlobalOptions } = require('firebase-functions/v2')
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const {
  onDocumentWritten,
  onDocumentCreated,
  onDocumentDeleted,
} = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')

const admin = require('firebase-admin')
const axios = require('axios') // 確保 axios 被引入

// --- 初始化 Firebase Admin SDK ---
// 確保只初始化一次
if (!admin.apps.length) {
  admin.initializeApp()
}
const db = admin.firestore()
const { FieldValue } = require('firebase-admin/firestore')

// 設定全域選項 (V2 Functions)
setGlobalOptions({ region: 'asia-east1', timeoutSeconds: 60, memory: '256MiB', maxInstances: 100 })

// ===================================================================
// ⚙️ 輔助函式 (Helper Functions)
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

// ===================================================================
// ✨✨✨ 新增/修改/移除 的函式區塊 ✨✨✨
// ===================================================================

/**
 * [新增] 建立新使用者 (Auth + Firestore)
 * 由管理員從前端呼叫
 */
exports.createUser = onCall(async (request) => {
  // 1. 權限檢查：只有 admin 才能呼叫此函式
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', '只有管理員才能新增使用者。')
  }

  // 2. 參數驗證
  const { username, password, name, role, title } = request.data
  if (!username || !password || !name || !role) {
    throw new HttpsError('invalid-argument', '缺少必要的欄位 (username, password, name, role)。')
  }
  if (password.length < 6) {
    throw new HttpsError('invalid-argument', '密碼長度至少需要 6 個字元。')
  }
  const email = `${username}@example.com`

  try {
    // 3. 在 Authentication 中建立使用者
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
    })

    const uid = userRecord.uid

    // 4. 設定自訂權限 (Custom Claims)
    await admin.auth().setCustomUserClaims(uid, { role: role, title: title || '' })

    // 5. 在 Firestore 中建立對應的使用者資料文件
    await db
      .collection('users')
      .doc(uid)
      .set({
        username: username,
        name: name,
        role: role,
        title: title || '',
        email: email,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

    return { success: true, uid: uid, message: `使用者 ${name} 已成功建立。` }
  } catch (error) {
    logger.error('建立使用者失敗:', error)
    if (error.code === 'auth/email-already-exists') {
      throw new HttpsError('already-exists', '這個使用者名稱已經被註冊了。')
    }
    throw new HttpsError('internal', '建立使用者時發生未知錯誤。')
  }
})

/**
 * [刪除] 刪除使用者 (Auth + Firestore)
 * 由管理員從前端呼叫
 */
exports.deleteUser = onCall(async (request) => {
  // 1. 權限檢查
  if (request.auth.token.role !== 'admin') {
    throw new HttpsError('permission-denied', '只有管理員才能刪除使用者。')
  }

  const uid = request.data.uid
  if (!uid) {
    throw new HttpsError('invalid-argument', '缺少 uid 參數。')
  }

  // 安全性檢查：防止管理員誤刪自己的帳號
  if (request.auth.uid === uid) {
    throw new HttpsError('failed-precondition', '無法刪除您自己的帳號。')
  }

  try {
    // 2. 從 Authentication 中刪除使用者
    await admin.auth().deleteUser(uid)

    // 3. 從 Firestore 中刪除文件
    await db.collection('users').doc(uid).delete()

    return { success: true, message: `UID 為 ${uid} 的使用者已成功刪除。` }
  } catch (error) {
    logger.error('刪除使用者失敗:', error)
    if (error.code === 'auth/user-not-found') {
      await db.collection('users').doc(uid).delete()
      return { success: true, message: `已從 Firestore 清理 UID 為 ${uid} 的使用者資料。` }
    }
    throw new HttpsError('internal', '刪除使用者時發生未知錯誤。')
  }
})

// [獲取] 獲取台灣行事曆資料
exports.getTaiwanHolidays = onCall(async (request) => {
  const year = request.data.year
  if (!year || typeof year !== 'number') {
    throw new HttpsError('invalid-argument', '函式必須帶有一個數字類型的 "year" 參數。')
  }

  const rocYear = year - 1911
  const targetApiUrl = `https://data.ntpc.gov.tw/api/v1/rest/datastore/382000000A-000077-002?year=${rocYear}`

  try {
    const apiResponse = await axios.get(targetApiUrl)
    return apiResponse.data
  } catch (error) {
    logger.error('從政府 API 獲取資料時發生錯誤:', error)
    throw new HttpsError('internal', '無法獲取假日資料。')
  }
})

// ===================================================================
// 🔄 Firestore 文件觸發器
// ===================================================================
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

exports.syncMasterScheduleToFuture = onDocumentWritten(
  { document: 'base_schedules/MASTER_SCHEDULE', timeoutSeconds: 540, memory: '1GiB' },
  async (event) => {
    logger.info('🚀 [UnifiedSync] 統一同步流程啟動')

    if (!event.data.after.exists) {
      logger.info('✅ MASTER_SCHEDULE 文件已被刪除，無需執行同步。')
      return null
    }
    try {
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
      const result = await reapplyAllExceptionsInternal(baseSchedules)
      logger.info(`[UnifiedSync] 步驟 2/3 完成：已套用 ${result.processed} 個調班`)

      const finalSchedules = result.schedulesToWrite
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
      throw error
    }
    return null
  },
)

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
      } else if (exceptionData.type === 'SUSPEND') {
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
      } else if (exceptionData.type === 'ADD_SESSION') {
        const { to, patientId, patientName } = exceptionData
        if (!to?.goalDate || !to?.bedNum || !to?.shiftCode) {
          throw new Error('ADD_SESSION 調班資料不完整：缺少目標資訊')
        }

        const targetDate = to.goalDate
        const scheduleRef = db.collection('schedules').doc(targetDate)
        const targetKey = getScheduleKey(to.bedNum, to.shiftCode)

        await db.runTransaction(async (transaction) => {
          const scheduleDoc = await transaction.get(scheduleRef)
          let hasConflict = false

          const newSlotData = {
            patientId: patientId,
            patientName: patientName,
            shiftId: to.shiftCode,
            manualNote: `(臨時加洗)`,
            exceptionId: exceptionId,
            appliedAt: FieldValue.serverTimestamp(),
          }

          if (scheduleDoc.exists) {
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
      const updateData = {
        status: 'applied',
        appliedAt: FieldValue.serverTimestamp(),
        processedDates: processedDates,
        conflicts: conflicts.length > 0 ? conflicts : null,
        conflictCount: conflicts.length,
        applyMethod: 'realtime',
      }
      await exceptionDoc.ref.update(updateData)
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
// ⏰ 排程觸發器
// ===================================================================
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

// ===================================================================
// 🔬 檢驗報告相關函式
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

// ===================================================================
// 🗑️ [已移除] exports.customLogin and exports.changeUserPassword
// ===================================================================
// 這兩個函式已被移除，因為登入和密碼變更現在由前端的 Firebase Auth SDK 安全地處理。
