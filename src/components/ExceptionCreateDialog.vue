<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>新增排程例外申請</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <div class="form-group">
          <label>步驟 1: 選擇病人</label>
          <button
            class="select-btn"
            @click="isPatientDialogVisible = true"
            :disabled="isSubmitting"
          >
            <!-- ✨ 修正 1：顯示姓名和頻率 -->
            <span v-if="formData.patientId">{{ selectedPatientDisplay }}</span>
            <span v-else class="text-muted">點擊以選擇病人...</span>
          </button>
        </div>

        <div class="form-group" v-if="formData.patientId">
          <label>步驟 2: 選擇例外類型</label>
          <div class="radio-group">
            <label><input type="radio" v-model="formData.type" value="MOVE" /> 臨時調班</label>
            <label><input type="radio" v-model="formData.type" value="SUSPEND" /> 區間暫停</label>
          </div>
        </div>

        <div v-if="formData.patientId && formData.type === 'MOVE'" class="details-section">
          <div class="form-group-grid">
            <div class="form-group">
              <label for="sourceDate">步驟 3: 選擇原始日期</label>
              <input
                type="date"
                id="sourceDate"
                v-model="moveDetails.sourceDate"
                @change="fetchSourceSchedule"
              />
            </div>
            <div class="form-group">
              <label>原始排班</label>
              <div class="info-box">
                <span v-if="isFetchingSource">查詢中...</span>
                <span v-else-if="moveDetails.sourceInfo">{{ moveDetails.sourceInfo }}</span>
                <span v-else class="text-muted">請先選擇日期</span>
              </div>
            </div>
          </div>
          <div
            class="form-group-grid"
            v-if="moveDetails.sourceInfo && !moveDetails.sourceInfo.includes('無')"
          >
            <div class="form-group">
              <label for="targetDate">步驟 4: 選擇目標日期</label>
              <input type="date" id="targetDate" v-model="formData.startDate" />
            </div>
            <div class="form-group">
              <label>目標床位</label>
              <button
                class="select-btn"
                @click="openBedAssignmentForTarget"
                :disabled="!formData.startDate"
              >
                {{ targetBedDisplay }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="formData.patientId && formData.type === 'SUSPEND'" class="details-section">
          <div class="form-group-grid">
            <div class="form-group">
              <label for="startDate">開始日期</label>
              <input type="date" id="startDate" v-model="formData.startDate" />
            </div>
            <div class="form-group">
              <label for="endDate">結束日期</label>
              <input type="date" id="endDate" v-model="formData.endDate" />
            </div>
          </div>
        </div>

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

// ✨ --- 核心修正：直接在此處定義常數，而不是從外部引入 --- ✨
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
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
}
// ✨ --- 修正結束 --- ✨

// --- Dialog State ---
const isPatientDialogVisible = ref(false)
const isBedAssignmentVisible = ref(false)
const bedAssignmentProps = ref(null)
const isSubmitting = ref(false)
const isFetchingSource = ref(false)

// --- Form State ---
const defaultFormData = () => ({
  patientId: '',
  patientName: '',
  type: 'MOVE',
  startDate: '',
  endDate: '',
  reason: '',
  from: null,
  to: null,
})
const formData = reactive(defaultFormData())
const moveDetails = reactive({ sourceDate: '', sourceInfo: '' })

// --- Computed Properties ---
const selectedPatientDisplay = computed(() => {
  if (formData.patientId) {
    const patient = props.allPatients.find((p) => p.id === formData.patientId)
    return patient ? `${patient.name} (${patient.freq || '未設定'})` : '...'
  }
  return ''
})

const targetBedDisplay = computed(() => {
  if (formData.to) {
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
  if (!formData.patientId) return false
  if (formData.type === 'MOVE') {
    return !!formData.to && !!formData.from
  }
  if (formData.type === 'SUSPEND') {
    return !!formData.startDate && !!formData.endDate && formData.endDate >= formData.startDate
  }
  return false
})

const isFormValid = computed(() => isDetailsComplete.value && !!formData.reason.trim())

// --- Watchers ---
watch(
  () => props.isVisible,
  (val) => {
    if (!val) resetForm()
  },
)
watch(() => formData.patientId, resetMoveAndSuspendDetails)
watch(() => formData.type, resetMoveAndSuspendDetails)

// --- Methods ---
function resetForm() {
  Object.assign(formData, defaultFormData())
  resetMoveAndSuspendDetails()
}

function resetMoveAndSuspendDetails() {
  Object.assign(moveDetails, { sourceDate: '', sourceInfo: '' })
  formData.startDate = ''
  formData.endDate = ''
  formData.to = null
  formData.from = null
}

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
  if (!moveDetails.sourceDate || !formData.patientId) return
  isFetchingSource.value = true
  moveDetails.sourceInfo = ''
  formData.from = null
  try {
    const record = await schedulesApi.fetchById(moveDetails.sourceDate)
    if (record && record.schedule) {
      for (const shiftId in record.schedule) {
        if (record.schedule[shiftId].patientId === formData.patientId) {
          const parts = shiftId.split('-')
          const shiftCode = parts.pop()
          const bedNumPart = parts.slice(1).join('-')
          const bedNum = shiftId.startsWith('peripheral-') ? `peripheral-${bedNumPart}` : bedNumPart
          const bedText = shiftId.startsWith('peripheral-')
            ? `外圍 ${bedNumPart}`
            : `${bedNumPart}床`
          const shiftText = { early: '早', noon: '午', late: '晚' }[shiftCode] || shiftCode
          moveDetails.sourceInfo = `${bedText} / ${shiftText}班`
          formData.from = { bedNum, shiftCode, sourceDate: moveDetails.sourceDate }
          return
        }
      }
    }
    moveDetails.sourceInfo = '當日無此病人排班'
  } catch (error) {
    moveDetails.sourceInfo = '查詢失敗'
  } finally {
    isFetchingSource.value = false
  }
}

async function openBedAssignmentForTarget() {
  if (!formData.startDate) return
  try {
    const scheduleRecord = await schedulesApi.fetchById(formData.startDate)
    bedAssignmentProps.value = { scheduleData: scheduleRecord?.schedule || {} }
    isBedAssignmentVisible.value = true
  } catch (error) {
    alert('載入目標日期排班失敗，無法開啟智慧排床。')
  }
}

function handleTargetBedAssigned({ bedNum, shiftCode }) {
  formData.to = { bedNum, shiftCode }
  isBedAssignmentVisible.value = false
}

async function submitForm() {
  if (!isFormValid.value || isSubmitting.value) return
  isSubmitting.value = true
  if (formData.type === 'MOVE') {
    formData.endDate = formData.startDate
  }
  try {
    await emit('submit', JSON.parse(JSON.stringify(formData)))
  } finally {
    isSubmitting.value = false
  }
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
  height: 42px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #e9ecef;
  display: flex;
  align-items: center;
  font-weight: 500;
}
.text-muted {
  color: #6c757d;
}
.select-btn {
  width: 100%;
  height: 42px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 1rem;
  transition: border-color 0.2s;
}
.select-btn:disabled {
  background-color: #e9ecef;
  cursor: not-allowed;
}
.select-btn:not(:disabled):hover {
  border-color: #007bff;
}
</style>
