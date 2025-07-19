<!-- 檔案路徑: src/components/BedAssignmentDialog.vue (最終修正與優化版) -->
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
                  <!-- ✨ [核心修正] 重新加入變更頻率的下拉選單 -->
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
// 請將 BedAssignmentDialog.vue 的 <script setup> 區塊完全替換為此版本
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
const selectedFreqFilter = ref('all')
const editableFreq = ref('')
const alertInfo = ref({ isVisible: false, title: '', message: '' })

// --- Watchers ---
// ✨ [核心修正 #1] 讓 Watcher 在對話框打開時，能正確處理來自 context 的病人資料
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      // 重置篩選器
      selectedShiftFilter.value = 'all'
      selectedFreqFilter.value = 'all'

      // 根據傳入的 context 初始化狀態
      if (props.context.patient) {
        // 如果 context 中直接帶了病人物件 (來自"變更頻率/床位"等操作)
        // 就直接將其設定為當前選中的病人
        selectedPatientId.value = props.context.patient.id
        editableFreq.value = props.context.patient.freq
      } else {
        // 否則，清空選擇 (來自"智慧排床"等操作)
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
  if (props.context.mode === 'base') return '選擇病人'
  return '目前病人'
})

const currentPatient = computed(() => {
  // 優先使用 context 中傳入的 patient 物件
  if (props.context.patient) return props.context.patient
  // 否則，根據 selectedPatientId 從總列表中尋找
  return props.allPatients.find((p) => p.id === selectedPatientId.value)
})

const currentFrequency = computed(() => {
  // 在「變更頻率」模式下，使用可編輯的頻率值
  if (props.context.mode === 'change_freq_and_bed') {
    return editableFreq.value
  }
  // 在其他模式下，使用當前病人的固定頻率
  return currentPatient.value?.freq || ''
})

// ✨ [核心修正 #2] 讓 patientGroups 正確處理 change_... 模式
const patientGroups = computed(() => {
  const mode = props.context.mode

  // 模式一: 變更床位/頻率，左側只顯示當前操作的病人
  if (mode === 'change_freq_and_bed' || mode === 'change_bed_only') {
    return currentPatient.value ? { 目前操作: [currentPatient.value] } : { 目前操作: [] }
  }

  // 模式二: 總表智慧排床，顯示所有未排入規則的病人
  if (mode === 'base') {
    const scheduledIds = new Set(
      Object.values(props.scheduleData)
        .filter((s) => s?.patientId)
        .map((s) => s.patientId),
    )
    const unassignedPatients = props.allPatients.filter((p) => {
      const baseCondition = !p.isDeleted && !p.isDiscontinued && p.freq && !scheduledIds.has(p.id)
      if (!baseCondition) return false
      return selectedFreqFilter.value === 'all' || p.freq === selectedFreqFilter.value
    })
    return { 可排班病人: unassignedPatients }
  }

  // 其他模式或預設回退
  return { 無符合條件的病人: [] }
})

// ✨ [核心修正 #3] 讓 availableBeds 在所有頻率模式下都正確運作
const availableBeds = computed(() => {
  // 必須先有一個當前病人
  if (!currentPatient.value) return {}

  // 必須要有有效的頻率才能計算
  const patientFreq = currentFrequency.value
  if (!patientFreq || !props.freqMap[patientFreq]) return {}

  const dayIndices = props.freqMap[patientFreq]

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  // 遍歷所有床位和班別，進行嚴格的頻率檢查
  props.bedLayout.forEach((bedIdentifier) => {
    props.shifts.forEach((shiftCode, shiftIndex) => {
      if (!results[shiftCode]) return

      let isFullyAvailable = true
      for (const dayIndex of dayIndices) {
        // scheduleData 的 key 格式是統一的 `bed-shift-dayIndex`
        const weeklySlotIdToCheck = `${bedIdentifier}-${shiftIndex}-${dayIndex}`
        const occupyingPatientId = props.scheduleData[weeklySlotIdToCheck]?.patientId

        // 如果該時段被佔用，且不是病人自己，則此床位不可用
        // (允許將病人排回自己原來的位置)
        if (occupyingPatientId && occupyingPatientId !== currentPatient.value.id) {
          isFullyAvailable = false
          break
        }
      }

      if (isFullyAvailable) {
        results[shiftCode].push(bedIdentifier)
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
  // 在非固定病人的模式下，允許點擊選擇
  if (props.context.mode === 'base') {
    selectedPatientId.value = patient.id
    editableFreq.value = patient.freq
  }
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
    newFreq: currentFrequency.value, // 永遠發送當前選擇的頻率
  })
}

const shiftDisplayNames = {
  early: '早班',
  noon: '午班',
  late: '晚班',
}
</script>

<style scoped>
/* Dialog Overlay and Content */
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
