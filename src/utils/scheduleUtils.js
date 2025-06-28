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
    note: '',
    nurseTeam: null,
    nurseTeamIn: null,
    nurseTeamOut: null,
  }
}
