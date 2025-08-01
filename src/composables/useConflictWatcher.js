// 檔案路徑: src/composables/useConflictWatcher.js (使用統一通知系統版)

import { onUnmounted } from 'vue'
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
// ✨ 1. 引入【唯一的】通知系統
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import { useRouter } from 'vue-router'

let unsubscribe = null

export function useConflictWatcher() {
  // ✨ 2. 從唯一的系統中獲取【本地通知】函式
  const { addLocalNotification } = useRealtimeNotifications()
  const router = useRouter()

  const startWatching = () => {
    if (unsubscribe) return
    const q = query(collection(db, 'schedule_exceptions'))
    unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const exception = { id: change.doc.id, ...change.doc.data() }
          if (exception.status === 'conflict_requires_resolution') {
            // ✨ 3. 呼叫 addLocalNotification
            addLocalNotification(
              `排程衝突：${exception.patientName} 的申請失敗，請點此解決。`,
              'conflict',
              {
                action: () => {
                  router.push({
                    path: '/exception-manager',
                    query: { resolveConflict: exception.id },
                  })
                },
              },
            )
            const exceptionRef = doc(db, 'schedule_exceptions', exception.id)
            updateDoc(exceptionRef, { status: 'pending' })
          }
        }
      })
    })
  }

  const stopWatching = () => {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
  }

  // ✨ 4. 移除 onUnmounted，生命週期由 MainLayout 全權控制
  // onUnmounted(stopWatching);

  return {
    startWatching,
    stopWatching,
  }
}
