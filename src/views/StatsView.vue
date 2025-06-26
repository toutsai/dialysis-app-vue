<!-- 檔案路徑: src/views/StatsView.vue (最終完整修正版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

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

// --- 核心狀態 ---
const currentDate = ref(new Date())
const currentRecord = ref(null)
const allPatients = ref([])
const allMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')

// --- 輔助函式 ---
const formatDate = (date) => {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- 計算屬性 ---
const statsData = computed(() => {
  if (!currentRecord.value || !currentRecord.value.schedule) {
    return { early: {}, late: {} }
  }
  const schedule = currentRecord.value.schedule
  const earlyShiftStats = {}
  const lateShiftStats = {}
  baseTeams.forEach((team) => {
    earlyShiftStats[`早${team}`] = { patientDetails: [] }
    lateShiftStats[`晚${team}`] = { patientDetails: [] }
  })
  const patientMap = new Map(allPatients.value.map((p) => [p.id, p]))
  const memoMap = new Map()
  allMemos.value.forEach((memo) => {
    if (memo.patientName) {
      if (!memoMap.has(memo.patientName)) memoMap.set(memo.patientName, [])
      memoMap.get(memo.patientName).push(memo)
    }
  })
  Object.entries(schedule).forEach(([shiftId, shiftDetails]) => {
    const { patientId, nurse } = shiftDetails
    if (!patientId || !nurse) return
    const patient = patientMap.get(patientId)
    if (!patient) return
    const hasMemo = memoMap.has(patient.name)
    let classes = 'patient-item'
    if (patient.status === 'ipd') classes += ' hospitalized'
    if (shiftDetails.tag && shiftDetails.tag.includes('抽')) classes += ' tag-chou'
    if (hasMemo) classes += ' has-memo'
    const detail = {
      id: patientId,
      shiftId: shiftId,
      name: patient.name,
      tag: shiftDetails.tag || '',
      classes: classes,
    }
    if (earlyShiftStats[nurse]) {
      earlyShiftStats[nurse].patientDetails.push(detail)
    } else if (lateShiftStats[nurse]) {
      lateShiftStats[nurse].patientDetails.push(detail)
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
    currentRecord.value = dailyRecords.length > 0 ? dailyRecords[0] : null
    if (currentRecord.value) {
      statusIndicator.value = '資料已載入'
    } else {
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
  // 安全性檢查
  if (!currentRecord.value || !currentRecord.value.id) {
    alert('錯誤：找不到當天的排班記錄可以儲存。')
    return
  }

  // 收集使用者在介面上的修改 (護理師姓名)
  const newNames = {}
  document.querySelectorAll('.name-select').forEach((select) => {
    const teamId = select.dataset.teamId
    if (teamId && select.value) {
      newNames[teamId] = select.value
    }
  })

  // 準備要更新的資料
  // 我們只更新 names，同時保留舊的 schedule 和 date
  const dataToUpdate = {
    date: currentRecord.value.date,
    schedule: currentRecord.value.schedule,
    names: newNames,
  }

  statusIndicator.value = '儲存中...'
  try {
    // 執行更新操作
    await schedulesApi.update(currentRecord.value.id, dataToUpdate)

    // 更新 UI 狀態
    hasUnsavedChanges.value = false
    statusIndicator.value = '變更已儲存'
    alert('變更儲存成功！')

    // 重新載入資料以確保同步
    await loadData(currentDate.value)
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
  }
}

// --- 生命週期鉤子 ---
onMounted(() => {
  loadData(currentDate.value)
})
</script>

<template>
  <div class="page-container">
    <div class="header-section">
      <h1 class="page-title">護理分組檢視</h1>
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="date-navigator">
            <button @click="changeDate(-1)" class="date-nav-btn"><上一天</button>
            <span class="current-date-text">{{ formatDate(currentDate) }}</span>
            <button @click="changeDate(1)" class="date-nav-btn">下一天></button>
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
    </div>

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
              <th class="row-header">姓名</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="team-name-cell"
              >
                <select class="name-select" :data-team-id="teamName" @change="setChange">
                  <option value=""></option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">病人列表</th>
              <td
                v-for="(teamData, teamName) in statsData.early"
                :key="teamName"
                class="patient-list-cell"
              >
                <span
                  v-for="patient in teamData.patientDetails"
                  :key="patient.id"
                  :class="patient.classes"
                  draggable="true"
                >
                  {{ patient.name }}{{ patient.tag ? ` (${patient.tag})` : '' }}
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
              <th class="row-header">姓名</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="team-name-cell"
              >
                <select class="name-select">
                  <option value=""></option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </td>
            </tr>
            <tr>
              <th class="row-header">病人列表</th>
              <td
                v-for="(teamData, teamName) in statsData.late"
                :key="teamName"
                class="patient-list-cell"
              >
                <span
                  v-for="patient in teamData.patientDetails"
                  :key="patient.id"
                  :class="patient.classes"
                  draggable="true"
                >
                  {{ patient.name }}{{ patient.tag ? ` (${patient.tag})` : '' }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 頂部區塊樣式 */
.header-section {
  display: flex; /* 啟用智慧佈局模式*/
  flex-direction: column; /* 讓項目垂直排列 */
  gap: 15px; /* 設定項目之間的間距 */
  margin-bottom: 20px; /*設定整個容器外部下方的間距 */
}
.page-title {
  font-size: 1.8em; /* 字體大小：1.8 倍 */
  color: #333;
  margin: 0; /* 確保沒有外部間距 */
  text-align: left;
}
.toolbar {
  display: flex;
  justify-content: space-between; /* 讓左右兩側的工具欄分開 */
  align-items: center;
  width: 100%;
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
}
.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
}
.toolbar button {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
}
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
#save-changes-btn:disabled {
  background-color: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

/* 表格和內容區塊的樣式 */
.table-container {
  background-color: #fff;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
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
}
.stats-table th,
.stats-table td {
  border: 1px solid #ddd;
  padding: 6px;
  text-align: center;
  vertical-align: middle;
  font-size: 0.85em;
  word-wrap: break-word;
}
.stats-table th.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  width: 80px;
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
}
.name-select:focus {
  outline: 2px solid #fbc02d;
}
.patient-list-cell {
  text-align: left;
  vertical-align: top;
  white-space: pre-wrap;
  min-height: 80px;
}
.patient-item {
  display: block;
  padding: 4px;
  margin-bottom: 4px;
  border-radius: 4px;
  border: 1px solid #ddd;
  cursor: grab;
  background-color: #fff;
}
.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
}
.patient-item.hospitalized {
  background-color: #ffcdd2 !important;
}
.patient-item.has-memo {
  outline: 2px solid #dc3545;
}
</style>
