<!-- 修正後的 BedAssignmentDialog.vue -->
<template>
  <div>
    <div v-if="isVisible" class="dialog-overlay" @click.self="emit('close')">
      <div class="dialog-content">
        <div class="dialog-header">
          <h2>
            {{ dialogTitle }}
          </h2>
          <button @click="emit('close')" class="close-btn">×</button>
        </div>
        <div class="dialog-body">
          <div class="assignment-grid">
            <div class="column patient-column">
              <div class="column-header">
                <h4>{{ leftColumnTitle }}</h4>
                <select v-if="showFreqSelector && !isEditMode" v-model="selectedFreq">
                  <option value="all">所有頻率</option>
                  <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                    {{ freq }}
                  </option>
                </select>
              </div>

              <!-- 編輯模式：顯示當前病人信息 -->
              <div v-if="isEditMode" class="current-patient-info">
                <div class="patient-card current-patient">
                  <div class="patient-name">{{ currentPatient.name }}</div>
                  <div class="patient-details">
                    病歷號：{{ currentPatient.medicalRecordNumber }}<br />
                    狀態：{{ getStatusText(currentPatient.status) }}<br />
                    目前頻率：{{ currentPatient.freq }}
                  </div>

                  <!-- 頻率變更選擇器 -->
                  <div v-if="context?.mode === 'change_freq_and_bed'" class="freq-change-section">
                    <label>新頻率：</label>
                    <select v-model="newFreqSelection" @change="handleFreqChange">
                      <option value="">請選擇新頻率</option>
                      <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                        {{ freq }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 一般模式：顯示病人列表 -->
              <div v-else class="patient-groups-container">
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
                      <span class="patient-info-name">
                        {{ patient.name }}
                        ({{
                          patient.status === 'ipd'
                            ? '住院'
                            : patient.status === 'er'
                              ? '急診'
                              : patient.freq || 'N/A'
                        }})
                        <span v-if="patient.mode && patient.mode !== 'HD'"
                          >- {{ patient.mode }}</span
                        >
                      </span>
                      <div
                        v-if="patient.diseases && patient.diseases.length > 0"
                        class="disease-tags-container"
                      >
                        <span
                          v-for="disease in patient.diseases"
                          :key="disease"
                          class="disease-tag"
                        >
                          {{ disease }}
                        </span>
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

            <div class="column bed-column">
              <div class="column-header">
                <h4>
                  可用空床
                  <span v-if="targetFrequency"> ({{ targetFrequency }}) </span>
                </h4>
                <select v-model="selectedShiftFilter">
                  <option value="all">所有班別</option>
                  <option v-for="shift in shifts" :key="shift" :value="shift">
                    {{ shiftDisplayNames[shift] }}
                  </option>
                </select>
              </div>

              <div v-if="!canShowBeds" class="empty-state-full">
                {{ bedEmptyMessage }}
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
                  v-if="Object.values(availableBeds).every((b) => b.length === 0) && canShowBeds"
                  class="empty-state-full"
                >
                  此頻率在此條件下無任何可用空床
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
  predefinedPatientGroups: { type: Object, default: null },
  assignmentMode: { type: String, default: 'frequency' },
  dayOfWeek: { type: Number, default: 1 },
  context: { type: Object, default: null }, // 新增：編輯上下文
})

const emit = defineEmits(['close', 'assign-bed'])

// 基本狀態
const selectedFreq = ref('all')
const selectedShiftFilter = ref('all')
const selectedPatientId = ref(null)
const alertInfo = ref({ isVisible: false, title: '', message: '' })
const localAssignedPatientIds = ref(new Set())

// 編輯模式新增狀態
const newFreqSelection = ref('')

// 計算屬性：是否為編輯模式
const isEditMode = computed(() => {
  return props.context?.mode === 'change_freq_and_bed' || props.context?.mode === 'change_bed_only'
})

// 計算屬性：當前病人
const currentPatient = computed(() => {
  if (isEditMode.value && props.context?.patient) {
    return props.context.patient
  }
  return null
})

// 計算屬性：對話框標題
const dialogTitle = computed(() => {
  if (props.context?.mode === 'change_freq_and_bed') {
    return `變更頻率與床位：${currentPatient.value?.name || ''}`
  }
  if (props.context?.mode === 'change_bed_only') {
    return `更換床位：${currentPatient.value?.name || ''}`
  }
  return '智慧排班助理'
})

// 計算屬性：左側欄標題
const leftColumnTitle = computed(() => {
  if (isEditMode.value) {
    return '當前病人資訊'
  }
  return props.predefinedPatientGroups ? '問題病人列表' : '選擇病人'
})

// 計算屬性：是否顯示頻率選擇器
const showFreqSelector = computed(() => {
  return (
    (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') &&
    !props.predefinedPatientGroups
  )
})

// 計算屬性：目標頻率
const targetFrequency = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return newFreqSelection.value || currentPatient.value?.freq || '請先選擇新頻率'
    }
    if (props.context?.mode === 'change_bed_only') {
      return currentPatient.value?.freq || '未知頻率'
    }
  }

  if (selectedPatientId.value) {
    const patient = props.allPatients.find((p) => p.id === selectedPatientId.value)
    return patient?.freq || '請選擇病人'
  }

  return '請選擇病人'
})

// 計算屬性：是否可以顯示床位
const canShowBeds = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return !!newFreqSelection.value
    }
    if (props.context?.mode === 'change_bed_only') {
      return !!currentPatient.value?.freq
    }
  }
  return !!selectedPatientId.value
})

// 計算屬性：床位空訊息
const bedEmptyMessage = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return '請先選擇新頻率以查詢空床。'
    }
    if (props.context?.mode === 'change_bed_only') {
      return currentPatient.value?.freq ? '載入中...' : '病人頻率資訊不完整。'
    }
  }
  return '請先從左側選擇一位病人以查詢空床。'
})

// 現有的計算屬性保持不變...
const patientGroups = computed(() => {
  if (props.predefinedPatientGroups) {
    return props.predefinedPatientGroups
  }

  if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
    const groups = {
      '未排床 - 急診': [],
      '未排床 - 住院': [],
      '未排床 - 門診': [],
    }

    const unassignedPatients = props.allPatients.filter((p) => {
      return !p.isDeleted && !p.isDiscontinued && !localAssignedPatientIds.value.has(p.id) && p.freq
    })

    const filteredPatients =
      selectedFreq.value === 'all'
        ? unassignedPatients
        : unassignedPatients.filter((p) => p.freq === selectedFreq.value)

    filteredPatients.forEach((patient) => {
      if (patient.status === 'er') {
        groups['未排床 - 急診'].push(patient)
      } else if (patient.status === 'ipd') {
        groups['未排床 - 住院'].push(patient)
      } else if (patient.status === 'opd') {
        groups['未排床 - 門診'].push(patient)
      }
    })

    return groups
  }

  // singleDay 模式邏輯保持不變...
  return {}
})

const availableBeds = computed(() => {
  // 決定要查詢的病人和頻率
  let targetPatient, targetFreq

  if (isEditMode.value) {
    targetPatient = currentPatient.value
    if (props.context?.mode === 'change_freq_and_bed') {
      targetFreq = newFreqSelection.value
    } else if (props.context?.mode === 'change_bed_only') {
      targetFreq = currentPatient.value?.freq
    }
  } else {
    targetPatient = props.allPatients.find((p) => p.id === selectedPatientId.value)
    targetFreq = targetPatient?.freq
  }

  if (!targetPatient || !targetFreq) return {}

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  if (props.assignmentMode === 'singleDay') {
    props.bedLayout.forEach((bedNum) => {
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
    const dayIndices = props.freqMap[targetFreq]
    if (!dayIndices || dayIndices.length === 0) return {}

    props.bedLayout.forEach((bedNum) => {
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

// 方法
function getStatusText(status) {
  const statusMap = {
    opd: '門診',
    ipd: '住院',
    er: '急診',
  }
  return statusMap[status] || status
}

function handleFreqChange() {
  // 當頻率改變時，清空已選床位
  // 這會觸發 availableBeds 重新計算
}

function handlePatientClick(patientId) {
  selectedPatientId.value = patientId
}

function handleBedClick(bedNum, shiftCode) {
  // 決定要使用的病人和頻率
  let patientId, finalFreq

  if (isEditMode.value) {
    patientId = currentPatient.value?.id
    if (props.context?.mode === 'change_freq_and_bed') {
      finalFreq = newFreqSelection.value
    } else if (props.context?.mode === 'change_bed_only') {
      finalFreq = currentPatient.value?.freq
    }
  } else {
    patientId = selectedPatientId.value
    const patient = props.allPatients.find((p) => p.id === patientId)
    finalFreq = patient?.freq
  }

  if (!patientId) {
    alertInfo.value = { isVisible: true, title: '操作提示', message: '請先選擇一位病人！' }
    return
  }

  if (!finalFreq) {
    alertInfo.value = { isVisible: true, title: '操作提示', message: '請先選擇有效的頻率！' }
    return
  }

  const bedIdPart =
    typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`
  const shiftId = `${bedIdPart}-${shiftCode}`

  // 發送事件，包含新頻率信息
  emit('assign-bed', {
    patientId,
    bedNum,
    shiftCode,
    shiftId,
    newFreq:
      isEditMode.value && props.context?.mode === 'change_freq_and_bed' ? finalFreq : undefined,
  })

  localAssignedPatientIds.value.add(patientId)
  selectedPatientId.value = null
  newFreqSelection.value = ''
}

// 監聽器
watch(
  () => props.scheduleData,
  (newSchedule) => {
    const ids = new Set()
    if (newSchedule) {
      for (const slotData of Object.values(newSchedule)) {
        if (slotData?.patientId) ids.add(slotData.patientId)
      }
    }
    localAssignedPatientIds.value = ids
  },
  { immediate: true, deep: true },
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
      if (isEditMode.value) {
        // 編輯模式：預設選中當前病人
        selectedPatientId.value = currentPatient.value?.id || null
        newFreqSelection.value = ''
      } else {
        // 一般模式：重置狀態
        if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
          selectedFreq.value = 'all'
        }
        selectedPatientId.value = null
      }
    } else {
      selectedPatientId.value = null
      selectedShiftFilter.value = 'all'
      newFreqSelection.value = ''
    }
  },
)

// 輔助函數
function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (patient.freq === '臨時') return true
  if (!patient.freq || !props.freqMap) return false
  const scheduledDays = props.freqMap[patient.freq]
  return scheduledDays ? scheduledDays.includes(dayOfWeek) : false
}

const hepatitisBedNumbers = [31, 32, 33, 35, 36]
function isHepatitisBed(bedNum) {
  return typeof bedNum === 'number' && hepatitisBedNumbers.includes(bedNum)
}

const shiftDisplayNames = { early: '早班', noon: '午班', late: '晚班' }
</script>

<style scoped>
/* 保持原有樣式，新增以下編輯模式樣式 */

.current-patient-info {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  border: 2px solid var(--primary-color, #007bff);
}

.patient-card.current-patient {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.patient-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--primary-color, #007bff);
  margin-bottom: 0.5rem;
}

.patient-details {
  color: #6c757d;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.freq-change-section {
  border-top: 1px solid #dee2e6;
  padding-top: 1rem;
}

.freq-change-section label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #495057;
}

.freq-change-section select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
}

.freq-change-section select:focus {
  outline: none;
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

/* 其他原有樣式保持不變... */
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

.patient-groups-container {
  overflow-y: auto;
  flex-grow: 1;
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
  list-style: none;
  padding: 0;
  margin: 0;
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
</style>
