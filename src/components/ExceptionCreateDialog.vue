<!-- 檔案路徑: src/components/ExceptionCreateDialog.vue -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>新增排程例外申請</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <div class="form-group">
          <label for="patient">選取病人</label>
          <select id="patient" v-model="formData.patientId" @change="onPatientSelect">
            <option disabled value="">請選擇病人...</option>
            <option v-for="p in allPatients" :key="p.id" :value="p.id">
              {{ p.name }} - {{ p.medicalRecordNumber }}
            </option>
          </select>
          <div v-if="selectedPatientInfo" class="patient-info">常規: {{ selectedPatientInfo }}</div>
        </div>

        <div class="form-group">
          <label>例外類型</label>
          <div class="radio-group">
            <label>
              <input type="radio" v-model="formData.type" value="MOVE" />
              臨時調班
            </label>
            <label>
              <input type="radio" v-model="formData.type" value="SUSPEND" />
              區間暫停
            </label>
          </div>
        </div>

        <!-- 區間暫停的表單 -->
        <div v-if="formData.type === 'SUSPEND'" class="form-group-grid">
          <div class="form-group">
            <label for="startDate">開始日期</label>
            <input type="date" id="startDate" v-model="formData.startDate" />
          </div>
          <div class="form-group">
            <label for="endDate">結束日期</label>
            <input type="date" id="endDate" v-model="formData.endDate" />
          </div>
        </div>

        <!-- 臨時調班的表單 -->
        <div v-if="formData.type === 'MOVE'" class="form-group-grid">
          <div class="form-group">
            <label for="targetDate">目標日期</label>
            <input type="date" id="targetDate" v-model="formData.startDate" />
          </div>
          <div class="form-group">
            <label for="targetShift">目標班別</label>
            <select id="targetShift" v-model="formData.to.shiftCode">
              <option value="early">早班</option>
              <option value="noon">午班</option>
              <option value="late">晚班</option>
            </select>
          </div>
          <div class="form-group">
            <label for="targetBed">目標床號</label>
            <input type="text" id="targetBed" v-model="formData.to.bedNum" placeholder="例如: 15" />
          </div>
        </div>

        <div class="form-group">
          <label for="reason">原因說明</label>
          <textarea
            id="reason"
            v-model="formData.reason"
            rows="3"
            placeholder="請簡要說明原因，例如：出國、回診等"
          ></textarea>
        </div>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button class="btn btn-primary" @click="submitForm" :disabled="!isFormValid">
          提交申請
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  allPatients: Array,
})
const emit = defineEmits(['close', 'submit'])

const defaultFormData = () => ({
  patientId: '',
  patientName: '',
  type: 'MOVE',
  startDate: '',
  endDate: '',
  reason: '',
  to: {
    bedNum: '',
    shiftCode: 'early',
  },
})

const formData = reactive(defaultFormData())
const selectedPatientInfo = ref('')

const isFormValid = computed(() => {
  if (!formData.patientId || !formData.reason) return false
  if (formData.type === 'MOVE') {
    return formData.startDate && formData.to.bedNum && formData.to.shiftCode
  }
  if (formData.type === 'SUSPEND') {
    return formData.startDate && formData.endDate && formData.endDate >= formData.startDate
  }
  return false
})

function onPatientSelect() {
  const patient = props.allPatients.find((p) => p.id === formData.patientId)
  if (patient) {
    formData.patientName = patient.name
    selectedPatientInfo.value = `頻率 ${patient.freq || '未設定'}`
  }
}

watch(
  () => formData.type,
  () => {
    // 重置日期，避免混淆
    formData.startDate = ''
    formData.endDate = ''
  },
)

function close() {
  Object.assign(formData, defaultFormData()) // 重置表單
  selectedPatientInfo.value = ''
  emit('close')
}

function submitForm() {
  if (!isFormValid.value) return

  // 對於 MOVE 類型，endDate 與 startDate 相同
  if (formData.type === 'MOVE') {
    formData.endDate = formData.startDate
  }

  emit('submit', { ...formData })
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
</style>
