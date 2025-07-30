// 檔案路徑: src/composables/useRealtimeNotifications.js

import { ref, onUnmounted } from 'vue'
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useRouter } from 'vue-router'

// 全局狀態
const notifications = ref([])
let unsubscribe = null // 用來儲存取消監聽的函式

// 通知類型配置 (與舊版 useNotification.js 相同)
const NOTIFICATION_TYPES = {
  schedule: { icon: '📅' },
  team: { icon: '👥' },
  patient: { icon: '👤' },
  memo: { icon: '📝' },
  conflict: { icon: '⚠️' },
}

export function useRealtimeNotifications() {
  const router = useRouter()

  const startListening = () => {
    // 防止重複監聽
    if (unsubscribe) {
      console.log('👂 [RealtimeN] Listener already active.')
      return
    }

    console.log('👂 [RealtimeN] Starting to listen for global notifications...')

    const q = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(10), // 最多只抓取最新的 10 條
    )

    unsubscribe = onSnapshot(q, (snapshot) => {
      const newNotifications = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        const createdAt = data.createdAt?.toDate() || new Date()

        // 點擊通知後的動作
        const action = data.metadata?.routePath ? () => router.push(data.metadata.routePath) : null

        newNotifications.push({
          id: doc.id,
          message: data.message,
          type: data.type,
          time: createdAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
          config: NOTIFICATION_TYPES[data.type] || NOTIFICATION_TYPES.schedule,
          action,
        })
      })
      notifications.value = newNotifications
    })
  }

  const stopListening = () => {
    if (unsubscribe) {
      console.log('🛑 [RealtimeN] Stopping notification listener.')
      unsubscribe()
      unsubscribe = null
      notifications.value = [] // 登出後清空通知
    }
  }

  const removeNotification = (id) => {
    // 在全局模式下，我們不從客戶端手動刪除，讓它自然消失或被新通知擠掉
    // 這裡保留空函式以防 UI 報錯，或者可以簡單地從陣列中移除
    const index = notifications.value.findIndex((n) => n.id === id)
    if (index !== -1) {
      notifications.value.splice(index, 1)
    }
  }

  // onUnmounted(stopListening) // 在 composable 銷毀時自動停止監聽

  return {
    notifications,
    startListening,
    stopListening,
    removeNotification,
  }
}
