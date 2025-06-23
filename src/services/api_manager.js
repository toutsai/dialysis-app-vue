// 檔案路徑: src/services/api_manager.js (Vue 專案版本)

// 1. 從我們在 main.js 初始化的 Firebase 中，引入 db 實例
import { db } from '@/main.js'

// 2. 從 Firebase SDK 中，引入所有我們需要用到的函式
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore'

// 3. ApiManager 的主體邏輯，與 Claude 修正版幾乎完全相同
const ApiManager = (resourceType) => {
  // 檢查 db 是否成功引入
  if (!db) {
    throw new Error("Firestore 'db' instance is not available! Check main.js initialization.")
  }

  // 建立指向特定集合的參照
  const collectionRef = collection(db, resourceType)

  /**
   * 從集合中獲取所有文件
   * @param {Array} queryConstraints - Firestore 查詢條件陣列，例如 [where("status", "==", "opd")]
   */
  const fetchAll = async (queryConstraints = []) => {
    try {
      // Firestore 的 query() 函式，如果沒有查詢條件，可以直接傳入 collectionRef
      const q =
        queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef

      const querySnapshot = await getDocs(q)
      const allData = []
      querySnapshot.forEach((docSnapshot) => {
        // 將文件 ID 和資料合併
        allData.push({ id: docSnapshot.id, ...docSnapshot.data() })
      })
      return allData
    } catch (error) {
      console.error(`[ApiManager] Error fetching ${resourceType}:`, error)
      // 拋出錯誤，讓呼叫它的地方可以處理
      throw error
    }
  }

  /**
   * 在集合中儲存一個新文件
   * @param {Object} data - 要儲存的資料物件
   */
  const save = async (data) => {
    try {
      const docRef = await addDoc(collectionRef, data)
      return { id: docRef.id, ...data }
    } catch (error) {
      console.error(`[ApiManager] Error saving ${resourceType}:`, error)
      throw error
    }
  }

  /**
   * 更新一個已存在的文件
   * @param {string} id - 要更新的文件的 ID
   * @param {Object} data - 要更新的資料欄位
   */
  const update = async (id, data) => {
    try {
      const docRef = doc(db, resourceType, id)
      await updateDoc(docRef, data)
      return { id, ...data }
    } catch (error) {
      console.error(`[ApiManager] Error updating ${resourceType} with id ${id}:`, error)
      throw error
    }
  }

  /**
   * 刪除一個文件
   * @param {string} id - 要刪除的文件的 ID
   */
  const deleteDocument = async (id) => {
    try {
      const docRef = doc(db, resourceType, id)
      await deleteDoc(docRef)
      return { id }
    } catch (error) {
      console.error(`[ApiManager] Error deleting ${resourceType} with id ${id}:`, error)
      throw error
    }
  }

  // 回傳 API 操作函式
  return {
    fetchAll,
    save,
    update,
    delete: deleteDocument,
  }
}

// 4. 使用 ES6 模組的 `export default` 來匯出 ApiManager 函式
// 這樣其他檔案就可以用 `import ApiManager from '@/services/api_manager.js'` 來引入它
export default ApiManager
