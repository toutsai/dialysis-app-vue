// 檔案路徑: src/stores/taskStore.js

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

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
    return [...feedMessages.value].sort((a, b) => {
      const aIsDone = a.status === 'completed'
      const bIsDone = b.status === 'completed'
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1

      const getSafeDate = (timestamp) => {
        if (!timestamp) return new Date(0)
        return timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
      }

      const dateA = getSafeDate(aIsDone ? a.resolvedAt : a.createdAt)
      const dateB = getSafeDate(bIsDone ? b.resolvedAt : b.createdAt)

      return dateB - dateA
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

      // 如果沒有目標日期，或者目標日期是今天或今天之前，就顯示
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

    // 將 Set 轉換為 Array，方便後續處理
    const finalMap = new Map()
    for (const [patientId, typeSet] of map.entries()) {
      finalMap.set(patientId, Array.from(typeSet))
    }
    return finalMap
  })

  // ✨ --- START: 新增的 Getter --- ✨
  /**
   * 獲取所有病人所有未完成的留言/備忘類型 Map。
   * 此 Getter 不過濾日期，適用於總表和週排班這種未來視圖。
   */
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

    // 將 Set 轉換為 Array
    const finalMap = new Map()
    for (const [patientId, typeSet] of map.entries()) {
      finalMap.set(patientId, Array.from(typeSet))
    }
    return finalMap
  })
  // ✨ --- END: 新增的 Getter --- ✨

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
      listenersInitialized++ // 即使沒有查詢，也要計數
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

    // ✨✨✨ 核心修改點在這裡 ✨✨✨
    // 移除 createdAt 時間限制，改為只查詢 'pending' 或 'expired' 狀態的舊備忘
    const legacyMemosQuery = query(
      collection(db, 'memos'),
      where('status', 'in', ['pending', 'expired']),
    )
    // ✨✨✨ (修改結束) ✨✨✨

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
    allPendingPatientMessageTypesMap, // ✨ [新增] 導出新的 Getter
    todayTaskCount,
  }
})
