<!-- 檔案路徑: src/views/WeeklyView.vue (重構版 - 完整無省略) -->
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
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

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
const SHIFTS = ORDERED_SHIFT_CODES // ['early', 'noon', 'late']
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
const isDialogVisible = ref(false)
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
  // 3. 修改統計資料的 key 以匹配 StatsToolbar 的新契約
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
            const shiftCode = slotData.shiftId.split('-')[2] // 'early', 'noon', 'late'
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
      // 4. 標準化讀取到的 note
      if (record.schedule) {
        for (const shiftId in record.schedule) {
          const slotData = record.schedule[shiftId]
          if (slotData && slotData.patientId) {
            const patient = localPatientMap.get(slotData.patientId)
            slotData.autoNote = patient ? generateAutoNote(patient) : ''
            slotData.manualNote = slotData.manualNote || '' // 確保欄位存在
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
  const [bed, shiftIndex, dayIndex] = weeklySlotId.split('-')
  const dateStr = weekDates.value[parseInt(dayIndex, 10)]?.queryDate
  if (!dateStr) return

  if (!weekScheduleRecords.value.has(dateStr)) {
    weekScheduleRecords.value.set(dateStr, { id: null, date: dateStr, schedule: {} })
  }

  const dailyRecord = weekScheduleRecords.value.get(dateStr)

  const shiftCode = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftCode}`

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return

    const existingSlotData = dailyRecord.schedule[dailyShiftId] || {}

    // 5. 生成標準的 note 模型
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
      // 6. 儲存時，只保留標準欄位
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
        // 載入時，只傳遞 patientId 和 manualNote
        handleSlotUpdate(
          weeklySlotId,
          baseSlotData.patientId,
          baseSlotData.manualNote || baseSlotData.note || '',
        )
      }
    }
    statusText.value = '常規班表已載入，請記得儲存。'
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
    currentSlotId.value = slotId
    isDialogVisible.value = true
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

function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  const patient = patientMap.value.get(patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const expectedDays = (patient.freq && FREQ_MAP_TO_DAY_INDEX[patient.freq]) || []
  const daysToFill =
    fillType === 'frequency' && expectedDays.length > 0 ? expectedDays : [parseInt(dayIndex)]
  const targetSlots = daysToFill.map((d_idx) => `${bed}-${shiftIndex}-${d_idx}`)

  const emptySlots = []
  const conflictedSlots = []

  targetSlots.forEach((targetSlotId) => {
    if (weekScheduleMap.value[targetSlotId]?.patientId) {
      conflictedSlots.push(targetSlotId)
    } else {
      emptySlots.push(targetSlotId)
    }
  })

  if (conflictedSlots.length > 0) {
    const conflictMessages = conflictedSlots
      .map((csId) => {
        const [_b, _s, _d] = csId.split('-')
        const day = WEEKDAYS[parseInt(_d, 10)]
        const shift = getShiftDisplayName(SHIFTS[parseInt(_s, 10)])
        const existingPatientName =
          patientMap.value.get(weekScheduleMap.value[csId].patientId)?.name || '未知'
        return `${day}${shift}已被 ${existingPatientName} 佔用`
      })
      .join('\n- ')

    let availableSlotsMessage = ''
    if (emptySlots.length > 0) {
      const availableDaysText = emptySlots
        .map((esId) => {
          const [_b, _s, _d] = esId.split('-')
          return WEEKDAYS[parseInt(_d, 10)].replace('星期', '')
        })
        .join('')
      availableSlotsMessage = `\n\n您是否要繼續排入【未被佔用】的 ${availableDaysText} 床位？`
    } else {
      availableSlotsMessage = '\n\n已無其他可排入的空床位。'
    }

    const confirmMessage = `部分班次因床位已被佔用而未排入：\n- ${conflictMessages}${availableSlotsMessage}`

    confirmDialogTitle.value = '排班衝突提醒'
    confirmDialogMessage.value = confirmMessage

    confirmAction.value = () => {
      if (emptySlots.length > 0) {
        emptySlots.forEach((newSlotId) => {
          handleSlotUpdate(newSlotId, patientId)
        })
      }
    }
    isConfirmDialogVisible.value = true
  } else {
    emptySlots.forEach((newSlotId) => {
      handleSlotUpdate(newSlotId, patientId)
    })
  }
  isDialogVisible.value = false
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

function runScheduleCheck() {
  const patientsToCheck = allPatients.value.filter(
    (p) => !p.isDeleted && (p.status === 'opd' || p.status === 'ipd'),
  )
  const validationResult = { unscheduled: [], freqMismatch: [], duplicates: [] }

  patientsToCheck.forEach((patient) => {
    const patientName = patient.name
    const expectedFreq = patient.freq
    const expectedDays = FREQ_MAP_TO_DAY_INDEX[expectedFreq] || []
    const scheduledSlots = Object.keys(weekScheduleMap.value).filter(
      (slotId) => weekScheduleMap.value[slotId]?.patientId === patient.id,
    )
    if (scheduledSlots.length > 0) {
      const actualScheduledDays = new Set(
        scheduledSlots.map((slotId) => parseInt(slotId.split('-')[2], 10)),
      )
      if (expectedDays.length > 0) {
        const actualDaysArray = Array.from(actualScheduledDays).sort()
        const expectedDaysArray = [...expectedDays].sort()
        if (JSON.stringify(actualDaysArray) !== JSON.stringify(expectedDaysArray)) {
          const statusText = patient.status === 'ipd' ? '住院病人' : '門診病人'
          const actualDaysText = actualDaysArray
            .map((d) => WEEKDAYS[d].replace('星期', ''))
            .join('')
          validationResult.freqMismatch.push(
            `${statusText} ${patientName} (預定 ${expectedFreq})，但目前排 ${actualDaysText}。`,
          )
        }
      }
    } else {
      if ((patient.status === 'opd' && expectedFreq) || patient.status === 'ipd') {
        const statusText = patient.status === 'ipd' ? '住院病人' : '門診病人'
        validationResult.unscheduled.push(`${statusText} ${patientName} 未被排床。`)
      }
    }
  })

  const dailyPatientCounts = {}
  for (const slotId in weekScheduleMap.value) {
    const slotData = weekScheduleMap.value[slotId]
    if (slotData && slotData.patientId) {
      const dayIndex = parseInt(slotId.split('-')[2], 10)
      const patientId = slotData.patientId
      const key = `${patientId}-${dayIndex}`
      dailyPatientCounts[key] = (dailyPatientCounts[key] || 0) + 1
    }
  }

  const duplicates = new Set()
  for (const key in dailyPatientCounts) {
    if (dailyPatientCounts[key] > 1) {
      const [patientId, dayIndex] = key.split('-')
      const patientName = patientMap.value.get(patientId)?.name
      const dayName = WEEKDAYS[parseInt(dayIndex, 10)]
      if (patientName) {
        duplicates.add(
          `病人 ${patientName} 在 ${dayName} 重複排班 (共 ${dailyPatientCounts[key]} 次)。`,
        )
      }
    }
  }
  validationResult.duplicates = Array.from(duplicates)

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

function getWeeklyCellStyle(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) return {}

  const combinedNote = `${slotData.autoNote || ''} ${slotData.manualNote || ''}`.trim()

  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }

  const patient = patientMap.value.get(slotData.patientId)
  if (patient && patient.status === PATIENT_STATUS.INPATIENT) {
    return { 'tag-ip': true }
  }
  return {}
}

function handleDialogCancel() {
  isDialogVisible.value = false
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
            <button class="btn btn-warning" @click="runScheduleCheck">排班檢視</button>
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
        <!-- 7. 將 SHIFTS (英文代碼) 傳給子元件 -->
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

    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <PatientSelectDialog
      :is-visible="isDialogVisible"
      title="選擇排班病人"
      :patients="allPatients"
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
.btn-save {
  background-color: #28a745;
  color: white;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn-save:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
.btn.btn-warning {
  background-color: #ffc107;
  color: #212529;
}
.schedule-slot.drag-over {
  background-color: #e9ecef;
  border: 2px dashed #007bff;
}
</style>
