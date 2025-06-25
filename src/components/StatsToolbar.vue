<!-- 檔案路徑: src/components/StatsToolbar.vue -->
<script setup>
// 1. 定義 props，接收來自父元件的統計資料
defineProps({
  statsData: {
    type: Array,
    required: true,
  },
  weekdays: {
    type: Array,
    required: true,
  },
})
</script>

<template>
  <div class="stats-toolbar">
    <div v-for="(dayData, index) in statsData" :key="index" class="stat-item">
      <!-- 從 props 獲取星期 -->
      <strong>{{ weekdays[index] }}:</strong>
      <div class="stat-shift-group">
        <span class="shift-early">早:{{ dayData.counts['早班'] }}</span>
        <span class="shift-noon">午:{{ dayData.counts['午班'] }}</span>
        <span class="shift-late">晚:{{ dayData.counts['晚班'] }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 2. 將所有相關樣式都封裝在這個元件內部，並加上 scoped */
.stats-toolbar {
  display: flex;
  gap: 10px; /* 稍微減小間距 */
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 5px;
  margin-bottom: 20px;
  overflow-x: auto;
  white-space: nowrap;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 5px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
}
.stat-item strong {
  font-size: 1.1em;
}
.stat-shift-group {
  display: flex;
  gap: 8px;
}
.stat-shift-group span {
  padding: 4px 10px;
  border-radius: 15px;
  font-weight: bold;
  color: #fff;
  font-size: 0.9em;
}
.stat-shift-group .shift-early {
  background-color: var(--success-color);
}
.stat-shift-group .shift-noon {
  background-color: var(--warning-color);
  color: #212529;
}
.stat-shift-group .shift-late {
  background-color: var(--info-color);
}
</style>
