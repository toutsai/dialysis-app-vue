/**
 * 創建一個用於存入 Firestore 的、標準化的空白 Schedule 文件物件。
 * @param {string} dateString - 日期字串，格式為 'YYYY-MM-DD'。
 * @returns {object} 一個標準的 Schedule 文件。
 */
export function createEmptyScheduleDocument(dateString) {
  return {
    date: dateString,
    schedule: {}, // 核心：schedule 欄位是一個空的 object
    version: '2.0', // 給一個新的版本號，標示這是新結構
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * 在前端創建一個標準的、包含所有欄位的空白 slotData 物件。
 * @param {string} shiftId - 該床位班次的唯一標識符，例如 'bed-32-早班'。
 * @returns {object} 一個標準的 slotData 物件。
 */
export function createEmptySlotData(shiftId) {
  return {
    shiftId: shiftId,
    patientId: null,
    autoNote: '', // 用於儲存自動生成的標籤 (住, 新, B, C...)
    manualNote: '', // 用於儲存使用者手動輸入的文字
    nurseTeam: null,
    nurseTeamIn: null,
    nurseTeamOut: null,
  }
}

/**
 * 根據病人物件，生成標準化的自動備註字串。
 * @param {object} patient - 完整的病人物件。
 * @returns {string} - 自動生成的備註標籤，用空格分隔。
 */
export function generateAutoNote(patient) {
  if (!patient) return ''
  const autoNotes = new Set()
  if (patient.status === 'ipd') autoNotes.add('住')
  if (patient.isFirstDialysis) autoNotes.add('新')

  if (patient.diseases && Array.isArray(patient.diseases)) {
    if (patient.diseases.includes('HBV')) autoNotes.add('B')
    if (patient.diseases.includes('HCV')) autoNotes.add('C')
    if (patient.diseases.includes('HIV')) autoNotes.add('H')
    if (patient.diseases.includes('RPR')) autoNotes.add('R')
    if (patient.diseases.includes('隔離')) autoNotes.add('隔')
  }

  return Array.from(autoNotes).join(' ')
}

/**
 * 根據病人物件和已有的手動備註，生成標準化的備註字串。
 * @param {object} patient - 完整的病人物件。
 * @param {string} [manualNote=''] - 使用者手動輸入的備註。
 * @returns {string} - 組合後的標準化備註。
 */
export function generateStandardNote(patient, manualNote = '') {
  if (!patient) return manualNote

  const autoNotes = []

  // 1. 根據病人狀態 (status)
  if (patient.status === 'ip') {
    autoNotes.push('住')
  }
  if (patient.isFirstDialysis) {
    // 假設病人資料中有 isFirstDialysis 欄位
    autoNotes.push('新')
  }

  // 2. 根據須注意疾病 (diseases)
  if (patient.diseases && Array.isArray(patient.diseases)) {
    if (patient.diseases.includes('HBV')) autoNotes.push('B')
    if (patient.diseases.includes('HCV')) autoNotes.push('C')
    if (patient.diseases.includes('HIV')) autoNotes.push('H')
    if (patient.diseases.includes('RPR')) autoNotes.push('R')
    if (patient.diseases.includes('隔離')) autoNotes.push('隔')
  }

  // 組合自動生成的備註和手動備註
  // 使用 Set 去除重複的關鍵字（例如手動也輸入了'住'）
  const allNotes = new Set([...autoNotes, ...manualNote.split(/\s+|,|，/).filter(Boolean)])

  return Array.from(allNotes).join(' ') // 用空格分隔
}
