import { db } from '@/composables/useFirebase'
import { collection, query, where, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore'

export const kiditService = {
  // 1. 取得指定月份的 Logbook
  async fetchMonthLogs(year, month) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const nextDate = new Date(year, month, 1)
    const endDate = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-01`

    const q = query(
      collection(db, 'kidit_logbook'),
      where('date', '>=', startDate),
      where('date', '<', endDate),
    )
    const snapshot = await getDocs(q)
    return snapshot.docs.map((doc) => doc.data())
  },

  // 2. 更新 Logbook 中某天的事件
  async updateLogEvents(dateStr, events) {
    const docRef = doc(db, 'kidit_logbook', dateStr)
    await updateDoc(docRef, { events })
  },

  // 3. 取得病人詳細資料
  async fetchPatient(patientId) {
    const docRef = doc(db, 'patients', patientId)
    const snap = await getDoc(docRef)
    return snap.exists() ? { id: snap.id, ...snap.data() } : null
  },

  // 4. 更新病人血管通路資料
  async updatePatientAccessInfo(patientId, accessInfo) {
    const docRef = doc(db, 'patients', patientId)
    await updateDoc(docRef, { vascularAccessInfo: accessInfo })
  },
}
