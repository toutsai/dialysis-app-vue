<!-- 檔案路徑: src/views/ScheduleView.vue (最終完整重構版) -->
<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules') // 載入常規需要

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
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = baseTeams.map((t) => `早${t}`)
const lateTeams = baseTeams.map((t) => `晚${t}`)
const allTeams = [...earlyTeams, ...lateTeams] // 用於午班收針

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const searchInput = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })

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
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const shiftPatientCount = computed(() => {
  // 1. 初始化時就使用 '早班', '午班', '晚班' 作為 key
  const counts = { 早班: 0, 午班: 0, 晚班: 0 }
  // 直接存取 reactive 物件的屬性，不需 .value
  if (currentRecord && currentRecord.schedule) {
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData.patientId) {
        const shiftId = slotData.shiftId || ''
        // 2. 判斷後，更新對應的 key
        if (shiftId.includes('-早')) counts['早班']++
        else if (shiftId.includes('-午')) counts['午班']++
        else if (shiftId.includes('-晚')) counts['晚班']++
      }
    }
  }
  return counts
})
const statsToolbarData = computed(() => [{ counts: shiftPatientCount.value }])
const statsToolbarWeekdays = computed(() => ['本日'])

// --- 方法 ---
function setChange() {
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  console.clear()
  console.log(`%c[1. 準備查詢] - 目標日期: "${dateStr}"`, 'color: blue; font-weight: bold;')
  try {
    const [patientsData, dailyRecords] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
    ])

    console.log(
      `%c[2. 查詢結束] - Firestore 返回了 ${dailyRecords.length} 筆排班記錄。`,
      'color: green;',
    )
    console.log('返回的病人資料 (allPatients):', patientsData)

    allPatients.value = patientsData
    const record =
      dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {}, names: {} }
    // 更新元資料
    currentRecord.id = record.id
    currentRecord.date = record.date
    currentRecord.names = record.names

    // **用「替換」的方式來更新 schedule 物件，以確保響應性**
    currentRecord.schedule = record.schedule || {}
    statusIndicator.value = dailyRecords.length > 0 ? '資料已載入' : '本日無雲端資料'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

// **實現 handleSlotUpdate (解決問題 1)**
function handleSlotUpdate(shiftId, patientId) {
  if (patientId) {
    currentRecord.schedule[shiftId] = { patientId, shiftId }
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
  loadDataForDay(newDate)
}

function goToToday() {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  currentDate.value = new Date()
  loadDataForDay(currentDate.value)
}

function getPatientName(bedNum, shift) {
  const shiftName = `${shift}班`
  const shiftId = `bed-${bedNum}-${shiftName}`
  const patientId = currentRecord.schedule?.[shiftId]?.patientId
  return patientId ? patientMap.value.get(patientId)?.name : ''
}

// **實現 saveDataToCloud (解決問題 2)**
async function saveDataToCloud() {
  statusIndicator.value = '儲存中...'
  try {
    // 準備一個乾淨的資料物件來儲存
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule,
      names: currentRecord.names || {},
    }

    if (currentRecord.id) {
      await schedulesApi.update(currentRecord.id, dataToSave)
    } else {
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id // 更新 ID，以便下次是更新
    }
    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'
    alert('排程已成功儲存！')
  } catch (error) {
    console.error('儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
  }
}

// **實現 clearBoard (解決問題 2)**
function clearBoard() {
  if (confirm('確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)')) {
    // 清空 schedule 物件的所有屬性
    Object.keys(currentRecord.schedule).forEach((key) => {
      delete currentRecord.schedule[key]
    })
    setChange()
  }
}

// **實現 copySchedule (解決問題 2)**
async function copySchedule() {
  if (!copySourceDate.value) {
    alert('請選擇一個來源日期！')
    return
  }
  if (copySourceDate.value === formatDate(currentDate.value)) {
    alert('來源日期與目前日期相同，無需複製。')
    return
  }
  if (
    !confirm(`確定要將 ${copySourceDate.value} 的排程複製到本日嗎？\n這會覆蓋當前畫面的所有內容！`)
  )
    return

  statusIndicator.value = `從 ${copySourceDate.value} 複製中...`
  try {
    const sourceRecords = await schedulesApi.fetchAll([where('date', '==', copySourceDate.value)])
    if (sourceRecords.length > 0) {
      // 直接用來源資料的 schedule 物件，覆蓋當前的 schedule 物件
      Object.keys(currentRecord.schedule).forEach((key) => delete currentRecord.schedule[key])
      Object.assign(currentRecord.schedule, sourceRecords[0].schedule || {})
      setChange()
      statusIndicator.value = '複製成功，請記得儲存'
    } else {
      alert(`在雲端找不到 ${copySourceDate.value} 的排程資料。`)
      statusIndicator.value = '複製失敗'
    }
  } catch (error) {
    alert(`複製失敗: ${error.message}`)
    statusIndicator.value = '複製失敗'
  }
}

// **實現拖曳功能 (解決問題 1)**
function onDragStart(event, patientId) {
  event.dataTransfer.setData('text/plain', patientId)
}
function onDrop(event, shiftId) {
  event.preventDefault()
  event.target.closest('.patient-name')?.classList.remove('drag-over')
  const patientId = event.dataTransfer.getData('text/plain')
  if (patientId) handleSlotUpdate(shiftId, patientId)
}
function onDragOver(event) {
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name')
  if (targetCell && !targetCell.textContent.trim()) {
    targetCell.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.patient-name')?.classList.remove('drag-over')
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
          <button id="save-btn" @click="saveDataToCloud" :disabled="!hasUnsavedChanges">
            儲存資料至雲端
          </button>
          <button id="print-btn" @click="window.print()">列印排程</button>
          <button id="clear-all-btn" @click="clearBoard">清除本日畫面</button>
          <input type="date" v-model="copySourceDate" />
          <button id="copy-schedule-btn" @click="copySchedule">從他日複製排程</button>
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
          <!-- 左翼 -->
          <div class="left-wing">
            <div
              v-for="(row, rowIndex) in layoutData.leftWingRows"
              :key="`left-${rowIndex}`"
              class="bed-row"
            >
              <div
                v-for="bedNum in row"
                :key="`bed-left-${bedNum}`"
                class="bed"
                :class="{
                  unassigned: bedNum === '空',
                  hepatitis: hepatitisBeds.includes(bedNum),
                  'aisle-side': aisleSideBeds.includes(bedNum),
                  'left-wing-bed': true,
                }"
              >
                <div class="bed-header">
                  {{ bedNum === '空' ? '未排床' : `床號 ${bedNum}` }}
                  <span v-if="hepatitisBeds.includes(bedNum) && bedNum !== '空'">(BC肝炎)</span>
                </div>
                <template v-if="bedNum !== '空'">
                  <div
                    v-for="shift in SHIFTS"
                    :key="shift"
                    class="shift-row"
                    :class="{ 'split-shift': shift === '午' }"
                  >
                    <div class="shift-label">{{ shift }}</div>
                    <!-- **關鍵修正 1：加入午班和其他班別的 select 邏輯** -->
                    <div v-if="shift === '午'" class="nurse-split-column">
                      <select class="nurse-team-select nurse-in" title="上針">
                        <option value="">上針</option>
                        <option v-for="team in earlyTeams" :key="team" :value="team">
                          {{ team }}組
                        </option>
                      </select>
                      <select class="nurse-team-select nurse-out" title="收針">
                        <option value="">收針</option>
                        <option v-for="team in allTeams" :key="team" :value="team">
                          {{ team }}組
                        </option>
                      </select>
                    </div>
                    <select v-else class="nurse-team-select">
                      <option value="">-</option>
                      <option
                        v-for="team in shift === '早' ? earlyTeams : lateTeams"
                        :key="team"
                        :value="team"
                      >
                        {{ team }}組
                      </option>
                    </select>
                    <div
                      class="patient-name"
                      @drop="onDrop($event, `bed-${bedNum}-${shift}班`)"
                      @dragover="onDragOver"
                      @dragleave="onDragLeave"
                    >
                      {{ getPatientName(bedNum, shift) }}
                    </div>
                    <div class="patient-tag" contenteditable="true"></div>
                  </div>
                </template>
              </div>
            </div>
            <div class="bed-row"><div class="nursing-station">護理站</div></div>
          </div>
          <div class="aisle">中 央 走 道</div>
          <!-- 右翼 -->
          <div class="right-wing">
            <div
              v-for="(row, rowIndex) in layoutData.rightWingRows"
              :key="`right-${rowIndex}`"
              class="bed-row"
            >
              <div
                v-for="bedNum in row"
                :key="`bed-right-${bedNum}`"
                class="bed"
                :class="{
                  'aisle-side': aisleSideBeds.includes(bedNum),
                  'right-wing-bed': true,
                }"
              >
                <div class="bed-header">床號 {{ bedNum }}</div>
                <template v-if="bedNum !== '空'">
                  <div
                    v-for="shift in SHIFTS"
                    :key="shift"
                    class="shift-row"
                    :class="{ 'split-shift': shift === '午' }"
                  >
                    <div class="shift-label">{{ shift }}</div>
                    <!-- **關鍵修正 2：右翼也加入同樣的 select 邏輯** -->
                    <div v-if="shift === '午'" class="nurse-split-column">
                      <select class="nurse-team-select nurse-in" title="上針">
                        <option value="">上針</option>
                        <option v-for="team in earlyTeams" :key="team" :value="team">
                          {{ team }}組
                        </option>
                      </select>
                      <select class="nurse-team-select nurse-out" title="收針">
                        <option value="">收針</option>
                        <option v-for="team in allTeams" :key="team" :value="team">
                          {{ team }}組
                        </option>
                      </select>
                    </div>
                    <select v-else class="nurse-team-select">
                      <option value="">-</option>
                      <option
                        v-for="team in shift === '早' ? earlyTeams : lateTeams"
                        :key="team"
                        :value="team"
                      >
                        {{ team }}組
                      </option>
                    </select>
                    <div class="patient-name" contenteditable="true">
                      {{ getPatientName(bedNum, shift) }}
                    </div>
                    <div class="patient-tag" contenteditable="true"></div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="extra-sections">
          <div class="peripheral-section">
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div v-for="shift in SHIFTS" :key="shift" class="peripheral-shift-row">
                  <div class="shift-label">{{ shift }}</div>
                  <!-- **關鍵修正 3：為外圍床位加入 select 邏輯** -->
                  <select class="nurse-team-select">
                    <option value="">-</option>
                    <option
                      v-for="team in shift === '早'
                        ? earlyTeams
                        : shift === '晚'
                          ? lateTeams
                          : allTeams"
                      :key="team"
                      :value="team"
                    >
                      {{ team }}組
                    </option>
                  </select>
                  <div class="peripheral-bed-number" contenteditable="true"></div>
                  <div class="peripheral-patient-name" contenteditable="true">
                    {{ getPatientName(`peripheral-${i}`, shift) }}
                  </div>
                  <div class="patient-tag" contenteditable="true"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <InpatientSidebar :patients="allPatients" />
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
.controls-panel button,
.controls-panel input {
  padding: 8px 15px;
  font-size: 1.1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  height: 45px; /* 統一高度 */
  box-sizing: border-box;
}

/* 按鈕的通用樣式 */
.date-navigator button,
.toolbar-center > button {
  /* 也應用於「回到今日」按鈕 */
  padding: 8px 15px;
  font-size: 1.1em;
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
  padding: 60px 0; /* 上下 padding 30px，左右 padding 0 */
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
  transition: background-color 0.2s; /* 增加過渡效果 */
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
.patient-name.drag-over {
  background-color: #c8e6c9; /* 拖曳到上方時的高亮效果 */
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
