<!-- 檔案路徑: src/components/PatientSelectDialog.vue (z-index 修正版) -->
<script setup>
import { ref, computed, watch } from 'vue'

// props 和 emits 的定義保持不變
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

// 內部狀態
const searchTerm = ref('')
const freqFilter = ref('')
const diseaseFilter = ref('')
const selectedPatientId = ref(null)
const patientStatusFilter = ref('')
const fillType = ref('frequency')

// 常量
const FREQUENCIES = ['一三五', '二四六', '一四', '二五', '三六', '一五', '二六', '每周一次', '臨時']
const DISEASES = ['HIV', 'RPR', 'HBV', 'HCV', '隔離']

// 計算屬性
const filteredPatients = computed(() => {
  if (!props.patients || props.patients.length === 0) {
    return []
  }
  return props.patients.filter((p) => {
    const term = searchTerm.value.toLowerCase()
    const matchesSearch =
      !term ||
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.medicalRecordNumber && p.medicalRecordNumber.includes(term))

    // ======================= 【核心修改點】 =======================
    // 將所有 p.frequency 的引用，全部改為 p.freq
    const matchesFreq = !freqFilter.value || p.freq === freqFilter.value
    // ==========================================================

    const matchesDisease =
      !diseaseFilter.value || (p.diseases && p.diseases.includes(diseaseFilter.value))
    const matchesStatus = !patientStatusFilter.value || p.status === patientStatusFilter.value

    return matchesSearch && matchesFreq && matchesDisease && matchesStatus
  })
})

// 方法
function selectPatient(patientId) {
  selectedPatientId.value = patientId
}

function handleConfirm() {
  if (!selectedPatientId.value) {
    alert('請先選擇一位病人！')
    return
  }
  if (props.showFillOptions) {
    emit('confirm', {
      patientId: selectedPatientId.value,
      fillType: fillType.value,
    })
  } else {
    emit('confirm', selectedPatientId.value)
  }
}

function handleCancel() {
  emit('cancel')
}

// 監聽 isVisible 的變化，在 dialog 關閉時重置內部狀態
// 這樣可以避免上次的選擇殘留
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
  <!-- 使用 isVisible prop 來控制 dialog 的 open 屬性 -->
  <dialog :open="isVisible" @cancel.prevent="handleCancel">
    <h3>{{ title }}</h3>

    <!-- 篩選器區塊 -->
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
          <button
            :class="{ active: patientStatusFilter === 'opd' }"
            @click="patientStatusFilter = 'opd'"
          >
            門診
          </button>
          <button
            :class="{ active: patientStatusFilter === 'ipd' }"
            @click="patientStatusFilter = 'ipd'"
          >
            住院
          </button>
        </div>
      </div>
    </div>

    <!-- 病人列表容器 -->
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
          <!-- ======================= 【核心修改點】 ======================= -->
          <span>{{ p.freq || '未設定' }}</span>
          <!-- ========================================================== -->
        </div>
      </div>
    </div>

    <!-- 「填入方式」區塊 -->
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

    <!-- 底部按鈕區塊 -->
    <div class="modal-footer">
      <button class="btn-primary" @click="handleConfirm" :disabled="!selectedPatientId">
        確認
      </button>
      <button @click="handleCancel">取消</button>
    </div>
  </dialog>
</template>

<style>
/* 關鍵修正：為 dialog 新增 z-index */
dialog {
  z-index: 1000;
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 600px;
  position: fixed; /* <-- 新增這一行 */
  top: 50%; /* <-- 新增這一行，讓它從垂直中心開始定位 */
  left: 50%; /* <-- 新增這一行，讓它從水平中心開始定位 */
  transform: translate(-50%, -50%); /* <-- 新增這一行，將它精確地置中 */
  z-index: 1000;
}
dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}
/* 其他所有 dialog, filter, patient-list-item 等樣式保持不變 */
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
  overflow: hidden; /* 讓內部按鈕的圓角生效 */
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

/* 1. 所有按鈕的基礎樣式 (通用) */
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

/* 2. 主按鈕的樣式 (啟用狀態) */
/* 關鍵修正：我們同時指定了 class 和 :not(:disabled) 偽類 */
/* 這使得它的特殊性高於通用的 button 規則 */
.modal-footer button.btn-primary:not(:disabled) {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

/* 3. 主按鈕的滑鼠懸停效果 (啟用狀態) */
.modal-footer button.btn-primary:not(:disabled):hover {
  background-color: #0056b3;
  border-color: #0056b3;
}

/* 4. 所有按鈕的禁用樣式 (最高優先級) */
/* 這條規則會覆蓋上面所有的顏色設定，當按鈕被禁用時 */
.modal-footer button:disabled {
  background-color: #e0e0e0; /* 稍微深一點的灰色，更易讀 */
  border-color: #e0e0e0;
  color: #9e9e9e;
  cursor: not-allowed;
}
</style>
