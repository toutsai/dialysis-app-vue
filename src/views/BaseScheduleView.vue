<!-- 檔案路徑: src/views/BaseScheduleView.vue (重構版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的元件
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue' // 【新增】引入 ConfirmDialog
import { createEmptySlotData } from '@/utils/scheduleUtils.js'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 ---
const SHIFTS = ['早班', '午班', '晚班']
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
const draggedItem = ref(null) // 【新增】拖曳狀態

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]
// Dialog 狀態
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allOpdPatients.value.map((p) => [p.id, p])))
const statsToolbarData = computed(() => {
  const dailyCounts = Array.from({ length: 6 }).map(() => ({ 早班: 0, 午班: 0, 晚班: 0 }))
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const [_bed, shiftIndex, dayIndex] = slotId.split('-').map(Number)
      if (dayIndex >= 0 && dayIndex < 6) {
        const shiftName = SHIFTS[shiftIndex]
        if (dailyCounts[dayIndex] && dailyCounts[dayIndex][shiftName] !== undefined) {
          dailyCounts[dayIndex][shiftName]++
        }
      }
    }
  }
  return dailyCounts.map((counts) => ({ counts }))
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
    if (baseScheduleDoc) {
      const loadedSchedule = baseScheduleDoc.schedule || {}
      const finalSchedule = {}
      for (const slotId in loadedSchedule) {
        finalSchedule[slotId] = {
          ...createEmptySlotData(slotId),
          ...loadedSchedule[slotId],
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
    const dataToSave = {
      id: masterRecord.value.id,
      schedule: masterRecord.value.schedule,
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
  allOpdPatients.value.forEach((patient) => {
    const patientName = patient.name
    const expectedFreq = patient.freq
    const expectedDays = FREQ_MAP_TO_DAY_INDEX[expectedFreq] || []
    const actualScheduledDays = new Set()
    for (const slotId in masterRecord.value.schedule) {
      if (masterRecord.value.schedule[slotId]?.patientId === patient.id) {
        actualScheduledDays.add(parseInt(slotId.split('-')[2], 10))
      }
    }
    if (actualScheduledDays.size > 0) {
      if (expectedDays.length > 0) {
        const actualDaysArray = Array.from(actualScheduledDays).sort()
        const expectedDaysArray = [...expectedDays].sort()
        if (JSON.stringify(actualDaysArray) !== JSON.stringify(expectedDaysArray)) {
          const actualDaysText = actualDaysArray
            .map((d) => WEEKDAYS[d].replace('星期', ''))
            .join('')
          validationResult.freqMismatch.push(
            `門診病人 ${patientName} (預定 ${expectedFreq})，但目前排 ${actualDaysText}。`,
          )
        }
      }
    } else {
      if (expectedFreq) {
        validationResult.unscheduled.push(`有門診病人 ${patientName} 未被排床。`)
      }
    }
  })
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
  let message = ''
  let hasWarnings = false
  if (validationResult.unscheduled.length > 0) {
    message += '【未排床病人】:\n- ' + validationResult.unscheduled.join('\n- ') + '\n\n'
    hasWarnings = true
  }
  if (validationResult.freqMismatch.length > 0) {
    message += '【排班頻率不符】:\n- ' + validationResult.freqMismatch.join('\n- ') + '\n\n'
    hasWarnings = true
  }
  if (validationResult.duplicates.length > 0) {
    message += '【同日重複排班】:\n- ' + validationResult.duplicates.join('\n- ') + '\n\n'
    hasWarnings = true
  }
  if (!hasWarnings) {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現明顯的排班問題。'
  } else {
    alertDialogTitle.value = '發現以下潛在問題'
    alertDialogMessage.value = message.trim()
  }
  isAlertDialogVisible.value = true
}

function handleGridClick(slotId) {
  const patientId = masterRecord.value.schedule[slotId]?.patientId
  if (patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    currentSlotId.value = slotId
    isDialogVisible.value = true
  }
}

// 【已更新】handlePatientSelect，加入衝突處理
function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  const patient = allOpdPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const expectedDays = (patient.freq && FREQ_MAP_TO_DAY_INDEX[patient.freq]) || []
  const daysToFill =
    fillType === 'frequency' && expectedDays.length > 0 ? expectedDays : [parseInt(dayIndex)]
  const targetSlots = daysToFill.map((d_idx) => `${bed}-${shiftIndex}-${d_idx}`)

  const emptySlots = []
  const conflictedSlots = []
  targetSlots.forEach((targetSlotId) => {
    if (masterRecord.value.schedule[targetSlotId]?.patientId) {
      conflictedSlots.push(targetSlotId)
    } else {
      emptySlots.push(targetSlotId)
    }
  })

  const performScheduling = (slotsToSchedule) => {
    if (slotsToSchedule.length > 0) {
      const newSchedule = { ...masterRecord.value.schedule }
      slotsToSchedule.forEach((newSlotId) => {
        newSchedule[newSlotId] = {
          ...createEmptySlotData(newSlotId),
          patientId: patientId,
          note: patient.baseNote || '',
        }
      })
      masterRecord.value.schedule = newSchedule
      setChange()
    }
  }

  if (conflictedSlots.length > 0) {
    const conflictMessages = conflictedSlots
      .map((csId) => {
        const [_b, _s, _d] = csId.split('-')
        const day = WEEKDAYS[parseInt(_d, 10)]
        const shift = SHIFTS[parseInt(_s, 10)]
        const existingPatientName =
          patientMap.value.get(masterRecord.value.schedule[csId].patientId)?.name || '未知'
        return `${day}${shift}已被 ${existingPatientName} 佔用`
      })
      .join('\n- ')

    confirmDialogTitle.value = '排班衝突提醒'
    confirmDialogMessage.value = `部分班次因床位已被佔用而未排入：\n\n- ${conflictMessages}\n\n您是否要繼續排入【未被佔用】的床位？`
    confirmAction.value = () => performScheduling(emptySlots)
    isConfirmDialogVisible.value = true
  } else {
    performScheduling(emptySlots)
  }

  isDialogVisible.value = false
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

function handleDialogCancel() {
  isDialogVisible.value = false
}

// 【新增】ConfirmDialog 的處理函數
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
  if (!patient) return {}
  const classes = {}
  const note = slotData.note || ''
  for (const key in STYLE_PRIORITY) {
    if (note.includes(key)) {
      classes[STYLE_PRIORITY[key].class] = true
      return classes
    }
  }
  return classes
}

// 【新增】完整的拖曳功能函數
function onDragStart(event, slotId) {
  const slotData = masterRecord.value.schedule[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  draggedItem.value = {
    patientId: slotData.patientId,
    note: slotData.note || '',
    source: slotId,
  }
  event.dataTransfer.effectAllowed = 'move'
}

function onDrop(event, targetSlotId) {
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
  const itemToDrop = draggedItem.value
  if (!itemToDrop || !itemToDrop.patientId) return

  if (masterRecord.value.schedule[targetSlotId]) {
    console.warn('目標位置非空，操作取消。')
    draggedItem.value = null
    return
  }

  const newSchedule = { ...masterRecord.value.schedule }
  newSchedule[targetSlotId] = {
    ...createEmptySlotData(targetSlotId),
    patientId: itemToDrop.patientId,
    note: itemToDrop.note,
  }
  if (itemToDrop.source !== 'sidebar') {
    delete newSchedule[itemToDrop.source]
  }
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

// --- 生命週期鉤子 ---
onMounted(loadAllData)
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">常規門診床位表</h1>
          <button @click="runBedCheck">病人床位檢視</button>
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

    <PatientSelectDialog
      :is-visible="isDialogVisible"
      title="選擇門診病人"
      :patients="allOpdPatients"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
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
    <!-- 【新增】ConfirmDialog 元件 -->
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
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
  color: #343a40;
}

/* 【核心修正】按鈕樣式 */
.toolbar-left button,
.toolbar-right button {
  padding: 8px 16px;
  font-size: 0.95rem;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  color: #212529; /* 確保預設文字顏色 */
}

/* 按鈕 Hover 效果 */
.toolbar-left button:hover,
.toolbar-right button:not(:disabled):hover {
  border-color: #adb5bd;
  background-color: #f8f9fa;
}

/* 儲存按鈕的特殊樣式 */
.btn-save {
  background-color: #007bff !important; /* 使用 !important 提高優先級 */
  border-color: #007bff !important;
  color: white !important;
}
.btn-save:hover {
  background-color: #0069d9 !important;
  border-color: #0062cc !important;
}
.btn-save:disabled {
  background-color: #6c757d !important;
  border-color: #6c757d !important;
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
</style>
