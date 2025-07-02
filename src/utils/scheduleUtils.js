// src/utils/scheduleUtils.js (最終版)

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
  if (patient.status === 'ipd') autoNotes.add('住')
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

// 【移除】generateStandardNote 函式。
// 理由：它的功能（合併 auto 和 manual note）應該由前端的計算屬性或顯示函式來完成，
// 而不是在資料生成層。這可以讓資料模型更純粹。我們會在需要顯示的地方
// 直接使用 `${slotData.autoNote} ${slotData.manualNote}`。
// 這避免了在每次更新手動備註時都需要重新呼叫此函式，簡化了邏輯。
