import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth'
// ✨ 1. 引入 patientStore
import { usePatientStore } from '@/stores/patientStore'

export const useTaskStore = defineStore('task', () => {
  // --- 依賴注入 ---
  const { currentUser } = useAuth()
  // ✨ 2. 實例化 patientStore
  const patientStore = usePatientStore()

  // --- 內部狀態 ---
  const todayAssignedPatientIds = ref([])
  const pendingTasks = ref([])
  const pendingMemos = ref([])
  const isLoadingAssignments = ref(false)

  // --- 導出狀態 ---
  const todayTaskCount = computed(() => {
    return pendingTasks.value.length + pendingMemos.value.length
  })

  // --- 監聽器取消訂閱函式 ---
  let taskUnsubscribe = null
  let memoUnsubscribe = null

  async function fetchTodayAssignedPatients() {
    if (!currentUser.value || !['護理師', '護理師組長'].includes(currentUser.value.title)) {
      console.log('[TaskStore] User is not a nurse staff, skipping patient assignment fetch.')
      todayAssignedPatientIds.value = []
      return
    }

    isLoadingAssignments.value = true
    const today = new Date().toISOString().slice(0, 10)
    console.log(
      `[TaskStore] Fetching patient assignments for user ${currentUser.value.name} on ${today}...`,
    )

    try {
      // ✨ 3. 在查詢排班前，先確保 patientStore 已獲取病人資料
      //    fetchPatientsIfNeeded 內部有防呆機制，不會重複請求
      await patientStore.fetchPatientsIfNeeded()

      const schedulesQuery = query(collection(db, 'schedules'), where('date', '==', today))
      const schedulesSnapshot = await getDocs(schedulesQuery)
      if (schedulesSnapshot.empty) {
        console.log(`[TaskStore] No schedule found for ${today}.`)
        todayAssignedPatientIds.value = []
        isLoadingAssignments.value = false
        return
      }

      const assignmentsQuery = query(
        collection(db, 'nurse_assignments'),
        where('date', '==', today),
      )
      const assignmentsSnapshot = await getDocs(assignmentsQuery)
      if (assignmentsSnapshot.empty) {
        console.log(`[TaskStore] No nurse assignments found for ${today}.`)
        todayAssignedPatientIds.value = []
        isLoadingAssignments.value = false
        return
      }

      const { names, teams } = assignmentsSnapshot.docs[0].data()
      const myAssignedIds = new Set()
      if (names && teams) {
        for (const teamName in names) {
          if (names[teamName] === currentUser.value.name) {
            for (const key in teams) {
              const [patientId] = key.split('-')
              const teamAssignment = teams[key]
              if (
                teamAssignment.nurseTeam === teamName ||
                teamAssignment.nurseTeamIn === teamName ||
                teamAssignment.nurseTeamOut === teamName
              ) {
                myAssignedIds.add(patientId)
              }
            }
          }
        }
      }

      todayAssignedPatientIds.value = Array.from(myAssignedIds)
      console.log(
        `[TaskStore] Fetched ${myAssignedIds.size} assigned patients for today.`,
        todayAssignedPatientIds.value,
      )
    } catch (error) {
      console.error("[TaskStore] Failed to fetch today's assigned patients:", error)
      todayAssignedPatientIds.value = []
    } finally {
      isLoadingAssignments.value = false
    }
  }

  async function startListeningForTodayTasks() {
    if (!currentUser.value?.uid) {
      console.warn('[TaskStore] User not logged in. Cannot start listening.')
      return
    }

    stopListening()
    console.log('[TaskStore] Starting listeners...')

    // --- 監聽器 A: 我的交辦事項 (category: 'task') ---
    const myTargetAssigneeValues = []
    const titleToRoleValue = { 書記: 'clerk', 主治醫師: 'doctor', 專科護理師: 'np' }
    const titleBasedRole = titleToRoleValue[currentUser.value.title]
    if (titleBasedRole) myTargetAssigneeValues.push(titleBasedRole)
    if (currentUser.value.role) myTargetAssigneeValues.push(currentUser.value.role)
    const uniqueTargetValues = [...new Set(myTargetAssigneeValues)]

    if (uniqueTargetValues.length > 0) {
      const tasksQuery = query(
        collection(db, 'tasks'),
        where('category', '==', 'task'),
        where('status', '==', 'pending'),
        where('assignee.type', '==', 'role'),
        where('assignee.value', 'in', uniqueTargetValues),
      )
      taskUnsubscribe = onSnapshot(tasksQuery, (snapshot) => {
        pendingTasks.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        console.log(
          `[TaskStore] Pending tasks (for my role/title) updated: ${pendingTasks.value.length}`,
        )
      })
    } else {
      console.log('[TaskStore] User has no target roles/titles for tasks, skipping task listener.')
      pendingTasks.value = []
    }

    // --- 監聽器 B: 與我今日病人相關的留言 (category: 'message') ---
    await fetchTodayAssignedPatients()

    if (memoUnsubscribe) memoUnsubscribe()

    if (todayAssignedPatientIds.value.length > 0) {
      const memosQuery = query(
        collection(db, 'tasks'),
        where('category', '==', 'message'),
        where('status', '==', 'pending'),
        where('patientId', 'in', todayAssignedPatientIds.value),
      )
      memoUnsubscribe = onSnapshot(
        memosQuery,
        (snapshot) => {
          pendingMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
          console.log(
            `[TaskStore] Pending memos (for my patients) updated: ${pendingMemos.value.length}`,
          )
        },
        (error) => {
          console.error('[TaskStore] Error listening to memos:', error)
        },
      )
    } else {
      console.log('[TaskStore] No assigned patients for today, skipping memo listener.')
      pendingMemos.value = []
    }
  }

  function stopListening() {
    if (taskUnsubscribe) taskUnsubscribe()
    taskUnsubscribe = null
    if (memoUnsubscribe) memoUnsubscribe()
    memoUnsubscribe = null
    pendingTasks.value = []
    pendingMemos.value = []
    todayAssignedPatientIds.value = []
    console.log('[TaskStore] All listeners stopped and state cleared.')
  }

  watch(
    () => currentUser.value,
    (user) => {
      if (!user) {
        stopListening()
      }
    },
  )

  return {
    todayTaskCount,
    startListeningForTodayTasks,
    stopListening,
  }
})
