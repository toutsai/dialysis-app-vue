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
  let tasksUnsubscribe = null
  let memosUnsubscribe = null

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
      const dateA = aIsDone ? a.resolvedAt?.toDate() || 0 : a.createdAt?.toDate() || 0
      const dateB = bIsDone ? b.resolvedAt?.toDate() || 0 : b.createdAt?.toDate() || 0
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
  function startListening() {
    if (tasksUnsubscribe || memosUnsubscribe) {
      return
    }
    isLoading.value = true
    const tasksQuery = query(collection(db, 'tasks'), where('category', 'in', ['task', 'message']))
    tasksUnsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        allTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        checkLoadingState()
      },
      (error) => {
        console.error('[TaskStore] Error listening to tasks collection:', error)
        checkLoadingState()
      },
    )

    const memosQuery = query(collection(db, 'memos'), where('status', 'in', ['pending', 'expired']))
    memosUnsubscribe = onSnapshot(
      memosQuery,
      (snapshot) => {
        allMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        checkLoadingState()
      },
      (error) => {
        console.error('[TaskStore] Error listening to legacy memos collection:', error)
        checkLoadingState()
      },
    )
  }

  function checkLoadingState() {
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
    allMemos.value = []
    isLoading.value = true
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
    getPatientMessageTypesMapForDate,
    todayTaskCount,
  }
})
