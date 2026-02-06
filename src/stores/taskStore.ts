// src/stores/taskStore.ts
// Zustand store for tasks and feed messages with real-time Firestore listeners
// (migrated from Pinia)

import { create } from 'zustand'
import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useAuthStore } from '@/stores/authStore'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Assignee {
  role?: string
  value?: string
  [key: string]: unknown
}

interface Creator {
  uid?: string
  [key: string]: unknown
}

export interface TaskRecord {
  id: string
  status?: string
  category?: string
  type?: string
  createdAt?: string | { toDate: () => Date } | Date
  targetDate?: string
  patientId?: string
  assignee?: Assignee
  creator?: Creator
  [key: string]: unknown
}

interface TaskState {
  // State
  myTasks: TaskRecord[]
  mySentTasks: TaskRecord[]
  feedMessages: TaskRecord[]
  feedMessagesVersion: number
  isLoading: boolean
  conditionRecordPatientIds: Set<string>

  // Derived selectors
  getSortedFeedMessages: () => TaskRecord[]
  getPatientMessageTypesMapForDate: (
    targetDate?: string
  ) => Map<string, string[]>
  getAllPendingPatientMessageTypesMap: () => Map<string, string[]>
  getTodayTaskCount: (todayAssignedPatientIds?: string[]) => number
  getTodayRelevantMemosCount: (patientIdArray?: string[]) => number

  // Actions
  startRealtimeUpdates: (uid: string) => void
  stopRealtimeUpdates: () => void
  updateTasksFromConditionRecords: (patientIdSet: Set<string>) => void
  cleanupListeners: () => void
  $reset: () => void
}

// ---------------------------------------------------------------------------
// Module-level listener references (not part of reactive state)
// ---------------------------------------------------------------------------

let _unsubscribers: Unsubscribe[] = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise various Firestore timestamp shapes into a JS Date */
function toDate(
  value: string | { toDate: () => Date } | Date | undefined | null
): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === 'string') return new Date(value)
  if (typeof (value as { toDate: () => Date }).toDate === 'function')
    return (value as { toDate: () => Date }).toDate()
  return null
}

/** Check whether a date string or Firestore timestamp falls within the last N days */
function isWithinDays(
  value: string | { toDate: () => Date } | Date | undefined | null,
  days: number
): boolean {
  const d = toDate(value)
  if (!d) return false
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  return d >= cutoff
}

/**
 * 7-day retention policy for messages:
 *   - status !== 'deleted'
 *   - 衛教 (health-education) type messages are always kept
 *   - Otherwise, kept if createdAt within 7 days OR targetDate within 7 days
 */
function shouldKeepMessage(item: TaskRecord): boolean {
  if (item.status === 'deleted') return false
  if (item.type === '衛教') return true
  return (
    isWithinDays(item.createdAt, 7) || isWithinDays(item.targetDate, 7)
  )
}

/**
 * 7-day retention policy for tasks:
 *   - status !== 'deleted'
 *   - Kept if createdAt within 7 days
 */
function shouldKeepTask(item: TaskRecord): boolean {
  if (item.status === 'deleted') return false
  return isWithinDays(item.createdAt, 7)
}

/** Compare for sorting: pending first, then by date descending */
function compareFeedMessages(a: TaskRecord, b: TaskRecord): number {
  const aIsPending = a.status === 'pending' ? 0 : 1
  const bIsPending = b.status === 'pending' ? 0 : 1
  if (aIsPending !== bIsPending) return aIsPending - bIsPending

  const aDate = toDate(a.createdAt)?.getTime() ?? 0
  const bDate = toDate(b.createdAt)?.getTime() ?? 0
  return bDate - aDate // descending
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

const initialState = {
  myTasks: [] as TaskRecord[],
  mySentTasks: [] as TaskRecord[],
  feedMessages: [] as TaskRecord[],
  feedMessagesVersion: 0,
  isLoading: false,
  conditionRecordPatientIds: new Set<string>(),
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTaskStore = create<TaskState>((set, get) => ({
  ...initialState,

  // -------------------------------------------------------------------------
  // Derived selectors
  // -------------------------------------------------------------------------

  getSortedFeedMessages: (): TaskRecord[] => {
    return [...get().feedMessages].sort(compareFeedMessages)
  },

  getPatientMessageTypesMapForDate: (
    targetDate?: string
  ): Map<string, string[]> => {
    const date = targetDate ?? formatDateToYYYYMMDD(new Date())
    const map = new Map<string, string[]>()

    for (const msg of get().feedMessages) {
      if (
        msg.category === 'message' &&
        msg.targetDate === date &&
        msg.patientId &&
        msg.type
      ) {
        const existing = map.get(msg.patientId) ?? []
        if (!existing.includes(msg.type)) {
          existing.push(msg.type)
        }
        map.set(msg.patientId, existing)
      }
    }

    return map
  },

  getAllPendingPatientMessageTypesMap: (): Map<string, string[]> => {
    const map = new Map<string, string[]>()

    for (const msg of get().feedMessages) {
      if (
        msg.category === 'message' &&
        msg.status === 'pending' &&
        msg.patientId &&
        msg.type
      ) {
        const existing = map.get(msg.patientId) ?? []
        if (!existing.includes(msg.type)) {
          existing.push(msg.type)
        }
        map.set(msg.patientId, existing)
      }
    }

    return map
  },

  getTodayTaskCount: (todayAssignedPatientIds?: string[]): number => {
    const today = formatDateToYYYYMMDD(new Date())
    const { myTasks, feedMessages } = get()

    // Count pending tasks targeted for today
    const pendingTasks = myTasks.filter(
      (t) => t.status === 'pending' && t.targetDate === today
    ).length

    // Count relevant pending memos (messages targeted at today's assigned patients)
    let relevantMemos = 0
    if (todayAssignedPatientIds && todayAssignedPatientIds.length > 0) {
      const patientIdSet = new Set(todayAssignedPatientIds)
      relevantMemos = feedMessages.filter(
        (m) =>
          m.category === 'message' &&
          m.status === 'pending' &&
          m.patientId &&
          patientIdSet.has(m.patientId)
      ).length
    }

    return pendingTasks + relevantMemos
  },

  getTodayRelevantMemosCount: (patientIdArray?: string[]): number => {
    if (!patientIdArray || patientIdArray.length === 0) return 0

    const patientIdSet = new Set(patientIdArray)
    return get().feedMessages.filter(
      (m) =>
        m.category === 'message' &&
        m.status === 'pending' &&
        m.patientId &&
        patientIdSet.has(m.patientId)
    ).length
  },

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  startRealtimeUpdates: (uid: string) => {
    // Clean up any existing listeners first
    get().stopRealtimeUpdates()

    set({ isLoading: true })

    const currentUser = useAuthStore.getState().currentUser
    const userRoles: string[] = currentUser?.roles ?? []

    const tasksCol = collection(db, 'tasks')

    // -----------------------------------------------------------------------
    // Listener 1: Role-assigned tasks (assignee.role matches one of user's roles)
    // -----------------------------------------------------------------------
    if (userRoles.length > 0) {
      // Firestore 'in' queries support up to 30 values
      const roleChunks: string[][] = []
      for (let i = 0; i < userRoles.length; i += 30) {
        roleChunks.push(userRoles.slice(i, i + 30))
      }

      for (const chunk of roleChunks) {
        const roleQuery = query(
          tasksCol,
          where('assignee.role', 'in', chunk),
          where('category', '==', 'task')
        )
        const unsub = onSnapshot(
          roleQuery,
          (snapshot) => {
            const roleTasks: TaskRecord[] = []
            snapshot.forEach((docSnap) => {
              const data = { id: docSnap.id, ...docSnap.data() } as TaskRecord
              if (shouldKeepTask(data)) {
                roleTasks.push(data)
              }
            })
            set((state) => {
              // Merge: remove old role-assigned tasks, add new ones
              const nonRoleTasks = state.myTasks.filter(
                (t) => !roleTasks.some((rt) => rt.id === t.id) && t.assignee?.value === uid
              )
              // Deduplicate in case a task appears in both role and user queries
              const merged = new Map<string, TaskRecord>()
              for (const t of [...nonRoleTasks, ...roleTasks]) {
                merged.set(t.id, t)
              }
              return {
                myTasks: Array.from(merged.values()),
                isLoading: false,
              }
            })
          },
          (err) => {
            console.error('[TaskStore] Role-assigned tasks listener error:', err)
            set({ isLoading: false })
          }
        )
        _unsubscribers.push(unsub)
      }
    }

    // -----------------------------------------------------------------------
    // Listener 2: User-specific tasks (assignee.value === uid)
    // -----------------------------------------------------------------------
    const userTaskQuery = query(
      tasksCol,
      where('assignee.value', '==', uid),
      where('category', '==', 'task')
    )
    const unsubUserTasks = onSnapshot(
      userTaskQuery,
      (snapshot) => {
        const userTasks: TaskRecord[] = []
        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() } as TaskRecord
          if (shouldKeepTask(data)) {
            userTasks.push(data)
          }
        })
        set((state) => {
          // Merge: keep role-assigned tasks that are NOT user-specific, add new user tasks
          const roleOnlyTasks = state.myTasks.filter(
            (t) => t.assignee?.value !== uid
          )
          const merged = new Map<string, TaskRecord>()
          for (const t of [...roleOnlyTasks, ...userTasks]) {
            merged.set(t.id, t)
          }
          return {
            myTasks: Array.from(merged.values()),
            isLoading: false,
          }
        })
      },
      (err) => {
        console.error('[TaskStore] User tasks listener error:', err)
        set({ isLoading: false })
      }
    )
    _unsubscribers.push(unsubUserTasks)

    // -----------------------------------------------------------------------
    // Listener 3: Tasks sent by me (creator.uid === uid)
    // -----------------------------------------------------------------------
    const sentTaskQuery = query(
      tasksCol,
      where('creator.uid', '==', uid),
      where('category', '==', 'task')
    )
    const unsubSentTasks = onSnapshot(
      sentTaskQuery,
      (snapshot) => {
        const sentTasks: TaskRecord[] = []
        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() } as TaskRecord
          if (shouldKeepTask(data)) {
            sentTasks.push(data)
          }
        })
        set({ mySentTasks: sentTasks })
      },
      (err) => {
        console.error('[TaskStore] Sent tasks listener error:', err)
      }
    )
    _unsubscribers.push(unsubSentTasks)

    // -----------------------------------------------------------------------
    // Listener 4: Messages (category === 'message')
    // -----------------------------------------------------------------------
    const messagesQuery = query(
      tasksCol,
      where('category', '==', 'message')
    )
    const unsubMessages = onSnapshot(
      messagesQuery,
      (snapshot) => {
        const messages: TaskRecord[] = []
        snapshot.forEach((docSnap) => {
          const data = { id: docSnap.id, ...docSnap.data() } as TaskRecord
          if (shouldKeepMessage(data)) {
            messages.push(data)
          }
        })
        set((state) => ({
          feedMessages: messages,
          feedMessagesVersion: state.feedMessagesVersion + 1,
          isLoading: false,
        }))
      },
      (err) => {
        console.error('[TaskStore] Messages listener error:', err)
        set({ isLoading: false })
      }
    )
    _unsubscribers.push(unsubMessages)
  },

  stopRealtimeUpdates: () => {
    for (const unsub of _unsubscribers) {
      try {
        unsub()
      } catch (err) {
        console.error('[TaskStore] Error unsubscribing listener:', err)
      }
    }
    _unsubscribers = []
  },

  updateTasksFromConditionRecords: (patientIdSet: Set<string>) => {
    set({ conditionRecordPatientIds: new Set(patientIdSet) })
  },

  cleanupListeners: () => {
    get().stopRealtimeUpdates()
  },

  $reset: () => {
    get().stopRealtimeUpdates()
    set({ ...initialState, conditionRecordPatientIds: new Set<string>() })
  },
}))

// ---------------------------------------------------------------------------
// Standalone selectors
// ---------------------------------------------------------------------------

export const selectMyTasks = (state: TaskState) => state.myTasks
export const selectMySentTasks = (state: TaskState) => state.mySentTasks
export const selectFeedMessages = (state: TaskState) => state.feedMessages
export const selectIsLoading = (state: TaskState) => state.isLoading
export const selectFeedMessagesVersion = (state: TaskState) =>
  state.feedMessagesVersion
export const selectConditionRecordPatientIds = (state: TaskState) =>
  state.conditionRecordPatientIds
