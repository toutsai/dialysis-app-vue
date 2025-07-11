<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div>
        <div class="sidebar-header">
          <!-- 【修正點 1/3】: 讓 header 變成 flex 容器，方便對齊 -->
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
          <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
          <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
        </ul>
      </div>

      <div>
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

        <div class="nav-footer">
          <div v-if="currentUser" class="user-info">
            <span>歡迎, {{ currentUser.name }}</span>
          </div>
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
import { computed } from 'vue' // 【修正點 2/3】: 引入 computed

const router = useRouter()
const { currentUser, logout, isAdmin } = useAuth()

// 【新增】建立一個計算屬性來決定環境標籤的文字和樣式
const environmentTag = computed(() => {
  // import.meta.env.MODE 的值會是 'development' 或 'production'
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
  return null // 其他模式不顯示
})

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
  justify-content: space-between;
  transition: width 0.3s;
}

.sidebar-header {
  padding: 0 20px 20px 20px;
  border-bottom: 1px solid #34495e;
  white-space: nowrap;
  /* 【修正點 3/3】: 修改 header 樣式以支援兩行對齊 */
  display: flex;
  flex-direction: column; /* 垂直排列 */
  align-items: center; /* 水平置中 */
  gap: 4px; /* 標題和標籤之間的間距 */
}

.platform-title {
  font-size: 1.5em;
  font-weight: bold;
}

/* 【新增】環境標籤的樣式 */
.environment-tag {
  align-self: flex-end; /* 靠右對齊 */
  font-size: 0.7rem;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 4px;
  opacity: 0.9;
}
.env-tag-dev {
  background-color: #ffc107; /* 黃色 */
  color: #333;
}
.env-tag-prod {
  background-color: #28a745; /* 綠色 */
  color: white;
}
/* ======================== */

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

.management-section {
  padding: 20px 0;
  border-top: 1px solid #34495e;
}

.section-title {
  font-size: 0.9em;
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
  font-size: 1.2em;
}

.nav-footer {
  padding: 20px;
  border-top: 1px solid #4a627a;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.user-info {
  margin-bottom: 15px;
  font-size: 1.1em;
  line-height: 1.4;
}

.user-info span {
  display: block;
}

.user-role {
  color: #bdc3c7;
  font-style: italic;
}

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
</style>
