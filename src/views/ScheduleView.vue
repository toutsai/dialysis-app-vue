<script setup>
import { ref, onMounted, computed, reactive, watch } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'

import {
  SHIFT_CODES,
  ORDERED_SHIFT_CODES,
  getShiftDisplayName,
  earlyTeams,
  lateTeams,
  allTeams,
} from '@/constants/scheduleConstants.js'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
// 【修正】: 已移除不存在的 NoteEditDialog import

// --- Layout and Constants ---
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
const allBedNumbers = [
  ...layoutData.leftWingRows.flat(),
  ...layoutData.rightWingRows.flat(),
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
].filter((b) => b !== '空')
const hepatitisBeds = ['空', 31, 32, 33, 35, 36]
const aisleSideBeds = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65]
const peripheralBedCount = 6
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
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

// --- API Instances ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const memosApi = ApiManager('memos')

// --- Reactive State ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const copySourceDate = ref(formatDate(new Date()))

const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isAssignmentDialogVisible = ref(false)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)
const highlightedTeam = ref(null)

// --- 權限控制 ---
const { isAdmin, isEditor } = useAuth()
const isPageLocked = computed(() => {
  if (!isEditor.value && !isAdmin.value) {
    return true
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return currentDate.value < today
})

function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- Computed Properties ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const dayOfWeek = computed(() => {
  const day = currentDate.value.getDay()
  return day === 0 ? 7 : day
})
const statsToolbarData = computed(() => {
  const dailyData = {
    counts: {
      early: { total: 0, opd: 0, ipd: 0, er: 0 },
      noon: { total: 0, opd: 0, ipd: 0, er: 0 },
      late: { total: 0, opd: 0, ipd: 0, er: 0 },
    },
    total: 0,
  }
  if (currentRecord.schedule) {
    const localPatientMap = new Map(allPatients.value.map((p) => [p.id, p]))
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = localPatientMap.get(slotData.patientId)
        if (!patient) continue
        const shiftCode = slotData.shiftId.split('-')[2]
        const shiftStats = dailyData.counts[shiftCode]
        if (shiftStats) {
          shiftStats.total++
          dailyData.total++
          if (patient.status === 'opd') {
            shiftStats.opd++
          } else if (patient.status === 'ipd') {
            shiftStats.ipd++
          } else if (patient.status === 'er') {
            shiftStats.er++
          }
        }
      }
    }
  }
  return [dailyData]
})
const statsToolbarWeekdays = computed(() => ['本日'])
const scheduledPatientIds = computed(() => {
  if (!currentRecord.schedule) return new Set()
  return new Set(
    Object.values(currentRecord.schedule)
      .filter((slot) => slot && slot.patientId)
      .map((slot) => slot.patientId),
  )
})

// --- Functions ---
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && !memo.isResolved,
  )
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

function toggleHighlight(type, team) {
  const currentHighlight = highlightedTeam.value
  if (currentHighlight && currentHighlight.type === type && currentHighlight.team === team) {
    highlightedTeam.value = null
  } else {
    highlightedTeam.value = { type, team }
  }
}

function isSlotHighlighted(shiftId) {
  if (!highlightedTeam.value) {
    return false
  }
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return false
  const { type, team } = highlightedTeam.value
  const shiftCode = shiftId.split('-')[2]
  if (type === 'early') {
    if (shiftCode === SHIFT_CODES.EARLY && slotData.nurseTeam === `早${team}`) {
      return true
    }
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamIn === `早${team}`) {
      return true
    }
  } else if (type === 'late') {
    if (shiftCode === SHIFT_CODES.LATE && slotData.nurseTeam === `晚${team}`) {
      return true
    }
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamOut === `晚${team}`) {
      return true
    }
  }
  return false
}

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function saveDataToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足或日期已過。'
    isAlertDialogVisible.value = true
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const cleanSchedule = {}
    for (const shiftId in currentRecord.schedule) {
      const slotData = currentRecord.schedule[shiftId]
      if (slotData && slotData.patientId) {
        const standardSlot = createEmptySlotData(shiftId)
        Object.keys(standardSlot).forEach((key) => {
          if (slotData[key] !== null && slotData[key] !== undefined) {
            standardSlot[key] = slotData[key]
          }
        })
        cleanSchedule[shiftId] = standardSlot
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
    const updateEvent = new CustomEvent('schedule-updated', {
      detail: { date: currentRecord.date },
    })
    window.dispatchEvent(updateEvent)
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
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：無法清除。'
    isAlertDialogVisible.value = true
    return
  }
  if (confirm('確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)')) {
    currentRecord.schedule = {}
    setChange()
  }
}

async function copySchedule() {
  if (isPageLocked.value) {
    alert('操作被鎖定：無法複製排程。')
    return
  }
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

function onDrop(event, targetShiftId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')
  const droppedSlotData = JSON.parse(event.dataTransfer.getData('application/json'))
  if (!droppedSlotData || !droppedSlotData.patientId) return
  const patient = patientMap.value.get(droppedSlotData.patientId)
  if (!patient) return
  if (!sourceShiftId && scheduledPatientIds.value.has(patient.id)) {
    if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) return
  }
  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (targetSlotData && targetSlotData.patientId) {
    if (!sourceShiftId) {
      alert('目標床位已被佔用，無法放置！')
      return
    }
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData, shiftId: targetShiftId }
    currentRecord.schedule[sourceShiftId] = { ...targetSlotData, shiftId: sourceShiftId }
  } else {
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData, shiftId: targetShiftId }
    if (sourceShiftId) delete currentRecord.schedule[sourceShiftId]
  }
  setChange()
}

function handleSlotUpdate(shiftId, patientId) {
  if (isPageLocked.value) return
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    currentRecord.schedule[shiftId] = {
      ...createEmptySlotData(shiftId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: patient.status === 'ipd' ? '住' : '',
    }
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

function handleSlotClick(shiftId) {
  if (isPageLocked.value) {
    const slotData = currentRecord.schedule[shiftId]
    if (slotData && slotData.patientId) {
      showPatientMemos(slotData.patientId)
    }
    return
  }
  const slotData = currentRecord.schedule[shiftId]
  if (slotData && slotData.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    if (confirm(`確定要將「${patient?.name}」從此班次中移除嗎？`)) {
      handleSlotUpdate(shiftId, null)
    }
  } else {
    currentSlotId.value = shiftId
    isPatientSelectDialogVisible.value = true
  }
}

function handlePatientSelect({ patientId }) {
  if (!patientId || !currentSlotId.value) return
  isPatientSelectDialogVisible.value = false
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    alertDialogTitle.value = '重複排班警告'
    alertDialogMessage.value = `病人 ${patient.name} 在本日已有排班，無法重複排入。`
    isAlertDialogVisible.value = true
    currentSlotId.value = null
    return
  }
  handleSlotUpdate(currentSlotId.value, patientId)
  currentSlotId.value = null
}

function updateNurseTeam(event, shiftId, type) {
  if (isPageLocked.value) {
    event.target.value =
      currentRecord.schedule[shiftId]?.[
        type === 'single' ? 'nurseTeam' : type === 'in' ? 'nurseTeamIn' : 'nurseTeamOut'
      ] || ''
    return
  }
  const value = event.target.value
  if (!currentRecord.schedule[shiftId]) {
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }
  const slot = currentRecord.schedule[shiftId]
  const isPeripheralNoon = shiftId.startsWith('peripheral') && shiftId.endsWith(SHIFT_CODES.NOON)
  if (type === 'single' && isPeripheralNoon) {
    slot.nurseTeamIn = value || null
    slot.nurseTeamOut = value || null
    slot.nurseTeam = null
  } else if (type === 'single') {
    slot.nurseTeam = value || null
  } else if (type === 'in') {
    slot.nurseTeamIn = value || null
  } else if (type === 'out') {
    slot.nurseTeamOut = value || null
  }
  setChange()
}

function updateNote(event, shiftId) {
  if (isPageLocked.value) {
    event.target.textContent = getCombinedNote(shiftId)
    return
  }
  const value = event.target.textContent
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].manualNote = value
  setChange()
}

const updateWardNumber = (event, shiftId) => {
  if (isPageLocked.value) {
    event.target.textContent = currentRecord.schedule[shiftId]?.wardNumber || ''
    return
  }
  const value = event.target.textContent.trim()
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].wardNumber = value
  setChange()
}

function onBedDragStart(event, sourceShiftId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = currentRecord.schedule[sourceShiftId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('sourceShiftId', sourceShiftId)
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}

function onSidebarDragStart(event, patient) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = {
    ...createEmptySlotData('sidebar-source'),
    patientId: patient.id,
    autoNote: generateAutoNote(patient),
    manualNote: patient.status === 'ipd' ? '住' : '',
  }
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
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

async function loadAllData() {
  try {
    const [patientsData, memosData] = await Promise.all([
      patientsApi.fetchAll(),
      memosApi.fetchAll([where('isResolved', '==', false)]),
    ])
    allPatients.value = patientsData
    activeMemos.value = memosData
  } catch (error) {
    console.error('獲取病人或備忘資料失敗:', error)
    statusIndicator.value = '讀取病人或備忘資料失敗'
  }
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  try {
    const dailyRecords = await schedulesApi.fetchAll([where('date', '==', dateStr)])
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }
    const finalSchedule = {}
    if (record.schedule) {
      for (const shiftId in record.schedule) {
        const dbSlotData = record.schedule[shiftId]
        if (dbSlotData && dbSlotData.patientId) {
          const patient = patientMap.value.get(dbSlotData.patientId)
          const mergedSlot = { ...createEmptySlotData(shiftId), ...dbSlotData }
          if (patient) {
            mergedSlot.autoNote = generateAutoNote(patient)
          }
          finalSchedule[shiftId] = mergedSlot
        }
      }
    }
    Object.assign(currentRecord, {
      id: record.id || null,
      date: dateStr,
      schedule: finalSchedule,
      names: record.names || {},
    })
    statusIndicator.value = record.id ? '資料已載入' : '本日無排程'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient.freq) return false
  const scheduledDays = freqToDays[patient.freq]
  const checkDay = dayOfWeek === 0 ? 7 : dayOfWeek
  return scheduledDays ? scheduledDays.includes(checkDay) : false
}

function runScheduleCheck() {
  const warnings = []
  const dayOfWeek = currentDate.value.getDay()
  const todayScheduledPatientIds = new Set(scheduledPatientIds.value)
  const duplicateNames = new Set()
  let tempScheduled = {}
  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot && slot.patientId) {
      if (tempScheduled[slot.patientId]) {
        const patientName = patientMap.value.get(slot.patientId)?.name
        if (patientName) duplicateNames.add(patientName)
      }
      tempScheduled[slot.patientId] = true
    }
  })
  if (duplicateNames.size > 0) {
    warnings.push(
      `【重複排班】:\n- 病人 ${Array.from(duplicateNames).join(', ')} 在本日出現超過一次。`,
    )
  }
  const allPatientsToCheck = allPatients.value.filter((p) => !p.isDeleted)
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

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name, .peripheral-patient-name')
  if (targetCell) {
    targetCell.classList.add('drag-over')
  }
}

function onDragLeave(event) {
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
}

function handleAssignBed({ patientId, shiftId }) {
  if (!patientId || !shiftId) return
  if (isPageLocked.value) return
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) return
  }
  if (currentRecord.schedule[shiftId]?.patientId) {
    alert('錯誤：目標床位已被佔用！')
    return
  }
  handleSlotUpdate(shiftId, patientId)
}

function getPatientName(shiftId) {
  const patientId = currentRecord.schedule[shiftId]?.patientId
  return patientMap.value.get(patientId)?.name || ''
}

function getCombinedNote(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return ''
  const autoTags = (slotData.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (slotData.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  return finalTags.join(' ')
}

function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  const combinedNote = getCombinedNote(shiftId)
  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      if (key === '住' || key === '隔' || key === 'R') return { 'status-ipd': true }
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }
  if (patient) {
    if (patient.status === 'er') return { 'status-er': true }
    if (patient.status === 'ipd') return { 'status-ipd': true }
    if (patient.status === 'opd') return { 'status-opd': true }
  }
  return {}
}

function triggerPrint() {
  window.print()
}

onMounted(async () => {
  await loadAllData()
  await loadDataForDay(currentDate.value)
})

watch(currentDate, (newDate, oldDate) => {
  if (oldDate && formatDate(newDate) !== formatDate(oldDate)) {
    loadDataForDay(newDate)
  }
})
</script>

<template>
  <div class="page-container">
    <header class="page-header">
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
          <button class="btn btn-warning" @click="runScheduleCheck">排程檢視</button>
          <button
            class="btn btn-info"
            @click="isAssignmentDialogVisible = true"
            :disabled="isPageLocked"
          >
            智慧排床
          </button>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <button
            class="btn btn-success"
            @click="saveDataToCloud"
            :disabled="!hasUnsavedChanges || isPageLocked"
          >
            儲存
          </button>
          <button class="btn btn-info" @click="triggerPrint">列印</button>
        </div>
      </div>
      <div class="controls-panel">
        <div class="controls-left">
          <button class="btn btn-secondary" @click="clearBoard" :disabled="isPageLocked">
            清除畫面
          </button>
          <input type="date" v-model="copySourceDate" :disabled="isPageLocked" />
          <button class="add-btn" @click="copySchedule" :disabled="isPageLocked">從他日複製</button>
        </div>
        <div class="controls-right">
          <div class="team-highlight-container">
            <div class="team-group">
              <span class="team-group-label">早</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`early-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'early' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('early', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
            <div class="team-group">
              <span class="team-group-label">晚</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`late-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'late' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('late', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
          </div>
          <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
        </div>
      </div>
    </header>

    <main class="page-main-content" :class="{ 'is-locked': isPageLocked }">
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
                      v-for="shiftCode in ORDERED_SHIFT_CODES"
                      :key="shiftCode"
                      class="shift-row"
                      :class="[
                        getPatientCellStyle(`bed-${bedNum}-${shiftCode}`),
                        { 'split-shift': shiftCode === SHIFT_CODES.NOON },
                        { 'highlighted-slot': isSlotHighlighted(`bed-${bedNum}-${shiftCode}`) },
                      ]"
                    >
                      <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                      <div v-if="shiftCode === SHIFT_CODES.NOON" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamIn
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'in')"
                          :disabled="isPageLocked"
                        >
                          <option value="">上針</option>
                          <option v-for="team in earlyTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                        <select
                          class="nurse-team-select nurse-out"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamOut
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'out')"
                          :disabled="isPageLocked"
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
                        :value="
                          currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeam
                        "
                        @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'single')"
                        :disabled="isPageLocked"
                      >
                        <option value="">-</option>
                        <option
                          v-for="team in shiftCode === SHIFT_CODES.EARLY ? earlyTeams : lateTeams"
                          :key="team"
                          :value="team"
                        >
                          {{ team }}組
                        </option>
                      </select>
                      <div
                        class="patient-name"
                        :draggable="!isPageLocked && !!getPatientName(`bed-${bedNum}-${shiftCode}`)"
                        @click="handleSlotClick(`bed-${bedNum}-${shiftCode}`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shiftCode}`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                        @dragstart="onBedDragStart($event, `bed-${bedNum}-${shiftCode}`)"
                      >
                        <span v-if="getPatientName(`bed-${bedNum}-${shiftCode}`)">
                          {{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}
                          <span
                            v-if="
                              patientWithMemoIds.has(
                                currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]
                                  ?.patientId,
                              )
                            "
                            class="memo-icon-inline"
                            title="有交班事項"
                            @click.stop="
                              showPatientMemos(
                                currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]
                                  ?.patientId,
                              )
                            "
                            >📝</span
                          >
                        </span>
                        <span v-else class="empty-slot-placeholder">+</span>
                      </div>
                      <div
                        class="patient-tag"
                        :contenteditable="!isPageLocked"
                        @blur="updateNote($event, `bed-${bedNum}-${shiftCode}`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shiftCode}`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                      >
                        {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
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
                  v-for="shiftCode in ORDERED_SHIFT_CODES"
                  :key="shiftCode"
                  class="peripheral-shift-row"
                  :class="[
                    getPatientCellStyle(`peripheral-${i}-${shiftCode}`),
                    { 'highlighted-slot': isSlotHighlighted(`peripheral-${i}-${shiftCode}`) },
                  ]"
                >
                  <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                  <select
                    class="nurse-team-select"
                    :value="
                      shiftCode === SHIFT_CODES.NOON
                        ? currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeamIn
                        : currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeam
                    "
                    @change="
                      updateNurseTeam(
                        $event,
                        `peripheral-${i}-${shiftCode}`,
                        shiftCode === SHIFT_CODES.NOON ? 'in' : 'single',
                      )
                    "
                    :disabled="isPageLocked"
                  >
                    <option value="">-</option>
                    <option
                      v-for="team in shiftCode === SHIFT_CODES.EARLY
                        ? earlyTeams
                        : shiftCode === SHIFT_CODES.LATE
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
                    :contenteditable="!isPageLocked"
                    @blur="updateWardNumber($event, `peripheral-${i}-${shiftCode}`)"
                  >
                    {{ currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.wardNumber }}
                  </div>
                  <div
                    class="peripheral-patient-name"
                    :draggable="!isPageLocked && !!getPatientName(`peripheral-${i}-${shiftCode}`)"
                    @click="handleSlotClick(`peripheral-${i}-${shiftCode}`)"
                    @drop="onDrop($event, `peripheral-${i}-${shiftCode}`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                    @dragstart="onBedDragStart($event, `peripheral-${i}-${shiftCode}`)"
                  >
                    <span v-if="getPatientName(`peripheral-${i}-${shiftCode}`)">
                      {{ getPatientName(`peripheral-${i}-${shiftCode}`) }}
                      <span
                        v-if="
                          patientWithMemoIds.has(
                            currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.patientId,
                          )
                        "
                        class="memo-icon-inline"
                        title="有交班事項"
                        @click.stop="
                          showPatientMemos(
                            currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.patientId,
                          )
                        "
                        >📝</span
                      >
                    </span>
                    <span v-else class="empty-slot-placeholder">+</span>
                  </div>
                  <div
                    class="patient-tag"
                    :contenteditable="!isPageLocked"
                    @blur="updateNote($event, `peripheral-${i}-${shiftCode}`)"
                    @drop="onDrop($event, `peripheral-${i}-${shiftCode}`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                  >
                    {{ getCombinedNote(`peripheral-${i}-${shiftCode}`) }}
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
        :class="{ 'sidebar-locked': isPageLocked }"
        :use-daily-filter="true"
        :day-of-week="dayOfWeek"
      />
    </main>
  </div>

  <MemoDisplayDialog
    :is-visible="isMemoDialogVisible"
    :patient-name="patientNameForDialog"
    :memos="memosForDialog"
    @close="isMemoDialogVisible = false"
  />

  <BedAssignmentDialog
    :is-visible="isAssignmentDialogVisible"
    :all-patients="allPatients"
    :bed-layout="allBedNumbers"
    :schedule-data="currentRecord.schedule"
    :shifts="ORDERED_SHIFT_CODES"
    :freq-map="freqToDays"
    assignment-mode="singleDay"
    :day-of-week="dayOfWeek"
    :is-page-locked="isPageLocked"
    @close="isAssignmentDialogVisible = false"
    @assign-bed="handleAssignBed"
  />
  <PatientSelectDialog
    :is-visible="isPatientSelectDialogVisible"
    title="選擇病人 (單次排班)"
    :patients="allPatients"
    :show-fill-options="false"
    :is-page-locked="isPageLocked"
    @confirm="handlePatientSelect"
    @cancel="isPatientSelectDialogVisible = false"
  />
  <AlertDialog
    :is-visible="isAlertDialogVisible"
    :title="alertDialogTitle"
    :message="alertDialogMessage"
    @confirm="isAlertDialogVisible = false"
  />
</template>

<style scoped>
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: #f4f7f9;
}
.page-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e0e0e0;
  z-index: 10;
}
.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0;
}
.schedule-content {
  flex-grow: 1;
  overflow-y: auto;
  min-width: 0;
}
.inpatient-sidebar {
  flex-shrink: 0;
  width: 240px;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 15px;
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
  font-size: 26px;
  font-weight: bold;
}
.weekday-display {
  color: var(--primary-color);
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}
.controls-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
  padding-bottom: 15px;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn,
button {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  cursor: pointer;
  background-color: #fff;
  transition: all 0.2s ease-in-out;
}
.btn-success {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
}
.btn-success:hover:not(:disabled) {
  background-color: #218838;
}
.btn-info {
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.btn-info:hover:not(:disabled) {
  background-color: #138496;
}
.btn-warning {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}
.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}
.add-btn {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.add-btn:hover:not(:disabled) {
  background-color: #0069d9;
}
.btn:disabled,
button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.controls-panel input[type='date'] {
  padding: 8px 15px;
  font-size: 0.95em;
  border: 1px solid #ccc;
  border-radius: 6px;
  height: 45px;
  box-sizing: border-box;
  background-color: #fff;
  transition: all 0.2s;
  cursor: pointer;
  white-space: nowrap;
}
.controls-panel input[type='date']:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background-color: #e9ecef;
}
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
  transition: all 0.3s ease-in-out;
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
.shift-row,
.peripheral-shift-row {
  position: relative;
  display: grid;
  align-items: stretch;
  border-top: 1px solid #e0e0e0;
  transition: background-color 0.3s;
}
.shift-row {
  grid-template-columns: 28px 50px 1fr 40px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 80px 1fr 50px;
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
.patient-tag {
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 6px;
  color: #dc3545;
  font-weight: bold;
}
.nurse-team-select {
  padding: 4px;
  border: none;
  font-size: 0.8em;
  width: 100%;
  background: transparent;
  border-radius: 0;
  appearance: none;
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
.shift-row.status-opd,
.peripheral-shift-row.status-opd {
  background-color: var(--green-bg, #e8f5e9);
}
.shift-row.status-ipd,
.peripheral-shift-row.status-ipd {
  background-color: var(--red-bg, #ffebee);
}
.shift-row.status-er,
.peripheral-shift-row.status-er {
  background-color: var(--purple-bg, #e9d5ff);
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #8cbdf6;
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #f5ec8e;
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa;
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0;
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4;
}
.patient-name,
.peripheral-patient-name {
  font-size: 1.1em;
  font-weight: bold;
  padding: 4px 6px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.empty-slot-placeholder {
  color: #adb5bd;
  font-size: 1.5rem;
  user-select: none;
  transition: color 0.2s;
}
.patient-name:hover .empty-slot-placeholder,
.peripheral-patient-name:hover .empty-slot-placeholder {
  color: #007bff;
}
.patient-name.drag-over,
.peripheral-patient-name.drag-over {
  background-color: #c8e6c9 !important;
  border: 2px dashed #4caf50;
}
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
.is-locked .btn,
.is-locked button,
.is-locked input {
  opacity: 0.65;
}
.is-locked .page-main-content {
  cursor: not-allowed;
}
.is-locked .schedule-content {
  background-color: #f5f5f5;
}
.is-locked .sidebar-locked {
  background-color: #f5f5f5;
}
.sidebar-locked,
.is-locked [contenteditable='true'],
.is-locked [draggable='true'],
.is-locked .nurse-team-select,
.is-locked .patient-name,
.is-locked .peripheral-patient-name {
  pointer-events: none;
  opacity: 0.8;
}
.is-locked .patient-name:hover .empty-slot-placeholder,
.is-locked .peripheral-patient-name:hover .empty-slot-placeholder {
  color: #adb5bd;
}

.team-highlight-container {
  display: flex;
  gap: 1rem;
  padding: 8px;
  background-color: #e9ecef;
  border-radius: 8px;
}
.team-group {
  display: flex;
  align-items: center;
}
.team-group-label {
  font-weight: bold;
  font-size: 1.2rem;
  color: #495057;
  margin-right: 8px;
  writing-mode: vertical-rl;
  background-color: #ced4da;
  padding: 8px 4px;
  border-radius: 4px;
}
.team-group:first-of-type .team-group-label {
  background-color: #ffe082;
  color: #333;
}
.team-group:last-of-type .team-group-label {
  background-color: #90caf9;
  color: #333;
}
.team-buttons {
  display: flex;
  border: 1px solid #ced4da;
  border-radius: 6px;
  overflow: hidden;
}
.team-btn {
  padding: 6px 12px;
  font-size: 0.9em;
  min-width: 40px;
  border: none;
  border-left: 1px solid #ced4da;
  background-color: #fff;
  transition: all 0.2s;
}
.team-buttons .team-btn:first-child {
  border-left: none;
}
.team-btn.active {
  background-color: #dc3545;
  color: white;
  border-color: #c82333;
}

.shift-row.highlighted-slot,
.peripheral-shift-row.highlighted-slot {
  outline: 3px solid #dc3545;
  outline-offset: -3px;
  z-index: 1;
}

.memo-icon-inline {
  cursor: pointer;
  margin-left: 8px;
  font-size: 1.1em;
  transition: transform 0.2s;
}
.memo-icon-inline:hover {
  transform: scale(1.3);
}
</style>
