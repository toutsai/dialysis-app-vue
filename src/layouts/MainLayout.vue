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
          <li><RouterLink to="/base-schedule" class="nav-link">常規門診床位</RouterLink></li>
          <li><RouterLink to="/patients" class="nav-link">病人管理</RouterLink></li>
          <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        </ul>
      </div>

      <!-- 底部功能區塊 (包含通知、管理、登出) -->
      <div class="footer-section">
        <!-- 【更新】通知區域 - 配合改良版通知結構 -->
        <div class="notification-area">
          <h3 v-if="notifications.length > 0" class="section-title">即時動態</h3>
          <transition-group name="notification-list" tag="div" class="notification-list">
            <div
              v-for="notif in notifications"
              :key="notif.id"
              class="notification-card"
              :class="`notification-${notif.type}`"
            >
              <div class="notification-header">
                <span class="notification-icon">{{ notif.config.icon }}</span>
                <span class="notification-type-text">{{ getTypeText(notif.type) }}</span>
                <button class="notification-close" @click="removeNotification(notif.id)">×</button>
              </div>
              <div class="notification-body">
                <p class="notification-message">{{ notif.message }}</p>
                <span class="notification-time">{{ notif.time }}</span>
              </div>
            </div>
          </transition-group>
        </div>

        <div class="management-section">
          <h3 class="section-title">後臺管理</h3>
          <ul class="sidebar-nav">
            <li><router-link to="/reporting" class="nav-link">統計報表</router-link></li>
            <li>
              <router-link v-if="isAdmin" to="/user-management" class="nav-link"
                >使用者管理</router-link
              >
            </li>
          </ul>
        </div>

        <!-- 【修改】將登出與修改密碼按鈕放入 button-group 中 -->
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

const router = useRouter()
const { currentUser, logout, isAdmin } = useAuth()
const { notifications, removeNotification } = useNotification()

const environmentTag = computed(() => {
  if (import.meta.env.MODE === 'development') {
    return {
      text: '(開發版)',
      class: 'env-tag-dev',
    }
  } else if (import.meta.env.MODE === 'production') {
    return {
      text: '(正式版)',
      class: 'env-tag-prod',
    }
  }
  return null
})

function handleLogout() {
  logout()
}

// 【更新】取得通知類型文字 - 配合改良版通知
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
</script>

<style scoped>
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
  gap: 10px; /* 調整使用者名稱與按鈕群組的間距 */
}

.user-info {
  margin-bottom: 0; /* 因 nav-footer已有 gap，移除此處的 margin */
  font-size: 1em;
  line-height: 1.4;
}

.user-info span {
  display: block;
}

/* 【新增】按鈕群組樣式 */
.button-group {
  display: flex;
  gap: 8px; /* 設定按鈕間的距離 */
}

/* 【修改】操作按鈕樣式 */
.action-button {
  flex: 1; /* 讓兩個按鈕平分寬度 */
  text-align: center;
  padding: 0.5rem; /* 稍微縮小內邊距 */
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  text-decoration: none;
  font-size: 0.85em; /* 稍微縮小字體 */
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

/* ============================================ */
/* 【更新】通知區域樣式 - 配合改良版通知結構 */
/* ============================================ */
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

/* 【新增】通知卡片樣式 */
.notification-card {
  border-radius: 8px;
  padding: 0;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  border-left: 4px solid;
  background-color: #ffffff;
  color: #1a202c;
}

/* 通知類型顏色 - 配合改良版配置 */
.notification-schedule {
  border-left-color: #3498db; /* 藍色 */
}
.notification-patient {
  border-left-color: #f39c12; /* 橙色 */
}
.notification-team {
  border-left-color: #27ae60; /* 綠色 */
}
.notification-memo {
  border-left-color: #9b59b6; /* 紫色 */
}

.notification-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px 12px;
  background-color: rgba(0, 0, 0, 0.02);
}

.notification-icon {
  font-size: 1.2em;
  flex-shrink: 0;
}

.notification-type-text {
  font-size: 0.75em;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex-grow: 1;
}

.notification-close {
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 1.4em;
  cursor: pointer;
  padding: 0;
  line-height: 1;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}
.notification-close:hover {
  color: #6b7280;
  background-color: rgba(0, 0, 0, 0.05);
}

.notification-body {
  padding: 4px 12px 8px 12px;
}

.notification-message {
  margin: 0 0 4px 0;
  font-size: 0.9em;
  font-weight: 500;
  line-height: 1.3;
  color: #374151;
}

.notification-time {
  font-size: 0.7em;
  color: #9ca3af;
  font-weight: 400;
}

/* 動畫效果 */
.notification-list-enter-active,
.notification-list-leave-active {
  transition: all 0.4s ease;
}
.notification-list-enter-from,
.notification-list-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
.notification-list-move {
  transition: transform 0.3s ease;
}
</style>
