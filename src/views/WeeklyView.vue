<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的子元件和工具函式
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import { createEmptySlotData } from '@/utils/scheduleUtils.js'
import AlertDialog from '@/components/AlertDialog.vue'

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
const SHIFTS = ['早班', '午班', '晚班']
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const PATIENT_STATUS = {
  INPATIENT: 'ipd',
}
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

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

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
  const baseData = WEEKDAYS.map(() => ({ counts: { 早班: 0, 午班: 0, 晚班: 0 } }))
  for (const [dateStr, record] of weekScheduleRecords.value.entries()) {
    if (record && record.schedule) {
      const d = new Date(dateStr + 'T00:00:00')
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dayIndex >= 0 && dayIndex < 6 && baseData[dayIndex]) {
        for (const slotData of Object.values(record.schedule)) {
          if (slotData && slotData.patientId && slotData.shiftId) {
            const shiftName = slotData.shiftId.split('-')[2]
            if (baseData[dayIndex].counts[shiftName] !== undefined) {
              baseData[dayIndex].counts[shiftName]++
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
            const shiftName = parts[2]
            const shiftIndex = SHIFTS.indexOf(shiftName)
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

    const newWeekRecords = new Map()
    weeklyRecords.forEach((record) => {
      const loadedSchedule = record.schedule || {}
      const finalSchedule = {}
      for (const shiftId in loadedSchedule) {
        if (loadedSchedule[shiftId] && loadedSchedule[shiftId].patientId) {
          finalSchedule[shiftId] = {
            ...createEmptySlotData(shiftId),
            ...loadedSchedule[shiftId],
          }
        }
      }
      record.schedule = finalSchedule
      newWeekRecords.set(record.date, record)
    })
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
  } catch (error) {
    console.error('讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
  }
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
function handleSlotUpdate(slotId, patientId, note = '') {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const dateStr = weekDates.value[parseInt(dayIndex, 10)]?.queryDate
  if (!dateStr) return

  const newWeekRecords = new Map(weekScheduleRecords.value)
  const oldDailyRecord = newWeekRecords.get(dateStr) || { id: null, date: dateStr, schedule: {} }
  const newSchedule = { ...oldDailyRecord.schedule }
  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    if (!patient) return
    const isNewIpPatient = !note && patient.status === PATIENT_STATUS.INPATIENT
    const finalNote = note || (isNewIpPatient ? '住' : patient.baseNote || '')
    newSchedule[dailyShiftId] = {
      ...createEmptySlotData(dailyShiftId),
      patientId: patientId,
      note: finalNote,
    }
  } else {
    delete newSchedule[dailyShiftId]
  }

  newWeekRecords.set(dateStr, { ...oldDailyRecord, schedule: newSchedule })
  weekScheduleRecords.value = newWeekRecords
  setChange()
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

    const newWeekRecords = new Map()
    weekScheduleRecords.value = newWeekRecords // 先清空畫面

    const baseSchedule = masterRecord.schedule
    for (const weeklySlotId in baseSchedule) {
      const baseSlotData = baseSchedule[weeklySlotId]
      if (baseSlotData && baseSlotData.patientId) {
        handleSlotUpdate(weeklySlotId, baseSlotData.patientId, baseSlotData.note)
      }
    }
    setChange()
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

  const daysToFill =
    fillType === 'frequency' && patient.freq && FREQ_MAP_TO_DAY_INDEX[patient.freq]
      ? FREQ_MAP_TO_DAY_INDEX[patient.freq]
      : [parseInt(dayIndex)]

  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    handleSlotUpdate(newSlotId, patientId)
  })

  isDialogVisible.value = false
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const promises = []

    // 遍歷我們本地的 weekScheduleRecords Map
    for (const record of weekScheduleRecords.value.values()) {
      // 準備要儲存的、乾淨的 schedule 物件
      const cleanSchedule = {}

      // 遍歷當天的所有排班
      for (const shiftId in record.schedule) {
        const slotData = record.schedule[shiftId]
        // 只儲存有病人的排班
        if (slotData && slotData.patientId) {
          cleanSchedule[shiftId] = {
            patientId: slotData.patientId,
            note: slotData.note || '',
            shiftId: slotData.shiftId || shiftId, // 確保 shiftId 被儲存
            // 保留其他可能的欄位
            nurseTeam: slotData.nurseTeam || null,
            nurseTeamIn: slotData.nurseTeamIn || null,
            nurseTeamOut: slotData.nurseTeamOut || null,
          }
        }
      }

      const dataToSave = {
        date: record.date,
        schedule: cleanSchedule,
      }

      // 根據記錄是否存在，決定是更新、刪除還是新增
      if (record.id) {
        // 這天在資料庫中已經有記錄了
        if (Object.keys(cleanSchedule).length > 0) {
          // 如果當天還有排班，就更新
          promises.push(schedulesApi.update(record.id, dataToSave))
        } else {
          // 如果當天所有排班都被清空了，就刪除這天的文件
          promises.push(schedulesApi.delete(record.id))
        }
      } else if (Object.keys(cleanSchedule).length > 0) {
        // 這天在資料庫中沒有記錄，但我們現在有排班了，所以要新增
        promises.push(schedulesApi.save(dataToSave))
      }
    }

    // 等待所有異步操作完成
    await Promise.all(promises)

    // 更新 UI 狀態
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'

    // 使用自定義 Alert 提示成功
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '週排班已成功儲存！'
    isAlertDialogVisible.value = true

    // 重新載入資料以同步
    await loadAllData()
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'

    // 使用自定義 Alert 提示失敗
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗：${error.message}`
    isAlertDialogVisible.value = true
  }
}

function runScheduleCheck() {
  // 【關鍵修正】確保在使用前，先定義 patientsToCheck
  const patientsToCheck = allPatients.value.filter(
    (p) => !p.isDeleted && (p.status === 'opd' || p.status === 'ipd'),
  )

  const validationResult = {
    unscheduled: [],
    freqMismatch: [],
    duplicates: [],
  }

  // --- 檢查 1: 頻率與是否排班 ---
  // 現在可以安全地使用 patientsToCheck
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
        const expectedDaysArray = [...expectedDays].sort() // 確保拷貝後再排序

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

  // --- 檢查 2: 同日重複排班 ---
  for (let dayIndex = 0; dayIndex < 6; dayIndex++) {
    const patientsOnThisDay = new Set()
    const duplicatesOnThisDay = new Set()

    for (const slotId in weekScheduleMap.value) {
      if (parseInt(slotId.split('-')[2], 10) === dayIndex) {
        const patientId = weekScheduleMap.value[slotId]?.patientId
        if (patientId) {
          const patientName = patientMap.value.get(patientId)?.name
          if (patientName) {
            if (patientsOnThisDay.has(patientName)) {
              // 改為用名字判斷重複
              duplicatesOnThisDay.add(patientName)
            } else {
              patientsOnThisDay.add(patientName)
            }
          }
        }
      }
    }

    duplicatesOnThisDay.forEach((name) => {
      validationResult.duplicates.push(`病人 ${name} 在 ${WEEKDAYS[dayIndex]} 重複排班。`)
    })
  }

  // --- 顯示結果 ---
  let message = '' // 不再需要 "排班檢視完畢" 的開頭
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

  // 【修改】不再使用 alert()，而是設置狀態來顯示自定義對話框
  if (!hasWarnings) {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現明顯的排班問題。'
  } else {
    alertDialogTitle.value = '發現以下潛在問題'
    alertDialogMessage.value = message.trim() // 去掉結尾多餘的換行
  }
  isAlertDialogVisible.value = true // 打開對話框
}

function getWeeklyCellStyle(slotId) {
  const slotData = weekScheduleMap.value[slotId]
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

  if (patient.status === PATIENT_STATUS.INPATIENT) {
    classes['tag-ip'] = true
  }

  return classes
}
// --- Drag and Drop ---
const draggedItem = ref(null)
function onDragStart(event, slotId) {
  const slotData = weekScheduleMap.value[slotId]
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

// ======================= 【最終修正點】 =======================
// 函數簽名改為接收 patientId，並在內部查找完整的 patient 物件
function onSidebarDragStart(event, patientId) {
  if (!patientId) {
    console.error('從側邊欄拖曳時，未獲取到有效的病人ID！')
    event.preventDefault()
    return
  }

  // 使用 patientMap 查找完整的病人物件，確保資料的權威性
  const patient = patientMap.value.get(patientId)
  if (!patient) {
    console.error(`在 onSidebarDragStart 中找不到 ID 為 ${patientId} 的病患！`)
    event.preventDefault()
    return
  }

  draggedItem.value = {
    patientId: patient.id,
    note: '',
    source: 'sidebar',
  }
  event.dataTransfer.effectAllowed = 'move'
}
// ==========================================================

function onDrop(event, targetSlotId) {
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop || !itemToDrop.patientId) {
    draggedItem.value = null
    return
  }

  if (weekScheduleMap.value[targetSlotId]) {
    console.warn('目標位置非空，操作取消。')
    draggedItem.value = null
    return
  }

  handleSlotUpdate(targetSlotId, itemToDrop.patientId, itemToDrop.note)

  if (itemToDrop.source !== 'sidebar') {
    handleSlotUpdate(itemToDrop.source, null)
  }

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
function handleDialogCancel() {
  isDialogVisible.value = false
}
// --- 生命週期鉤子 ---
onMounted(loadAllData)
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
            <button @click="runScheduleCheck">排班檢視</button>
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

    <!-- ======================= 【修改點】Template 結構調整 ======================= -->
    <main class="page-main-content">
      <!-- 1. 新增 .schedule-area 作為佈局容器 -->
      <div class="schedule-area">
        <!-- 2. 直接放置 StatsToolbar -->
        <StatsToolbar
          class="stats-toolbar"
          :stats-data="statsToolbarData"
          :weekdays="statsToolbarWeekdays"
        />

        <!-- 3. 直接放置 ScheduleTable，並將事件監聽器綁定到這裡 -->
        <ScheduleTable
          class="schedule-table-component"
          :layout="bedLayout"
          :schedule-data="weekScheduleMap"
          :patient-map="patientMap"
          :shifts="SHIFTS"
          :weekdays="WEEKDAYS"
          :week-dates="weekDates"
          :hepatitis-beds="hepatitisBeds"
          :get-style-func="getWeeklyCellStyle"
          @grid-click="handleGridClick"
          @drop="onDrop"
          @drag-start="onDragStart"
          @drag-over="onDragOver"
          @drag-leave="onDragLeave"
        />
      </div>

      <!-- InpatientSidebar 保持不變 -->
      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
      />
    </main>
    <!-- ======================= 修改結束 ======================= -->
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
  </div>
</template>

<style scoped>
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left,
.main-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}

.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0; /* 關鍵：防止 flex item 溢出 */
  overflow-x: hidden; /* 防止 main 自身產生水平滾動條 */
}

.schedule-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止自身滾動 */
  box-sizing: border-box;
  min-width: 0;
}

.stats-toolbar {
  flex-shrink: 0; /* 固定在頂部，不壓縮 */
  margin-bottom: 15px;
}

.schedule-table-component {
  flex-grow: 1;
  min-height: 0;
  /* 滾動的職責交給 ScheduleTable 元件內部處理 */
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.week-display-text {
  font-size: 1.5em;
  font-weight: bold;
  white-space: nowrap;
}
</style>
