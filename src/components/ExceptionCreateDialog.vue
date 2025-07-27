<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>新增排程例外申請</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <!-- Step 1: Select Patient -->
        <div class="form-group">
          <label>步驟 1: 選擇病人</label>
          <button
            class="select-btn"
            @click="isPatientDialogVisible = true"
            :disabled="isSubmitting"
          >
            <!-- ✨ FIX: Use the new computed property -->
            <div
              v-if="formData.patientId"
              class="patient-display-content"
              v-html="selectedPatientDisplay"
            ></div>
            <span v-else class="text-muted">點擊以選擇病人...</span>
          </button>
        </div>

        <!-- Step 2: Select Exception Type -->
        <div class="form-group" v-if="formData.patientId">
          <label>步驟 2: 選擇例外類型</label>
          <div class="radio-group">
            <label><input type="radio" v-model="formData.type" value="MOVE" /> 臨時調班</label>
            <label><input type="radio" v-model="formData.type" value="SUSPEND" /> 區間暫停</label>
          </div>
        </div>

        <!-- Details for MOVE (Temporary Transfer) -->
        <div v-if="formData.patientId && formData.type === 'MOVE'" class="details-section">
          <div class="form-group-grid">
            <div class="form-group">
              <label for="sourceDate">步驟 3: 選擇原始日期</label>
              <!-- ✨ FIX: v-model now points to a valid object property -->
              <input
                type="date"
                id="sourceDate"
                v-model="formData.from.sourceDate"
                @change="fetchSourceSchedule"
              />
            </div>
            <div class="form-group">
              <label>原始排班</label>
              <!-- ✨ FIX: Use the new computed property for display -->
              <div class="info-box">
                {{ sourceBedDisplay }}
              </div>
            </div>
          </div>
          <div class="form-group-grid" v-if="formData.from.bedNum">
            <div class="form-group">
              <label for="targetDate">步驟 4: 選擇目標日期</label>
              <!-- ✨ FIX: v-model now points to a valid object property -->
              <input type="date" id="targetDate" v-model="formData.to.goalDate" />
            </div>
            <div class="form-group">
              <label>目標床位</label>
              <button
                class="select-btn"
                @click="openBedAssignmentForTarget"
                :disabled="!formData.to.goalDate"
              >
                {{ targetBedDisplay }}
              </button>
            </div>
          </div>
        </div>

        <!-- Details for SUSPEND (Suspend Schedule) -->
        <div v-if="formData.patientId && formData.type === 'SUSPEND'" class="details-section">
          <div class="form-group-grid">
            <div class="form-group">
              <label for="startDate">開始日期 (包含)</label>
              <!-- ✨ FIX: Correctly bind to formData.startDate -->
              <input type="date" id="startDate" v-model="formData.startDate" />
            </div>
            <div class="form-group">
              <label for="endDate">結束日期 (包含)</label>
              <!-- ✨ FIX: Correctly bind to formData.endDate -->
              <input type="date" id="endDate" v-model="formData.endDate" />
            </div>
          </div>
        </div>

        <!-- Step 5: Reason -->
        <div class="form-group" v-if="isDetailsComplete">
          <label>步驟 5: 原因說明</label>
          <textarea v-model="formData.reason" rows="2" placeholder="請簡要說明原因"></textarea>
        </div>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button
          class="btn btn-primary"
          @click="submitForm"
          :disabled="!isFormValid || isSubmitting"
        >
          {{ isSubmitting ? '提交中...' : '提交申請' }}
        </button>
      </footer>
    </div>
  </div>

  <!-- Child Dialogs -->
  <PatientSelectDialog
    :is-visible="isPatientDialogVisible"
    title="選擇病人"
    :patients="allPatients"
    :show-fill-options="false"
    @confirm="handlePatientSelected"
    @cancel="isPatientDialogVisible = false"
  />
  <BedAssignmentDialog
    v-if="bedAssignmentProps"
    :is-visible="isBedAssignmentVisible"
    :all-patients="[allPatients.find((p) => p.id === formData.patientId)]"
    :bed-layout="bedLayout"
    :schedule-data="bedAssignmentProps.scheduleData"
    :shifts="shifts"
    :freq-map="freqMap"
    :assignment-mode="'singleDay'"
    :hide-patient-list="true"
    @close="isBedAssignmentVisible = false"
    @assign-bed="handleTargetBedAssigned"
  />
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import { ORDERED_SHIFT_CODES } from '@/constants/scheduleConstants.js'

const props = defineProps({
  isVisible: Boolean,
  allPatients: Array,
  isPageLocked: Boolean,
})
const emit = defineEmits(['close', 'submit'])

// --- API and Constants ---
const schedulesApi = ApiManager('schedules')
const shifts = ORDERED_SHIFT_CODES
const bedLayout = [
  1,
  2,
  3,
  5,
  6,
  7,
  8,
  9,
  11,
  12,
  13,
  15,
  16,
  17,
  18,
  19,
  21,
  22,
  23,
  25,
  26,
  27,
  28,
  29,
  31,
  32,
  33,
  35,
  36,
  37,
  38,
  39,
  51,
  52,
  53,
  55,
  56,
  57,
  58,
  59,
  61,
  62,
  63,
  65,
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
]
const freqMap = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
}

// --- Dialog State ---
const isPatientDialogVisible = ref(false)
const isBedAssignmentVisible = ref(false)
const bedAssignmentProps = ref(null)
const isSubmitting = ref(false)
const isFetchingSource = ref(false)
const sourceScheduleMessage = ref('') // For storing messages like "查無排班"

// --- Form State ---
// ✨ FIX: Initialize from and to as objects to prevent "cannot read property of null" error
const defaultFormData = () => ({
  patientId: '',
  patientName: '',
  type: 'MOVE',
  startDate: '', // Used for SUSPEND
  endDate: '', // Used for SUSPEND
  reason: '',
  from: { sourceDate: '', bedNum: null, shiftCode: null }, // for MOVE
  to: { goalDate: '', bedNum: null, shiftCode: null }, // for MOVE
})

const formData = reactive(defaultFormData())

// --- Computed Properties ---
const selectedPatientDisplay = computed(() => {
  if (!formData.patientId) return ''
  const patient = props.allPatients.find((p) => p.id === formData.patientId)
  if (!patient) return ''

  const nameAndMRN = `${patient.name} (${patient.medicalRecordNumber})`
  const freqText = patient.freq
    ? ` <span class="patient-info-tag freq-tag">[${patient.freq}]</span>`
    : ''

  // 🔥↓↓↓【核心修改點】↓↓↓
  // 檢查病人是否有 diseases 陣列，並且陣列不為空
  let diseasesText = ''
  if (patient.diseases && patient.diseases.length > 0) {
    // 將疾病陣列中的每個標籤都包裝在一個 span 中
    diseasesText = patient.diseases
      .map((disease) => `<span class="patient-info-tag disease-tag">${disease}</span>`)
      .join(' ') // 用空格將多個疾病標籤分開
  }
  // 🔥↑↑↑【核心修改點】↑↑↑

  // 返回組合好的 HTML 字串
  return `${nameAndMRN}${freqText} ${diseasesText}`
})

// ✨ FIX: Added a computed property for source bed display logic
const sourceBedDisplay = computed(() => {
  if (isFetchingSource.value) return '查詢中...'
  if (sourceScheduleMessage.value) return sourceScheduleMessage.value
  if (formData.from.bedNum && formData.from.shiftCode) {
    const shiftDisplayMap = { early: '早', noon: '午', late: '晚' }
    const shiftText = shiftDisplayMap[formData.from.shiftCode] || formData.from.shiftCode
    const bedText = String(formData.from.bedNum).startsWith('peripheral')
      ? `外圍 ${formData.from.bedNum.split('-')[1]}`
      : `${formData.from.bedNum}床`
    return `${bedText} / ${shiftText}班`
  }
  return '待查詢...'
})

const targetBedDisplay = computed(() => {
  if (formData.to.bedNum && formData.to.shiftCode) {
    const shiftDisplayMap = { early: '早', noon: '午', late: '晚' }
    const shiftText = shiftDisplayMap[formData.to.shiftCode] || formData.to.shiftCode
    const bedText = String(formData.to.bedNum).startsWith('peripheral')
      ? `外圍 ${formData.to.bedNum.split('-')[1]}`
      : `${formData.to.bedNum}床`
    return `${bedText} / ${shiftText}班`
  }
  return '點擊以選擇目標床位...'
})

const isDetailsComplete = computed(() => {
  if (formData.type === 'MOVE') {
    return !!formData.from.bedNum && !!formData.to.bedNum && !!formData.to.goalDate
  }
  if (formData.type === 'SUSPEND') {
    return !!formData.startDate && !!formData.endDate && formData.endDate >= formData.startDate
  }
  return false
})

const isFormValid = computed(() => {
  return isDetailsComplete.value && !!formData.reason.trim()
})

// --- Watchers ---
watch(
  () => props.isVisible,
  (val) => {
    if (val) {
      // Reset form when dialog becomes visible
      Object.assign(formData, defaultFormData())
      sourceScheduleMessage.value = ''
    }
  },
)

watch(
  () => formData.patientId,
  () => {
    // Reset details when patient changes
    Object.assign(formData, {
      ...defaultFormData(),
      patientId: formData.patientId, // keep new patientId
      patientName: formData.patientName, // keep new patientName
    })
    sourceScheduleMessage.value = ''
  },
)

watch(
  () => formData.type,
  () => {
    // Reset specific fields when type changes
    formData.startDate = ''
    formData.endDate = ''
    formData.from = { sourceDate: '', bedNum: null, shiftCode: null }
    formData.to = { goalDate: '', bedNum: null, shiftCode: null }
    sourceScheduleMessage.value = ''
  },
)

// --- Methods ---
function close() {
  emit('close')
}

function handlePatientSelected({ patientId }) {
  const patient = props.allPatients.find((p) => p.id === patientId)
  if (patient) {
    formData.patientId = patient.id
    formData.patientName = patient.name
  }
  isPatientDialogVisible.value = false
}

async function fetchSourceSchedule() {
  if (!formData.from.sourceDate || !formData.patientId) return

  isFetchingSource.value = true
  sourceScheduleMessage.value = ''
  formData.from.bedNum = null
  formData.from.shiftCode = null

  try {
    const record = await schedulesApi.fetchById(formData.from.sourceDate)
    if (record && record.schedule) {
      for (const shiftId in record.schedule) {
        if (record.schedule[shiftId].patientId === formData.patientId) {
          const parts = shiftId.split('-')
          const shiftCode = parts.pop()
          // Correctly handle bed numbers like 'bed-1' and 'peripheral-1'
          const bedNum = shiftId.replace(`-${shiftCode}`, '').replace('bed-', '')

          formData.from.bedNum = bedNum
          formData.from.shiftCode = shiftCode
          isFetchingSource.value = false
          return
        }
      }
    }
    sourceScheduleMessage.value = '當日無此病人排班'
  } catch (error) {
    console.error('查詢原始排班失敗:', error)
    sourceScheduleMessage.value = '查詢失敗'
  } finally {
    isFetchingSource.value = false
  }
}

async function openBedAssignmentForTarget() {
  if (!formData.to.goalDate) return
  try {
    const scheduleRecord = await schedulesApi.fetchById(formData.to.goalDate)
    bedAssignmentProps.value = {
      scheduleData: scheduleRecord ? scheduleRecord.schedule : {},
    }
    isBedAssignmentVisible.value = true
  } catch (error) {
    console.error('載入目標日期排班失敗:', error)
    alert('載入目標日期排班失敗，無法開啟智慧排床。')
  }
}

function handleTargetBedAssigned({ bedNum, shiftCode }) {
  formData.to.bedNum = bedNum
  formData.to.shiftCode = shiftCode
  isBedAssignmentVisible.value = false
}

function submitForm() {
  if (!isFormValid.value) return

  const dataToSubmit = JSON.parse(JSON.stringify(formData))

  // For MOVE type, the date range is defined by from.sourceDate and to.goalDate
  // But the backend dispatcher uses startDate/endDate, so we must set them correctly.
  if (dataToSubmit.type === 'MOVE') {
    // A single move operation is conceptually two tasks on different days.
    // However, the current backend dispatcher iterates from startDate to endDate.
    // For a simple move, we can just treat the source date as the start and end.
    // The worker function will handle the from/to logic.
    // This part might need adjustment depending on how the Cloud Function is implemented.
    // Let's assume for now the parent exception needs a date range.
    // The most logical range is from the source date to the target date.
    dataToSubmit.startDate = dataToSubmit.from.sourceDate
    dataToSubmit.endDate = dataToSubmit.to.goalDate
  }

  emit('submit', dataToSubmit)
}
</script>

<style scoped>
/* 基本 Dialog 樣式 */
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
}
.dialog-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
}
.dialog-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dialog-header h2 {
  margin: 0;
  font-size: 1.5rem;
}
.close-button {
  border: none;
  background: none;
  font-size: 2rem;
  cursor: pointer;
  color: #6c757d;
}
.dialog-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.dialog-footer {
  padding: 1.5rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

/* 表單元素樣式 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-group-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 1rem;
}
.form-group label {
  font-weight: 500;
}
.form-group input[type='text'],
.form-group input[type='date'],
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
}
.form-group textarea {
  resize: vertical;
}
.patient-info {
  font-size: 0.9rem;
  color: #007bff;
  background-color: #e7f3ff;
  padding: 0.5rem;
  border-radius: 4px;
}
.radio-group {
  display: flex;
  gap: 2rem;
}

/* 按鈕樣式 (繼承或自定義) */
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
}
.btn-primary {
  background-color: #007bff;
  color: white;
}
.btn-secondary {
  background-color: #6c757d;
  color: white;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.details-section {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1rem;
  background-color: #f8f9fa;
}
.form-group-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: end;
}
.info-box {
  height: 48px; /* Matched height with input */
  padding: 0.75rem; /* Matched padding with input */
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #e9ecef;
  display: flex;
  align-items: center;
  font-weight: 500;
  box-sizing: border-box;
}
.text-muted {
  color: #6c757d;
}
.select-btn {
  width: 100%;
  height: 48px; /* Matched height with input */
  padding: 0.75rem; /* Matched padding with input */
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 1rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
}
.select-btn:disabled {
  background-color: #e9ecef;
  cursor: not-allowed;
}
.select-btn:not(:disabled):hover {
  border-color: #007bff;
}
</style>
