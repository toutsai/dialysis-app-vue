import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

export const useTaskStore = defineStore('task', () => {
  // --- State ---
  const { currentUser } = useAuth()
  const allTasks = ref([])
  const allMemos = ref([])
  const isLoading = ref(true)

  // ✨ [核心修正] 使用陣列來管理所有監聽器的 unsubscribe 函式
  let unsubscribes = []

  // --- Getters ---
  const combinedData = computed(() => {
    const standardizedTasks = allTasks.value.map((task) => ({
      ...task,
      isLegacy: false,
      type: task.type || (task.category === 'message' ? '常規' : null),
    }))
    const standardizedMemos = allMemos.value.map((memo) => ({
      id: memo.id,
      category: 'message',
      type: memo.type || '常規',
      patientId: memo.patientId || null,
      patientName: memo.patientName || null,
      content: memo.content || '',
      targetDate: memo.targetDate || null,
      status: memo.status || 'pending',
      creator: memo.creator || { name: '未知' },
      createdAt: memo.createdAt,
      resolvedAt: memo.resolvedAt || null,
      resolvedBy: memo.resolvedBy || null,
      isLegacy: true,
    }))
    return [...standardizedTasks, ...standardizedMemos]
  })

  const myTasks = computed(() => {
    if (!currentUser.value) return []
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

      // 安全地獲取日期物件
      const getSafeDate = (timestamp) => {
        if (!timestamp) return new Date(0)
        return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      }

      const dateA = getSafeDate(aIsDone ? a.resolvedAt : a.createdAt)
      const dateB = getSafeDate(bIsDone ? b.resolvedAt : b.createdAt)

      return dateB - dateA
    })
  })

  const getPatientMessageTypesMapForDate = computed(() => {
    return (todayStr) => {
      const map = new Map()
      const pendingMessages = combinedData.value.filter(
        (msg) => msg.category === 'message' && msg.status === 'pending',
      )

      for (const msg of pendingMessages) {
        if (!msg.patientId) continue

        let shouldDisplayIcon = false

        if (!msg.targetDate) {
          shouldDisplayIcon = true
        } else if (msg.targetDate === todayStr) {
          shouldDisplayIcon = true
        }

        if (shouldDisplayIcon) {
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
    }
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

  // --- Actions ---

  // ✨ [核心修正] 將 startListening 改名為 startRealtimeUpdates，並調整邏輯
  function startRealtimeUpdates() {
    // 如果監聽器已經在運行，就不要重複啟動
    if (unsubscribes.length > 0) {
      return
    }
    isLoading.value = true

    // 建立查詢
    const tasksQuery = query(collection(db, 'tasks'), where('category', 'in', ['task', 'message']))
    const memosQuery = query(collection(db, 'memos'), where('status', 'in', ['pending', 'expired']))

    let tasksLoaded = false
    let memosLoaded = false

    const checkLoadingState = () => {
      if (tasksLoaded && memosLoaded) {
        isLoading.value = false
      }
    }

    // 啟動監聽並將 unsubscribe 函式存入陣列
    unsubscribes.push(
      onSnapshot(
        tasksQuery,
        (snapshot) => {
          allTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          tasksLoaded = true
          checkLoadingState()
        },
        (error) => {
          console.error('[TaskStore] Error listening to tasks collection:', error)
          tasksLoaded = true
          checkLoadingState()
        },
      ),
    )

    unsubscribes.push(
      onSnapshot(
        memosQuery,
        (snapshot) => {
          allMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          memosLoaded = true
          checkLoadingState()
        },
        (error) => {
          console.error('[TaskStore] Error listening to legacy memos collection:', error)
          memosLoaded = true
          checkLoadingState()
        },
      ),
    )
  }

  // ✨ [核心修正] 將 stopListening 改名為 cleanupListeners，並調整邏輯
  function cleanupListeners() {
    // 遍歷陣列並執行所有 unsubscribe 函式
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    // 清空陣列
    unsubscribes = []

    // 重置 state
    allTasks.value = []
    allMemos.value = []
    isLoading.value = true
  }

  // 監聽使用者登入狀態的變化
  watch(
    () => currentUser.value?.uid,
    (uid) => {
      if (uid) {
        startRealtimeUpdates()
      } else {
        cleanupListeners()
      }
    },
    { immediate: true }, // immediate: true 確保在 store 初始化時就立即執行一次
  )

  return {
    isLoading,
    // ✨ [核心修正] 匯出新的方法名
    startRealtimeUpdates,
    cleanupListeners,
    myTasks,
    mySentTasks,
    sortedFeedMessages,
    getPatientMessageTypesMapForDate,
    todayTaskCount,
  }
})
