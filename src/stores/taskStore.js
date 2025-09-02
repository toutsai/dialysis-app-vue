import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

// ✨ 1. 在 Store 的頂部定義一個全域、更強健的日期處理函式
/**
 * 安全地將多種日期格式轉換為 JavaScript Date 物件。
 * @param {any} timestamp - 可能是 Firestore Timestamp, Date object, ISO string, or number.
 * @returns {Date} 一個有效的 Date 物件。
 */
function getSafeDate(timestamp) {
  // 如果沒有值，返回一個過去的日期以便排序
  if (!timestamp) return new Date(0)

  // Case 1: 已經是 JavaScript Date 物件 (優先處理，避免不必要的轉換)
  if (timestamp instanceof Date) {
    return timestamp
  }

  // Case 2: Firestore Timestamp 物件 (它有 toDate 方法)
  if (typeof timestamp.toDate === 'function') {
    return timestamp.toDate()
  }

  // Case 3: 字串或數字 (這是處理 memos 集合中字串日期的關鍵)
  // new Date() 可以直接解析 ISO 8601 字串 (如 "2025-09-01T02:36:20.323Z")
  const date = new Date(timestamp)

  // 檢查轉換結果是否有效，如果無效則返回一個預設值
  return isNaN(date.getTime()) ? new Date(0) : date
}

export const useTaskStore = defineStore('task', () => {
  // --- State ---
  const { currentUser } = useAuth()
  const myTasks = ref([])
  const mySentTasks = ref([])
  const feedMessages = ref([])
  const isLoading = ref(true)
  let unsubscribes = []

  // --- Getters ---
  const sortedFeedMessages = computed(() => {
    // 1. 先用 map 轉換資料，確保所有日期欄位都是 Date 物件
    const standardizedMessages = feedMessages.value.map((msg) => ({
      ...msg,
      createdAt: getSafeDate(msg.createdAt), // ✨ 轉換 createdAt
      resolvedAt: getSafeDate(msg.resolvedAt), // ✨ 轉換 resolvedAt
    }))

    // 2. 再進行排序
    return standardizedMessages.sort((a, b) => {
      const aIsDone = a.status === 'completed'
      const bIsDone = b.status === 'completed'
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1

      // ✨ 現在 a.createdAt 和 b.createdAt 必定是 Date 物件，可以直接使用
      const dateA = aIsDone ? a.resolvedAt : a.createdAt
      const dateB = bIsDone ? b.resolvedAt : b.createdAt

      return dateB.getTime() - dateA.getTime()
    })
  })

  // [原有 Getter] - 根據 "今天" 過濾備忘，適用於每日排程
  const getPatientMessageTypesMapForDate = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    const map = new Map()
    const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')

    for (const msg of pendingMessages) {
      if (!msg.patientId) continue

      let shouldDisplayIcon = false

      if (!msg.targetDate || msg.targetDate <= todayStr) {
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
  })

  const allPendingPatientMessageTypesMap = computed(() => {
    const map = new Map()
    const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')

    for (const msg of pendingMessages) {
      if (!msg.patientId) continue

      if (!map.has(msg.patientId)) {
        map.set(msg.patientId, new Set())
      }
      map.get(msg.patientId).add(msg.type || '常規')
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
    const myPendingMemosCount = feedMessages.value.filter(
      (item) => item.status === 'pending' && item.patientId && patientIdSet.has(item.patientId),
    ).length
    return myPendingTasksCount + myPendingMemosCount
  })

  // --- Actions ---
  function startRealtimeUpdates(uid) {
    if (unsubscribes.length > 0) return
    if (!uid || !currentUser.value) return

    isLoading.value = true

    let listenersInitialized = 0
    const totalListeners = 4

    const checkLoadingState = () => {
      listenersInitialized++
      if (listenersInitialized >= totalListeners) {
        isLoading.value = false
      }
    }

    const user = currentUser.value
    const titleToRoleValue = {
      書記: 'clerk',
      主治醫師: 'doctor',
      專科護理師: 'np',
      護理師組長: 'editor',
    }
    const myTargetAssigneeValues = new Set()
    const titleBasedRole = titleToRoleValue[user.title]
    if (titleBasedRole) myTargetAssigneeValues.add(titleBasedRole)
    if (user.role) myTargetAssigneeValues.add(user.role)

    if (myTargetAssigneeValues.size > 0) {
      const myTasksQuery = query(
        collection(db, 'tasks'),
        where('category', '==', 'task'),
        where('assignee.type', '==', 'role'),
        where('assignee.value', 'in', Array.from(myTargetAssigneeValues)),
      )
      unsubscribes.push(
        onSnapshot(
          myTasksQuery,
          (snapshot) => {
            myTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
            checkLoadingState()
          },
          (error) => {
            console.error('Error listening to myTasks:', error)
            checkLoadingState()
          },
        ),
      )
    } else {
      listenersInitialized++
    }

    const mySentTasksQuery = query(
      collection(db, 'tasks'),
      where('category', '==', 'task'),
      where('creator.uid', '==', uid),
    )
    unsubscribes.push(
      onSnapshot(
        mySentTasksQuery,
        (snapshot) => {
          mySentTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          checkLoadingState()
        },
        (error) => {
          console.error('Error listening to mySentTasks:', error)
          checkLoadingState()
        },
      ),
    )

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const messagesQuery = query(
      collection(db, 'tasks'),
      where('category', '==', 'message'),
      where('createdAt', '>=', sevenDaysAgo),
    )
    const legacyMemosQuery = query(
      collection(db, 'memos'),
      where('status', 'in', ['pending', 'expired']),
    )

    let currentMessages = []
    let currentMemos = []

    const updateCombinedFeed = () => {
      const standardizedMemos = currentMemos.map((memo) => ({
        ...memo,
        isLegacy: true,
        type: memo.type || '常規',
      }))
      const standardizedMessages = currentMessages.map((msg) => ({
        ...msg,
        isLegacy: false,
        type: msg.type || '常規',
      }))
      feedMessages.value = [...standardizedMessages, ...standardizedMemos]
    }

    unsubscribes.push(
      onSnapshot(
        messagesQuery,
        (snapshot) => {
          currentMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          updateCombinedFeed()
          checkLoadingState()
        },
        (error) => {
          console.error('Error listening to messages:', error)
          checkLoadingState()
        },
      ),
    )

    unsubscribes.push(
      onSnapshot(
        legacyMemosQuery,
        (snapshot) => {
          currentMemos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          updateCombinedFeed()
          checkLoadingState()
        },
        (error) => {
          console.error('Error listening to legacy memos:', error)
          checkLoadingState()
        },
      ),
    )
  }

  function cleanupListeners() {
    unsubscribes.forEach((unsubscribe) => unsubscribe())
    unsubscribes = []

    myTasks.value = []
    mySentTasks.value = []
    feedMessages.value = []
    isLoading.value = true
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      cleanupListeners()
      if (uid) {
        startRealtimeUpdates(uid)
      }
    },
    { immediate: true },
  )

  return {
    isLoading,
    startRealtimeUpdates,
    cleanupListeners,
    myTasks,
    mySentTasks,
    sortedFeedMessages,
    getPatientMessageTypesMapForDate,
    allPendingPatientMessageTypesMap,
    todayTaskCount,
  }
})
