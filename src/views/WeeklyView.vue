<!-- 檔案路徑: src/views/WeeklyView.vue (檔案結構與邏輯修正的最終完整版) -->
<template>
  <div>
    <div class="page-container">
      <header class="page-header">
        <div class="header-toolbar">
          <div class="toolbar-left">
            <h1 class="page-title">週排班表</h1>
            <div class="date-navigator">
              <button @click="changeWeek(-7)">< 上一週</button>
              <span class="week-display-text">{{ weekDisplay }}</span>
              <button @click="changeWeek(7)">下一週 ></button>
            </div>
            <div class="main-actions">
              <button @click="goToToday">回到本週</button>
              <button class="btn btn-warning" @click="runScheduleCheck">排程檢視</button>
              <button
                class="btn btn-info"
                @click="openBedAssignmentDialog"
                :disabled="isPageLocked"
              >
                智慧排床
              </button>
              <div class="search-container">
                <input
                  type="text"
                  v-model="searchQuery"
                  class="patient-search-input"
                  placeholder="搜尋病人姓名/病歷號..."
                  @focus="isSearchFocused = true"
                  @blur="handleSearchBlur"
                />
                <ul v-if="searchResults.length > 0 && isSearchFocused" class="search-results">
                  <li
                    v-for="patient in searchResults"
                    :key="patient.id"
                    @click="locatePatientOnGrid(patient.id)"
                  >
                    {{ patient.name }} - {{ patient.medicalRecordNumber }}
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div class="main-actions">
            <span class="status-text">{{ statusText }}</span>
            <button
              class="btn-save"
              :disabled="!hasUnsavedChanges || isPageLocked"
              @click="saveChangesToCloud"
            >
              儲存變更
            </button>
          </div>
        </div>
      </header>

      <main class="page-main-content">
        <div class="schedule-area">
          <div class="stats-toolbar-wrapper" :style="{ paddingLeft: `${leftOffset}px` }">
            <StatsToolbar
              :stats-data="statsToolbarData"
              :weekdays="statsToolbarWeekdays"
              :column-widths="columnWidths"
              size="compact"
            />
          </div>
          <!-- ✨ 核心修正 1：將 show-memos 事件綁定到對應的函式 -->
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
            :is-date-in-past="isDateInPast"
            :patient-with-memo-ids="patientWithMemoIds"
            :is-page-locked="isPageLocked"
            @grid-click="handleGridClick"
            @drop="onDrop"
            @drag-start="onDragStart"
            @drag-over="onDragOver"
            @dragleave="onDragLeave"
            @show-memos="showPatientMemos"
            @update:column-widths="updateColumnWidths"
            @update:left-offset="updateLeftOffset"
          />
        </div>
        <InpatientSidebar
          :patients="allPatients"
          :scheduled-ids="scheduledPatientIds"
          @drag-start="onSidebarDragStart"
          :class="{ 'sidebar-locked': isPageLocked }"
        />
      </main>
    </div>

    <!-- Modals -->
    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedAssignmentDialog
      :is-visible="isProblemSolverDialogVisible"
      title="智慧排床助理"
      :all-patients="allPatients"
      :bed-layout="bedLayout"
      :schedule-data="weekScheduleMap"
      :shifts="SHIFTS"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      :predefined-patient-groups="problemsToSolve"
      assignment-mode="frequency"
      :is-page-locked="isPageLocked"
      @close="isProblemSolverDialogVisible = false"
      @assign-bed="handleAssignBed"
    />
    <!-- ✨ 核心修正 2：傳入 show-fill-options="true" -->
    <PatientSelectDialog
      :is-visible="isPatientSelectDialogVisible"
      title="選擇病人排班"
      :patients="allPatients"
      :show-fill-options="true"
      :is-page-locked="isPageLocked"
      @confirm="handlePatientSelect"
      @cancel="isPatientSelectDialogVisible = false"
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
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted, provide, nextTick } from 'vue'
import { where } from 'firebase/firestore'
import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'
import { useAuth } from '@/composables/useAuth.js'
import { useScheduleAnalysis } from '@/composables/useScheduleAnalysis.js'
import { ORDERED_SHIFT_CODES } from '@/constants/scheduleConstants'
import {
  createEmptySlotData,
  generateAutoNote,
  getUnifiedCellStyle,
} from '@/utils/scheduleUtils.js'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'

// --- Helper Functions ---
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
function getWeeklyCellStyle(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  const patient = patientMap.value.get(slotData?.patientId)
  return getUnifiedCellStyle(slotData, patient)
}

// --- Constants ---
const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此床' },
  { value: 'this_week_for_patient', text: '刪除病人本週所有排程' },
]
const bedLayout = [
  1,
  2,
  3,
  5,
  6,
  7,
  8,
  9,
  11,
  12,
  13,
  15,
  16,
  17,
  18,
  19,
  21,
  22,
  23,
  25,
  26,
  27,
  28,
  29,
  31,
  32,
  33,
  35,
  36,
  37,
  38,
  39,
  51,
  52,
  53,
  55,
  56,
  57,
  58,
  59,
  61,
  62,
  63,
  65,
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
].sort((a, b) => {
  const numA = typeof a === 'number' ? a : Infinity
  const numB = typeof b === 'number' ? b : Infinity
  if (numA !== Infinity || numB !== Infinity) return numA - numB
  return String(a).localeCompare(String(b))
})
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

// --- Reactive State ---
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')
const draggedItem = ref(null)
const columnWidths = ref([])
const leftOffset = ref(0)
const isPatientSelectDialogVisible = ref(false)
const isProblemSolverDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const searchQuery = ref('')
const isSearchFocused = ref(false)
const auth = useAuth()
const isPageLocked = computed(() => !auth.canEditSchedules.value)

// --- Computed Properties ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const weekDisplay = computed(() => {
  const start = new Date(currentWeekStartDate.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 5)
  return `${formatDate(start, true)} ~ ${formatDate(end, true)}`
})
const weekDates = computed(() =>
  Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(currentWeekStartDate.value)
    d.setDate(d.getDate() + i)
    return { weekday: WEEKDAYS[i], date: `(${formatDate(d)})`, queryDate: formatDateForQuery(d) }
  }),
)
const weekScheduleMap = computed(() => {
  const combinedSchedule = {}
  weekDates.value.forEach((day, dayIndex) => {
    const dailyRecord = weekScheduleRecords.value.get(day.queryDate)
    if (dailyRecord && dailyRecord.schedule) {
      for (const idInDailySchedule in dailyRecord.schedule) {
        const slotData = dailyRecord.schedule[idInDailySchedule]
        if (slotData) {
          const parts = idInDailySchedule.split('-')
          let bedNumber, shiftCode
          if (parts[0] === 'peripheral') {
            bedNumber = `${parts[0]}-${parts[1]}`
            shiftCode = parts[parts.length - 1]
          } else {
            bedNumber = parts[1]
            shiftCode = parts[parts.length - 1]
          }
          const shiftIndex = SHIFTS.indexOf(shiftCode)
          if (bedNumber !== undefined && shiftIndex !== -1) {
            const weeklySlotId = `${bedNumber}-${shiftIndex}-${dayIndex}`
            combinedSchedule[weeklySlotId] = slotData
          }
        }
      }
    }
  })
  return combinedSchedule
})
const { globallyUnassignedPatients, scheduledPatientIds } = useScheduleAnalysis(
  allPatients,
  weekScheduleMap,
  FREQ_MAP_TO_DAY_INDEX,
)
const problemsToSolve = computed(() => ({
  '本週未排床病人 (有頻率)': globallyUnassignedPatients.value,
}))
const statsToolbarData = computed(() => {
  const baseData = WEEKDAYS.map(() => ({
    counts: {
      early: { total: 0, opd: 0, ipd: 0, er: 0 },
      noon: { total: 0, opd: 0, ipd: 0, er: 0 },
      late: { total: 0, opd: 0, ipd: 0, er: 0 },
    },
    total: 0,
  }))
  const localPatientMap = new Map(allPatients.value.map((p) => [p.id, p]))
  for (const [dateStr, record] of weekScheduleRecords.value.entries()) {
    if (record && record.schedule) {
      const d = new Date(dateStr + 'T00:00:00')
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dayIndex >= 0 && dayIndex < 6 && baseData[dayIndex]) {
        for (const slotData of Object.values(record.schedule)) {
          if (slotData && slotData.patientId && slotData.shiftId) {
            const patient = localPatientMap.get(slotData.patientId)
            if (!patient) continue
            const shiftCode = slotData.shiftId
            if (shiftCode && baseData[dayIndex].counts[shiftCode]) {
              const shiftStats = baseData[dayIndex].counts[shiftCode]
              shiftStats.total++
              baseData[dayIndex].total++
              if (patient.status === 'opd') shiftStats.opd++
              else if (patient.status === 'ipd') shiftStats.ipd++
              else if (patient.status === 'er') shiftStats.er++
            }
          }
        }
      }
    }
  }
  return baseData
})
const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))
const searchResults = computed(() => {
  if (!searchQuery.value) return []
  const query = searchQuery.value.toLowerCase()
  return allPatients.value
    .filter((p) => {
      const nameMatch = p.name && p.name.toLowerCase().includes(query)
      const mrnMatch = p.medicalRecordNumber && p.medicalRecordNumber.includes(query)
      return nameMatch || mrnMatch
    })
    .slice(0, 5)
})

// --- Functions ---
function updateLeftOffset(newOffset) {
  leftOffset.value = newOffset
}
function updateColumnWidths(newWidths) {
  columnWidths.value = newWidths
}
function locatePatientOnGrid(patientId) {
  searchQuery.value = ''
  isSearchFocused.value = false
  const targetSlotId = Object.keys(weekScheduleMap.value).find(
    (slotId) => weekScheduleMap.value[slotId]?.patientId === patientId,
  )
  if (!targetSlotId) {
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '該病人本週無排班。'
    isAlertDialogVisible.value = true
    return
  }
  nextTick(() => {
    const targetElement = document.querySelector(`[data-slot-id="${targetSlotId}"]`)
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
      targetElement.classList.add('highlight-flash')
      setTimeout(() => targetElement.classList.remove('highlight-flash'), 2000)
    }
  })
}
function handleSearchBlur() {
  setTimeout(() => {
    isSearchFocused.value = false
  }, 200)
}
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && memo.status === 'pending',
  )
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}
function isDateInPast(dayIndex) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const scheduleDate = new Date(currentWeekStartDate.value)
  scheduleDate.setDate(scheduleDate.getDate() + dayIndex)
  return scheduleDate.getTime() < today.getTime()
}
function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}
function getDailyShiftIdFromWeekly(weeklySlotId) {
  if (!weeklySlotId) return null
  const parts = weeklySlotId.split('-')
  const bed = parts.slice(0, -2).join('-')
  const shiftIndexStr = parts[parts.length - 2]
  const dayIndexStr = parts[parts.length - 1]
  const dayIndex = parseInt(dayIndexStr, 10)
  const dateStr = weekDates.value[dayIndex]?.queryDate
  const shiftCode = SHIFTS[parseInt(shiftIndexStr, 10)]
  if (!dateStr || !shiftCode) return null
  return {
    dateStr,
    dailyShiftId: bed.startsWith('peripheral') ? `${bed}-${shiftCode}` : `bed-${bed}-${shiftCode}`,
  }
}
function handleSlotUpdate(weeklySlotId, slotData) {
  if (isPageLocked.value) return
  const targetInfo = getDailyShiftIdFromWeekly(weeklySlotId)
  if (!targetInfo) return
  const { dateStr, dailyShiftId } = targetInfo
  if (isDateInPast(weekDates.value.findIndex((d) => d.queryDate === dateStr))) {
    alertDialogTitle.value = '操作禁止'
    alertDialogMessage.value = '無法修改已過去的排程。'
    isAlertDialogVisible.value = true
    return
  }
  const newWeekRecords = new Map(weekScheduleRecords.value)
  const oldRecord = newWeekRecords.get(dateStr) || {
    id: null,
    date: dateStr,
    schedule: {},
    names: {},
  }
  const newDailySchedule = { ...oldRecord.schedule }
  if (slotData && slotData.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    const shiftCode = dailyShiftId.split('-').pop()
    newDailySchedule[dailyShiftId] = {
      ...createEmptySlotData(dailyShiftId),
      ...slotData,
      shiftId: shiftCode,
      autoNote: patient ? generateAutoNote(patient) : '',
    }
  } else {
    delete newDailySchedule[dailyShiftId]
  }
  newWeekRecords.set(dateStr, { ...oldRecord, schedule: newDailySchedule })
  weekScheduleRecords.value = newWeekRecords
  setChange()
}
function handleGridClick(slotId) {
  const dayIndex = parseInt(slotId.split('-').pop(), 10)
  if (isPageLocked.value || isDateInPast(dayIndex)) {
    const patientId = weekScheduleMap.value[slotId]?.patientId
    if (patientId) showPatientMemos(patientId)
    return
  }
  const slotData = weekScheduleMap.value[slotId]
  if (slotData?.patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    currentSlotId.value = slotId
    isPatientSelectDialogVisible.value = true
  }
}
function handlePatientSelect({ patientId, fillType }) {
  if (isPageLocked.value || !patientId || !currentSlotId.value) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  isPatientSelectDialogVisible.value = false
  const newPatientData = {
    patientId,
    manualNote: patient.baseNote || (patient.status === 'ipd' ? '住' : ''),
  }
  if (fillType === 'single') {
    handleSlotUpdate(currentSlotId.value, newPatientData)
  } else if (fillType === 'frequency') {
    const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
    if (dayIndices.length === 0) {
      alertDialogTitle.value = '排班提示'
      alertDialogMessage.value = `病人 ${patient.name} 未設定有效頻率，僅單次排入。`
      isAlertDialogVisible.value = true
      handleSlotUpdate(currentSlotId.value, newPatientData)
      currentSlotId.value = null
      return
    }
    const conflicts = []
    const parts = currentSlotId.value.split('-')
    const bed = parts.slice(0, -2).join('-')
    const shiftIndex = parts[parts.length - 2]
    dayIndices.forEach((dayIndex) => {
      if (!isDateInPast(dayIndex)) {
        const weeklySlotId = `${bed}-${shiftIndex}-${dayIndex}`
        if (weekScheduleMap.value[weeklySlotId]?.patientId) conflicts.push(`${WEEKDAYS[dayIndex]}`)
      }
    })
    if (conflicts.length > 0) {
      alertDialogTitle.value = '排班衝突'
      alertDialogMessage.value = `無法依頻率排入，以下日期的床位已被佔用：\n${conflicts.join(', ')}`
      isAlertDialogVisible.value = true
    } else {
      dayIndices.forEach((dayIndex) => {
        if (!isDateInPast(dayIndex)) {
          const weeklySlotId = `${bed}-${shiftIndex}-${dayIndex}`
          handleSlotUpdate(weeklySlotId, newPatientData)
        }
      })
    }
  }
  currentSlotId.value = null
}
function handleAssignBed({ patientId, bedNum, shiftCode }) {
  if (isPageLocked.value) return
  const patient = patientMap.value.get(patientId)
  if (!patient || !patient.freq) return
  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)
  if (shiftIndex === -1 || dayIndices.length === 0) return
  const newPatientData = {
    patientId,
    manualNote:
      patient.baseNote || (patient.status === 'ipd' ? '住' : patient.status === 'er' ? '急' : ''),
  }
  dayIndices.forEach((dayIndex) => {
    if (!isDateInPast(dayIndex)) {
      const weeklySlotId = `${bedNum}-${shiftIndex}-${dayIndex}`
      if (!weekScheduleMap.value[weeklySlotId]?.patientId)
        handleSlotUpdate(weeklySlotId, newPatientData)
    }
  })
  isProblemSolverDialogVisible.value = false
}
function handleClearSelect(selectedValue) {
  if (isPageLocked.value || !clearingSlotId.value) return
  const patientIdToClear = weekScheduleMap.value[clearingSlotId.value]?.patientId
  const startDayIndex = parseInt(clearingSlotId.value.split('-').pop(), 10)
  if (isDateInPast(startDayIndex) && selectedValue !== 'this_week_for_patient') {
    alertDialogTitle.value = '操作禁止'
    alertDialogMessage.value = '無法修改已過去的排程。'
    isAlertDialogVisible.value = true
    isClearDialogVisible.value = false
    return
  }
  if (selectedValue === 'single') {
    handleSlotUpdate(clearingSlotId.value, null)
  } else if (selectedValue === 'this_week_for_patient') {
    if (patientIdToClear) {
      for (const slotId in weekScheduleMap.value) {
        const currentDayIndex = parseInt(slotId.split('-').pop(), 10)
        if (
          weekScheduleMap.value[slotId]?.patientId === patientIdToClear &&
          !isDateInPast(currentDayIndex)
        ) {
          handleSlotUpdate(slotId, null)
        }
      }
    }
  }
  isClearDialogVisible.value = false
  clearingSlotId.value = null
}
async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  statusText.value = '儲存中...'
  try {
    const promises = []
    for (const date of weekDates.value.map((d) => d.queryDate)) {
      const dailyRecord = weekScheduleRecords.value.get(date)
      if (dailyRecord) {
        const scheduleToSave = {}
        for (const shiftId in dailyRecord.schedule) {
          const slotData = dailyRecord.schedule[shiftId]
          if (slotData && slotData.patientId) {
            const cleanSlotData = {
              patientId: slotData.patientId,
              shiftId: slotData.shiftId,
              autoNote: slotData.autoNote || '',
              manualNote: slotData.manualNote || '',
            }
            if (cleanSlotData.shiftId === undefined) {
              console.error(
                `❌ 儲存中止！在日期 ${date} 的排班格 ${shiftId} 中，shiftId 的值是 undefined。`,
                slotData,
              )
              alertDialogTitle.value = '儲存失敗'
              alertDialogMessage.value = `資料錯誤：在 ${date} 的排班中發現無效資料（shiftId 未定義），無法儲存。請重新整理頁面後，再進行操作。`
              isAlertDialogVisible.value = true
              statusText.value = '儲存失敗'
              return
            }
            scheduleToSave[shiftId] = cleanSlotData
          }
        }
        const dataToSave = { date, schedule: scheduleToSave }
        if (dailyRecord.id) {
          promises.push(optimizedUpdateSchedule(dailyRecord.id, dataToSave))
        } else if (Object.keys(scheduleToSave).length > 0) {
          promises.push(optimizedSaveSchedule(dataToSave))
        }
      }
    }
    await Promise.all(promises)
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '週排班已成功儲存！'
    isAlertDialogVisible.value = true
    await loadAllData()
  } catch (error) {
    console.error('❌ [WeeklyView] 儲存失敗:', error)
    statusText.value = '儲存失敗'
    alertDialogMessage.value = `儲存失敗：${error.message}`
    isAlertDialogVisible.value = true
  }
}
function onDrop(event, targetWeeklySlotId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
  const dragged = draggedItem.value
  if (!dragged) return
  const targetDayIndex = parseInt(targetWeeklySlotId.split('-').pop(), 10)
  if (isDateInPast(targetDayIndex)) {
    console.warn('無法拖曳到已過去的日期。')
    draggedItem.value = null
    return
  }
  const sourceWeeklySlotId = dragged.source
  const sourceSlotData = { ...dragged.data }
  const targetSlotData = { ...weekScheduleMap.value[targetWeeklySlotId] }
  if (targetSlotData && targetSlotData.patientId) {
    if (sourceWeeklySlotId === 'sidebar') {
      alertDialogTitle.value = '操作失敗'
      alertDialogMessage.value = '目標床位已被佔用，無法從側邊欄拖曳至此。'
      isAlertDialogVisible.value = true
      draggedItem.value = null
      return
    }
    const sourceDayIndex = parseInt(sourceWeeklySlotId.split('-').pop(), 10)
    if (isDateInPast(sourceDayIndex)) {
      console.warn('無法從過去的日期拖曳項目進行交換。')
      draggedItem.value = null
      return
    }
    handleSlotUpdate(targetWeeklySlotId, sourceSlotData)
    handleSlotUpdate(sourceWeeklySlotId, targetSlotData)
  } else {
    handleSlotUpdate(targetWeeklySlotId, sourceSlotData)
    if (sourceWeeklySlotId !== 'sidebar') {
      handleSlotUpdate(sourceWeeklySlotId, null)
    }
  }
  draggedItem.value = null
}
function onDragStart(event, slotId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const dayIndex = parseInt(slotId.split('-').pop(), 10)
  if (isDateInPast(dayIndex)) {
    event.preventDefault()
    return
  }
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  draggedItem.value = { source: slotId, data: { ...slotData } }
  event.dataTransfer.effectAllowed = 'move'
}
function onSidebarDragStart(event, patient) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  if (!patient || !patient.id) {
    event.preventDefault()
    return
  }
  draggedItem.value = {
    source: 'sidebar',
    data: { patientId: patient.id, manualNote: patient.status === 'ipd' ? '住' : '' },
  }
  event.dataTransfer.effectAllowed = 'move'
}
function showConfirmDialog(title, message, onConfirm) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmAction.value = onConfirm
  isConfirmDialogVisible.value = true
}
function changeWeek(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    showConfirmDialog('未儲存的變更', '您有未儲存的變更，確定要切換日期嗎？', () => {
      const newDate = new Date(currentWeekStartDate.value)
      newDate.setDate(newDate.getDate() + days)
      currentWeekStartDate.value = newDate
      loadAllData()
    })
  } else {
    const newDate = new Date(currentWeekStartDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentWeekStartDate.value = newDate
    loadAllData()
  }
}
function goToToday() {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    showConfirmDialog('未儲存的變更', '您有未儲存的變更，確定要切換到本週嗎？', () => {
      currentWeekStartDate.value = getStartOfWeek(new Date())
      loadAllData()
    })
  } else {
    currentWeekStartDate.value = getStartOfWeek(new Date())
    loadAllData()
  }
}
async function loadAllData() {
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    const startDate = formatDateForQuery(currentWeekStartDate.value)
    const tempDate = new Date(currentWeekStartDate.value)
    tempDate.setDate(tempDate.getDate() + 5)
    const endDate = formatDateForQuery(tempDate)
    const [patients, schedules, memos] = await Promise.all([
      optimizedFetchAllPatients(),
      optimizedFetchAllSchedules([where('date', '>=', startDate), where('date', '<=', endDate)]),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
    ])
    allPatients.value = patients.filter((p) => !p.isDeleted)
    activeMemos.value = memos
    const localPatientMap = new Map(allPatients.value.map((p) => [p.id, p]))
    const newWeekRecords = new Map()
    weekDates.value.forEach((day) => {
      newWeekRecords.set(day.queryDate, { id: null, date: day.queryDate, schedule: {} })
    })
    schedules.forEach((record) => {
      if (record.schedule) {
        for (const shiftId in record.schedule) {
          const slotData = record.schedule[shiftId]
          if (slotData && slotData.patientId && localPatientMap.has(slotData.patientId)) {
            const patient = localPatientMap.get(slotData.patientId)
            slotData.autoNote = patient ? generateAutoNote(patient) : ''
            slotData.manualNote = slotData.manualNote || ''
          } else if (slotData && slotData.patientId) {
            console.warn(
              `[WeeklyView] 在日期 ${record.date} 的排程中發現無效的病人ID ${slotData.patientId}，將其忽略。`,
            )
            delete record.schedule[shiftId]
          }
        }
      }
      newWeekRecords.set(record.date, record)
    })
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
  } catch (error) {
    console.error('❌ [WeeklyView] 讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
  }
}
function handleScheduleUpdate(event) {
  const { date } = event.detail
  if (weekDates.value.some((d) => d.queryDate === date)) {
    console.log(`🔄 [WeeklyView] 監聽到日期 ${date} 的變更，正在重新載入本週資料...`)
    loadAllData()
  }
}
function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot) {
    const slotId = targetSlot.dataset.slotId
    if (slotId) {
      const dayIndex = parseInt(slotId.split('-').pop(), 10)
      if (!isDateInPast(dayIndex)) {
        targetSlot.classList.add('drag-over')
      }
    }
  }
}
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}
function runScheduleCheck() {
  const validationResult = {
    duplicates: [],
    freqMismatch: [],
    unassignedCrucial: [],
    unassignedAll: [],
  }

  for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
    if (isDateInPast(dayIndex)) continue
    const dayPatients = new Map()
    for (const slotId in weekScheduleMap.value) {
      const parts = slotId.split('-')
      let slotDayIndex, shiftIndex, bedInfo
      if (parts[0] === 'peripheral') {
        bedInfo = `外圍床位${parts[1]}`
        shiftIndex = parseInt(parts[2], 10)
        slotDayIndex = parseInt(parts[3], 10)
      } else {
        bedInfo = `${parts[0]}號床`
        shiftIndex = parseInt(parts[1], 10)
        slotDayIndex = parseInt(parts[2], 10)
      }
      if (slotDayIndex === dayIndex) {
        const slotData = weekScheduleMap.value[slotId]
        if (slotData?.patientId) {
          const patient = patientMap.value.get(slotData.patientId)
          if (patient) {
            const shiftNames = { 0: '早班', 1: '午班', 2: '晚班' }
            const shiftName = shiftNames[shiftIndex] || '未知班次'
            if (!dayPatients.has(patient.name)) {
              dayPatients.set(patient.name, [])
            }
            dayPatients.get(patient.name).push(`${bedInfo}${shiftName}`)
          }
        }
      }
    }
    for (const [patientName, locations] of dayPatients.entries()) {
      if (locations.length > 1) {
        validationResult.duplicates.push(
          `${WEEKDAYS[dayIndex]}: ${patientName} 重複排班 (${locations.join('、')})`,
        )
      }
    }
  }

  const scheduledPatientIds = new Set()
  for (const slotId in weekScheduleMap.value) {
    const slotData = weekScheduleMap.value[slotId]
    if (slotData?.patientId) {
      const dayIndex = parseInt(slotId.split('-').pop(), 10)
      if (!isDateInPast(dayIndex)) {
        scheduledPatientIds.add(slotData.patientId)
      }
    }
  }

  const unassignedCrucialPatients = allPatients.value.filter(
    (p) =>
      !scheduledPatientIds.has(p.id) &&
      (p.status === 'ipd' || p.status === 'er') &&
      !p.isDeleted &&
      !p.isDiscontinued,
  )
  unassignedCrucialPatients.forEach((p) =>
    validationResult.unassignedCrucial.push(`${p.name} (${p.status === 'ipd' ? '住院' : '急診'})`),
  )
  const unassignedAllPatients = allPatients.value.filter(
    (p) => !scheduledPatientIds.has(p.id) && !p.isDeleted && !p.isDiscontinued,
  )
  unassignedAllPatients.forEach((p) => {
    const statusText =
      p.status === 'opd'
        ? '門診'
        : p.status === 'ipd'
          ? '住院'
          : p.status === 'er'
            ? '急診'
            : '未知'
    validationResult.unassignedAll.push(`${p.name} (${statusText})`)
  })

  const patientSchedules = new Map()
  for (const slotId in weekScheduleMap.value) {
    const slotData = weekScheduleMap.value[slotId]
    if (slotData?.patientId) {
      const dayIndex = parseInt(slotId.split('-').pop(), 10)
      if (!isDateInPast(dayIndex)) {
        if (!patientSchedules.has(slotData.patientId)) {
          patientSchedules.set(slotData.patientId, new Set())
        }
        patientSchedules.get(slotData.patientId).add(dayIndex)
      }
    }
  }
  for (const [patientId, scheduledDays] of patientSchedules.entries()) {
    const patient = patientMap.value.get(patientId)
    if (!patient || !patient.freq || patient.status !== 'opd') continue
    const expectedDays = new Set(
      (FREQ_MAP_TO_DAY_INDEX[patient.freq] || []).filter((dayIndex) => !isDateInPast(dayIndex)),
    )
    if (
      scheduledDays.size !== expectedDays.size ||
      ![...scheduledDays].every((day) => expectedDays.has(day))
    ) {
      const actualDaysText = [...scheduledDays]
        .sort()
        .map((d) => WEEKDAYS[d].replace('星期', ''))
        .join('')
      const expectedDaysText = [...expectedDays]
        .sort()
        .map((d) => WEEKDAYS[d].replace('星期', ''))
        .join('')
      validationResult.freqMismatch.push(
        `${patient.name} (頻率: ${patient.freq}) - 實際排程: 週${actualDaysText || '無'}, 應排程: 週${expectedDaysText}`,
      )
    }
  }

  let issueMessage = ''
  if (validationResult.unassignedCrucial.length > 0) {
    issueMessage +=
      '【重要病人未排班】:\n- ' + validationResult.unassignedCrucial.join('\n- ') + '\n\n'
  }
  if (validationResult.duplicates.length > 0) {
    issueMessage += '【重複排班問題】:\n- ' + validationResult.duplicates.join('\n- ') + '\n\n'
  }
  if (validationResult.freqMismatch.length > 0) {
    issueMessage += '【頻率不符問題】:\n- ' + validationResult.freqMismatch.join('\n- ') + '\n\n'
  }
  if (validationResult.unassignedAll.length > 0) {
    issueMessage +=
      '【本週完全未排班病人】:\n- ' + validationResult.unassignedAll.join('\n- ') + '\n\n'
  }

  if (issueMessage) {
    alertDialogTitle.value = '排班檢查結果 (僅未來日期)'
    alertDialogMessage.value = issueMessage
  } else {
    alertDialogTitle.value = '排程檢視完畢'
    alertDialogMessage.value = '✅ 太棒了！未來排程沒有發現問題。'
  }
  isAlertDialogVisible.value = true
}
function openBedAssignmentDialog() {
  if (isPageLocked.value) return
  isProblemSolverDialogVisible.value = true
}

// --- ✨ 核心修正：確保 provide 在頂層被同步呼叫 ---
provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(() => {
  console.log('🚀 [WeeklyView] 組件已掛載，開始初始化...')
  loadAllData()
  window.addEventListener('schedule-updated', handleScheduleUpdate)
})
onUnmounted(() => {
  window.removeEventListener('schedule-updated', handleScheduleUpdate)
})
</script>

<style scoped>
.search-container {
  position: relative;
  display: inline-block;
}

.patient-search-input {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 220px;
  height: 45px;
  box-sizing: border-box;
  transition: all 0.2s;
}

.patient-search-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background-color: white;
  border: 1px solid #ccc;
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.search-results li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.search-results li:last-child {
  border-bottom: none;
}

.search-results li:hover {
  background-color: #f0f0f0;
}

@keyframes highlight-animation {
  0% {
    background-color: #fffbe3;
    outline: 3px solid #f8c000;
  }
  100% {
    background-color: transparent;
    outline: 3px solid transparent;
  }
}

:deep(.highlight-flash) {
  animation: highlight-animation 2s ease-out;
}

.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}

.page-header {
  border-bottom: 1px solid #dee2e6;
  padding: 0 0 20px 0;
  flex-shrink: 0;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
}

.toolbar-left,
.main-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.page-title {
  margin: 0;
  font-size: 32px;
  color: #333;
}

.date-navigator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.week-display-text {
  font-weight: bold;
  font-size: 26px;
  white-space: nowrap;
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

.stats-toolbar-wrapper {
  flex-shrink: 0;
  padding: 0px 8px 8px 0;
  box-sizing: border-box;
  transition: padding-left 0.2s ease-in-out;
}

.schedule-table-component {
  flex-grow: 1;
  overflow: auto;
  border-radius: 8px;
}

.status-text {
  font-style: italic;
  color: #6c757d;
}

.btn,
.btn-save,
button {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
  background-color: #f8f9fa;
  transition: all 0.2s;
  white-space: nowrap;
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

/* 🔥 統一顏色系統 - 基本病人狀態 */
:deep(.schedule-slot.status-opd) {
  background-color: var(--green-bg, #e8f5e9); /* 門診 - 綠色 */
}
:deep(.schedule-slot.status-ipd) {
  background-color: var(--red-bg, #ffebee); /* 住院 - 紅色 */
}
:deep(.schedule-slot.status-er) {
  background-color: var(--purple-bg, #f3e5f5); /* 急診 - 紫色 */
}
:deep(.schedule-slot.status-biweekly) {
  background-color: #ffcc80; /* 兩班 - 橘色 */
}

/* 🔥 統一顏色系統 - 標籤樣式 */
:deep(.schedule-slot.tag-chou) {
  background-color: #658ee0; /* 抽血 - 藍色 */
}
:deep(.schedule-slot.tag-new) {
  background-color: #f5ec8e; /* 新診 - 金黃 */
}
:deep(.schedule-slot.tag-huan) {
  background-color: #e0f7fa; /* 換 - 淺青 */
}
:deep(.schedule-slot.tag-liang) {
  background-color: #fff3e0; /* 兩 - 淺橙 */
}
:deep(.schedule-slot.tag-b) {
  background-color: #fff9c4; /* B - 淺黃 */
}

/* 🔥 週視圖特有樣式 - shift-row 系列 */
:deep(.shift-row.status-opd),
:deep(.peripheral-shift-row.status-opd) {
  background-color: #e8f5e9; /* 門診 - 綠色 */
}
:deep(.shift-row.status-ipd),
:deep(.peripheral-shift-row.status-ipd) {
  background-color: #ffebee; /* 住院 - 紅色 */
}
:deep(.shift-row.status-er),
:deep(.peripheral-shift-row.status-er) {
  background-color: #f3e5f5; /* 急診 - 紫色 */
}
:deep(.shift-row.status-biweekly),
:deep(.peripheral-shift-row.status-biweekly) {
  background-color: #ffcc80; /* 兩班 - 橘色 */
}
:deep(.shift-row.tag-chou),
:deep(.peripheral-shift-row.tag-chou) {
  background-color: #658ee0; /* 抽血 - 藍色 */
}
:deep(.shift-row.tag-new),
:deep(.peripheral-shift-row.tag-new) {
  background-color: #f5ec8e; /* 新診 - 金黃 */
}
:deep(.shift-row.tag-huan),
:deep(.peripheral-shift-row.tag-huan) {
  background-color: #e0f7fa; /* 換 - 淺青 */
}
:deep(.shift-row.tag-liang),
:deep(.peripheral-shift-row.tag-liang) {
  background-color: #fff3e0; /* 兩 - 淺橙 */
}
:deep(.shift-row.tag-b),
:deep(.peripheral-shift-row.tag-b) {
  background-color: #fff9c4; /* B - 淺黃 */
}

/* 🔥 病人項目樣式 */
:deep(.patient-item.status-opd) {
  background-color: #e8f5e9; /* 門診 - 綠色 */
}
:deep(.patient-item.status-ipd) {
  background-color: #ffebee; /* 住院 - 紅色 */
}
:deep(.patient-item.status-er) {
  background-color: #f3e5f5; /* 急診 - 紫色 */
}
:deep(.patient-item.status-biweekly) {
  background-color: #ffcc80; /* 兩班 - 橘色 */
}
:deep(.patient-item.tag-chou) {
  background-color: #658ee0; /* 抽血 - 藍色 */
}
:deep(.patient-item.tag-new) {
  background-color: #f5ec8e; /* 新診 - 金黃 */
}
:deep(.patient-item.tag-huan) {
  background-color: #e0f7fa; /* 換 - 淺青 */
}
:deep(.patient-item.tag-liang) {
  background-color: #fff3e0; /* 兩 - 淺橙 */
}
:deep(.patient-item.tag-b) {
  background-color: #fff9c4; /* B - 淺黃 */
}

.main-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.sidebar-locked {
  pointer-events: none;
  opacity: 0.6;
}
</style>
