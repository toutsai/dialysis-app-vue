// 檔案路徑: src/composables/useRealtimeNotifications.js (已加入顯示操作者姓名)

import { ref } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useRouter } from 'vue-router'

// 這是我們【唯一】的通知狀態來源
const notifications = ref([])
let unsubscribe = null
const MAX_NOTIFICATIONS = 10

const NOTIFICATION_CONFIG = {
  schedule: { icon: '📅', bgColor: '#3498db', textColor: '#fff' },
  team: { icon: '👥', bgColor: '#27ae60', textColor: '#fff' },
  patient: { icon: '👤', bgColor: '#f39c12', textColor: '#fff' },
  memo: { icon: '📝', bgColor: '#9b59b6', textColor: '#fff' },
  conflict: { icon: '⚠️', bgColor: '#e74c3c', textColor: '#fff' },
  exception: { icon: '⚡️', bgColor: '#c0392b', textColor: '#fff' },
  default: { icon: '🔔', bgColor: '#7f8c8d', textColor: '#fff' },
}

// [核心修改] 修改 processDoc 函式
const processDoc = (doc, router) => {
  const data = doc.data()
  const createdAt = data.createdAt?.toDate() || new Date()
  const action = data.metadata?.routePath ? () => router.push(data.metadata.routePath) : null

  // ✨ 新增：從 data 中讀取 createdBy.name，如果不存在則給予預設值
  const createdByName = data.createdBy?.name || '系統'

  return {
    id: doc.id,
    message: data.message,
    type: data.type,
    time: createdAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    createdAt,
    config: NOTIFICATION_CONFIG[data.type] || NOTIFICATION_CONFIG.default,
    action,
    createdByName, // ✨ 將讀取到的姓名加入到通知物件中
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
      isLocal: true,
      createdByName: '您', // 本地通知的操作者可以固定為 "您"
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
    addLocalNotification,
    removeNotification,
  }
}
