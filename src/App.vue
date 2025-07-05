<!-- 檔案路徑: src/App.vue (整合後完整版) -->
<template>
  <!-- App.vue 現在只包含一個頂級的 router-view。
       它會根據路由設定，決定在此處渲染 LoginView 或 MainLayout。 -->
  <router-view />
</template>

<script setup>
import { onMounted } from 'vue'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import { createEmptyScheduleDocument } from '@/utils/scheduleUtils.js'

// 我們將初始化邏輯保留在頂層的 App.vue 中，確保它只在應用程式加載時執行一次。
// 這個邏輯與 UI 顯示無關，因此非常適合放在這裡。
onMounted(() => {
  // 為了不影響用戶體驗，我們可以在後台延遲執行這個初始化任務。
  setTimeout(() => {
    initializeSchedules()
  }, 2000) // 延遲 2 秒執行
})

/**
 * 檢查未來一段時間內的排程文件是否存在，如果不存在則自動創建空白文件。
 * 這能確保用戶在切換到未來日期時，總是有一個可以寫入的 Firestore 文件。
 */
async function initializeSchedules() {
  console.log('正在檢查並初始化排程文件...')
  const schedulesApi = ApiManager('schedules')
  const today = new Date()
  const datesToCheck = []

  // 產生一個合理的日期範圍，例如未來30天。
  // 我們只關心未來的排程，不需要檢查過去的。
  for (let i = 0; i < 30; i++) {
    const targetDate = new Date()
    targetDate.setDate(today.getDate() + i)
    datesToCheck.push(formatDateForQuery(targetDate))
  }

  try {
    // 1. 一次性查詢所有已存在的排程文件
    const existingRecords = await schedulesApi.fetchAll([where('date', 'in', datesToCheck)])
    const existingDates = new Set(existingRecords.map((rec) => rec.date))

    // 2. 找出需要創建的日期
    const datesToCreate = datesToCheck.filter((dateStr) => !existingDates.has(dateStr))

    if (datesToCreate.length === 0) {
      console.log('所有必要的未來排程均已存在，無需初始化。')
      return
    }

    console.log(`發現 ${datesToCreate.length} 個缺失的排程文件，正在創建...`, datesToCreate)

    // 3. 為所有缺失的日期批量創建空白文件
    // 假設 ApiManager 的 save 方法在未提供 ID 時會自動生成 ID，
    // 且保存的物件中包含了 date 欄位。
    const createPromises = datesToCreate.map((dateStr) => {
      const emptyDoc = createEmptyScheduleDocument(dateStr)
      return schedulesApi.save(emptyDoc)
    })

    await Promise.all(createPromises)
    console.log('空白排程文件創建完畢！')
  } catch (error) {
    console.error('排程初始化失敗:', error)
  }
}

/**
 * 格式化日期為 'YYYY-MM-DD' 字串，用於 Firestore 查詢。
 * @param {Date} date - 日期物件
 * @returns {string}
 */
function formatDateForQuery(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
</script>

<style>
/*
  這裡的 <style> 標籤沒有 "scoped" 屬性，
  因此它定義的樣式將會是全局性的，應用到整個應用程式。
  這是放置基礎樣式、CSS 變數和重置樣式的最佳位置。
*/

/* CSS 基礎重置 */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100%;
  font-family: 'Segoe UI', 'Microsoft JhengHei', 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  overflow: hidden; /* 防止 body 自身出現滾動條 */
}

/* 全局 CSS 變數，方便統一管理顏色 */
:root {
  --primary-color: #1abc9c;
  --primary-color-dark: #16a085;
  --secondary-color: #2c3e50;
  --success-color: #28a745;
  --info-color: #17a2b8;
  --warning-color: #ffc107;
  --danger-color: #dc3545;
  --light-gray: #f8f9fa;

  /* 應用程式中各種狀態的背景色 */
  --green-bg: #e8f5e9;
  --red-bg: #ffebee;
  --blue-bg: #e3f2fd;
  --orange-bg: #fff3e0;
  --grey-bg: #f5f5f5;
  --grey-text: #6c757d;
  --hepatitis-bg: #fffde7;
}

/* 一些通用的頁面佈局 class */
.page-container {
  padding: 24px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-title {
  font-size: 2rem;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #343a40;
}
</style>
