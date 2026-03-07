// 檔案路徑: src/stores/taskStore.ts

import { ref, computed, watch, type Ref } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot, type Unsubscribe } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import { useAuth } from '@/composables/useAuth'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils'

export type TaskItem = {
  id?: string
  category?: string
  status?: string
  type?: string
  patientId?: string
  createdAt?: unknown
  resolvedAt?: unknown
  targetDate?: string
  content?: string
  assignee?: any // 因為現在可能是物件 { role: string, value: string ... }
  creator?: any // 因為現在可能是物件 { uid: string, name: string ... }
  roles?: string[]
  [key: string]: unknown
}

function getSafeDate(timestamp: unknown) {
  if (!timestamp) return new Date(0)
  if (timestamp instanceof Date) return timestamp
  if (typeof (timestamp as { toDate?: () => Date }).toDate === 'function') {
    return (timestamp as { toDate: () => Date }).toDate()
  }
  const date = new Date(timestamp as string)
  return isNaN(date.getTime()) ? new Date(0) : date
}

export const useTaskStore = defineStore('task', () => {
  const { currentUser } = useAuth()
  const myTasks: Ref<TaskItem[]> = ref([])
  const mySentTasks: Ref<TaskItem[]> = ref([])
  const feedMessages: Ref<TaskItem[]> = ref([])
  const feedMessagesVersion = ref(0)
  const isLoading = ref(true) // 初始為 true
  let unsubscribes: Unsubscribe[] = []
  const conditionRecordPatientIds: Ref<Set<string>> = ref(new Set())

  const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000

  const isWithinSevenDays = (dateValue: unknown) => {
    const date = getSafeDate(dateValue)
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_IN_MS)
    return date.getTime() >= sevenDaysAgo.getTime()
  }

  // 檢查 targetDate 字串是否在 7 天內（從 targetDate 往後算 7 天）
  const isTargetDateWithinSevenDays = (targetDateStr: string | undefined) => {
    if (!targetDateStr) return false
    const targetDate = new Date(targetDateStr)
    if (isNaN(targetDate.getTime())) return false
    const sevenDaysAgo = new Date(Date.now() - SEVEN_DAYS_IN_MS)
    return targetDate.getTime() >= sevenDaysAgo.getTime()
  }

  const applyRetentionPolicy = (items: TaskItem[]) =>
    items
      .map((item) => ({ ...item, type: item.type || '常規' }))
      .filter((item) => {
        if (item.status === 'deleted') return false

        if (item.category === 'message') {
          if (item.type === '衛教') return true
          // 保留條件：createdAt 在 7 天內，或 targetDate 在 7 天內
          return isWithinSevenDays(item.createdAt) || isTargetDateWithinSevenDays(item.targetDate)
        }

        if (item.category === 'task') {
          return isWithinSevenDays(item.createdAt)
        }

        return true
      })

  // --- Getters ---
  const sortedFeedMessages = computed(() => {
    const standardizedMessages = feedMessages.value.map((msg) => ({
      ...msg,
      createdAt: getSafeDate(msg.createdAt),
      resolvedAt: getSafeDate(msg.resolvedAt),
    }))
    return standardizedMessages.sort((a, b) => {
      const aIsDone = a.status === 'completed'
      const bIsDone = b.status === 'completed'
      if (aIsDone !== bIsDone) return aIsDone ? 1 : -1
      const dateA = aIsDone ? (a.resolvedAt as Date) : (a.createdAt as Date)
      const dateB = bIsDone ? (b.resolvedAt as Date) : (b.createdAt as Date)
      return dateB.getTime() - dateA.getTime()
    })
  })

  const getPatientMessageTypesMapForDate = computed(() => {
    return (targetDate?: string) => {
      const dateToCompare = targetDate ? new Date(targetDate) : new Date()
      const dateStr = formatDateToYYYYMMDD(dateToCompare)
      const map = new Map<string, Set<string>>()
      const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')
      for (const msg of pendingMessages) {
        if (!msg.patientId) continue
        let shouldDisplayIcon = false
        if (!msg.targetDate || (msg.targetDate as string) <= dateStr) {
          shouldDisplayIcon = true
        }
        if (shouldDisplayIcon) {
          if (!map.has(msg.patientId)) {
            map.set(msg.patientId, new Set())
          }
          map.get(msg.patientId)?.add(msg.type === '常規' ? 'memo' : (msg.type as string))
        }
      }
      conditionRecordPatientIds.value.forEach((patientId) => {
        if (!map.has(patientId)) {
          map.set(patientId, new Set())
        }
        map.get(patientId)?.add('record')
      })
      const finalMap = new Map<string, string[]>()
      for (const [patientId, typeSet] of map.entries()) {
        finalMap.set(patientId, Array.from(typeSet))
      }
      return finalMap
    }
  })

  const allPendingPatientMessageTypesMap = computed(() => {
    const map = new Map<string, Set<string>>()
    const pendingMessages = feedMessages.value.filter((msg) => msg.status === 'pending')
    for (const msg of pendingMessages) {
      if (!msg.patientId) continue
      if (!map.has(msg.patientId)) {
        map.set(msg.patientId, new Set())
      }
      map.get(msg.patientId)?.add((msg.type as string) || '常規')
    }
    const finalMap = new Map<string, string[]>()
    for (const [patientId, typeSet] of map.entries()) {
      finalMap.set(patientId, Array.from(typeSet))
    }
    return finalMap
  })

  const todayTaskCount = computed(() => (todayAssignedPatientIds?: string[]) => {
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
    return (patientIdArray?: string[]) => {
      if (!patientIdArray || patientIdArray.length === 0) return 0
      const todayStr = formatDateToYYYYMMDD()
      const patientIdSet = new Set(patientIdArray)
      return feedMessages.value.filter((item) => {
        const isTargetDateRelevant = !item.targetDate || (item.targetDate as string) <= todayStr
        return (
          item.status === 'pending' &&
          item.patientId &&
          patientIdSet.has(item.patientId) &&
          isTargetDateRelevant &&
          item.content &&
          !(item.content as string).startsWith('【')
        )
      }).length
    }
  })

  // --- Actions ---
  function updateTasksFromConditionRecords(patientIdSet: Set<string>) {
    conditionRecordPatientIds.value = patientIdSet
  }

  function startRealtimeUpdates(uid?: string) {
    if (unsubscribes.length > 0) return
    if (!uid || !currentUser.value) {
      isLoading.value = false
      return
    }

    isLoading.value = true
    let listenersInitialized = 0
    // 定義我們總共需要幾個 listener 回來才算 ready
    // myTasksByRole, myTasksByUser, mySentTasks, messages = 4 個
    const totalListeners = 4
    let roleAssignedTasks: TaskItem[] = []
    let userAssignedTasks: TaskItem[] = []

    const refreshMyTasks = () => {
      // ✨ 修正：合併陣列後，使用 Map 根據 id 進行去重複
      const allRawTasks = [...roleAssignedTasks, ...userAssignedTasks]

      // 利用 Map 的特性，相同的 key (id) 會被覆蓋，只保留一個
      const uniqueTasks = Array.from(new Map(allRawTasks.map((item) => [item.id, item])).values())

      myTasks.value = applyRetentionPolicy(uniqueTasks)
    }

    const checkLoadingState = () => {
      listenersInitialized++
      if (listenersInitialized >= totalListeners) {
        isLoading.value = false
      }
    }

    const user = currentUser.value
    const titleToRoleValue: Record<string, string> = {
      書記: 'clerk',
      主治醫師: 'doctor',
      專科護理師: 'np',
      護理師組長: 'editor',
    }
    const myTargetAssigneeValues = new Set<string>()
    const titleBasedRole = user.title && titleToRoleValue[user.title]
    if (titleBasedRole) myTargetAssigneeValues.add(titleBasedRole)
    if (user.role) myTargetAssigneeValues.add(user.role)

    // 1. Role tasks (依角色指派)
    // 修正：查詢 assignee.role 欄位
    if (myTargetAssigneeValues.size > 0) {
      const myTasksQuery = query(
        collection(db, 'tasks'),
        where('category', '==', 'task'),
        where('status', 'in', ['pending', 'completed']),
        where('assignee.role', 'in', Array.from(myTargetAssigneeValues)),
      )

      const unsubscribeRoleTasks = onSnapshot(myTasksQuery, (snapshot) => {
        roleAssignedTasks = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((task) => task.status === 'pending' || isWithinSevenDays(task.createdAt))
        refreshMyTasks()
        checkLoadingState()
      })
      unsubscribes.push(unsubscribeRoleTasks)
    } else {
      // 如果沒有 role listener，手動增加計數以免 loading 卡住
      checkLoadingState()
    }

    // 2. User specific tasks (依特定人員指派)
    // 修正：查詢 assignee.value 欄位 (UID)
    const myTasksQuery = query(
      collection(db, 'tasks'),
      where('category', '==', 'task'),
      where('status', 'in', ['pending', 'completed']),
      where('assignee.value', '==', user.uid),
    )

    const unsubscribeUserTasks = onSnapshot(myTasksQuery, (snapshot) => {
      userAssignedTasks = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((task) => task.status === 'pending' || isWithinSevenDays(task.createdAt))
      refreshMyTasks()
      checkLoadingState()
    })
    unsubscribes.push(unsubscribeUserTasks)

    // 3. Tasks sent by me (我寄出的)
    // 修正：查詢 creator.uid 欄位 (取代舊的 createdBy.uid)
    const mySentTasksQuery = query(
      collection(db, 'tasks'),
      where('category', '==', 'task'),
      where('creator.uid', '==', user.uid),
      where('status', 'in', ['pending', 'completed']),
    )

    const unsubscribeMySentTasks = onSnapshot(mySentTasksQuery, (snapshot) => {
      mySentTasks.value = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((task) => task.status === 'pending' || isWithinSevenDays(task.createdAt))
      checkLoadingState()
    })
    unsubscribes.push(unsubscribeMySentTasks)

    // 4. Messages (病人留言)
    const myMessagesQuery = query(collection(db, 'tasks'), where('category', '==', 'message'))

    const unsubscribeMessages = onSnapshot(myMessagesQuery, (snapshot) => {
      const messages = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((msg) => msg.status === 'pending' || isWithinSevenDays(msg.createdAt))
      feedMessages.value = applyRetentionPolicy(messages)
      feedMessagesVersion.value++
      checkLoadingState()
    })
    unsubscribes.push(unsubscribeMessages)
  }

  function stopRealtimeUpdates() {
    unsubscribes.forEach((unsub) => unsub())
    unsubscribes = []
    isLoading.value = false
  }

  // 定義 cleanupListeners 作為 stopRealtimeUpdates 的別名
  const cleanupListeners = stopRealtimeUpdates

  watch(
    () => currentUser.value?.id,
    (newUserId, oldUserId) => {
      if (newUserId !== oldUserId) {
        stopRealtimeUpdates()
        if (newUserId) startRealtimeUpdates(newUserId)
      }
    },
  )

  return {
    // State
    myTasks,
    mySentTasks,
    feedMessages,
    feedMessagesVersion,
    isLoading,
    conditionRecordPatientIds,

    // Getters
    sortedFeedMessages,
    getPatientMessageTypesMapForDate,
    allPendingPatientMessageTypesMap,
    todayTaskCount,
    todayRelevantMemosCount,

    // Actions
    startRealtimeUpdates,
    stopRealtimeUpdates,
    updateTasksFromConditionRecords,
    cleanupListeners,
  }
})
