<!-- 檔案路徑: src/views/WeeklyView.vue (Ref: feature/global-bed-finder 最終整合版 - 完整無省略) -->
<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入我們重構後的所有工具和常量
import { ORDERED_SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'

// 2. 引入所有需要的元件
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'

// --- 輔助函式 ---
function getStartOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d.setDate(diff)).setHours(0, 0, 0, 0))
}

function formatDate(date, withYear = false) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (withYear) {
    return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
  }
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function formatDateForQuery(date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 ---
const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const PATIENT_STATUS = { INPATIENT: 'ipd' }
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]
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
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')
const draggedItem = ref(null)

// --- UI 狀態 ---
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isProblemSolverDialogVisible = ref(false)
const problemsToSolve = ref(null)

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

const weekDisplay = computed(() => {
  const start = new Date(currentWeekStartDate.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 5)
  return `${formatDate(start, true)} ~ ${formatDate(end, true)}`
})

const weekDates = computed(() => {
  return Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(currentWeekStartDate.value)
    d.setDate(d.getDate() + i)
    return { weekday: WEEKDAYS[i], date: `(${formatDate(d)})`, queryDate: formatDateForQuery(d) }
  })
})

const statsToolbarData = computed(() => {
  const baseData = WEEKDAYS.map(() => ({
    counts: { [SHIFTS[0]]: 0, [SHIFTS[1]]: 0, [SHIFTS[2]]: 0 },
  }))

  for (const [dateStr, record] of weekScheduleRecords.value.entries()) {
    if (record && record.schedule) {
      const d = new Date(dateStr + 'T00:00:00')
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dayIndex >= 0 && dayIndex < 6 && baseData[dayIndex]) {
        for (const slotData of Object.values(record.schedule)) {
          if (slotData && slotData.patientId && slotData.shiftId) {
            const shiftCode = slotData.shiftId.split('-')[2]
            if (baseData[dayIndex].counts[shiftCode] !== undefined) {
              baseData[dayIndex].counts[shiftCode]++
            }
          }
        }
      }
    }
  }
  return baseData
})

const weekScheduleMap = computed(() => {
  const combinedSchedule = {}
  weekDates.value.forEach((day, dayIndex) => {
    const dailyRecord = weekScheduleRecords.value.get(day.queryDate)
    if (dailyRecord && dailyRecord.schedule) {
      for (const dailyShiftId in dailyRecord.schedule) {
        const slotData = dailyRecord.schedule[dailyShiftId]
        if (slotData) {
          const parts = dailyShiftId.split('-')
          if (parts.length === 3) {
            const bedNumber = parts[1]
            const shiftCode = parts[2]
            const shiftIndex = SHIFTS.indexOf(shiftCode)
            if (shiftIndex !== -1) {
              const weeklySlotId = `${bedNumber}-${shiftIndex}-${dayIndex}`
              combinedSchedule[weeklySlotId] = slotData
            }
          }
        }
      }
    }
  })
  return combinedSchedule
})

const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))

const scheduledPatientIds = computed(() => {
  const ids = new Set()
  for (const dailyRecord of weekScheduleRecords.value.values()) {
    if (dailyRecord && dailyRecord.schedule) {
      for (const slotData of Object.values(dailyRecord.schedule)) {
        if (slotData && slotData.patientId) {
          ids.add(slotData.patientId)
        }
      }
    }
  }
  return ids
})

// --- 方法 ---
function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}

async function loadAllData() {
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    const datesForQuery = weekDates.value.map((d) => d.queryDate)
    if (datesForQuery.length === 0) return

    const [patients, weeklyRecords] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', 'in', datesForQuery)]),
    ])

    allPatients.value = patients
    const localPatientMap = new Map(patients.map((p) => [p.id, p]))

    const newWeekRecords = new Map()
    weeklyRecords.forEach((record) => {
      if (record.schedule) {
        for (const shiftId in record.schedule) {
          const slotData = record.schedule[shiftId]
          if (slotData && slotData.patientId) {
            const patient = localPatientMap.get(slotData.patientId)
            slotData.autoNote = patient ? generateAutoNote(patient) : ''
            slotData.manualNote = slotData.manualNote || ''
          }
        }
      }
      newWeekRecords.set(record.date, record)
    })
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
  } catch (error) {
    console.error('讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
  }
}

function handleSlotUpdate(weeklySlotId, patientId, manualNote = '') {
  const [bed, shiftIndexStr, dayIndexStr] = weeklySlotId.split('-')
  const shiftIndex = parseInt(shiftIndexStr, 10)
  const dayIndex = parseInt(dayIndexStr, 10)

  const dateStr = weekDates.value[dayIndex]?.queryDate
  if (!dateStr) {
    console.error(`無法找到索引 ${dayIndex} 對應的日期`)
    return
  }

  if (!weekScheduleRecords.value.has(dateStr)) {
    weekScheduleRecords.value.set(dateStr, { id: null, date: dateStr, schedule: {} })
  }
  const dailyRecord = weekScheduleRecords.value.get(dateStr)

  const shiftCode = SHIFTS[shiftIndex]
  if (!shiftCode) {
    console.error(`無法找到索引 ${shiftIndex} 對應的班別代碼`)
    return
  }

  const dailyShiftId = `bed-${bed}-${shiftCode}`

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return

    const existingSlotData = dailyRecord.schedule[dailyShiftId] || {}

    dailyRecord.schedule[dailyShiftId] = {
      ...createEmptySlotData(dailyShiftId),
      ...existingSlotData,
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: manualNote,
    }
  } else {
    if (dailyRecord.schedule) {
      delete dailyRecord.schedule[dailyShiftId]
    }
  }
  setChange()
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const promises = []
    for (const [date, dailyRecord] of weekScheduleRecords.value.entries()) {
      const scheduleToSave = {}
      if (dailyRecord.schedule) {
        for (const shiftId in dailyRecord.schedule) {
          const slotData = dailyRecord.schedule[shiftId]
          if (slotData && slotData.patientId) {
            scheduleToSave[shiftId] = {
              patientId: slotData.patientId,
              shiftId: slotData.shiftId,
              autoNote: slotData.autoNote || '',
              manualNote: slotData.manualNote || '',
              nurseTeam: slotData.nurseTeam || null,
              nurseTeamIn: slotData.nurseTeamIn || null,
              nurseTeamOut: slotData.nurseTeamOut || null,
              wardNumber: slotData.wardNumber || null,
            }
          }
        }
      }

      const dataToSave = {
        date: date,
        schedule: scheduleToSave,
        names: dailyRecord.names || {},
      }

      const docId =
        dailyRecord.id || (await schedulesApi.fetchAll([where('date', '==', date)]))[0]?.id

      if (docId) {
        if (
          Object.keys(dataToSave.schedule).length > 0 ||
          Object.keys(dataToSave.names).length > 0
        ) {
          promises.push(schedulesApi.update(docId, dataToSave))
        } else {
          promises.push(schedulesApi.delete(docId))
        }
      } else if (Object.keys(dataToSave.schedule).length > 0) {
        promises.push(schedulesApi.save(dataToSave))
      }
    }

    await Promise.all(promises)

    for (const date of weekScheduleRecords.value.keys()) {
      const updateEvent = new CustomEvent('schedule-updated', { detail: { date } })
      window.dispatchEvent(updateEvent)
    }

    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'

    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '週排班已成功儲存！'
    isAlertDialogVisible.value = true
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗：${error.message}`
    isAlertDialogVisible.value = true
  }
}

function handleScheduleUpdate(event) {
  const { date } = event.detail
  if (weekDates.value.some((d) => d.queryDate === date)) {
    console.log(`WeeklyView 收到 ${date} 的更新通知，將重新載入整週資料以確保同步。`)
    loadAllData()
  }
}

onMounted(() => {
  loadAllData()
  window.addEventListener('schedule-updated', handleScheduleUpdate)
})

onUnmounted(() => {
  window.removeEventListener('schedule-updated', handleScheduleUpdate)
})

function onDrop(event, targetSlotId) {
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop) return

  const targetSlotData = weekScheduleMap.value[targetSlotId]
  if (targetSlotData && targetSlotData.patientId) {
    console.warn('目標位置非空，操作取消。')
    draggedItem.value = null
    return
  }

  handleSlotUpdate(targetSlotId, itemToDrop.patientId, itemToDrop.manualNote)

  if (itemToDrop.source !== 'sidebar') {
    handleSlotUpdate(itemToDrop.source, null)
  }

  draggedItem.value = null
}

function changeWeek(days) {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  const newDate = new Date(currentWeekStartDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentWeekStartDate.value = newDate
  loadAllData()
}

function goToToday() {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  currentWeekStartDate.value = getStartOfWeek(new Date())
  loadAllData()
}

async function loadBaseSchedule() {
  if (!confirm('確定要載入常規班表嗎？這將會覆蓋當前週的所有排班。')) return
  statusText.value = '正在載入常規班表...'
  try {
    const masterRecord = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
    if (!masterRecord || !masterRecord.schedule) {
      alert('找不到常規班表範本 (MASTER_SCHEDULE)，沒有資料可以載入。')
      statusText.value = '常規班表為空'
      return
    }

    weekScheduleRecords.value.clear()

    const baseSchedule = masterRecord.schedule
    for (const weeklySlotId in baseSchedule) {
      const baseSlotData = baseSchedule[weeklySlotId]
      if (baseSlotData && baseSlotData.patientId) {
        handleSlotUpdate(
          weeklySlotId,
          baseSlotData.patientId,
          baseSlotData.manualNote || baseSlotData.note || '',
        )
      }
    }
    statusText.value = '常規班表已載入，請記得儲存。'
    setChange()
  } catch (error) {
    console.error('載入常規班表失敗:', error)
    statusText.value = '載入失敗'
  }
}

function handleGridClick(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  if (slotData?.patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    problemsToSolve.value = null
    isProblemSolverDialogVisible.value = true
  }
}

function handleClearSelect(selectedValue) {
  if (!clearingSlotId.value) return

  if (selectedValue === 'single') {
    handleSlotUpdate(clearingSlotId.value, null)
  } else if (selectedValue === 'all_for_patient') {
    const patientIdToClear = weekScheduleMap.value[clearingSlotId.value]?.patientId
    if (patientIdToClear) {
      for (const slotId in weekScheduleMap.value) {
        if (weekScheduleMap.value[slotId]?.patientId === patientIdToClear) {
          handleSlotUpdate(slotId, null)
        }
      }
    }
  }

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

function runScheduleCheck(returnRawData = false) {
  const patientsToCheck = allPatients.value.filter((p) => !p.isDeleted)
  const validationResult = {
    unscheduled: { ipd: [], opd: [] },
    freqMismatch: [],
    duplicates: [],
  }

  patientsToCheck.forEach((patient) => {
    const isScheduledThisWeek = scheduledPatientIds.value.has(patient.id)
    if (!isScheduledThisWeek) {
      if (patient.status === 'ipd') {
        validationResult.unscheduled.ipd.push(patient)
      } else if (patient.status === 'opd' && patient.freq) {
        validationResult.unscheduled.opd.push(patient)
      }
    }
  })

  // ... (這裡可以加入更詳細的頻率不符和重複排班檢查邏輯)

  if (returnRawData) {
    return validationResult
  }

  const unscheduledText = [
    ...validationResult.unscheduled.ipd.map((p) => `住院病人 ${p.name}`),
    ...validationResult.unscheduled.opd.map((p) => `門診病人 ${p.name} (${p.freq})`),
  ]

  if (unscheduledText.length > 0) {
    alertDialogTitle.value = '發現未排床病人'
    alertDialogMessage.value = '【未排床病人】:\n- ' + unscheduledText.join('\n- ')
    isAlertDialogVisible.value = true
  } else {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現未排床的病人。'
    isAlertDialogVisible.value = true
  }
}

function handleReviewAndAssign() {
  const results = runScheduleCheck(true)
  problemsToSolve.value = {
    '住院 - 未排床': results.unscheduled.ipd,
    '門診 - 未排床': results.unscheduled.opd,
  }
  isProblemSolverDialogVisible.value = true
}

function getWeeklyCellStyle(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) return {}

  const patient = patientMap.value.get(slotData.patientId)
  const combinedNote = `${slotData.autoNote || ''} ${slotData.manualNote || ''}`.trim()

  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      if (key === '住' || key === '隔' || key === 'R') {
        return { 'status-ipd': true }
      }
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
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  draggedItem.value = {
    patientId: slotData.patientId,
    manualNote: slotData.manualNote || '',
    source: slotId,
  }
  event.dataTransfer.effectAllowed = 'move'
}

function onSidebarDragStart(event, patient) {
  if (!patient || !patient.id) {
    event.preventDefault()
    return
  }
  draggedItem.value = {
    patientId: patient.id,
    manualNote: patient.status === PATIENT_STATUS.INPATIENT ? '住' : '',
    source: 'sidebar',
  }
  event.dataTransfer.effectAllowed = 'move'
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

function handleAssignBed({ patientId, bedNum, shiftCode }) {
  const patient = patientMap.value.get(patientId)
  if (!patient) return

  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)

  if (shiftIndex === -1) {
    alert('無效的班別代碼，無法排班。')
    return
  }
  if (dayIndices.length === 0) {
    alert(`病人 ${patient.name} 沒有設定有效的透析頻率，無法按頻率排班。`)
    return
  }

  const conflictedSlots = []
  dayIndices.forEach((dayIndex) => {
    const slotId = `${bedNum}-${shiftIndex}-${dayIndex}`
    if (weekScheduleMap.value[slotId]?.patientId) {
      conflictedSlots.push(slotId)
    }
  })

  if (conflictedSlots.length > 0) {
    const conflictDay = WEEKDAYS[parseInt(conflictedSlots[0].split('-')[2], 10)]
    alert(`床位 ${bedNum} 在 ${patient.freq} 的某些天 (例如 ${conflictDay}) 已被佔用，無法排班！`)
    return
  }

  dayIndices.forEach((dayIndex) => {
    const weeklySlotId = `${bedNum}-${shiftIndex}-${dayIndex}`
    const manualNote = patient.baseNote || (patient.status === 'ipd' ? '住' : '')
    handleSlotUpdate(weeklySlotId, patientId, manualNote)
  })
}
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">週排班總表</h1>
          <div class="date-navigator">
            <button @click="changeWeek(-7)">< 上一週</button>
            <span class="week-display-text">{{ weekDisplay }}</span>
            <button @click="changeWeek(7)">下一週 ></button>
          </div>
          <div class="main-actions">
            <button @click="goToToday">回到本週</button>
            <button @click="loadBaseSchedule">載入常規班表</button>
            <button class="btn btn-warning" @click="handleReviewAndAssign">排班檢視與分配</button>
          </div>
        </div>
        <div class="main-actions">
          <span class="status-text">{{ statusText }}</span>
          <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存變更
          </button>
        </div>
      </div>
    </header>

    <main class="page-main-content">
      <div class="schedule-area">
        <StatsToolbar
          class="stats-toolbar"
          :stats-data="statsToolbarData"
          :weekdays="statsToolbarWeekdays"
        />

        <ScheduleTable
          class="schedule-table-component"
          :layout="bedLayout"
          :schedule-data="weekScheduleMap"
          :patient-map="patientMap"
          :shifts="SHIFTS"
          :weekdays="WEEKDAYS"
          :week-dates="weekDates.map((d) => d.date)"
          :hepatitis-beds="hepatitisBeds"
          :get-style-func="getWeeklyCellStyle"
          @grid-click="handleGridClick"
          @drop="onDrop"
          @drag-start="onDragStart"
          @drag-over="onDragOver"
          @drag-leave="onDragLeave"
        />
      </div>

      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
      />
    </main>

    <BedAssignmentDialog
      :is-visible="isProblemSolverDialogVisible"
      :all-patients="allPatients"
      :bed-layout="bedLayout"
      :schedule-data="weekScheduleMap"
      :shifts="SHIFTS"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      :predefined-patient-groups="problemsToSolve"
      assignment-mode="frequency"
      @close="isProblemSolverDialogVisible = false"
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
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}
.page-header {
  border-bottom: 1px solid #dee2e6;
  padding: 1rem;
}
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-left,
.main-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.page-title {
  margin: 0;
  font-size: 32px;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.week-display-text {
  font-weight: bold;
  font-size: 1.2rem;
}
.page-main-content {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
}
.schedule-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.stats-toolbar {
  flex-shrink: 0;
  padding: 0 1rem;
}
.schedule-table-component {
  flex-grow: 1;
  overflow: auto;
}
.status-text {
  font-style: italic;
  color: #6c757d;
}
.btn,
.btn-save {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  background-color: #f8f9fa;
  transition: all 0.2s;
}
.btn:hover,
.btn-save:not(:disabled):hover {
  border-color: #888;
  background-color: #e9ecef;
}
.btn-save {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
}
.btn-save:hover {
  background-color: #218838;
}
.btn-save:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.65;
}
.btn.btn-warning {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn.btn-info {
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}

:deep(.schedule-slot.status-opd) {
  background-color: var(--green-bg, #e8f5e9);
}
:deep(.schedule-slot.status-ipd) {
  background-color: var(--red-bg, #ffebee);
}
:deep(.schedule-slot.tag-chou) {
  background-color: #658ee0;
}
:deep(.schedule-slot.tag-new) {
  background-color: #f5ec8e;
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

.schedule-slot.drag-over {
  background-color: #e9ecef;
  border: 2px dashed #007bff;
}
</style>
