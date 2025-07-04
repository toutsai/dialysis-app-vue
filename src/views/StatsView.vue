<!-- 檔案路徑: src/views/StatsView.vue (重構版 - 完整無省略) -->
<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import BedChangeDialog from '@/components/BedChangeDialog.vue'

// 1. 引入我們重構後的所有工具和常量
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'

// --- API 實例 ---
const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')
const memosApi = ApiManager('memos')

// --- 常量 ---
// (可以考慮將這些也移到 constants.js 中)
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
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getPatientDisplayString = (patientDetail) => {
  if (!patientDetail) return ''
  const name = patientDetail.name

  // 2. 使用標準的 note 模型
  const combinedNote = `${patientDetail.autoNote || ''} ${patientDetail.manualNote || ''}`.trim()

  let identifier = ''
  if (patientDetail.shiftId.startsWith('peripheral')) {
    identifier = patientDetail.wardNumber || '外圍'
  } else {
    const parts = patientDetail.shiftId.split('-')
    if (parts.length >= 2) {
      identifier = parts[1]
    }
  }

  const parts = [identifier, name, combinedNote].filter(Boolean)
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

  // 1. 初始化空的組別統計物件
  const earlyShiftStats = {}
  const lateShiftStats = {}

  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      earlyShift: [],
      noonShiftOn: [],
      noonShiftOff: [],
    }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      noonShiftOff: [],
      lateShift: [],
    }
  })

  // 2. 準備輔助資料
  const patientMap = new Map(allPatients.value.map((p) => [p.id, p]))
  const memoMap = new Map()
  allMemos.value.forEach((memo) => {
    if (memo.patientName) {
      if (!memoMap.has(memo.patientName)) memoMap.set(memo.patientName, [])
      memoMap.get(memo.patientName).push(memo.content)
    }
  })

  // 3. 遍歷當日排程，將病人分配到對應組別
  Object.values(currentRecord.schedule).forEach((shiftDetails) => {
    const {
      patientId,
      autoNote,
      manualNote,
      wardNumber,
      nurseTeam,
      nurseTeamIn,
      nurseTeamOut,
      shiftId,
    } = shiftDetails
    if (!patientId) return

    const patient = patientMap.get(patientId)
    if (!patient) return

    const hasMemo = memoMap.has(patient.name)
    let classes = 'patient-item'
    if (patient.status === 'ipd') classes += ' status-ipd'
    else classes += ' status-opd'

    const combinedNote = `${autoNote || ''} ${manualNote || ''}`
    if (combinedNote.includes('抽')) classes += ' tag-chou'
    if (combinedNote.includes('新')) classes += ' tag-new'
    if (combinedNote.includes('兩')) classes += ' tag-liang'
    if (combinedNote.includes('換')) classes += ' tag-huan'
    if (combinedNote.includes('B')) classes += ' tag-b'

    if (hasMemo) classes += ' has-memo'

    const detail = {
      id: patientId,
      shiftId: shiftId,
      name: patient.name,
      autoNote: autoNote || '',
      manualNote: manualNote || '',
      wardNumber: wardNumber || '',
      classes: classes,
    }

    const shiftCode = shiftId.split('-')[2]
    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam]) {
      earlyShiftStats[nurseTeam].earlyShift.push(detail)
    } else if (shiftCode === SHIFT_CODES.LATE && nurseTeam && lateShiftStats[nurseTeam]) {
      // 【核心修正】將 team 改為 nurseTeam
      lateShiftStats[nurseTeam].lateShift.push(detail)
    } else if (shiftCode === SHIFT_CODES.NOON) {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        earlyShiftStats[nurseTeamIn].noonShiftOn.push(detail)
      }
      if (nurseTeamOut) {
        if (earlyShiftStats[nurseTeamOut]) {
          earlyShiftStats[nurseTeamOut].noonShiftOff.push(detail)
        } else if (lateShiftStats[nurseTeamOut]) {
          lateShiftStats[nurseTeamOut].noonShiftOff.push(detail)
        }
      }
    }
  })

  // 4. 對每個組的陣列進行排序
  const sortPatientsByBed = (a, b) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return getSortKey(a.shiftId) - getSortKey(b.shiftId)
  }

  for (const team in earlyShiftStats) {
    earlyShiftStats[team].earlyShift.sort(sortPatientsByBed)
    earlyShiftStats[team].noonShiftOn.sort(sortPatientsByBed)
    earlyShiftStats[team].noonShiftOff.sort(sortPatientsByBed)
  }

  for (const team in lateShiftStats) {
    lateShiftStats[team].noonShiftOff.sort(sortPatientsByBed)
    lateShiftStats[team].lateShift.sort(sortPatientsByBed)
  }

  // 5. 返回最終結果
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
      const record = dailyRecords[0]
      // 標準化 note
      if (record.schedule) {
        const localPatientMap = new Map(patientsData.map((p) => [p.id, p]))
        for (const shiftId in record.schedule) {
          const slot = record.schedule[shiftId]
          if (slot && slot.patientId) {
            const patient = localPatientMap.get(slot.patientId)
            slot.autoNote = patient ? generateAutoNote(patient) : ''
            slot.manualNote = slot.manualNote || ''
          }
        }
      }
      Object.assign(currentRecord, record)
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

async function saveChangesToCloud() {
  if (!currentRecord.id && Object.keys(currentRecord.schedule).length === 0) {
    alert('沒有資料可以儲存。')
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    // 儲存前清理，只保留必要欄位
    const cleanSchedule = {}
    for (const shiftId in currentRecord.schedule) {
      const slot = currentRecord.schedule[shiftId]
      if (slot && slot.patientId) {
        cleanSchedule[shiftId] = {
          patientId: slot.patientId,
          shiftId: slot.shiftId,
          autoNote: slot.autoNote || '',
          manualNote: slot.manualNote || '',
          nurseTeam: slot.nurseTeam || null,
          nurseTeamIn: slot.nurseTeamIn || null,
          nurseTeamOut: slot.nurseTeamOut || null,
          wardNumber: slot.wardNumber || null,
        }
      }
    }

    const dataToSave = {
      date: currentRecord.date,
      schedule: cleanSchedule,
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

// 4. onDrop 邏輯重構
function onDrop(event, newTeam, newResponsibility) {
  event.preventDefault()
  event.currentTarget.classList.remove('drag-over-active')

  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId

  if (!currentRecord.schedule[oldShiftId]) {
    console.error(`拖曳失敗: 找不到原始紀錄 ${oldShiftId}`)
    return
  }

  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }

  // 清除所有舊的護理組指派
  delete movingSlotData.nurseTeam
  delete movingSlotData.nurseTeamIn
  delete movingSlotData.nurseTeamOut

  // 根據新的放置位置，賦予新的主要負責組別
  if (newResponsibility === 'earlyShift') {
    movingSlotData.nurseTeam = newTeam
  } else if (newResponsibility === 'lateShift') {
    movingSlotData.nurseTeam = newTeam
  } else if (newResponsibility === 'noonShiftOn' || newResponsibility === 'noonShiftOff') {
    movingSlotData.nurseTeamIn = newTeam
    // 如果是從午班拖到另一個午班組，保留原有的收針組別
    const oldResponsibility = event.dataTransfer.getData('text/plain')
    if (oldResponsibility.startsWith('noon') && currentRecord.schedule[oldShiftId].nurseTeamOut) {
      movingSlotData.nurseTeamOut = currentRecord.schedule[oldShiftId].nurseTeamOut
    }
  }

  // 決定新的 shiftId
  const bedPart = oldShiftId.split('-').slice(0, 2).join('-')
  let newShiftCode = ''
  if (newResponsibility === 'earlyShift') newShiftCode = SHIFT_CODES.EARLY
  else if (newResponsibility === 'lateShift') newShiftCode = SHIFT_CODES.LATE
  else newShiftCode = SHIFT_CODES.NOON

  const newShiftId = `${bedPart}-${newShiftCode}`

  if (newShiftId !== oldShiftId && currentRecord.schedule[newShiftId]) {
    alert(`錯誤：目標床位 ${newShiftId} 已被佔用！操作取消。`)
    return
  }

  delete currentRecord.schedule[oldShiftId]
  movingSlotData.shiftId = newShiftId
  currentRecord.schedule[newShiftId] = movingSlotData

  setChange()
}

function onDragStart(event, patientDetail, responsibility) {
  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.setData('text/plain', responsibility) // 記錄來源區域
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event) {
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}

// 其他函式...
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

function openBedChangeDialog(patientDetail) {
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

function handleBedChange({ oldShiftId, newShiftId }) {
  if (!oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error('換床失敗，參數無效或找不到舊床位資料。')
    return
  }
  // 換床時，需要更新 slotData 內部的 shiftId
  const patientData = { ...currentRecord.schedule[oldShiftId], shiftId: newShiftId }
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

function triggerPrint() {
  window.print()
}

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
        <button @click="triggerPrint">列印報表</button>
      </div>
    </div>

    <!-- 早班組別 -->
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
                @drop="onDrop($event, teamName, 'earlyShift')"
                @dragover.prevent="onDragOver"
                @dragleave="onDragLeave"
              >
                <span
                  v-for="patient in teamData.earlyShift"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient, 'earlyShift')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
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
                @drop="onDrop($event, teamName, 'noonShiftOn')"
                @dragover.prevent="onDragOver"
                @dragleave="onDragLeave"
              >
                <span
                  v-for="patient in teamData.noonShiftOn"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient, 'noonShiftOn')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
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
                @drop="onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="onDragOver"
                @dragleave="onDragLeave"
              >
                <span
                  v-for="patient in teamData.noonShiftOff"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient, 'noonShiftOff')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  {{ getPatientDisplayString(patient) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 晚班組別 -->
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
                @drop="onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="onDragOver"
                @dragleave="onDragLeave"
              >
                <span
                  v-for="patient in teamData.noonShiftOff"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient, 'noonShiftOff')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
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
                @drop="onDrop($event, teamName, 'lateShift')"
                @dragover.prevent="onDragOver"
                @dragleave="onDragLeave"
              >
                <span
                  v-for="patient in teamData.lateShift"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  draggable="true"
                  @dragstart="onDragStart($event, patient, 'lateShift')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
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
.page-container {
  padding: 20px;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 25px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}
.page-title {
  font-size: 32px;
  color: #333;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.current-date-text {
  font-size: 1.5em;
  font-weight: bold;
  color: #333;
  padding: 0 10px;
}
.weekday-display {
  font-size: 1.5em;
  font-weight: bold;
  color: var(--primary-color);
  margin-left: -5px;
  margin-right: 5px;
}
.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}
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
.toolbar-left button:hover,
.toolbar-right button:not(:disabled):hover {
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
.table-container {
  background-color: #fff;
  padding: 10px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  overflow-x: auto;
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
  min-width: 1200px;
}
.stats-table th,
.stats-table td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
  vertical-align: top;
  font-size: 0.9em;
  word-wrap: break-word;
}
.stats-table th.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  width: 90px;
  position: sticky;
  left: 0;
  z-index: 1;
}
.team-header-cell {
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
.patient-list-cell {
  text-align: left;
  vertical-align: top;
  min-height: 100px;
  padding: 8px;
  transition:
    background-color 0.2s ease-in-out,
    border-color 0.2s ease-in-out;
}
.patient-list-cell.drag-over-active {
  background-color: #e8f5e9;
  border: 2px dashed #4caf50;
}
.assignment-table th.row-header {
  width: 85px;
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
  z-index: 2;
}
.assignment-table th.row-header.sticky-header {
  left: 0;
  z-index: 3;
}
.patient-item {
  display: block;
  padding: 6px 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  border: 1px solid #b0bec5;
  background-color: #f5f5f5; /* 基礎背景色 */
  font-size: 0.95em;
  line-height: 1.4;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
  user-select: none;
}
.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02);
}

/* --- ↓↓↓ 顏色規則核心 (調整順序) ↓↓↓ --- */
/* 優先級最低: 基礎狀態背景色 */
.patient-item.status-opd {
  background-color: var(--green-bg, #e8f5e9);
  border-color: #a5d6a7;
}
.patient-item.status-ipd {
  background-color: var(--red-bg, #ffebee);
  border-color: #ef9a9a;
}

/* 優先級中: 特殊標籤背景色 (會覆蓋 status 顏色) */
.patient-item.tag-b {
  background-color: #fff9c4;
  border-color: #fff59d;
}
.patient-item.tag-liang {
  background-color: #fff3e0;
  border-color: #ffe0b2;
}
.patient-item.tag-huan {
  background-color: #e0f7fa;
  border-color: #b2ebf2;
}
.patient-item.tag-new {
  background-color: #f5ec8e;
  border-color: #e0d567;
}
/* 優先級最高: '抽' 的顏色 (會覆蓋所有其他背景色) */
.patient-item.tag-chou {
  background-color: #658ee0;
  border-color: #42a5f5;
}

/* 額外提示 (不影響背景色) */
.patient-item.has-memo {
  box-shadow: 0 0 0 2px #ef5350; /* 紅色光暈 */
}
</style>
