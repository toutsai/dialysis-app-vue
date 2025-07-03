<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  allOpdPatients: { type: Array, required: true },
  bedLayout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  shifts: { type: Array, required: true },
  freqMap: { type: Object, required: true },
})

const emit = defineEmits(['close', 'assign-bed'])

// --- 狀態管理 ---
const selectedFreq = ref('一三五')
const selectedShiftFilter = ref('all') // all, early, noon, late
const selectedPatientId = ref(null)

// --- 計算屬性 ---

// 1. 計算已排床的病人ID集合
const assignedPatientIds = computed(() => {
  const ids = new Set()
  for (const slotId in props.scheduleData) {
    if (props.scheduleData[slotId]?.patientId) {
      ids.add(props.scheduleData[slotId].patientId)
    }
  }
  return ids
})

// 2. 根據選擇的頻率，篩選出未排床的病人
const unassignedPatients = computed(() => {
  if (!props.allOpdPatients) return []
  return props.allOpdPatients.filter(
    (p) => p.freq === selectedFreq.value && !assignedPatientIds.value.has(p.id),
  )
})

// 3. 核心：計算符合條件的空床
const availableBeds = computed(() => {
  if (!selectedPatientId.value) return {}

  const patient = props.allOpdPatients.find((p) => p.id === selectedPatientId.value)
  if (!patient) return {}

  const dayIndices = props.freqMap[patient.freq]
  if (!dayIndices || dayIndices.length === 0) return {}

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  props.bedLayout.forEach((bedNum) => {
    if (typeof bedNum !== 'number') return

    props.shifts.forEach((shiftCode, shiftIndex) => {
      if (!results[shiftCode]) return

      let isAvailable = true
      for (const dayIndex of dayIndices) {
        const slotId = `${bedNum}-${shiftIndex}-${dayIndex}`
        if (props.scheduleData[slotId]?.patientId) {
          isAvailable = false
          break
        }
      }

      if (isAvailable) {
        results[shiftCode].push(bedNum)
      }
    })
  })
  return results
})

// 當選擇的頻率改變時，清空已選擇的病人
watch(selectedFreq, () => {
  selectedPatientId.value = null
})

function handlePatientClick(patientId) {
  selectedPatientId.value = patientId
}

function handleBedClick(bedNum, shiftCode) {
  if (!selectedPatientId.value) {
    alert('請先在左側選擇一位病人！')
    return
  }
  emit('assign-bed', {
    patientId: selectedPatientId.value,
    bedNum: bedNum,
    shiftCode: shiftCode,
  })
  // 分配後，清空選擇，準備下一次操作
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
          <!-- 左欄：未排床病人 -->
          <div class="column patient-column">
            <div class="column-header">
              <h4>未排床病人</h4>
              <select v-model="selectedFreq">
                <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                  {{ freq }}
                </option>
              </select>
            </div>
            <ul class="item-list patient-list">
              <li
                v-for="patient in unassignedPatients"
                :key="patient.id"
                :class="{ selected: patient.id === selectedPatientId }"
                @click="handlePatientClick(patient.id)"
              >
                {{ patient.name }} ({{ patient.medicalRecordNumber }})
              </li>
              <li v-if="unassignedPatients.length === 0" class="empty-state">
                該頻率下無未排床病人
              </li>
            </ul>
          </div>

          <!-- 右欄：可用空床 -->
          <div class="column bed-column">
            <div class="column-header">
              <h4>可用空床 ({{ selectedFreq }})</h4>
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
  overflow-y: auto;
}

.assignment-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
}

.column {
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
  /* 確保 column 本身高度一致 */
  min-height: 50vh;
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
  flex-grow: 1;
  overflow-y: auto;
}

/* 病人列表 */
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
  min-height: auto;
}
.bed-list li {
  background-color: #e3f2fd;
  text-align: center;
  flex-basis: 60px;
  font-weight: bold;
  color: #0d47a1;
  padding: 8px;
  border: 1px solid #b3e5fc;
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
