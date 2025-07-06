<!-- 檔案路徑: src/layouts/MainLayout.vue (整合樣式後完整版) -->
<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div class="sidebar-header">部北透析管理平台</div>
      <ul class="sidebar-nav">
        <!-- 這裡的 to="/" 應該改為更具體的路徑，例如 to="/schedule" -->
        <li><RouterLink to="/schedule" class="nav-link">每日排程表</RouterLink></li>
        <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
        <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
        <li><RouterLink to="/base-schedule" class="nav-link">常規門診床位</RouterLink></li>
        <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
        <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        <li><router-link to="/reporting" class="nav-link">統計報表</router-link></li>
      </ul>

      <!-- 新增的用戶資訊與登出區塊 -->
      <div class="nav-footer">
        <div v-if="currentUser" class="user-info">
          <span>歡迎, {{ currentUser.name }}</span>
          <span class="user-role">({{ currentUser.role }})</span>
        </div>
        <button @click="handleLogout" class="logout-btn">登出</button>
      </div>
    </aside>
    <main class="content-area">
      <RouterView />
    </main>
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
import { useAuth, logout } from '@/composables/useAuth.js'

const { currentUser } = useAuth()

function handleLogout() {
  if (confirm('確定要登出嗎？')) {
    logout()
  }
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
</style>
