// src/services/api_manager.js (修正版 - 恢復為純 default export)

// 1. 從 Firebase SDK 中，引入所有我們需要用到的函式
import {
  collection,
  getDocs,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  getDoc,
} from 'firebase/firestore'

// 2. 導入您的 Firebase db 實例
import { db } from '@/composables/useFirebase.js'

/**
 * 創建一個通用的 Firestore API 管理器。
 * @param {string} resourceType - Firestore 集合的名稱 (例如 'users', 'products')。
 * @returns {object} - 包含對該集合進行 CRUD 操作的函式物件。
 */
const ApiManager = (resourceType) => {
  // 檢查 db 是否成功引入，這是非常好的習慣
  if (!db) {
    throw new Error("Firestore 'db' instance is not available! Check your firebase configuration.")
  }

  const collectionRef = collection(db, resourceType)

  /**
   * 獲取集合中的所有文件。
   * @param {Array} [queryConstraints=[]] - (可選) Firestore 查詢約束陣列 (e.g., [where(...), orderBy(...)])。
   * @returns {Promise<Array<object>>} - 包含所有文件資料的陣列。
   */
  const fetchAll = async (queryConstraints = []) => {
    try {
      const q =
        queryConstraints.length > 0 ? query(collectionRef, ...queryConstraints) : collectionRef
      const querySnapshot = await getDocs(q)
      const allData = []
      querySnapshot.forEach((docSnapshot) => {
        allData.push({ id: docSnapshot.id, ...docSnapshot.data() })
      })
      return allData
    } catch (error) {
      console.error(`[ApiManager] Error fetching ${resourceType}:`, error)
      throw error
    }
  }

  /**
   * 保存文件。
   * - save(data): 新增文件，由 Firebase 自動生成 ID。
   * - save(id, data): 創建或完全覆蓋指定 ID 的文件。
   * @param {string|object} idOrData - 文件的 ID 或要保存的資料物件。
   * @param {object} [data] - (可選) 如果第一個參數是 ID，則這是要保存的資料。
   * @returns {Promise<object>} - 返回包含 id 和已保存資料的物件，方便前端更新。
   */
  const save = async (idOrData, data) => {
    try {
      // 情況一：新增文件 (addDoc)
      if (typeof idOrData === 'object' && data === undefined) {
        const dataToSave = idOrData
        const docRef = await addDoc(collectionRef, dataToSave)
        console.log(`[ApiManager] Added new document to ${resourceType} with ID: ${docRef.id}`)
        return { id: docRef.id, ...dataToSave }
      }
      // 情況二：指定 ID 創建/覆蓋 (setDoc)
      else if (typeof idOrData === 'string' && typeof data === 'object') {
        const id = idOrData
        const dataToSave = data
        const docRef = doc(db, resourceType, id)
        await setDoc(docRef, dataToSave)
        console.log(`[ApiManager] Set document with ID ${id} in ${resourceType}`)
        return { id, ...dataToSave }
      }
      // 情況三：參數錯誤
      else {
        throw new Error('Invalid arguments for save function. Use save(data) or save(id, data).')
      }
    } catch (error) {
      console.error(`[ApiManager] Error saving to ${resourceType}:`, error)
      throw error
    }
  }

  /**
   * 更新指定 ID 的文件。
   * @param {string} id - 要更新的文件的 ID。
   * @param {object} data - 要更新的欄位物件。
   * @returns {Promise<object>} - 返回包含 id 和已更新資料的物件。
   */
  const update = async (id, data) => {
    // 【健壯性增強】在執行操作前，檢查 ID 是否為有效的字串。
    if (!id || typeof id !== 'string') {
      const errorMessage = `[ApiManager] Invalid or missing ID for update in ${resourceType}. ID must be a non-empty string.`
      console.error(errorMessage)
      throw new Error(errorMessage)
    }

    try {
      const docRef = doc(db, resourceType, id)
      await updateDoc(docRef, data)
      console.log(`[ApiManager] Successfully updated document with ID: ${id} in ${resourceType}`)
      return { id, ...data }
    } catch (error) {
      console.error(`[ApiManager] Error updating document with ID ${id}:`, error)
      throw error
    }
  }

  /**
   * 根據 ID 獲取單一文件。
   * @param {string} id - 要獲取的文件 ID。
   * @returns {Promise<object|null>} - 返回文件物件，如果不存在則返回 null。
   */
  const fetchById = async (id) => {
    // 【健壯性增強】您原本這裡的檢查就做得很好
    if (!id || typeof id !== 'string') {
      throw new Error('Document ID is required and must be a string.')
    }

    try {
      const docRef = doc(db, resourceType, id)
      const docSnap = await getDoc(docRef)

      if (docSnap.exists()) {
        console.log(`[ApiManager] Fetched document with ID ${id} from ${resourceType}`)
        return { id: docSnap.id, ...docSnap.data() }
      } else {
        console.warn(`[ApiManager] No document found with ID ${id} in ${resourceType}`)
        return null
      }
    } catch (error) {
      console.error(`[ApiManager] Error fetching document with ID ${id}:`, error)
      throw error
    }
  }

  /**
   * 刪除指定 ID 的文件。
   * @param {string} id - 要刪除的文件的 ID。
   * @returns {Promise<{id: string}>} - 返回被刪除文件的 ID。
   */
  const deleteDocument = async (id) => {
    // 【修正重點】在執行操作前，嚴格檢查 ID 是否為有效的字串。
    // 這能從根本上解決 "even number of segments" 的問題。
    if (!id || typeof id !== 'string') {
      const errorMessage = `[ApiManager] Invalid or missing ID for deletion in ${resourceType}. ID must be a non-empty string.`
      console.error(errorMessage)
      throw new Error(errorMessage) // 直接拋出明確錯誤，而不是讓 Firebase 拋出模糊的錯誤。
    }

    try {
      const docRef = doc(db, resourceType, id)
      await deleteDoc(docRef)
      console.log(`[ApiManager] Successfully deleted document with ID: ${id} from ${resourceType}`)
      return { id }
    } catch (error) {
      console.error(`[ApiManager] Error deleting document with ID ${id}:`, error)
      throw error
    }
  }

  // 返回所有可用的 API 函式
  return {
    fetchAll,
    save,
    update,
    delete: deleteDocument, // 'delete' 是關鍵字，這樣賦值是標準做法
    fetchById,
  }
}

// ✨ 核心修正：移除 named export，只保留 default export
export default ApiManager
