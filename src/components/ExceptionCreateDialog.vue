<!-- 檔案路徑: src/components/ExceptionCreateDialog.vue (完整修正版) -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>{{ dialogTitle }}</h2>
        <button class="close-button" @click="close">&times;</button>
      </header>
      <div class="dialog-body">
        <!-- 步驟 1: 選擇病人 -->
        <div class="form-group">
          <label>步驟 1: 選擇病人</label>
          <button
            class="select-btn"
            @click="isPatientDialogVisible = true"
            :disabled="isEditMode || isPrefilled"
          >
            <div v-if="formData.patientId" class="patient-display-content">
              <span
                >{{ formData.patientName }} ({{
                  getPatient(formData.patientId)?.medicalRecordNumber
                }})</span
              >
              <span v-if="getPatient(formData.patientId)?.freq" class="patient-info-tag freq-tag">
                {{ getPatient(formData.patientId).freq }}
              </span>
            </div>
            <span v-else class="text-muted">點擊以選擇病人...</span>
          </button>
        </div>

        <!-- 步驟 2: 選擇類型 -->
        <div class="form-group">
          <label>步驟 2: 選擇例外類型</label>
          <div class="radio-group">
            <label>
              <input
                type="radio"
                name="exceptionType"
                value="MOVE_SINGLE"
                v-model="formType"
                :disabled="!formData.patientId || isPrefilled"
              />
              臨時調班 (單日)
            </label>
            <label>
              <input
                type="radio"
                name="exceptionType"
                value="MOVE_INTERVAL"
                v-model="formType"
                :disabled="!formData.patientId || isPrefilled"
              />
              區間調班
            </label>
            <label>
              <input
                type="radio"
                name="exceptionType"
                value="SUSPEND"
                v-model="formType"
                :disabled="!formData.patientId || isPrefilled"
              />
              區間暫停
            </label>
          </div>
        </div>

        <!-- 步驟 3: 調班詳情 (單日) -->
        <div class="details-section" v-if="formType === 'MOVE_SINGLE'">
          <div class="form-group-grid">
            <div class="form-group">
              <label>步驟 3: 選擇原始日期</label>
              <input type="date" v-model="formData.from.sourceDate" :disabled="isFetchingSource" />
            </div>
            <div class="form-group">
              <label>原始排班</label>
              <div class="info-box">
                <span v-if="isFetchingSource">查詢中...</span>
                <span v-else-if="sourceScheduleMessage" class="text-muted">{{
                  sourceScheduleMessage
                }}</span>
                <span v-else>{{ sourceBedDisplay }}</span>
              </div>
            </div>
          </div>
          <div class="form-group-grid">
            <div class="form-group">
              <label>步驟 4: 選擇目標日期</label>
              <input type="date" v-model="formData.to.goalDate" :disabled="!formData.from.bedNum" />
            </div>
            <div class="form-group">
              <label>目標排班</label>
              <!-- ✨ 核心修改點 1 -->
              <button
                class="select-btn"
                @click="openBedAssignmentDialog"
                :disabled="!formData.to.goalDate || isLoadingBeds"
              >
                <span v-if="isLoadingBeds">查詢空床中...</span>
                <span v-else>{{ targetBedDisplay }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 步驟 4: 區間調班詳情 -->
        <div class="details-section" v-if="formType === 'MOVE_INTERVAL'">
          <div class="form-group-grid">
            <div class="form-group">
              <label>步驟 3: 調班開始日期</label>
              <input type="date" v-model="formData.startDate" :disabled="isPrefilled" />
            </div>
            <div class="form-group">
              <label>步驟 4: 調班結束日期</label>
              <input
                type="date"
                v-model="formData.endDate"
                :min="formData.startDate"
                :disabled="isPrefilled"
              />
            </div>
          </div>
          <div class="form-group">
            <label>步驟 5: 目標床位</label>
            <div v-if="isPrefilled" class="info-box">
              {{ targetBedDisplay }}
            </div>
            <!-- ✨ 核心修改點 2 -->
            <button
              v-else
              class="select-btn"
              @click="openBedAssignmentDialog"
              :disabled="!formData.startDate || isLoadingBeds"
            >
              <span v-if="isLoadingBeds">查詢空床中...</span>
              <span v-else>{{ targetBedDisplay }}</span>
            </button>
          </div>
        </div>

        <!-- 步驟 3: 暫停詳情 -->
        <div class="details-section" v-if="formType === 'SUSPEND'">
          <div class="form-group-grid">
            <div class="form-group">
              <label>步驟 3: 選擇暫停開始日期</label>
              <input type="date" v-model="formData.startDate" />
            </div>
            <div class="form-group">
              <label>步驟 4: 選擇暫停結束日期</label>
              <input type="date" v-model="formData.endDate" :min="formData.startDate" />
            </div>
          </div>
        </div>

        <!-- 申請事由 -->
        <div class="form-group">
          <label>申請事由</label>
          <textarea
            v-model.trim="formData.reason"
            rows="3"
            placeholder="請簡述調班或暫停原因"
          ></textarea>
        </div>
      </div>

      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button class="btn btn-primary" @click="submitForm" :disabled="!isFormValid">
          {{ isEditMode ? '更新申請' : '提交申請' }}
        </button>
      </footer>
    </div>

    <!-- 子對話框 -->
    <PatientSelectDialog
      :is-visible="isPatientDialogVisible"
      :patients="allPatients"
      @confirm="handlePatientSelected"
      @cancel="isPatientDialogVisible = false"
      title="選擇病人"
    />
    <!-- ✨ 核心修改點 3: 修改 BedAssignmentDialog 的 props 傳遞方式 -->
    <BedAssignmentDialog
      v-if="isBedAssignmentVisible"
      :is-visible="isBedAssignmentVisible"
      :all-patients="allPatients"
      :bed-layout="props.bedLayout"
      :freq-map="props.freqMap"
      :shifts="['early', 'noon', 'late']"
      :day-of-week="
        new Date(formType === 'MOVE_SINGLE' ? formData.to.goalDate : formData.startDate).getDay()
      "
      :schedule-data="targetDateScheduleData"
      :hide-patient-list="true"
      :assignment-mode="'singleDay'"
      @close="isBedAssignmentVisible = false"
      @assign-bed="handleTargetBedAssigned"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import ApiManager from '@/services/api_manager.js'

const schedulesApi = ApiManager('schedules')

const props = defineProps({
  isVisible: Boolean,
  allPatients: { type: Array, default: () => [] },
  initialData: { type: Object, default: null },
  bedLayout: { type: Array, required: true },
  freqMap: { type: Object, required: true },
})
const emit = defineEmits(['close', 'submit'])

const formType = ref('MOVE_SINGLE')
const defaultFormData = () => ({
  patientId: null,
  patientName: '',
  type: 'MOVE',
  from: { sourceDate: '', bedNum: null, shiftCode: null, source: 'daily_schedule' },
  to: { goalDate: '', bedNum: null, shiftCode: null },
  startDate: '',
  endDate: '',
  reason: '',
  status: 'pending',
})
const formData = reactive(defaultFormData())

const isPatientDialogVisible = ref(false)
const isBedAssignmentVisible = ref(false)
const isFetchingSource = ref(false)
const sourceScheduleMessage = ref('')

// ✨ 核心修改點 4: 新增狀態來管理床位查詢
const isLoadingBeds = ref(false)
const targetDateScheduleData = ref({}) // 用於儲存查詢到的排程資料

// --- Computed Properties ---
const isEditMode = computed(() => !!props.initialData?.id)
const isPrefilled = computed(() => !!props.initialData && !props.initialData.id)
const dialogTitle = computed(() => {
  if (isEditMode.value) return '編輯排程例外申請'
  if (isPrefilled.value) return '確認借床申請'
  return '新增排程例外申請'
})
const getPatient = (patientId) => props.allPatients.find((p) => p.id === patientId)
const shiftDisplayNames = { early: '早', noon: '午', late: '晚' }
const sourceBedDisplay = computed(() => {
  if (formData.from.bedNum && formData.from.shiftCode) {
    const shiftText = shiftDisplayNames[formData.from.shiftCode] || formData.from.shiftCode
    const bedText = String(formData.from.bedNum).startsWith('peripheral')
      ? `外圍 ${formData.from.bedNum.split('-')[1]}`
      : `${formData.from.bedNum}床`
    return `${bedText} / ${shiftText}班`
  }
  return '待查詢...'
})
const targetBedDisplay = computed(() => {
  if (formData.to.bedNum && formData.to.shiftCode) {
    const shiftText = shiftDisplayNames[formData.to.shiftCode] || formData.to.shiftCode
    const bedText = String(formData.to.bedNum).startsWith('peripheral')
      ? `外圍 ${formData.to.bedNum.split('-')[1]}`
      : `${formData.to.bedNum}床`
    return `${bedText} / ${shiftText}班`
  }
  return '點擊以選擇目標床位...'
})
const isDetailsComplete = computed(() => {
  switch (formType.value) {
    case 'MOVE_SINGLE':
      return !!formData.from.bedNum && !!formData.to.bedNum && !!formData.to.goalDate
    case 'MOVE_INTERVAL':
      return (
        !!formData.startDate &&
        !!formData.endDate &&
        formData.endDate >= formData.startDate &&
        !!formData.to.bedNum
      )
    case 'SUSPEND':
      return !!formData.startDate && !!formData.endDate && formData.endDate >= formData.startDate
    default:
      return false
  }
})
const isFormValid = computed(
  () => formData.patientId && isDetailsComplete.value && !!formData.reason.trim(),
)

// --- Watchers ---
watch(
  () => props.isVisible,
  (isVisible) => {
    if (isVisible) {
      Object.assign(formData, defaultFormData())
      sourceScheduleMessage.value = ''
      targetDateScheduleData.value = {}
      formType.value = 'MOVE_SINGLE'

      if (props.initialData) {
        const data = props.initialData

        if (data.ui_type === 'MOVE_INTERVAL') {
          formType.value = 'MOVE_INTERVAL'
        } else if (data.type === 'SUSPEND') {
          formType.value = 'SUSPEND'
        } else {
          formType.value = 'MOVE_SINGLE'
        }

        formData.patientId = data.patientId || null
        formData.patientName = data.patientName || ''
        formData.reason = data.reason || ''
        formData.startDate = data.startDate || ''
        formData.endDate = data.endDate || ''
        if (data.status) formData.status = data.status

        if (data.to) {
          formData.to.bedNum = data.to.bedNum
          formData.to.shiftCode = data.to.shiftCode
        }
        if (data.from) {
          Object.assign(formData.from, data.from)
        }

        if (formType.value.startsWith('MOVE')) {
          formData.type = 'MOVE'
        } else {
          formData.type = 'SUSPEND'
        }
      }
    }
  },
  { deep: true, immediate: true },
)

watch(
  () => formData.patientId,
  () => {
    if (isPrefilled.value || isEditMode.value) return
    formData.from = { sourceDate: '', bedNum: null, shiftCode: null, source: 'daily_schedule' }
    formData.to = { goalDate: '', bedNum: null, shiftCode: null }
    formData.startDate = ''
    formData.endDate = ''
    sourceScheduleMessage.value = ''
  },
)

watch(formType, (newType) => {
  if (isPrefilled.value || isEditMode.value) return
  const patientInfo = { patientId: formData.patientId, patientName: formData.patientName }
  Object.assign(formData, defaultFormData(), patientInfo)
  if (newType === 'SUSPEND') {
    formData.type = 'SUSPEND'
  } else {
    formData.type = 'MOVE'
  }
})

watch(
  () => formData.from.sourceDate,
  (newDate) => {
    if (newDate) fetchSourceSchedule()
  },
)

// --- Methods ---
function close() {
  emit('close')
}
function handlePatientSelected({ patientId }) {
  const patient = getPatient(patientId)
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

// ✨ 核心修改點 5: 實現新的非同步函式來處理所有邏輯
async function openBedAssignmentDialog() {
  const targetDate = formType.value === 'MOVE_SINGLE' ? formData.to.goalDate : formData.startDate
  if (!targetDate) {
    alert('請先選擇日期才能查詢空床！')
    return
  }

  isLoadingBeds.value = true
  try {
    const record = await schedulesApi.fetchById(targetDate).catch(() => null)
    targetDateScheduleData.value = record?.schedule || {}
    isBedAssignmentVisible.value = true
  } catch (error) {
    console.error('載入目標日期排程失敗:', error)
    alert('載入目標日期排程失敗，無法開啟智慧排床。')
  } finally {
    isLoadingBeds.value = false
  }
}

function handleTargetBedAssigned({ bedNum, shiftCode }) {
  formData.to.bedNum = bedNum
  formData.to.shiftCode = shiftCode
  isBedAssignmentVisible.value = false
}

function submitForm() {
  if (!isFormValid.value) return

  const dataToSubmit = {
    patientId: formData.patientId,
    patientName: formData.patientName,
    reason: formData.reason,
    type: formData.type,
    status: formData.status,
  }

  if (isEditMode.value) {
    dataToSubmit.id = props.initialData.id
  }

  if (formType.value === 'MOVE_SINGLE') {
    dataToSubmit.from = formData.from
    dataToSubmit.to = formData.to
    dataToSubmit.startDate = formData.from.sourceDate
    dataToSubmit.endDate = formData.to.goalDate
  } else if (formType.value === 'MOVE_INTERVAL') {
    dataToSubmit.from = { source: 'base_schedule' }
    dataToSubmit.to = { bedNum: formData.to.bedNum, shiftCode: formData.to.shiftCode }
    dataToSubmit.startDate = formData.startDate
    dataToSubmit.endDate = formData.endDate
  } else if (formType.value === 'SUSPEND') {
    dataToSubmit.startDate = formData.startDate
    dataToSubmit.endDate = formData.endDate
  }

  emit('submit', dataToSubmit)
}
</script>

<style scoped>
/* 所有 CSS 樣式保持不變 */
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
  max-width: 500px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
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
  overflow-y: auto;
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
  gap: 1rem;
  flex-wrap: wrap;
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
  font-size: 0.9rem;
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
.patient-display-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
  line-height: 1.5;
  flex-wrap: wrap;
}
.patient-info-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.freq-tag {
  background-color: #e7f3ff;
  color: #0056b3;
  border: 1px solid #b3d7ff;
}
</style>
