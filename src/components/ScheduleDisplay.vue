<script setup>
import { computed } from 'vue'
import StatsToolbar from './StatsToolbar.vue' // 引入 StatsToolbar
import ScheduleTable from './ScheduleTable.vue' // 引入我們剛創建的 ScheduleTable

// 1. 定義這個高層級元件需要的所有 props
// 它基本上是 StatsToolbar 和 ScheduleTable props 的超集
const props = defineProps({
  // --- Table 資料 Props ---
  layout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  patientMap: { type: Map, required: true },

  // --- Table 配置 Props ---
  shifts: { type: Array, required: true },
  weekdays: { type: Array, required: true },
  weekDates: { type: Array, default: () => [] },
  hepatitisBeds: { type: Array, default: () => [] },

  // --- Table 函式 Props ---
  getStyleFunc: { type: Function, default: () => ({}) },

  // --- Toolbar 資料 Props ---
  statsData: { type: Array, required: true },
  statsToolbarWeekdays: { type: Array, required: true },
})

// 2. 定義所有需要向上層傳遞的事件
const emit = defineEmits(['grid-click', 'drop', 'drag-start', 'drag-over', 'drag-leave'])

// 3. 創建一個簡單的事件轉發器，讓程式碼更清晰
// 當 ScheduleTable emit 事件時，這個函式會被呼叫，然後它會再 emit 給上層
function forwardEvent(eventName, ...args) {
  emit(eventName, ...args)
}
</script>

<template>
  <div class="schedule-display-container">
    <StatsToolbar :stats-data="statsData" :weekdays="statsToolbarWeekdays" />
    <ScheduleTable
      :layout="layout"
      :schedule-data="scheduleData"
      :patient-map="patientMap"
      :shifts="shifts"
      :weekdays="weekdays"
      :week-dates="weekDates"
      :hepatitis-beds="hepatitisBeds"
      :get-style-func="getStyleFunc"
      @grid-click="(slotId) => forwardEvent('grid-click', slotId)"
      @drop="(event, slotId) => forwardEvent('drop', event, slotId)"
      @drag-start="(event, slotId) => forwardEvent('drag-start', event, slotId)"
      @drag-over="(event) => forwardEvent('drag-over', event)"
      @drag-leave="(event) => forwardEvent('drag-leave', event)"
    />
  </div>
</template>

<style scoped>
.schedule-display-container {
  display: flex;
  flex-direction: column;
  gap: 20px; /* 在 Toolbar 和 Table 之間增加一些間距 */
  flex-grow: 1;
  min-height: 0;
  padding: 20px; /* 增加一些內邊距 */
}
.StatsToolbar {
  margin-bottom: 20px; /* 在工具欄底部增加間距 */
}
</style>
