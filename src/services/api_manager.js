// src/services/api_manager.js (完整修正版)

// 1. 從 Firebase SDK 中，引入所有我們需要用到的函式 (已清理重複)
import {
  collection,
  getDocs,
  doc,
  addDoc,
  setDoc, // <-- 確保引入了 setDoc
  updateDoc,
  deleteDoc,
  query,
} from 'firebase/firestore'

// 假設您從 './firebase' 導入 db 實例
import { db } from '@/composables/useFirebase.js'

const ApiManager = (resourceType) => {
  // 檢查 db 是否成功引入
  if (!db) {
    throw new Error("Firestore 'db' instance is not available! Check your firebase configuration.")
  }

  const collectionRef = collection(db, resourceType)

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
   * - 如果只傳入 data 物件，則使用 addDoc 新增文件並由 Firebase 自動生成 ID。
   * - 如果傳入 id 和 data，則使用 setDoc 創建或完全覆蓋指定 ID 的文件。
   * @param {string|object} idOrData - 文件的 ID 或要保存的資料物件。
   * @param {object} [data] - (可選) 如果第一個參數是 ID，則這是要保存的資料。
   * @returns {Promise<object>} 返回包含 id 和已保存資料的物件。
   */
  const save = async (idOrData, data) => {
    try {
      // 情況一：只傳入一個參數 save(data) -> 使用 addDoc
      if (typeof idOrData === 'object' && data === undefined) {
        const dataToSave = idOrData
        const docRef = await addDoc(collectionRef, dataToSave)
        console.log(`[ApiManager] Added new document to ${resourceType} with ID: ${docRef.id}`)
        return { id: docRef.id, ...dataToSave }
      }
      // 情況二：傳入兩個參數 save(id, data) -> 使用 setDoc
      else if (typeof idOrData === 'string' && typeof data === 'object') {
        const id = idOrData
        const dataToSave = data
        const docRef = doc(db, resourceType, id)
        // 使用 setDoc 來創建或完全覆蓋文件
        await setDoc(docRef, dataToSave)
        console.log(`[ApiManager] Set document with ID ${id} in ${resourceType}`)
        return { id, ...dataToSave }
      }
      // 情況三：參數錯誤
      else {
        throw new Error('Invalid arguments for save function. Use save(data) or save(id, data).')
      }
    } catch (error) {
      console.error(`[ApiManager] Error saving ${resourceType}:`, error)
      throw error
    }
  }

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

  return {
    fetchAll,
    save,
    update,
    delete: deleteDocument,
  }
}

export default ApiManager
