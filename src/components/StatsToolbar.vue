<!-- 檔案路徑: src/components/StatsToolbar.vue (緊湊佈局最終版) -->
<script setup>
import { computed } from 'vue'
import { ORDERED_SHIFT_CODES, SHIFT_DISPLAY_NAMES } from '@/constants/scheduleConstants'

const props = defineProps({
  statsData: Array,
  weekdays: Array,
})

const shiftOrder = computed(() => {
  return ORDERED_SHIFT_CODES.map((code) => ({
    code: code,
    display: SHIFT_DISPLAY_NAMES[code].replace('班', ''),
  }))
})

const getBarStyles = (shiftCount) => {
  if (!shiftCount || shiftCount.total === 0) {
    return { opdStyle: { width: '0%' }, ipdStyle: { width: '0%' } }
  }
  const opdPercent = (shiftCount.opd / shiftCount.total) * 100
  const ipdPercent = (shiftCount.ipd / shiftCount.total) * 100
  return {
    opdStyle: { width: `${opdPercent}%` },
    ipdStyle: { width: `${ipdPercent}%` },
  }
}
</script>

<template>
  <div class="stats-toolbar">
    <div v-for="(dayData, index) in statsData" :key="index" class="stat-item">
      <div class="day-summary">
        <strong>{{ weekdays[index] }}</strong>
        <span class="day-total-count">{{ dayData.total }}</span>
      </div>

      <div class="stat-shift-group">
        <div v-for="shift in shiftOrder" :key="shift.code" class="shift-tag">
          <div class="shift-info">
            {{ shift.display }} {{ dayData.counts[shift.code]?.total || 0 }}
          </div>
          <div class="ratio-bar">
            <div
              class="bar-segment opd-bar"
              :style="getBarStyles(dayData.counts[shift.code]).opdStyle"
              :title="`門診: ${dayData.counts[shift.code]?.opd || 0}`"
            ></div>
            <div
              class="bar-segment ipd-bar"
              :style="getBarStyles(dayData.counts[shift.code]).ipdStyle"
              :title="`住院: ${dayData.counts[shift.code]?.ipd || 0}`"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ==========================================================================
   【緊湊佈局樣式 - 顏色修正】
   ========================================================================== */
.stats-toolbar {
  display: flex;
  justify-content: space-around;
  align-items: center;
  gap: 8px;
  padding: 5px;
  width: 100%;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  flex-shrink: 0;
}

.day-summary {
  display: flex;
  align-items: baseline;
  gap: 4px;
  padding-right: 8px;
  border-right: 1px solid #dee2e6;
}

.day-summary strong {
  font-size: 1em;
  color: #343a40;
}

.day-total-count {
  font-size: 1em;
  font-weight: bold;
  color: var(--primary-color, #007bff);
}

.stat-shift-group {
  display: flex;
  gap: 6px;
}

.shift-tag {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 45px;
}

.shift-info {
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: bold;
  color: #fff;
  font-size: 0.85em;
  background-color: #6c757d;
  width: 100%;
  text-align: center;
  box-sizing: border-box;
  white-space: nowrap;
}

.shift-tag:nth-child(1) .shift-info {
  background-color: var(--success-color);
}
.shift-tag:nth-child(2) .shift-info {
  background-color: var(--warning-color);
  color: #212529;
}
.shift-tag:nth-child(3) .shift-info {
  background-color: var(--info-color);
}

.ratio-bar {
  display: flex;
  width: 100%;
  height: 4px;
  border-radius: 2px;
  overflow: hidden;
  margin-top: 3px;
  background-color: #e9ecef;
}

.bar-segment {
  height: 100%;
  transition: width 0.3s ease;
}

/* 【核心修改】: 使用更鮮豔的主題色 */
.opd-bar {
  /* 使用與「成功」按鈕一致的綠色 */
  background-color: var(--success-color, #28a745);
}

.ipd-bar {
  /* 使用與「危險/刪除」按鈕一致的紅色 */
  background-color: var(--danger-color, #dc3545);
}
</style>
