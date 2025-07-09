<!-- 檔案路徑: src/views/StatsView.vue (最終修正版) -->
<script setup>
import { ref, onMounted, computed, reactive, watch } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import BedChangeDialog from '@/components/BedChangeDialog.vue'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
// 【1. 引入 useAuth】
import { useAuth } from '@/composables/useAuth.js'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'

// --- API 實例 (保持不變) ---
const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')
const memosApi = ApiManager('memos')

// --- 常量 (保持不變) ---
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
  '陳芃諭',
  '葛孟萍',
  '蘇愛玲',
  '郭芳君',
  '林馨如',
  '胡國暄',
  '施艾利',
  '陳淑玲',
  '謝慶諭',
  '林佩佳',
  '吳思婷',
  '吳幸美',
]
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = baseTeams.map((t) => `早${t}`)
const lateTeams = baseTeams.map((t) => `晚${t}`)

// --- 核心狀態 (保持不變) ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })

// --- UI 狀態 (保持不變) ---
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const activeTab = ref('early')

// 【2. 從 useAuth 獲取新的權限屬性】
const { isEditor } = useAuth()

// 【3. 修改 isPageLocked 的邏輯】
// 頁面是否鎖定，取決於使用者是否「不是」核心編輯者 (admin/editor)
const isPageLocked = computed(() => {
  if (!isEditor.value) {
    return true
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return currentDate.value < today
})

// --- Helper Functions & 計算屬性 (保持不變) ---
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
  const autoTags = (patientDetail.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (patientDetail.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  const noteString = finalTags.join(' ')
  let identifier = ''
  if (patientDetail.shiftId.startsWith('peripheral')) {
    identifier = patientDetail.wardNumber || '外圍'
  } else {
    const parts = patientDetail.shiftId.split('-')
    if (parts.length >= 2) {
      identifier = parts[1]
    }
  }
  const displayParts = [identifier, name]
  if (patientDetail.mode && patientDetail.mode !== 'HD') {
    const modeTag = `<span class="stats-special-mode">${patientDetail.mode}</span>`
    displayParts.push(modeTag)
  }
  if (noteString) {
    displayParts.push(noteString)
  }
  return displayParts.join(' - ')
}

const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)

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
      earlyShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOn: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      lateShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })
  const patientMap = new Map(allPatients.value.map((p) => [p.id, p]))

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
    const detail = {
      id: patientId,
      shiftId: shiftId,
      name: patient.name,
      status: patient.status,
      mode: patient.mode,
      autoNote: autoNote || '',
      manualNote: manualNote || '',
      wardNumber: wardNumber || '',
      classes: 'patient-item',
    }
    if (patient.status === 'er') detail.classes += ' status-er'
    else if (patient.status === 'ipd') detail.classes += ' status-ipd'
    else detail.classes += ' status-opd'
    const combinedNote = [
      ...new Set([
        ...(autoNote || '').split(' ').filter(Boolean),
        ...(manualNote || '').split(' ').filter(Boolean),
      ]),
    ].join(' ')
    if (combinedNote) detail.classes += ' has-note-highlight'
    if (combinedNote.includes('抽')) detail.classes += ' tag-chou'
    if (combinedNote.includes('新')) detail.classes += ' tag-new'
    if (combinedNote.includes('兩')) detail.classes += ' tag-liang'
    if (combinedNote.includes('換')) detail.classes += ' tag-huan'
    if (combinedNote.includes('B')) detail.classes += ' tag-b'

    const assignAndCount = (group, patientDetail) => {
      group.patients.push(patientDetail)
      if (patientDetail.status === 'ipd') {
        group.ipdCount++
      } else if (patientDetail.status === 'er') {
        group.erCount++
      } else {
        group.opdCount++
      }
    }
    const shiftCode = shiftId.split('-')[2]
    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam]) {
      assignAndCount(earlyShiftStats[nurseTeam].earlyShift, detail)
    } else if (shiftCode === SHIFT_CODES.LATE && nurseTeam && lateShiftStats[nurseTeam]) {
      assignAndCount(lateShiftStats[nurseTeam].lateShift, detail)
    } else if (shiftCode === SHIFT_CODES.NOON) {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        assignAndCount(earlyShiftStats[nurseTeamIn].noonShiftOn, detail)
      }
      if (nurseTeamOut) {
        if (earlyShiftStats[nurseTeamOut]) {
          assignAndCount(earlyShiftStats[nurseTeamOut].noonShiftOff, detail)
        } else if (lateShiftStats[nurseTeamOut]) {
          assignAndCount(lateShiftStats[nurseTeamOut].noonShiftOff, detail)
        }
      }
    }
  })
  const sortPatientsByBed = (a, b) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10)
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return getSortKey(a.shiftId) - getSortKey(b.shiftId)
  }
  for (const team in earlyShiftStats) {
    Object.values(earlyShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
  }
  for (const team in lateShiftStats) {
    Object.values(lateShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
  }
  for (const team in earlyShiftStats) {
    const teamData = earlyShiftStats[team]
    teamData.totalOpdCount =
      teamData.earlyShift.opdCount + teamData.noonShiftOn.opdCount + teamData.noonShiftOff.opdCount
    teamData.totalIpdCount =
      teamData.earlyShift.ipdCount + teamData.noonShiftOn.ipdCount + teamData.noonShiftOff.ipdCount
    teamData.totalErCount =
      teamData.earlyShift.erCount + teamData.noonShiftOn.erCount + teamData.noonShiftOff.erCount
  }
  for (const team in lateShiftStats) {
    const teamData = lateShiftStats[team]
    teamData.totalOpdCount = teamData.lateShift.opdCount + teamData.noonShiftOff.opdCount
    teamData.totalIpdCount = teamData.lateShift.ipdCount + teamData.noonShiftOff.ipdCount
    teamData.totalErCount = teamData.lateShift.erCount + teamData.noonShiftOff.erCount
  }
  return { early: earlyShiftStats, late: lateShiftStats }
})

// --- 方法 (所有函式保持不變，因為它們內部都有 isPageLocked 的檢查) ---
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && !memo.isResolved,
  )
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

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
    activeMemos.value = memosData
    if (dailyRecords.length > 0) {
      const record = dailyRecords[0]
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

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alert('操作被鎖定：無法儲存或權限不足。')
    return
  }
  if (!currentRecord.id && Object.keys(currentRecord.schedule).length === 0) {
    alert('沒有資料可以儲存。')
    return
  }
  statusIndicator.value = '儲存中...'
  try {
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

function onDrop(event, newTeam, newResponsibility) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.remove('drag-over-active')
  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId
  if (!oldShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error(`拖曳失敗: 找不到原始紀錄 ${oldShiftId}`)
    return
  }
  const oldShiftIdParts = oldShiftId.split('-')
  const bedPart = oldShiftIdParts.slice(0, -1).join('-')
  let newShiftCode
  if (newResponsibility === 'earlyShift') {
    newShiftCode = SHIFT_CODES.EARLY
  } else if (newResponsibility === 'lateShift') {
    newShiftCode = SHIFT_CODES.LATE
  } else {
    newShiftCode = SHIFT_CODES.NOON
  }
  const newShiftId = `${bedPart}-${newShiftCode}`
  if (newShiftId !== oldShiftId && currentRecord.schedule[newShiftId]) {
    alert(`錯誤：目標床位 ${newShiftId.replace('bed-', '')} 在目標班次已被佔用！操作取消。`)
    return
  }
  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
  movingSlotData.shiftId = newShiftId
  delete movingSlotData.nurseTeam
  delete movingSlotData.nurseTeamIn
  delete movingSlotData.nurseTeamOut
  if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
    movingSlotData.nurseTeam = newTeam
  } else if (newResponsibility === 'noonShiftOn') {
    movingSlotData.nurseTeamIn = newTeam
    const oldResponsibility = event.dataTransfer.getData('text/plain')
    if (oldResponsibility.startsWith('noon') && currentRecord.schedule[oldShiftId].nurseTeamOut) {
      movingSlotData.nurseTeamOut = currentRecord.schedule[oldShiftId].nurseTeamOut
    }
  } else if (newResponsibility === 'noonShiftOff') {
    movingSlotData.nurseTeamOut = newTeam
    const oldResponsibility = event.dataTransfer.getData('text/plain')
    if (oldResponsibility.startsWith('noon') && currentRecord.schedule[oldShiftId].nurseTeamIn) {
      movingSlotData.nurseTeamIn = currentRecord.schedule[oldShiftId].nurseTeamIn
    }
  }
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = movingSlotData
  setChange()
}

function onDragStart(event, patientDetail, responsibility) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.setData('text/plain', responsibility)
  event.dataTransfer.effectAllowed = 'move'
}

function openBedChangeDialog(patientDetail) {
  if (isPageLocked.value) return
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

function handleBedChange({ oldShiftId, newShiftId }) {
  if (isPageLocked.value) return
  if (!oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error('換床失敗，參數無效或找不到舊床位資料。')
    return
  }
  const patientData = { ...currentRecord.schedule[oldShiftId], shiftId: newShiftId }
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = patientData
  setChange()
  isBedChangeDialogVisible.value = false
}

function updateNurseName(teamId, event) {
  if (isPageLocked.value) {
    event.target.value = currentRecord.names?.[teamId] || ''
    return
  }
  if (!currentRecord.names) {
    currentRecord.names = {}
  }
  currentRecord.names[teamId] = event.target.value
  setChange()
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    if (!confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  }
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
}

function goToToday() {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    if (!confirm('您有未儲存的變更，確定要切換到今天嗎？')) return
  }
  currentDate.value = new Date()
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}
function handleDialogCancel() {
  isBedChangeDialogVisible.value = false
}
function triggerPrint() {
  window.print()
}

onMounted(() => {
  loadData(currentDate.value)
})
watch(currentDate, (newDate) => {
  loadData(newDate)
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
        <button
          id="save-changes-btn"
          :disabled="!hasUnsavedChanges || isPageLocked"
          @click="saveChangesToCloud"
        >
          儲存變更
        </button>
        <button @click="triggerPrint">列印報表</button>
      </div>
    </div>

    <div class="tabs-container">
      <button
        class="tab-button"
        :class="{ active: activeTab === 'early' }"
        @click="activeTab = 'early'"
      >
        早班組別
      </button>
      <button
        class="tab-button"
        :class="{ active: activeTab === 'late' }"
        @click="activeTab = 'late'"
      >
        晚班組別
      </button>
    </div>

    <div v-if="activeTab === 'early'" class="stats-section" :class="{ 'is-locked': isPageLocked }">
      <h2>早班組別</h2>
      <div class="grid-container">
        <div class="grid-header">
          <div class="row-header"></div>
          <div v-for="(_, teamName) in statsData.early" :key="teamName" class="team-header-cell">
            {{ teamName }}組
          </div>
        </div>
        <div class="grid-body">
          <div class="grid-row">
            <div class="row-header">姓名</div>
            <div
              v-for="(teamData, teamName) in statsData.early"
              :key="teamName"
              class="grid-cell name-cell"
            >
              <select
                :value="teamData.nurseName"
                @change="updateNurseName(teamName, $event)"
                class="name-select"
                :disabled="isPageLocked"
              >
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
          </div>
          <div class="grid-row">
            <div class="row-header">早班</div>
            <div
              v-for="(teamData, teamName) in statsData.early"
              :key="teamName"
              class="grid-cell patient-list-cell"
              @drop="onDrop($event, teamName, 'earlyShift')"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
            >
              <div class="patient-wrapper">
                <div
                  v-for="patient in teamData.earlyShift.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="!isPageLocked"
                  @dragstart="onDragStart($event, patient, 'earlyShift')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  <span v-html="getPatientDisplayString(patient)"></span>
                  <span
                    v-if="patientWithMemoIds.has(patient.id)"
                    class="memo-icon-inline"
                    @click.stop="showPatientMemos(patient.id)"
                    title="有交班事項"
                    >📝</span
                  >
                </div>
              </div>
            </div>
          </div>
          <div class="grid-row">
            <div class="row-header">午班(上針)</div>
            <div
              v-for="(teamData, teamName) in statsData.early"
              :key="teamName"
              class="grid-cell patient-list-cell"
              @drop="onDrop($event, teamName, 'noonShiftOn')"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
            >
              <div class="patient-wrapper">
                <div
                  v-for="patient in teamData.noonShiftOn.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="!isPageLocked"
                  @dragstart="onDragStart($event, patient, 'noonShiftOn')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  <span v-html="getPatientDisplayString(patient)"></span>
                  <span
                    v-if="patientWithMemoIds.has(patient.id)"
                    class="memo-icon-inline"
                    @click.stop="showPatientMemos(patient.id)"
                    title="有交班事項"
                    >📝</span
                  >
                </div>
              </div>
            </div>
          </div>
          <div class="grid-row">
            <div class="row-header">午班(收針)</div>
            <div
              v-for="(teamData, teamName) in statsData.early"
              :key="teamName"
              class="grid-cell patient-list-cell"
              @drop="onDrop($event, teamName, 'noonShiftOff')"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
            >
              <div class="patient-wrapper">
                <div
                  v-for="patient in teamData.noonShiftOff.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="!isPageLocked"
                  @dragstart="onDragStart($event, patient, 'noonShiftOff')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  <span v-html="getPatientDisplayString(patient)"></span>
                  <span
                    v-if="patientWithMemoIds.has(patient.id)"
                    class="memo-icon-inline"
                    @click.stop="showPatientMemos(patient.id)"
                    title="有交班事項"
                    >📝</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="grid-footer">
          <div class="row-header">照護人數</div>
          <div
            v-for="(teamData, teamName) in statsData.early"
            :key="teamName"
            class="total-count-summary"
          >
            門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
              teamData.totalErCount
            }}
          </div>
        </div>
      </div>
    </div>

    <div v-if="activeTab === 'late'" class="stats-section" :class="{ 'is-locked': isPageLocked }">
      <h2>晚班組別</h2>
      <div class="grid-container">
        <div class="grid-header">
          <div class="row-header"></div>
          <div v-for="(_, teamName) in statsData.late" :key="teamName" class="team-header-cell">
            {{ teamName }}組
          </div>
        </div>
        <div class="grid-body">
          <div class="grid-row">
            <div class="row-header">姓名</div>
            <div
              v-for="(teamData, teamName) in statsData.late"
              :key="teamName"
              class="grid-cell name-cell"
            >
              <select
                :value="teamData.nurseName"
                @change="updateNurseName(teamName, $event)"
                class="name-select"
                :disabled="isPageLocked"
              >
                <option value="">-- 未指派 --</option>
                <option v-for="name in nurseNameList" :key="name" :value="name">{{ name }}</option>
              </select>
            </div>
          </div>
          <div class="grid-row">
            <div class="row-header">午班(收針)</div>
            <div
              v-for="(teamData, teamName) in statsData.late"
              :key="teamName"
              class="grid-cell patient-list-cell"
              @drop="onDrop($event, teamName, 'noonShiftOff')"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
            >
              <div class="patient-wrapper">
                <div
                  v-for="patient in teamData.noonShiftOff.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="!isPageLocked"
                  @dragstart="onDragStart($event, patient, 'noonShiftOff')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  <span v-html="getPatientDisplayString(patient)"></span>
                  <span
                    v-if="patientWithMemoIds.has(patient.id)"
                    class="memo-icon-inline"
                    @click.stop="showPatientMemos(patient.id)"
                    title="有交班事項"
                    >📝</span
                  >
                </div>
              </div>
            </div>
          </div>
          <div class="grid-row">
            <div class="row-header">晚班</div>
            <div
              v-for="(teamData, teamName) in statsData.late"
              :key="teamName"
              class="grid-cell patient-list-cell"
              @drop="onDrop($event, teamName, 'lateShift')"
              @dragover.prevent="onDragOver"
              @dragleave="onDragLeave"
            >
              <div class="patient-wrapper">
                <div
                  v-for="patient in teamData.lateShift.patients"
                  :key="patient.shiftId"
                  :class="patient.classes"
                  :draggable="!isPageLocked"
                  @dragstart="onDragStart($event, patient, 'lateShift')"
                  @click="openBedChangeDialog(patient)"
                  title="拖曳換組/班，點擊換床"
                >
                  <span v-html="getPatientDisplayString(patient)"></span>
                  <span
                    v-if="patientWithMemoIds.has(patient.id)"
                    class="memo-icon-inline"
                    @click.stop="showPatientMemos(patient.id)"
                    title="有交班事項"
                    >📝</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="grid-footer">
          <div class="row-header">照護人數</div>
          <div
            v-for="(teamData, teamName) in statsData.late"
            :key="teamName"
            class="total-count-summary"
          >
            門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
              teamData.totalErCount
            }}
          </div>
        </div>
      </div>
    </div>

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />

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
.tabs-container {
  display: flex;
  border-bottom: 2px solid #e0e0e0;
  margin-top: 15px;
  margin-bottom: 20px;
}
.tab-button {
  padding: 10px 20px;
  font-size: 1.1em;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background-color: transparent;
  color: #757575;
  border-bottom: 3px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s ease-in-out;
}
.tab-button:hover {
  color: #333;
}
.tab-button.active {
  color: var(--primary-color, #005a9c);
  border-bottom-color: var(--primary-color, #005a9c);
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 20px;
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
  gap: 5px;
}
.current-date-text {
  font-size: 26px;
  font-weight: bold;
  color: #333;
  padding: 0 10px;
}
.weekday-display {
  font-size: 26px;
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
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
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
.grid-container {
  display: grid;
  grid-template-columns: 90px repeat(12, 1fr);
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.grid-header,
.grid-body,
.grid-footer {
  display: contents;
}
.grid-row {
  display: contents;
}
.row-header,
.team-header-cell,
.grid-cell,
.total-count-summary {
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 8px;
  word-wrap: break-word;
}
.grid-container div:nth-child(13n) {
  border-right: none;
}
.grid-footer > div {
  border-bottom: none;
}
.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  text-align: center;
  position: sticky;
  left: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.team-header-cell {
  background-color: #e3f2fd;
  font-weight: bold;
  text-align: center;
}
.name-cell {
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
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  text-align: left;
  vertical-align: top;
  min-height: 120px;
  transition: background-color 0.2s;
}
.patient-list-cell.drag-over-active {
  background-color: #e8f5e9;
  border: 2px dashed #4caf50;
}
.patient-wrapper {
  flex-grow: 1;
}
.total-count-summary {
  background-color: #f8f9fa;
  font-weight: bold;
  text-align: center;
  color: #333;
  padding: 10px 8px;
}
.patient-item {
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
.patient-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02);
}

.patient-item.has-memo {
  box-shadow: 0 0 0 2px #ef5350;
}
.patient-item.status-opd {
  background-color: var(--green-bg, #e8f5e9);
  border-color: #a5d6a7;
}
.patient-item.status-ipd {
  background-color: var(--red-bg, #ffebee);
  border-color: #ef9a9a;
}
.patient-item.status-er {
  background-color: var(--purple-bg, #f3e5f5);
  border-color: #ce93d8;
}
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
.patient-item.tag-chou {
  background-color: #8cbdf6;
  border-color: #42a5f5;
}
.patient-item.has-note-highlight {
  color: #c62828;
  font-weight: bold;
}

:deep(.stats-special-mode) {
  display: inline-block;
  vertical-align: middle;
  padding: 1px 5px;
  background-color: var(--red-bg, #ffebee);
  color: #c62828;
  border: 1px solid #ef9a9a;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.8em;
  line-height: 1.2;
}

.is-locked button:not([@click='triggerPrint']) {
  opacity: 0.65;
  pointer-events: none;
}
.is-locked .stats-section {
  cursor: not-allowed;
}
.is-locked .patient-list-cell {
  background-color: #f5f5f5;
}
.is-locked .patient-item,
.is-locked .name-select {
  pointer-events: none;
}
.is-locked .name-select {
  background-color: #eeeeee;
}

.memo-icon-inline {
  cursor: pointer;
  margin-left: 8px;
  font-size: 1.2em;
  transition: transform 0.2s;
  flex-shrink: 0;
}
.memo-icon-inline:hover {
  transform: scale(1.3);
}
</style>
