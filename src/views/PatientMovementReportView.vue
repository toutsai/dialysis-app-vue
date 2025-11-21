<template>
  <div class="report-container">
    <!-- 標題區 -->
    <header class="page-header">
      <h2 class="page-title"><i class="fas fa-file-medical-alt icon"></i> KiDit 申報工作站</h2>

      <!-- 月份導航 -->
      <div class="month-navigator">
        <button class="nav-btn" @click="changeMonth(-1)">
          <i class="fas fa-chevron-left"></i> 上個月
        </button>
        <span class="current-month">
          {{ currentYear }} 年 <span class="month-number">{{ currentMonth }}</span> 月
        </span>
        <button class="nav-btn" @click="changeMonth(1)">
          下個月 <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </header>

    <!-- 月曆主體 -->
    <div class="calendar-wrapper" v-if="!isLoading">
      <!-- 星期標頭 -->
      <div class="weekdays-header">
        <div v-for="day in weekDays" :key="day" class="weekday">{{ day }}</div>
      </div>

      <!-- 日期網格 -->
      <div class="calendar-grid">
        <!-- 補白：如果第一天不是星期日，前面要補空格 (Optional, 視需求開啟) -->
        <div v-for="n in firstDayOffset" :key="'empty-' + n" class="day-cell empty"></div>

        <div
          v-for="day in daysData"
          :key="day.dateStr"
          class="day-cell"
          :class="{
            'has-data': day.events.length > 0,
            'is-today': isToday(day.dateStr),
            'has-alert': day.unregistered > 0,
          }"
          @click="openModal(day)"
        >
          <div class="cell-header">
            <span class="day-number">{{ day.dayNum }}</span>
            <span v-if="isToday(day.dateStr)" class="today-badge">今天</span>
          </div>

          <div class="cell-content">
            <div v-if="day.events.length > 0" class="event-indicator">
              <div class="stat-row">
                <span class="count-badge primary">
                  <i class="fas fa-list-ul"></i> {{ day.events.length }} 筆
                </span>
              </div>
              <div class="stat-row" v-if="day.unregistered > 0">
                <span class="count-badge danger">
                  <i class="fas fa-exclamation-circle"></i> {{ day.unregistered }} 未登錄
                </span>
              </div>
            </div>
            <div v-else class="no-event">
              <span class="dot"></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Loading 狀態 -->
    <div v-else class="loading-container">
      <div class="spinner"></div>
      <p>正在讀取申報資料...</p>
    </div>

    <!-- 彈窗元件 -->
    <MovementDetailModal
      :visible="showModal"
      :date="selectedDate"
      :events="selectedEvents"
      @close="showModal = false"
      @refresh="fetchData"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { kiditService } from '@/services/kiditService'
import MovementDetailModal from '@/components/kidit/MovementDetailModal.vue'

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth() + 1)
const daysData = ref([])
const isLoading = ref(false)
const weekDays = ['日', '一', '二', '三', '四', '五', '六']

// 用來計算該月第一天是星期幾，以便對齊月曆
const firstDayOffset = computed(() => {
  const firstDay = new Date(currentYear.value, currentMonth.value - 1, 1).getDay()
  return firstDay
})

// Modal 狀態
const showModal = ref(false)
const selectedDate = ref('')
const selectedEvents = ref([])

function isToday(dateStr) {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return dateStr === `${y}-${m}-${d}`
}

async function fetchData() {
  isLoading.value = true
  try {
    const logs = await kiditService.fetchMonthLogs(currentYear.value, currentMonth.value)
    const daysInMonth = new Date(currentYear.value, currentMonth.value, 0).getDate()
    const tempDays = []
    const logMap = {}

    logs.forEach((l) => (logMap[l.date] = l.events || []))

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentYear.value}-${String(currentMonth.value).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const events = logMap[dateStr] || []

      tempDays.push({
        dateStr,
        dayNum: d,
        events,
        unregistered: events.filter((e) => !e.isRegistered).length,
      })
    }
    daysData.value = tempDays
  } catch (e) {
    console.error(e)
  } finally {
    isLoading.value = false
  }
}

function changeMonth(offset) {
  let m = currentMonth.value + offset
  let y = currentYear.value
  if (m > 12) {
    m = 1
    y++
  } else if (m < 1) {
    m = 12
    y--
  }

  currentMonth.value = m
  currentYear.value = y
  fetchData()
}

function openModal(day) {
  selectedDate.value = day.dateStr
  selectedEvents.value = day.events
  showModal.value = true
}

onMounted(() => {
  fetchData()
})
</script>

<style scoped>
.report-container {
  padding: 10px;
  background-color: #f8f9fa;
  min-height: 100vh;
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* --- 標題與導航 --- */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
  background: white;
  padding: 10px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.page-title {
  font-size: 32px;
  color: #2c3e50;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title .icon {
  color: #3498db;
}

.month-navigator {
  display: flex;
  align-items: center;
  gap: 20px;
  background: #f1f3f5;
  padding: 5px 10px;
  border-radius: 30px;
}

.nav-btn {
  background: white;
  border: none;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  font-weight: 600;
  color: #555;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 5px;
}

.nav-btn:hover {
  background: #3498db;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(52, 152, 219, 0.2);
}

.current-month {
  font-size: 1.2rem;
  font-weight: bold;
  color: #333;
  min-width: 120px;
  text-align: center;
}

.month-number {
  color: #3498db;
  font-size: 1.4em;
}

/* --- 月曆本體 --- */
.calendar-wrapper {
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
  padding: 20px;
}

.weekdays-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  text-align: center;
  margin-bottom: 10px;
  border-bottom: 2px solid #f1f3f5;
  padding-bottom: 10px;
}

.weekday {
  font-weight: 600;
  color: #95a5a6;
  text-transform: uppercase;
  font-size: 0.9rem;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px; /* 格子間距 */
}

.day-cell {
  background: #fff;
  border: 1px solid #e9ecef;
  border-radius: 10px;
  min-height: 120px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  position: relative;
}

.day-cell:hover {
  border-color: #3498db;
  box-shadow: 0 4px 12px rgba(52, 152, 219, 0.15);
  transform: translateY(-3px);
  z-index: 1;
}

/* 狀態樣式 */
.day-cell.has-data {
  background: #fbfdff;
  border-color: #d6eaf8;
}

.day-cell.has-alert {
  border-left: 4px solid #e74c3c; /* 左側紅色警告條 */
}

.day-cell.is-today {
  background: #fff9e6; /* 淡黃色背景 */
  border: 2px solid #f1c40f;
}

/* 空白補位格 */
.day-cell.empty {
  background: transparent;
  border: none;
  cursor: default;
  pointer-events: none;
}

/* 格子內部 */
.cell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.day-number {
  font-size: 1.1rem;
  font-weight: 700;
  color: #555;
}

.today-badge {
  background: #f1c40f;
  color: #fff;
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.cell-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.stat-row {
  margin-bottom: 4px;
}

.count-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.85rem;
  padding: 4px 8px;
  border-radius: 6px;
  width: 100%;
}

.count-badge.primary {
  background: #e3f2fd;
  color: #1976d2;
}

.count-badge.danger {
  background: #ffebee;
  color: #c62828;
}

.no-event .dot {
  display: block;
  width: 6px;
  height: 6px;
  background: #eee;
  border-radius: 50%;
  margin: 0 auto;
}

/* Loading */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 400px;
  color: #666;
}

.spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* RWD 手機版調整 */
@media (max-width: 768px) {
  .calendar-grid {
    grid-template-columns: repeat(1, 1fr); /* 手機變清單式 */
    gap: 8px;
  }
  .weekdays-header {
    display: none; /* 手機隱藏星期 */
  }
  .day-cell {
    min-height: auto;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }
  .day-cell.empty {
    display: none;
  }
  .cell-content {
    align-items: flex-end;
  }
}
</style>
