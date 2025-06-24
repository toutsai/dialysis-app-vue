<!-- 檔案路徑: src/views/BaseScheduleView.vue (最終問題修正版) -->
<script setup>
import { ref, onMounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'

const patientsApi = ApiManager('patients')
const baseSchedulesApi = ApiManager('base_schedules')

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

const allOpdPatients = ref([])
const patientMap = ref(new Map())
const baseSchedule = ref(new Map())
const originalBaseSchedule = ref([])
const hasUnsavedChanges = ref(false)
const statusText = ref('')
const saveBtnDisabled = ref(true)
const isDialogVisible = ref(false)
const currentSlotId = ref(null)

function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
  saveBtnDisabled.value = false
}

async function loadAllData() {
  saveBtnDisabled.value = true
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    // 修正一：將 where 的解構移到函式內部
    const { where } = window.firebase.firestore
    const [patients, baseScheduleRecords] = await Promise.all([
      patientsApi.fetchAll([where('status', '==', 'opd'), where('isDeleted', '==', false)]),
      baseSchedulesApi.fetchAll(),
    ])

    allOpdPatients.value = patients
    patientMap.value = new Map(patients.map((p) => [p.id, p]))
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

async function saveChanges() {
  saveBtnDisabled.value = true
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

    // 修正三：提供更好的使用者回饋
    hasUnsavedChanges.value = false
    statusText.value = '✓ 床位儲存成功！'

    // 重新載入資料以獲取新的 ID
    await loadAllData()

    setTimeout(() => {
      if (!hasUnsavedChanges.value) {
        statusText.value = '常規床位已載入'
      }
    }, 3000)
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
    saveBtnDisabled.value = false
  }
}

function handleGridClick(slotId) {
  if (baseSchedule.value.has(slotId)) {
    const patientId = baseSchedule.value.get(slotId)
    const choice = prompt(
      `此床位已安排病人。\n請輸入 1 清除此班次，或輸入 2 清除此病人在本表的所有排班。\n(按取消以離開)`,
    )
    if (choice === '1') {
      baseSchedule.value.delete(slotId)
      setChange()
    } else if (choice === '2') {
      const entriesToDelete = []
      baseSchedule.value.forEach((pid, sid) => {
        if (pid === patientId) entriesToDelete.push(sid)
      })
      entriesToDelete.forEach((sid) => baseSchedule.value.delete(sid))
      setChange()
    }
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

  const [bed, shiftIndex] = slotId.split('-')

  if (fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]) {
    const dayIndexes = FREQ_MAP_TO_DAY_INDEX[patient.frequency]
    dayIndexes.forEach((dayIndex) => {
      const newSlotId = `${bed}-${shiftIndex}-${dayIndex}`
      baseSchedule.value.set(newSlotId, patientId)
    })
  } else {
    baseSchedule.value.set(slotId, patientId)
  }

  setChange()
  isDialogVisible.value = false
}

function handleDialogCancel() {
  isDialogVisible.value = false
}

onMounted(loadAllData)
</script>

<template>
  <!-- 修正二：將對話框移到 page-container 的外部 -->
  <div>
    <div class="page-container">
      <div class="header-toolbar">
        <h1>常規門診床位表</h1>
        <div class="main-actions">
          <button id="save-changes-btn" :disabled="saveBtnDisabled" @click="saveChanges">
            儲存床位
          </button>
          <span id="status-text">{{ statusText }}</span>
        </div>
      </div>
      <div class="table-wrapper">
        <table class="weekly-schedule-table">
          <thead>
            <tr>
              <th>床位</th>
              <th>班次</th>
              <th v-for="day in WEEKDAYS" :key="day">
                <div class="weekday">{{ day }}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="bedNumber in bedLayout" :key="bedNumber">
              <tr
                v-for="(shift, shiftIndex) in SHIFTS"
                :key="shift"
                :class="{ 'hepatitis-bed': hepatitisBeds.includes(bedNumber) }"
              >
                <td v-if="shiftIndex === 0" :rowspan="SHIFTS.length">{{ bedNumber }}號床</td>
                <td>{{ shift }}</td>
                <td v-for="(day, dayIndex) in WEEKDAYS" :key="day">
                  <div
                    class="schedule-slot"
                    :class="{ filled: baseSchedule.has(`${bedNumber}-${shiftIndex}-${dayIndex}`) }"
                    @click="handleGridClick(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                  >
                    <div
                      v-if="baseSchedule.has(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      class="slot-patient-name"
                    >
                      {{
                        patientMap.get(baseSchedule.get(`${bedNumber}-${shiftIndex}-${dayIndex}`))
                          ?.name || 'ID不存在'
                      }}
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <PatientSelectDialog
      :is-visible="isDialogVisible"
      :title="`為床位 ${currentSlotId ? currentSlotId.split('-')[0] : ''} - ${currentSlotId ? SHIFTS[currentSlotId.split('-')[1]] : ''} (${currentSlotId ? WEEKDAYS[currentSlotId.split('-')[2]] : ''}) 選擇病人`"
      :patients="allOpdPatients"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
    />
  </div>
</template>

<style>
/* 複製貼上舊專案 base_schedule.html 的所有 CSS */
.page-container {
  width: 100%;
}
:root {
  --primary-color: #007bff;
  --success-color: #28a745;
  --danger-color: #dc3545;
  --border-color: #dee2e6;
  --sidebar-bg: #f8f9fa;
  --green-bg: #e8f5e9;
  --hepatitis-bg: #fffde7;
  --hepatitis-border: #fff176;
  --blue-bg: #e3f2fd;
}
.table-wrapper {
  max-height: 75vh;
  overflow: auto;
}
.weekly-schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.weekly-schedule-table th,
.weekly-schedule-table td {
  border: 1px solid var(--border-color);
  padding: 4px;
  text-align: center;
  vertical-align: middle;
  height: 65px;
}
.weekly-schedule-table thead th {
  background-color: #e9ecef;
  position: sticky;
  top: 0;
  z-index: 10;
}
.weekly-schedule-table th:nth-child(1) {
  width: 80px;
}
.weekly-schedule-table th:nth-child(2) {
  width: 60px;
}
.weekly-schedule-table tbody td:nth-child(1),
.weekly-schedule-table tbody td:nth-child(2) {
  background-color: var(--sidebar-bg);
  font-weight: bold;
  position: sticky;
  z-index: 5;
}
.weekly-schedule-table tbody td:nth-child(1) {
  left: 0;
}
.weekly-schedule-table tbody td:nth-child(2) {
  left: 80px;
}
.hepatitis-bed td {
  background-color: var(--hepatitis-bg);
}
.hepatitis-bed td:nth-child(1),
.hepatitis-bed td:nth-child(2) {
  background-color: var(--hepatitis-bg) !important;
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
.schedule-slot:not(.filled):hover {
  background-color: #e0e0e0;
}
.schedule-slot.filled {
  cursor: pointer;
  background-color: var(--green-bg);
}
.slot-patient-name {
  font-weight: bold;
}
/* 新的、更完整的規則 */
#save-changes-btn {
  background-color: var(--success-color);
  color: white;
  border-color: var(--success-color);
  padding: 10px 20px; /* 放大按鈕的內距 */
  font-size: 1.1em; /* 放大字體 */
  font-weight: bold;
  transition: background-color 0.2s;
}
#save-changes-btn:hover:not(:disabled) {
  background-color: #218838; /* 滑鼠懸停時的深綠色 */
}

/* 舊的 #save-changes-btn:disabled 規則可以合併或移除 */
#save-changes-btn:disabled {
  background-color: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}

/* 為狀態文字新增樣式 */
#status-text {
  font-weight: bold;
  color: #6c757d;
  margin-left: 15px; /* 讓它和按鈕之間有點距離 */
}
</style>
