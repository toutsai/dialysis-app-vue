// 檔案路徑: src/views/BaseScheduleView.vue (真正的 SPA 版本)
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
// 直接從 firebase SDK 引入 where，不再依賴 window 物件
import { where } from 'firebase/firestore'
import SelectionDialog from '@/components/SelectionDialog.vue'

// --- API 實例 (直接在頂層建立) ---
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

// --- 核心狀態 ---
const allOpdPatients = ref([])
const patientMap = ref(new Map())
const baseSchedule = ref(new Map())
const originalBaseSchedule = ref([])
const hasUnsavedChanges = ref(false)
const statusText = ref('')
const saveBtnDisabled = ref(true)
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null) // 記錄正在操作的格子 ID
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_this_patient', text: '清除此病人在本表的所有排班' },
  // { value: 'all_future', text: '清除此班次及往後所有排班' } // 這是更進階的功能，我們先註解掉
]

// --- 計算屬性 (用於人數統計) ---
const dailyCounts = computed(() => {
  const counts = Array(6)
    .fill(null)
    .map(() => ({ 早班: 0, 午班: 0, 晚班: 0 }))
  baseSchedule.value.forEach((patientId, slotId) => {
    const [bed, shiftIndex, dayIndex] = slotId.split('-').map(Number)
    if (dayIndex >= 0 && dayIndex < 6 && counts[dayIndex]) {
      if (shiftIndex === 0) counts[dayIndex]['早班']++
      else if (shiftIndex === 1) counts[dayIndex]['午班']++
      else if (shiftIndex === 2) counts[dayIndex]['晚班']++
    }
  })
  return counts
})

// --- 方法定義 ---
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
    const [patients, baseScheduleRecords] = await Promise.all([
      patientsApi.fetchAll([where('status', '==', 'opd'), where('isDeleted', '==', false)]),
      baseSchedulesApi.fetchAll(),
    ])

    allOpdPatients.value = patients
    console.log('[BaseScheduleView] 成功獲取到的門診病人:', allOpdPatients.value) // 關鍵日誌

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
    statusText.value = `載入失敗，請檢查索引或網路連線。`
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

    hasUnsavedChanges.value = false
    statusText.value = '✓ 床位儲存成功！'

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

// --- 生命週期鉤子 ---
// 當元件被掛載到畫面上時，自動執行 loadAllData
onMounted(() => {
  loadAllData()
})
</script>

<template>
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

      <div class="stats-toolbar">
        <div v-for="(dayCount, index) in dailyCounts" :key="index" class="stat-item">
          <strong>{{ WEEKDAYS[index].slice(-1) }}:</strong>
          <div class="stat-shift-group">
            <span class="shift-early">早{{ dayCount['早班'] }}</span>
            <span class="shift-noon">午{{ dayCount['午班'] }}</span>
            <span class="shift-late">晚{{ dayCount['晚班'] }}</span>
          </div>
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

    <SelectionDialog
      :is-visible="isClearDialogVisible"
      title="清除排班選項"
      :options="CLEAR_OPTIONS.map((opt) => opt.text)"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
  </div>
</template>

<style>
.page-container {
  width: 100%;
  /* 其他全域樣式在 main.css */
}

/* ... 其他表格相關樣式 ... */
.table-wrapper {
  max-height: 75vh;
  overflow: auto;
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
</style>
