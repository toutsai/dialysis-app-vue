// 檔案路徑: functions/index.js (最終修正，確保展程邏輯完美 - 完整無省略)

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

/**
 * 根據總表規則，產生某一天的具體排程
 * @param {object} masterRules - 完整的總表規則物件
 * @param {Date} targetDate - 目標日期物件
 * @returns {object} - 當天的 schedule 物件
 */
function generateDailyScheduleFromRules(masterRules, targetDate) {
  const dailySchedule = {}
  const dayOfWeek = targetDate.getDay()
  const systemDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1

  for (const ruleId in masterRules) {
    const rule = masterRules[ruleId]
    if (!rule || !rule.freq) continue

    const freqDays = FREQ_MAP_TO_DAY_INDEX[rule.freq] || []

    if (freqDays.includes(systemDayIndex)) {
      const parts = ruleId.split('-')
      const shiftIndex = parseInt(parts.pop(), 10)
      const bedNum = parts.join('-')

      const shiftCode = SHIFTS[shiftIndex]

      if (bedNum && shiftCode) {
        const dailyShiftId = `bed-${bedNum}-${shiftCode}`

        dailySchedule[dailyShiftId] = {
          patientId: rule.patientId,
          shiftId: shiftCode,
          autoNote: rule.autoNote || '',
          manualNote: rule.manualNote || '',
          baseRuleId: ruleId,
        }
      }
    }
  }
  return dailySchedule
}

// ===================================================================
// Scheduled Functions (定時執行的函式)
// ===================================================================

/**
 * @name checkExpiredMemos
 * @description 檢查並更新已到期的備忘錄
 */
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('開始執行每日備忘錄到期檢查...')
    const todayStr = formatDateForQuery(new Date())
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
 * @name initializeFutureSchedules
 * @description 每日確保未來60天的排程文件存在
 */
exports.initializeFutureSchedules = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('🚀 [initializeFutureSchedules] 開始執行未來60天排程初始化...')
    const schedulesRef = db.collection('schedules')
    const today = new Date()
    const datesToCheck = []

    for (let i = 0; i < 60; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck.push(formatDateForQuery(targetDate))
    }

    try {
      const masterScheduleDoc = await db.collection('base_schedules').doc('MASTER_SCHEDULE').get()
      if (!masterScheduleDoc.exists) {
        logger.warn('⚠️ 找不到 MASTER_SCHEDULE，無法初始化。')
        return null
      }
      const masterRules = masterScheduleDoc.data().schedule || {}

      const snapshot = await schedulesRef.where('date', 'in', datesToCheck).get()
      const existingDates = new Set(snapshot.docs.map((doc) => doc.data().date))
      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('✅ 所有未來60天排程均已存在。')
        return null
      }

      logger.info(`⏳ 發現 ${datesToCreate.length} 個缺失排程，正在創建...`)
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
      logger.info(`✅ 成功創建了 ${datesToCreate.length} 個排程文件。`)
    } catch (error) {
      logger.error('❌ 排程初始化失敗:', error)
    }
    return null
  },
)

// ===================================================================
// Callable Functions (可由前端呼叫的函式)
// ===================================================================

/**
 * @name customLogin
 * @description 自訂登入的雲端函式
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
 * @name syncMasterScheduleToFuture
 * @description 當總表更新時，同步未來60天的排程
 */
exports.syncMasterScheduleToFuture = onDocumentUpdated(
  'base_schedules/MASTER_SCHEDULE',
  async (event) => {
    logger.info('🚀 [syncMasterSchedule] 觸發器成功啟動！')

    const beforeSchedule = event.data.before.data().schedule || {}
    const afterSchedule = event.data.after.data().schedule || {}

    if (_.isEqual(beforeSchedule, afterSchedule)) {
      logger.info('✅ 總表規則無實質變化，無需同步。')
      return null
    }

    logger.info('📝 偵測到總表規則變動，開始同步未來60天排程...')
    const latestRules = afterSchedule
    const batch = db.batch()

    for (let i = 0; i < 60; i++) {
      const targetDate = new Date()
      targetDate.setHours(0, 0, 0, 0)
      targetDate.setDate(targetDate.getDate() + i)
      const dateStr = formatDateForQuery(targetDate)
      const newDailySchedule = generateDailyScheduleFromRules(latestRules, targetDate)
      const dailyDocRef = db.collection('schedules').doc(dateStr)

      // [核心修正] 使用 .update() 方法
      // .update() 會用提供的物件「完全替換」指定的欄位。
      // 在這裡，它會將 Firestore 中舊的整個 'schedule' map，
      // 完全替換為我們新產生的 'newDailySchedule' map。
      // 這就實現了真正的「覆蓋」，而不是「合併」。
      // 前提是 `initializeFutureSchedules` 函式確保了這些文件都已存在。
      batch.update(dailyDocRef, {
        schedule: newDailySchedule,
        lastSynced: FieldValue.serverTimestamp(),
      })
    }

    try {
      await batch.commit()
      logger.info('✅ 同步完成！已使用最新規則更新未來60天的排程。')
    } catch (error) {
      logger.error('❌ 同步未來排程時發生錯誤:', error)
      logger.error(
        '⚠️ 錯誤可能原因：某個日期的排程文件不存在，導致 update 操作失敗。請檢查 initializeFutureSchedules 是否正常運作。',
      )
    }

    return null
  },
)
