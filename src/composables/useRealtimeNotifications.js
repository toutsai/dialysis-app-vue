// 檔案路徑: src/composables/useRealtimeNotifications.js (最終統一版)

import { ref } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useRouter } from 'vue-router'

// 這是我們【唯一】的通知狀態來源
const notifications = ref([])
let unsubscribe = null
const MAX_NOTIFICATIONS = 10 // 您可以調整上限

const NOTIFICATION_CONFIG = {
  schedule: { icon: '📅', bgColor: '#3498db', textColor: '#fff' },
  team: { icon: '👥', bgColor: '#27ae60', textColor: '#fff' },
  patient: { icon: '👤', bgColor: '#f39c12', textColor: '#fff' },
  memo: { icon: '📝', bgColor: '#9b59b6', textColor: '#fff' },
  conflict: { icon: '⚠️', bgColor: '#e74c3c', textColor: '#fff' },
  exception: { icon: '⚡️', bgColor: '#c0392b', textColor: '#fff' },
  default: { icon: '🔔', bgColor: '#7f8c8d', textColor: '#fff' },
}

const processDoc = (doc, router) => {
  const data = doc.data()
  const createdAt = data.createdAt?.toDate() || new Date()
  const action = data.metadata?.routePath ? () => router.push(data.metadata.routePath) : null
  return {
    id: doc.id,
    message: data.message,
    type: data.type,
    time: createdAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    createdAt,
    config: NOTIFICATION_CONFIG[data.type] || NOTIFICATION_CONFIG.default,
    action,
  }
}

export function useRealtimeNotifications() {
  const router = useRouter()

  const startListening = () => {
    if (unsubscribe) return
    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(MAX_NOTIFICATIONS),
    )
    unsubscribe = onSnapshot(q, (snapshot) => {
      const serverNotifications = snapshot.docs.map((doc) => processDoc(doc, router))
      // 合併伺服器通知和本地通知，並排序
      const allNotifs = [...serverNotifications, ...notifications.value.filter((n) => n.isLocal)]
      allNotifs.sort((a, b) => b.createdAt - a.createdAt)
      notifications.value = allNotifs.slice(0, MAX_NOTIFICATIONS)
    })
  }

  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
      notifications.value = []
    }
  }

  // ✨✨✨ 新增的本地通知函式 ✨✨✨
  const addLocalNotification = (message, type = 'default', options = {}) => {
    const id = Date.now() + Math.random()
    const now = new Date()
    const newNotification = {
      id,
      message,
      type,
      time: now.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
      createdAt: now,
      config: NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.default,
      action: options.action || null,
      isLocal: true, // 標記為本地通知
    }
    notifications.value.unshift(newNotification)
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
    startListening,
    stopListening,
    addLocalNotification, // ✨ 導出新函式
    removeNotification,
  }
}
