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

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]
// AlertDialog 的狀態
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

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
  const warnings = []

  // --- 檢查 1: 頻率檢查 ---
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
          warnings.push(
            `門診病人 ${patientName} (預定 ${expectedFreq})，但目前排 ${actualDaysText}。`,
          )
        }
      }
    } else {
      if (expectedFreq) {
        warnings.push(`有門診病人 ${patientName} 未被排床。`)
      }
    }
  })

  // --- 檢查 2: 同日重複排班檢查 ---
  const dailyPatientSets = Array.from({ length: 6 }).map(() => new Set())
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const dayIndex = parseInt(slotId.split('-')[2], 10)
      const patientName = patientMap.value.get(slotData.patientId)?.name
      if (patientName) {
        if (dailyPatientSets[dayIndex].has(patientName)) {
          warnings.push(`病人 ${patientName} 在 ${WEEKDAYS[dayIndex]} 出現超過一次。`)
        } else {
          dailyPatientSets[dayIndex].add(patientName)
        }
      }
    }
  }

  // --- 顯示結果 ---
  if (warnings.length > 0) {
    alertDialogTitle.value = '發現以下潛在問題'
    alertDialogMessage.value = '- ' + warnings.join('\n- ')
  } else {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現明顯的排班問題。'
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

function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  const patient = allOpdPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const daysToFill =
    fillType === 'frequency' && patient.freq && FREQ_MAP_TO_DAY_INDEX[patient.freq]
      ? FREQ_MAP_TO_DAY_INDEX[patient.freq]
      : [parseInt(dayIndex)]

  const newSchedule = { ...masterRecord.value.schedule }
  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    newSchedule[newSlotId] = {
      ...createEmptySlotData(newSlotId),
      patientId: patientId,
      note: patient.baseNote || '',
    }
  })
  masterRecord.value.schedule = newSchedule

  setChange()
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
    <!-- ======================= 【修改點】簡化 Header ======================= -->
    <header class="page-header">
      <div class="header-toolbar">
        <!-- 左側：標題和檢視按鈕 -->
        <div class="toolbar-left">
          <h1 class="page-title">常規門診床位表</h1>
          <button class="btn-secondary" @click="runBedCheck">病人床位檢視</button>
        </div>

        <!-- 右側：狀態和儲存按鈕 -->
        <div class="toolbar-right">
          <span class="status-text">{{ statusText }}</span>
          <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存床位
          </button>
        </div>
      </div>
      <!-- StatsToolbar 已被移除 -->
    </header>
    <!-- ======================= 修改結束 ======================= -->

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
      />
    </main>

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

    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
  </div>
</template>

<style scoped>
/* ======================= 【修改點】Header 樣式 ======================= */
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

/*
  【核心修改】
  使用一個更通用的選擇器，直接針對 header 裡的所有按鈕。
  這樣可以確保所有按鈕樣式一致。
*/
.header-toolbar button {
  padding: 8px 16px;
  font-size: 0.9em;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap; /* 防止按鈕內文字換行 */
}

/* 按鈕的 hover 效果 */
.header-toolbar button:not(:disabled):hover {
  border-color: #adb5bd;
  background-color: #f8f9fa;
}

/* 儲存按鈕的特殊樣式 (覆蓋通用樣式) */
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
/* ======================= 修改結束 ======================= */

/* 主內容區樣式保持不變 */
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
