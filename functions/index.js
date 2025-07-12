const { onSchedule } = require('firebase-functions/v2/scheduler')
const { logger } = require('firebase-functions')
const admin = require('firebase-admin')

// 初始化 Firebase Admin SDK
admin.initializeApp()

// 取得 Firestore 資料庫的實例
const db = admin.firestore()

/**
 * @name checkExpiredMemos
 * @description 每日定時執行的雲端函式，用來檢查並更新已到期的備忘錄。
 * 執行時間：每天凌晨 2:00 (台北時區)
 */
exports.checkExpiredMemos = onSchedule(
  {
    schedule: 'every day 02:00',
    timeZone: 'Asia/Taipei', // 確保使用台北時區
  },
  async (event) => {
    logger.info('開始執行每日備忘錄到期檢查...')

    // 1. 取得今天的日期字串 (格式：YYYY-MM-DD)
    const today = new Date()
    const year = today.getFullYear()
    const month = (today.getMonth() + 1).toString().padStart(2, '0')
    const day = today.getDate().toString().padStart(2, '0')
    const todayStr = `${year}-${month}-${day}`

    // 2. 建立查詢：
    //    - 找尋 'memos' 集合
    //    - 條件1: status 必須是 'pending' (待處理)
    //    - 條件2: targetDate (到期日) 欄位必須存在且小於或等於今天
    const query = db
      .collection('memos')
      .where('status', '==', 'pending')
      .where('targetDate', '<=', todayStr)

    // 3. 執行查詢
    const snapshot = await query.get()

    // 如果沒有任何文件符合條件，就提前結束
    if (snapshot.empty) {
      logger.info('沒有找到已到期的備忘錄，任務結束。')
      return null
    }

    // 4. 準備批次更新
    const batch = db.batch()
    snapshot.forEach((doc) => {
      logger.info(`備忘錄 ${doc.id} 已到期，準備更新狀態...`)
      batch.update(doc.ref, { status: 'expired' })
    })

    // 5. 提交批次更新
    await batch.commit()

    logger.info(`成功更新了 ${snapshot.size} 筆備忘錄為 'expired'。`)
    return null
  },
)
