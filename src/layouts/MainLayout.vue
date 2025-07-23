<!-- 檔案路徑: src/layouts/MainLayout.vue (移除 v-if 版本) -->
<template>
  <div class="dashboard-container">
    <aside class="sidebar">
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
          <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
          <li><RouterLink to="/base-schedule" class="nav-link">門住總床位表</RouterLink></li>

          <!-- ✨ --- 權限修改 --- ✨ -->
          <li>
            <!-- 移除 v-if，讓所有登入者都看得到 -->
            <RouterLink to="/exception-manager" class="nav-link"> 排程例外管理 </RouterLink>
          </li>

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
              :class="`notification-type-${notif.type}`"
            >
              <div class="notification-content">
                <span class="notification-icon">{{ notif.config.icon }}</span>
                <p class="notification-message">{{ notif.message }}</p>
              </div>
              <div class="notification-footer-item">
                <span class="notification-time">{{ notif.time }}</span>
                <button class="notification-close" @click="removeNotification(notif.id)">×</button>
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

    <main class="content-area">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import { computed } from 'vue'
import { useNotification } from '@/composables/useNotification.js'
import { watch } from 'vue'
import { getFunctions, httpsCallable } from 'firebase/functions'

const router = useRouter()
// ✨ userRole 和 isEditorOrAdmin 已不再需要，可以移除
const { currentUser, logout, isAdmin } = useAuth()
const { notifications, removeNotification } = useNotification()

const environmentTag = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return { text: '(開發版)', class: 'env-tag-dev' }
  } else if (import.meta.env.MODE === 'production') {
    return { text: '(正式版)', class: 'env-tag-prod' }
  }
  return null
})

function handleLogout() {
  logout()
}

// ... 省略 getTypeText 和 triggerScheduleCheck 邏輯，保持不變 ...
const getTypeText = (type) => {
  switch (type) {
    case 'patient':
      return '病人'
    case 'schedule':
      return '排程'
    case 'team':
      return '分組'
    case 'memo':
      return '備忘'
    default:
      return '系統'
  }
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
      triggerScheduleCheck()
    } else {
      console.log('🚪 [MainLayout] 使用者已登出，清除排程檢查標記。')
      sessionStorage.removeItem('hasCheckedSchedules')
    }
  },
  { immediate: true },
)
</script>

<style scoped>
/* 您的 CSS 樣式保持不變 */
.dashboard-container {
  display: flex;
  height: 100vh;
}

.sidebar {
  width: 220px;
  background-color: #2c3e50;
  color: white;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.main-nav-section {
  padding: 20px 0;
}

.footer-section {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-height: 0;
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
  padding: 20px 0;
  margin: 0;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #ecf0f1;
  text-decoration: none;
  padding: 8px 20px;
  font-size: 1.2em;
  transition:
    background-color 0.2s,
    padding-left 0.2s;
  white-space: nowrap;
}

.nav-link:hover {
  background-color: #34495e;
}

.nav-link.router-link-exact-active {
  background-color: var(--primary-color, #1abc9c);
  color: white;
  font-weight: bold;
  padding-left: 25px;
}

.content-area {
  flex-grow: 1;
  overflow: auto;
  background-color: #f4f7f9;
}

.management-section {
  padding-top: 15px;
  border-top: 1px solid #34495e;
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
  font-size: 1.1em;
  padding: 8px 20px;
}

.nav-footer {
  padding: 15px 20px;
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

/* 通知區域樣式 */
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
  color: #333;
  font-weight: 500;
}

.notification-footer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.notification-time {
  font-size: 12px;
  color: #666;
  font-weight: 400;
}

.notification-close {
  background: none;
  border: none;
  font-size: 18px;
  color: #999;
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
  color: #666;
  background-color: rgba(0, 0, 0, 0.1);
}

.notification-type-schedule {
  border-left-color: #3498db;
  background: linear-gradient(135deg, #e3f2fd 0%, #f8fbff 100%);
}

.notification-type-team {
  border-left-color: #27ae60;
  background: linear-gradient(135deg, #e8f5e8 0%, #f8fff8 100%);
}

.notification-type-patient {
  border-left-color: #f39c12;
  background: linear-gradient(135deg, #fef3e2 0%, #fffaf5 100%);
}

.notification-type-memo {
  border-left-color: #9b59b6;
  background: linear-gradient(135deg, #f3e8ff 0%, #faf8ff 100%);
}

/* 動畫效果 */
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
</style>
