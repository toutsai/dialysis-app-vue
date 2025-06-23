<!-- 檔案路徑: src/App.vue -->
<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="dashboard-container">
    <aside class="sidebar">
      <div class="sidebar-header">管理平台</div>
      <ul class="sidebar-nav">
        <!-- RouterLink 是 Vue 中用來替代 <a> 標籤進行頁面導航的元件 -->
        <!-- `to` 屬性對應我們將在下一步設定的路由路徑 -->
        <li><RouterLink to="/" class="nav-link">每日排程表</RouterLink></li>
        <li><RouterLink to="/stats" class="nav-link">護理分組檢視</RouterLink></li>
        <li><RouterLink to="/patients" class="nav-link">病人管理系統</RouterLink></li>
        <li><RouterLink to="/weekly" class="nav-link">週排班總表</RouterLink></li>
        <li><RouterLink to="/base-schedule" class="nav-link">常規門診設定</RouterLink></li>
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
  text-align: center;
  border-bottom: 1px solid #34495e;
  white-space: nowrap;
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
  padding: 15px 20px;
  font-size: 1.1em;
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
  overflow: hidden;
}
.content-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
