// 檔案路徑: functions/index.js (最終修正、完整無省略版)

// 引入 v2 版本的函式模組
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentUpdated } = require('firebase-functions/v2/firestore')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash')

// 初始化 Firebase Admin SDK
admin.initializeApp()

// 取得 Firestore 資料庫的實例
const db = admin.firestore()
// ✨ --- 新增這一行 --- ✨
// 明確地從 admin.firestore 中解構出 FieldValue
const { FieldValue } = require('firebase-admin/firestore')

// ===================================================================
// Helper Functions (輔助函式)
// ===================================================================

/**
 * 格式化日期為 'YYYY-MM-DD' 字串
 * @param {Date} date - 日期物件
 * @returns {string}
 */
function formatDateForQuery(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * ✨ --- 修正後的輔助函式 --- ✨
 * 計算兩個排程物件之間的差異
 * @param {object} beforeSchedule - 更新前的 schedule 物件
 * @param {object} afterSchedule - 更新後的 schedule 物件
 * @returns {{added: Map<string, object>, removed: Map<string, object>, modified: Array<object>}} - 回傳差異集
 */
function calculateScheduleDiff(beforeSchedule, afterSchedule) {
  const beforeSlots = new Map(Object.entries(beforeSchedule))
  const afterSlots = new Map(Object.entries(afterSchedule))
  const diff = {
    added: new Map(),
    removed: new Map(),
    modified: [], // 新增：用於追蹤內容變更
  }

  // 檢查 afterSlots 中的每一項
  afterSlots.forEach((afterSlot, slotId) => {
    if (beforeSlots.has(slotId)) {
      const beforeSlot = beforeSlots.get(slotId)
      // 病人ID不同，視為一個離開，一個進入
      if (afterSlot.patientId !== beforeSlot.patientId) {
        // 如果 patientId 是 null 或 undefined，代表是清空床位或新增到空床位
        if (beforeSlot.patientId) {
          diff.removed.set(slotId, beforeSlot)
        }
        if (afterSlot.patientId) {
          diff.added.set(slotId, afterSlot)
        }
      } else if (afterSlot.patientId && !_.isEqual(afterSlot, beforeSlot)) {
        // ID相同，但內容不同 (例如備註修改)
        diff.modified.push({ slotId, data: afterSlot })
      }
    } else {
      // 在 before 中不存在，是新增
      if (afterSlot.patientId) {
        diff.added.set(slotId, afterSlot)
      }
    }
  })

  // 檢查 beforeSlots 中哪些項目在 afterSlots 中消失了
  beforeSlots.forEach((beforeSlot, slotId) => {
    if (beforeSlot.patientId && !afterSlots.has(slotId)) {
      diff.removed.set(slotId, beforeSlot)
    }
  })

  return diff
}

// ===================================================================
// Scheduled Functions (定時執行的函式)
// ===================================================================

/**
 * @name checkExpiredMemos (v2 語法)
 * @description 每日定時執行的雲端函式，用來檢查並更新已到期的備忘錄。
 */
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('開始執行每日備忘錄到期檢查...')

    const today = new Date()
    const todayStr = formatDateForQuery(today)

    try {
      const query = db
        .collection('memos')
        .where('status', '==', 'pending')
        .where('targetDate', '<=', todayStr)

      const snapshot = await query.get()

      if (snapshot.empty) {
        logger.info('沒有找到已到期的備忘錄，任務結束。')
        return null
      }

      const batch = db.batch()
      snapshot.forEach((doc) => {
        logger.info(`備忘錄 ${doc.id} 已到期，準備更新狀態...`)
        batch.update(doc.ref, { status: 'expired' })
      })

      await batch.commit()
      logger.info(`成功更新了 ${snapshot.size} 筆備忘錄為 'expired'。`)
    } catch (error) {
      logger.error('備忘錄到期檢查失敗:', error)
    }
    return null
  },
)

/**
 * ✨ --- 修正後的函式 --- ✨
 * @name initializeFutureSchedules
 * @description 每日定時執行的雲端函式，確保未來30天的排程文件存在，並從總表複製內容。
 * 執行時間：每天凌晨 3:00 (台北時區)
 */
exports.initializeFutureSchedules = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('開始執行未來排程文件初始化與同步任務...')
    const schedulesRef = db.collection('schedules')
    const today = new Date()
    const datesToCheck = []

    for (let i = 0; i < 30; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck.push(formatDateForQuery(targetDate))
    }

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.warn('找不到 MASTER_SCHEDULE 範本，無法初始化排程。')
        return null
      }
      const masterSchedule = masterScheduleDoc.data().schedule || {}

      const snapshot = await schedulesRef.where('date', 'in', datesToCheck).get()
      const existingDates = new Set(snapshot.docs.map((doc) => doc.data().date))

      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('所有必要的未來排程均已存在，無需初始化。')
        return null
      }

      logger.info(`發現 ${datesToCreate.length} 個缺失的排程文件，正在根據總表創建...`)

      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const dateParts = dateStr.split('-')
        const targetDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
        const dayOfWeek = targetDate.getDay()
        const masterDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

        const dailySchedule = {}
        for (const slotId in masterSchedule) {
          const slotDayIndex = parseInt(slotId.split('-')[2], 10)
          if (slotDayIndex === masterDayIndex) {
            dailySchedule[slotId] = masterSchedule[slotId]
          }
        }

        const newScheduleRef = schedulesRef.doc()
        batch.set(newScheduleRef, {
          date: dateStr,
          schedule: dailySchedule,
          names: {},
          // ✨ --- 修正這裡的語法 --- ✨
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        })
      })

      await batch.commit()
      logger.info(`成功創建了 ${datesToCreate.length} 個排程文件。`)
    } catch (error) {
      logger.error('排程初始化失敗:', error)
    }
    return null
  },
)

// ===================================================================
// Callable Functions (可由前端呼叫的函式)
// ===================================================================

/**
 * @name customLogin (v2 語法)
 * @description 自訂登入的雲端函式，驗證成功後回傳 custom token。
 */
exports.customLogin = onCall(async (request) => {
  const { username, password } = request.data

  if (!username || !password) {
    throw new HttpsError('invalid-argument', '請提供帳號和密碼。')
  }

  try {
    const usersRef = db.collection('users')
    const snapshot = await usersRef.where('username', '==', username).limit(1).get()

    if (snapshot.empty) {
      throw new HttpsError('not-found', '帳號不存在。')
    }

    const userDoc = snapshot.docs[0]
    const userData = userDoc.data()

    if (userData.password !== password) {
      throw new HttpsError('unauthenticated', '密碼錯誤。')
    }

    const uid = userDoc.id
    const customToken = await admin.auth().createCustomToken(uid, {
      role: userData.role,
      name: userData.name,
    })

    return { token: customToken }
  } catch (error) {
    logger.error('Login function error:', error)
    if (error instanceof HttpsError) {
      throw error
    }
    throw new HttpsError('internal', '伺服器發生未知錯誤。')
  }
})

// ===================================================================
// Firestore Triggers (資料庫觸發的函式)
// ===================================================================

/**
 * ✨ --- 修正後的函式 --- ✨
 * @name syncMasterScheduleToFuture
 * @description 當總床位表(MASTER_SCHEDULE)更新時，自動同步未來30天的排程
 */
exports.syncMasterScheduleToFuture = onDocumentUpdated(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('✅ [syncMasterSchedule] 觸發器成功啟動！')

    const beforeData = event.data.before.data()
    const afterData = event.data.after.data()

    if (_.isEqual(beforeData.schedule, afterData.schedule)) {
      logger.info('✅ [syncMasterSchedule] Schedule 物件無實質變化，無需同步。')
      return null
    }

    const diff = calculateScheduleDiff(beforeData.schedule || {}, afterData.schedule || {})

    if (diff.added.size === 0 && diff.removed.size === 0 && diff.modified.length === 0) {
      logger.info('✅ [syncMasterSchedule] 經計算後無實質排班變動，無需同步。')
      return null
    }

    logger.info('🔍 [syncMasterSchedule] 計算出的變更集:', {
      added: diff.added.size,
      removed: diff.removed.size,
      modified: diff.modified.length,
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const futureDates = []
    for (let i = 0; i < 30; i++) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + i)
      futureDates.push(formatDateForQuery(targetDate))
    }

    logger.info(`⏳ [syncMasterSchedule] 正在查詢 ${futureDates.length} 天的未來排程...`)
    const schedulesRef = db.collection('schedules')
    const querySnapshot = await schedulesRef.where('date', 'in', futureDates).get()

    if (querySnapshot.empty) {
      logger.info('📭 [syncMasterSchedule] 未來30天內沒有已存在的排程文件，無需同步。')
      return null
    }

    const batch = db.batch()
    let updatedDocCount = 0

    querySnapshot.forEach((doc) => {
      const scheduleDoc = doc.data()
      const currentSchedule = scheduleDoc.schedule || {}
      let hasChanges = false

      const dateParts = scheduleDoc.date.split('-')
      const docDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2])
      const dayOfWeek = docDate.getDay()
      const scheduleDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

      const processSlot = (slotId, operation) => {
        const masterDayIndex = parseInt(slotId.split('-')[2], 10)
        if (scheduleDayIndex === masterDayIndex) {
          if (operation.type === 'remove') {
            if (
              currentSchedule[slotId] &&
              currentSchedule[slotId].patientId === operation.patientId
            ) {
              delete currentSchedule[slotId]
              hasChanges = true
            }
          } else if (operation.type === 'add') {
            if (!currentSchedule[slotId]) {
              currentSchedule[slotId] = operation.data
              hasChanges = true
            }
          } else if (operation.type === 'modify') {
            if (currentSchedule[slotId]) {
              currentSchedule[slotId] = { ...currentSchedule[slotId], ...operation.data }
              hasChanges = true
            }
          }
        }
      }

      diff.removed.forEach((slotData, slotId) => {
        processSlot(slotId, { type: 'remove', patientId: slotData.patientId })
      })

      diff.added.forEach((slotData, slotId) => {
        processSlot(slotId, { type: 'add', data: slotData })
      })

      diff.modified.forEach(({ slotId, data }) => {
        processSlot(slotId, { type: 'modify', data })
      })

      if (hasChanges) {
        logger.info(
          `✍️ [syncMasterSchedule] 文件 ${doc.id} (${scheduleDoc.date}) 有變動，加入批量更新。`,
        )
        const docRef = schedulesRef.doc(doc.id)
        batch.update(docRef, {
          schedule: currentSchedule,
          // ✨ --- 修正這裡的語法 --- ✨
          updatedAt: FieldValue.serverTimestamp(),
        })
        updatedDocCount++
      }
    })

    if (updatedDocCount > 0) {
      logger.info(`🚀 [syncMasterSchedule] 準備提交更新，共 ${updatedDocCount} 份文件...`)
      return batch.commit().then(() => {
        logger.info(`✅ [syncMasterSchedule] 同步完成！成功更新 ${updatedDocCount} 份未來排程。`)
      })
    } else {
      logger.info('✅ [syncMasterSchedule] 檢查完畢，未來排程無需進行同步操作。')
      return null
    }
  },
)
