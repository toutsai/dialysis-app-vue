<!-- 檔案路徑: src/views/ScheduleView.vue (最終完整重構版) -->
<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import StatsToolbar from '@/components/StatsToolbar.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')

// --- 常量 ---
const SHIFTS = ['早', '午', '晚']
const layoutData = {
  leftWingRows: [
    ['空', 32, 31],
    [33, 35, 36],
    [39, 38, 37],
    [51, 52, 53],
    [57, 56, 55],
    [58, 59, 61],
    [65, 63, 62],
  ],
  rightWingRows: [
    [29, 28, 27],
    [23, 25, 26],
    [22, 21, 19],
    [16, 17, 18],
    [15, 13, 12],
    [8, 9, 11],
    [7, 6, 5],
    [1, 2, 3],
  ],
}
const hepatitisBeds = ['空', 31, 32, 33, 35, 36]
const aisleSideBeds = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65]
const peripheralBedCount = 6

// --- 核心狀態 ---
const currentDate = ref(new Date())
const currentRecord = ref(null)
const allPatients = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const searchInput = ref('')

function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
const copySourceDate = ref(formatDate(new Date()))

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () =>
    ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][
      currentDate.value.getDay()
    ],
)

const shiftPatientCount = computed(() => {
  const counts = { 早: 0, 午: 0, 晚: 0 }
  if (currentRecord.value && currentRecord.value.schedule) {
    for (const slotData of Object.values(currentRecord.value.schedule)) {
      if (slotData.patientId || slotData.patient) {
        const shiftId = slotData.shiftId || ''
        if (shiftId.includes('-早')) counts['早']++
        else if (shiftId.includes('-午')) counts['午']++
        else if (shiftId.includes('-晚')) counts['晚']++
      }
    }
  }
  return counts
})

const statsToolbarData = computed(() => [{ counts: shiftPatientCount.value }])
const statsToolbarWeekdays = computed(() => ['本日'])

// --- 方法 ---
async function loadDataForDay(date) {
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  try {
    const [patientsData, dailyRecords] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
    ])
    allPatients.value = patientsData
    currentRecord.value =
      dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {}, names: {} }
    statusIndicator.value = dailyRecords.length > 0 ? '資料已載入' : '本日無雲端資料'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

function changeDate(days) {
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
  loadDataForDay(newDate)
}

function goToToday() {
  currentDate.value = new Date()
  loadDataForDay(currentDate.value)
}

// --- 生命週期鉤子 ---
onMounted(() => {
  loadDataForDay(currentDate.value)
})
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <!-- 第一行：標題、日期導航、班別統計 -->
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button @click="changeDate(-1)"><上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button @click="changeDate(1)">下一天></button>
            <button @click="goToToday">回到今日</button>
          </div>
        </div>

        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
        </div>
      </div>

      <!-- 第二行：控制面板 -->
      <div class="controls-panel">
        <div class="controls-left">
          <button id="save-btn" :disabled="!hasUnsavedChanges">儲存資料至雲端</button>
          <button id="print-btn" @click="window.print()">列印排程</button>
          <button id="clear-all-btn">清除本日畫面</button>
          <input type="date" v-model="copySourceDate" class="date-input" />
          <button id="copy-schedule-btn">從他日複製排程</button>
          <div class="search-group">
            <input type="text" v-model="searchInput" placeholder="搜尋..." class="search-input" />
            <button id="search-btn">搜尋</button>
          </div>
        </div>
        <div class="controls-right">
          <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
        </div>
      </div>
    </header>

    <main class="page-main-content">
      <div class="schedule-content">
        <div class="dialysis-unit">
          <div class="left-wing">
            <div
              v-for="(row, rowIndex) in layoutData.leftWingRows"
              :key="`left-${rowIndex}`"
              class="bed-row"
            >
              <div
                v-for="bedNumber in row"
                :key="`bed-${bedNumber}`"
                class="bed"
                :class="{
                  placeholder: bedNumber === null,
                  unassigned: bedNumber === '空',
                  hepatitis: hepatitisBeds.includes(bedNumber),
                  'aisle-side': aisleSideBeds.includes(bedNumber),
                  'left-wing-bed': true,
                }"
              >
                <div class="bed-header">
                  <template v-if="bedNumber === '空'">未排床</template>
                  <template v-else
                    >床號 {{ bedNumber
                    }}<span v-if="hepatitisBeds.includes(bedNumber)"> (BC肝炎)</span></template
                  >
                </div>
                <template v-if="bedNumber !== '空' && bedNumber !== null">
                  <div
                    v-for="shift in SHIFTS"
                    :key="shift"
                    class="shift-row"
                    :class="{ 'split-shift': shift === '午' }"
                  >
                    <div class="shift-label">{{ shift }}</div>
                    <div v-if="shift === '午'" class="nurse-split-column">
                      <select class="nurse-team-select nurse-in" title="上針">
                        <option value="">上針</option>
                      </select>
                      <select class="nurse-team-select nurse-out" title="收針">
                        <option value="">收針</option>
                      </select>
                    </div>
                    <select v-else class="nurse-team-select">
                      <option value="">-</option>
                    </select>
                    <div class="patient-name" contenteditable="true"></div>
                    <div class="patient-tag" contenteditable="true"></div>
                  </div>
                </template>
              </div>
            </div>
            <div class="bed-row">
              <div class="nursing-station">護理站</div>
            </div>
          </div>
          <div class="aisle">中 央 走 道</div>
          <div class="right-wing">
            <div
              v-for="(row, rowIndex) in layoutData.rightWingRows"
              :key="`right-${rowIndex}`"
              class="bed-row"
            >
              <div
                v-for="bedNumber in row"
                :key="`bed-${bedNumber}-right`"
                class="bed"
                :class="{ 'aisle-side': aisleSideBeds.includes(bedNumber), 'right-wing-bed': true }"
              >
                <div class="bed-header">床號 {{ bedNumber }}</div>
                <div
                  v-for="shift in SHIFTS"
                  :key="shift"
                  class="shift-row"
                  :class="{ 'split-shift': shift === '午' }"
                >
                  <div class="shift-label">{{ shift }}</div>
                  <div v-if="shift === '午'" class="nurse-split-column">
                    <select class="nurse-team-select nurse-in" title="上針">
                      <option value="">上針</option>
                    </select>
                    <select class="nurse-team-select nurse-out" title="收針">
                      <option value="">收針</option>
                    </select>
                  </div>
                  <select v-else class="nurse-team-select">
                    <option value="">-</option>
                  </select>
                  <div class="patient-name" contenteditable="true"></div>
                  <div class="patient-tag" contenteditable="true"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="extra-sections">
          <div class="peripheral-section">
            <h2>外圍床位</h2>
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div v-for="shift in SHIFTS" :key="shift" class="peripheral-shift-row">
                  <div class="shift-label">{{ shift }}</div>
                  <select class="nurse-team-select">
                    <option value="">-</option>
                  </select>
                  <div class="peripheral-bed-number" contenteditable="true"></div>
                  <div class="peripheral-patient-name" contenteditable="true"></div>
                  <div class="patient-tag" contenteditable="true"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <aside class="inpatient-sidebar">
        <h3>住院病人清單</h3>
        <div class="filter-group">
          <button data-filter="all" class="active">全部</button>
          <button data-filter="135">一三五</button>
          <button data-filter="246">二四六</button>
          <button data-filter="other">其他</button>
        </div>
        <ul id="inpatient-list">
          <li>
            <div class="patient-info-row">
              <span class="name">劉錦榮</span><span class="freq">二四六</span>
            </div>
            <div class="patient-info-row">
              <span class="mrn">(2358246)</span>
            </div>
          </li>
        </ul>
      </aside>
    </main>
  </div>
</template>

<style scoped>
/* ==========================================================================
   2. 頭部工具欄 (Header & Controls) - 修正版
   ========================================================================== */

/* 整個頭部區塊的容器 */
.page-header {
  flex-shrink: 0;
}

/* 第一行：標題、日期導航、統計 */
.header-toolbar {
  display: flex;
  justify-content: space-between; /* 讓 left, center, right 三部分分離 */
  align-items: center;
  margin-bottom: 15px;
  gap: 25px; /* 在三部分之間增加一些間距 */
}
/* 左、中、右三個子容器的通用設定 */
.toolbar-left,
.toolbar-center,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
/* 讓中間的日期導航佔據主要空間 */
.toolbar-center {
  flex-grow: 1;
  justify-content: center; /* 讓日期導航在其中間區域居中 */
}
/* 讓右側的統計資訊靠右 */
.toolbar-right {
  justify-content: flex-end;
}

.page-title {
  font-size: 1.8em;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.current-date-text,
.weekday-display {
  font-size: 1.5em;
  font-weight: bold;
  white-space: nowrap;
}
.weekday-display {
  color: var(--primary-color);
}

/* 第二行：控制面板 */
.controls-panel {
  display: flex;
  justify-content: space-between; /* 讓左右兩部分分離 */
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  border-radius: 8px;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}

/* 按鈕的通用樣式 */
.controls-panel button,
.date-navigator button,
.toolbar-center > button {
  /* 也應用於「回到今日」按鈕 */
  padding: 8px 15px;
  font-size: 1em;
  border-radius: 5px;
  border: 1px solid #ccc;
  cursor: pointer;
  transition: background-color 0.2s;
}
#save-btn {
  background-color: var(--success-color);
  color: white;
  border-color: var(--success-color);
}
#print-btn {
  background-color: var(--info-color);
  color: white;
  border-color: var(--info-color);
}
#clear-all-btn {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
#copy-schedule-btn {
  background-color: var(--warning-color);
  color: white;
  border-color: var(--warning-color);
}
.search-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.date-input,
.search-input {
  padding: 8px;
  border: 1px solid #ccc; /* 5px 的 border 可能太粗了，我改回 1px */
  border-radius: 5px;
  height: 38px; /* 和按鈕的高度保持一致 */
  box-sizing: border-box;
}
.shift-patient-count {
  margin-left: auto;
  display: flex;
  gap: 15px;
  font-weight: bold;
}
.shift-patient-count span {
  color: #005a9c;
}
.status-indicator {
  margin-left: auto;
  font-weight: bold;
}

/* ==========================================================================
   3. 主內容區 (Main Content Area)
   ========================================================================== */
/* 4. 調整主內容區的上邊距 */
.page-main-content {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
  margin-top: 15px;
}
.schedule-content {
  flex-grow: 1;
  min-width: 0;
}
.dialysis-unit {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 20px 3px;
  background-color: #dcdcdc;
  border-radius: 8px;
  font-size: 1.5em;
  letter-spacing: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
}
.left-wing,
.right-wing {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bed-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.bed,
.nursing-station,
.peripheral-bed {
  border: 1px solid #ccc;
  border-radius: 5px;
  overflow: hidden;
}
.bed {
  min-height: 160px;
}
.bed.placeholder {
  visibility: hidden;
}
.nursing-station {
  background-color: #f0f4c3;
  border: 2px dashed #afb42b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #558b2f;
  grid-column: span 3;
  padding: 30px 0; /* 上下 padding 30px，左右 padding 0 */
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 5px;
  text-align: center;
  font-size: 1em;
}
.shift-row,
.peripheral-shift-row {
  display: grid;
  align-items: stretch;
  border-top: 1px solid #e0e0e0;
}
.shift-row {
  grid-template-columns: 28px 70px 1fr 40px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 70px 1fr 40px;
  border-top-color: #f8bbd0;
}
.shift-label {
  background-color: #f5f5f5;
  font-size: 0.8em;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e0e0e0;
}
.nurse-team-select {
  padding: 4px;
  border: none;
  font-size: 0.8em;
  width: 100%;
  background: transparent;
  border-radius: 0;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  text-align: center;
}
.shift-row > .nurse-team-select,
.peripheral-shift-row > .nurse-team-select {
  border-right: 1px solid #e0e0e0;
}
.patient-name,
.peripheral-patient-name,
.peripheral-bed-number {
  padding: 4px;
  border: none;
  font-size: 0.9em;
  text-align: center;
  overflow-wrap: break-word;
  min-height: 28px; /* 給一個最小高度避免空值時塌陷 */
}
.patient-name:empty::before,
.peripheral-patient-name:empty::before {
  content: '輸入病人';
  color: #aaa;
  font-style: italic;
}
.peripheral-bed-number:empty::before {
  content: '床號';
  color: #aaa;
  font-style: italic;
}
.shift-row.split-shift .nurse-split-column {
  display: flex;
  flex-direction: column;
  border-right: 1px solid #e0e0e0;
}
.nurse-split-column .nurse-team-select {
  flex-grow: 1;
}
.nurse-split-column .nurse-team-select:first-child {
  border-bottom: 1px solid #e0e0e0;
}
.bed.aisle-side.right-wing-bed {
  border-left: 5px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 5px solid #4caf50;
}
.bed.hepatitis .bed-header {
  background-color: var(--hepatitis-bg);
  color: #af8203;
}
.bed.unassigned .bed-header {
  background-color: #bdbdbd;
  color: #424242;
}
.bed.unassigned .shift-row {
  display: none;
}
.extra-sections {
  margin-top: 30px;
}
.peripheral-section {
  padding: 15px;
  background-color: #fff;
  border-radius: 8px;
  margin-bottom: 20px;
}
.peripheral-section h2 {
  text-align: center;
  margin-top: 0;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 10px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  border-color: #f48fb1;
  color: #c2185b;
}
.patient-tag {
  border-left: 1px solid #e0e0e0;
  font-size: 0.8em;
  min-height: 28px;
}
.patient-tag:empty::before {
  content: '備註';
  color: #aaa;
  font-style: italic;
}

/* ==========================================================================
   4. 側邊欄 (Sidebar)
   ========================================================================== */
.inpatient-sidebar {
  width: 240px;
  flex-shrink: 0;
  background-color: var(--sidebar-bg);
  padding: 15px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
}
.inpatient-sidebar h3 {
  margin-top: 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}
.filter-group button {
  padding: 4px 8px;
  font-size: 0.8em;
  flex-grow: 1;
  border: 1px solid #ccc;
  background-color: #fff;
  cursor: pointer;
}
.filter-group button:hover {
  background-color: #f0f0f0;
}
.filter-group button.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}
#inpatient-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex-grow: 1;
}
#inpatient-list li {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}
.patient-info-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  align-items: center;
}
#inpatient-list li .name {
  font-weight: bold;
  font-size: 1.1em;
}
#inpatient-list li .mrn {
  font-size: 0.85em;
  color: #6c757d;
}
#inpatient-list li .freq {
  font-size: 0.9em;
  color: #555;
  background-color: #e9ecef;
  padding: 2px 6px;
  border-radius: 10px;
}

/* ==========================================================================
   5. 列印樣式 (Print Styles)
   ========================================================================== */
@page {
  size: A4 landscape;
  margin: 0.5cm;
}
@media print {
  body {
    padding: 0;
    background-color: #fff;
    font-size: 8pt;
    -webkit-print-color-adjust: exact;
    color-adjust: exact;
  }
  .controls-panel,
  .aisle,
  .status-indicator,
  #print-btn,
  #save-btn,
  #clear-all-btn,
  #copy-schedule-btn,
  #copy-source-date,
  .search-group,
  #today-btn,
  .date-nav-btn,
  .inpatient-sidebar {
    display: none !important;
  }
  .dialysis-unit,
  .extra-sections {
    max-width: 100%;
    box-shadow: none;
    gap: 10px;
  }
  .dialysis-unit {
    grid-template-columns: 1fr 1fr;
  }
  .bed,
  .nursing-station,
  .peripheral-bed {
    border: 1px solid #000;
    box-shadow: none;
    page-break-inside: avoid;
    border-radius: 3px;
  }
  .bed-row,
  .peripheral-bed-container {
    gap: 5px;
  }
  .bed {
    min-height: 120px;
  }
  .shift-row,
  .peripheral-shift-row {
    font-size: 1em;
    min-height: 25px;
    align-items: center;
  }
  .shift-row {
    grid-template-columns: 20px 55px 1fr 30px;
  }
  .peripheral-shift-row {
    display: grid;
    grid-template-columns: 20px 55px 55px 1fr 30px;
  }
  .shift-label,
  .nurse-team-select,
  .patient-name,
  .peripheral-patient-name,
  .peripheral-bed-number,
  .patient-tag,
  .nurse-split-column {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .nurse-split-column {
    flex-direction: column;
  }
  .nurse-split-column .nurse-team-select {
    width: 100%;
    flex-grow: 1;
  }
  .patient-name:empty::before,
  .peripheral-bed-number:empty::before,
  .peripheral-patient-name:empty::before,
  .patient-tag:empty::before {
    content: '';
  }
  .patient-name:empty,
  .peripheral-patient-name:empty {
    background-color: transparent !important;
  }
  select,
  .nurse-team-select:has(option[value='']:checked) {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border: none;
    background: transparent !important;
  }
  .patient-name.tag-new,
  .peripheral-patient-name.tag-new,
  .patient-name.hospitalized,
  .peripheral-patient-name.hospitalized,
  .patient-name.tag-b,
  .peripheral-patient-name.tag-b,
  .patient-name.tag-chou,
  .peripheral-patient-name.tag-chou,
  .patient-name.tag-liang,
  .peripheral-patient-name.tag-liang,
  .patient-name.tag-huan,
  .peripheral-patient-name.tag-huan {
    background-color: inherit !important;
    border: 1px dotted #888;
  }
  .bed.hepatitis .bed-header {
    border-bottom: 2px double #000;
    background-color: #fff !important;
  }
}
</style>
