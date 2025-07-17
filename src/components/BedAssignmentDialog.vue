<!-- 檔案路徑: src/components/BedAssignmentDialog.vue (最終完整版) -->
<template>
  <div>
    <div v-if="isVisible" class="dialog-overlay" @click.self="emit('close')">
      <div class="dialog-content">
        <div class="dialog-header">
          <h2>{{ dialogTitle }}</h2>
          <button @click="emit('close')" class="close-btn">×</button>
        </div>
        <div class="dialog-body">
          <div class="assignment-grid">
            <!-- Patient Column -->
            <div class="column patient-column">
              <div class="column-header">
                <h4>{{ patientListTitle }}</h4>
                <!-- 頻率篩選 (僅在基礎智慧排床模式下顯示) -->
                <select v-if="context.mode === 'base'" v-model="selectedFreqFilter">
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
                      @click="handlePatientClick(patient)"
                    >
                      <span class="patient-info-name">
                        {{ patient.name }} ({{
                          patient.status === 'ipd'
                            ? '住院'
                            : patient.status === 'er'
                              ? '急診'
                              : patient.freq || 'N/A'
                        }})
                      </span>
                      <div
                        v-if="patient.diseases && patient.diseases.length > 0"
                        class="disease-tags-container"
                      >
                        <span
                          v-for="disease in patient.diseases"
                          :key="disease"
                          class="disease-tag"
                          >{{ disease }}</span
                        >
                      </div>
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
            <!-- Bed Column -->
            <div class="column bed-column">
              <div class="column-header">
                <h4>
                  可用空床
                  <span v-if="currentPatient"> ({{ currentPatient.name }})</span>
                </h4>
                <div class="filters-container">
                  <!-- 變更頻率下拉選單 (僅在特定模式下顯示) -->
                  <select v-if="context.mode === 'change_freq_and_bed'" v-model="editableFreq">
                    <option disabled value="">請選擇新頻率</option>
                    <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                      {{ freq }}
                    </option>
                  </select>
                  <!-- 班別篩選 -->
                  <select v-model="selectedShiftFilter">
                    <option value="all">所有班別</option>
                    <option v-for="shift in shifts" :key="shift" :value="shift">
                      {{ shiftDisplayNames[shift] }}
                    </option>
                  </select>
                </div>
              </div>
              <div v-if="!currentPatient" class="empty-state-full">
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
                    <li
                      v-for="bed in beds"
                      :key="bed"
                      @click="handleBedClick(bed, shiftCode)"
                      :class="{ 'hepatitis-bed': isHepatitisBed(bed) }"
                    >
                      {{ typeof bed === 'string' ? `外圍 ${bed.split('-')[1]}` : bed }}
                    </li>
                  </ul>
                  <p v-else class="empty-state-small">無可用空床</p>
                </div>
                <div
                  v-if="Object.values(availableBeds).every((b) => b.length === 0) && currentPatient"
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
import AlertDialog from '@/components/AlertDialog.vue'

const props = defineProps({
  isVisible: Boolean,
  allPatients: { type: Array, required: true },
  bedLayout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  shifts: { type: Array, required: true },
  freqMap: { type: Object, required: true },
  context: { type: Object, required: true },
  isPageLocked: Boolean,
})

const emit = defineEmits(['close', 'assign-bed'])

// --- Local State ---
const selectedPatientId = ref(null)
const selectedShiftFilter = ref('all')
const selectedFreqFilter = ref('all') // For base mode filter
const editableFreq = ref('') // For changing frequency
const alertInfo = ref({ isVisible: false, title: '', message: '' })

// --- Watchers ---
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      // Reset state when dialog opens
      selectedShiftFilter.value = 'all'
      selectedFreqFilter.value = 'all'

      // Initialize state based on context
      if (props.context.patient) {
        selectedPatientId.value = props.context.patient.id
        editableFreq.value = props.context.patient.freq
      } else {
        selectedPatientId.value = null
        editableFreq.value = ''
      }
    }
  },
)

// --- Computed Properties ---
const dialogTitle = computed(() => {
  switch (props.context.mode) {
    case 'change_freq_and_bed':
      return `變更頻率與床位：${props.context.patient?.name}`
    case 'change_bed_only':
      return `更換床位：${props.context.patient?.name}`
    default:
      return '智慧排床助理'
  }
})

const patientListTitle = computed(() => {
  return props.context.mode === 'base' ? '選擇病人' : '目前病人'
})

const currentPatient = computed(() => {
  if (props.context.patient) return props.context.patient
  return props.allPatients.find((p) => p.id === selectedPatientId.value)
})

const currentFrequency = computed(() => {
  // In modes where frequency can be changed, use the editable value
  if (props.context.mode === 'change_freq_and_bed') {
    return editableFreq.value
  }
  // Otherwise, use the patient's fixed frequency
  return currentPatient.value?.freq || ''
})

const patientGroups = computed(() => {
  if (props.context.mode !== 'base') {
    if (currentPatient.value) {
      return { 目前操作: [currentPatient.value] }
    }
    return { 目前操作: [] }
  }

  // Logic for 'base' mode (general smart assignment)
  const groups = { 可排班病人: [] }
  const scheduledIds = new Set(Object.values(props.scheduleData).map((slot) => slot.patientId))

  const unassignedPatients = props.allPatients.filter((p) => {
    const baseCondition = !p.isDeleted && !p.isDiscontinued && p.freq && !scheduledIds.has(p.id)
    if (!baseCondition) return false
    if (selectedFreqFilter.value === 'all') return true
    return p.freq === selectedFreqFilter.value
  })

  groups['可排班病人'] = unassignedPatients
  return groups
})

const availableBeds = computed(() => {
  if (!currentPatient.value) return {}
  const patientFreq = currentFrequency.value
  if (!patientFreq || !props.freqMap[patientFreq]) return {}

  const dayIndices = props.freqMap[patientFreq]
  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  // bedLayout from props might contain strings like 'peripheral-1'
  const mainBedLayout = props.bedLayout.filter((b) => typeof b === 'number')

  mainBedLayout.forEach((bedNum) => {
    props.shifts.forEach((shiftCode, shiftIndex) => {
      if (!results[shiftCode]) return

      let isFullyAvailable = true
      for (const dayIndex of dayIndices) {
        const weeklySlotIdToCheck = `${bedNum}-${shiftIndex}-${dayIndex}`
        const occupyingPatientId = props.scheduleData[weeklySlotIdToCheck]?.patientId
        // A slot is considered occupied if another patient is in it.
        // The current patient's own schedule is ignored, allowing them to be re-assigned.
        if (occupyingPatientId && occupyingPatientId !== currentPatient.value.id) {
          isFullyAvailable = false
          break
        }
      }

      if (isFullyAvailable) {
        results[shiftCode].push(bedNum)
      }
    })
  })
  return results
})

// --- Functions ---
const hepatitisBedNumbers = [31, 32, 33, 35, 36]
function isHepatitisBed(bedNum) {
  return typeof bedNum === 'number' && hepatitisBedNumbers.includes(bedNum)
}

function handlePatientClick(patient) {
  if (props.context.mode === 'base') {
    selectedPatientId.value = patient.id
    editableFreq.value = patient.freq
  }
  // In other modes, the patient is fixed and cannot be clicked.
}

function handleBedClick(bedNum, shiftCode) {
  if (!currentPatient.value) {
    alertInfo.value = { isVisible: true, title: '操作提示', message: '請先選擇一位病人！' }
    return
  }

  emit('assign-bed', {
    patientId: currentPatient.value.id,
    bedNum: bedNum,
    shiftCode: shiftCode,
    newFreq: currentFrequency.value, // Always emit the current frequency
  })
}

const shiftDisplayNames = {
  early: '早班',
  noon: '午班',
  late: '晚班',
}
</script>

<style scoped>
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
.column-header select,
.filters-container select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ced4da;
}
.filters-container {
  display: flex;
  gap: 0.5rem;
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
  display: flex;
  flex-direction: column;
  gap: 4px;
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
.patient-list li.selected .patient-info-name {
  color: white;
}
.patient-list li.selected .disease-tag {
  background-color: white;
  color: var(--primary-color);
  border-color: var(--primary-color);
}
.patient-info-name {
  font-weight: 500;
}
.disease-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.disease-tag {
  background-color: #ffe4e6;
  color: #c53030;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8em;
  font-weight: 500;
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
  flex-basis: 75px;
  font-weight: bold;
  color: #0d47a1;
  padding: 8px;
  border: 1px solid #b3e5fc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}
.bed-list li:hover {
  background-color: #bbdefb;
  transform: scale(1.05);
  border-color: #81d4fa;
}
.bed-list li.hepatitis-bed {
  background-color: #fff9c4;
  color: #f57f17;
  border-color: #fff176;
}
.bed-list li.hepatitis-bed:hover {
  background-color: #fff59d;
  border-color: #ffeb3b;
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
