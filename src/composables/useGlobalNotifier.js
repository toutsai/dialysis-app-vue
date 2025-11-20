// 檔案路徑: src/composables/useGlobalNotifier.js (已加入 30 天後過期的 expireAt 欄位)

import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
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
      // =================================================================
      // [核心修改] 計算 30 天後的過期時間
      // =================================================================
      const expireDate = new Date()
      expireDate.setDate(expireDate.getDate() + 30) // 將日期設定為 30 天後
      // =================================================================

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
        // [核心修改] 新增 expireAt 欄位，用於 TTL 政策
        expireAt: expireDate,
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
