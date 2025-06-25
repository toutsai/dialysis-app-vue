// 檔案路徑: src/services/api_manager.js (使用 Composable 版本)

// 1. 從我們新建的中央工具庫 useFirebase.js 中，引入 db 實例
import { db } from '@/composables/useFirebase.js'

// 2. 從 Firebase SDK 中，引入所有我們需要用到的函式
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query } from 'firebase/firestore'

const ApiManager = (resourceType) => {
  // 檢查 db 是否成功引入
  if (!db) {
    throw new Error("Firestore 'db' instance is not available! Check composables/useFirebase.js.")
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

  const save = async (data) => {
    try {
      const docRef = await addDoc(collectionRef, data)
      return { id: docRef.id, ...data }
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
