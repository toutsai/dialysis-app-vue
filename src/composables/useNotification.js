// src/composables/useNotification.js (升級版)

import { ref } from 'vue'

// 全局通知狀態
const notifications = ref([])
const MAX_NOTIFICATIONS = 5 // 可以考慮稍微增加上限

// 通知類型配置 (新增 conflict 類型)
const NOTIFICATION_TYPES = {
  schedule: { icon: '📅', bgColor: '#3056b6ff', textColor: '#fff' },
  team: { icon: '👥', bgColor: '#27ae60', textColor: '#fff' },
  patient: { icon: '👤', bgColor: '#f39c12', textColor: '#fff' },
  memo: { icon: '📝', bgColor: '#9b59b6', textColor: '#fff' },
  // ✨ 新增：衝突專用類型
  conflict: { icon: '⚠️', bgColor: '#e74c3c', textColor: '#fff' },
}

export function useNotification() {
  /**
   * 新增通知
   * @param {string} message - 通知內容
   * @param {string} type - 通知類型
   * @param {Object} [options] - 可選參數，例如 { action: () => { ... } }
   */
  const addNotification = (message, type = 'schedule', options = {}) => {
    const id = Date.now() + Math.random()
    const now = new Date()
    const timeString = now.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    notifications.value.unshift({
      id,
      message,
      type,
      time: timeString,
      config: NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.schedule,
      // ✨ 新增：將 action 函式儲存到通知物件中
      action: options.action || null,
    })

    if (notifications.value.length > MAX_NOTIFICATIONS) {
      notifications.value.pop()
    }
  }

  const removeNotification = (id) => {
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  return {
    notifications,
    addNotification,
    removeNotification,
    NOTIFICATION_TYPES,
  }
}
