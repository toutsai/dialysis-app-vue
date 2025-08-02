<!-- 檔案路徑: src/layouts/MainLayout.vue (最終完整修正版) -->
<template>
  <!-- 根據側邊欄狀態添加 class，方便 CSS 控制 -->
  <div class="dashboard-container" :class="{ 'sidebar-open': isSidebarOpen }">
    <!-- 1. 側邊欄 (Sidebar) -->
    <aside class="sidebar" :class="{ 'is-open': isSidebarOpen }">
      <!-- 主要導航區塊 -->
      <div class="main-nav-section">
        <div class="sidebar-header">
          <span class="platform-title">部北透析管理平台</span>
          <span v-if="environmentTag" :class="['environment-tag', environmentTag.class]">
            {{ environmentTag.text }}
          </span>
        </div>
        <ul class="sidebar-nav">
          <li><RouterLink to="/schedule" class="nav-link">每日排程表</RouterLink></li>
          <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
          <li><RouterLink to="/weekly" class="nav-link">週排班表</RouterLink></li>
          <li><RouterLink to="/base-schedule" class="nav-link">門急住床位總表</RouterLink></li>
          <li><RouterLink to="/exception-manager" class="nav-link">調班管理</RouterLink></li>
          <li><RouterLink to="/patients" class="nav-link">病人管理</RouterLink></li>
          <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        </ul>
      </div>

      <!-- 底部功能區塊 -->
      <div class="footer-section">
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
                <span class="notification-time">{{ notif.time }}</span>
                <button class="notification-close" @click.stop="removeNotification(notif.id)">
                  ×
                </button>
              </div>
            </div>
          </transition-group>
        </div>

        <!-- 後臺管理區塊 -->
        <div class="management-section">
          <h3 class="section-title">後臺管理</h3>
          <ul class="sidebar-nav">
            <li><RouterLink to="/reporting" class="nav-link">統計報表</RouterLink></li>
            <li>
              <RouterLink v-if="isAdmin" to="/user-management" class="nav-link">
                使用者管理
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- 用戶資訊與操作按鈕 -->
        <div class="nav-footer">
          <div v-if="currentUser" class="user-info">
            <span>歡迎, {{ currentUser.name }}</span>
          </div>
          <div class="button-group">
            <RouterLink to="/account-settings" class="action-button btn-secondary">
              更改密碼
            </RouterLink>
            <button @click="handleLogout" class="action-button btn-logout">登出</button>
          </div>
        </div>
      </div>
    </aside>

    <!-- 2. 半透明遮罩層，點擊可關閉側邊欄 -->
    <div class="sidebar-overlay" @click="closeSidebar" v-if="isSidebarOpen"></div>

    <!-- 3. 主要內容區 -->
    <main class="content-area">
      <!-- 頂部 Header，包含漢堡按鈕 -->
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

    <!-- ✨ 將 MemoDisplayDialog 放在這裡，使其成為全局可用的組件 ✨ -->
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
import { getFunctions, httpsCallable } from 'firebase/functions'
import ApiManager from '@/services/api_manager.js'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import { where, onSnapshot, collection, query } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

const patientsApi = ApiManager('patients')
const router = useRouter()
const route = useRoute()
const { currentUser, logout, isAdmin } = useAuth()
const { notifications, startListening, stopListening, removeNotification } =
  useRealtimeNotifications()

// --- 響應式佈局狀態 ---
const isSidebarOpen = ref(false)

// --- 備忘錄相關的全域狀態 ---
const allPatients = ref([])
const activeMemos = ref([])
const isMemoDialogVisible = ref(false)
const patientNameForDialog = ref('')
const memosForDialog = ref([])

// --- 全域 Provide/Inject 所需的計算屬性和函式 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () =>
    new Set(
      activeMemos.value
        .filter((memo) => memo.patientId && memo.status === 'pending')
        .map((memo) => memo.patientId),
    ),
)

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  const memoPatientName = activeMemos.value.find((m) => m.patientId === patientId)?.patientName

  if (!patient && !memoPatientName) {
    console.warn(`[MainLayout] Cannot find patient name for ID: ${patientId}`)
    return
  }

  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && memo.status === 'pending',
  )
  patientNameForDialog.value = patient ? patient.name : memoPatientName
  isMemoDialogVisible.value = true
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

// --- 其他輔助函式 ---
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
    removeNotification(notif.id)
  }
}

function handleLogout() {
  logout()
}

// --- 核心業務邏輯 ---
async function loadSharedData() {
  try {
    console.log('🔄 [MainLayout] Loading shared data (patients & memos)...')
    const [patientsData, memosData] = await Promise.all([
      // 只獲取未刪除的病人
      patientsApi.fetchAll([where('isDeleted', '==', false)]),
      memosApi.fetchAll([where('status', '==', 'pending')]),
    ])
    allPatients.value = patientsData
    activeMemos.value = memosData
    console.log(
      `✅ [MainLayout] Shared data loaded: ${patientsData.length} patients, ${memosData.length} memos.`,
    )
  } catch (error) {
    console.error('❌ [MainLayout] Failed to load shared data:', error)
  }
}

const triggerScheduleCheck = async () => {
  if (sessionStorage.getItem('hasCheckedSchedules')) {
    return
  }
  console.log('🚀 [MainLayout] Triggering cloud function ensureFutureSchedules...')
  try {
    const functions = getFunctions()
    const ensureSchedules = httpsCallable(functions, 'ensureFutureSchedules')
    const result = await ensureSchedules()
    console.log('✅ [MainLayout] Cloud function executed successfully:', result.data)
    sessionStorage.setItem('hasCheckedSchedules', 'true')
  } catch (error) {
    console.error('❌ [MainLayout] Calling ensureFutureSchedules failed:', error)
  }
}

// --- 核心業務邏輯：實時監聽備忘錄 ---
let memoUnsubscribe = null // 用於停止備忘錄監聽
let patientUnsubscribe = null // 為病人數據也加上監聽

function startSharedDataListeners() {
  // 監聽備忘錄
  if (memoUnsubscribe) return
  console.log('🔄 [MainLayout] Starting to listen for active memos...')
  const memoQuery = query(collection(db, 'memos'), where('status', '==', 'pending'))
  memoUnsubscribe = onSnapshot(memoQuery, (snapshot) => {
    activeMemos.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    console.log(`✅ [MainLayout] Active memos updated: ${activeMemos.value.length} items.`)
  })

  // 監聽病人（只在需要時更新）
  if (patientUnsubscribe) return
  console.log('🔄 [MainLayout] Starting to listen for patient data...')
  const patientQuery = query(collection(db, 'patients'), where('isDeleted', '==', false))
  patientUnsubscribe = onSnapshot(patientQuery, (snapshot) => {
    allPatients.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    console.log(`✅ [MainLayout] Patient data updated: ${allPatients.value.length} patients.`)
  })
}
function stopSharedDataListeners() {
  if (memoUnsubscribe) {
    console.log('🛑 [MainLayout] Stopping memo listener.')
    memoUnsubscribe()
    memoUnsubscribe = null
  }
  if (patientUnsubscribe) {
    console.log('🛑 [MainLayout] Stopping patient listener.')
    patientUnsubscribe()
    patientUnsubscribe = null
  }
}

// --- 生命週期與監聽器 ---
watch(
  () => currentUser.value,
  (newUser) => {
    if (newUser) {
      console.log('✅ [MainLayout] User logged in, starting services.')
      startSharedDataListeners()
      triggerScheduleCheck()
      startListening()
    } else {
      console.log('🚪 [MainLayout] User logged out, stopping services.')
      activeMemos.value = []
      allPatients.value = []
      stopSharedDataListeners()
      sessionStorage.removeItem('hasCheckedSchedules')
      stopListening()
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
  stopConflictWatching()
  stopSharedDataListeners()
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

/* [修正] 側邊欄寬度縮小 */
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

/* [修正] 減少垂直間距 */
.main-nav-section {
  padding: 15px 0;
  flex-shrink: 0;
}

.footer-section {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
}

/* [修正] 減少標頭 padding */
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
  font-size: 1.4em; /* 微調字體大小以適應較窄的寬度 */
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

/* [修正] 減少導航列表的 padding */
.sidebar-nav {
  list-style: none;
  padding: 8px 0;
  margin: 0;
}

/* [修正] 減少每個連結的 padding，使其更緊湊 */
.nav-link {
  display: flex;
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

.content-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #f4f7f9;
}

/* [修正] 減少主內容區域的 padding */
.content-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  padding: 1.2rem;
}

/* [修正] 減少上邊距 */
.management-section {
  padding-top: 12px;
  border-top: 1px solid #34495e;
  flex-shrink: 0;
}

.section-title {
  font-size: 0.8em;
  font-weight: bold;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 15px; /* 統一側邊距 */
  margin-bottom: 8px; /* 減少下邊距 */
}

.management-section .sidebar-nav {
  padding-top: 0;
}

.management-section .nav-link {
  font-size: 1em;
  padding: 8px 15px; /* 統一側邊距 */
}

/* [修正] 減少 footer 的 padding */
.nav-footer {
  padding: 12px 15px;
  border-top: 1px solid #4a627a;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
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

/* ================================== */
/*         通知區域樣式 (緊湊版)      */
/* ================================== */
.notification-area {
  padding: 8px; /* 減少 padding */
  overflow-y: auto;
  border-top: 1px solid #34495e;
  flex-grow: 1;
  min-height: 0;
}

.notification-area .section-title {
  padding: 0 8px 6px 8px;
  margin: 0;
}

.notification-list {
  display: flex;
  flex-direction: column;
  gap: 6px; /* 減少項目間距 */
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
  padding-left: 24px;
}

.notification-time {
  font-size: 0.8rem;
  opacity: 0.85;
}

.notification-close {
  position: absolute;
  top: 4px;
  right: 4px;
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  opacity: 0.7;
  transition: all 0.2s ease;
}

.notification-close:hover {
  opacity: 1;
  background-color: rgba(0, 0, 0, 0.2);
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

/* ================================== */
/*         響應式樣式               */
/* ================================== */
.sidebar-overlay,
.main-header {
  display: none;
}

@media (max-width: 992px) {
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
    padding: 1rem; /* 統一手機版 padding */
  }
  /* [修正] 手機版側邊欄寬度也縮小 */
  .sidebar {
    width: 260px;
  }
}
</style>
