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
// App.vue 的 script 現在非常乾淨。
// 我們不需要在這裡引入 onMounted 或任何資料庫相關的邏輯，
// 因為這些操作都應該在受路由守衛保護的頁面 (如 MainLayout.vue)
// 或後端 (Cloud Functions) 中進行。
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
