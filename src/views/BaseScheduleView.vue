<!-- 檔案路徑: src/views/BaseScheduleView.vue (最終完整版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'

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
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_this_patient', text: '清除此病人在本表的所有排班' },
]

// --- 核心狀態 ---
const allOpdPatients = ref([])
const baseSchedule = ref(new Map())
const originalBaseSchedule = ref([])
const hasUnsavedChanges = ref(false)
const statusText = ref('')

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allOpdPatients.value.map((p) => [p.id, p])))
const statsToolbarData = computed(() => {
  const dailyCounts = Array.from({ length: 6 }).map(() => ({ 早班: 0, 午班: 0, 晚班: 0 }))
  for (const slotId of baseSchedule.value.keys()) {
    const [_bed, shiftIndex, dayIndex] = slotId.split('-').map(Number)
    if (dayIndex >= 0 && dayIndex < 6) {
      const shiftName = SHIFTS[shiftIndex]
      if (dailyCounts[dayIndex] && dailyCounts[dayIndex][shiftName] !== undefined) {
        dailyCounts[dayIndex][shiftName]++
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
    const [patients, baseScheduleRecords] = await Promise.all([
      patientsApi.fetchAll([where('status', '==', 'opd'), where('isDeleted', '==', false)]),
      baseSchedulesApi.fetchAll(),
    ])
    allOpdPatients.value = patients
    originalBaseSchedule.value = baseScheduleRecords

    const newBaseSchedule = new Map()
    originalBaseSchedule.value.forEach((record) => {
      const slotId = `${record.bedNumber}-${record.shiftIndex}-${record.dayIndex}`
      newBaseSchedule.set(slotId, record.patientId)
    })
    baseSchedule.value = newBaseSchedule

    statusText.value = '常規床位已載入'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusText.value = '讀取失敗'
    alert(`載入床位失敗: ${error.message}`)
  }
}

function populateScheduleData() {
  // 這個函式在新架構中可以被 Vue 的響應式系統取代，但暫時保留以防萬一
  // 當 baseSchedule.value 改變時，Vue 會自動重新渲染模板
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const deletePromises = originalBaseSchedule.value.map((record) =>
      baseSchedulesApi.delete(record.id),
    )
    await Promise.all(deletePromises)

    const newRecords = []
    baseSchedule.value.forEach((patientId, fullSlotId) => {
      const [bedNumber, shiftIndex, dayIndex] = fullSlotId.split('-')
      newRecords.push({
        patientId,
        bedNumber: parseInt(bedNumber, 10),
        shiftIndex: parseInt(shiftIndex, 10),
        dayIndex: parseInt(dayIndex, 10),
      })
    })

    const savePromises = newRecords.map((record) => baseSchedulesApi.save(record))
    await Promise.all(savePromises)

    hasUnsavedChanges.value = false
    statusText.value = '床位儲存成功！'
    alert('常規門診床位已成功儲存！')
    await loadAllData()
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
  }
}

function openPatientDialog(slotId) {
  currentSlotId.value = slotId
  isDialogVisible.value = true
}

function handleGridClick(slotId) {
  const patientId = baseSchedule.value.get(slotId)
  if (patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    openPatientDialog(slotId)
  }
}

function handlePatientSelect({ patientId, fillType }) {
  const slotId = currentSlotId.value
  if (!patientId || !slotId) return

  const patient = allOpdPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  const [bed, shiftIndex, dayIndex] = slotId.split('-')

  const daysToFill =
    fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      ? FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      : [parseInt(dayIndex)]

  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    baseSchedule.value.set(newSlotId, patientId)
  })

  setChange()
  isDialogVisible.value = false
}

function handleDialogCancel() {
  isDialogVisible.value = false
}

function handleClearSelect(selectedOptionText) {
  const slotId = clearingSlotId.value
  if (!slotId) return

  const selectedAction = CLEAR_OPTIONS.find((opt) => opt.text === selectedOptionText)?.value
  const patientId = baseSchedule.value.get(slotId)

  if (selectedAction === 'single') {
    baseSchedule.value.delete(slotId)
  } else if (selectedAction === 'all_this_patient') {
    const entriesToDelete = []
    for (const [key, value] of baseSchedule.value.entries()) {
      if (value === patientId) {
        entriesToDelete.push(key)
      }
    }
    entriesToDelete.forEach((key) => baseSchedule.value.delete(key))
  }

  setChange()
  isClearDialogVisible.value = false
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
      <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
    </header>

    <main class="page-main-content">
      <div class="table-wrapper">
        <table class="weekly-schedule-table">
          <thead>
            <tr>
              <th>床位</th>
              <th>班次</th>
              <th v-for="day in WEEKDAYS" :key="day">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="bedNumber in bedLayout" :key="bedNumber">
              <tr
                v-for="(shift, shiftIndex) in SHIFTS"
                :key="shift"
                :class="{
                  'hepatitis-bed': hepatitisBeds.includes(bedNumber),
                  'noon-shift-row': shift === '午班',
                }"
              >
                <td v-if="shiftIndex === 0" :rowspan="SHIFTS.length">{{ bedNumber }}號床</td>
                <td>{{ shift }}</td>
                <td v-for="(day, dayIndex) in WEEKDAYS" :key="day">
                  <div
                    class="schedule-slot"
                    :class="{ filled: baseSchedule.get(`${bedNumber}-${shiftIndex}-${dayIndex}`) }"
                    @click="handleGridClick(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                  >
                    <template v-if="baseSchedule.has(`${bedNumber}-${shiftIndex}-${dayIndex}`)">
                      <div class="slot-patient-name">
                        {{
                          patientMap.get(baseSchedule.get(`${bedNumber}-${shiftIndex}-${dayIndex}`))
                            ?.name || 'ID不存在'
                        }}
                      </div>
                    </template>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
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
      :options="CLEAR_OPTIONS.map((opt) => opt.text)"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
  </div>
</template>

<style scoped>
.page-container {
  width: 100%;
  /* 其他全域樣式在 main.css */
}

/* ... 其他表格相關樣式 ... */
.table-wrapper {
  flex-grow: 1; /* <-- 關鍵！讓它佔滿所有剩餘的垂直空間 */
  overflow: auto; /* <-- 關鍵！當表格內容過多時，讓這個容器自己滾動 */
  min-height: 0; /* 一個防止 Flex 溢出的技巧 */
}
.schedule-slot {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 5px;
  padding: 5px;
  cursor: pointer;
  transition: background-color 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
}
.slot-patient-name {
  font-weight: bold;
}
.schedule-slot:not(.filled):hover {
  background-color: #e0e0e0;
}
.schedule-slot.filled {
  cursor: pointer;
  background-color: transparent; /* 或者 #fff，讓它和空格子一樣是白色 */
  /* 也可以加上一個細微的邊框來區分 */
  border: 1px solid #e0e0e0;
}
.stats-toolbar {
  display: flex;
  gap: 20px;
  padding: 10px;
  background-color: #f8f9fa;
  border-radius: 5px;
  margin-bottom: 20px;
  overflow-x: auto;
  white-space: nowrap;
}
.stat-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 5px;
  background-color: #fff;
  border: 1px solid #e0e0e0;
}
.stat-item strong {
  font-size: 1.1em;
}
.stat-shift-group {
  display: flex;
  gap: 8px;
}
.stat-shift-group span {
  padding: 4px 10px;
  border-radius: 15px;
  font-weight: bold;
  color: #fff;
  font-size: 0.9em;
}
.stat-shift-group .shift-early {
  background-color: #28a745;
}
.stat-shift-group .shift-noon {
  background-color: #ffc107;
  color: #212529;
}
.stat-shift-group .shift-late {
  background-color: #17a2b8;
}
.noon-shift-row > td {
  background-color: var(--blue-bg); /* 使用我們在 :root 定義的淺藍色 */
}
</style>
