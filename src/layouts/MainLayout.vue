--- START OF FILE MainLayout.vue (Converted - 2025-07-09 11:33) ---

<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div class="sidebar-header">部北透析管理平台</div>
      <ul class="sidebar-nav">
        <!-- 每日排程表 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/schedule" class="nav-link">每日排程表</RouterLink></li>
        <!-- 護理分組檢視 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
        <!-- 週排班總表 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
        <!-- 常規門診床位 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/base-schedule" class="nav-link">常規門診床位</RouterLink></li>
        <!-- 病人管理系統 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
        <!-- 交班備忘錄 - 所有登入用戶皆可見 -->
        <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        <!-- 統計報表 - 所有登入用戶皆可見 -->
        <li><router-link to="/reporting" class="nav-link">統計報表</router-link></li>
        <!-- 使用者管理 - 僅限 Admin 可見 -->
        <li>
          <router-link v-if="isAdmin" to="/user-management" class="nav-link"
            >使用者管理</router-link
          >
        </li>
      </ul>

      <!-- 新增的用戶資訊與登出區塊 -->
      <div class="nav-footer">
        <div v-if="currentUser" class="user-info">
          <span>歡迎, {{ currentUser.name }}</span>
          <span class="user-role">({{ currentUser.role }})</span>
        </div>
        <!-- 新增的帳號設定連結 - 所有登入用戶皆可見 -->
        <RouterLink to="/account-settings" class="action-button btn-secondary">
          更改密碼
        </RouterLink>
        <button @click="handleLogout" class="logout-btn">登出</button>
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
// 【修正】: 從 useAuth() 中同時解構出 isAdmin (已存在於您的程式碼中)
const { currentUser, logout, isAdmin } = useAuth()

function handleLogout() {
  logout()
  // logout 函式現在會自動跳轉，這裡的 push 其實可以移除，但保留也無妨
  // router.push('/login')
}
</script>

<style scoped>
/* 將您 App.vue 的樣式複製到這裡，並改為 scoped */
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
  flex-grow: 1;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 15px;
  color: #ecf0f1;
  text-decoration: none;
  padding: 10px 20px;
  font-size: 1.3em; /* 調整了字體大小以匹配您的原始碼 */
  transition:
    background-color 0.2s,
    padding-left 0.2s;
  white-space: nowrap;
}

.nav-link:hover {
  background-color: #34495e;
}

/* vue-router v4 的 active class 預設是 router-link-exact-active */
.nav-link.router-link-exact-active {
  background-color: var(--primary-color, #1abc9c); /* 使用全域變數或備用顏色 */
  color: white;
  font-weight: bold;
  padding-left: 25px;
}

.content-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: auto; /* 讓內容區域在內容過多時可以滾動 */
  background-color: #f4f7f9; /* 為內容區加個淺色背景 */
}

/* 用戶資訊與登出按鈕的樣式 */
.nav-footer {
  margin-top: auto; /* 將此區塊推到側邊欄底部 */
  padding: 20px;
  border-top: 1px solid #4a627a;
  text-align: center;
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

.logout-btn {
  width: 100%;
  padding: 8px 15px;
  font-size: 1em;
  background: #e74c3c;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.logout-btn:hover {
  background: #c0392b;
}

/* 【新增】為新的區塊和連結添加樣式 (從您原始提供程式碼中包含的，保持不變) */
.user-info-section {
  margin-top: auto; /* 將此區塊推到底部 */
  padding-top: 1rem;
  border-top: 1px solid #4a5568; /* 分隔線 */
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem; /* 增加間距 */
  padding: 1rem;
}

.user-details {
  text-align: center;
  color: #a0aec0;
}

.welcome-text {
  margin: 0;
  font-weight: bold;
}

.role-text {
  margin: 0;
  font-size: 0.9em;
}

/* 【核心修改】: 為操作按鈕定義通用樣式 (從您原始提供程式碼中包含的，保持不變) */
.action-button {
  display: block; /* 讓 RouterLink 表現得像 button */
  width: 100%;
  text-align: center;
  padding: 0.75rem;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  text-decoration: none; /* 移除 RouterLink 的下劃線 */
  transition: background-color 0.2s;
}

/* 次要按鈕樣式 (更改密碼) (從您原始提供程式碼中包含的，保持不變) */
.btn-secondary {
  background-color: #4a5568; /* 深灰色 */
  color: white;
}
.btn-secondary:hover {
  background-color: #2d3748; /* 更深的灰色 */
}

/* 主要危險操作按鈕樣式 (登出) (從您原始提供程式碼中包含的，保持不變) */
.btn-logout {
  background-color: #e53e3e;
  color: white;
}
.btn-logout:hover {
  background-color: #c53030;
}
</style>
---

END OF FILE MainLayout.vue (Converted - 2025-07-09 11:33) ---
