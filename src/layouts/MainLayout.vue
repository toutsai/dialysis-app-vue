<template>
  <div class="dashboard-container" :class="{ 'sidebar-open': isSidebarOpen }">
    <aside class="sidebar" :class="{ 'is-open': isSidebarOpen }">
      <!-- 1. 固定的頂部導覽 -->
      <div class="main-nav-section">
        <div class="sidebar-header">
          <span class="platform-title">部北透析管理平台</span>
          <span v-if="environmentTag" :class="['environment-tag', environmentTag.class]">
            {{ environmentTag.text }}
          </span>
        </div>
        <ul class="sidebar-nav">
          <li>
            <RouterLink to="/schedule" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">每日排程</span>
                <span class="nav-subtitle"></span>
              </div>
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/stats" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">護理分組</span>
                <span class="nav-subtitle"></span>
              </div>
            </RouterLink>
          </li>
          <li>
            <RouterLink :to="{ name: 'MyPatients' }" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">我的今日病人</span>
              </div>
            </RouterLink>
          </li>
          <li class="desktop-only-nav-item">
            <RouterLink to="/weekly" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">週排班</span>
                <span class="nav-subtitle"></span>
              </div>
            </RouterLink>
          </li>
          <li class="desktop-only-nav-item">
            <RouterLink to="/base-schedule" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">床位總表</span>
                <span class="nav-subtitle"></span>
              </div>
            </RouterLink>
          </li>
          <li class="desktop-only-nav-item">
            <RouterLink to="/exception-manager" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">調班換床</span>
                <span class="nav-subtitle"></span>
              </div>
              <span
                v-if="conflictCount > 0"
                class="alert-badge"
                :title="`有 ${conflictCount} 個衝突待解決`"
              >
                <i class="fas fa-exclamation-triangle"></i>
              </span>
            </RouterLink>
          </li>

          <!-- 只有護理師可以看到預約變更 -->
          <li v-if="isEditor" class="desktop-only-nav-item">
            <RouterLink to="/update-scheduler" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">預約變更</span>
              </div>
            </RouterLink>
          </li>

          <li>
            <RouterLink to="/patients" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">病人清單</span>
                <span class="nav-subtitle"></span>
              </div>
            </RouterLink>
          </li>
          <li>
            <RouterLink to="/collaboration" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">訊息中心</span>
                <span class="nav-subtitle"></span>
              </div>
              <span v-if="notificationCount > 0" class="notification-badge">
                {{ notificationCount }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>

      <!-- 通知區域 -->
      <div class="notification-area">
        <h3 v-if="notifications.length > 0" class="section-title">即時動態</h3>
        <transition-group name="notification-list" tag="div" class="notification-list">
          <div
            v-for="notif in notifications"
            :key="notif.id"
            class="notification-item"
            :class="{ 'is-clickable': !!notif.action }"
            :style="{ backgroundColor: notif.config.bgColor, color: notif.config.textColor }"
            @click="handleNotificationClick(notif)"
          >
            <div class="notification-content">
              <span class="notification-icon">{{ notif.config.icon }}</span>
              <p class="notification-message">{{ notif.message }}</p>
            </div>
            <div class="notification-footer-item">
              <span class="notification-user">by {{ notif.createdByName }}</span>
              <span class="notification-time">{{ notif.time }}</span>
            </div>
          </div>
        </transition-group>
      </div>

      <!-- 固定的底部容器 -->
      <div class="bottom-fixed-section">
        <div class="management-section">
          <h3
            class="section-title is-collapsible"
            @click="isManagementSectionCollapsed = !isManagementSectionCollapsed"
            :class="{ 'is-collapsed': isManagementSectionCollapsed }"
          >
            <span>後臺管理</span>
            <i class="fas fa-chevron-down"></i>
          </h3>

          <ul v-if="!isManagementSectionCollapsed" class="sidebar-nav">
            <li v-if="canEditSchedules">
              <RouterLink to="/daily-log" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">工作日誌</span>
                </div>
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/nursing-schedule" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">護理班表與職責</span>
                </div>
              </RouterLink>
            </li>
            <li v-if="canManagePhysicianSchedule">
              <RouterLink to="/physician-schedule" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">醫師班表</span>
                </div>
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/lab-reports" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">檢驗報告</span>
                </div>
              </RouterLink>
            </li>
            <li v-if="canViewConsumables">
              <RouterLink to="/consumables" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">每月耗材</span>
                </div>
              </RouterLink>
            </li>
            <li v-if="canManageOrders">
              <RouterLink to="/orders" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">藥囑管理</span>
                </div>
              </RouterLink>
            </li>
            <li>
              <RouterLink to="/reporting" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">統計報表</span>
                </div>
              </RouterLink>
            </li>
            <!-- ✨✨✨【新增：KiDit 申報】✨✨✨ -->
            <!-- 只有 Admin 或 Editor (護理師) 可見 -->
            <li v-if="isAdmin || isEditor">
              <RouterLink to="/kidit-report" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">KiDit 申報</span>
                </div>
              </RouterLink>
            </li>
            <li>
              <RouterLink v-if="isAdmin" to="/user-management" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">使用者管理</span>
                </div>
              </RouterLink>
            </li>
          </ul>
        </div>
        <div class="nav-footer">
          <div v-if="currentUser" class="user-info">
            <span>歡迎, {{ currentUser.name }}</span>
          </div>
          <div class="button-group">
            <RouterLink to="/account-settings" class="action-button btn-secondary"
              >更改密碼</RouterLink
            >
            <button @click="handleLogout" class="action-button btn-logout">登出</button>
          </div>
        </div>
      </div>
    </aside>

    <div class="sidebar-overlay" @click="closeSidebar" v-if="isSidebarOpen"></div>

    <main class="content-area">
      <header class="main-header">
        <button class="sidebar-toggle" @click="toggleSidebar">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <h2 class="current-page-title">{{ route.meta.title || '透析管理' }}</h2>
      </header>
      <div class="content-wrapper">
        <RouterView />
      </div>
    </main>

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import { where, onSnapshot, collection, query } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import ApiManager from '@/services/api_manager'

import { storeToRefs } from 'pinia'
import { usePatientStore } from '@/stores/patientStore'
import { useTaskStore } from '@/stores/taskStore'

const auth = useAuth()
const router = useRouter()
const route = useRoute()

// ✨✨✨【補充：確保這裡有解構出需要的權限變數】✨✨✨
const {
  currentUser,
  logout,
  isAdmin,
  isEditor, // 確保這個被解構出來
  canEditSchedules,
  canManagePhysicianSchedule,
  canManageOrders,
  canViewConsumables,
} = useAuth()

const { notifications, startListening, stopListening } = useRealtimeNotifications()

const isSidebarOpen = ref(false)
const isManagementSectionCollapsed = ref(true)

// --- Stores and State ---
const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore)
const taskStore = useTaskStore()
const { myTasks } = storeToRefs(taskStore)
const { todayRelevantMemosCount } = taskStore

const todayMyPatientIds = ref([])
const assignmentsApi = ApiManager('nurse_assignments')

const conflictCount = ref(0)
let conflictUnsubscribe = null // 用於儲存取消監聽的函式

const notificationCount = computed(() => {
  if (!currentUser.value) return 0
  const myPendingTasksCount = myTasks.value.filter((t) => t.status === 'pending').length
  const myPendingMemosCount = todayRelevantMemosCount(todayMyPatientIds.value)
  return myPendingTasksCount + myPendingMemosCount
})

// --- 過渡期 provide/inject ---
const activeMemos = ref([])
const isMemoDialogVisible = ref(false)
const patientNameForDialog = ref('')
const memosForDialog = ref([])
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () =>
    new Set(
      activeMemos.value
        .filter((memo) => memo.patientId && memo.status === 'pending')
        .map((memo) => memo.patientId),
    ),
)
provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

// --- Functions ---
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  const memoPatientName = activeMemos.value.find((m) => m.patientId === patientId)?.patientName
  if (!patient && !memoPatientName) return
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && memo.status === 'pending',
  )
  patientNameForDialog.value = patient ? patient.name : memoPatientName
  isMemoDialogVisible.value = true
}

const environmentTag = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return { text: '(開發版)', class: 'env-tag-dev' }
  } else if (import.meta.env.MODE === 'production') {
    return { text: '(正式版)', class: 'env-tag-prod' }
  }
  return null
})

function toggleSidebar() {
  isSidebarOpen.value = !isSidebarOpen.value
}
function closeSidebar() {
  isSidebarOpen.value = false
}
function handleNotificationClick(notif) {
  if (notif.action) {
    notif.action()
  }
}
function handleLogout() {
  logout()
}

async function fetchTodayAssignedPatients() {
  if (!currentUser.value || !['護理師', '護理師組長'].includes(currentUser.value.title)) {
    todayMyPatientIds.value = []
    return
  }
  const today = new Date().toISOString().slice(0, 10)
  try {
    const assignmentsSnapshot = await assignmentsApi.fetchAll([where('date', '==', today)])
    if (assignmentsSnapshot.length === 0) {
      todayMyPatientIds.value = []
      return
    }
    const { names, teams } = assignmentsSnapshot[0]
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
    todayMyPatientIds.value = Array.from(myAssignedIds)
  } catch (error) {
    console.error("[MainLayout] Failed to fetch today's assigned patients:", error)
    todayMyPatientIds.value = []
  }
}

let memoUnsubscribe = null
function startSharedDataListeners() {
  if (memoUnsubscribe) return
  const memoQuery = query(collection(db, 'memos'), where('status', '==', 'pending'))
  memoUnsubscribe = onSnapshot(memoQuery, (snapshot) => {
    activeMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  })
}
function stopSharedDataListeners() {
  if (memoUnsubscribe) {
    memoUnsubscribe()
    memoUnsubscribe = null
  }
}

function startConflictListener() {
  if (conflictUnsubscribe) return

  const exceptionsRef = collection(db, 'schedule_exceptions')
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const q = query(
    exceptionsRef,
    where('status', '==', 'conflict_requires_resolution'),
    where('expireAt', '>=', today),
  )

  conflictUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      conflictCount.value = snapshot.size
      if (snapshot.size > 0) {
        console.log(`[MainLayout] 偵測到 ${snapshot.size} 個【未過期】的待處理衝突。`)
      }
    },
    (error) => {
      console.error('❌ [MainLayout] 監聽調班衝突時發生錯誤:', error)
      conflictCount.value = 0
    },
  )
}

function stopConflictListener() {
  if (conflictUnsubscribe) {
    conflictUnsubscribe()
    conflictUnsubscribe = null
    conflictCount.value = 0
  }
}

watch(
  () => currentUser.value,
  async (newUser) => {
    if (newUser) {
      console.log('✅ [MainLayout] User logged in, starting services.')
      startSharedDataListeners()
      startListening()
      startConflictListener()
      await fetchTodayAssignedPatients()
      taskStore.startRealtimeUpdates(newUser.uid)
    } else {
      console.log('🚪 [MainLayout] User logged out, stopping services.')
      activeMemos.value = []
      stopSharedDataListeners()
      sessionStorage.removeItem('hasCheckedSchedules')
      stopListening()
      stopConflictListener()
      patientStore.$reset()
      taskStore.cleanupListeners()
      todayMyPatientIds.value = []
    }
  },
  { immediate: true },
)

watch(
  () => route.path,
  () => {
    if (window.innerWidth <= 992) {
      closeSidebar()
    }
  },
)

onUnmounted(() => {
  stopListening()
  stopSharedDataListeners()
  stopConflictListener()
  taskStore.cleanupListeners()
})
</script>

<style scoped>
/* ================================== */
/*         通用及桌面版樣式         */
/* ================================== */
.dashboard-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: 210px;
  background-color: #2c3e50;
  color: white;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  transition: width 0.3s ease;
}

.main-nav-section {
  padding: 15px 0;
  flex-shrink: 0;
}

.notification-area {
  flex-grow: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  border-top: 1px solid #34495e;
}

.bottom-fixed-section {
  flex-shrink: 0;
  border-top: 1px solid #34495e;
}

.notification-area::-webkit-scrollbar {
  width: 6px;
}
.notification-area::-webkit-scrollbar-track {
  background: transparent;
}
.notification-area::-webkit-scrollbar-thumb {
  background-color: #5a6a7a;
  border-radius: 20px;
}
.notification-area::-webkit-scrollbar-thumb:hover {
  background-color: #4a5568;
}

.sidebar-header {
  padding: 0 15px 15px 15px;
  border-bottom: 1px solid #34495e;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.platform-title {
  font-size: 1.4em;
  font-weight: bold;
}
.environment-tag {
  align-self: flex-end;
  font-size: 0.7rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 4px;
  opacity: 0.9;
}
.env-tag-dev {
  background-color: #ffc107;
  color: #333;
}
.env-tag-prod {
  background-color: #28a745;
  color: white;
}
.sidebar-nav {
  list-style: none;
  padding: 8px 0;
  margin: 0;
}
.nav-link {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: #ecf0f1;
  text-decoration: none;
  padding: 10px 15px;
  font-size: 1.05em;
  transition:
    background-color 0.2s,
    padding-left 0.2s;
  white-space: nowrap;
  border-radius: 0 25px 25px 0;
  margin-right: 10px;
}
.nav-link:hover {
  background-color: #34495e;
}
.nav-link.router-link-exact-active {
  background-color: var(--primary-color, #1abc9c);
  color: white;
  font-weight: bold;
}
.notification-badge {
  background-color: #e74c3c;
  color: white;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  line-height: 1;
  box-shadow: 0 0 0 2px #2c3e50;
}
.content-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f4f7f9;
}
.content-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.2rem;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.management-section {
  padding-top: 12px;
}
.section-title {
  font-size: 0.8em;
  font-weight: bold;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 15px;
  margin-bottom: 8px;
}
.management-section .sidebar-nav {
  padding-top: 0;
}
.management-section .nav-link {
  font-size: 1em;
  padding: 8px 15px;
}
.nav-footer {
  padding: 12px 15px;
  border-top: 1px solid #4a627a;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user-info {
  margin-bottom: 0;
  font-size: 1em;
  line-height: 1.4;
}
.user-info span {
  display: block;
}
.button-group {
  display: flex;
  gap: 8px;
}
.action-button {
  flex: 1;
  text-align: center;
  padding: 0.5rem;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  text-decoration: none;
  font-size: 0.85em;
  transition: background-color 0.2s;
}
.btn-logout {
  background: #e74c3c;
  color: white;
}
.btn-logout:hover {
  background: #c0392b;
}
.btn-secondary {
  background-color: #4a5568;
  color: white;
}
.btn-secondary:hover {
  background-color: #2d3748;
}
.notification-area .section-title {
  padding: 0 8px 6px 8px;
  margin: 0;
}
.notification-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.notification-item {
  border-radius: 6px;
  padding: 8px 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.2);
  transition: all 0.3s ease;
  position: relative;
}
.notification-item,
.notification-item .notification-message,
.notification-item .notification-icon,
.notification-item .notification-time,
.notification-item .notification-close {
  color: inherit;
}
.notification-item.is-clickable {
  cursor: pointer;
}
.notification-item.is-clickable:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}
.notification-content {
  display: block;
  margin-bottom: 4px;
}
.notification-icon {
  display: inline-block;
  vertical-align: middle;
  font-size: 1.1em;
  margin-right: 6px;
}
.notification-message {
  display: inline;
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.4;
  font-weight: 500;
  white-space: normal;
  word-break: break-word;
}
.notification-footer-item {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 0.5rem;
  padding-left: 24px;
  margin-top: 4px;
}
.notification-user {
  font-weight: bold;
  font-size: 0.8rem;
  opacity: 0.9;
}
.notification-time {
  font-size: 0.8rem;
  opacity: 0.85;
}
.notification-list-enter-active,
.notification-list-leave-active {
  transition: all 0.3s ease;
}
.notification-list-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}
.notification-list-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
.notification-list-move {
  transition: transform 0.3s ease;
}
.sidebar-overlay,
.main-header {
  display: none;
}
.section-title.is-collapsible {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 8px 15px;
  margin: 0;
  border-radius: 4px;
  transition: background-color 0.2s;
}
.section-title.is-collapsible:hover {
  background-color: #34495e;
}
.section-title.is-collapsible .fa-chevron-down {
  transition: transform 0.3s ease;
  font-size: 0.8em;
}
.section-title.is-collapsible.is-collapsed .fa-chevron-down {
  transform: rotate(-90deg);
}
.management-section .sidebar-nav {
  overflow: hidden;
}
.nav-item-content {
  display: flex;
  flex-direction: column;
  line-height: 1.4;
  flex-grow: 1;
}
.nav-title {
  font-size: 1.05em;
}
.nav-subtitle {
  font-size: 0.75rem;
  color: #95a5a6;
  font-weight: 400;
  opacity: 0.9;
  margin-top: 2px;
  transition: color 0.2s;
}
.nav-link.router-link-exact-active .nav-subtitle {
  color: #ecf0f1;
  opacity: 1;
}
.sidebar-nav li > .nav-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
/* ✨✨✨【核心修改 E】✨✨✨ */
.alert-badge {
  background-color: transparent;
  color: #ffc107;
  font-size: 1.1rem;
  width: auto;
  height: auto;
  position: absolute;
  top: 50%;
  right: 15px;
  transform: translateY(-50%);
  animation: blink-warning 1.8s infinite ease-in-out;
  text-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
}
@keyframes blink-warning {
  0%,
  100% {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }
  50% {
    opacity: 0.6;
    transform: translateY(-50%) scale(1.1);
  }
}
@media (max-width: 992px) {
  .desktop-only-nav-item {
    display: none;
  }
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    transform: translateX(-100%);
    transition: transform 0.3s ease-in-out;
    z-index: 1000;
    box-shadow: 4px 0 15px rgba(0, 0, 0, 0.2);
  }
  .sidebar.is-open {
    transform: translateX(0);
  }
  .content-area {
    width: 100%;
  }
  .main-header {
    position: sticky;
    top: 0;
    z-index: 999;
    background-color: #fff;
    height: 60px;
    display: flex;
    align-items: center;
    padding: 0 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }
  .sidebar-toggle {
    display: block;
    background: none;
    border: none;
    padding: 0.5rem;
    cursor: pointer;
    z-index: 1;
  }
  .sidebar-toggle span {
    display: block;
    width: 25px;
    height: 3px;
    background-color: #333;
    margin-bottom: 5px;
    border-radius: 3px;
    transition: all 0.3s;
  }
  .sidebar-toggle span:last-child {
    margin-bottom: 0;
  }
  .sidebar-open .sidebar-toggle span:nth-child(1) {
    transform: translateY(8px) rotate(45deg);
  }
  .sidebar-open .sidebar-toggle span:nth-child(2) {
    opacity: 0;
  }
  .sidebar-open .sidebar-toggle span:nth-child(3) {
    transform: translateY(-8px) rotate(-45deg);
  }
  .sidebar-open .sidebar-overlay {
    display: block;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 999;
    cursor: pointer;
  }
  .current-page-title {
    margin-left: 1rem;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
  }
  .content-wrapper {
    padding: 1rem;
  }
}
@media (max-width: 768px) {
  .content-wrapper {
    padding: 1rem;
  }
  .sidebar {
    width: 260px;
  }
}
</style>
