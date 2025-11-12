<!-- 檔案路徑: src/views/MyPatientsView.vue -->
<template>
  <div class="my-patients-container">
    <h1 class="page-title">我的今日病人</h1>
    <div class="page-content">
      <!-- 這裡是我們稍後要放置病人列表表格的地方 -->
      <p>資料載入中...</p>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'

onMounted(() => {
  // 稍後我們會在這裡呼叫 composable 來抓取資料
  console.log('"我的今日病人" 頁面已成功載入！')
})
</script>

<style scoped>
.my-patients-container {
  padding: 1.5rem;
  background-color: #f8f9fa;
  height: 100%;
}

.page-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 1.5rem;
}

.page-content {
  background-color: #ffffff;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
}
</style>
