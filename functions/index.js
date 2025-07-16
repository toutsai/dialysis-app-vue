// 檔案路徑: functions/index.js (修改後，新增即時同步功能)

// 引入 v2 版本的函式模組
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { onDocumentUpdated } = require('firebase-functions/v2/firestore') // ✨ 新增：引入 Firestore v2 觸發器
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')
const _ = require('lodash') // ✨ 新增：引入 lodash 用於物件比對

// 初始化 Firebase Admin SDK
admin.initializeApp()

// 取得 Firestore 資料庫的實例
const db = admin.firestore()

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
 * ✨ --- 新增的輔助函式 --- ✨
 * 計算兩個排程物件之間的差異
 * @param {object} beforeSchedule - 更新前的 schedule 物件
 * @param {object} afterSchedule - 更新後的 schedule 物件
 * @returns {{added: Map<string, object>, removed: Map<string, object>, moved: Array<object>}} - 回傳差異集
 */
function calculateScheduleDiff(beforeSchedule, afterSchedule) {
  const beforeSlots = new Map(Object.entries(beforeSchedule))
  const afterSlots = new Map(Object.entries(afterSchedule))
  const diff = {
    added: new Map(),
    removed: new Map(),
    moved: [],
  }

  // 使用 Set 來收集所有相關的 patientId，避免重複處理
  const allPatientIds = new Set([
    ...Object.values(beforeSchedule).map((s) => s.patientId),
    ...Object.values(afterSchedule).map((s) => s.patientId),
  ])

  allPatientIds.forEach((patientId) => {
    if (!patientId) return

    // 找到該病人在更新前和更新後的位置
    const beforeSlotEntry = [...beforeSlots.entries()].find(
      ([, slot]) => slot.patientId === patientId,
    )
    const afterSlotEntry = [...afterSlots.entries()].find(
      ([, slot]) => slot.patientId === patientId,
    )

    const beforeSlotId = beforeSlotEntry ? beforeSlotEntry[0] : undefined
    const afterSlotId = afterSlotEntry ? afterSlotEntry[0] : undefined

    if (!beforeSlotId && afterSlotId) {
      // 如果之前沒有，現在有了 -> 新增
      diff.added.set(afterSlotId, afterSlots.get(afterSlotId))
    } else if (beforeSlotId && !afterSlotId) {
      // 如果之前有，現在沒有了 -> 移除
      diff.removed.set(beforeSlotId, beforeSlots.get(beforeSlotId))
    } else if (beforeSlotId && afterSlotId && beforeSlotId !== afterSlotId) {
      // 如果前後都有，但位置不同 -> 移動
      diff.moved.push({
        patientId,
        from: beforeSlotId,
        to: afterSlotId,
        data: afterSlots.get(afterSlotId),
      })
    }
    // 如果前後位置相同，則視為無變動，不處理
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
 * ✨ --- 修改後的函式 --- ✨
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
      // 1. 取得總床位表範本
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.warn('找不到 MASTER_SCHEDULE 範本，無法初始化排程。')
        return null
      }
      const masterSchedule = masterScheduleDoc.data().schedule || {}

      // 2. 找出已存在的排程日期
      const snapshot = await schedulesRef.where('date', 'in', datesToCheck).get()
      const existingDates = new Set(snapshot.docs.map((doc) => doc.data().date))

      // 3. 找出需要新創建的日期
      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('所有必要的未來排程均已存在，無需初始化。')
        return null
      }

      logger.info(`發現 ${datesToCreate.length} 個缺失的排程文件，正在根據總表創建...`)

      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const targetDate = new Date(dateStr)
        // JS 的 getDay() 週日是0，我們需要對應到總表的 index 6
        const dayOfWeek = targetDate.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
        const masterDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

        // 從總表中篩選出符合當天星期的排班
        const dailySchedule = {}
        for (const slotId in masterSchedule) {
          const slotDayIndex = parseInt(slotId.split('-')[2], 10)
          if (slotDayIndex === masterDayIndex) {
            dailySchedule[slotId] = masterSchedule[slotId]
          }
        }

        // 創建新的排程文件
        const newScheduleRef = schedulesRef.doc() // 自動產生 ID
        batch.set(newScheduleRef, {
          date: dateStr,
          schedule: dailySchedule,
          names: {}, // 預設為空，待護理師填寫
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
 * ✨ --- 新增的函式 --- ✨
 * @name syncMasterScheduleToFuture
 * @description 當總床位表(MASTER_SCHEDULE)更新時，自動同步未來30天的排程
 */
exports.syncMasterScheduleToFuture = onDocumentUpdated(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🔄 [syncMasterSchedule] MASTER_SCHEDULE 更新，觸發同步。')

    const beforeData = event.data.before.data()
    const afterData = event.data.after.data()

    if (_.isEqual(beforeData.schedule, afterData.schedule)) {
      logger.info('✅ Schedule 物件無實質變化，無需同步。')
      return null
    }

    const diff = calculateScheduleDiff(beforeData.schedule || {}, afterData.schedule || {})

    if (diff.added.size === 0 && diff.removed.size === 0 && diff.moved.length === 0) {
      logger.info('✅ 經計算後無實質排班變動，無需同步。')
      return null
    }

    logger.info('🔍 變更集:', {
      added: diff.added.size,
      removed: diff.removed.size,
      moved: diff.moved.length,
    })

    const today = new Date()
    today.setHours(0, 0, 0, 0) // 確保從今天的開始計算
    const futureDates = []
    for (let i = 0; i < 30; i++) {
      const targetDate = new Date(today)
      targetDate.setDate(today.getDate() + i)
      futureDates.push(formatDateForQuery(targetDate))
    }

    logger.info(`⏳ 正在查詢 ${futureDates.length} 天的未來排程...`)
    const schedulesRef = db.collection('schedules')
    const querySnapshot = await schedulesRef.where('date', 'in', futureDates).get()

    if (querySnapshot.empty) {
      logger.info('📭 未來30天內沒有已存在的排程文件，無需同步。')
      return null
    }

    const batch = db.batch()
    let updatedDocCount = 0

    querySnapshot.forEach((doc) => {
      logger.info(`✍️  準備更新 ${doc.id} (${doc.data().date})...`)
      const scheduleDoc = doc.data()
      const currentSchedule = scheduleDoc.schedule || {}
      let hasChanges = false

      // 處理被移除的排班
      diff.removed.forEach((slotData, slotId) => {
        const dayOfWeek = new Date(scheduleDoc.date).getUTCDay() // 0=Sun, 1=Mon...
        const masterDayIndex = parseInt(slotId.split('-')[2], 10)
        if ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) === masterDayIndex) {
          if (currentSchedule[slotId] && currentSchedule[slotId].patientId === slotData.patientId) {
            delete currentSchedule[slotId]
            hasChanges = true
          }
        }
      })

      // 處理新增的排班
      diff.added.forEach((slotData, slotId) => {
        const dayOfWeek = new Date(scheduleDoc.date).getUTCDay()
        const masterDayIndex = parseInt(slotId.split('-')[2], 10)
        if ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) === masterDayIndex) {
          if (!currentSchedule[slotId]) {
            currentSchedule[slotId] = slotData
            hasChanges = true
          }
        }
      })

      // 處理移動的排班
      diff.moved.forEach((move) => {
        const dayOfWeek = new Date(scheduleDoc.date).getUTCDay()
        const fromMasterDayIndex = parseInt(move.from.split('-')[2], 10)
        const toMasterDayIndex = parseInt(move.to.split('-')[2], 10)

        if ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) === fromMasterDayIndex) {
          if (
            currentSchedule[move.from] &&
            currentSchedule[move.from].patientId === move.patientId
          ) {
            delete currentSchedule[move.from]
            hasChanges = true
          }
        }
        if ((dayOfWeek === 0 ? 6 : dayOfWeek - 1) === toMasterDayIndex) {
          if (!currentSchedule[move.to]) {
            currentSchedule[move.to] = move.data
            hasChanges = true
          }
        }
      })

      if (hasChanges) {
        const docRef = schedulesRef.doc(doc.id)
        batch.update(docRef, {
          schedule: currentSchedule,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
        updatedDocCount++
      }
    })

    if (updatedDocCount > 0) {
      logger.info(`🚀 準備提交更新，共 ${updatedDocCount} 份文件...`)
      return batch.commit().then(() => {
        logger.info(`✅ 同步完成！成功更新 ${updatedDocCount} 份未來排程。`)
      })
    } else {
      logger.info('✅ 檢查完畢，未來排程無需進行同步操作。')
      return null
    }
  },
)
