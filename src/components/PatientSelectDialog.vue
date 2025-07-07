<!-- 檔案路徑: src/components/PatientSelectDialog.vue (支援急診病人最終版) -->
<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  title: String,
  patients: Array,
  showFillOptions: {
    type: Boolean,
    default: true,
  },
})
const emit = defineEmits(['confirm', 'cancel'])

const searchTerm = ref('')
const freqFilter = ref('')
const diseaseFilter = ref('')
const selectedPatientId = ref(null)
const patientStatusFilter = ref('')
const fillType = ref('frequency')

const FREQUENCIES = ['一三五', '二四六', '一四', '二五', '三六', '一五', '二六', '每周一次', '臨時']
const DISEASES = ['HIV', 'RPR', 'HBV', 'HCV', '隔離']

const filteredPatients = computed(() => {
  if (!props.patients || props.patients.length === 0) {
    return []
  }
  return props.patients.filter((p) => {
    // 確保 isDeleted 不為 true 的病人才會被顯示
    if (p.isDeleted) return false

    const term = searchTerm.value.toLowerCase()
    const matchesSearch =
      !term ||
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.medicalRecordNumber && p.medicalRecordNumber.includes(term))

    const matchesFreq = !freqFilter.value || p.freq === freqFilter.value

    const matchesDisease =
      !diseaseFilter.value || (p.diseases && p.diseases.includes(diseaseFilter.value))
    const matchesStatus = !patientStatusFilter.value || p.status === patientStatusFilter.value

    return matchesSearch && matchesFreq && matchesDisease && matchesStatus
  })
})

function selectPatient(patientId) {
  selectedPatientId.value = patientId
}

function handleConfirm() {
  if (!selectedPatientId.value) {
    alert('請先選擇一位病人！')
    return
  }
  emit('confirm', {
    patientId: selectedPatientId.value,
    ...(props.showFillOptions && { fillType: fillType.value }),
  })
}

function handleCancel() {
  emit('cancel')
}

watch(
  () => props.isVisible,
  (newValue) => {
    if (!newValue) {
      resetDialog()
    }
  },
)

function resetDialog() {
  searchTerm.value = ''
  freqFilter.value = ''
  diseaseFilter.value = ''
  selectedPatientId.value = null
  fillType.value = 'frequency'
  patientStatusFilter.value = ''
}
</script>

<template>
  <dialog :open="isVisible" @cancel.prevent="handleCancel">
    <h3>{{ title }}</h3>

    <div class="dialog-filters">
      <div class="filter-group">
        <label for="patient-search">姓名/病歷號</label>
        <input type="text" id="patient-search" v-model="searchTerm" placeholder="搜尋..." />
      </div>
      <div class="filter-group">
        <label for="freq-filter">頻率</label>
        <select id="freq-filter" v-model="freqFilter">
          <option value="">全部頻率</option>
          <option v-for="f in FREQUENCIES" :key="f" :value="f">{{ f }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label for="disease-filter">須注意疾病</label>
        <select id="disease-filter" v-model="diseaseFilter">
          <option value="">全部</option>
          <option v-for="d in DISEASES" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>
      <div class="filter-group">
        <label>病人狀態</label>
        <div class="button-tabs">
          <button :class="{ active: patientStatusFilter === '' }" @click="patientStatusFilter = ''">
            全部
          </button>
          <!-- 【核心修改點】: 新增一個「急診」的篩選按鈕 -->
          <button
            :class="{ active: patientStatusFilter === 'er' }"
            @click="patientStatusFilter = 'er'"
          >
            急診
          </button>
          <button
            :class="{ active: patientStatusFilter === 'ipd' }"
            @click="patientStatusFilter = 'ipd'"
          >
            住院
          </button>
          <button
            :class="{ active: patientStatusFilter === 'opd' }"
            @click="patientStatusFilter = 'opd'"
          >
            門診
          </button>
        </div>
      </div>
    </div>

    <div id="patient-list-container">
      <div
        v-if="filteredPatients.length === 0"
        style="padding: 20px; text-align: center; color: #888"
      >
        無符合條件的病人
      </div>
      <div
        v-for="p in filteredPatients"
        :key="p.id"
        class="patient-list-item"
        :class="{ selected: selectedPatientId === p.id }"
        @click="selectPatient(p.id)"
      >
        <div class="patient-main-info">
          <span class="patient-name">{{ p.name }}</span>
          <span class="patient-mrn">({{ p.medicalRecordNumber || 'N/A' }})</span>
        </div>
        <div class="patient-meta">
          <span v-if="p.diseases && p.diseases.length" class="disease-tag-small">{{
            p.diseases.join(', ')
          }}</span>
          <!-- 新增病人狀態的顯示，讓使用者更清楚 -->
          <span class="status-tag-small" :class="`status-${p.status}`">{{
            p.status === 'er' ? '急' : p.status === 'ipd' ? '住' : '門'
          }}</span>
          <span>{{ p.freq || '未設定' }}</span>
        </div>
      </div>
    </div>

    <div v-if="showFillOptions" class="form-field" style="margin-top: 15px">
      <label>填入方式：</label>
      <div class="radio-group">
        <input type="radio" id="fill-by-freq" value="frequency" v-model="fillType" />
        <label for="fill-by-freq">依病人預設頻率填入</label>
      </div>
      <div class="radio-group">
        <input type="radio" id="fill-single" value="single" v-model="fillType" />
        <label for="fill-single">僅排入此班次</label>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-primary" @click="handleConfirm" :disabled="!selectedPatientId">
        確認
      </button>
      <button @click="handleCancel">取消</button>
    </div>
  </dialog>
</template>

<style>
dialog {
  z-index: 1000;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 600px;
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}
dialog h3 {
  margin-top: 0;
}
.dialog-filters {
  display: flex;
  gap: 15px;
  margin-bottom: 15px;
  flex-wrap: wrap;
}
.dialog-filters .filter-group {
  display: flex;
  flex-direction: column;
}
.dialog-filters label {
  font-size: 0.9em;
  margin-bottom: 5px;
  color: #555;
}
.dialog-filters input,
.dialog-filters select {
  padding: 8px;
  border-radius: 4px;
  border: 1px solid #ccc;
}
#patient-list-container {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.patient-list-item {
  padding: 10px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.patient-list-item:hover {
  background-color: #f0f0f0;
}
.patient-list-item.selected {
  background-color: #e3f2fd;
  font-weight: bold;
}
.patient-main-info {
  display: flex;
  flex-direction: column;
}
.patient-name {
  font-size: 1.1em;
}
.patient-mrn {
  font-size: 0.85em;
  color: #6c757d;
}
.patient-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9em;
}
.disease-tag-small {
  display: inline-block;
  padding: 1px 5px;
  font-size: 0.8em;
  font-weight: bold;
  color: #dc3545;
  border: 1px solid #dc3545;
  border-radius: 4px;
}
.modal-footer {
  margin-top: 20px;
  text-align: right;
}
.radio-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.modal-footer button {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 8px 12px;
  font-size: 1em;
  cursor: pointer;
  background-color: #fff;
}
.modal-footer button:disabled {
  background-color: #ccc;
  border-color: #ccc;
  cursor: not-allowed;
}
.button-tabs {
  display: flex;
  border: 1px solid #ccc;
  border-radius: 5px;
  overflow: hidden;
}
.button-tabs button {
  flex-grow: 1;
  padding: 8px;
  border: none;
  background-color: #f0f0f0;
  cursor: pointer;
  border-left: 1px solid #ccc;
}
.button-tabs button:first-child {
  border-left: none;
}
.button-tabs button.active {
  background-color: var(--primary-color);
  color: white;
}
.modal-footer {
  margin-top: 20px;
  text-align: right;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.modal-footer button {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 8px 16px;
  font-size: 1em;
  cursor: pointer;
  background-color: #fff;
  color: #333;
  transition:
    background-color 0.2s,
    border-color 0.2s;
}

.modal-footer button.btn-primary:not(:disabled) {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.modal-footer button.btn-primary:not(:disabled):hover {
  background-color: #0056b3;
  border-color: #0056b3;
}

.modal-footer button:disabled {
  background-color: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
/* 新增 status tag 的樣式 */
.status-tag-small {
  font-size: 0.8em;
  font-weight: bold;
  padding: 2px 6px;
  border-radius: 8px;
  color: white;
}
.status-tag-small.status-opd {
  background-color: #28a745;
}
.status-tag-small.status-ipd {
  background-color: #1e88e5;
}
.status-tag-small.status-er {
  background-color: #8e24aa;
}
</style>
