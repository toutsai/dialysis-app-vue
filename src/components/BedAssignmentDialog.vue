<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  allPatients: { type: Array, required: true },
  bedLayout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  shifts: { type: Array, required: true },
  freqMap: { type: Object, required: true },
  assignmentMode: {
    type: String,
    default: 'frequency', // 'frequency' 或 'singleDay'
  },
  dayOfWeek: { type: Number, default: 1 }, // 1=週一, ..., 7=週日
})

const emit = defineEmits(['close', 'assign-bed'])

// --- 狀態管理 ---
const selectedFreq = ref('一三五')
const selectedShiftFilter = ref('all')
const selectedPatientId = ref(null)

// --- 輔助函式 ---
function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient.freq || !props.freqMap) return false
  const scheduledDays = props.freqMap[patient.freq]
  return scheduledDays ? scheduledDays.includes(dayOfWeek) : false
}

// --- 計算屬性 ---
const assignedPatientIds = computed(() => {
  const ids = new Set()
  if (!props.scheduleData) return ids
  for (const slotData of Object.values(props.scheduleData)) {
    if (slotData?.patientId) {
      ids.add(slotData.patientId)
    }
  }
  return ids
})

const patientGroups = computed(() => {
  if (props.assignmentMode === 'frequency') {
    const unassigned = props.allPatients.filter(
      (p) =>
        !p.isDeleted &&
        p.status === 'opd' &&
        p.freq === selectedFreq.value &&
        !assignedPatientIds.value.has(p.id),
    )
    return { 未排床門診: unassigned }
  }

  // 單日模式的四分組邏輯
  const groups = {
    '今日應排 - 住院': [],
    '今日應排 - 門診': [],
    '今日非排 (臨洗) - 住院': [],
    '今日非排 (臨洗) - 門診': [],
  }

  if (!props.allPatients) return groups

  props.allPatients.forEach((p) => {
    if (p.isDeleted || assignedPatientIds.value.has(p.id)) {
      return
    }

    const shouldSchedule = shouldPatientBeScheduled(p, props.dayOfWeek)

    if (shouldSchedule) {
      if (p.status === 'ipd') groups['今日應排 - 住院'].push(p)
      else if (p.status === 'opd') groups['今日應排 - 門診'].push(p)
    } else {
      if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p)
      else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p)
    }
  })

  return groups
})

const availableBeds = computed(() => {
  if (!selectedPatientId.value) return {}
  const patient = props.allPatients.find((p) => p.id === selectedPatientId.value)
  if (!patient) return {}

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  props.bedLayout.forEach((bedNum) => {
    if (typeof bedNum !== 'number') return
    props.shifts.forEach((shiftCode) => {
      if (!results[shiftCode]) return

      const slotId = `bed-${bedNum}-${shiftCode}`
      if (!props.scheduleData[slotId]?.patientId) {
        results[shiftCode].push(bedNum)
      }
    })
  })
  return results
})

// 當選擇的頻率改變時 (僅在 frequency 模式下)，清空已選擇的病人
watch(selectedFreq, () => {
  if (props.assignmentMode === 'frequency') {
    selectedPatientId.value = null
  }
})

// 當 dialog 變得不可見時，重置內部狀態
watch(
  () => props.isVisible,
  (newValue) => {
    if (!newValue) {
      selectedPatientId.value = null
      selectedShiftFilter.value = 'all'
    }
  },
)

function handlePatientClick(patientId) {
  selectedPatientId.value = patientId
}

function handleBedClick(bedNum, shiftCode) {
  if (!selectedPatientId.value) {
    alert('請先在左側選擇一位病人！')
    return
  }

  if (props.assignmentMode === 'singleDay') {
    emit('assign-bed', {
      patientId: selectedPatientId.value,
      shiftId: `bed-${bedNum}-${shiftCode}`,
    })
  } else {
    emit('assign-bed', {
      patientId: selectedPatientId.value,
      bedNum: bedNum,
      shiftCode: shiftCode,
    })
  }

  selectedPatientId.value = null
}

const shiftDisplayNames = {
  early: '早班',
  noon: '午班',
  late: '晚班',
}
</script>

<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>智慧排班助理</h2>
        <button @click="emit('close')" class="close-btn">×</button>
      </div>
      <div class="dialog-body">
        <div class="assignment-grid">
          <!-- 左欄：病人列表 -->
          <div class="column patient-column">
            <div class="column-header">
              <h4>{{ assignmentMode === 'frequency' ? '未排床門診' : '選擇病人' }}</h4>
              <select v-if="assignmentMode === 'frequency'" v-model="selectedFreq">
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
                      patient.status === 'ipd' ? '住院' : patient.freq || 'N/A'
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

          <!-- 右欄：可用空床 -->
          <div class="column bed-column">
            <div class="column-header">
              <h4>
                可用空床
                <span v-if="assignmentMode === 'frequency'">({{ selectedFreq }})</span>
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
              <div v-for="(beds, shiftCode) in availableBeds" :key="shiftCode" class="shift-group">
                <h5>{{ shiftDisplayNames[shiftCode] }}</h5>
                <ul v-if="beds.length > 0" class="item-list bed-list">
                  <li v-for="bed in beds" :key="bed" @click="handleBedClick(bed, shiftCode)">
                    {{ bed }}
                  </li>
                </ul>
                <p v-else class="empty-state-small">無可用空床</p>
              </div>
              <div
                v-if="Object.keys(availableBeds).length === 0 && selectedPatientId"
                class="empty-state-full"
              >
                該班別無可用空床
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ================================== */
/* == 核心彈窗樣式 (Key Dialog Styles) == */
/* ================================== */
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

/* ================================== */
/* == 內部佈局與元件樣式 (Internal Layout & Components) == */
/* ================================== */
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
  overflow: hidden; /* 防止 grid 溢出 */
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
  max-height: calc(90vh - 120px); /* 預留 header 和 padding 的高度 */
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

/* 病人列表 */
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
  background-color: #f8f9fa; /* 與背景色相同以遮蓋下方內容 */
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

/* 床位列表 */
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
  flex-basis: 60px;
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

/* 空狀態提示 */
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
