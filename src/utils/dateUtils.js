// functions/utils/dateUtils.js

const TIME_ZONE = 'Asia/Taipei'

/**
 * 取得當前台北時區的 Date 物件。
 * @returns {Date} 代表當前台北時間的 Date 物件
 */
function getTaipeiNow() {
  // 建立一個符合 ISO 格式的台北時間字串，再轉回 Date 物件，以避免本地環境影響
  const now = new Date()
  const tzString = now.toLocaleString('en-US', { timeZone: TIME_ZONE })
  return new Date(tzString)
}

/**
 * 將指定的 Date 物件格式化為 'YYYY-MM-DD' 字串。
 * 這是 Firestore 查詢最理想的日期格式。
 * @param {Date} date - (可選) 要格式化的日期物件，預設為當前台北時間。
 * @returns {string} 'YYYY-MM-DD' 格式的日期字串。
 */
function formatDateToYYYYMMDD(date = new Date()) {
  // 使用 'sv-SE' (Swedish) locale 可以直接得到 'YYYY-MM-DD' 格式，無需替換。
  // 這是處理日期格式化的一個穩健技巧。
  return new Date(date).toLocaleDateString('sv-SE', { timeZone: TIME_ZONE })
}

/**
 * 取得台北時區「今天」的 'YYYY-MM-DD' 字串。
 * @returns {string}
 */
function getTaipeiTodayString() {
  return formatDateToYYYYMMDD(new Date())
}

/**
 * 取得台北時區「昨天」的 'YYYY-MM-DD' 字串。
 * @returns {string}
 */
function getTaipeiYesterdayString() {
  const today = getTaipeiNow()
  today.setDate(today.getDate() - 1)
  return formatDateToYYYYMMDD(today)
}

// 導出所有函式，讓其他檔案可以引用
module.exports = {
  getTaipeiNow,
  formatDateToYYYYMMDD,
  getTaipeiTodayString,
  getTaipeiYesterdayString,
  TIME_ZONE,
}
