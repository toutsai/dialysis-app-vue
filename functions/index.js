// 檔案路徑: functions/index.js (最終、最完整的版本)

// 引入 v2 版本的函式模組
const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')

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
    return null
  },
)

/**
 * ✨ --- 新增的函式 --- ✨
 * @name initializeFutureSchedules
 * @description 每日定時執行的雲端函式，確保未來30天的排程文件存在。
 * 執行時間：每天凌晨 3:00 (台北時區)
 */
exports.initializeFutureSchedules = onSchedule(
  {
    schedule: 'every day 03:00',
    timeZone: 'Asia/Taipei',
  },
  async (event) => {
    logger.info('開始執行未來排程文件初始化任務...')
    const schedulesRef = db.collection('schedules')
    const today = new Date()
    const datesToCheck = []

    // 產生未來30天的日期字串
    for (let i = 0; i < 30; i++) {
      const targetDate = new Date()
      targetDate.setDate(today.getDate() + i)
      datesToCheck.push(formatDateForQuery(targetDate))
    }

    try {
      const snapshot = await schedulesRef.where('date', 'in', datesToCheck).get()
      const existingDates = new Set(snapshot.docs.map((doc) => doc.data().date))

      const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

      if (datesToCreate.length === 0) {
        logger.info('所有必要的未來排程均已存在，無需初始化。')
        return null
      }

      logger.info(`發現 ${datesToCreate.length} 個缺失的排程文件，正在創建...`)

      const batch = db.batch()
      datesToCreate.forEach((dateStr) => {
        const newScheduleRef = schedulesRef.doc()
        batch.set(newScheduleRef, {
          date: dateStr,
          schedule: {},
          names: {},
        })
      })

      await batch.commit()
      logger.info(`成功創建了 ${datesToCreate.length} 個空白排程文件。`)
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
  // 在 v2 中，傳入的資料在 request.data
  const { username, password } = request.data

  if (!username || !password) {
    // 在 v2 中，直接拋出 HttpsError
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
// ✨ 【診斷用】請在檔案末尾新增這個函式 ✨
// ===================================================================

/**
 * @name testTokenCreation
 * @description 一個極其簡單的函式，僅用於測試 createCustomToken 的權限問題。
 */
exports.testTokenCreation = onCall(async (request) => {
  logger.info('正在執行權限診斷函式 testTokenCreation...')

  const testUid = 'test-user-for-debug-12345' // 一個寫死的測試 UID

  try {
    // 我們只執行這一個核心動作，不讀取任何資料庫
    const customToken = await admin.auth().createCustomToken(testUid)

    logger.info('成功產生測試 Token！權限檢查通過。Token:', customToken)

    // 如果成功，回傳一個成功的訊息和 token
    return {
      success: true,
      message: 'Token creation successful!',
      token: customToken,
    }
  } catch (error) {
    // 如果失敗，將最詳細的錯誤訊息記錄下來並回傳
    logger.error('testTokenCreation 函式發生錯誤:', error)
    throw new HttpsError('internal', error.message, error)
  }
})
