<!-- 檔案路徑: src/views/WeeklyView.vue (最終完整整合版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的子元件
import StatsToolbar from '@/components/StatsToolbar.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
// --- 輔助函式 ---

/**
 * 根據給定日期，獲取該週的星期一的日期物件。
 * @param {Date} date - 輸入的日期。
 * @returns {Date} 該週的星期一的日期。
 */
function getStartOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay() // 星期日=0, 星期一=1, ..., 星期六=6
  // 如果是星期日(0)，我們要減去6天；如果是星期一(1)，減去0天；如果是星期二(2)，減去1天...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d.setDate(diff)).setHours(0, 0, 0, 0))
}

/**
 * 將日期物件格式化為 "MM/DD" 或 "YYYY/MM/DD" 的字串。
 * @param {Date | string} date - 輸入的日期物件或日期字串。
 * @param {boolean} [withYear=false] - 是否包含年份。
 * @returns {string} 格式化後的日期字串。
 */
function formatDate(date, withYear = false) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '' // 如果日期無效，返回空字串
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (withYear) {
    return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
  } else {
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
  }
}

/**
 * 將日期物件格式化為 "YYYY-MM-DD" 的字串，專門用於 Firestore 查詢。
 * @param {Date | string} date - 輸入的日期物件或日期字串。
 * @returns {string} 格式化後的日期字串。
 */
function formatDateForQuery(date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return '' // 如果日期無效，返回空字串
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')
// memosApi 在這個頁面暫時沒有用到，可以先註解掉
// const memosApi = ApiManager('memos')

// --- 常量定義 ---
const SHIFTS = ['早班', '午班', '晚班']
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const bedLayout = [
  1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 28, 29, 31, 32,
  33, 35, 36, 37, 38, 39, 51, 52, 53, 55, 56, 57, 58, 59, 61, 62, 63, 65,
].sort((a, b) => a - b)
const hepatitisBeds = [31, 32, 33, 35, 36]
const FREQ_MAP_TO_DAY_INDEX = {
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
}

// --- 核心狀態 ---
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  // 週排班總表比較適合只清除單次，暫不提供清除全部的選項
]

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const weekDisplay = computed(() => {
  const start = new Date(currentWeekStartDate.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 5)
  return `${formatDate(start, true)} ~ ${formatDate(end, true)}`
})
const weekDates = computed(() => {
  return Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(currentWeekStartDate.value)
    d.setDate(d.getDate() + i)
    return { weekday: WEEKDAYS[i], date: `(${formatDate(d)})`, queryDate: formatDateForQuery(d) }
  })
})
const statsToolbarData = computed(() => {
  const baseData = WEEKDAYS.map(() => ({ counts: { 早班: 0, 午班: 0, 晚班: 0 } }))
  for (const record of weekScheduleRecords.value.values()) {
    if (record && record.schedule) {
      const d = new Date(record.date + 'T00:00:00')
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dayIndex >= 0 && dayIndex < 6 && baseData[dayIndex]) {
        for (const slotData of Object.values(record.schedule)) {
          if (slotData && slotData.shiftId) {
            const shift = slotData.shiftId.split('-')[2]
            if (baseData[dayIndex].counts[shift] !== undefined) {
              baseData[dayIndex].counts[shift]++
            }
          }
        }
      }
    }
  }
  return baseData
})
const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))

// --- 方法 ---
function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}

async function loadAllData() {
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    const datesForQuery = weekDates.value.map((d) => d.queryDate)
    if (datesForQuery.length === 0) return

    const [patients, weeklyRecords] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', 'in', datesForQuery)]),
    ])

    allPatients.value = patients
    const newWeekRecords = new Map()
    weeklyRecords.forEach((record) => newWeekRecords.set(record.date, record))
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
  } catch (error) {
    console.error('讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
    alert(
      `讀取週排班資料失敗: ${error.message}\n\n提醒：如果錯誤與'in'查詢相關，可能需要建立 Firestore 索引。`,
    )
  }
}

function changeWeek(days) {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  const newDate = new Date(currentWeekStartDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentWeekStartDate.value = newDate
  loadAllData()
}

function goToToday() {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  currentWeekStartDate.value = getStartOfWeek(new Date())
  loadAllData()
}

async function loadBaseSchedule() {
  if (!confirm('確定要載入常規班表嗎？這將會覆蓋當前週的所有排班。')) {
    return
  }
  statusText.value = '正在載入常規班表...'
  try {
    const baseTemplates = await baseSchedulesApi.fetchAll()
    if (baseTemplates.length === 0) {
      alert('常規班表範本為空，沒有資料可以載入。')
      statusText.value = '常規班表為空'
      return
    }
    const newWeekRecords = new Map()
    baseTemplates.forEach((template) => {
      const { bedNumber, shiftIndex, dayIndex, patientId } = template
      const d = new Date(currentWeekStartDate.value)
      d.setDate(d.getDate() + dayIndex)
      const dateStr = formatDateForQuery(d)
      if (!newWeekRecords.has(dateStr)) {
        const existingRecord = weekScheduleRecords.value.get(dateStr)
        newWeekRecords.set(dateStr, {
          id: existingRecord?.id || null,
          date: dateStr,
          schedule: {},
          names: existingRecord?.names || {},
        })
      }
      const dailyRecord = newWeekRecords.get(dateStr)
      const shiftName = SHIFTS[shiftIndex]
      const dailyShiftId = `bed-${bedNumber}-${shiftName}`
      dailyRecord.schedule[dailyShiftId] = { patientId, shiftId: dailyShiftId }
    })
    weekScheduleRecords.value = newWeekRecords
    setChange()
    statusText.value = '常規班表已載入，請記得儲存。'
  } catch (error) {
    console.error('載入常規班表失敗:', error)
    alert('載入常規班表失敗！')
    statusText.value = '載入失敗'
  }
}

function handleGridClick(slotId) {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex, 10))
  const dateStr = formatDateForQuery(d)
  const dailyRecord = weekScheduleRecords.value.get(dateStr)
  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`
  const patientId = dailyRecord?.schedule?.[dailyShiftId]?.patientId

  if (patientId) {
    // 如果格子已填充，記錄 slotId 並打開清除對話框
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    // 如果格子是空的，打開病人選擇對話框
    currentSlotId.value = slotId
    isDialogVisible.value = true
  }
}

function handleClearSelect(selectedOptionText) {
  const slotId = clearingSlotId.value
  if (!slotId) return

  const selectedAction = CLEAR_OPTIONS.find((opt) => opt.text === selectedOptionText)?.value

  // 在週排班中，我們通常只清除單次
  if (selectedAction === 'single') {
    handleSlotUpdate(slotId, null) // 呼叫我們已有的更新函式，傳入 null 來清除病人
  }

  isClearDialogVisible.value = false // 關閉對話框
}

function handleSlotUpdate(slotId, patientId) {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex, 10))
  const dateStr = formatDateForQuery(d)

  const newWeekRecords = new Map(weekScheduleRecords.value)
  let dailyRecord = newWeekRecords.get(dateStr)

  if (!dailyRecord) {
    dailyRecord = { id: null, date: dateStr, schedule: {}, names: {} }
    newWeekRecords.set(dateStr, dailyRecord)
  }

  const newSchedule = { ...(dailyRecord.schedule || {}) }
  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`

  if (patientId) {
    newSchedule[dailyShiftId] = { patientId, shiftId: dailyShiftId }
  } else {
    delete newSchedule[dailyShiftId]
  }

  dailyRecord.schedule = newSchedule
  weekScheduleRecords.value = newWeekRecords
  setChange()
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const promises = []
    for (const record of weekScheduleRecords.value.values()) {
      const dataToSave = {
        date: record.date,
        schedule: record.schedule,
        names: record.names,
      }
      if (record.id) {
        if (Object.keys(record.schedule || {}).length > 0) {
          promises.push(schedulesApi.update(record.id, dataToSave))
        } else {
          promises.push(schedulesApi.delete(record.id))
        }
      } else {
        if (Object.keys(record.schedule || {}).length > 0) {
          promises.push(schedulesApi.save(dataToSave))
        }
      }
    }
    await Promise.all(promises)
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'
    await loadAllData()
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
  }
}

function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const daysToFill =
    fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      ? FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      : [parseInt(dayIndex, 10)]
  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    handleSlotUpdate(newSlotId, patientId)
  })
  isDialogVisible.value = false
}

function handleDialogCancel() {
  isDialogVisible.value = false
}

// --- Drag and Drop ---
function onDragStart(event, patientId) {
  event.dataTransfer.setData('text/plain', patientId)
}
function onDrop(event, slotId) {
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot) targetSlot.classList.remove('drag-over')
  const patientId = event.dataTransfer.getData('text/plain')
  if (patientId) {
    handleSlotUpdate(slotId, patientId)
  }
}
function onDragOver(event) {
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot && !targetSlot.querySelector('.slot-patient-name')) {
    targetSlot.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}
// --- 生命週期鉤子 ---
onMounted(loadAllData)
</script>

<template>
  <div class="page-container">
    <div class="header-toolbar">
      <h1>週排班總表</h1>
      <div class="date-navigator">
        <button @click="changeWeek(-7)">< 上一週</button>
        <h2>{{ weekDisplay }}</h2>
        <button @click="changeWeek(7)">下一週 ></button>
        <button @click="goToToday">回到本週</button>
        <button @click="loadBaseSchedule">載入常規班表</button>
      </div>
      <div class="main-actions">
        <span class="status-text">{{ statusText }}</span>
        <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
          儲存變更
        </button>
      </div>
    </div>

    <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />

    <div class="main-content">
      <div class="schedule-area">
        <div class="table-wrapper">
          <table class="weekly-schedule-table">
            <thead>
              <tr>
                <th>床位</th>
                <th>班次</th>
                <th v-for="day in weekDates" :key="day.weekday">
                  <div class="weekday">{{ day.weekday }}</div>
                  <div class="date">{{ day.date }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="bedNumber in bedLayout" :key="bedNumber">
                <tr
                  v-for="(shift, shiftIndex) in SHIFTS"
                  :key="shift"
                  :class="{
                    'hepatitis-bed': hepatitisBeds.includes(bedNumber),
                    'noon-shift-row': shift === '午班',
                  }"
                >
                  <td v-if="shiftIndex === 0" :rowspan="SHIFTS.length">{{ bedNumber }}號床</td>
                  <td>{{ shift }}</td>
                  <td v-for="(day, dayIndex) in weekDates" :key="day.weekday">
                    <div
                      class="schedule-slot"
                      :class="{
                        filled: weekScheduleRecords.get(day.queryDate)?.schedule?.[
                          `bed-${bedNumber}-${shift}`
                        ],
                      }"
                      @click="handleGridClick(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @drop="onDrop($event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @dragover.prevent="onDragOver"
                      @dragleave.prevent="onDragLeave"
                    >
                      <div
                        v-if="
                          weekScheduleRecords.get(day.queryDate)?.schedule?.[
                            `bed-${bedNumber}-${shift}`
                          ]
                        "
                        class="slot-patient-name"
                      >
                        {{
                          patientMap.get(
                            weekScheduleRecords.get(day.queryDate).schedule[
                              `bed-${bedNumber}-${shift}`
                            ].patientId,
                          )?.name
                        }}
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <InpatientSidebar :patients="allPatients" />
    </div>

    <PatientSelectDialog
      :is-visible="isDialogVisible"
      title="選擇排班病人"
      :patients="allPatients"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
    />
    <SelectionDialog
      :is-visible="isClearDialogVisible"
      title="清除排班選項"
      :options="CLEAR_OPTIONS.map((opt) => opt.text)"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
  </div>
</template>

<style>
/* 這裡只保留此頁面特有的、且不能被全域化的樣式 */
.main-content {
  display: flex;
  gap: 20px;
  flex-grow: 1;
  min-height: 0;
}

.schedule-area {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.table-wrapper {
  flex-grow: 1; /* <-- 關鍵！讓它佔滿所有剩餘的垂直空間 */
  overflow: auto; /* <-- 關鍵！當表格內容過多時，讓這個容器自己滾動 */
  min-height: 0; /* 一個防止 Flex 溢出的技巧 */
}

.noon-shift-row > td {
  background-color: var(--blue-bg);
}

.schedule-slot {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 5px;
  padding: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
}
.slot-patient-name {
  font-weight: bold;
}
.schedule-slot:not(.filled):hover {
  background-color: #e0e0e0;
}
.schedule-slot.filled {
  cursor: pointer;
  background-color: transparent; /* 或者 #fff，讓它和空格子一樣是白色 */
  /* 也可以加上一個細微的邊框來區分 */
  border: 1px solid #e0e0e0;
}

.schedule-slot.drag-over {
  transform: scale(1.05);
  background-color: #c8e6c9;
}
</style>
