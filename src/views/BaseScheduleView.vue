<!-- 檔案路徑: src/views/BaseScheduleView.vue (Ref: feature/global-bed-finder 最終修正版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入我們重構後的所有工具和常量
import { ORDERED_SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'

// 2. 引入所有需要的元件
import SelectionDialog from '@/components/SelectionDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 ---
const SHIFTS = ORDERED_SHIFT_CODES
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
const STYLE_PRIORITY = {
  抽: { class: 'tag-chou' },
  新: { class: 'tag-new' },
  住: { class: 'tag-ip' },
  換: { class: 'tag-huan' },
  兩: { class: 'tag-liang' },
  B: { class: 'tag-b' },
}

// --- 核心狀態 ---
const allOpdPatients = ref([])
const masterRecord = ref({
  id: 'MASTER_SCHEDULE',
  schedule: {},
})
const hasUnsavedChanges = ref(false)
const statusText = ref('')
const draggedItem = ref(null)

// --- UI 狀態 ---
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isAssignmentDialogVisible = ref(false)

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allOpdPatients.value.map((p) => [p.id, p])))

const statsToolbarData = computed(() => {
  const dailyCounts = Array.from({ length: 6 }).map(() => ({
    counts: { [SHIFTS[0]]: 0, [SHIFTS[1]]: 0, [SHIFTS[2]]: 0 },
  }))

  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const [_bed, shiftIndex, dayIndex] = slotId.split('-').map(Number)
      if (dayIndex >= 0 && dayIndex < 6) {
        const shiftCode = SHIFTS[shiftIndex]
        if (dailyCounts[dayIndex] && dailyCounts[dayIndex].counts[shiftCode] !== undefined) {
          dailyCounts[dayIndex].counts[shiftCode]++
        }
      }
    }
  }
  return dailyCounts
})

const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))

// --- 方法 ---
function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}

async function loadAllData() {
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    const [patients, baseScheduleDoc] = await Promise.all([
      patientsApi.fetchAll([where('status', '==', 'opd'), where('isDeleted', '==', false)]),
      baseSchedulesApi.fetchById('MASTER_SCHEDULE'),
    ])
    allOpdPatients.value = patients
    // 建立一個臨時的 patientMap 以提高後續查找效率
    const tempPatientMap = new Map(patients.map((p) => [p.id, p]))

    if (baseScheduleDoc) {
      const loadedSchedule = baseScheduleDoc.schedule || {}
      const finalSchedule = {}
      for (const slotId in loadedSchedule) {
        const dbSlotData = loadedSchedule[slotId]
        // 增加檢查，確保排程中的病人ID存在於當前的門診病人列表中
        if (dbSlotData && dbSlotData.patientId && tempPatientMap.has(dbSlotData.patientId)) {
          const patient = tempPatientMap.get(dbSlotData.patientId)
          const standardSlot = createEmptySlotData(slotId)
          if (patient) {
            standardSlot.autoNote = generateAutoNote(patient)
          }
          standardSlot.manualNote = dbSlotData.manualNote || dbSlotData.note || ''
          standardSlot.patientId = dbSlotData.patientId
          finalSchedule[slotId] = standardSlot
        }
      }
      masterRecord.value = {
        id: baseScheduleDoc.id,
        schedule: finalSchedule,
      }
    } else {
      masterRecord.value.schedule = {}
    }
    statusText.value = '常規床位已載入'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusText.value = '讀取失敗'
  }
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const scheduleToSave = {}
    for (const slotId in masterRecord.value.schedule) {
      const slotData = masterRecord.value.schedule[slotId]
      if (slotData && slotData.patientId) {
        scheduleToSave[slotId] = {
          patientId: slotData.patientId,
          autoNote: slotData.autoNote || '',
          manualNote: slotData.manualNote || '',
        }
      }
    }
    const dataToSave = {
      id: masterRecord.value.id,
      schedule: scheduleToSave,
      updatedAt: new Date(),
    }
    await baseSchedulesApi.save(masterRecord.value.id, dataToSave)
    hasUnsavedChanges.value = false
    statusText.value = '床位儲存成功！'
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '常規門診床位已成功儲存！'
    isAlertDialogVisible.value = true
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '儲存失敗，請檢查網路連線或聯繫管理員。'
    isAlertDialogVisible.value = true
  }
}

function runBedCheck() {
  const validationResult = { unscheduled: [], freqMismatch: [], duplicates: [] }
  const scheduledPatientIds = new Set(
    Object.values(masterRecord.value.schedule)
      .filter((slot) => slot && slot.patientId)
      .map((slot) => slot.patientId),
  )
  allOpdPatients.value.forEach((patient) => {
    if (patient.freq && !scheduledPatientIds.has(patient.id)) {
      validationResult.unscheduled.push(`病人 ${patient.name} (頻率: ${patient.freq}) 未被排床。`)
    }
  })
  const patientSchedules = {}
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData?.patientId) {
      if (!patientSchedules[slotData.patientId]) {
        patientSchedules[slotData.patientId] = []
      }
      patientSchedules[slotData.patientId].push(slotId)
    }
  }
  for (const patientId in patientSchedules) {
    const patient = patientMap.value.get(patientId)
    if (!patient || !patient.freq) continue
    const scheduledDays = new Set(
      patientSchedules[patientId].map((slotId) => parseInt(slotId.split('-')[2], 10)),
    )
    const expectedDays = new Set(FREQ_MAP_TO_DAY_INDEX[patient.freq] || [])
    const actualDaysArray = Array.from(scheduledDays).sort()
    const expectedDaysArray = Array.from(expectedDays).sort()
    if (JSON.stringify(actualDaysArray) !== JSON.stringify(expectedDaysArray)) {
      const actualDaysText = actualDaysArray.map((d) => WEEKDAYS[d].replace('星期', '')).join('')
      validationResult.freqMismatch.push(
        `病人 ${patient.name} (應排 ${patient.freq})，卻排在 ${actualDaysText}。`,
      )
    }
  }
  const dailyPatientSets = Array.from({ length: 6 }).map(() => new Set())
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const dayIndex = parseInt(slotId.split('-')[2], 10)
      const patientName = patientMap.value.get(slotData.patientId)?.name
      if (patientName) {
        if (dailyPatientSets[dayIndex].has(patientName)) {
          validationResult.duplicates.push(
            `病人 ${patientName} 在 ${WEEKDAYS[dayIndex]} 出現超過一次。`,
          )
        } else {
          dailyPatientSets[dayIndex].add(patientName)
        }
      }
    }
  }
  return validationResult
}

function handleReviewAndAssign() {
  const results = runBedCheck()
  let issueMessage = ''
  let hasCriticalIssues = false

  if (results.freqMismatch.length > 0) {
    issueMessage += '【排班頻率不符】:\n- ' + results.freqMismatch.join('\n- ') + '\n\n'
    hasCriticalIssues = true
  }
  if (results.duplicates.length > 0) {
    issueMessage += '【同日重複排班】:\n- ' + results.duplicates.join('\n- ') + '\n\n'
    hasCriticalIssues = true
  }

  if (hasCriticalIssues) {
    alertDialogTitle.value = '發現嚴重排班問題'
    alertDialogMessage.value =
      issueMessage + '請手動修正上述問題後，再使用智慧排班工具處理【未排床】的病人。'
    isAlertDialogVisible.value = true
  } else {
    isAssignmentDialogVisible.value = true
  }
}

function handleAssignBed({ patientId, bedNum, shiftCode }) {
  const patient = allOpdPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)

  if (shiftIndex === -1 || dayIndices.length === 0) return

  const newSchedule = { ...masterRecord.value.schedule }
  dayIndices.forEach((dayIndex) => {
    const slotId = `${bedNum}-${shiftIndex}-${dayIndex}`
    newSchedule[slotId] = {
      ...createEmptySlotData(slotId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: patient.baseNote || '',
    }
  })

  masterRecord.value.schedule = newSchedule
  setChange()
}

function handleGridClick(slotId) {
  const patientId = masterRecord.value.schedule[slotId]?.patientId
  if (patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    isAssignmentDialogVisible.value = true
  }
}

function handleClearSelect(selectedValue) {
  if (!clearingSlotId.value) return
  const newSchedule = { ...masterRecord.value.schedule }
  if (selectedValue === 'single') {
    delete newSchedule[clearingSlotId.value]
  } else if (selectedValue === 'all_for_patient') {
    const patientIdToClear = newSchedule[clearingSlotId.value]?.patientId
    if (patientIdToClear) {
      Object.keys(newSchedule).forEach((slotId) => {
        if (newSchedule[slotId]?.patientId === patientIdToClear) {
          delete newSchedule[slotId]
        }
      })
    }
  }
  masterRecord.value.schedule = newSchedule
  setChange()
  isClearDialogVisible.value = false
  clearingSlotId.value = null
}

function handleConflictConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function handleConflictCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function getBaseCellStyle(slotId) {
  const slotData = masterRecord.value.schedule[slotId]
  if (!slotData || !slotData.patientId) return {}

  const patient = patientMap.value.get(slotData.patientId)
  const combinedNote = `${slotData.autoNote || ''} ${slotData.manualNote || ''}`.trim()

  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }

  if (patient) {
    if (patient.status === 'ipd') {
      return { 'status-ipd': true }
    }
    if (patient.status === 'opd') {
      return { 'status-opd': true }
    }
  }

  return {}
}

function onDragStart(event, slotId) {
  const slotData = masterRecord.value.schedule[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  draggedItem.value = { ...slotData, sourceSlotId: slotId }
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, targetSlotId) {
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop || !itemToDrop.patientId) return

  const newSchedule = { ...masterRecord.value.schedule }
  const sourceSlotId = itemToDrop.sourceSlotId
  const targetSlotData = newSchedule[targetSlotId]

  // 情況一：目標格子已被佔用，執行「交換」操作
  if (targetSlotData && targetSlotData.patientId) {
    const sourceSlotData = { ...newSchedule[sourceSlotId] }

    // 執行交換：更新兩個格子的資料
    newSchedule[targetSlotId] = {
      ...sourceSlotData,
      shiftId: targetSlotId,
      sourceSlotId: undefined,
    }
    newSchedule[sourceSlotId] = {
      ...targetSlotData,
      shiftId: sourceSlotId,
      sourceSlotId: undefined,
    }
  } else {
    // 情況二：目標格子是空的，執行「移動」操作
    // 將拖曳的項目放入新格子
    newSchedule[targetSlotId] = { ...itemToDrop, shiftId: targetSlotId, sourceSlotId: undefined }
    // 刪除來源格子的資料
    delete newSchedule[sourceSlotId]
  }

  // 一次性更新整個 schedule 物件以觸發響應式更新
  masterRecord.value.schedule = newSchedule
  setChange()
  draggedItem.value = null
}

function onDragOver(event) {
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot && !targetSlot.querySelector('.patient-details')) {
    targetSlot.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}
onMounted(loadAllData)
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">常規門診床位表</h1>
          <button class="btn btn-warning" @click="handleReviewAndAssign">排班總檢視與分配</button>
        </div>
        <div class="toolbar-right">
          <span class="status-text">{{ statusText }}</span>
          <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存床位
          </button>
        </div>
      </div>
      <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
    </header>

    <main class="page-main-content">
      <ScheduleTable
        class="schedule-table-component"
        :layout="bedLayout"
        :schedule-data="masterRecord.schedule"
        :patient-map="patientMap"
        :shifts="SHIFTS"
        :weekdays="WEEKDAYS"
        :week-dates="[]"
        :hepatitis-beds="hepatitisBeds"
        :get-style-func="getBaseCellStyle"
        @grid-click="handleGridClick"
        @drop="onDrop"
        @drag-start="onDragStart"
        @drag-over="onDragOver"
        @drag-leave="onDragLeave"
      />
    </main>

    <BedAssignmentDialog
      :is-visible="isAssignmentDialogVisible"
      :all-patients="allOpdPatients"
      :bed-layout="bedLayout"
      :schedule-data="masterRecord.schedule"
      :shifts="SHIFTS"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      @close="isAssignmentDialogVisible = false"
      @assign-bed="handleAssignBed"
    />

    <SelectionDialog
      :is-visible="isClearDialogVisible"
      title="清除排班選項"
      :options="CLEAR_OPTIONS"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConflictConfirm"
      @cancel="handleConflictCancel"
    />
  </div>
</template>

<style scoped>
/* 頁面佈局 */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: #f8f9fa;
}
.page-header {
  flex-shrink: 0;
  background-color: #fff;
  border-bottom: 1px solid #dee2e6;
  box-sizing: border-box;
}

/* Header 工具欄 */
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.page-title {
  font-size: 32px;
  font-weight: 600;
  margin: 0;
  color: #343a40;
}

/* 按鈕樣式 */
.toolbar-left .btn,
.toolbar-right .btn-save {
  padding: 8px 16px;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid #ced4da;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  color: #212529;
}
.toolbar-left .btn:hover {
  border-color: #adb5bd;
  background-color: #f8f9fa;
}
.btn.btn-warning {
  background-color: #ffc107;
  border-color: #ffc107;
}
.btn.btn-warning:hover {
  background-color: #e0a800;
  border-color: #d39e00;
}

/* 儲存按鈕的特殊樣式 */
.btn-save {
  background-color: #007bff;
  border-color: #007bff;
  color: white;
}
.btn-save:hover {
  background-color: #0069d9;
  border-color: #0062cc;
}
.btn-save:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.65;
}

.status-text {
  color: #6c757d;
  font-style: italic;
  font-size: 0.9rem;
}

/* 主內容區 */
.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0;
  box-sizing: border-box;
}
.schedule-table-component {
  flex-grow: 1;
  min-height: 0;
}

/* 顏色樣式 */
:deep(.schedule-slot.status-opd) {
  background-color: var(--green-bg, #e8f5e9);
}
:deep(.schedule-slot.status-ipd) {
  background-color: var(--red-bg, #ffebee);
}
:deep(.schedule-slot.status-biweekly) {
  background-color: var(--orange-bg, #fff3e0);
}
:deep(.schedule-slot.tag-chou) {
  background-color: #e3f2fd;
}
:deep(.schedule-slot.tag-new) {
  background-color: #fffde7;
}
:deep(.schedule-slot.tag-huan) {
  background-color: #e0f7fa;
}
:deep(.schedule-slot.tag-liang) {
  background-color: #fff3e0;
}
:deep(.schedule-slot.tag-b) {
  background-color: #fff9c4;
}
</style>
