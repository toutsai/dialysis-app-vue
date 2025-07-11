<template>
  <div>
    <div v-if="isVisible" class="dialog-overlay" @click.self="emit('close')">
      <div class="dialog-content">
        <div class="dialog-header">
          <h2>智慧排班助理</h2>
          <button @click="emit('close')" class="close-btn">×</button>
        </div>
        <div class="dialog-body">
          <div class="assignment-grid">
            <div class="column patient-column">
              <div class="column-header">
                <h4>{{ predefinedPatientGroups ? '問題病人列表' : '選擇病人' }}</h4>
                <select
                  v-if="
                    (assignmentMode === 'frequency' || assignmentMode === 'base') &&
                    !predefinedPatientGroups
                  "
                  v-model="selectedFreq"
                >
                  <option value="all">所有頻率</option>
                  <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                    {{ freq }}
                  </option>
                </select>
              </div>
              <div class="patient-groups-container">
                <div
                  v-for="(patients, groupName) in patientGroups"
                  :key="groupName"
                  class="patient-group"
                >
                  <h5 v-if="patients.length > 0" class="group-title">{{ groupName }}</h5>
                  <ul v-if="patients.length > 0" class="item-list patient-list">
                    <li
                      v-for="patient in patients"
                      :key="patient.id"
                      :class="{ selected: patient.id === selectedPatientId }"
                      @click="handlePatientClick(patient.id)"
                    >
                      {{ patient.name }} ({{
                        patient.status === 'ipd'
                          ? '住院'
                          : patient.status === 'er'
                            ? '急診'
                            : patient.freq || 'N/A'
                      }})
                    </li>
                  </ul>
                </div>
                <div
                  v-if="Object.values(patientGroups).every((p) => p.length === 0)"
                  class="empty-state"
                >
                  無符合條件的病人
                </div>
              </div>
            </div>
            <div class="column bed-column">
              <div class="column-header">
                <h4>
                  可用空床
                  <span v-if="assignmentMode === 'frequency' || assignmentMode === 'base'">
                    ({{
                      allPatients.find((p) => p.id === selectedPatientId)?.freq ||
                      (selectedFreq === 'all' ? '所有頻率' : selectedFreq)
                    }})
                  </span>
                </h4>
                <select v-model="selectedShiftFilter">
                  <option value="all">所有班別</option>
                  <option v-for="shift in shifts" :key="shift" :value="shift">
                    {{ shiftDisplayNames[shift] }}
                  </option>
                </select>
              </div>
              <div v-if="!selectedPatientId" class="empty-state-full">
                請先從左側選擇一位病人以查詢空床。
              </div>
              <div v-else class="bed-results-grid">
                <div
                  v-for="(beds, shiftCode) in availableBeds"
                  :key="shiftCode"
                  class="shift-group"
                >
                  <h5>{{ shiftDisplayNames[shiftCode] }}</h5>
                  <ul v-if="beds.length > 0" class="item-list bed-list">
                    <li v-for="bed in beds" :key="bed" @click="handleBedClick(bed, shiftCode)">
                      {{ typeof bed === 'string' ? `外圍 ${bed.split('-')[1]}` : bed }}
                    </li>
                  </ul>
                  <p v-else class="empty-state-small">無可用空床</p>
                </div>
                <div
                  v-if="
                    Object.values(availableBeds).every((b) => b.length === 0) && selectedPatientId
                  "
                  class="empty-state-full"
                >
                  此病人在此條件下無任何可用空床
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <!-- 【修正點 1】: 將 AlertDialog 引入並綁定狀態 -->
    <AlertDialog
      :is-visible="alertInfo.isVisible"
      :title="alertInfo.title"
      :message="alertInfo.message"
      @confirm="alertInfo.isVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
// 【修正點 2】: 導入 AlertDialog 元件
import AlertDialog from '@/components/AlertDialog.vue'

const props = defineProps({
  isVisible: Boolean,
  allPatients: { type: Array, required: true },
  bedLayout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  shifts: { type: Array, required: true },
  freqMap: { type: Object, required: true },
  predefinedPatientGroups: { type: Object, default: null },
  assignmentMode: {
    type: String,
    default: 'frequency', // 'frequency', 'singleDay', 或 'base' (常規)
  },
  dayOfWeek: { type: Number, default: 1 }, // 1=週一, ..., 7=週日
})

const emit = defineEmits(['close', 'assign-bed'])

// --- 本地元件狀態 ---
const selectedFreq = ref('all')
const selectedShiftFilter = ref('all')
const selectedPatientId = ref(null)

// 【修正點 3】: 新增管理 AlertDialog 的狀態
const alertInfo = ref({
  isVisible: false,
  title: '',
  message: '',
})

// 【修正點 4】: 建立一個本地的、可修改的已排床 ID 集合
const localAssignedPatientIds = ref(new Set())

// --- Watchers ---

// 【修正點 5】: 使用 watch 來同步從父層傳來的 props 到我們的本地狀態
watch(
  () => props.scheduleData,
  (newSchedule) => {
    const ids = new Set()
    if (newSchedule) {
      for (const slotData of Object.values(newSchedule)) {
        if (slotData?.patientId) {
          ids.add(slotData.patientId)
        }
      }
    }
    localAssignedPatientIds.value = ids
  },
  {
    immediate: true,
    deep: true,
  },
)

watch(selectedFreq, () => {
  if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
    selectedPatientId.value = null
  }
})

watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
        selectedFreq.value = 'all'
      }
    } else {
      selectedPatientId.value = null
      selectedShiftFilter.value = 'all'
    }
  },
)

// --- Computed Properties ---

// 【修正點 6】: 修改 patientGroups，使其依賴於本地的 localAssignedPatientIds
const patientGroups = computed(() => {
  if (props.predefinedPatientGroups) {
    return props.predefinedPatientGroups
  }
  if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
    const unassigned = props.allPatients.filter((p) => {
      const baseCondition =
        !p.isDeleted &&
        !p.isDiscontinued &&
        p.status === 'opd' &&
        !localAssignedPatientIds.value.has(p.id) // <-- 使用本地狀態
      if (!baseCondition) return false
      if (selectedFreq.value === 'all') {
        return !!p.freq
      }
      return p.freq === selectedFreq.value
    })
    return { 未排床門診: unassigned }
  }
  if (props.assignmentMode === 'singleDay') {
    const groups = {
      '今日應排 - 急診': [],
      '今日應排 - 住院': [],
      '今日應排 - 門診': [],
      '今日非排 (臨洗) - 急診': [],
      '今日非排 (臨洗) - 住院': [],
      '今日非排 (臨洗) - 門診': [],
    }
    if (!props.allPatients) return groups
    props.allPatients.forEach((p) => {
      if (
        p.isDeleted ||
        localAssignedPatientIds.value.has(p.id) || // <-- 使用本地狀態
        p.isDiscontinued
      ) {
        return
      }
      const shouldSchedule = shouldPatientBeScheduled(p, props.dayOfWeek)
      if (shouldSchedule) {
        if (p.status === 'er') groups['今日應排 - 急診'].push(p)
        else if (p.status === 'ipd') groups['今日應排 - 住院'].push(p)
        else if (p.status === 'opd') groups['今日應排 - 門診'].push(p)
      } else {
        if (p.status === 'er') groups['今日非排 (臨洗) - 急診'].push(p)
        else if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p)
        else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p)
      }
    })
    return groups
  }
  return {}
})

const availableBeds = computed(() => {
  if (!selectedPatientId.value) return {}

  const patient = props.allPatients.find((p) => p.id === selectedPatientId.value)
  if (!patient) return {}

  let bedsToConsider = []
  if (props.assignmentMode === 'singleDay' || props.assignmentMode === 'frequency') {
    bedsToConsider = props.bedLayout
  } else {
    bedsToConsider = props.bedLayout.filter((bed) => typeof bed === 'number')
  }

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  if (props.assignmentMode === 'singleDay') {
    bedsToConsider.forEach((bedNum) => {
      props.shifts.forEach((shiftCode) => {
        if (!results[shiftCode]) return
        const bedIdPart =
          typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`
        const dailySlotId = `${bedIdPart}-${shiftCode}`
        if (!props.scheduleData[dailySlotId]?.patientId) {
          results[shiftCode].push(bedNum)
        }
      })
    })
  } else {
    const dayIndices = props.freqMap[patient.freq]
    if (!dayIndices || dayIndices.length === 0) return {}

    bedsToConsider.forEach((bedNum) => {
      props.shifts.forEach((shiftCode, shiftIndex) => {
        if (!results[shiftCode]) return

        let isFullyAvailable = true
        for (const dayIndex of dayIndices) {
          const slotIdToCheck = `${bedNum}-${shiftIndex}-${dayIndex}`
          if (props.scheduleData[slotIdToCheck]?.patientId) {
            isFullyAvailable = false
            break
          }
        }

        if (isFullyAvailable) {
          results[shiftCode].push(bedNum)
        }
      })
    })
  }

  return results
})

// --- Functions ---
function handlePatientClick(patientId) {
  selectedPatientId.value = patientId
}

function handleBedClick(bedNum, shiftCode) {
  if (!selectedPatientId.value) {
    // 【修正點 7】: 使用自訂的 AlertDialog 元件替換 alert()
    alertInfo.value = {
      isVisible: true,
      title: '操作提示',
      message: '請先在左側選擇一位病人！',
    }
    return
  }

  const patientIdToAssign = selectedPatientId.value

  const bedIdPart =
    typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`
  const shiftId = `${bedIdPart}-${shiftCode}`

  emit('assign-bed', {
    patientId: patientIdToAssign,
    bedNum: bedNum,
    shiftCode: shiftCode,
    shiftId: shiftId,
  })

  // 【修正點 8】: 在 emit 事件後，立即手動更新本地狀態，觸發畫面即時刷新
  localAssignedPatientIds.value.add(patientIdToAssign)

  // 清空當前選擇的病人，防止重複排同一個人
  selectedPatientId.value = null
}

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient.freq || !props.freqMap) return false
  const scheduledDays = props.freqMap[patient.freq]
  // 假設 props.dayOfWeek 是 1 (Mon) 到 7 (Sun)
  // 而 freqMap 是 0 (Mon) 到 5 (Sat)
  const checkDayIndex = dayOfWeek - 1
  if (checkDayIndex < 0 || checkDayIndex > 5) return false
  return scheduledDays ? scheduledDays.includes(checkDayIndex) : false
}

const shiftDisplayNames = {
  early: '早班',
  noon: '午班',
  late: '晚班',
}
</script>

<style scoped>
/* 樣式不變 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  transition: opacity 0.3s ease;
}

.dialog-content {
  background: white;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  width: 90%;
  max-width: 1200px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.8rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2.5rem;
  line-height: 1;
  cursor: pointer;
  color: #888;
  padding: 0;
  transition: color 0.2s;
}
.close-btn:hover {
  color: #000;
}

.dialog-body {
  overflow: hidden;
  display: flex;
}

.assignment-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  width: 100%;
}

.column {
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
  min-height: 50vh;
  max-height: calc(90vh - 120px);
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 0.8rem;
  margin-bottom: 0.8rem;
  flex-shrink: 0;
}
.column-header h4 {
  margin: 0;
  font-size: 1.2rem;
}
.column-header select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ced4da;
}

.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.patient-groups-container {
  overflow-y: auto;
  flex-grow: 1;
}
.patient-group {
  margin-bottom: 1.5rem;
}
.patient-group:last-child {
  margin-bottom: 0;
}

.group-title {
  margin: 0 0 0.8rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid var(--primary-color);
  color: var(--primary-color);
  font-size: 1.1rem;
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 1;
}

.patient-list li {
  padding: 10px 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  background-color: #fff;
}
.patient-list li:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
}
.patient-list li.selected {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
  font-weight: bold;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.bed-results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  flex-grow: 1;
}

.shift-group h5 {
  margin: 0 0 0.5rem 0;
  color: #343a40;
}

.bed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.bed-list li {
  background-color: #e3f2fd;
  text-align: center;
  flex-basis: 75px; /* 加寬以容納 '外圍 X' */
  font-weight: bold;
  color: #0d47a1;
  padding: 8px;
  border: 1px solid #b3e5fc;
  border-radius: 4px;
}
.bed-list li:hover {
  background-color: #bbdefb;
  transform: scale(1.05);
  border-color: #81d4fa;
}

.empty-state,
.empty-state-full {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  height: 100%;
  color: #6c757d;
  font-size: 1.2rem;
  text-align: center;
  padding: 2rem;
  background-color: #fff;
  border: 1px dashed #ced4da;
  border-radius: 6px;
}
.empty-state-small {
  color: #999;
  font-style: italic;
}
</style>
