// 檔案路徑: src/composables/useRealtimeNotifications.js (已移除刪除功能)

import { ref } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import { useRouter } from 'vue-router'
import { formatDateTimeToLocal } from '@/utils/dateUtils'

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

function formatDateTime(date) {
  if (!date || !(date instanceof Date)) return ''
  return date
    .toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Taipei',
    })
    .replace('/', '-')
}

const processDoc = (doc, router) => {
  const data = doc.data()
  const createdAt = data.createdAt?.toDate() || new Date()
  const action = data.metadata?.routePath ? () => router.push(data.metadata.routePath) : null
  const createdByName = data.createdBy?.name || '系統'

  return {
    id: doc.id,
    message: data.message,
    type: data.type,
    time: formatDateTime(createdAt),
    createdAt,
    config: NOTIFICATION_CONFIG[data.type] || NOTIFICATION_CONFIG.default,
    action,
    createdByName,
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
      // [核心修改] onSnapshot 現在是唯一的數據來源，不再需要合併本地通知
      notifications.value = snapshot.docs.map((doc) => processDoc(doc, router))
    })
  }

  const stopListening = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
      notifications.value = []
    }
  }

  // 本地通知仍然保留，用於即時的操作反饋
  const addLocalNotification = (message, type = 'default', options = {}) => {
    const id = Date.now() + Math.random()
    const now = new Date()
    const newNotification = {
      id,
      message,
      type,
      time: formatDateTime(now),
      createdAt: now,
      config: NOTIFICATION_CONFIG[type] || NOTIFICATION_CONFIG.default,
      action: options.action || null,
      isLocal: true, // 標記為本地通知
      createdByName: '您',
    }
    // 插入到列表頂部，並保持總數不超過上限
    const currentServerNotifications = notifications.value.filter((n) => !n.isLocal)
    const newNotifications = [newNotification, ...currentServerNotifications]
    notifications.value = newNotifications.slice(0, MAX_NOTIFICATIONS)
  }

  return {
    notifications,
    startListening,
    stopListening,
    addLocalNotification,
    // [核心修改] 移除了 removeNotification 和 deleteNotification
  }
}
