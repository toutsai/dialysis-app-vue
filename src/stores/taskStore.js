import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

export const useTaskStore = defineStore('task', () => {
  // --- State ---
  const { currentUser } = useAuth()

  // ✨ [核心修正] 將 allTasks/allMemos 拆分為更具體的 state
  const myTasks = ref([])
  const mySentTasks = ref([])
  const feedMessages = ref([]) // 這個會包含新的 messages 和舊的 memos

  const isLoading = ref(true)
  let unsubscribes = []

  // --- Getters ---

  // ✨ [核心修正] combinedData 不再需要，因為我們直接從 state 拿資料

  const sortedFeedMessages = computed(() => {
    // feedMessages state 已經包含了混合後的資料，直接排序即可
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

  const getPatientMessageTypesMapForDate = computed(() => {
    return (todayStr) => {
      const map = new Map()
      // ✨ [核心修正] 直接篩選已經是 message 的 feedMessages
      const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')

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
    // ✨ [核心修正] myTasks state 現在直接就是我要的資料
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
    if (!uid || !currentUser.value) return // 增加保護

    isLoading.value = true

    let listenersInitialized = 0
    const totalListeners = 4 // 我們現在有 4 個監聽器

    const checkLoadingState = () => {
      listenersInitialized++
      if (listenersInitialized >= totalListeners) {
        isLoading.value = false
      }
    }

    // 1. 監聽 "我的任務" (收件匣)
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
      checkLoadingState() // 即使沒有查詢，也要計數
    }

    // 2. 監聽 "我傳送的任務" (寄件匣)
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

    // 3. 監聽 "病人留言板" (新舊資料合併)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const messagesQuery = query(
      collection(db, 'tasks'),
      where('category', '==', 'message'),
      where('createdAt', '>=', sevenDaysAgo),
    )
    const legacyMemosQuery = query(collection(db, 'memos'), where('createdAt', '>=', sevenDaysAgo))

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

    // 重置 state
    myTasks.value = []
    mySentTasks.value = []
    feedMessages.value = []
    isLoading.value = true
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      // 在 UID 變化時，先清理舊的監聽
      cleanupListeners()
      // 如果有新的 UID，再啟動新的監聽
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
    // ✨ [核心修正] 直接匯出 state
    myTasks,
    mySentTasks,
    // sortedFeedMessages 依然是 getter
    sortedFeedMessages,
    getPatientMessageTypesMapForDate,
    todayTaskCount,
  }
})
