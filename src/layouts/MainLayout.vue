<!-- 檔案路徑: src/layouts/MainLayout.vue (已整合訊息中心通知角標) -->
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
          <li>
            <RouterLink to="/exception-manager" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">調班換床</span>
                <span class="nav-subtitle"></span>
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
            <RouterLink to="/memo" class="nav-link">
              <div class="nav-item-content">
                <span class="nav-title">交班備忘錄</span>
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
              <span v-if="todayTaskCount > 0" class="notification-badge">
                {{ todayTaskCount }}
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
          <!-- 將 h3 改為可點擊的按鈕，並加上箭頭圖示 -->
          <h3
            class="section-title is-collapsible"
            @click="isManagementSectionCollapsed = !isManagementSectionCollapsed"
            :class="{ 'is-collapsed': isManagementSectionCollapsed }"
          >
            <span>後臺管理</span>
            <i class="fas fa-chevron-down"></i>
          </h3>

          <!-- 用 v-if 控制列表的顯示/隱藏 -->
          <ul v-if="!isManagementSectionCollapsed" class="sidebar-nav">
            <li v-if="canEditSchedules">
              <RouterLink to="/daily-log" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">工作日誌</span>
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
                  <span class="nav-title">檢驗報告管理</span>
                </div>
              </RouterLink>
            </li>
            <li v-if="canViewConsumables">
              <RouterLink to="/consumables" class="nav-link">
                <div class="nav-item-content">
                  <span class="nav-title">每月耗材總表</span>
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
import { useAuth } from '@/composables/useAuth.js'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import { httpsCallable } from 'firebase/functions'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import { where, onSnapshot, collection, query } from 'firebase/firestore'
import { db, functions } from '@/composables/useFirebase.js'

import { storeToRefs } from 'pinia'
import { usePatientStore } from '@/stores/patientStore.js'
import { useTaskStore } from '@/stores/taskStore.js'

const router = useRouter()
const route = useRoute()
const {
  currentUser,
  logout,
  isAdmin,
  canEditSchedules,
  canManagePhysicianSchedule,
  canManageOrders,
  canViewConsumables,
} = useAuth()
const { notifications, startListening, stopListening } = useRealtimeNotifications()

const isSidebarOpen = ref(false)
const isManagementSectionCollapsed = ref(true)
const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore)
const taskStore = useTaskStore()
const { todayTaskCount } = storeToRefs(taskStore)
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

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  const memoPatientName = activeMemos.value.find((m) => m.patientId === patientId)?.patientName
  if (!patient && !memoPatientName) {
    return
  }
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

let memoUnsubscribe = null

function startSharedDataListeners() {
  if (memoUnsubscribe) return
  console.log('🔄 [MainLayout] Starting to listen for active memos...')
  const memoQuery = query(collection(db, 'memos'), where('status', '==', 'pending'))
  memoUnsubscribe = onSnapshot(memoQuery, (snapshot) => {
    activeMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    console.log(`✅ [MainLayout] Active memos updated: ${activeMemos.value.length} items.`)
  })
}
function stopSharedDataListeners() {
  if (memoUnsubscribe) {
    console.log('🛑 [MainLayout] Stopping memo listener.')
    memoUnsubscribe()
    memoUnsubscribe = null
  }
}

const triggerScheduleCheck = async () => {
  if (sessionStorage.getItem('hasCheckedSchedules')) {
    return
  }
  try {
    const checkSchedules = httpsCallable(functions, 'checkSchedules')
    await checkSchedules()
    sessionStorage.setItem('hasCheckedSchedules', 'true')
  } catch (error) {
    console.error('觸發排程檢查失敗:', error)
  }
}

watch(
  () => currentUser.value,
  (newUser) => {
    if (newUser) {
      console.log('✅ [MainLayout] User logged in, starting services.')
      startSharedDataListeners()
      triggerScheduleCheck()
      startListening()
      // ✨ [核心修改] 3. 使用者登入時，開始監聽任務
      taskStore.startListeningForTodayTasks()
    } else {
      console.log('🚪 [MainLayout] User logged out, stopping services.')
      activeMemos.value = []
      stopSharedDataListeners()
      sessionStorage.removeItem('hasCheckedSchedules')
      stopListening()
      patientStore.$reset()
      // ✨ [核心修改] 4. 使用者登出時，停止監聽
      taskStore.stopListening()
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
  // ✨ [核心修改] 5. 元件卸載時，也確保停止監聽
  taskStore.stopListening()
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
  /* ✨ [核心修改] 6. 修改樣式以容納角標 */
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

/* ✨ [核心修改] 7. 新增通知角標的 CSS 樣式 */
.notification-badge {
  background-color: #e74c3c; /* 紅色背景 */
  color: white; /* 白色數字 */
  border-radius: 50%; /* 圓形 */
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  line-height: 1;
  /* 加上一個與背景同色的邊框，創造視覺間隔 */
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
  overflow-y: auto; /* ✨ 關鍵：將滾動責任交給 wrapper，但我們稍後會覆蓋它 */
  padding: 1.2rem;
  /* ✨ 新增下面這三行 */
  display: flex;
  flex-direction: column;
  height: 100%; /* 確保 wrapper 嘗試撐滿 content-area */
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
/* ================================== */
/*     ✨ 後臺管理收合功能樣式 ✨     */
/* ================================== */
.section-title.is-collapsible {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  padding: 8px 15px; /* 增加點擊區域 */
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

/* 為 ul 加上一點過渡效果 (可選) */
.management-section .sidebar-nav {
  /* 如果您想要滑動效果，可以嘗試用 transition，但 v-if 的效果更直接 */
  overflow: hidden;
}
/* ✨ [新增] 導覽項目主副標題樣式 ✨ */
/* ================================== */
/*         Nav Item Subtitle          */
/* ================================== */

.nav-link {
  /* 修改現有規則，讓內容垂直居中 */
  align-items: center;
}

/* 這個 div 用來包裹主副標題，並與角標(badge)分開 */
.nav-item-content {
  display: flex;
  flex-direction: column; /* 讓主副標題垂直排列 */
  line-height: 1.4; /* 調整行高 */
  flex-grow: 1; /* 讓它佔滿左側所有可用空間 */
}

.nav-title {
  /* 主標題樣式 */
  font-size: 1.05em; /* 這是您原本 nav-link 的字體大小 */
}

.nav-subtitle {
  /* 副標題樣式 */
  font-size: 0.75rem; /* 字體縮小 */
  color: #95a5a6; /* 使用較淡的灰色 */
  font-weight: 400; /* 正常字重 */
  opacity: 0.9;
  margin-top: 2px;
  transition: color 0.2s; /* 增加顏色過渡效果 */
}

/* 當連結被選中時，讓副標題也變亮 */
.nav-link.router-link-exact-active .nav-subtitle {
  color: #ecf0f1;
  opacity: 1;
}

/* 修正 router-link 的 display 屬性，以正確對齊角標 */
.sidebar-nav li > .nav-link {
  display: flex;
  justify-content: space-between;
  align-items: center;
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
    display: flex;
    align-items: center;
    padding: 0 1rem;
    height: 60px;
    background-color: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    flex-shrink: 0;
    z-index: 900;
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
