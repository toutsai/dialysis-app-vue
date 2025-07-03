<!-- 檔案路徑: src/components/StatsToolbar.vue (重構版) -->
<script setup>
import { computed } from 'vue'
// 1. 引入我們新建的 scheduleConstants
import { ORDERED_SHIFT_CODES, SHIFT_DISPLAY_NAMES } from '@/constants/scheduleConstants'

const props = defineProps({
  statsData: Array, // e.g., [{ counts: { early: 5, noon: 6, late: 4 } }]
  weekdays: Array, // e.g., ['一', '二', '三'] or ['本日']
})

// 2. 創建一個計算屬性來處理班次，這樣模板更乾淨
const shiftOrder = computed(() => {
  // 將我們的代碼轉換成模板需要渲染的物件陣列
  return ORDERED_SHIFT_CODES.map((code) => ({
    code: code, // 'early', 'noon', 'late'
    display: SHIFT_DISPLAY_NAMES[code].replace('班', ''), // '早', '午', '晚'
    // 增加一個對應的 css class，方便設定顏色
    cssClass: `shift-${code}`, // 'shift-early', 'shift-noon', 'shift-late'
  }))
})
</script>

<template>
  <div class="stats-toolbar">
    <div v-for="(dayData, index) in statsData" :key="index" class="stat-item">
      <!-- 從 props 獲取星期，保持不變 -->
      <strong>{{ weekdays[index] }}</strong>
      <div class="stat-shift-group">
        <!-- 3. 使用新的 shiftOrder 計算屬性來動態生成班次統計 -->
        <span v-for="shift in shiftOrder" :key="shift.code" :class="shift.cssClass">
          <!-- 顯示 '早 5', '午 6', '晚 4' -->
          {{ shift.display }} {{ dayData.counts[shift.code] || 0 }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats-toolbar {
  display: flex;
  gap: 15px;
  padding: 5px;
  border-radius: 5px;
  margin-bottom: 10px;
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
  min-width: 40px; /* 給一個最小寬度，避免數字變化時跳動 */
  text-align: center;
}

/* 4. 修改 css class 來匹配新的動態 class */
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
