--- START OF FILE MainLayout.vue (Converted - 2025-07-09 11:33) ---
<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div>
        <div class="sidebar-header">部北透析管理平台</div>
        <ul class="sidebar-nav">
          <li><RouterLink to="/schedule" class="nav-link">每日排程表</RouterLink></li>
          <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
          <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
          <li><RouterLink to="/base-schedule" class="nav-link">常規門診床位</RouterLink></li>
          <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
          <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        </ul>
      </div>

      <div>
        <!-- 【佈局修正 1/3】: 創建新的「後臺管理」區塊 -->
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

        <!-- 【佈局修正 2/3】: 調整用戶操作區塊的 HTML 結構 -->
        <div class="nav-footer">
          <div v-if="currentUser" class="user-info">
            <span>歡迎, {{ currentUser.name }}</span>
            <span class="user-role">({{ currentUser.role }})</span>
          </div>
          <!-- 上下對調，並使用 RouterLink 和 button -->
          <button @click="handleLogout" class="action-button btn-logout">登出</button>
          <RouterLink to="/account-settings" class="action-button btn-secondary">
            更改密碼
          </RouterLink>
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

const router = useRouter()
const { currentUser, logout, isAdmin } = useAuth()

function handleLogout() {
  logout()
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
  padding: 20px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  /* 【佈局修正】: 使用 flexbox 讓區塊上下分開 */
  justify-content: space-between;
  transition: width 0.3s;
}

.sidebar-header {
  padding: 0 20px 20px 20px;
  font-size: 1.5em;
  font-weight: bold;
  border-bottom: 1px solid #34495e;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
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
  padding: 10px 20px;
  font-size: 1.3em;
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
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: auto;
  background-color: #f4f7f9;
}

/* 【佈局修正 3/3】: 新增與調整樣式 */

/* 後臺管理區塊樣式 */
.management-section {
  padding: 20px 0;
  border-top: 1px solid #34495e; /* 與上方分隔 */
}

.section-title {
  font-size: 0.9em;
  font-weight: bold;
  color: #95a5a6; /* 較淺的灰色 */
  text-transform: uppercase;
  letter-spacing: 1px;
  padding: 0 20px;
  margin-bottom: 10px;
}
/* 讓管理區塊的導航連結樣式與主導航一致 */
.management-section .sidebar-nav {
  padding-top: 0;
}
.management-section .nav-link {
  font-size: 1.2em; /* 可以稍微小一點 */
}

/* 用戶資訊與登出按鈕的樣式 */
.nav-footer {
  padding: 20px;
  border-top: 1px solid #4a627a;
  text-align: center;
  display: flex; /* 使用 flexbox 來控制間距 */
  flex-direction: column;
  gap: 10px; /* 加大按鈕間的間距 */
}

.user-info {
  margin-bottom: 15px;
  font-size: 0.9em;
  line-height: 1.4;
}

.user-info span {
  display: block;
}

.user-role {
  color: #bdc3c7;
  font-style: italic;
}

/* 操作按鈕通用樣式 */
.action-button {
  display: block;
  width: 100%;
  text-align: center;
  padding: 0.75rem;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  text-decoration: none;
  font-size: 1em;
  transition: background-color 0.2s;
}

/* 登出按鈕 (紅色) */
.btn-logout {
  background: #e74c3c;
  color: white;
}
.btn-logout:hover {
  background: #c0392b;
}

/* 次要按鈕樣式 (更改密碼) (深灰色) */
.btn-secondary {
  background-color: #4a5568;
  color: white;
}
.btn-secondary:hover {
  background-color: #2d3748;
}
</style>
