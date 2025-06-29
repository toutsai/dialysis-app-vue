<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的子元件和工具函式
// --- 【修改點】移除 ScheduleDisplay 的 import ---
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue' // <-- 直接引入 ScheduleTable
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import { createEmptySlotData } from '@/utils/scheduleUtils.js'

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

// --- 核心狀態 (保持不變) ---
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')

// --- UI 狀態 (保持不變) ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [{ value: 'single', text: '僅清除此班次' }]

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

// --- 方法 (保持不變) ---
// ... (所有方法，如 setChange, loadAllData, changeWeek, handleSlotUpdate 等，都維持原樣) ...
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
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex, 10))
  const dateStr = formatDateForQuery(d)

  const newWeekRecords = new Map(weekScheduleRecords.value)
  let dailyRecord = newWeekRecords.get(dateStr)

  if (!dailyRecord) {
    dailyRecord = { id: null, date: dateStr, schedule: {} }
    newWeekRecords.set(dateStr, dailyRecord)
  }

  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    const newSlotData = createEmptySlotData(dailyShiftId)
    newSlotData.patientId = patientId
    newSlotData.note = note || patient?.baseNote || ''
    dailyRecord.schedule[dailyShiftId] = newSlotData
  } else {
    delete dailyRecord.schedule[dailyShiftId]
  }

  weekScheduleRecords.value = new Map(newWeekRecords)
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

    const newWeekRecords = new Map(weekScheduleRecords.value)
    for (const record of newWeekRecords.values()) {
      record.schedule = {}
    }

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

function handleClearSelect(selectedOptionText) {
  if (clearingSlotId.value && selectedOptionText === '僅清除此班次') {
    handleSlotUpdate(clearingSlotId.value, null)
  }
  isClearDialogVisible.value = false
}

function handlePatientSelect({ patientId, fillType }) {
  if (!currentSlotId.value || !patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  const [bed, shiftIndex, dayIndex] = currentSlotId.value.split('-')
  const daysToFill =
    fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      ? FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      : [parseInt(dayIndex, 10)]
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
    for (const record of weekScheduleRecords.value.values()) {
      const cleanSchedule = {}
      for (const shiftId in record.schedule) {
        const slotData = record.schedule[shiftId]
        if (slotData && slotData.patientId) {
          cleanSchedule[shiftId] = {
            patientId: slotData.patientId,
            note: slotData.note || '',
            shiftId: slotData.shiftId || shiftId,
            nurseTeam: slotData.nurseTeam || null,
            nurseTeamIn: slotData.nurseTeamIn || null,
            nurseTeamOut: slotData.nurseTeamOut || null,
          }
        }
      }
      const dataToSave = { date: record.date, schedule: cleanSchedule }
      if (record.id) {
        if (Object.keys(cleanSchedule).length > 0) {
          promises.push(schedulesApi.update(record.id, dataToSave))
        } else {
          promises.push(schedulesApi.delete(record.id))
        }
      } else if (Object.keys(cleanSchedule).length > 0) {
        promises.push(schedulesApi.save(dataToSave))
      }
    }
    await Promise.all(promises)
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'
    await loadAllData()
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
  }
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
  if (patient.status === 'ip') {
    classes[STYLE_PRIORITY['住'].class] = true
  }
  return classes
}

// --- Drag and Drop (優化版) ---
const draggedItem = ref(null) // 用來追蹤被拖曳的項目資訊

// 從表格內部開始拖曳
function onDragStart(event, slotId) {
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  // 設置 draggedItem
  draggedItem.value = {
    patientId: slotData.patientId,
    source: slotId, // 來源是表格的 slotId
  }
  // 為了瀏覽器兼容性，仍然可以設置 dataTransfer
  event.dataTransfer.setData('text/plain', 'moving')
  event.dataTransfer.effectAllowed = 'move'
}

// 從側邊欄開始拖曳
function onSidebarDragStart(event, patient) {
  // 設置 draggedItem
  draggedItem.value = {
    patientId: patient.id,
    source: 'sidebar', // 來源是側邊欄
  }
  event.dataTransfer.setData('text/plain', 'adding')
  event.dataTransfer.effectAllowed = 'move'
}

// 在目標位置放下
function onDrop(event, targetSlotId) {
  event.preventDefault()
  // 直接使用 draggedItem.value，這是最可靠的資料來源
  if (!draggedItem.value) return

  const targetSlotIsEmpty = !weekScheduleMap.value[targetSlotId]

  if (targetSlotIsEmpty) {
    // 更新目標格子
    handleSlotUpdate(targetSlotId, draggedItem.value.patientId)

    // 如果來源不是側邊欄，則清空來源格子
    if (draggedItem.value.source !== 'sidebar') {
      handleSlotUpdate(draggedItem.value.source, null)
    }
  } else {
    // 可以在此處添加「交換」或「提示目標非空」的邏輯
    console.log('目標位置非空，目前不執行任何操作。')
  }

  // 清理工作
  draggedItem.value = null // 操作完成後務必清除
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
}

// 拖曳經過目標
function onDragOver(event) {
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot && !targetSlot.querySelector('.patient-details')) {
    // 只在高亮空格子上
    targetSlot.classList.add('drag-over')
  }
}

// 拖曳離開目標
function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}

// --- 其他方法 ---
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

    <!-- Dialogs 保持不變 -->
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
      :options="CLEAR_OPTIONS.map((opt) => opt.text)"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
  </div>
</template>

<style scoped>
/* ======================= 【修改點】新增佈局樣式 ======================= */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

.page-header {
  flex-shrink: 0;
  /* 你可以添加 header 的樣式 */
  padding: 10px 20px;
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
  gap: 16px;
}

.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0; /* 關鍵：防止 flex item 溢出 */
}

.schedule-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止自身滾動 */
  padding: 20px;
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

.InpatientSidebar {
  flex-shrink: 0;
  width: 280px; /* 或你需要的寬度 */
  border-left: 1px solid #dee2e6;
}
/* ======================= 修改結束 ======================= */
</style>
