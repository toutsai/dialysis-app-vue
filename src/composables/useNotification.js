// src/composables/useNotification.js (優化版)

import { ref } from 'vue'

// 將狀態定義在函式外部，使其成為一個全局單例 (Singleton)
const notifications = ref([])
const MAX_NOTIFICATIONS = 4 // 🆕 增加到 4 個，符合四個頁面需求

// 🆕 定義允許顯示的通知類型（四個核心頁面）
const ALLOWED_NOTIFICATION_TYPES = {
  // 📅 每日排程表
  schedule: {
    icon: '📅',
    title: '排程',
    allowedMessages: ['修改每日排程', '儲存排程', '複製排程', '清除排程', '自動分組完成'],
  },

  // 📊 護理分組檢視
  stats: {
    icon: '📊',
    title: '統計',
    allowedMessages: ['護理分組統計更新', '排程統計重新計算', '數據同步完成'],
  },

  // 👥 病人管理
  patient: {
    icon: '👤',
    title: '病人',
    allowedMessages: ['新增病人', '更新病人資料', '刪除病人', '病人資料修改', '匯入病人資料'],
  },

  // 📝 交班備忘
  memo: {
    icon: '📝',
    title: '備忘',
    allowedMessages: [
      '新增交班備忘',
      '備忘已處理',
      '刪除一則備忘',
      '備忘移回待辦',
      '備忘已從過期中移回待辦',
    ],
  },
}

// 🆕 檢查通知是否應該顯示
function shouldShowNotification(message, type) {
  // 如果類型不在允許列表中，直接拒絕
  if (!ALLOWED_NOTIFICATION_TYPES[type]) {
    console.log(`🔇 [Notification] 已過濾類型: ${type} - ${message}`)
    return false
  }

  // 檢查訊息是否匹配允許的模式
  const allowedMessages = ALLOWED_NOTIFICATION_TYPES[type].allowedMessages
  const isAllowed = allowedMessages.some((pattern) => message.includes(pattern))

  if (!isAllowed) {
    console.log(`🔇 [Notification] 已過濾訊息: ${type} - ${message}`)
    return false
  }

  return true
}

export function useNotification() {
  /**
   * 新增一條通知（增強版）
   * @param {string} message - 通知的內容
   * @param {string} type - 通知的類型 ('schedule', 'stats', 'patient', 'memo')
   * @param {boolean} force - 是否強制顯示（跳過過濾，預設 false）
   */
  const addNotification = (message, type = 'default', force = false) => {
    // 🆕 檢查是否應該顯示此通知
    if (!force && !shouldShowNotification(message, type)) {
      return // 靜默忽略
    }

    const id = Date.now() + Math.random()
    const typeConfig = ALLOWED_NOTIFICATION_TYPES[type] || {
      icon: '📢',
      title: '系統',
    }

    // 新增通知到陣列的開頭
    notifications.value.unshift({
      id,
      message,
      type,
      icon: typeConfig.icon,
      title: typeConfig.title,
      timestamp: new Date(),
    })

    // 如果通知數量超過上限，就從尾部移除最舊的通知
    if (notifications.value.length > MAX_NOTIFICATIONS) {
      notifications.value.pop()
    }

    console.log(`✅ [Notification] 顯示: ${typeConfig.icon} ${message}`)
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

  /**
   * 🆕 清除所有通知
   */
  const clearAllNotifications = () => {
    notifications.value = []
  }

  /**
   * 🆕 獲取通知統計
   */
  const getNotificationStats = () => {
    const stats = {}
    notifications.value.forEach((notification) => {
      stats[notification.type] = (stats[notification.type] || 0) + 1
    })
    return stats
  }

  // 將狀態和方法導出
  return {
    notifications,
    addNotification,
    removeNotification,
    clearAllNotifications,
    getNotificationStats,
    ALLOWED_NOTIFICATION_TYPES, // 🆕 導出配置供外部使用
  }
}
