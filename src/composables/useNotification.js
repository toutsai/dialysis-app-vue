// src/composables/useNotification.js (改良版)

import { ref } from 'vue'

// 全局通知狀態
const notifications = ref([])
const MAX_NOTIFICATIONS = 3

// 通知類型配置
const NOTIFICATION_TYPES = {
  schedule: {
    icon: '📅',
    bgColor: '#3056b6ff', // 藍色
    textColor: '#fff',
  },
  team: {
    icon: '👥',
    bgColor: '#27ae60', // 綠色
    textColor: '#fff',
  },
  patient: {
    icon: '👤',
    bgColor: '#f39c12', // 橙色
    textColor: '#fff',
  },
  memo: {
    icon: '📝',
    bgColor: '#9b59b6', // 紫色
    textColor: '#fff',
  },
}

export function useNotification() {
  /**
   * 新增通知
   * @param {string} message - 通知內容
   * @param {string} type - 通知類型: 'schedule', 'team', 'patient', 'memo'
   */
  const addNotification = (message, type = 'schedule') => {
    const id = Date.now() + Math.random()
    const now = new Date()

    // 格式化時間為 HH:mm
    const timeString = now.toLocaleTimeString('zh-TW', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    // 新增到陣列開頭
    notifications.value.unshift({
      id,
      message,
      type,
      time: timeString,
      config: NOTIFICATION_TYPES[type] || NOTIFICATION_TYPES.schedule,
    })

    // 超過上限則移除最舊的
    if (notifications.value.length > MAX_NOTIFICATIONS) {
      notifications.value.pop()
    }

    // 移除自動消失功能，通知將持續顯示直到用戶手動關閉或被新通知擠出
  }

  /**
   * 移除通知
   * @param {number} id - 通知 ID
   */
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
