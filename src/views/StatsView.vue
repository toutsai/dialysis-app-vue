<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
// 【新增】引入未來要建立的換床對話框元件
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
// 【修改】使用 reactive 來管理整個排班記錄，以便於深度修改
const currentRecord = reactive({
  id: null,
  date: '',
  schedule: {},
  names: {}, // 保留 names 欄位以儲存護理師姓名
})

// --- UI 狀態 ---
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null) // 儲存正在編輯床位的病患資訊

// --- 輔助函式 ---
const formatDate = (date) => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- 計算屬性 ---
const statsData = computed(() => {
  // 【修改】直接從 reactive 的 currentRecord.schedule 判斷
  if (!currentRecord.schedule) {
    return { early: {}, late: {} }
  }

  // 初始化統計物件
  const earlyShiftStats = {}
  const lateShiftStats = {}
  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = { patientDetails: [] }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = { patientDetails: [] }
  })

  const patientMap = new Map(allPatients.value.map((p) => [p.id, p]))
  const memoMap = new Map()
  allMemos.value.forEach((memo) => {
    if (memo.patientName) {
      if (!memoMap.has(memo.patientName)) memoMap.set(memo.patientName, [])
      memoMap.get(memo.patientName).push(memo.content)
    }
  })

  // 【修改】直接遍歷完整的 schedule 物件
  Object.entries(currentRecord.schedule).forEach(([shiftId, shiftDetails]) => {
    // 【修改】從 shiftDetails 中取得 nurseTeam
    const { patientId, nurseTeam, note } = shiftDetails
    if (!patientId || !nurseTeam) return

    const patient = patientMap.get(patientId)
    if (!patient) return

    const hasMemo = memoMap.has(patient.name)
    let classes = 'patient-item'
    if (patient.status === 'ipd') classes += ' hospitalized'
    if (note && note.includes('抽')) classes += ' tag-chou'
    if (hasMemo) classes += ' has-memo'

    // 【修改】儲存更完整的資訊，以便後續拖曳和點擊操作
    const detail = {
      id: patientId,
      shiftId: shiftId, // 關鍵：記下病人的原始床位ID
      name: patient.name,
      note: note || '',
      classes: classes,
    }

    if (earlyShiftStats[nurseTeam]) {
      earlyShiftStats[nurseTeam].patientDetails.push(detail)
    } else if (lateShiftStats[nurseTeam]) {
      lateShiftStats[nurseTeam].patientDetails.push(detail)
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

    // 【修改】使用 Object.assign 將載入的資料合併到 reactive 物件中
    if (dailyRecords.length > 0) {
      Object.assign(currentRecord, dailyRecords[0])
      statusIndicator.value = '資料已載入'
    } else {
      // 如果當天沒有記錄，則重設為空狀態
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
    // 【修改】直接儲存整個修改後的 currentRecord
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule,
      names: currentRecord.names, // 也一併儲存護理師姓名
    }

    if (currentRecord.id) {
      await schedulesApi.update(currentRecord.id, dataToSave)
    } else {
      // 如果本日原先是空的，但被加入了排班，則需要新建文件
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id // 更新 ID 以便後續儲存
    }

    hasUnsavedChanges.value = false
    statusIndicator.value = '變更已儲存！'
    alert('變更儲存成功！')
    await loadData(currentDate.value) // 重新載入以確保狀態同步
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
  }
}

// --- 【新增】拖曳功能函式 ---
function onDragStart(event, patientDetail) {
  // 將病人完整資訊序列化後放入 dataTransfer
  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, newTeamName) {
  event.preventDefault()
  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))

  const originalShiftId = patientDetail.shiftId
  if (currentRecord.schedule[originalShiftId]) {
    // 直接修改 reactive 物件中的 nurseTeam
    currentRecord.schedule[originalShiftId].nurseTeam = newTeamName
    setChange()
  } else {
    console.warn(`拖曳失敗：在 schedule 中找不到 ${originalShiftId}`)
  }
}

function onDragOver(event) {
  event.preventDefault() // 這是觸發 onDrop 的必要條件
}

// --- 【新增】處理床位變更的函式 ---
function openBedChangeDialog(patientDetail) {
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

function handleBedChange({ oldShiftId, newShiftId }) {
  if (!oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error('換床失敗，參數無效或找不到舊床位資料。')
    return
  }

  // 複製舊床位的資料
  const patientData = { ...currentRecord.schedule[oldShiftId] }

  // 賦值到新床位
  currentRecord.schedule[newShiftId] = patientData

  // 刪除舊床位的資料
  delete currentRecord.schedule[oldShiftId]

  setChange()
  isBedChangeDialogVisible.value = false
}

function handleDialogCancel() {
  isBedChangeDialogVisible.value = false
}

// 【新增】更新護理師姓名的函式
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
    <header class="header-section">
      <h1 class="page-title">護理分組檢視 (可操作)</h1>
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="date-navigator">
            <button @click="changeDate(-1)" class="date-nav-btn">< 上一天</button>
            <span class="current-date-text">{{ formatDate(currentDate) }}</span>
            <button @click="changeDate(1)" class="date-nav-btn">下一天 ></button>
          </div>
          <button @click="goToToday" id="today-btn">回到今日</button>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <button id="save-changes-btn" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存變更
          </button>
          <button @click="window.print()">列印報表</button>
        </div>
      </div>
    </header>

    <div class="stats-section">
      <h2>早班組別</h2>
      <div class="table-container">
        <table class="stats-table">
          <tbody>
            <tr class="team-header-row">
              <th class="row-header"></th>
              <td v-for="(_, teamName) in statsData.early" :key="teamName">{{ teamName }}組</td>
            </tr>
            <tr>
              <th class="row-header">護理師</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="team-name-cell"
              >
                <!-- 【修改】綁定值和事件，使其可儲存 -->
                <select
                  class="name-select"
                  :value="currentRecord.names && currentRecord.names[teamName]"
                  @change="updateNurseName(teamName, $event)"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">病人列表</th>
              <!-- 【修改】增加 drop 和 dragover 事件 -->
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName)"
                @dragover.prevent="onDragOver"
              >
                <!-- 【修改】增加 draggable, @dragstart 和 @click 事件 -->
                <span
                  v-for="patient in teamData.patientDetails"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組，點擊我換床"
                >
                  {{ patient.name }}{{ patient.note ? ` (${patient.note})` : '' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="stats-section">
      <h2>晚班組別</h2>
      <div class="table-container">
        <table class="stats-table">
          <tbody>
            <tr class="team-header-row">
              <th class="row-header"></th>
              <td v-for="(_, teamName) in statsData.late" :key="teamName">{{ teamName }}組</td>
            </tr>
            <tr>
              <th class="row-header">護理師</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="team-name-cell"
              >
                <!-- 【修改】綁定值和事件，使其可儲存 -->
                <select
                  class="name-select"
                  :value="currentRecord.names && currentRecord.names[teamName]"
                  @change="updateNurseName(teamName, $event)"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">病人列表</th>
              <!-- 【修改】增加 drop 和 dragover 事件 -->
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="patient-list-cell"
                @drop="onDrop($event, teamName)"
                @dragover.prevent="onDragOver"
              >
                <!-- 【修改】增加 draggable, @dragstart 和 @click 事件 -->
                <span
                  v-for="patient in teamData.patientDetails"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient)"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳我換組，點擊我換床"
                >
                  {{ patient.name }}{{ patient.note ? ` (${patient.note})` : '' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 【新增】放置新的對話框元件 -->
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

.header-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 25px;
}

.page-title {
  font-size: 32px;
  color: #333;
  margin: 0;
  text-align: left;
}

.toolbar {
  display: flex;
  flex-wrap: wrap; /* 允許在小螢幕上換行 */
  justify-content: space-between;
  align-items: center;
  width: 100%;
  gap: 10px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 15px;
}

.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-date-text {
  font-size: 1.2em;
  font-weight: bold;
  color: #333;
  white-space: nowrap;
}

.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}

.toolbar button {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.toolbar button:hover {
  background-color: #f0f0f0;
}

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

/* 病人卡片 (可拖曳、可點擊的項目) */
.patient-item {
  display: block;
  padding: 6px 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  border: 1px solid #b0bec5;
  background-color: #f5f5f5;
  font-size: 0.95em;
  line-height: 1.4;

  /* 【修改】互動提示樣式 */
  cursor: pointer; /* 提示可點擊 */
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  user-select: none; /* 防止拖曳時選中文本 */
}

/* 【新增】滑鼠懸浮時的視覺回饋 */
.patient-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
  border-color: #78909c;
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
