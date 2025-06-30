<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import BedChangeDialog from '@/components/BedChangeDialog.vue'

// --- API 實例 ---
const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')
const memosApi = ApiManager('memos')

// --- 常量 ---
const nurseNameList = [
  '陳素秋',
  '古孟麗',
  '謝常菁',
  '林玉麗',
  '陳聖柔',
  '田姿瑛',
  '陳韋吟',
  '劉姿秀',
  '劉舒婷',
  '李慈賢',
  '黃羿寧',
  '高佩鳳',
  '林沛儀',
  '李汶娟',
  '陳芃諭',
  '葛孟萍',
  '蘇愛玲',
  '郭芳君',
  '林馨如',
  '賴秋妏',
  '胡國暄',
  '施艾利',
  '陳淑玲',
  '謝慶諭',
  '林佩佳',
  '吳思婷',
  '曾佩君',
  '吳幸美',
]
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = baseTeams.map((t) => `早${t}`)
const lateTeams = baseTeams.map((t) => `晚${t}`)

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const allMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({
  id: null,
  date: '',
  schedule: {},
  names: {},
})

// --- UI 狀態 ---
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null)

// --- 輔助函式 ---
const formatDate = (date) => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPatientDisplayString = (patientDetail) => {
  if (!patientDetail) return ''
  const name = patientDetail.name
  const note = patientDetail.note
  let identifier = ''

  if (patientDetail.shiftId.startsWith('peripheral')) {
    identifier = patientDetail.wardNumber || '外圍'
  } else {
    const parts = patientDetail.shiftId.split('-')
    if (parts.length >= 2) {
      identifier = parts[1]
    }
  }

  const parts = [identifier, name, note].filter(Boolean)
  return parts.join(' - ')
}

// --- 計算屬性 ---
const weekdayDisplay = computed(() => {
  if (!currentDate.value) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const dayIndex = new Date(currentDate.value).getDay()
  return weekdays[dayIndex]
})

const statsData = computed(() => {
  if (!currentRecord.schedule) {
    return { early: {}, late: {} }
  }

  const earlyShiftStats = {}
  const lateShiftStats = {}

  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      早班: [],
      午班上針: [],
      午班收針: [],
    }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      午班收針: [],
      晚班: [],
    }
  })

  const patientMap = new Map(allPatients.value.map((p) => [p.id, p]))
  const memoMap = new Map()
  allMemos.value.forEach((memo) => {
    if (memo.patientName) {
      if (!memoMap.has(memo.patientName)) memoMap.set(memo.patientName, [])
      memoMap.get(memo.patientName).push(memo.content)
    }
  })

  Object.entries(currentRecord.schedule).forEach(([shiftId, shiftDetails]) => {
    const { patientId, note, wardNumber, nurseTeam, nurseTeamIn, nurseTeamOut } = shiftDetails
    if (!patientId) return

    const patient = patientMap.get(patientId)
    if (!patient) return

    const hasMemo = memoMap.has(patient.name)
    let classes = 'patient-item'
    if (patient.status === 'ipd') classes += ' hospitalized'
    if (note && note.includes('抽')) classes += ' tag-chou'
    if (hasMemo) classes += ' has-memo'

    const detail = {
      id: patientId,
      shiftId: shiftId,
      name: patient.name,
      note: note || '',
      classes: classes,
      wardNumber: wardNumber || '',
    }

    const shiftType = shiftId.split('-')[2]

    if (shiftType === '早班' && nurseTeam && earlyShiftStats[nurseTeam]) {
      earlyShiftStats[nurseTeam].早班.push(detail)
    } else if (shiftType === '晚班' && nurseTeam && lateShiftStats[nurseTeam]) {
      lateShiftStats[nurseTeam].晚班.push(detail)
    } else if (shiftType === '午班') {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        earlyShiftStats[nurseTeamIn].午班上針.push(detail)
      }
      if (nurseTeamOut) {
        if (earlyShiftStats[nurseTeamOut]) {
          earlyShiftStats[nurseTeamOut].午班收針.push(detail)
        } else if (lateShiftStats[nurseTeamOut]) {
          lateShiftStats[nurseTeamOut].午班收針.push(detail)
        }
      }
    }
  })
  return { early: earlyShiftStats, late: lateShiftStats }
})

// --- 方法 ---
async function loadData(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  try {
    const [dailyRecords, patientsData, memosData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
      patientsApi.fetchAll(),
      memosApi.fetchAll([where('isResolved', '==', false)]),
    ])
    allPatients.value = patientsData
    allMemos.value = memosData
    if (dailyRecords.length > 0) {
      Object.assign(currentRecord, dailyRecords[0])
      statusIndicator.value = '資料已載入'
    } else {
      Object.assign(currentRecord, { id: null, date: dateStr, schedule: {}, names: {} })
      statusIndicator.value = '本日無排程資料'
    }
  } catch (error) {
    console.error('讀取報表資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

function changeDate(days) {
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
  loadData(newDate)
}

function goToToday() {
  currentDate.value = new Date()
  loadData(currentDate.value)
}

function setChange() {
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function saveChangesToCloud() {
  if (!currentRecord.id && Object.keys(currentRecord.schedule).length === 0) {
    alert('沒有資料可以儲存。')
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule,
      names: currentRecord.names,
    }
    if (currentRecord.id) {
      await schedulesApi.update(currentRecord.id, dataToSave)
    } else {
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id
    }
    hasUnsavedChanges.value = false
    statusIndicator.value = '變更已儲存！'
    alert('變更儲存成功！')
    await loadData(currentDate.value)
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
  }
}

function onDragStart(event, patientDetail) {
  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.effectAllowed = 'move'
}

// 【最新版本】onDrop 函式，支援拖曳換班與換組
function onDrop(event, newTeam, newResponsibility) {
  event.preventDefault()

  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId

  if (!currentRecord.schedule[oldShiftId]) {
    console.error(`拖曳失敗: 找不到原始紀錄 ${oldShiftId}`)
    return
  }

  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
  delete currentRecord.schedule[oldShiftId]

  delete movingSlotData.nurseTeam
  delete movingSlotData.nurseTeamIn
  delete movingSlotData.nurseTeamOut

  let targetShiftId = oldShiftId
  const oldShiftType = oldShiftId.split('-')[2]
  const bedPart = oldShiftId.split('-').slice(0, 2).join('-')

  if (['早班', '晚班'].includes(newResponsibility)) {
    const newShiftType = newResponsibility
    if (oldShiftType !== newShiftType) {
      targetShiftId = `${bedPart}-${newShiftType}`
    }
    movingSlotData.nurseTeam = newTeam
  } else if (newResponsibility === '午班上針') {
    if (oldShiftType !== '午班') {
      targetShiftId = `${bedPart}-午班`
    }
    movingSlotData.nurseTeamIn = newTeam
  } else if (newResponsibility === '午班收針') {
    if (oldShiftType !== '午班') {
      targetShiftId = `${bedPart}-午班`
    }
    movingSlotData.nurseTeamOut = newTeam
  }

  if (currentRecord.schedule[targetShiftId]) {
    alert(`錯誤：目標床位 ${targetShiftId} 已被佔用！操作取消。`)
    currentRecord.schedule[oldShiftId] = movingSlotData // 恢復原狀
    return
  }

  currentRecord.schedule[targetShiftId] = movingSlotData
  setChange()
}

function onDragOver(event) {
  event.preventDefault()
}

function openBedChangeDialog(patientDetail) {
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

function handleBedChange({ oldShiftId, newShiftId }) {
  if (!oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error('換床失敗，參數無效或找不到舊床位資料。')
    return
  }
  const patientData = { ...currentRecord.schedule[oldShiftId] }
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = patientData
  setChange()
  isBedChangeDialogVisible.value = false
}

function handleDialogCancel() {
  isBedChangeDialogVisible.value = false
}

function updateNurseName(teamId, event) {
  if (!currentRecord.names) {
    currentRecord.names = {}
  }
  currentRecord.names[teamId] = event.target.value
  setChange()
}

// --- 生命週期鉤子 ---
onMounted(() => {
  loadData(currentDate.value)
})
</script>

<template>
  <div class="page-container">
    <div class="header-toolbar">
      <div class="toolbar-left">
        <h1 class="page-title">護理分組檢視</h1>
        <div class="date-navigator">
          <button @click="changeDate(-1)" class="date-nav-btn">< 上一天</button>
          <span class="current-date-text">{{ formatDate(currentDate) }}</span>
          <span class="weekday-display">{{ weekdayDisplay }}</span>
          <button @click="changeDate(1)" class="date-nav-btn">下一天 ></button>
          <button @click="goToToday" id="today-btn">回到今日</button>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status-indicator">{{ statusIndicator }}</span>
        <button id="save-changes-btn" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
          儲存變更
        </button>
        <button @click="window.print()">列印報表</button>
      </div>
    </div>

    <!-- ======================= 早班組別 ======================= -->
    <div class="stats-section">
      <h2>早班組別</h2>
      <div class="table-container">
        <table class="stats-table assignment-table">
          <thead>
            <tr>
              <th class="row-header sticky-header"></th>
              <th
                v-for="(_, teamName) in statsData.early"
                :key="teamName"
                class="team-header-cell sticky-header"
              >
                {{ teamName }}組
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th class="row-header">姓名</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="team-name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">早班</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName, '早班')"
                @dragover.prevent
              >
                <span
                  v-for="patient in teamData.早班"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組/換班，點擊我換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
            <tr>
              <th class="row-header">午班(上針)</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName, '午班上針')"
                @dragover.prevent
              >
                <span
                  v-for="patient in teamData.午班上針"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組/換班，點擊我換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
            <tr>
              <th class="row-header">午班(收針)</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName, '午班收針')"
                @dragover.prevent
              >
                <span
                  v-for="patient in teamData.午班收針"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組/換班，點擊我換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ======================= 晚班組別 ======================= -->
    <div class="stats-section">
      <h2>晚班組別</h2>
      <div class="table-container">
        <table class="stats-table assignment-table">
          <thead>
            <tr>
              <th class="row-header sticky-header"></th>
              <th
                v-for="(_, teamName) in statsData.late"
                :key="teamName"
                class="team-header-cell sticky-header"
              >
                {{ teamName }}組
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th class="row-header">姓名</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="team-name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">午班(收針)</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName, '午班收針')"
                @dragover.prevent
              >
                <span
                  v-for="patient in teamData.午班收針"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組/換班，點擊我換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
            <tr>
              <th class="row-header">晚班</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName, '晚班')"
                @dragover.prevent
              >
                <span
                  v-for="patient in teamData.晚班"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組/換班，點擊我換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <BedChangeDialog
      :is-visible="isBedChangeDialogVisible"
      :patient-info="editingPatientInfo"
      :current-schedule="currentRecord.schedule"
      @confirm="handleBedChange"
      @cancel="handleDialogCancel"
    />
  </div>
</template>

<style scoped>
/* ==========================================================================
   1. 頁面佈局與標頭 (Layout & Header)
   ========================================================================== */
.page-container {
  /* 可以根據需要增加整個頁面的內距 */
  padding: 20px;
}

/* 【修改】這是新的主要容器，用 Flexbox 實現水平佈局 */
.header-toolbar {
  display: flex;
  flex-wrap: wrap; /* 在小螢幕上可以換行 */
  justify-content: space-between; /* 讓左右兩側的元素分開 */
  align-items: center; /* 垂直居中對齊 */
  gap: 20px; /* 項目之間的間距 */
  margin-bottom: 25px; /* 與下方內容的間距 */
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px; /* 【修改】將左右兩邊的間距統一為 15px */
}

.page-title {
  font-size: 32px;
  color: #333;
  margin: 0;
  white-space: nowrap; /* 確保標題不斷行 */
}

.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-date-text {
  font-size: 1.5em; /* 稍微放大日期，使其更突出 */
  font-weight: bold;
  color: #333;
  padding: 0 10px;
}

/* 【新增】星期幾的樣式 */
.weekday-display {
  font-size: 1.5em;
  font-weight: bold;
  color: var(--primary-color); /* 使用和系統主題色一致的顏色 */
  margin-left: -5px; /* 和日期稍微靠近一點 */
  margin-right: 5px;
}

.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}

/*
  【核心修正】
  我們不再使用 .toolbar button，而是為所有在頭部的按鈕建立一個更通用的規則。
  這個規則會同時應用到日期導覽按鈕和右側的功能按鈕。
*/
.toolbar-left button,
.toolbar-right button {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  white-space: nowrap;
}

/* 為特定按鈕添加懸浮效果 */
.toolbar-left button:hover,
.toolbar-right button:not(:disabled):hover {
  background-color: #f0f0f0;
}

/* 為「儲存變更」按鈕保留其特殊顏色 */
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}

#save-changes-btn:hover {
  background-color: #43a047;
}

#save-changes-btn:disabled {
  background-color: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
  opacity: 0.7;
}

/* ==========================================================================
   2. 表格與內容區塊 (Table & Content)
   ========================================================================== */
.table-container {
  background-color: #fff;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-x: auto; /* 確保在小螢幕上表格可以水平滾動 */
}

.stats-section {
  margin-bottom: 30px;
}

.stats-section h2 {
  font-size: 1.5em;
  color: #005a9c;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 1200px; /* 給定一個最小寬度以適應滾動 */
}

.stats-table th,
.stats-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
  vertical-align: middle;
  font-size: 0.9em;
  word-wrap: break-word;
}

.stats-table th.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  width: 90px;
  position: sticky; /* 讓標頭在水平滾動時固定 */
  left: 0;
  z-index: 1;
}

.team-header-row td {
  background-color: #e3f2fd;
  font-weight: bold;
}

.team-name-cell {
  padding: 0 !important;
}

.name-select {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #fffde7;
  text-align: center;
  font-size: 1em;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  padding: 8px;
}

.name-select:focus {
  outline: 2px solid #fbc02d;
}

/* ==========================================================================
   3. 互動元素樣式 (Interactive Elements) - 【核心修改區】
   ========================================================================== */

/* 病人列表儲存格 (可放置的區域) */
.patient-list-cell {
  text-align: left;
  vertical-align: top;
  min-height: 100px; /* 增加最小高度確保有足夠的放置空間 */
  padding: 8px;
  transition:
    background-color 0.2s ease-in-out,
    border-color 0.2s ease-in-out;
}

/* 【新增】當有項目被拖到上方時的樣式 (需配合JS動態添加屬性) */
.patient-list-cell[data-drag-over='true'] {
  background-color: #e8f5e9; /* 淡綠色背景 */
  border: 2px dashed #4caf50;
}

/* 【新增】針對新的 assignment-table 的樣式 */
.assignment-table {
  border: 1px solid #ddd;
}

.assignment-table th.row-header {
  width: 100px; /* 加寬一點以容納 "午班(上針)" */
  background-color: #f8f9fa;
  font-weight: 600;
  vertical-align: middle;
}

.assignment-table .team-header-cell {
  background-color: #e3f2fd;
  font-weight: 600;
}

.assignment-table .sticky-header {
  position: sticky;
  top: 0;
  z-index: 2; /* 確保在滾動時蓋過內容 */
}

.assignment-table th.row-header.sticky-header {
  left: 0;
  z-index: 3; /* 左側標頭的層級最高 */
}

.patient-list-cell {
  vertical-align: top;
  padding: 8px;
  min-height: 60px; /* 可以根據需要調整最小高度 */
  height: 100%;
}

.patient-item {
  /* ... patient-item 的樣式保持不變 ... */
  display: block;
  padding: 6px 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  border: 1px solid #b0bec5;
  background-color: #f5f5f5;
  font-size: 0.95em;
  line-height: 1.4;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  user-select: none;
}

/* 【修改】拖曳開始時的樣式 */
.patient-item:active {
  cursor: grabbing; /* 提示正在拖曳 */
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02); /* 輕微放大 */
}

/* 特殊狀態的病人卡片樣式 */
.patient-item.hospitalized {
  background-color: #ffcdd2 !important; /* 住院病人用淡紅色 */
  border-color: #e57373;
}

.patient-item.has-memo {
  /* 使用 box-shadow 來建立輪廓，避免影響佈局 */
  box-shadow: 0 0 0 2px #ef5350;
}

.patient-item.tag-chou {
  border-left: 4px solid #42a5f5; /* 抽血用藍色左邊框 */
}
</style>
