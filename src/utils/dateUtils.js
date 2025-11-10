// src/utils/dateUtils.js (前端版本)

const TIME_ZONE = 'Asia/Taipei'

/**
 * 將指定的 Date 物件格式化為台北時區的 'YYYY-MM-DD' 字串。
 * @param {Date} [date=new Date()] - (可選) 要格式化的日期物件，預設為當前時間。
 * @returns {string} 'YYYY-MM-DD' 格式的日期字串。
 */
export function formatDateToYYYYMMDD(date = new Date()) {
  // 這個方法可以穩定地在任何瀏覽器中，根據指定的時區獲取正確的 YYYY-MM-DD 字串
  return date.toLocaleDateString('sv-SE', { timeZone: TIME_ZONE })
}
