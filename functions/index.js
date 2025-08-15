// 【優化後的完整排程管理函式 - 2025-08-15】
const { onCall, HttpsError, onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onTaskDispatched } = require('firebase-functions/v2/tasks') // 添加 Task Queue import
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

// 新增輔助函式：查找例外
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
// 優化後的主要同步函式
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

// --- ✨✨✨ 新例外申請處理器 (簡化版，直接使用 Cloud Tasks) ✨✨✨ ---
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
