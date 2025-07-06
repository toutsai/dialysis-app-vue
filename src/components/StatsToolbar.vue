<script setup>
import { computed } from 'vue'
import { ORDERED_SHIFT_CODES, SHIFT_DISPLAY_NAMES } from '@/constants/scheduleConstants'

const props = defineProps({
  statsData: Array,
  weekdays: Array,
  // columnWidths 和 size 的 props 保持不變，它們是正確的
  columnWidths: {
    type: Array,
    default: () => [],
  },
  size: {
    type: String,
    default: 'normal',
  },
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

// 【核心修改】: 不再計算每個 item 的 style，而是計算整個 toolbar 的總寬度
const toolbarStyle = computed(() => {
  if (props.columnWidths.length === 0) {
    return {}
  }
  // 將所有欄位寬度加總，得到 toolbar 應該佔據的總寬度
  const totalWidth = props.columnWidths.reduce((sum, width) => sum + width, 0)

  // 加上 gap 的寬度 (項目數 - 1) * gap
  const totalGap = (props.columnWidths.length - 1) * 8 // 假設 gap 是 8px

  // 返回一個 style 物件，設定 toolbar 的總寬度
  return {
    width: `${totalWidth + totalGap}px`,
  }
})
</script>

<template>
  <!-- 【核心修改】:
    1. 在 stats-toolbar 容器上綁定新的 toolbarStyle，來設定總寬度。
    2. 移除 stat-item 上的動態 :style 綁定。
  -->
  <div class="stats-toolbar" :class="`size-${size}`" :style="toolbarStyle">
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
.stats-toolbar {
  display: flex;
  /* 【核心修改】: 換回 space-around，讓 flexbox 自動分配空間 */
  justify-content: space-around;
  align-items: center;
  gap: 8px;
  /* 移除 width: 100%，因為寬度由 :style 動態設定 */
  transition: width 0.2s ease-in-out; /* 讓總寬度變化更平滑 */
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;

  /* 【核心修改】: 讓每個 item 平均分配容器寬度，這是對齊的關鍵！ */
  flex: 1 1 0;

  /* 移除動態寬度，因為現在由 flexbox 控制 */
}

/* ... day-summary, day-total-count, stat-shift-group 等樣式不變 ... */

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
  font-size: 50px;
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

.opd-bar {
  background-color: var(--success-color, #28a745);
}

.ipd-bar {
  background-color: var(--danger-color, #dc3545);
}

/* 尺寸變體樣式 (保持不變) */
.stats-toolbar.size-normal .day-summary strong,
.stats-toolbar.size-normal .day-total-count {
  font-size: 1.1em;
}
.stats-toolbar.size-normal .shift-info {
  font-size: 0.9em;
  padding: 4px 10px;
}

.stats-toolbar.size-compact .stat-item {
  padding: 4px 6px;
  gap: 6px;
}
.stats-toolbar.size-compact .day-summary {
  padding-right: 6px;
}
.stats-toolbar.size-compact .day-summary strong,
.stats-toolbar.size-compact .day-total-count {
  font-size: 0.9em;
}
.stats-toolbar.size-compact .shift-info {
  font-size: 0.75em;
  padding: 2px 6px;
}
.stats-toolbar.size-compact .shift-tag {
  min-width: 40px;
}
.stats-toolbar.size-compact .ratio-bar {
  height: 3px;
}
</style>
