// src/composables/useConflictWatcher.js (新檔案)

import { onUnmounted } from 'vue'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useNotification } from '@/composables/useNotification.js'
import { useRouter } from 'vue-router'

let unsubscribe = null // 確保只有一個監聽器在運行

export function useConflictWatcher() {
  const { addNotification } = useNotification()
  const router = useRouter()

  const startWatching = () => {
    // 如果已經在監聽，就不要重複啟動
    if (unsubscribe) return

    console.log('🛡️ [ConflictWatcher] 啟動，開始監聽排程例外衝突...')
    const q = query(collection(db, 'schedule_exceptions'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // 我們只關心被【修改】的文件
        if (change.type === 'modified') {
          const exception = { id: change.doc.id, ...change.doc.data() }

          // 檢查狀態是否為我們定義的衝突狀態
          if (exception.status === 'conflict_requires_resolution') {
            console.log(`⚠️ [ConflictWatcher] 偵測到衝突: ${exception.id}`)

            // 建立一個可點擊的通知
            addNotification(
              `排程衝突：${exception.patientName} 的調班申請失敗，目標床位已被佔用。`,
              'conflict', // 使用我們新增的衝突類型
              {
                // ✨ 核心：定義點擊後的動作
                action: () => {
                  console.log(`[Notification Action] 導航至例外管理頁面以解決衝突: ${exception.id}`)
                  // 導航到例外管理頁面，並透過 query 參數傳遞衝突的 ID
                  router.push({
                    path: '/exception-manager',
                    query: { resolveConflict: exception.id },
                  })
                },
              },
            )

            // (可選) 您也可以在這裡將衝突狀態更新回 pending，避免重複通知
            // const exceptionRef = doc(db, 'schedule_exceptions', exception.id);
            // updateDoc(exceptionRef, { status: 'pending' });
          }
        }
      })
    })
  }

  const stopWatching = () => {
    if (unsubscribe) {
      console.log('🛑 [ConflictWatcher] 停止監聽。')
      unsubscribe()
      unsubscribe = null
    }
  }

  // 當使用此 composable 的組件被卸載時，自動停止監聽
  onUnmounted(stopWatching)

  return {
    startWatching,
    stopWatching,
  }
}
