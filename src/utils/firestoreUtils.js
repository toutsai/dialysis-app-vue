// 檔案路徑: src/utils/firestoreUtils.js

import { collection, query, where, getDocs } from 'firebase/firestore'
// ↓↓↓ 這行程式碼會直接引用您剛剛貼出的 useFirebase.js 檔案中的 db ↓↓↓
import { db } from '@/composables/useFirebase.js'

/**
 * 解決 Firestore 'IN' 查詢最多只能有 30 個值的限制。
 * 此函式會自動將長的 ID 列表分塊，並行發送多個查詢，最後合併結果。
 *
 * @param {string} collectionName - 要查詢的集合名稱 (e.g., 'patients')。
 * @param {string} fieldName - 要用 'in' 進行比對的欄位名稱 (e.g., 'medicalRecordNumber')。
 * @param {Array<string>} ids - 要查詢的所有 ID 的長陣列。
 * @returns {Promise<Array<object>>} - 合併後的所有查詢結果。
 */
export async function queryWithInChunks(collectionName, fieldName, ids) {
  if (!ids || ids.length === 0) {
    return []
  }

  // 1. 將長的 ID 列表切割成每塊最多 30 個的小陣列
  const chunks = []
  for (let i = 0; i < ids.length; i += 30) {
    chunks.push(ids.slice(i, i + 30))
  }

  // 2. 為每一個小陣列建立一個查詢 Promise
  const promises = chunks.map((chunk) => {
    const q = query(collection(db, collectionName), where(fieldName, 'in', chunk))
    return getDocs(q)
  })

  // 3. 並行執行所有的查詢
  const querySnapshots = await Promise.all(promises)

  // 4. 將所有查詢結果合併成一個陣列
  const results = []
  querySnapshots.forEach((snapshot) => {
    snapshot.forEach((doc) => {
      results.push({ id: doc.id, ...doc.data() })
    })
  })

  return results
}
