<!-- 檔案路徑: src/App.vue -->
<script setup>
import { RouterLink, RouterView } from 'vue-router'
import '@/assets/main.css'

// 為了初始化排程而新增的程式碼
import { onMounted } from 'vue'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import { createEmptyScheduleDocument } from '@/utils/scheduleUtils.js'

// 輔助函式，如果 App.vue 中沒有，可以從 ScheduleView.vue 複製過來或提取成公共函式
function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 在 onMounted 鉤子中呼叫初始化函式
onMounted(() => {
  // 使用 setTimeout 是為了避免阻塞首屏渲染，讓初始化在後台執行
  setTimeout(() => {
    initializeSchedules()
  }, 1000) // 延遲1秒執行
})

async function initializeSchedules() {
  console.log('正在檢查並初始化排程...')
  const schedulesApi = ApiManager('schedules')
  const today = new Date()
  const datesToCheck = []

  // 產生需要檢查的日期範圍 (例如，從今天往前14天，到未來14天)
  // 您可以根據需求調整這個範圍
  for (let i = -14; i < 14; i++) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() + i)
    datesToCheck.push(formatDate(targetDate))
  }

  try {
    // 1. 一次性查詢所有已存在的排程
    const existingRecords = await schedulesApi.fetchAll([where('date', 'in', datesToCheck)])
    const existingDates = new Set(existingRecords.map((rec) => rec.date))

    // 2. 找出需要創建的日期
    const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

    if (datesToCreate.length === 0) {
      console.log('所有必要的排程均已存在，無需初始化。')
      return
    }

    console.log(`發現 ${datesToCreate.length} 個缺失的排程，正在創建...`, datesToCreate)

    // 3. 為所有缺失的日期批量創建空白文件
    const createPromises = datesToCreate.map((dateStr) => {
      const emptyDoc = createEmptyScheduleDocument(dateStr)
      return schedulesApi.save(emptyDoc)
    })

    await Promise.all(createPromises)
    console.log('空白排程創建完畢！')
  } catch (error) {
    console.error('排程初始化失敗:', error)
  }
}
</script>

<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div class="sidebar-header">部北透析管理平台</div>
      <ul class="sidebar-nav">
        <!-- RouterLink 是 Vue 中用來替代 <a> 標籤進行頁面導航的元件 -->
        <!-- `to` 屬性對應我們將在下一步設定的路由路徑 -->
        <li><RouterLink to="/" class="nav-link">每日排程表</RouterLink></li>
        <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
        <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
        <li><RouterLink to="/base-schedule" class="nav-link">常規門診床位</RouterLink></li>
        <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
        <li><RouterLink to="/memo" class="nav-link">交班備忘錄</RouterLink></li>
      </ul>
    </aside>
    <main class="content-area">
      <!--
        RouterView 是一個神奇的佔位符。
        Vue Router 會根據當前的 URL，自動將對應的頁面元件渲染到這裡。
        這就完美地取代了 <iframe> 的功能！
      -->
      <RouterView />
    </main>
  </div>
</template>

<style>
* {
  box-sizing: border-box;
}
html,
body {
  margin: 0; /* 確保 margin 為 0 */
  padding: 0; /* 確保 padding 為 0 */
  height: 100%;
  font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
  overflow: hidden;
}
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
  display: flex; /* 1. 將此元素變為 Flex 容器 */
  align-items: center; /* 2. 讓內容垂直居中 (如果需要的話) */
  justify-content: center; /* 3. 讓內容水平居中 */
}
.sidebar-nav {
  list-style: none;
  padding: 20px 0;
  margin: 0;
  flex-grow: 1;
}
.sidebar-nav li a {
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
.sidebar-nav li a:hover {
  background-color: #34495e;
}
.sidebar-nav li a.active {
  background-color: #1abc9c;
  color: white;
  font-weight: bold;
  padding-left: 25px;
}
.content-area {
  flex-grow: 1;
  display: flex; /* 確保它是 Flex 容器 */
  flex-direction: column; /* 讓子元素垂直排列 */
  align-items: stretch;
}
.content-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
