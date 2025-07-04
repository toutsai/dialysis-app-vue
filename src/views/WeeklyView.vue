<!-- 檔案路徑: src/views/WeeklyView.vue (最終功能重構版) -->
<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的工具、常量和元件
import { ORDERED_SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'

// --- 輔助函式 (保持不變) ---
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

// --- API 實例 (保持不變) ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 (保持不變) ---
const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const PATIENT_STATUS = { INPATIENT: 'ipd' }
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅刪除此床當次' },
  { value: 'this_week_for_patient', text: '刪除此病人本週所有排程' },
  { value: 'this_and_future_for_bed', text: '刪除此床此次與未來排程' },
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

// --- 核心狀態 (保持不變) ---
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')
const draggedItem = ref(null)

// ======================= 【修改點 1: 清晰化 UI 狀態】 =======================
const isPatientSelectDialogVisible = ref(false) // 用於輕量級的單次排班
const isProblemSolverDialogVisible = ref(false) // 用於功能強大的智慧排班助理
const currentSlotId = ref(null) // 記錄當前操作的格子 ID

const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const problemsToSolve = ref(null)
// ============================= 【修改結束】 ==============================

// --- 計算屬性 (保持不變) ---
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

function isDateInPast(dayIndex) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const scheduleDate = new Date(currentWeekStartDate.value)
  scheduleDate.setDate(scheduleDate.getDate() + dayIndex)
  return scheduleDate < today
}

function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}

// 核心的更新函式，增加了歷史資料保護
function handleSlotUpdate(weeklySlotId, patientId, manualNote = '') {
  const [bed, shiftIndexStr, dayIndexStr] = weeklySlotId.split('-')
  const dayIndex = parseInt(dayIndexStr, 10)

  // 【原則二】歷史資料保護
  if (isDateInPast(dayIndex)) {
    alert('無法修改已過去的排程。')
    return
  }

  const dateStr = weekDates.value[dayIndex]?.queryDate
  if (!dateStr) return

  if (!weekScheduleRecords.value.has(dateStr)) {
    weekScheduleRecords.value.set(dateStr, { id: null, date: dateStr, schedule: {} })
  }
  const dailyRecord = weekScheduleRecords.value.get(dateStr)

  const shiftCode = SHIFTS[parseInt(shiftIndexStr, 10)]
  if (!shiftCode) return

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

// ======================= 【修改點 2: 表格點擊事件的統一入口】 =======================
function handleGridClick(slotId) {
  const dayIndex = parseInt(slotId.split('-')[2], 10)

  // 【原則二】歷史資料保護
  if (isDateInPast(dayIndex)) {
    return // 對過去的日期，不執行任何操作
  }

  const slotData = weekScheduleMap.value[slotId]

  // 根據格子是否有病人，決定打開哪個對話框
  if (slotData?.patientId) {
    // 格子裡有病人 -> 打開清除選項
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    // 格子是空的 -> 打開輕量級的單次排班選人框
    currentSlotId.value = slotId
    isPatientSelectDialogVisible.value = true
  }
}
// ============================= 【修改結束】 ==============================

// ======================= 【修改點 3: 新增單次排班的處理函式】 =======================
// 這個函式專門處理來自 PatientSelectDialog (輕量選人框) 的事件
function handlePatientSelect({ patientId }) {
  if (!patientId || !currentSlotId.value) return

  const patient = patientMap.value.get(patientId)
  if (!patient) return

  // 【原則一】統一資料結構，生成一致的 manualNote
  const manualNote = patient.baseNote || (patient.status === 'ipd' ? '住' : '')

  handleSlotUpdate(currentSlotId.value, patientId, manualNote)

  // 操作完成後關閉對話框
  isPatientSelectDialogVisible.value = false
  currentSlotId.value = null
}
// ============================= 【修改結束】 ==============================

// 這個函式專門處理來自 BedAssignmentDialog (智慧助理) 的事件，按頻率排班 (保持不變)
function handleAssignBed({ patientId, bedNum, shiftCode }) {
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)
  if (shiftIndex === -1 || dayIndices.length === 0) return

  const assignableSlots = []
  dayIndices.forEach((dayIndex) => {
    // 【原則二】歷史資料保護
    if (!isDateInPast(dayIndex)) {
      const weeklySlotId = `${bedNum}-${shiftIndex}-${dayIndex}`
      if (!weekScheduleMap.value[weeklySlotId]?.patientId) {
        assignableSlots.push(weeklySlotId)
      }
    }
  })

  assignableSlots.forEach((weeklySlotId) => {
    const manualNote = patient.baseNote || (patient.status === 'ipd' ? '住' : '')
    handleSlotUpdate(weeklySlotId, patientId, manualNote)
  })
}

// 清除排班的函式，增加了歷史資料保護 (保持不變)
function handleClearSelect(selectedValue) {
  if (!clearingSlotId.value) return
  const patientIdToClear = weekScheduleMap.value[clearingSlotId.value]?.patientId
  const [bed, shiftIndex, startDayIndex] = clearingSlotId.value.split('-').map(Number)

  if (isDateInPast(startDayIndex) && selectedValue !== 'this_week_for_patient') {
    alert('無法修改已過去的排程。')
    isClearDialogVisible.value = false
    return
  }

  if (selectedValue === 'single') {
    handleSlotUpdate(clearingSlotId.value, null)
  } else if (selectedValue === 'this_week_for_patient') {
    if (patientIdToClear) {
      for (const slotId in weekScheduleMap.value) {
        const currentDayIndex = parseInt(slotId.split('-')[2], 10)
        if (
          weekScheduleMap.value[slotId]?.patientId === patientIdToClear &&
          !isDateInPast(currentDayIndex) // 【原則二】
        ) {
          handleSlotUpdate(slotId, null)
        }
      }
    }
  } else if (selectedValue === 'this_and_future_for_bed') {
    for (let i = startDayIndex; i < 6; i++) {
      if (!isDateInPast(i)) {
        // 【原則二】
        const weeklySlotId = `${bed}-${shiftIndex}-${i}`
        if (weekScheduleMap.value[weeklySlotId]?.patientId === patientIdToClear) {
          handleSlotUpdate(weeklySlotId, null)
        }
      }
    }
  }

  isClearDialogVisible.value = false
  clearingSlotId.value = null
}

// --- 其他所有函式保持不變，此處為節省篇幅省略 ---
// (包括: onDrop, onDragStart, onSidebarDragStart, onDragOver, onDragLeave,
//  loadAllData, saveChangesToCloud, changeWeek, goToToday, loadBaseSchedule,
//  runScheduleCheck, handleReviewAndAssign, getWeeklyCellStyle, 等)
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
    loadAllData()
  }
}
function onDrop(event, targetSlotId) {
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop) return

  const targetDayIndex = parseInt(targetSlotId.split('-')[2], 10)
  if (isDateInPast(targetDayIndex)) {
    console.warn('無法拖曳到已過去的日期。')
    return
  }

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
  if (!confirm('確定要載入常規班表嗎？這將會覆蓋【今天及未來】的所有排班。')) return
  statusText.value = '正在載入常規班表...'
  try {
    const masterRecord = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
    if (!masterRecord || !masterRecord.schedule) {
      alert('找不到常規班表範本 (MASTER_SCHEDULE)，沒有資料可以載入。')
      statusText.value = '常規班表為空'
      return
    }

    weekDates.value.forEach((day, dayIndex) => {
      if (!isDateInPast(dayIndex) && weekScheduleRecords.value.has(day.queryDate)) {
        weekScheduleRecords.value.get(day.queryDate).schedule = {}
      }
    })

    const baseSchedule = masterRecord.schedule
    for (const weeklySlotId in baseSchedule) {
      const baseSlotData = baseSchedule[weeklySlotId]
      if (baseSlotData && baseSlotData.patientId) {
        const dayIndex = parseInt(weeklySlotId.split('-')[2], 10)
        if (!isDateInPast(dayIndex)) {
          handleSlotUpdate(
            weeklySlotId,
            baseSlotData.patientId,
            baseSlotData.manualNote || baseSlotData.note || '',
          )
        }
      }
    }
    statusText.value = '常規班表已載入至未來排程，請記得儲存。'
    setChange()
  } catch (error) {
    console.error('載入常規班表失敗:', error)
    statusText.value = '載入失敗'
  }
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
    alertDialogMessage.value = '未發現本週有未排床的病人。'
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
  const dayIndex = parseInt(slotId.split('-')[2], 10)
  if (isDateInPast(dayIndex)) {
    event.preventDefault()
    return
  }
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
  if (targetSlot && !targetSlot.classList.contains('is-past')) {
    targetSlot.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}
onMounted(() => {
  loadAllData()
  window.addEventListener('schedule-updated', handleScheduleUpdate)
})
onUnmounted(() => {
  window.removeEventListener('schedule-updated', handleScheduleUpdate)
})
</script>

<template>
  <div>
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

          <!-- ======================= 【修改點 4: 統一事件綁定】 ======================= -->
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
            @grid-click="handleGridClick"
            @drop="onDrop"
            @drag-start="onDragStart"
            @drag-over="onDragOver"
            @drag-leave="onDragLeave"
          />
          <!-- ============================= 【修改結束】 ============================== -->
        </div>

        <InpatientSidebar
          :patients="allPatients"
          :scheduled-ids="scheduledPatientIds"
          @drag-start="onSidebarDragStart"
        />
      </main>
    </div>

    <!-- ======================= 【修改點 5: 新增與配置對話框】 ======================= -->
    <!-- 智慧排班助理 (由按鈕觸發) -->
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

    <!-- 輕量選人框 (由點擊空格觸發) -->
    <PatientSelectDialog
      :is-visible="isPatientSelectDialogVisible"
      title="選擇病人 (單次排班)"
      :patients="allPatients"
      :show-fill-options="false"
      @confirm="handlePatientSelect"
      @cancel="isPatientSelectDialogVisible = false"
    />
    <!-- ============================= 【修改結束】 ============================== -->

    <!-- 其他對話框 (保持不變) -->
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
/* 樣式保持不變，因此省略以保持簡潔 */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100%;
  overflow: hidden;
}
.page-header {
  border-bottom: 1px solid #dee2e6;
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
  font-size: 28px;
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
