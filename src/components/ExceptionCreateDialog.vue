<!-- 檔案路徑: src/components/ExceptionCreateDialog.vue (區間調班邏輯修正版) -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>{{ dialogTitle }}</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <!-- 步驟 1: 選擇病人 -->
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

        <div class="subsequent-steps" :class="{ disabled: !formData.patientId }">
          <!-- 步驟 2: 選擇調班類型 -->
          <div class="form-group">
            <label>步驟 2: 選擇調班類型</label>
            <div class="radio-group">
              <label
                ><input
                  type="radio"
                  v-model="formData.type"
                  value="MOVE"
                  :disabled="isEditingMode"
                />
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
              <label
                ><input
                  type="radio"
                  v-model="formData.type"
                  value="ADD_SESSION"
                  :disabled="isEditingMode"
                />
                臨時加洗</label
              >
              <!-- ✨ 新增的選項 ✨ -->
              <label
                ><input
                  type="radio"
                  v-model="formData.type"
                  value="SWAP"
                  :disabled="isEditingMode"
                />
                同日互調</label
              >
            </div>
          </div>

          <!-- 區塊：臨時調班 (MOVE) -->
          <div v-if="formData.type === 'MOVE'" class="details-section">
            <h3 class="section-title">步驟 3: 設定調班前後資訊</h3>
            <div class="form-group-grid">
              <div class="form-group">
                <label for="sourceDate">原始日期</label>
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
                <div class="info-box">{{ sourceBedDisplay }}</div>
              </div>
            </div>
            <div class="form-group-grid" v-if="formData.from.bedNum">
              <div class="form-group">
                <label for="targetDate">目標日期</label>
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

          <!-- 區塊：區間暫停 (SUSPEND) -->
          <div v-if="formData.type === 'SUSPEND'" class="details-section">
            <h3 class="section-title">步驟 3: 設定暫停區間</h3>
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

          <!-- 區塊：臨時加洗 (ADD_SESSION) -->
          <div v-if="formData.type === 'ADD_SESSION'" class="details-section">
            <h3 class="section-title">步驟 3: 設定加洗日期與床位</h3>
            <div class="form-group-grid">
              <div class="form-group">
                <label for="addSessionDate">加洗日期</label>
                <input type="date" id="addSessionDate" v-model="formData.to.goalDate" />
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

          <!-- ✨ 區塊：同日互調 (SWAP) ✨ -->
          <div v-if="formData.type === 'SWAP'" class="details-section">
            <h3 class="section-title">步驟 3: 設定互調資訊</h3>
            <div class="form-group">
              <label for="swapDate">互調日期</label>
              <input
                type="date"
                id="swapDate"
                v-model="formData.date"
                @change="fetchScheduleForSwap"
                :disabled="isEditingMode"
              />
            </div>
            <div class="form-group-grid" v-if="formData.date && dailyScheduleForSwap">
              <div class="form-group">
                <label>選擇病人 A</label>
                <select v-model="formData.patient1_selection" class="swap-select">
                  <option disabled value="">請選擇...</option>
                  <option v-for="slot in availableSlotsForSwap" :key="slot.key" :value="slot.key">
                    {{ slot.displayText }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>選擇病人 B</label>
                <select v-model="formData.patient2_selection" class="swap-select">
                  <option disabled value="">請選擇...</option>
                  <option v-for="slot in availableSlotsForSwap" :key="slot.key" :value="slot.key">
                    {{ slot.displayText }}
                  </option>
                </select>
              </div>
            </div>
            <small
              v-if="!dailyScheduleForSwap && isFetchingSwapSchedule"
              class="form-text text-muted"
              >正在讀取排班資料...</small
            >
            <small
              v-if="!dailyScheduleForSwap && !isFetchingSwapSchedule && formData.date"
              class="form-text text-danger"
              >該日無排班資料或讀取失敗。</small
            >
          </div>

          <!-- 步驟 4: 原因說明 -->
          <div class="form-group">
            <label>步驟 4: 原因說明</label>
            <textarea
              v-model="formData.reason"
              rows="2"
              placeholder="請簡要說明原因"
              :disabled="isEditingMode"
            ></textarea>
          </div>
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
    v-if="isBedAssignmentVisible"
    :is-visible="isBedAssignmentVisible"
    :all-patients="[allPatients.find((p) => p.id === formData.patientId)]"
    :bed-layout="bedLayout"
    :schedule-data="bedAssignmentProps.scheduleData"
    :target-date="bedAssignmentProps.targetDate"
    :shifts="shifts"
    :freq-map="freqMap"
    :assignment-mode="bedAssignmentProps.assignmentMode"
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
  initialData: { type: Object, default: null },
})
const emit = defineEmits(['close', 'submit'])

// --- API and Constants ---
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')
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
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
  每日: [0, 1, 2, 3, 4, 5],
  每周一: [0],
  每周二: [1],
  每周三: [2],
  每周四: [3],
  每周五: [4],
  每周六: [5],
}

// --- Dialog State ---
const isPatientDialogVisible = ref(false)
const isBedAssignmentVisible = ref(false)
const bedAssignmentProps = ref(null)
const isSubmitting = ref(false)
const isFetchingSource = ref(false)
const sourceScheduleMessage = ref('')
const masterSchedule = ref(null)
const dailyScheduleForSwap = ref(null) // ✨ 新增: 儲存某日排班供互調選擇
const isFetchingSwapSchedule = ref(false) // ✨ 新增: 讀取狀態

// --- Form State ---
const defaultFormData = () => ({
  id: null,
  patientId: '', // SWAP模式下這個可能用不到，但保留結構
  patientName: '',
  type: null,
  date: '', // ✨ 新增: for SWAP
  startDate: '',
  endDate: '',
  reason: '',
  from: { sourceDate: '', bedNum: null, shiftCode: null },
  to: { goalDate: '', bedNum: null, shiftCode: null },
  patient1: null, // ✨ 新增
  patient2: null, // ✨ 新增
  patient1_selection: '', // ✨ 新增: for v-model
  patient2_selection: '', // ✨ 新增: for v-model
})
const formData = reactive(defaultFormData())

// --- Computed Properties ---
const dialogTitle = computed(() => {
  if (isEditingMode.value) return '解決排程衝突'
  const typeMap = {
    MOVE: '臨時調班',
    SUSPEND: '區間暫停',
    ADD_SESSION: '臨時加洗',
    RANGE_MOVE: '區間調班',
  }
  const title = typeMap[formData.type] ? ` - ${typeMap[formData.type]}` : ''
  return `新增調班申請${title}`
})
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
      .map((d) => `<span class="patient-info-tag disease-tag">${d}</span>`)
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

// ✨ 新增: 計算可用於互調的床位列表
const availableSlotsForSwap = computed(() => {
  if (!dailyScheduleForSwap.value) return []
  const shiftDisplayMap = { early: '早', noon: '午', late: '晚' }

  return Object.entries(dailyScheduleForSwap.value)
    .filter(([key, slot]) => slot && slot.patientId) // 只顯示有病人的床位
    .map(([key, slot]) => {
      const parts = key.split('-')
      const shiftCode = parts.pop()
      const bedNum = key.replace(`-${shiftCode}`, '').replace('bed-', '')
      const shiftText = shiftDisplayMap[shiftCode] || shiftCode
      const bedText = String(bedNum).startsWith('peripheral')
        ? `外圍 ${bedNum.split('-')[1]}`
        : `${bedNum}床`

      return {
        key: key, // e.g., "bed-12-early"
        displayText: `${slot.patientName} (${bedText} / ${shiftText}班)`,
        data: {
          patientId: slot.patientId,
          patientName: slot.patientName,
          fromBedNum: bedNum,
          fromShiftCode: shiftCode,
        },
      }
    })
})

const isDetailsComplete = computed(() => {
  if (!formData.patientId || !formData.type) return false
  switch (formData.type) {
    case 'MOVE':
      return !!formData.from.bedNum && !!formData.to.bedNum && !!formData.to.goalDate
    case 'SUSPEND':
      return !!formData.startDate && !!formData.endDate && formData.endDate >= formData.startDate
    case 'ADD_SESSION':
      return !!formData.to.goalDate && !!formData.to.bedNum && !!formData.to.shiftCode
    case 'RANGE_MOVE':
      return (
        !!formData.startDate &&
        !!formData.endDate &&
        !!formData.to.bedNum &&
        !!formData.to.shiftCode &&
        formData.endDate >= formData.startDate
      )
    // ✨ 新增 SWAP 的驗證邏輯
    case 'SWAP':
      return (
        !!formData.date &&
        !!formData.patient1_selection &&
        !!formData.patient2_selection &&
        formData.patient1_selection !== formData.patient2_selection
      )
    default:
      return false
  }
})
const isFormValid = computed(() => isDetailsComplete.value && !!formData.reason.trim())

// --- Watchers ---
watch(
  () => props.isVisible,
  (isVisible) => {
    if (isVisible) {
      if (props.initialData) {
        Object.assign(formData, {
          ...props.initialData,
          to: { ...props.initialData.to, bedNum: null, shiftCode: null },
        })
        sourceScheduleMessage.value = ''
      } else {
        Object.assign(formData, defaultFormData())
        sourceScheduleMessage.value = ''
      }
    } else {
      isBedAssignmentVisible.value = false
      bedAssignmentProps.value = null
    }
  },
)
watch(
  () => formData.type,
  (newType, oldType) => {
    if (oldType !== null) {
      const keptData = {
        id: null,
        patientId: formData.patientId,
        patientName: formData.patientName,
        type: newType,
      }
      Object.assign(formData, { ...defaultFormData(), ...keptData })
      sourceScheduleMessage.value = ''
    }
  },
)
// ✨ 新增 Watcher 來解析選擇的病人
watch(
  () => formData.patient1_selection,
  (selectionKey) => {
    const selectedSlot = availableSlotsForSwap.value.find((s) => s.key === selectionKey)
    formData.patient1 = selectedSlot ? selectedSlot.data : null
  },
)
watch(
  () => formData.patient2_selection,
  (selectionKey) => {
    const selectedSlot = availableSlotsForSwap.value.find((s) => s.key === selectionKey)
    formData.patient2 = selectedSlot ? selectedSlot.data : null
  },
)

// --- Methods ---
// ✨ 新增: 取得某日排班資料以供選擇
async function fetchScheduleForSwap() {
  if (!formData.date) {
    dailyScheduleForSwap.value = null
    return
  }
  isFetchingSwapSchedule.value = true
  dailyScheduleForSwap.value = null
  try {
    const record = await schedulesApi.fetchById(formData.date)
    dailyScheduleForSwap.value = record && record.schedule ? record.schedule : null
  } catch (error) {
    console.error('取得排班資料失敗:', error)
    dailyScheduleForSwap.value = null
  } finally {
    isFetchingSwapSchedule.value = false
  }
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

async function fetchMasterSchedule() {
  if (masterSchedule.value) return masterSchedule.value
  try {
    const record = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
    const scheduleRules = record ? record.schedule : {}

    const formattedSchedule = {}
    for (const patientId in scheduleRules) {
      const rule = scheduleRules[patientId]
      const dayIndices = freqMap[rule.freq] || []
      dayIndices.forEach((dayIndex) => {
        const weeklySlotId = `${rule.bedNum}-${rule.shiftIndex}-${dayIndex}`
        formattedSchedule[weeklySlotId] = { ...rule, patientId }
      })
    }
    masterSchedule.value = formattedSchedule
    return masterSchedule.value
  } catch (error) {
    console.error('獲取總表規則失敗:', error)
    alert('無法獲取總表規則資料，區間調班功能暫時無法使用。')
    return {}
  }
}

async function openBedAssignmentForTarget() {
  const patient = props.allPatients.find((p) => p.id === formData.patientId)
  if (!patient) return

  try {
    let propsForDialog = {}

    if (formData.type === 'RANGE_MOVE') {
      // --- 區間調班邏輯 ---
      if (!formData.startDate) return
      if (!patient.freq) {
        alert('此病人沒有設定固定頻率，無法使用區間調班功能。')
        return
      }
      const masterScheduleData = await fetchMasterSchedule()
      propsForDialog = {
        scheduleData: masterScheduleData,
        targetDate: null,
        assignmentMode: 'frequency',
      }
    } else {
      // --- 臨時調班 / 臨時加洗邏輯 ---
      const dateForSchedule = formData.to.goalDate
      if (!dateForSchedule) return
      const scheduleRecord = await schedulesApi.fetchById(dateForSchedule)
      const dailyScheduleData = scheduleRecord ? scheduleRecord.schedule : {}
      propsForDialog = {
        scheduleData: dailyScheduleData,
        targetDate: dateForSchedule,
        assignmentMode: 'singleDay',
      }
    }

    bedAssignmentProps.value = propsForDialog
    isBedAssignmentVisible.value = true
  } catch (error) {
    console.error('開啟智慧排床失敗:', error)
    alert('開啟智慧排床失敗，請稍後再試。')
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
  switch (dataToSubmit.type) {
    case 'MOVE':
      dataToSubmit.startDate = dataToSubmit.from.sourceDate
      dataToSubmit.endDate = dataToSubmit.to.goalDate
      break
    case 'ADD_SESSION':
      dataToSubmit.startDate = dataToSubmit.to.goalDate
      dataToSubmit.endDate = dataToSubmit.to.goalDate
      dataToSubmit.from = null
      break
    case 'RANGE_MOVE':
      dataToSubmit.from = null
      dataToSubmit.to.goalDate = ''
      break
    case 'SWAP':
      // 清理掉不需要的欄位，只提交後端需要的格式
      dataToSubmit.from = null
      dataToSubmit.to = null
      dataToSubmit.startDate = dataToSubmit.date
      dataToSubmit.endDate = dataToSubmit.date
      delete dataToSubmit.patient1_selection
      delete dataToSubmit.patient2_selection
      break
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
  max-width: 550px;
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
  flex-wrap: wrap;
  gap: 1rem;
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
.subsequent-steps.disabled {
  opacity: 0.5;
  pointer-events: none;
}
.details-section .section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #0056b3;
  margin-top: 0;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #dee2e6;
}
.form-text {
  font-size: 0.875em;
  color: #6c757d;
}
.swap-select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  background-color: #fff;
}
@media (max-width: 768px) {
  .dialog-overlay {
    align-items: flex-start;
  }
  .dialog-content {
    padding: 0;
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
  .form-group-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .info-box {
    height: auto;
    min-height: 48px;
  }
  .dialog-footer {
    flex-direction: column-reverse;
    gap: 0.75rem;
  }
  .dialog-footer .btn {
    width: 100%;
  }
}
</style>
