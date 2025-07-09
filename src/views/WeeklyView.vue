<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
// 【權限修正】: 引入 useAuth
import { useAuth } from '@/composables/useAuth.js'
import { ORDERED_SHIFT_CODES } from '@/constants/scheduleConstants'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'

// --- Helper Functions (保持不變) ---
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

// --- API and Constants (保持不變) ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')
const memosApi = ApiManager('memos')
const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const PATIENT_STATUS = { INPATIENT: 'ipd' }
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅刪除此床當次' },
  { value: 'this_week_for_patient', text: '刪除此病人本週所有排程' },
  { value: 'this_and_future_for_bed', text: '刪除此床此次與未來排程' },
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
  if (numA !== Infinity || numB !== Infinity) {
    return numA - numB
  }
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
const STYLE_PRIORITY = {
  抽: { class: 'tag-chou' },
  新: { class: 'tag-new' },
  住: { class: 'tag-ip' },
  換: { class: 'tag-huan' },
  兩: { class: 'tag-liang' },
  B: { class: 'tag-b' },
}

// --- Reactive State (保持不變) ---
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
const problemsToSolve = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')

// 【權限修正】: 引入權限狀態
const { isAdmin, isEditor, isReadOnly } = useAuth()
// 週排班的編輯權限與日排班相同，只有 Admin 和 Editor 可以編輯
const isPageLocked = computed(() => !isEditor.value && !isAdmin.value)

// --- Helper functions for state (保持不變) ---
function updateLeftOffset(newOffset) {
  leftOffset.value = newOffset
}
function updateColumnWidths(newWidths) {
  columnWidths.value = newWidths
}

// --- Computed Properties (保持不變) ---
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
            const shiftCode = slotData.shiftId.split('-')[2]
            const shiftStats = baseData[dayIndex].counts[shiftCode]
            if (shiftStats) {
              shiftStats.total++
              baseData[dayIndex].total++
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
          let bedNumber, shiftCode
          if (parts[0] === 'bed') {
            bedNumber = parts[1]
            shiftCode = parts[2]
          } else if (parts[0] === 'peripheral') {
            bedNumber = `${parts[0]}-${parts[1]}`
            shiftCode = parts[2]
          }
          if (bedNumber && shiftCode) {
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

// --- Functions and Logic ---
function showPatientMemos(patientId) {
  // 檢視備忘錄不限權限
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && !memo.isResolved,
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
  if (isPageLocked.value) return // 鎖定頁面時不標記變更
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
  if (bed.startsWith('peripheral')) {
    return { dateStr, dailyShiftId: `${bed}-${shiftCode}` }
  } else {
    return { dateStr, dailyShiftId: `bed-${bed}-${shiftCode}` }
  }
}
function handleSlotUpdate(weeklySlotId, slotData) {
  if (isPageLocked.value) return // 權限判斷
  const targetInfo = getDailyShiftIdFromWeekly(weeklySlotId)
  if (!targetInfo) return
  const { dateStr, dailyShiftId } = targetInfo
  if (isDateInPast(weekDates.value.findIndex((d) => d.queryDate === dateStr))) {
    alertDialogTitle.value = '操作禁止'
    alertDialogMessage.value = '無法修改已過去的排程。'
    isAlertDialogVisible.value = true
    return
  }
  const oldRecord = weekScheduleRecords.value.get(dateStr) || {
    id: null,
    date: dateStr,
    schedule: {},
    names: {},
  }
  const newRecord = { ...oldRecord, schedule: { ...oldRecord.schedule } }
  if (slotData && slotData.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    newRecord.schedule[dailyShiftId] = {
      ...createEmptySlotData(dailyShiftId),
      ...slotData,
      autoNote: patient ? generateAutoNote(patient) : '',
    }
  } else {
    delete newRecord.schedule[dailyShiftId]
  }
  weekScheduleRecords.value.set(dateStr, newRecord)
  setChange()
}
function handleGridClick(slotId) {
  if (isPageLocked.value) return // 權限判斷
  const dayIndex = parseInt(slotId.split('-').pop(), 10)
  if (isDateInPast(dayIndex)) {
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
  if (isPageLocked.value) return // 權限判斷
  if (!patientId || !currentSlotId.value) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  isPatientSelectDialogVisible.value = false
  const newPatientData = {
    patientId: patientId,
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
        if (weekScheduleMap.value[weeklySlotId]?.patientId) {
          conflicts.push(`${WEEKDAYS[dayIndex]}`)
        }
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
  if (isPageLocked.value) return // 權限判斷
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)
  if (shiftIndex === -1 || dayIndices.length === 0) return
  const newPatientData = {
    patientId: patientId,
    manualNote: patient.baseNote || (patient.status === 'ipd' ? '住' : ''),
  }
  dayIndices.forEach((dayIndex) => {
    if (!isDateInPast(dayIndex)) {
      const weeklySlotId = `${bedNum}-${shiftIndex}-${dayIndex}`
      if (!weekScheduleMap.value[weeklySlotId]?.patientId) {
        handleSlotUpdate(weeklySlotId, newPatientData)
      }
    }
  })
}
function handleClearSelect(selectedValue) {
  if (isPageLocked.value) return // 權限判斷
  if (!clearingSlotId.value) return
  const patientIdToClear = weekScheduleMap.value[clearingSlotId.value]?.patientId
  const parts = clearingSlotId.value.split('-')
  const bed = parts.slice(0, -2).join('-')
  const shiftIndex = parseInt(parts[parts.length - 2], 10)
  const startDayIndex = parseInt(parts[parts.length - 1], 10)
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
  } else if (selectedValue === 'this_and_future_for_bed') {
    for (let i = startDayIndex; i < 6; i++) {
      if (!isDateInPast(i)) {
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

// 【儲存邏輯修正】
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
    const datesInView = new Set(weekDates.value.map((d) => d.queryDate))

    for (const date of datesInView) {
      const dailyRecord = weekScheduleRecords.value.get(date) || {
        id: null,
        date,
        schedule: {},
        names: {},
      }

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

      const dataToSave = { date: date, schedule: scheduleToSave, names: dailyRecord.names || {} }

      // 查找現有文件 ID
      let docId = dailyRecord.id
      if (!docId) {
        const existingDocs = await schedulesApi.fetchAll([where('date', '==', date)])
        if (existingDocs.length > 0) {
          docId = existingDocs[0].id
        }
      }

      if (docId) {
        // 如果文件存在
        if (Object.keys(scheduleToSave).length > 0 || Object.keys(dataToSave.names).length > 0) {
          // 有排程內容或 names 內容，更新文件
          promises.push(schedulesApi.update(docId, dataToSave))
        } else {
          // 排程內容和 names 都為空，刪除文件
          promises.push(schedulesApi.delete(docId))
        }
      } else {
        // 如果文件不存在
        if (Object.keys(scheduleToSave).length > 0) {
          // 只有當有排程內容時才新增文件
          promises.push(schedulesApi.save(dataToSave))
        }
      }
    }

    await Promise.all(promises)
    // 成功後的操作
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '週排班已成功儲存！'
    isAlertDialogVisible.value = true
    await loadAllData() // 重新加載以同步最新狀態
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗：${error.message}`
    isAlertDialogVisible.value = true
  }
}

function onDrop(event, targetWeeklySlotId) {
  if (isPageLocked.value) return // 權限判斷
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
    // 權限判斷
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
    // 權限判斷
    event.preventDefault()
    return
  }
  if (!patient || !patient.id) {
    event.preventDefault()
    return
  }
  draggedItem.value = {
    source: 'sidebar',
    data: {
      patientId: patient.id,
      manualNote: patient.status === PATIENT_STATUS.INPATIENT ? '住' : '',
    },
  }
  event.dataTransfer.effectAllowed = 'move'
}
function showConfirmDialog(title, message, onConfirm) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmAction.value = onConfirm
  isConfirmDialogVisible.value = true
}
async function loadBaseSchedule() {
  if (isPageLocked.value) {
    // 權限判斷
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  showConfirmDialog(
    '載入常規班表',
    '確定要載入常規班表嗎？\n這將會【清空並覆蓋】今天及未來的所有排班資料。',
    async () => {
      statusText.value = '正在載入常規班表...'
      try {
        for (const slotId in weekScheduleMap.value) {
          const dayIndex = parseInt(slotId.split('-').pop(), 10)
          if (!isDateInPast(dayIndex)) {
            handleSlotUpdate(slotId, null)
          }
        }
        const masterRecord = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
        if (!masterRecord || !masterRecord.schedule) {
          alertDialogTitle.value = '載入失敗'
          alertDialogMessage.value = '找不到常規班表範本 (MASTER_SCHEDULE)，沒有資料可以載入。'
          isAlertDialogVisible.value = true
          statusText.value = '常規班表為空'
          return
        }
        const baseSchedule = masterRecord.schedule
        for (const baseWeeklyId in baseSchedule) {
          const baseSlotData = baseSchedule[baseWeeklyId]
          if (baseSlotData && baseSlotData.patientId) {
            const dayIndex = parseInt(baseWeeklyId.split('-').pop(), 10)
            if (dayIndex !== -1 && !isDateInPast(dayIndex)) {
              const patient = patientMap.value.get(baseSlotData.patientId)
              if (patient) {
                handleSlotUpdate(baseWeeklyId, {
                  patientId: baseSlotData.patientId,
                  manualNote: baseSlotData.manualNote || baseSlotData.note || '',
                })
              }
            }
          }
        }
        statusText.value = '常規班表已載入至未來排程，請記得儲存。'
      } catch (error) {
        console.error('載入常規班表失敗:', error)
        statusText.value = '載入失敗'
        alertDialogTitle.value = '錯誤'
        alertDialogMessage.value = '載入常規班表時發生錯誤。'
        isAlertDialogVisible.value = true
      }
    },
  )
}
function changeWeek(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    // 權限判斷
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
    // 權限判斷
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
    const datesForQuery = weekDates.value.map((d) => d.queryDate)
    if (datesForQuery.length === 0) return
    const [patients, weeklyRecords, memos] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', 'in', datesForQuery)]),
      memosApi.fetchAll([where('isResolved', '==', false)]),
    ])
    allPatients.value = patients
    activeMemos.value = memos
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
function handleScheduleUpdate(event) {
  const { date } = event.detail
  if (weekDates.value.some((d) => d.queryDate === date)) {
    console.log(`[WeeklyView] 監聽到日期 ${date} 的變更，正在重新載入本週資料...`)
    loadAllData()
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
    if (patient.status === 'er') return { 'status-er': true }
    if (patient.status === 'ipd') {
      return { 'status-ipd': true }
    }
    if (patient.status === 'opd') {
      return { 'status-opd': true }
    }
  }
  return {}
}
function onDragOver(event) {
  if (isPageLocked.value) return // 權限判斷
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot && !targetSlot.classList.contains('is-past')) {
    targetSlot.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}
function runScheduleCheck() {
  const validationResult = { freqMismatch: [], duplicates: [] }
  const patientSchedules = {}
  for (const slotId in weekScheduleMap.value) {
    const slotData = weekScheduleMap.value[slotId]
    if (slotData?.patientId) {
      if (!patientSchedules[slotData.patientId]) {
        patientSchedules[slotData.patientId] = []
      }
      patientSchedules[slotData.patientId].push(slotId)
    }
  }
  for (const patientId in patientSchedules) {
    const patient = patientMap.value.get(patientId)
    if (!patient || !patient.freq || patient.status !== 'opd') continue
    const scheduledDays = new Set(
      patientSchedules[patientId].map((slotId) => parseInt(slotId.split('-')[2], 10)),
    )
    const expectedDays = new Set(FREQ_MAP_TO_DAY_INDEX[patient.freq] || [])
    if (
      scheduledDays.size !== expectedDays.size ||
      ![...scheduledDays].every((day) => expectedDays.has(day))
    ) {
      const actualDaysText = [...scheduledDays]
        .sort()
        .map((d) => WEEKDAYS[d].replace('星期', ''))
        .join('')
      validationResult.freqMismatch.push(
        `病人 ${patient.name} (應排 ${patient.freq})，卻排在週 ${actualDaysText}。`,
      )
    }
  }
  for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
    const dailyPatientSet = new Set()
    const dailyDuplicates = new Set()
    for (const slotId in weekScheduleMap.value) {
      const slotDayIndex = parseInt(slotId.split('-')[2], 10)
      if (slotDayIndex === dayIndex) {
        const slotData = weekScheduleMap.value[slotId]
        if (slotData?.patientId) {
          const patientName = patientMap.value.get(slotData.patientId)?.name
          if (patientName) {
            if (dailyPatientSet.has(patientName)) {
              dailyDuplicates.add(patientName)
            } else {
              dailyPatientSet.add(patientName)
            }
          }
        }
      }
    }
    if (dailyDuplicates.size > 0) {
      validationResult.duplicates.push(
        `${WEEKDAYS[dayIndex]}: ${[...dailyDuplicates].join(', ')} 重複排班。`,
      )
    }
  }
  let issueMessage = ''
  if (validationResult.freqMismatch.length > 0) {
    issueMessage += '【排班頻率不符】:\n- ' + validationResult.freqMismatch.join('\n- ') + '\n\n'
  }
  if (validationResult.duplicates.length > 0) {
    issueMessage += '【同日重複排班】:\n- ' + validationResult.duplicates.join('\n- ') + '\n\n'
  }
  if (issueMessage) {
    alertDialogTitle.value = '排班問題檢查結果'
    alertDialogMessage.value = issueMessage
  } else {
    alertDialogTitle.value = '排程檢視完畢'
    alertDialogMessage.value = '太棒了！未發現重複排班或頻率不符的問題。'
  }
  isAlertDialogVisible.value = true
}
function openBedAssignmentDialog() {
  if (isPageLocked.value) return // 權限判斷
  const unscheduledIpd = []
  const unscheduledOpd = []
  allPatients.value.forEach((patient) => {
    if (
      !patient.isDeleted &&
      !scheduledPatientIds.value.has(patient.id) &&
      !patient.isDiscontinued
    ) {
      if (patient.status === 'ipd') {
        unscheduledIpd.push(patient)
      } else if (patient.status === 'opd' && patient.freq) {
        unscheduledOpd.push(patient)
      }
    }
  })
  problemsToSolve.value = { '住院 - 未排床': unscheduledIpd, '門診 - 未排床': unscheduledOpd }
  isProblemSolverDialogVisible.value = true
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
              <button @click="loadBaseSchedule" :disabled="isPageLocked">載入常規班表</button>
              <button class="btn btn-warning" @click="runScheduleCheck">排程檢視</button>
              <button
                class="btn btn-info"
                @click="openBedAssignmentDialog"
                :disabled="isPageLocked"
              >
                智慧排床
              </button>
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

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedAssignmentDialog
      :is-visible="isProblemSolverDialogVisible"
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
  background-color: #fff;
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
  gap: 1rem;
  flex-wrap: wrap;
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
  padding: 8px 8px 8px 0;
  box-sizing: border-box;
  transition: padding-left 0.2s ease-in-out;
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

:deep(.schedule-slot.status-opd) {
  background-color: var(--green-bg, #e8f5e9);
}
:deep(.schedule-slot.status-ipd) {
  background-color: var(--red-bg, #ffebee);
}
:deep(.schedule-slot.status-er) {
  background-color: var(--purple-bg, #f3e5f5);
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

.main-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.sidebar-locked {
  pointer-events: none;
  opacity: 0.6;
}
</style>
