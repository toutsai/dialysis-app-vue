<!-- 檔案路徑: src/components/ExceptionCreateDialog.vue (智慧衝突處理版) -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <!-- 🔥 動態標題 -->
        <h2>{{ isEditingMode ? '解決排程衝突' : '新增排程例外申請' }}</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <!-- Step 1: Select Patient -->
        <div class="form-group">
          <label>步驟 1: 選擇病人</label>
          <button
            class="select-btn"
            @click="isPatientDialogVisible = true"
            :disabled="isSubmitting || isEditingMode"
          >
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
            <label
              ><input type="radio" v-model="formData.type" value="MOVE" :disabled="isEditingMode" />
              臨時調班</label
            >
            <label
              ><input
                type="radio"
                v-model="formData.type"
                value="SUSPEND"
                :disabled="isEditingMode"
              />
              區間暫停</label
            >
          </div>
        </div>

        <!-- Details for MOVE (Temporary Transfer) -->
        <div v-if="formData.patientId && formData.type === 'MOVE'" class="details-section">
          <div class="form-group-grid">
            <div class="form-group">
              <label for="sourceDate">步驟 3: 選擇原始日期</label>
              <input
                type="date"
                id="sourceDate"
                v-model="formData.from.sourceDate"
                @change="fetchSourceSchedule"
                :disabled="isEditingMode"
              />
            </div>
            <div class="form-group">
              <label>原始排班</label>
              <div class="info-box">
                {{ sourceBedDisplay }}
              </div>
            </div>
          </div>
          <div class="form-group-grid" v-if="formData.from.bedNum">
            <div class="form-group">
              <label for="targetDate">步驟 4: 選擇目標日期</label>
              <input
                type="date"
                id="targetDate"
                v-model="formData.to.goalDate"
                :disabled="isEditingMode"
              />
            </div>
            <div class="form-group">
              <label>目標床位</label>
              <button
                class="select-btn"
                @click="openBedAssignmentForTarget"
                :disabled="!formData.to.goalDate || isSubmitting"
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
              <input
                type="date"
                id="startDate"
                v-model="formData.startDate"
                :disabled="isEditingMode"
              />
            </div>
            <div class="form-group">
              <label for="endDate">結束日期 (包含)</label>
              <input
                type="date"
                id="endDate"
                v-model="formData.endDate"
                :disabled="isEditingMode"
              />
            </div>
          </div>
        </div>

        <!-- Step 5: Reason -->
        <div class="form-group" v-if="isDetailsComplete">
          <label>步驟 5: 原因說明</label>
          <textarea
            v-model="formData.reason"
            rows="2"
            placeholder="請簡要說明原因"
            :disabled="isEditingMode"
          ></textarea>
        </div>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button
          class="btn btn-primary"
          @click="submitForm"
          :disabled="!isFormValid || isSubmitting"
        >
          {{ isSubmitting ? '提交中...' : isEditingMode ? '重新提交申請' : '提交申請' }}
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

// 🔥 核心修改：新增 initialData prop
const props = defineProps({
  isVisible: Boolean,
  allPatients: Array,
  isPageLocked: Boolean,
  initialData: {
    type: Object,
    default: null,
  },
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
const sourceScheduleMessage = ref('')

// --- Form State ---
const defaultFormData = () => ({
  id: null, // 🔥 新增 id 欄位
  patientId: '',
  patientName: '',
  type: 'MOVE',
  startDate: '',
  endDate: '',
  reason: '',
  from: { sourceDate: '', bedNum: null, shiftCode: null },
  to: { goalDate: '', bedNum: null, shiftCode: null },
})

const formData = reactive(defaultFormData())

// --- Computed Properties ---
// 🔥 新增：判斷是否為編輯模式
const isEditingMode = computed(() => !!props.initialData)

const selectedPatientDisplay = computed(() => {
  if (!formData.patientId) return ''
  const patient = props.allPatients.find((p) => p.id === formData.patientId)
  if (!patient) return ''
  const nameAndMRN = `${patient.name} (${patient.medicalRecordNumber})`
  const freqText = patient.freq
    ? ` <span class="patient-info-tag freq-tag">[${patient.freq}]</span>`
    : ''
  let diseasesText = ''
  if (patient.diseases && patient.diseases.length > 0) {
    diseasesText = patient.diseases
      .map((disease) => `<span class="patient-info-tag disease-tag">${disease}</span>`)
      .join(' ')
  }
  return `${nameAndMRN}${freqText} ${diseasesText}`
})

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
// 🔥 核心修改：監聽 isVisible，並根據 initialData 決定如何初始化表單
watch(
  () => props.isVisible,
  (isVisible) => {
    if (isVisible) {
      if (props.initialData) {
        // 編輯模式：用 initialData 填充表單
        console.log('Dialog opened in EDIT mode with data:', props.initialData)
        Object.assign(formData, {
          ...props.initialData,
          // 🔥 關鍵：清空目標床位，強制使用者重新選擇
          to: {
            ...props.initialData.to,
            bedNum: null,
            shiftCode: null,
          },
        })
        sourceScheduleMessage.value = ''
      } else {
        // 新增模式：重置為空表單
        console.log('Dialog opened in CREATE mode.')
        Object.assign(formData, defaultFormData())
        sourceScheduleMessage.value = ''
      }
    }
  },
)

// (以下兩個 watcher 在新的邏輯下可以移除，因為重置邏輯已合併到 isVisible watcher 中)
// watch(() => formData.patientId, ...);
// watch(() => formData.type, ...);

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
  // 1. 檢查目標日期是否存在 (保持不變)
  if (!formData.to.goalDate) return

  try {
    // 2. 直接從 Firestore 獲取目標日期【當天最原始、最準確】的排班紀錄
    const scheduleRecord = await schedulesApi.fetchById(formData.to.goalDate)
    const accurateScheduleData = scheduleRecord ? scheduleRecord.schedule : {}

    // 3. 將這份【未經任何前端修改】的、最準確的排班資料，直接傳遞給智慧排床
    bedAssignmentProps.value = {
      scheduleData: accurateScheduleData,
    }

    // 4. 打開智慧排床對話框
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

  if (dataToSubmit.type === 'MOVE') {
    dataToSubmit.startDate = dataToSubmit.from.sourceDate
    dataToSubmit.endDate = dataToSubmit.to.goalDate
  }

  emit('submit', dataToSubmit)
}
</script>

<style scoped>
/* ================================== */
/*         通用及桌面版樣式            */
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
  padding: 1rem;
}
.dialog-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 500px; /* 稍微縮小寬度，更適合表單 */
  display: flex;
  flex-direction: column;
  max-height: 90vh; /* 確保 Modal 不會超出視窗高度 */
}
.dialog-header {
  padding: 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
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
  overflow-y: auto; /* 讓 body 內部可以滾動 */
}
.dialog-footer {
  padding: 1.5rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  flex-shrink: 0;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
.radio-group {
  display: flex;
  gap: 2rem;
}
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
  background-color: #f8f9fa;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.form-group-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: end;
}
.info-box {
  height: 48px;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #e9ecef;
  display: flex;
  align-items: center;
  font-weight: 500;
  box-sizing: border-box;
  font-size: 0.9rem; /* 稍微縮小字體 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.text-muted {
  color: #6c757d;
}
.select-btn {
  width: 100%;
  height: 48px;
  padding: 0.75rem;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  text-align: left;
  font-size: 1rem;
  transition: border-color 0.2s;
  box-sizing: border-box;
  display: flex;
  align-items: center;
}
.select-btn:disabled {
  background-color: #e9ecef;
  cursor: not-allowed;
}
.select-btn:not(:disabled):hover {
  border-color: #007bff;
}

/* 病人資訊標籤樣式 */
.patient-display-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  line-height: 1.5;
  flex-wrap: wrap; /* 允許標籤換行 */
}
:deep(.patient-info-tag) {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
:deep(.freq-tag) {
  background-color: #e7f3ff;
  color: #0056b3;
  border: 1px solid #b3d7ff;
}
:deep(.disease-tag) {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

/* ================================== */
/* ‼️        新增的響應式樣式        ‼️ */
/* ================================== */
@media (max-width: 768px) {
  /* 在手機上，讓 Modal 從頂部對齊 */
  .dialog-overlay {
    align-items: flex-start;
  }

  .dialog-content {
    padding: 0; /* 移除外層 padding，交由 header/body/footer 控制 */
    margin-top: 5vh;
  }
  .dialog-header,
  .dialog-body,
  .dialog-footer {
    padding: 1rem;
  }
  .dialog-header h2 {
    font-size: 1.25rem;
  }

  /* 核心修改：將兩欄的 Grid 佈局改為單欄 */
  .form-group-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .info-box {
    height: auto; /* 高度自動 */
    min-height: 48px;
  }

  /* 讓底部按鈕垂直堆疊，並且主要按鈕在上方 */
  .dialog-footer {
    flex-direction: column-reverse;
    gap: 0.75rem;
  }

  .dialog-footer .btn {
    width: 100%;
  }
}
</style>
