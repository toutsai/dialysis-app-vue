import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

export const useTaskStore = defineStore('task', () => {
  // ===================================================================
  // ✨ 1. State: 核心狀態
  // ===================================================================
  const { currentUser } = useAuth()
  const allTasks = ref([])
  const allMemos = ref([]) // ✨ [新] 專門存放從舊 memos 集合讀取的資料
  const isLoading = ref(true)
  let tasksUnsubscribe = null
  let memosUnsubscribe = null // ✨ [新] 舊 memos 集合的監聽器

  // ===================================================================
  // ✨ 2. Getters: 計算屬性 (重點：在這裡合併新舊資料)
  // ===================================================================

  /**
   * [核心] 合併並標準化新舊資料來源。
   * 這是所有其他 Getters 的數據基礎。
   */
  const combinedData = computed(() => {
    // 處理新資料 (tasks 集合)
    const standardizedTasks = allTasks.value.map((task) => ({
      ...task,
      isLegacy: false, // 標記為非舊資料
      // 確保必要欄位存在，給予預設值
      type: task.type || (task.category === 'message' ? '常規' : null),
    }))

    // 處理舊資料 (memos 集合)，並將其轉換為新的格式
    const standardizedMemos = allMemos.value.map((memo) => ({
      id: memo.id,
      category: 'message', // ✨ 所有舊 memo 都視為 'message'
      type: memo.type || '常規', // ✨ 支援舊 memo 可能有的 type，否則為 '常規'
      patientId: memo.patientId || null,
      patientName: memo.patientName || null,
      content: memo.content || '',
      targetDate: memo.targetDate || null,
      status: memo.status || 'pending',
      creator: memo.creator || { name: '未知' }, // 舊資料可能沒有 creator
      createdAt: memo.createdAt,
      resolvedAt: memo.resolvedAt || null,
      resolvedBy: memo.resolvedBy || null,
      isLegacy: true, // ✨ 標記為舊資料
    }))

    return [...standardizedTasks, ...standardizedMemos]
  })

  // --- 後續所有的 Getter 都基於 `combinedData` 來計算 ---

  const myTasks = computed(() => {
    if (!currentUser.value) return []
    // ... (這部分的邏輯不變，因為舊 memo 不會是 task) ...
    const userTitle = currentUser.value.title
    const userRole = currentUser.value.role
    const titleToRoleValue = {
      書記: 'clerk',
      主治醫師: 'doctor',
      專科護理師: 'np',
      護理師組長: 'editor',
    }
    const myTargetAssigneeValues = new Set()
    const titleBasedRole = titleToRoleValue[userTitle]
    if (titleBasedRole) myTargetAssigneeValues.add(titleBasedRole)
    if (userRole) myTargetAssigneeValues.add(userRole)
    return combinedData.value.filter(
      (item) =>
        item.category === 'task' &&
        item.assignee?.type === 'role' &&
        myTargetAssigneeValues.has(item.assignee.value),
    )
  })

  const mySentTasks = computed(() => {
    if (!currentUser.value?.uid) return []
    return combinedData.value.filter(
      (item) => item.category === 'task' && item.creator?.uid === currentUser.value.uid,
    )
  })

  const feedMessages = computed(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const fiveDaysAgo = new Date()
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5)

    return combinedData.value.filter((item) => {
      if (item.category !== 'message') return false
      if (item.status === 'pending') return true
      if (item.status === 'expired' && item.targetDate && new Date(item.targetDate) >= sevenDaysAgo)
        return true
      if (item.status === 'completed' && item.resolvedAt) {
        const resolvedDate = item.resolvedAt.toDate
          ? item.resolvedAt.toDate()
          : new Date(item.resolvedAt)
        if (resolvedDate >= fiveDaysAgo) return true
      }
      return false
    })
  })

  const sortedFeedMessages = computed(() => {
    return [...feedMessages.value].sort((a, b) => {
      const aIsDone = a.status === 'completed'
      const bIsDone = b.status === 'completed'
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1
      const dateA = aIsDone ? a.resolvedAt?.toDate() || 0 : a.createdAt?.toDate() || 0
      const dateB = bIsDone ? b.resolvedAt?.toDate() || 0 : b.createdAt?.toDate() || 0
      return dateB - dateA
    })
  })

  const patientMessageTypesMap = computed(() => {
    const map = new Map()
    const pendingMessages = combinedData.value.filter(
      (msg) => msg.category === 'message' && msg.status === 'pending',
    )
    for (const msg of pendingMessages) {
      if (msg.patientId) {
        if (!map.has(msg.patientId)) {
          map.set(msg.patientId, new Set())
        }
        map.get(msg.patientId).add(msg.type || '常規')
      }
    }
    const finalMap = new Map()
    for (const [patientId, typeSet] of map.entries()) {
      finalMap.set(patientId, Array.from(typeSet))
    }
    return finalMap
  })

  const todayTaskCount = computed(() => (todayAssignedPatientIds) => {
    if (!currentUser.value) return 0
    const myPendingTasksCount = myTasks.value.filter((t) => t.status === 'pending').length
    if (!todayAssignedPatientIds || todayAssignedPatientIds.length === 0) {
      return myPendingTasksCount
    }
    const patientIdSet = new Set(todayAssignedPatientIds)
    const myPendingMemosCount = combinedData.value.filter(
      (item) =>
        item.category === 'message' &&
        item.status === 'pending' &&
        item.patientId &&
        patientIdSet.has(item.patientId),
    ).length
    return myPendingTasksCount + myPendingMemosCount
  })

  // ===================================================================
  // ✨ 3. Actions: 修改狀態的方法 (修改為雙源監聽)
  // ===================================================================
  function startListening() {
    if (tasksUnsubscribe || memosUnsubscribe) {
      console.log('[TaskStore] Listeners already active.')
      return
    }

    isLoading.value = true
    console.log('[TaskStore] Starting dual-source listeners for tasks and legacy memos...')

    // 監聽器 A: tasks 集合 (新資料)
    const tasksQuery = query(collection(db, 'tasks'), where('category', 'in', ['task', 'message']))
    tasksUnsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        allTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log(`[TaskStore] Tasks listener updated. Count: ${allTasks.value.length}`)
        checkLoadingState()
      },
      (error) => {
        console.error('[TaskStore] Error listening to tasks collection:', error)
        checkLoadingState()
      },
    )

    // 監聽器 B: memos 集合 (舊資料)
    // 我們只關心還沒處理完的舊備忘
    const memosQuery = query(collection(db, 'memos'), where('status', 'in', ['pending', 'expired']))
    memosUnsubscribe = onSnapshot(
      memosQuery,
      (snapshot) => {
        allMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log(`[TaskStore] Legacy memos listener updated. Count: ${allMemos.value.length}`)
        checkLoadingState()
      },
      (error) => {
        console.error('[TaskStore] Error listening to legacy memos collection:', error)
        checkLoadingState()
      },
    )
  }

  function checkLoadingState() {
    // 只有當兩個監聽器都至少回傳過一次（無論成功或失敗），才算載入完成
    if (tasksUnsubscribe !== null && memosUnsubscribe !== null) {
      isLoading.value = false
    }
  }

  function stopListening() {
    if (tasksUnsubscribe) {
      tasksUnsubscribe()
      tasksUnsubscribe = null
    }
    if (memosUnsubscribe) {
      memosUnsubscribe()
      memosUnsubscribe = null
    }
    allTasks.value = []
    allMemos.value = [] // ✨ 清理舊資料
    isLoading.value = true
    console.log('[TaskStore] All listeners stopped and state cleared.')
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      if (uid) {
        startListening()
      } else {
        stopListening()
      }
    },
    { immediate: true },
  )

  return {
    isLoading,
    startListening,
    stopListening,
    myTasks,
    mySentTasks,
    sortedFeedMessages,
    patientMessageTypesMap,
    todayTaskCount,
  }
})
