// 檔案路徑: src/views/WeeklyView.vue ( 最終完整簡化版)
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore' // 直接從 SDK import 我們需要的工具
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'

// import PatientSelectDialog from '@/components/PatientSelectDialog.vue' // 稍後再實現

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const memosApi = ApiManager('memos')
const baseSchedulesApi = ApiManager('base_schedules')

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
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')

// --- UI 狀態 ---
const inpatientFilter = ref('all')
const isDialogVisible = ref(false)
const currentSlotId = ref(null)

// --- 輔助函式 ---
function getStartOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d.setDate(diff)).setHours(0, 0, 0, 0))
}
function formatDate(date, withYear = false) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  return withYear
    ? `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
    : `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}
function formatDateForQuery(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- 計算屬性 ---
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

const statsToolbarWeekdays = computed(() => {
  return WEEKDAYS.map((w) => w.slice(-1)) // ['一', '二', '三', ...]
})

const inpatientList = computed(() => {
  let inpatients = allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted)
  const regularFreqs = ['一三五', '二四六']
  if (inpatientFilter.value === '135') {
    inpatients = inpatients.filter((p) => p.frequency === '一三五')
  } else if (inpatientFilter.value === '246') {
    inpatients = inpatients.filter((p) => p.frequency === '二四六')
  } else if (inpatientFilter.value === 'other') {
    inpatients = inpatients.filter((p) => !regularFreqs.includes(p.frequency))
  }
  return inpatients
})

const statsToolbarData = computed(() => {
  // 1. 先建立一個包含完整結構的基礎陣列
  const baseData = WEEKDAYS.map((day) => ({
    weekday: day.slice(-1), // '一', '二', '三'...
    counts: { 早班: 0, 午班: 0, 晚班: 0 },
  }))

  // 2. 遍歷已有的排班記錄，填充人數
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

  // 3. 總是回傳這個結構完整的陣列
  return baseData
})

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

    const [patients, weeklyRecords, memos] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', 'in', datesForQuery)]),
      memosApi.fetchAll([where('isResolved', '==', false)]),
    ])

    allPatients.value = patients
    const newWeekRecords = new Map()
    weeklyRecords.forEach((record) => newWeekRecords.set(record.date, record))
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
    // showMemoReminders(memos); // 之後可以啟用
  } catch (error) {
    console.error('讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
    alert(`讀取週排班資料失敗: ${error.message}`)
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
  if (!confirm('確定要載入常規班表嗎？這將會覆蓋當前週的所有排班，且未儲存的變更將會遺失。')) {
    return
  }

  statusText.value = '正在載入常規班表...'
  try {
    // 1. 從 Firestore 獲取所有常規班表範本
    const baseTemplates = await baseSchedulesApi.fetchAll()

    if (baseTemplates.length === 0) {
      alert('常規班表範本為空，沒有資料可以載入。')
      statusText.value = '常規班表為空'
      return
    }

    // 2. 建立一個全新的 Map 來存放新的週排班，這樣可以徹底覆蓋舊的
    const newWeekRecords = new Map()

    // 3. 遍歷常規班表範本，建立新的每日排班記錄
    baseTemplates.forEach((template) => {
      const { bedNumber, shiftIndex, dayIndex, patientId } = template

      // 計算範本對應到本週的具體日期字串
      const d = new Date(currentWeekStartDate.value)
      d.setDate(d.getDate() + dayIndex)
      const dateStr = formatDateForQuery(d)

      // 如果這天的記錄還不存在，就建立一個新的
      if (!newWeekRecords.has(dateStr)) {
        // 嘗試從舊的記錄中繼承 id 和 names，如果存在的話
        const existingRecord = weekScheduleRecords.value.get(dateStr)
        newWeekRecords.set(dateStr, {
          id: existingRecord?.id || null,
          date: dateStr,
          schedule: {},
          names: existingRecord?.names || {},
        })
      }

      // 將範本填入對應的每日排班中
      const dailyRecord = newWeekRecords.get(dateStr)
      const shiftName = SHIFTS[shiftIndex]
      const dailyShiftId = `bed-${bedNumber}-${shiftName}`
      dailyRecord.schedule[dailyShiftId] = { patientId, shiftId: dailyShiftId }
    })

    // 4. 更新響應式狀態，觸發 Vue 的畫面更新
    weekScheduleRecords.value = newWeekRecords

    // 5. 標記為有未儲存的變更
    setChange()
    statusText.value = '常規班表已載入，請記得儲存。'
  } catch (error) {
    console.error('載入常規班表失敗:', error)
    alert('載入常規班表失敗！')
    statusText.value = '載入失敗'
  }
}

// 用來接收子元件回傳的結果
function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')

  const daysToFill =
    fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      ? FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      : [parseInt(dayIndex)]

  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    handleSlotUpdate(newSlotId, patientId)
  })

  isDialogVisible.value = false // 關閉對話框
}

// 用來處理點擊「取消」
function handleDialogCancel() {
  isDialogVisible.value = false
}

function handleGridClick(slotId) {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex))
  const dateStr = formatDateForQuery(d)
  const dailyRecord = weekScheduleRecords.value.get(dateStr)
  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`
  const patientId = dailyRecord?.schedule?.[dailyShiftId]?.patientId
  if (patientId) {
    if (confirm('確定要清除此床位的排班嗎？')) {
      handleSlotUpdate(slotId, null)
    }
  } else {
    // 點擊空格子時，記錄 slotId 並打開對話框
    currentSlotId.value = slotId
    isDialogVisible.value = true
  }
}

function handleSlotUpdate(slotId, patientId) {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex))
  const dateStr = formatDateForQuery(d)
  let dailyRecord = weekScheduleRecords.value.get(dateStr)
  if (!dailyRecord) {
    dailyRecord = { id: null, date: dateStr, schedule: {}, names: {} }
    weekScheduleRecords.value.set(dateStr, dailyRecord)
  }
  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`
  if (patientId) {
    dailyRecord.schedule[dailyShiftId] = { patientId, shiftId: dailyShiftId }
  } else {
    if (dailyRecord.schedule) {
      delete dailyRecord.schedule[dailyShiftId]
    }
  }
  weekScheduleRecords.value = new Map(weekScheduleRecords.value)
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
onMounted(() => {
  loadAllData() // 直接呼叫，不再需要任何等待
})
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
        <button :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">儲存變更</button>
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
                    'noon-shift-row': shift === '午班' /* <-- 新增這一行規則 */,
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
                        /* 其他可能的 class，例如病人狀態 */
                      }"
                      @click="handleGridClick(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @drop="onDrop($event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @dragover="onDragOver"
                      @dragleave="onDragLeave"
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
      <aside class="inpatient-sidebar">
        <h3>住院病人清單 (可拖曳)</h3>
        <div class="filter-group">
          <button @click="inpatientFilter = 'all'" :class="{ active: inpatientFilter === 'all' }">
            全部
          </button>
          <button @click="inpatientFilter = '135'" :class="{ active: inpatientFilter === '135' }">
            一三五
          </button>
          <button @click="inpatientFilter = '246'" :class="{ active: inpatientFilter === '246' }">
            二四六
          </button>
          <button
            @click="inpatientFilter = 'other'"
            :class="{ active: inpatientFilter === 'other' }"
          >
            其他
          </button>
        </div>
        <ul id="inpatient-list">
          <li
            v-for="p in inpatientList"
            :key="p.id"
            draggable="true"
            @dragstart="onDragStart($event, p.id)"
          >
            <div class="patient-info-row">
              <span class="name">{{ p.name }}</span>
              <span class="freq">{{ p.frequency || '未設定' }}</span>
            </div>
            <div class="patient-info-row">
              <span class="mrn">({{ p.medicalRecordNumber || 'N/A' }})</span>
            </div>
          </li>
        </ul>
      </aside>
    </div>
    <!--
    <PatientSelectDialog
      :is-visible="isDialogVisible"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
    />
    -->

    <PatientSelectDialog
      :is-visible="isDialogVisible"
      title="選擇排班病人"
      :patients="allPatients"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
    />
  </div>
</template>

<style>
/* 這裡應該只保留此頁面特有的樣式，通用樣式應移至全域 CSS */
.page-container {
  width: 100%;
}
.main-content {
  display: flex;
  gap: 20px;
}
.schedule-area {
  flex-grow: 1; /* <-- 關鍵！讓這個區域佔滿所有剩餘空間 */
  /* 為了避免它被無限撐開，可以加上 min-width */
  min-width: 0;
}
.inpatient-sidebar {
  width: 240px;
  flex-shrink: 0; /* <-- 關鍵！防止這個區域被壓縮 */
  /* ... 其他樣式 ... */
}
.noon-shift-row > td {
  background-color: var(--blue-bg); /* 使用我們在 :root 定義的淺藍色 */
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
</style>
