<template>
  <div class="page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入醫師與排班資料...</p>
    </div>

    <header class="page-header">
      <div class="header-content">
        <h1>醫師排班</h1>
        <div class="month-navigator">
          <button @click="goToPreviousMonth">&lt;</button>
          <span class="month-display">{{ selectedYear }} 年 {{ selectedMonth }} 月</span>
          <button @click="goToNextMonth">&gt;</button>
        </div>
      </div>
      <div class="header-actions">
        <button @click="saveSchedule" class="save-btn" :disabled="!hasUnsavedChanges">
          <i class="fas fa-save"></i> 儲存本月班表
        </button>
      </div>
    </header>

    <div class="tabs-container">
      <a class="tab-link active">洗腎室/ICU 查房</a>
      <!-- 預留未來擴充會診班表的頁籤 -->
      <!-- <a class="tab-link">腎臟科會診</a> -->
    </div>

    <main class="schedule-content">
      <div class="schedule-grid-container">
        <!-- ✨ 核心修正 1：在 table 上加上 v-if="!isLoading"，確保資料載入完成才渲染 -->
        <table v-if="!isLoading" class="schedule-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>星期</th>
              <th>早班</th>
              <th>午班</th>
              <th>夜班</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="day in daysInMonth" :key="day.day" :class="getDayClass(day)">
              <td class="cell-day">{{ day.day }}</td>
              <td class="cell-weekday">{{ day.weekday }}</td>
              <td>
                <!-- ✨ 核心修正 2：在 select 上加上 v-if="scheduleData[day.day]"，並修正 HTML 結構 -->
                <select
                  v-if="scheduleData[day.day]"
                  v-model="scheduleData[day.day].early.physicianId"
                  class="physician-select"
                >
                  <option :value="null">-- 未排班 --</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ doc.name }}
                  </option>
                </select>
              </td>
              <td>
                <select
                  v-if="scheduleData[day.day]"
                  v-model="scheduleData[day.day].noon.physicianId"
                  class="physician-select"
                >
                  <option :value="null">-- 未排班 --</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ doc.name }}
                  </option>
                </select>
              </td>
              <td>
                <select
                  v-if="scheduleData[day.day]"
                  v-model="scheduleData[day.day].late.physicianId"
                  class="physician-select"
                >
                  <option :value="null">-- 未排班 --</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ doc.name }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="panels-container">
        <div class="statistics-panel">
          <h2>本月排班統計</h2>
          <table class="stats-table">
            <thead>
              <tr>
                <th>醫師姓名</th>
                <th>總平日班數 (含假日)</th>
                <th>週末班數 (六日)</th>
                <th>備註</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stat in scheduleStats" :key="stat.name">
                <td>{{ stat.name }}</td>
                <td>{{ stat.totalWeekdayShifts + stat.totalWeekdayHolidayShifts }}</td>
                <td :class="{ 'has-multiple-weekends': stat.totalWeekendShifts > 1 }">
                  {{ stat.totalWeekendShifts }}
                </td>
                <td>
                  <span v-if="stat.totalWeekendShifts > 1" class="warning-text">
                    本月輪值兩次週末
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="notes-panel">
          <h2>排班規則與備註</h2>
          <textarea
            v-model="scheduleNotes"
            class="notes-textarea"
            rows="8"
            placeholder="請在此輸入排班規則、醫師預約不值班等備註事項..."
          ></textarea>
        </div>
      </div>
    </main>

    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import ApiManager from '@/services/api_manager.js'
import AlertDialog from '@/components/AlertDialog.vue'
import axios from 'axios'
// ✨ 引入 Firebase functions 實例 ✨
import { functions } from '@/composables/useFirebase.js'
import { httpsCallable } from 'firebase/functions'

const physiciansApi = ApiManager('physicians')
const physicianSchedulesApi = ApiManager('physician_schedules')

const isLoading = ref(true)
const selectedDate = ref(new Date())
const availablePhysicians = ref([])
const scheduleData = ref({})
const scheduleNotes = ref('')
const hasUnsavedChanges = ref(false)

// 台灣行事曆資料
const holidays = ref(new Set())
const workdays = ref(new Set())

const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

// === Computed Properties ===
const selectedYear = computed(() => selectedDate.value.getFullYear())
const selectedMonth = computed(() => selectedDate.value.getMonth() + 1)

const selectedYearMonth = computed(() => {
  return `${selectedYear.value}-${selectedMonth.value.toString().padStart(2, '0')}`
})

const daysInMonth = computed(() => {
  const year = selectedYear.value
  const month = selectedMonth.value - 1
  const date = new Date(year, month, 1)
  const days = []
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']

  while (date.getMonth() === month) {
    const dayOfWeek = date.getDay()
    days.push({
      day: date.getDate(),
      weekday: weekdays[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
    date.setDate(date.getDate() + 1)
  }
  return days
})

const scheduleStats = computed(() => {
  const stats = {}

  availablePhysicians.value.forEach((doc) => {
    stats[doc.id] = {
      name: doc.name,
      totalWeekdayShifts: 0,
      totalWeekdayHolidayShifts: 0,
      totalWeekendShifts: 0,
    }
  })

  daysInMonth.value.forEach((dayInfo) => {
    const day = dayInfo.day
    const dateStr = `${selectedYear.value}-${selectedMonth.value.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`

    const isHoliday = holidays.value.has(dateStr)
    const isWeekendDay = dayInfo.isWeekend

    for (const shift of ['early', 'noon', 'late']) {
      const physicianId = scheduleData.value[day]?.[shift]?.physicianId

      if (physicianId && stats[physicianId]) {
        if (isWeekendDay) {
          stats[physicianId].totalWeekendShifts++
        } else if (isHoliday) {
          stats[physicianId].totalWeekdayHolidayShifts++
        } else {
          stats[physicianId].totalWeekdayShifts++
        }
      }
    }
  })

  return Object.values(stats)
})

// === Functions ===
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}

function getDayClass(day) {
  const dateStr = `${selectedYear.value}-${selectedMonth.value.toString().padStart(2, '0')}-${day.day.toString().padStart(2, '0')}`

  if (holidays.value.has(dateStr)) return 'is-holiday'
  if (workdays.value.has(dateStr)) return 'is-workday'
  if (day.isWeekend) return 'is-weekend'
  return 'is-weekday'
}

async function fetchHolidayData(year) {
  console.log('--- Debug: 正在呼叫 fetchHolidayData ---')
  console.log('收到的 "year" 參數是:', year)
  console.log('"year" 參數的類型是:', typeof year)
  try {
    // ✨ 建立對我們自己 Cloud Function 的引用 ✨
    const getHolidays = httpsCallable(functions, 'getTaiwanHolidays')

    // ✨ 呼叫我們自己的函式，並傳入年份 ✨
    const response = await getHolidays({ year: Number(year) })
    const data = response.data

    const holidaySet = new Set()
    const workdaySet = new Set()

    if (data.success && data.result.records) {
      data.result.records.forEach((record) => {
        const date = record.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
        if (record.isHoliday === '是') {
          holidaySet.add(date)
        }
        if (record.isHoliday === '否' && record.description.includes('補行上班')) {
          workdaySet.add(date)
        }
      })
    }
    holidays.value = holidaySet
    workdays.value = workdaySet
  } catch (error) {
    console.error('獲取台灣行事曆資料失敗:', error)
    showAlert('警告', '無法自動載入國定假日，月曆顏色可能不完全準確。')
  }
}

function generateBlankSchedule(year, month) {
  const blankSchedule = {}
  const daysCount = new Date(year, month, 0).getDate()
  for (let i = 1; i <= daysCount; i++) {
    blankSchedule[i] = {
      early: { physicianId: null, name: null },
      noon: { physicianId: null, name: null },
      late: { physicianId: null, name: null },
    }
  }
  return blankSchedule
}

async function fetchPhysicians() {
  try {
    availablePhysicians.value = await physiciansApi.fetchAll()
  } catch (error) {
    console.error('讀取醫師列表失敗:', error)
    showAlert('錯誤', '無法讀取醫師列表，請檢查網路或聯繫管理員。')
  }
}

async function loadSchedule() {
  isLoading.value = true
  hasUnsavedChanges.value = false

  try {
    // 確保當年份的假日資料已載入
    if (!holidays.value.has(`${selectedYear.value}-01-01`)) {
      await fetchHolidayData(selectedYear.value)
    }

    const docId = selectedYearMonth.value
    const existingSchedule = await physicianSchedulesApi.fetchById(docId)

    if (existingSchedule) {
      scheduleData.value =
        existingSchedule.schedule || generateBlankSchedule(selectedYear.value, selectedMonth.value)
      scheduleNotes.value = existingSchedule.notes || ''
    } else {
      scheduleData.value = generateBlankSchedule(selectedYear.value, selectedMonth.value)
      scheduleNotes.value = ''
    }
  } catch (error) {
    console.error(`讀取 ${selectedYearMonth.value} 班表失敗:`, error)
    showAlert('讀取失敗', '讀取班表時發生錯誤。')
    scheduleData.value = generateBlankSchedule(selectedYear.value, selectedMonth.value)
    scheduleNotes.value = ''
  } finally {
    isLoading.value = false
  }
}

async function saveSchedule() {
  isLoading.value = true

  const physicianMap = new Map(availablePhysicians.value.map((p) => [p.id, p.name]))

  const dataToSave = {
    year: selectedYear.value,
    month: selectedMonth.value,
    schedule: {},
    notes: scheduleNotes.value,
  }

  for (const day in scheduleData.value) {
    dataToSave.schedule[day] = {}
    for (const shift of ['early', 'noon', 'late']) {
      const physicianId = scheduleData.value[day][shift].physicianId
      dataToSave.schedule[day][shift] = {
        physicianId: physicianId,
        name: physicianId ? physicianMap.get(physicianId) : null,
      }
    }
  }

  try {
    await physicianSchedulesApi.save(selectedYearMonth.value, dataToSave)
    hasUnsavedChanges.value = false
    showAlert('儲存成功', `${selectedYearMonth.value} 的醫師班表已成功儲存！`)
  } catch (error) {
    console.error('儲存班表失敗:', error)
    showAlert('儲存失敗', '儲存班表時發生錯誤。')
  } finally {
    isLoading.value = false
  }
}

function goToPreviousMonth() {
  selectedDate.value = new Date(selectedDate.value.setMonth(selectedDate.value.getMonth() - 1))
}

function goToNextMonth() {
  selectedDate.value = new Date(selectedDate.value.setMonth(selectedDate.value.getMonth() + 1))
}

// === Lifecycle & Watchers ===
onMounted(async () => {
  await Promise.all([fetchPhysicians(), fetchHolidayData(selectedYear.value)])
  await loadSchedule()
})

watch(selectedYearMonth, loadSchedule)

watch(
  scheduleData,
  () => {
    if (isLoading.value) return // 避免載入資料時觸發
    hasUnsavedChanges.value = true
  },
  { deep: true },
)

watch(scheduleNotes, () => {
  if (isLoading.value) return
  hasUnsavedChanges.value = true
})
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

.page-container {
  padding: 1rem;
  background-color: #f8f9fa;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #dee2e6;
  flex-shrink: 0;
}

.header-content,
.header-actions {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

h1 {
  font-size: 2rem;
  margin: 0;
  color: #343a40;
}

.month-navigator {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.month-navigator button {
  background: none;
  border: 1px solid #ced4da;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 1.2rem;
  transition: background-color 0.2s;
}
.month-navigator button:hover {
  background-color: #e9ecef;
}

.month-display {
  font-size: 1.5rem;
  font-weight: bold;
}

.save-btn {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  background-color: #28a745;
  color: white;
  border: 1px solid #28a745;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  transition: background-color 0.2s;
}
.save-btn:hover:not(:disabled) {
  background-color: #218838;
}
.save-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  border-color: #6c757d;
}

.tabs-container {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
}
.tab-link {
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  text-decoration: none;
  color: #007bff;
}
.tab-link.active {
  background-color: #fff;
  border-color: #dee2e6;
  color: #495057;
}

.schedule-content {
  flex-grow: 1;
  min-height: 0; /* Important for flex-grow to work in a flex container */
  display: flex;
  flex-direction: column;
}

.schedule-grid-container {
  flex-grow: 1;
  overflow: auto; /* This makes the table scrollable */
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.schedule-table {
  width: 100%;
  border-collapse: collapse;
}

.schedule-table th,
.schedule-table td {
  border: 1px solid #dee2e6;
  padding: 0.5rem;
  text-align: center;
  vertical-align: middle;
}

.schedule-table thead th {
  background-color: #f8f9fa;
  position: sticky;
  top: 0;
  z-index: 10;
}

.cell-day {
  font-weight: bold;
}

/* 行事曆顏色 */
.is-weekday {
  background-color: #fff;
}
.is-weekend {
  background-color: #fff3cd;
} /* 淡黃色 */
.is-holiday {
  background-color: #f8d7da;
} /* 淡紅色 */
.is-workday {
  background-color: #e2e3e5;
} /* 灰色 */

.physician-select {
  width: 100%;
  min-width: 120px;
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #ced4da;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #007bff;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.panels-container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.5rem;
  margin-top: 1.5rem;
  flex-shrink: 0;
}

.statistics-panel,
.notes-panel {
  background-color: #fff;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.statistics-panel h2,
.notes-panel h2 {
  margin-top: 0;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e9ecef;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
}
.stats-table th,
.stats-table td {
  border: 1px solid #e9ecef;
  padding: 0.75rem;
  text-align: center;
}
.stats-table th {
  background-color: #f8f9fa;
}

.stats-table .has-multiple-weekends {
  font-weight: bold;
  color: #dc3545;
  font-size: 1.2em;
}

.stats-table .warning-text {
  color: #dc3545;
  font-weight: 500;
}

.notes-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 992px) {
  .panels-container {
    grid-template-columns: 1fr;
  }
}
</style>
