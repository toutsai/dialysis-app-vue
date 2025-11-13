// 檔案路徑: src/stores/taskStore.js (最終修正版 - 穩定 feedMessages 更新)

import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'

function getSafeDate(timestamp) {
  if (!timestamp) return new Date(0)
  if (timestamp instanceof Date) return timestamp
  if (typeof timestamp.toDate === 'function') return timestamp.toDate()
  const date = new Date(timestamp)
  return isNaN(date.getTime()) ? new Date(0) : date
}

export const useTaskStore = defineStore('task', () => {
  const { currentUser } = useAuth()
  const myTasks = ref([])
  const mySentTasks = ref([])
  const feedMessages = ref([])
  const isLoading = ref(true) // 初始為 true
  let unsubscribes = []
  const conditionRecordPatientIds = ref(new Set())

  // --- Getters 保持不變 ---
  const sortedFeedMessages = computed(() => {
    // ... (原有邏輯不變)
    const standardizedMessages = feedMessages.value.map((msg) => ({
      ...msg,
      createdAt: getSafeDate(msg.createdAt),
      resolvedAt: getSafeDate(msg.resolvedAt),
    }))
    return standardizedMessages.sort((a, b) => {
      const aIsDone = a.status === 'completed'
      const bIsDone = b.status === 'completed'
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1
      const dateA = aIsDone ? a.resolvedAt : a.createdAt
      const dateB = bIsDone ? b.resolvedAt : b.createdAt
      return dateB.getTime() - dateA.getTime()
    })
  })
  const getPatientMessageTypesMapForDate = computed(() => {
    // ... (原有邏輯不變)
    return (targetDate) => {
      const dateToCompare = targetDate ? new Date(targetDate) : new Date()
      dateToCompare.setHours(0, 0, 0, 0)
      const dateStr = `${dateToCompare.getFullYear()}-${String(dateToCompare.getMonth() + 1).padStart(2, '0')}-${String(dateToCompare.getDate()).padStart(2, '0')}`
      const map = new Map()
      const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')
      for (const msg of pendingMessages) {
        if (!msg.patientId) continue
        let shouldDisplayIcon = false
        if (!msg.targetDate || msg.targetDate <= dateStr) {
          shouldDisplayIcon = true
        }
        if (shouldDisplayIcon) {
          if (!map.has(msg.patientId)) {
            map.set(msg.patientId, new Set())
          }
          map.get(msg.patientId).add(msg.type === '常規' ? 'memo' : msg.type)
        }
      }
      conditionRecordPatientIds.value.forEach((patientId) => {
        if (!map.has(patientId)) {
          map.set(patientId, new Set())
        }
        map.get(patientId).add('record')
      })
      const finalMap = new Map()
      for (const [patientId, typeSet] of map.entries()) {
        finalMap.set(patientId, Array.from(typeSet))
      }
      return finalMap
    }
  })
  const allPendingPatientMessageTypesMap = computed(() => {
    // ... (原有邏輯不變)
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
    // ... (原有邏輯不變)
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
  const todayRelevantMemosCount = computed(() => {
    // ... (原有邏輯不變)
    return (patientIdArray) => {
      if (!patientIdArray || patientIdArray.length === 0) return 0
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const patientIdSet = new Set(patientIdArray)
      return feedMessages.value.filter((item) => {
        const isTargetDateRelevant = !item.targetDate || item.targetDate <= todayStr
        return (
          item.status === 'pending' &&
          item.patientId &&
          patientIdSet.has(item.patientId) &&
          isTargetDateRelevant &&
          item.content &&
          !item.content.startsWith('【')
        )
      }).length
    }
  })

  // --- Actions ---
  function updateTasksFromConditionRecords(patientIdSet) {
    conditionRecordPatientIds.value = patientIdSet
  }

  function startRealtimeUpdates(uid) {
    if (unsubscribes.length > 0) return
    if (!uid || !currentUser.value) {
      isLoading.value = false // 如果無法啟動，也應該結束 loading
      return
    }

    isLoading.value = true
    let listenersInitialized = 0
    const totalListeners = 4 // myTasks, mySentTasks, messages, legacyMemos

    const checkLoadingState = () => {
      listenersInitialized++
      if (listenersInitialized >= totalListeners) {
        isLoading.value = false
        console.log('[TaskStore] All listeners initialized. isLoading is now false.') // 偵錯日誌
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
      checkLoadingState() // 如果沒有這個查詢，也要算一次
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
    let messagesLoaded = false
    let memosLoaded = false

    const updateCombinedFeed = () => {
      // ✨ 核心修正：只在兩個來源都至少載入過一次後才合併
      if (messagesLoaded && memosLoaded) {
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
    }

    unsubscribes.push(
      onSnapshot(
        messagesQuery,
        (snapshot) => {
          currentMessages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          if (!messagesLoaded) {
            messagesLoaded = true
            checkLoadingState()
          }
          updateCombinedFeed()
        },
        (error) => {
          console.error('Error listening to messages:', error)
          if (!messagesLoaded) {
            messagesLoaded = true
            checkLoadingState()
          }
        },
      ),
    )

    unsubscribes.push(
      onSnapshot(
        legacyMemosQuery,
        (snapshot) => {
          currentMemos = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          if (!memosLoaded) {
            memosLoaded = true
            checkLoadingState()
          }
          updateCombinedFeed()
        },
        (error) => {
          console.error('Error listening to legacy memos:', error)
          if (!memosLoaded) {
            memosLoaded = true
            checkLoadingState()
          }
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
    isLoading.value = true // 重置為 true
  }

  watch(
    () => currentUser.value?.uid,
    (uid) => {
      cleanupListeners()
      if (uid) {
        startRealtimeUpdates(uid)
      } else {
        isLoading.value = false // 如果登出，結束 loading
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
    feedMessages, // ✨ 直接回傳 feedMessages
    sortedFeedMessages,
    todayRelevantMemosCount,
    getPatientMessageTypesMapForDate,
    allPendingPatientMessageTypesMap,
    todayTaskCount,
    updateTasksFromConditionRecords,
  }
})
