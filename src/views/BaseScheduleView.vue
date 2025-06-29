<!-- 檔案路徑: src/views/BaseScheduleView.vue (重構版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 【第1步】引入需要的元件
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue' // <--- 引入可複用的表格元件
import { createEmptySlotData } from '@/utils/scheduleUtils.js'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 (與 WeeklyView 保持一致) ---
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

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]

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
      baseSchedulesApi.fetchById('MASTER_SCHEDULE'), // 直接獲取 MASTER 文件
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
    alert('常規門診床位已成功儲存！')
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
  }
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

// 在 WeeklyView.vue 和 BaseScheduleView.vue 中

function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  // 這裡的 allOpdPatients 或 allPatients 取決於您在哪個檔案
  const patient = allOpdPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')

  // ======================= 【核心修改點】 =======================
  // 將 patient.frequency 改為 patient.freq
  const daysToFill =
    fillType === 'frequency' && patient.freq && FREQ_MAP_TO_DAY_INDEX[patient.freq]
      ? FREQ_MAP_TO_DAY_INDEX[patient.freq]
      : [parseInt(dayIndex)]
  // ==========================================================

  // 為了觸發響應式，創建一個新的 schedule 物件
  // 這裡的 masterRecord.value.schedule 或 weekScheduleMap.value 也取決於您在哪個檔案
  const newSchedule = { ...masterRecord.value.schedule }

  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    newSchedule[newSlotId] = {
      ...createEmptySlotData(newSlotId),
      patientId: patientId,
      note: patient.baseNote || '', // 或者其他 note 生成邏輯
    }
  })

  // 更新 ref
  masterRecord.value.schedule = newSchedule

  setChange()
  isDialogVisible.value = false
}

// 【第2步】實現清除邏輯
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

// 【第3步】為 ScheduleTable 準備 getStyleFunc
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

// --- 生命週期鉤子 ---
onMounted(loadAllData)
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <h1 class="page-title">常規門診床位表</h1>
        <div class="main-actions">
          <span class="status-text">{{ statusText }}</span>
          <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存床位
          </button>
        </div>
      </div>
      <!-- StatsToolbar 放在 header 的末尾 -->
      <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
    </header>

    <!-- ======================= 【核心修改點】 ======================= -->
    <main class="page-main-content">
      <!--
        舊的 <div class="table-wrapper"> 和 <table> 已被移除。
        取而代之的是一個簡潔的 <ScheduleTable> 元件。
        我們給它加上了 class="schedule-table-component" 以便 CSS 能控制它。
      -->
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
      />
    </main>
    <!-- ======================= 修改結束 ======================= -->

    <!-- Dialogs 部分保持不變，它們獨立於主內容 -->
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
  </div>
</template>

<style scoped>
/* ==========================================================================
   1. 頁面佈局 (Page Layout)
   ========================================================================== */
.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background-color: #f8f9fa; /* 給整個頁面一個非常淡的背景色 */
}

/* ==========================================================================
   2. 頁面頭部 (Header)
   ========================================================================== */
.page-header {
  flex-shrink: 0; /* 防止頭部被壓縮 */
  padding: 15px 24px;
  background-color: #fff;
  border-bottom: 1px solid #dee2e6;
  box-sizing: border-box;
}

.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 15px; /* header 第一行和 StatsToolbar 之間的間距 */
}

.page-title {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0;
  color: #343a40;
}

.main-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-text {
  color: #6c757d;
  font-style: italic;
  font-size: 0.9rem;
}

.btn-save {
  /* 可以在這裡定義儲存按鈕的樣式 */
  padding: 8px 16px;
  /* ... */
}

/* StatsToolbar 本身的樣式可以由其元件內部定義，
   但我們可以在這裡控制它的外邊距等 */
.page-header .stats-toolbar {
  /* 如果您把 StatsToolbar 放在 header 裡，可以在這裡微調 */
}

/* ==========================================================================
   3. 主內容區 (Main Content)
   ========================================================================== */
.page-main-content {
  flex-grow: 1;
  display: flex; /* 讓子元素填滿空間 */
  min-height: 0;
  padding: 24px; /* 在主內容區周圍增加統一的內邊距 */
  box-sizing: border-box;
}

/*
  【核心佈局】
  這是 ScheduleTable 元件的直接容器，確保它能正確伸展和滾動。
  在模板中，您應該給 ScheduleTable 元件加上這個 class。
  <ScheduleTable class="schedule-table-component" ... />
*/
.schedule-table-component {
  flex-grow: 1; /* 佔滿所有可用空間 */
  min-height: 0;
  /* 所有關於表格內部（滾動、邊框、圓角）的樣式，
     都由 ScheduleTable.vue 自己管理，這裡保持乾淨。 */
}
</style>
