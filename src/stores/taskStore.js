import { ref } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

export const useTaskStore = defineStore('task', () => {
  // --- State ---
  // 用來存放今天未完成的任務數量
  const todayTaskCount = ref(0)
  // 用來存放 onSnapshot 的取消訂閱函式
  let unsubscribe = null

  // --- Actions ---

  /**
   * 開始即時監聽今天新增且狀態為 'pending' 的任務
   */
  function startListeningForTodayTasks() {
    // 如果已經在監聽，就不要重複執行
    if (unsubscribe) {
      console.log('🔵 [TaskStore] Listener already active.')
      return
    }

    // 1. 計算今天的開始與結束時間
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    // 2. 建立 Firestore 查詢
    // 假設您的任務集合名稱為 'tasks'，且有一個 'createdAt' 的 Timestamp 欄位和 'status' 欄位
    const tasksRef = collection(db, 'tasks')
    const q = query(
      tasksRef,
      where('status', '==', 'pending'), // 只看未完成的
      where('createdAt', '>=', Timestamp.fromDate(todayStart)),
      where('createdAt', '<=', Timestamp.fromDate(todayEnd)),
    )

    // 3. 設定即時監聽器
    console.log("🎧 [TaskStore] Starting to listen for today's pending tasks...")
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        // 每當查詢結果有變化時，更新數量
        todayTaskCount.value = snapshot.size
        console.log(`✅ [TaskStore] Today's pending task count updated: ${snapshot.size}`)
      },
      (error) => {
        console.error('❌ [TaskStore] Error listening to tasks:', error)
        todayTaskCount.value = 0
      },
    )
  }

  /**
   * 停止監聽
   */
  function stopListening() {
    if (unsubscribe) {
      console.log('🛑 [TaskStore] Stopping listener.')
      unsubscribe()
      unsubscribe = null
      todayTaskCount.value = 0
    }
  }

  return {
    todayTaskCount,
    startListeningForTodayTasks,
    stopListening,
  }
})
