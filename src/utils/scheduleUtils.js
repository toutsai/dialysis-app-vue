// 檔案: src/utils/scheduleUtils.js (最終版)

/**
 * 創建一個用於存入 Firestore 的、標準化的空白 Schedule 文件物件。
 * @param {string} dateString - 日期字串，格式為 'YYYY-MM-DD'。
 * @returns {object} 一個標準的 Schedule 文件。
 */
export function createEmptyScheduleDocument(dateString) {
  return {
    date: dateString,
    schedule: {}, // 核心：schedule 欄位是一個空的 object
    version: '3.0', // 版本號更新，標示為英文代碼+新note模型
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 在前端創建一個標準的、包含所有欄位的空白 slotData 物件。
 * @param {string} shiftId - 該床位班次的唯一標識符，例如 'bed-32-early'。
 * @returns {object} 一個標準的 slotData 物件。
 */
export function createEmptySlotData(shiftId) {
  return {
    shiftId: shiftId,
    patientId: null,
    autoNote: '', // 儲存自動生成的標籤 (住, 新, B, C...)
    manualNote: '', // 儲存使用者手動輸入的文字
    nurseTeam: null,
    nurseTeamIn: null,
    nurseTeamOut: null,
    wardNumber: null, // 【新增】補上外圍床位號碼欄位，與 ScheduleView 同步
  }
}

/**
 * 根據病人物件，生成標準化的自動備註字串。
 * 這是我們系統的 "唯一真理之源"，用於生成 autoNote。
 * @param {object} patient - 完整的病人物件。
 * @returns {string} - 自動生成的備註標籤，用空格分隔。
 */
export function generateAutoNote(patient) {
  if (!patient) return ''
  const autoNotes = new Set()

  // 核心狀態標籤
  // 【修改】: 加入對 'er' 狀態的判斷
  if (patient.status === 'ipd') autoNotes.add('住')
  if (patient.status === 'er') autoNotes.add('急') // 新增這一行
  if (patient.isFirstDialysis) autoNotes.add('新')

  // 疾病相關標籤
  if (patient.diseases && Array.isArray(patient.diseases)) {
    if (patient.diseases.includes('HBV')) autoNotes.add('B')
    if (patient.diseases.includes('HCV')) autoNotes.add('C')
    if (patient.diseases.includes('HIV')) autoNotes.add('H')
    if (patient.diseases.includes('RPR')) autoNotes.add('R')
    if (patient.diseases.includes('隔離')) autoNotes.add('隔')
  }

  return Array.from(autoNotes).join(' ')
}

// 【新增】頻率與星期的對應關係
const FREQ_TO_DAYS_MAP = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [2, 6],
  一五: [1, 5],
  二六: [2, 6],
  每日: [1, 2, 3, 4, 5, 6, 7],
  // 根據您的系統需求，可以添加更多頻率
  // '每日': [1, 2, 3, 4, 5, 6, 7],
}

/**
 * 檢查病人在給定的星期幾是否應該排班
 * @param {Object} patient - 病人物件，需要包含 freq 屬性
 * @param {number} dayOfWeek - 星期幾 (1=週一, 2=週二, ..., 7=週日)
 * @returns {boolean} - 如果應該排班則返回 true
 */
export function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient || !patient.freq || !dayOfWeek) {
    return false
  }
  const scheduledDays = FREQ_TO_DAYS_MAP[patient.freq]
  return scheduledDays ? scheduledDays.includes(dayOfWeek) : false
}
