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
          <li><RouterLink to="/exception-manager" class="nav-link">排程例外管理</RouterLink></li>
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
              :class="[`notification-type-${notif.type}`, { 'is-clickable': !!notif.action }]"
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

    <!-- 2. 半透明遮罩層，點擊可關閉側邊欄 (新增的元素) -->
    <div class="sidebar-overlay" @click="closeSidebar" v-if="isSidebarOpen"></div>

    <!-- 3. 主要內容區 -->
    <main class="content-area">
      <!-- 頂部 Header，包含漢堡按鈕 (新增的元素) -->
      <header class="main-header">
        <button class="sidebar-toggle" @click="toggleSidebar">
          <span></span>
          <span></span>
          <span></span>
        </button>
        <!-- 您可以在這裡放目前頁面的標題 -->
        <h2 class="current-page-title">{{ route.meta.title || '透析管理' }}</h2>
      </header>
      <div class="content-wrapper">
        <RouterView />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import { useConflictWatcher } from '@/composables/useConflictWatcher.js'
import { getFunctions, httpsCallable } from 'firebase/functions'

const router = useRouter()
const route = useRoute() // 取得當前路由資訊
const { currentUser, logout, isAdmin } = useAuth()
const { notifications, startListening, stopListening, removeNotification } =
  useRealtimeNotifications()
const { startWatching } = useConflictWatcher()

// ‼️ 新增: 控制側邊欄開關的狀態
const isSidebarOpen = ref(false)

const environmentTag = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return { text: '(開發版)', class: 'env-tag-dev' }
  } else if (import.meta.env.MODE === 'production') {
    return { text: '(正式版)', class: 'env-tag-prod' }
  }
  return null
})

// ‼️ 新增: 開關側邊欄的函式
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

const triggerScheduleCheck = async () => {
  if (sessionStorage.getItem('hasCheckedSchedules')) {
    console.log('🗓️ [MainLayout] 本次登入階段已檢查過排程，跳過。')
    return
  }
  console.log('🚀 [MainLayout] 準備觸發雲端函式 ensureFutureSchedules...')
  try {
    const functions = getFunctions()
    const ensureSchedules = httpsCallable(functions, 'ensureFutureSchedules')
    const result = await ensureSchedules()
    console.log('✅ [MainLayout] 雲端函式 ensureFutureSchedules 執行成功:', result.data)
    sessionStorage.setItem('hasCheckedSchedules', 'true')
  } catch (error) {
    console.error('❌ [MainLayout] 呼叫 ensureFutureSchedules 失敗:', error)
  }
}

watch(
  () => currentUser.value,
  (newUser) => {
    if (newUser) {
      console.log('🟢 [MainLayout] User logged in. Starting services...')
      triggerScheduleCheck()
      startWatching()
      startListening()
    } else {
      console.log('🚪 [MainLayout] User logged out. Stopping services...')
      sessionStorage.removeItem('hasCheckedSchedules')
      stopListening()
    }
  },
  { immediate: true },
)

// ‼️ 新增: 監聽路由變化，在行動裝置上自動關閉側邊欄
watch(
  () => route.path,
  () => {
    if (window.innerWidth <= 992) {
      // 只在行動裝置寬度下作用
      closeSidebar()
    }
  },
)
</script>

<style scoped>
/* ================================== */
/*         原有樣式 (稍作調整)         */
/* ================================== */
.dashboard-container {
  display: flex;
  height: 100vh;
  overflow: hidden; /* 防止主容器滾動 */
}
.sidebar {
  width: 240px; /* 增加寬度以容納通知 */
  background-color: #2c3e50;
  color: white;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
  transition: width 0.3s ease; /* 為桌面版添加過渡效果 */
}
.main-nav-section {
  padding: 20px 0;
  flex-shrink: 0; /* 防止此區塊被壓縮 */
}
.footer-section {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0; /* 讓 overflow-y 生效的關鍵 */
}
.sidebar-header {
  padding: 0 20px 20px 20px;
  border-bottom: 1px solid #34495e;
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.platform-title {
  font-size: 1.5em;
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
  padding: 10px 0; /* 縮小一點 padding */
  margin: 0;
}
.nav-link {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #ecf0f1;
  text-decoration: none;
  padding: 12px 20px; /* 增加上下 padding */
  font-size: 1.1em; /* 縮小一點字體 */
  transition:
    background-color 0.2s,
    padding-left 0.2s;
  white-space: nowrap;
  border-radius: 0 25px 25px 0; /* 添加圓角效果 */
  margin-right: 10px; /* 給右邊一點空間 */
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
  display: flex; /* 改為 flex 以便控制 header 和 wrapper */
  flex-direction: column;
  overflow: hidden; /* 確保 content-area 本身不滾動 */
  background-color: #f4f7f9;
}

/* ‼️ 新增: 內容包裝器，真正滾動的區域 */
.content-wrapper {
  flex-grow: 1;
  overflow-y: auto; /* 只有這個區域可以垂直滾動 */
  padding: 1.5rem;
}

.management-section {
  padding-top: 15px;
  border-top: 1px solid #34495e;
  flex-shrink: 0;
}
.section-title {
  font-size: 0.8em;
  font-weight: bold;
  color: #95a5a6;
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 20px;
  margin-bottom: 10px;
}
.management-section .sidebar-nav {
  padding-top: 0;
}
.management-section .nav-link {
  font-size: 1em;
  padding: 8px 20px;
}
.nav-footer {
  padding: 15px 20px;
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
.notification-area {
  padding: 10px;
  overflow-y: auto;
  border-top: 1px solid #34495e;
  flex-grow: 1;
  min-height: 0;
}
.notification-area .section-title {
  padding: 0 10px 8px 10px;
  margin: 0;
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
.notification-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.notification-item {
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-left: 4px solid transparent;
  transition: all 0.3s ease;
}
.notification-item.is-clickable {
  cursor: pointer;
}
.notification-item.is-clickable:hover {
  background-color: #34495e;
}
.notification-content {
  display: flex;
  align-items: flex-start;
  margin-bottom: 8px;
}
.notification-icon {
  font-size: 16px;
  margin-right: 8px;
  flex-shrink: 0;
}
.notification-message {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  color: #ecf0f1;
  font-weight: 500;
}
.notification-footer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.notification-time {
  font-size: 12px;
  color: #bdc3c7;
  font-weight: 400;
}
.notification-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #95a5a6;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}
.notification-close:hover {
  color: #ecf0f1;
  background-color: rgba(0, 0, 0, 0.2);
}
.notification-type-schedule {
  border-left-color: #3498db;
  background: rgba(52, 152, 219, 0.1);
}
.notification-type-team {
  border-left-color: #27ae60;
  background: rgba(39, 174, 96, 0.1);
}
.notification-type-patient {
  border-left-color: #f39c12;
  background: rgba(243, 156, 18, 0.1);
}
.notification-type-memo {
  border-left-color: #9b59b6;
  background: rgba(155, 89, 182, 0.1);
}
.notification-type-conflict {
  border-left-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
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

/* ================================== */
/* ‼️        新增的響應式樣式        ‼️ */
/* ================================== */

/* 預設不顯示漢堡按鈕、遮罩、和頂部 Header */
.sidebar-overlay,
.main-header {
  display: none;
}

/* 當螢幕寬度小於 992px 時 (適用於平板和手機) */
@media (max-width: 992px) {
  /* 1. 側邊欄改為固定定位，並移出畫面外 */
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

  /* 2. 當 is-open class 存在時，將側邊欄滑入畫面 */
  .sidebar.is-open {
    transform: translateX(0);
  }

  /* 3. 主要內容區現在佔滿整個寬度 */
  .content-area {
    width: 100%;
  }

  /* 4. 顯示並設計頂部 Header */
  .main-header {
    display: flex;
    align-items: center;
    padding: 0 1rem;
    height: 60px; /* 固定高度 */
    background-color: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    flex-shrink: 0; /* 防止被壓縮 */
    z-index: 900;
  }

  /* 5. 設計漢堡按鈕 */
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

  /* 6. 當側邊欄打開時，漢堡按鈕變為 "X" */
  .sidebar-open .sidebar-toggle span:nth-child(1) {
    transform: translateY(8px) rotate(45deg);
  }
  .sidebar-open .sidebar-toggle span:nth-child(2) {
    opacity: 0;
  }
  .sidebar-open .sidebar-toggle span:nth-child(3) {
    transform: translateY(-8px) rotate(-45deg);
  }

  /* 7. 當側邊欄打開時，顯示半透明遮罩 */
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

  /* 8. 顯示目前頁面標題 */
  .current-page-title {
    margin-left: 1rem;
    font-size: 1.2rem;
    font-weight: 600;
    color: #333;
  }

  /* 9. 調整 content wrapper 的 padding */
  .content-wrapper {
    padding: 1rem;
  }
}

/* 針對更小的手機螢幕微調 */
@media (max-width: 768px) {
  .content-wrapper {
    padding: 0.75rem;
  }
  .sidebar {
    width: 280px; /* 在手機上可以讓側邊欄寬一點 */
  }
}
</style>
