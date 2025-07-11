// src/composables/useNotification.js (已修正)

import { ref } from 'vue'

// 將狀態定義在函式外部，使其成為一個全局單例 (Singleton)
const notifications = ref([])
const MAX_NOTIFICATIONS = 3 // 設定通知上限為 3

export function useNotification() {
  /**
   * 新增一條通知
   * @param {string} message - 通知的內容
   * @param {string} type - 通知的類型 (用於圖標和樣式)，例如 'patient', 'schedule', 'memo'
   */
  const addNotification = (message, type = 'default') => {
    const id = Date.now() + Math.random()

    // 【核心修正】: 新增通知到陣列的開頭
    notifications.value.unshift({
      id,
      message,
      type,
      timestamp: new Date(),
    })

    // 【核心修正】: 如果通知數量超過上限，就從尾部移除最舊的通知
    if (notifications.value.length > MAX_NOTIFICATIONS) {
      notifications.value.pop()
    }
  }

  /**
   * 移除一條通知
   * @param {number} id - 要移除的通知 ID
   */
  const removeNotification = (id) => {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  // 將狀態和方法導出
  return {
    notifications,
    addNotification,
    removeNotification,
  }
}
