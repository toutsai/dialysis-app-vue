// 檔案路徑: src/composables/useGlobalNotifier.js

import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

// 導出一個可複用的函式
export function useGlobalNotifier() {
  const { currentUser } = useAuth()

  /**
   * 創建並發送一條全局通知到 Firestore
   * @param {string} message - 通知內容
   * @param {string} type - 通知類型 (schedule, patient, memo, etc.)
   * @param {Object} [options] - 可選參數，例如 { routePath: '/weekly?date=...' }
   */
  const createGlobalNotification = async (message, type = 'schedule', options = {}) => {
    if (!currentUser.value) {
      console.warn('[GlobalNotifier] User not logged in, cannot send notification.')
      return
    }

    try {
      const notificationsRef = collection(db, 'notifications')
      await addDoc(notificationsRef, {
        message,
        type,
        // 儲存當前使用者的資訊，未來可以用來顯示 "由 XXX 操作"
        createdBy: {
          uid: currentUser.value.uid,
          name: currentUser.value.name,
        },
        // 使用伺服器時間戳，確保所有用戶的時間一致
        createdAt: serverTimestamp(),
        // 額外資訊，例如點擊後要跳轉的路徑
        metadata: {
          routePath: options.routePath || null,
        },
      })
    } catch (error) {
      console.error('❌ [GlobalNotifier] Failed to create global notification:', error)
    }
  }

  return {
    createGlobalNotification,
  }
}
