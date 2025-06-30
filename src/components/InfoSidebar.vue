<!-- 檔案路徑: src/components/InfoSidebar.vue -->
<template>
  <aside class="info-sidebar">
    <header class="sidebar-header" v-if="$slots.header">
      <slot name="header"></slot>
    </header>
    <main class="sidebar-content">
      <slot></slot>
    </main>
  </aside>
</template>

<script setup>
// 不需要 script 邏輯
</script>

<style scoped>
.info-sidebar {
  width: 260px;
  flex-shrink: 0;
  background-color: #f8f9fa;
  border-right: 1px solid #dee2e6;
  display: flex;
  flex-direction: column;
  height: 100vh; /* 讓它和視窗一樣高 */
}
.sidebar-header {
  padding: 16px;
  font-size: 1.1rem;
  font-weight: 600;
  color: #343a40;
  border-bottom: 1px solid #ced4da;
  flex-shrink: 0;
}
.sidebar-content {
  padding: 16px;
  flex-grow: 1;
  overflow-y: auto;
  font-size: 0.9rem;
}
</style>
