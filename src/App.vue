<!-- 檔案路徑: src/App.vue (最終的、清理乾淨的版本) -->
<template>
  <!--
    App.vue 現在只包含一個頂級的 router-view。
    它會根據路由設定，決定在此處渲染 LoginView 或 MainLayout。
    所有需要登入才能執行的初始化邏輯，都已轉移到後端 Cloud Functions 中，
    確保應用程式啟動時不會因權限問題而出錯。
  -->
  <router-view />
</template>

<script setup>
function detectAdBlocker() {
  // 簡單的廣告攔截器檢測
  const testAd = document.createElement('div')
  testAd.innerHTML = '&nbsp;'
  testAd.className = 'adsbox'
  document.body.appendChild(testAd)

  window.setTimeout(() => {
    if (testAd.offsetHeight === 0) {
      // 可能有廣告攔截器
      console.warn('偵測到廣告攔截器，可能影響系統功能')
    }
    testAd.remove()
  }, 100)
}

// 在主要的異步操作中添加友善的錯誤處理
try {
  // Firebase 操作
} catch (error) {
  if (error.message.includes('message channel closed')) {
    console.warn('連接被中斷，可能是廣告攔截器影響')
    // 顯示友善的提示給用戶
  }
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
