<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { watch } from 'vue' // 確保引入了 watch

// 1. 引入所有需要的子元件和工具函式
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'

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
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = baseTeams.map((t) => `早${t}`)
const lateTeams = baseTeams.map((t) => `晚${t}`)
const allTeams = [...earlyTeams, ...lateTeams]
const STYLE_PRIORITY = {
  抽: { class: 'tag-chou' },
  新: { class: 'tag-new' },
  住: { class: 'tag-ip' },
  換: { class: 'tag-huan' },
  兩: { class: 'tag-liang' },
  B: { class: 'tag-b' },
  隔: { class: 'tag-ip' },
  R: { class: 'tag-ip' },
}
const freqToDays = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
  每周一次: [0, 1, 2, 3, 4, 5, 6],
  臨時: [],
}

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const searchInput = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const copySourceDate = ref(formatDate(new Date()))

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentEditingShiftId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

// --- Helper Functions ---
function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)

const shiftPatientCount = computed(() => {
  const counts = { 早班: 0, 午班: 0, 晚班: 0 }
  if (currentRecord.schedule) {
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const shiftId = slotData.shiftId || ''
        if (shiftId.endsWith('早')) counts['早班']++
        else if (shiftId.endsWith('午')) counts['午班']++
        else if (shiftId.endsWith('晚')) counts['晚班']++
      }
    }
  }
  return counts
})

const statsToolbarData = computed(() => [{ counts: shiftPatientCount.value }])
const statsToolbarWeekdays = computed(() => ['本日'])
const scheduledPatientIds = computed(() => {
  if (!currentRecord.schedule) return new Set()
  return new Set(
    Object.values(currentRecord.schedule)
      .filter((slot) => slot && slot.patientId)
      .map((slot) => slot.patientId),
  )
})
const inpatientList = computed(() =>
  allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted),
)

// --- 方法 ---
function sanitizeShiftId(rawShiftId) {
  if (typeof rawShiftId !== 'string') return ''
  return rawShiftId.replace('班', '')
}

function setChange() {
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient.freq) return false
  const scheduledDays = freqToDays[patient.freq]
  return scheduledDays ? scheduledDays.includes(dayOfWeek) : false
}

function runScheduleCheck() {
  const warnings = []
  const dayOfWeek = currentDate.value.getDay()
  const todayScheduledPatientIds = new Set()
  const duplicateNames = new Set()

  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot && slot.patientId) {
      if (todayScheduledPatientIds.has(slot.patientId)) {
        const patientName = patientMap.value.get(slot.patientId)?.name
        if (patientName) duplicateNames.add(patientName)
      }
      todayScheduledPatientIds.add(slot.patientId)
    }
  })

  if (duplicateNames.size > 0) {
    warnings.push(
      `【重複排班】:\n- 病人 ${Array.from(duplicateNames).join(', ')} 在本日出現超過一次。`,
    )
  }

  const allPatientsToCheck = allPatients.value.filter(
    (p) => !p.isDeleted && (p.status === 'opd' || p.status === 'ipd'),
  )
  const missingPatients = allPatientsToCheck.filter((p) => {
    const shouldBeScheduled = shouldPatientBeScheduled(p, dayOfWeek)
    return shouldBeScheduled && !todayScheduledPatientIds.has(p.id)
  })

  if (missingPatients.length > 0) {
    const missingPatientNames = missingPatients
      .map((p) => `${p.name} (${p.status === 'ipd' ? '住院' : '門診'})`)
      .join('\n- ')
    warnings.push(`【未排床病人】:\n- ${missingPatientNames}`)
  }

  if (warnings.length > 0) {
    alertDialogTitle.value = '排班檢視警告'
    alertDialogMessage.value = warnings.join('\n\n')
  } else {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現明顯的排班或遺漏問題。'
  }
  isAlertDialogVisible.value = true
}

async function loadAllPatients() {
  try {
    allPatients.value = await patientsApi.fetchAll()
  } catch (error) {
    console.error('獲取病人資料失敗:', error)
  }
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  try {
    const dailyRecords = await schedulesApi.fetchAll([where('date', '==', dateStr)])
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    const loadedSchedule = record.schedule || {}
    const finalSchedule = {}
    for (const shiftId in loadedSchedule) {
      const dbSlotData = loadedSchedule[shiftId]
      if (dbSlotData && dbSlotData.patientId) {
        const patient = patientMap.value.get(dbSlotData.patientId)
        const mergedSlot = { ...createEmptySlotData(shiftId), ...dbSlotData }
        if (patient) {
          mergedSlot.autoNote = generateAutoNote(patient)
        }
        finalSchedule[shiftId] = mergedSlot
      }
    }
    Object.assign(currentRecord, {
      id: record.id || null,
      date: record.date,
      schedule: finalSchedule,
    })
    statusIndicator.value = '資料已載入'
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

async function saveDataToCloud() {
  statusIndicator.value = '儲存中...'
  try {
    const cleanSchedule = {}
    for (const shiftId in currentRecord.schedule) {
      const slotData = currentRecord.schedule[shiftId]
      if (slotData && slotData.patientId) {
        cleanSchedule[shiftId] = {
          patientId: slotData.patientId,
          shiftId: slotData.shiftId || shiftId,
          autoNote: slotData.autoNote || '',
          manualNote: slotData.manualNote || '',
          nurseTeam: slotData.nurseTeam || null,
          nurseTeamIn: slotData.nurseTeamIn || null,
          nurseTeamOut: slotData.nurseTeamOut || null,
          wardNumber: slotData.wardNumber || null,
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
    } else if (Object.keys(cleanSchedule).length > 0) {
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id
    }
    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '排程已成功儲存！'
    isAlertDialogVisible.value = true
  } catch (error) {
    console.error('儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

function clearBoard() {
  if (confirm('確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)')) {
    currentRecord.schedule = {}
    setChange()
  }
}

async function copySchedule() {
  if (!copySourceDate.value || copySourceDate.value === formatDate(currentDate.value)) {
    alert('請選擇一個與當前不同的來源日期！')
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
      const sourceSchedule = sourceRecords[0].schedule || {}
      const processedSchedule = {}
      for (const shiftId in sourceSchedule) {
        if (sourceSchedule[shiftId]?.patientId) {
          processedSchedule[shiftId] = { ...sourceSchedule[shiftId] }
        }
      }
      currentRecord.schedule = processedSchedule
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

function onBedDragStart(event, sourceShiftId) {
  const slotData = currentRecord.schedule[sourceShiftId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('patientId', slotData.patientId)
  event.dataTransfer.setData('sourceShiftId', sourceShiftId)
  event.dataTransfer.effectAllowed = 'move'
}

function onSidebarDragStart(event, patient) {
  event.dataTransfer.setData('patientId', patient.id)
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, targetShiftId) {
  event.preventDefault()
  event.target.closest('.patient-name')?.classList.remove('drag-over')

  const patientId = event.dataTransfer.getData('patientId')
  if (!patientId) return

  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')

  const patient = patientMap.value.get(patientId)
  if (!patient) return

  if (!sourceShiftId && scheduledPatientIds.value.has(patientId)) {
    if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) {
      return
    }
  }

  const sourceSlotData = sourceShiftId ? currentRecord.schedule[sourceShiftId] : null
  const targetSlotData = currentRecord.schedule[targetShiftId]

  const newSlotData = {
    ...createEmptySlotData(targetShiftId),
    ...(targetSlotData || {}),
    ...(sourceSlotData || {}),
    patientId: patientId,
    autoNote: generateAutoNote(patient),
    manualNote: sourceSlotData?.manualNote || '',
    shiftId: targetShiftId,
  }

  currentRecord.schedule[targetShiftId] = newSlotData

  if (sourceShiftId && sourceShiftId !== targetShiftId) {
    if (targetSlotData?.patientId) {
      const swappedPatient = patientMap.value.get(targetSlotData.patientId)
      currentRecord.schedule[sourceShiftId] = {
        ...createEmptySlotData(sourceShiftId),
        patientId: targetSlotData.patientId,
        autoNote: generateAutoNote(swappedPatient),
        manualNote: targetSlotData.manualNote || '',
        shiftId: sourceShiftId,
      }
    } else {
      delete currentRecord.schedule[sourceShiftId]
    }
  }
  setChange()
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

function handleSlotClick(rawShiftId) {
  const shiftId = sanitizeShiftId(rawShiftId) // 在入口處清理 ID
  const slotData = currentRecord.schedule[shiftId]
  if (slotData && slotData.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    if (confirm(`確定要將「${patient?.name}」從此班次中移除嗎？`)) {
      handleSlotUpdate(shiftId, null) // 傳遞乾淨的 ID
    }
  } else {
    openPatientDialog(shiftId) // 傳遞乾淨的 ID
  }
}

function handlePatientSelectedFromDialog({ patientId }) {
  // currentEditingShiftId.value 現在保證是乾淨的
  if (currentEditingShiftId.value && patientId) {
    if (scheduledPatientIds.value.has(patientId)) {
      const patient = patientMap.value.get(patientId)
      if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) {
        isDialogVisible.value = false
        return
      }
    }
    handleSlotUpdate(currentEditingShiftId.value, patientId)
  }
  isDialogVisible.value = false
}

function handleSlotUpdate(shiftId, patientId) {
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    currentRecord.schedule[shiftId] = {
      ...createEmptySlotData(shiftId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: '',
    }
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

function openPatientDialog(shiftId) {
  // 這裡接收的 shiftId 已經是清理過的
  currentEditingShiftId.value = shiftId
  isDialogVisible.value = true
}

function updateNurseTeam(event, rawShiftId, type) {
  const shiftId = sanitizeShiftId(rawShiftId) // 在入口處清理 ID
  const value = event.target.value
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  const slot = currentRecord.schedule[shiftId]
  if (type === 'single') slot.nurseTeam = value || null
  else if (type === 'in') slot.nurseTeamIn = value || null
  else if (type === 'out') slot.nurseTeamOut = value || null
  setChange()
}

function updateNote(event, rawShiftId) {
  const shiftId = sanitizeShiftId(rawShiftId) // 在入口處清理 ID
  const value = event.target.textContent
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].manualNote = value
  setChange()
}

const updateWardNumber = (event, shiftId) => {
  const value = event.target.textContent.trim()
  if (!currentRecord.schedule[shiftId]) {
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }
  currentRecord.schedule[shiftId].wardNumber = value
  setChange()
}

function getPatientName(rawShiftId) {
  const shiftId = sanitizeShiftId(rawShiftId) // 在入口處清理 ID
  const patientId = currentRecord.schedule[shiftId]?.patientId
  return patientMap.value.get(patientId)?.name || ''
}

function getCombinedNote(rawShiftId) {
  const shiftId = sanitizeShiftId(rawShiftId)
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return ''
  const autoNotes = (slotData.autoNote || '').split(' ').filter(Boolean)
  const manualNotes = (slotData.manualNote || '').split(' ').filter(Boolean)
  const allNotes = new Set([...autoNotes, ...manualNotes])
  return Array.from(allNotes).join(' ')
}

function getPatientCellStyle(rawShiftId) {
  const shiftId = sanitizeShiftId(rawShiftId)
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) return {}

  // 現在 getCombinedNote 也接收 shiftId，所以可以直接呼叫
  const combinedNote = getCombinedNote(rawShiftId)

  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }

  const patient = patientMap.value.get(slotData.patientId)
  if (patient && patient.status === 'ipd') {
    return { [STYLE_PRIORITY['住'].class]: true }
  }

  return {}
}

function triggerPrint() {
  window.print()
}

// 【新增】使用 watch 來監聽 currentDate 的變化
watch(
  currentDate,
  (newDate) => {
    // 將格式化後的日期設置到 body 的 data-print-date 屬性上
    document.body.setAttribute('data-print-date', formatDate(newDate))
  },
  { immediate: true },
) // immediate: true 確保在元件掛載後立刻執行一次

// --- 生命週期鉤子 ---
onMounted(async () => {
  await loadAllPatients()
  await loadDataForDay(currentDate.value)
  // 也可以在這裡設置一次，作為備用
  // document.body.setAttribute('data-print-date', formatDate(currentDate.value));
})
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <!-- ======================= 第一行：標題、日期導覽、主要操作 ======================= -->
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button class="btn" @click="changeDate(-1)">< 上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button @click="changeDate(1)">下一天 ></button>
            <button @click="goToToday">回到今日</button>
          </div>
          <!-- 【修改】將「排班檢視」按鈕移到這裡 -->
          <button class="btn btn-warning" @click="runScheduleCheck">排班檢視</button>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <!-- 【修改】將「儲存」和「列印」按鈕移到這裡 -->
          <button class="btn btn-success" @click="saveDataToCloud" :disabled="!hasUnsavedChanges">
            儲存資料至雲端
          </button>
          <button class="btn btn-info" @click="triggerPrint">列印排程</button>
        </div>
      </div>

      <!-- ======================= 第二行：次要操作、統計 ======================= -->
      <div class="controls-panel">
        <div class="controls-left">
          <!-- 【修改】這裡只保留次要操作 -->
          <button class="btn btn-secondary" @click="clearBoard">清除本日畫面</button>
          <input type="date" v-model="copySourceDate" />
          <button class="add-btn" @click="copySchedule">從他日複製排程</button>
          <div class="search-group">
            <input type="text" v-model="searchInput" placeholder="搜尋..." class="search-input" />
            <button>搜尋</button>
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
          <template
            v-for="(wing, wingName) in {
              left: layoutData.leftWingRows,
              right: layoutData.rightWingRows,
            }"
            :key="wingName"
          >
            <div :class="`${wingName}-wing`">
              <div v-for="(row, rowIndex) in wing" :key="`${wingName}-${rowIndex}`" class="bed-row">
                <div
                  v-for="bedNum in row"
                  :key="`bed-${wingName}-${bedNum}`"
                  class="bed"
                  :class="{
                    unassigned: bedNum === '空',
                    hepatitis: hepatitisBeds.includes(bedNum),
                    'aisle-side': aisleSideBeds.includes(bedNum),
                    [`${wingName}-wing-bed`]: true,
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
                      :class="[
                        getPatientCellStyle(`bed-${bedNum}-${shift}`),
                        { 'split-shift': shift === '午' },
                      ]"
                    >
                      <div class="shift-label">{{ shift }}</div>
                      <div v-if="shift === '午'" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          title="上針"
                          :value="currentRecord.schedule[`bed-${bedNum}-${shift}`]?.nurseTeamIn"
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shift}`, 'in')"
                        >
                          <option value="">上針</option>
                          <option v-for="team in earlyTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                        <select
                          class="nurse-team-select nurse-out"
                          title="收針"
                          :value="currentRecord.schedule[`bed-${bedNum}-${shift}`]?.nurseTeamOut"
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shift}`, 'out')"
                        >
                          <option value="">收針</option>
                          <option v-for="team in allTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                      </div>
                      <select
                        v-else
                        class="nurse-team-select"
                        :value="currentRecord.schedule[`bed-${bedNum}-${shift}`]?.nurseTeam"
                        @change="updateNurseTeam($event, `bed-${bedNum}-${shift}`, 'single')"
                      >
                        <option value="">-</option>
                        <option
                          v-for="team in shift === '早' ? earlyTeams : lateTeams"
                          :key="team"
                          :value="team"
                        >
                          {{ team }}組
                        </option>
                      </select>

                      <!-- 【註解已修正】註解現在位於元素標籤之外 -->
                      <div
                        class="patient-name"
                        draggable="true"
                        @click="handleSlotClick(`bed-${bedNum}-${shift}`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shift}`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                        @dragstart="onBedDragStart($event, `bed-${bedNum}-${shift}`)"
                      >
                        {{ getPatientName(`bed-${bedNum}-${shift}`) }}
                      </div>
                      <div
                        class="patient-tag"
                        contenteditable="true"
                        @blur="updateNote($event, `bed-${bedNum}-${shift}`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shift}`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                      >
                        {{ getCombinedNote(`bed-${bedNum}-${shift}班`) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <div v-if="wingName === 'left'" class="bed-row">
                <div class="nursing-station">護理站</div>
              </div>
            </div>
            <div v-if="wingName === 'left'" class="aisle">中 央 走 道</div>
          </template>
        </div>
        <div class="extra-sections">
          <div class="peripheral-section">
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div
                  v-for="shift in SHIFTS"
                  :key="shift"
                  class="peripheral-shift-row"
                  :class="getPatientCellStyle(`peripheral-${i}-${shift}`)"
                >
                  <div class="shift-label">{{ shift }}</div>
                  <select
                    class="nurse-team-select"
                    :value="currentRecord.schedule[`peripheral-${i}-${shift}`]?.nurseTeam"
                    @change="updateNurseTeam($event, `peripheral-${i}-${shift}`, 'single')"
                  >
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
                  <div
                    class="peripheral-bed-number"
                    contenteditable="true"
                    @blur="updateWardNumber($event, `peripheral-${i}-${shift}`)"
                  >
                    {{ currentRecord.schedule[`peripheral-${i}-${shift}`]?.wardNumber }}
                  </div>

                  <!-- 【註解已修正】註解現在位於元素標籤之外 -->
                  <div
                    class="peripheral-patient-name"
                    draggable="true"
                    @click="handleSlotClick(`peripheral-${i}-${shift}`)"
                    @drop="onDrop($event, `peripheral-${i}-${shift}`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                    @dragstart="onBedDragStart($event, `peripheral-${i}-${shift}`)"
                  >
                    {{ getPatientName(`peripheral-${i}-${shift}`) }}
                  </div>
                  <div
                    class="patient-tag"
                    contenteditable="true"
                    @blur="updateNote($event, `peripheral-${i}-${shift}`)"
                    @drop="onDrop($event, `peripheral-${i}-${shift}`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                  >
                    {{ getCombinedNote(`peripheral-${i}-${shift}班`) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
      />
    </main>
  </div>

  <PatientSelectDialog
    :is-visible="isDialogVisible"
    title="選擇排班病人"
    :patients="allPatients"
    :show-fill-options="false"
    @confirm="handlePatientSelectedFromDialog"
    @cancel="isDialogVisible = false"
  />
  <AlertDialog
    :is-visible="isAlertDialogVisible"
    :title="alertDialogTitle"
    :message="alertDialogMessage"
    @confirm="isAlertDialogVisible = false"
  />
</template>

<style scoped>
/* ==========================================================================
   1. 頁面整體佈局 (Layout) - **此區為本次修改核心**
   ========================================================================== */

/* 最外層容器，設定為佔滿整個視窗高度的 Flex 容器 */
.page-container {
  display: flex;
  flex-direction: column; /* 讓 header 和 main-content 垂直排列 */
  height: 100vh; /* 佔滿整個可視螢幕高度 */
  overflow: hidden; /* 防止整個頁面出現滾動條 */
  background-color: #f4f7f9;
}

/* 頂部標頭區塊 */
.page-header {
  flex-shrink: 0; /* 防止 header 在空間不足時被壓縮 */
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  z-index: 10; /* 確保在最上層 */
}

/* 主內容區 (包含床位區和側邊欄) */
.page-main-content {
  flex-grow: 1; /* 讓主內容區填滿 header 下方所有剩餘的垂直空間 */
  display: flex; /* 內部使用 flex，讓床位區和側邊欄水平排列 */
  min-height: 0; /* 解決 flex 子項目 overflow 的問題，非常重要 */
}

/* 中間的床位內容區 (將會滾動的部分) */
.schedule-content {
  flex-grow: 1; /* 佔滿側邊欄以外所有剩餘的水平空間 */
  overflow-y: auto; /* **關鍵！讓這個區塊產生自己的垂直滾動條** */
  min-width: 0;
}

/* 右側側邊欄 (固定不動的部分) */
.inpatient-sidebar {
  flex-shrink: 0; /* 防止側邊欄被壓縮 */
  width: 200px; /* 給一個固定寬度 */
  border-left: 1px solid #e0e0e0;
  /* 讓側邊欄內部也能滾動 (如果病人列表太長) */
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ==========================================================================
   2. 元件樣式 (Components) - 大部分為您原有的樣式微調
   ========================================================================== */

/* -- Header 內部樣式 -- */
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0px; /* 與第二行的間距 */
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  font-size: 32px;
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
}
.weekday-display {
  color: var(--primary-color);
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}

/* -- 控制面板樣式 -- */
/* ======================= 第二行樣式 ======================= */
.controls-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}
.btn btn-info,
.controls-panel button,
.controls-panel input[type='date'],
.controls-panel input[type='text'] {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  height: 40px;
  box-sizing: border-box;
}
.date-navigator button {
  padding: 8px 12px;
  font-size: 1em;
  border-radius: 5px;
  border: 1px solid #ccc;
  cursor: pointer;
  background-color: #fff;
}
.search-group {
  display: flex;
  align-items: center;
}
.search-group input {
  border-radius: 5px 0 0 5px;
}
.search-group button {
  border-radius: 0 5px 5px 0;
  border-left: none;
}

/* ==========================================================================
   3. 床位與排程樣式 (Bed & Schedule Styles)
   ========================================================================== */

.dialysis-unit {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 20px 5px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-size: 1.5em;
  letter-spacing: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
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
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.bed {
  min-height: 160px;
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
  padding: 40px 0;
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px;
  text-align: center;
  font-size: 1em;
}

/* -- 排程行 & 格子樣式 -- */
.shift-row,
.peripheral-shift-row {
  display: grid;
  align-items: stretch; /* 讓格子填滿高度 */
  border-top: 1px solid #e0e0e0;
  transition: background-color 0.3s;
}
.shift-row {
  grid-template-columns: 28px 60px 1fr 50px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 70px 1fr 40px;
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
.shift-row > div,
.shift-row > select,
.peripheral-shift-row > div,
.peripheral-shift-row > select {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  min-height: 48px;
  border-left: 1px solid #e0e0e0;
  word-break: break-all;
  text-align: center;
}
.patient-name,
.peripheral-patient-name {
  font-size: 1em; /* 從 1.1em 縮小 */
  padding: 4px 6px; /* 微調內距 */
}
.patient-name:empty::before,
.peripheral-patient-name:empty::before {
  content: '輸入病人';
  color: #aaa;
  font-style: italic;
}
.patient-tag:empty::before {
  content: '備註';
  color: #aaa;
  font-style: italic;
}
.patient-tag {
  font-size: 0.9em; /* 縮小字體 */
  white-space: nowrap; /* 強制不換行 */
  overflow: hidden; /* 隱藏超出部分 */
  text-overflow: ellipsis; /* 超出部分顯示省略號 */
  padding: 4px 6px; /* 微調內距 */
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
.shift-row.split-shift .nurse-split-column {
  display: flex;
  flex-direction: column;
  padding: 0;
}
.nurse-split-column .nurse-team-select {
  flex-grow: 1;
  height: 50%;
}
.nurse-split-column .nurse-team-select:first-child {
  border-bottom: 1px solid #e0e0e0;
}

/* -- 特殊床位 & 狀態顏色 -- */
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
.bed.aisle-side.right-wing-bed {
  border-left: 5px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 5px solid #4caf50;
}

/* --- ↓↓↓ 關鍵修正處 ↓↓↓ --- */
/* 使用群組選擇器，讓主床位和外圍床位共用顏色規則 */
.shift-row.tag-ip,
.peripheral-shift-row.tag-ip {
  background-color: #ffebee; /* 住 */
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #e3f2fd; /* 抽 */
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #fffde7; /* 新 */
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa; /* 換 */
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0; /* 兩 */
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4; /* B */
}

.patient-name.drag-over {
  background-color: #c8e6c9 !important;
}

/* -- 外圍床位 -- */
.extra-sections {
  margin-top: 30px;
}
.peripheral-section {
  margin-bottom: 20px;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 10px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  color: #c2185b;
}

/* ==========================================================================
   4. 側邊欄樣式 (Sidebar Styles) - **此區有微調**
   ========================================================================== */
.inpatient-sidebar h3 {
  margin-top: 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
  flex-shrink: 0;
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
}

#inpatient-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  flex-grow: 1; /* **關鍵：讓列表填滿側邊欄剩餘空間** */
  overflow-y: auto; /* **關鍵：如果列表太長，讓列表自己滾動** */
}
#inpatient-list li {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 5px;
  cursor: grab;
}
#inpatient-list li:active {
  cursor: grabbing;
}

/* ==========================================================================
   列印樣式 (Print Styles) - 保持佈局、整體縮放、解決截斷
   ========================================================================== */
@page {
  /* 為了容納寬版佈局，橫向是最佳選擇 */
  size: A4 portrait;
  margin: 0;
}

@media print {
  /* --- 1. 隱藏所有非列印元素 --- */
  #app-sidebar,
  .inpatient-sidebar,
  .page-header .btn,
  .page-header .btn-warning,
  .page-header .btn-info,
  .page-header .btn-success,
  .page-header .search-group,
  .page-header .status-indicator,
  .toolbar-right {
    display: none !important;
  }

  /* 【核心修改 1】不再隱藏外圍床位的父容器 .extra-sections */
  /* 我們只隱藏走道和護理站，讓佈局更緊湊 */
  .aisle,
  .nursing-station {
    display: none !important;
  }

  /* --- 2. 準備好列印環境 --- */
  body,
  html {
    background: #fff !important;
    overflow: hidden !important; /* 確保 body 本身不滾動 */
    -webkit-print-color-adjust: exact;
    color-adjust: exact;
  }

  /* --- 3. 【核心技巧】先撐開內容，再整體縮放 --- */

  /* 步驟 A: 將所有父容器的高度限制解除，為內容撐開做準備 */
  .page-container,
  .page-main-content {
    height: auto !important;
    overflow: visible !important; /* 允許內容溢出 */
  }

  /* 步驟 B: 強行撐開包含滾動條的那個容器的高度 */
  .schedule-content {
    height: 2800px !important; /* 給一個足夠大的固定高度，確保所有床位都能顯示 */
    overflow: visible !important; /* 確保內容不會被截斷 */
  }

  /* 步驟 C: 對最外層的容器進行縮放 */
  .page-container {
    /* 根據您螢幕的寬高比和內容的複雜度來設置 */
    /* 這裡的 width 和 height 應該大於您螢幕的解析度 */
    width: 2200px;
    height: 1800px; /* 寬高比約為 16:10 */

    /* 將縮放原點設為左上角 */
    transform-origin: top left;

    /* 關鍵！縮放比例，您需要微調這個數字 */
    /* 0.45 對於 A4 橫向是一個比較合理的起始值 */
    transform: scale(0.4);
  }
  /* 主要床位區的容器 */
  .dialysis-unit {
    display: flex; /* 或者 display: grid; */
    flex-wrap: wrap; /* 確保能換行 */
    gap: 10px;
    justify-content: flex-start;
  }
  /* 外圍床位區的容器 */
  .peripheral-bed-container {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
    justify-content: start;
  }

  .bed,
  .peripheral-bed {
    /* 確保每個床位卡片都有根源在於我們之前使用的 Flexbox 佈局 (`display: flex`)，它會自動分配剩餘空間。而一個基礎寬度，而不是完全依賴於 1fr */
    /* 這樣它們在未被拉伸時， `.extra-sections` 裡的 `.peripheral-bed-container` 預設是 `grid-template-columns: 1fr 1fr;`，這導致它與主床位區的佈局不一致。

   **解決也能保持一致的大小 */
    flex-basis: 150px;
    width: 150px; /* 對於 grid 佈局作為備用 */
    flex-grow: 1; /* 允許它們在空間充足時稍微變大 */
  }

  /* --- 4. 重新設計頁首，只保留日期標題 --- */
  .page-header {
    border-bottom: 2px solid #000;
    padding-bottom: 1rem;
    margin-bottom: 1.5rem;
  }
  .page-header .page-title,
  .page-header .weekday-display,
  .page-header .date-navigator button {
    display: none !important;
  }
  .toolbar-left,
  .date-navigator {
    width: 100%;
    justify-content: center;
    gap: 0;
  }
  .current-date-text {
    font-size: 28pt !important; /* 放大字體以匹配縮放 */
    font-weight: bold;
    color: #000 !important;
  }

  /* --- 5. 細節微調 --- */
  /* 因為整體縮小了，邊框需要加粗才能看清 */
  .bed,
  .peripheral-bed {
    border-width: 1.5px;
    border-color: #333;
  }
}
</style>
