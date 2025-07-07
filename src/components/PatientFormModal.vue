<!-- 檔案路徑: src/components/PatientFormModal.vue -->
<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  isModalVisible: { type: Boolean, required: true },
  patientData: { type: Object, default: () => ({}) },
  patientType: { type: String, required: true },
})
const emit = defineEmits(['close', 'save'])

const form = ref({})
const PHYSICIANS = ['廖丁瑩', '蔡宜潔', '蘇哲弘', '蔡亨政']
const FREQ_OPTIONS = [
  '一三五',
  '二四六',
  '一四',
  '二五',
  '三六',
  '一五',
  '二六',
  '每周一次',
  '臨時',
]
const MODES = ['HD', 'SLED', 'CVVHDF', 'PP', 'DFPP']
const VASC_ACCESSES = ['Double lumen', 'PERM', '左手AVF', '右手AVF', '左手AVG', '右手AVG']
const DISEASES = ['HIV', 'RPR', 'HBV', 'HCV', '隔離']

const isEditing = computed(() => !!(form.value && form.value.id))

const patientTypeText = computed(() => {
  switch (props.patientType) {
    case 'ipd':
      return '住院'
    case 'opd':
      return '門診'
    case 'er':
      return '急診'
    default:
      return ''
  }
})

// 【新增】: 監聽彈窗可見性，以鎖定/解鎖背景滾動
watch(
  () => props.isModalVisible,
  (isVisible) => {
    if (typeof document !== 'undefined') {
      if (isVisible) {
        document.body.classList.add('modal-open')
        // 當彈窗打開時，進行初始化
        form.value = { ...props.patientData }
        if (!form.value.id) {
          form.value.status = props.patientType
        }
        if (!form.value.diseases) {
          form.value.diseases = []
        }
      } else {
        document.body.classList.remove('modal-open')
      }
    }
  },
)

function closeModal() {
  emit('close')
}

function handleSave() {
  if (!form.value.name || !form.value.medicalRecordNumber) {
    alert('姓名和病歷號為必填項！')
    return
  }
  emit('save', form.value)
}
</script>

<template>
  <!-- 【修改】: 使用 Transition 元件包裹，並用 overlay 實現背景和居中 -->
  <Transition name="modal-fade">
    <div v-if="isModalVisible" class="modal-overlay" @click.self="closeModal">
      <div class="modal-content">
        <div class="modal-header">
          <h2>{{ isEditing ? '編輯' : '新增' }} {{ patientTypeText }}病人</h2>
          <button class="close-button" @click="closeModal" aria-label="關閉彈窗">×</button>
        </div>

        <form class="modal-body" @submit.prevent="handleSave">
          <div class="form-grid">
            <div class="form-field">
              <label for="name">姓名</label>
              <input type="text" id="name" v-model="form.name" required />
            </div>
            <div class="form-field">
              <label for="medical-record-number">病歷號</label>
              <input
                type="text"
                id="medical-record-number"
                v-model="form.medicalRecordNumber"
                required
              />
            </div>
            <div class="form-field">
              <label>{{ patientType === 'opd' ? '收案醫師' : '開單醫師' }}</label>
              <select v-model="form.physician">
                <option disabled value="">請選擇</option>
                <option v-for="p in PHYSICIANS" :key="p" :value="p">{{ p }}</option>
              </select>
            </div>

            <div class="form-field">
              <label for="freq">透析頻率</label>
              <select id="freq" v-model="form.freq">
                <option disabled value="">請選擇</option>
                <option v-for="f in FREQ_OPTIONS" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>

            <div class="form-field">
              <label for="mode">透析模式</label>
              <select id="mode" v-model="form.mode">
                <option disabled value="">請選擇</option>
                <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>

            <div class="form-field">
              <label for="status">病人狀態</label>
              <select id="status" v-model="form.status" :disabled="isEditing">
                <option value="er">急診</option>
                <option value="ipd">住院</option>
                <option value="opd">門診</option>
              </select>
            </div>

            <template v-if="patientType === 'opd'">
              <div class="form-field">
                <label for="vasc-access">目前血管通路</label>
                <select id="vasc-access" v-model="form.vascAccess">
                  <option disabled value="">請選擇</option>
                  <option v-for="va in VASC_ACCESSES" :key="va" :value="va">{{ va }}</option>
                </select>
              </div>
              <div class="form-field">
                <label for="first-dialysis-date">首次透析日期</label>
                <input type="date" id="first-dialysis-date" v-model="form.firstDialysisDate" />
              </div>
              <div class="form-field">
                <label for="access-creation-date">通路建立日期</label>
                <input type="date" id="access-creation-date" v-model="form.accessCreationDate" />
              </div>
            </template>

            <div class="form-field form-field-full">
              <label for="remarks">備註</label>
              <textarea id="remarks" rows="3" v-model="form.remarks"></textarea>
            </div>

            <fieldset class="form-group form-field-full">
              <legend>須注意疾病</legend>
              <div class="checkbox-container">
                <div v-for="d in DISEASES" :key="d" class="checkbox-group">
                  <input type="checkbox" :id="`disease-${d}`" :value="d" v-model="form.diseases" />
                  <label :for="`disease-${d}`">{{ d }}</label>
                </div>
              </div>
            </fieldset>

            <fieldset
              v-if="patientType === 'ipd' || patientType === 'er'"
              class="form-group form-field-full"
            >
              <legend>狀態標記</legend>
              <div class="checkbox-container">
                <div class="checkbox-group">
                  <input type="checkbox" id="is-first-dialysis" v-model="form.isFirstDialysis" />
                  <label for="is-first-dialysis">首透</label>
                </div>
                <div class="checkbox-group">
                  <input type="checkbox" id="is-discontinued" v-model="form.isDiscontinued" />
                  <label for="is-discontinued">中止透析</label>
                </div>
              </div>
            </fieldset>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-secondary" @click="closeModal">取消</button>
            <button type="submit" class="btn-primary">儲存</button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* 全域樣式，用於鎖定背景滾動 */
:global(body.modal-open) {
  overflow: hidden;
}

/* 遮罩層樣式 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* 彈窗內容樣式 */
.modal-content {
  background-color: #ffffff;
  padding: 24px;
  border: 1px solid #dee2e6;
  width: 90%;
  max-width: 800px; /* 增加寬度以容納三列表單 */
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  max-height: 90vh; /* 限制最大高度 */
}

/* 彈窗頭部 */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 16px;
  margin-bottom: 24px;
  flex-shrink: 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}
.close-button {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  color: #adb5bd;
  cursor: pointer;
  padding: 0;
  transition: color 0.2s;
}
.close-button:hover {
  color: #495057;
}

/* 彈窗主體 (包含表單) */
.modal-body {
  overflow-y: auto; /* 當內容過多時，內部滾動 */
  padding-right: 10px; /* 預留滾動條空間 */
  margin-right: -10px;
}

/* 表單網格佈局 */
.form-grid {
  display: grid;
  /* 自動適應，每列最小 220px */
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 20px;
}

.form-field {
  display: flex;
  flex-direction: column;
}

/* 表單欄位全寬 */
.form-field-full {
  grid-column: 1 / -1;
}

.form-field label {
  margin-bottom: 8px;
  font-weight: 500;
  color: #495057;
  font-size: 0.95rem;
}

/* 輸入框、下拉選單、文本域的統一風格 */
.form-field input[type='text'],
.form-field input[type='date'],
.form-field select,
.form-field textarea {
  padding: 10px 12px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  width: 100%;
  box-sizing: border-box;
  font-size: 1rem;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.form-field input:focus,
.form-field select:focus,
.form-field textarea:focus {
  outline: none;
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.2);
}

/* Fieldset 樣式 */
.form-group {
  border: 1px solid #e9ecef;
  padding: 16px;
  border-radius: 8px;
  margin-top: 10px;
}
.form-group legend {
  padding: 0 8px;
  font-weight: 500;
  color: #495057;
}
.checkbox-container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
}
.checkbox-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.checkbox-group input[type='checkbox'] {
  height: 1.1em;
  width: 1.1em;
  cursor: pointer;
}
.checkbox-group label {
  font-weight: normal;
  margin-bottom: 0;
  cursor: pointer;
}

/* 彈窗底部 */
.modal-footer {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  flex-shrink: 0;
}
.modal-footer button {
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 500;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.btn-primary {
  background-color: var(--primary-color, #007bff);
  color: white;
}
.btn-primary:hover {
  background-color: #0056b3;
}
.btn-secondary {
  background-color: #f8f9fa;
  color: #343a40;
  border: 1px solid #ced4da;
}
.btn-secondary:hover {
  background-color: #e9ecef;
}

/* 過渡動畫 */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active .modal-content,
.modal-fade-leave-active .modal-content {
  transition: transform 0.3s ease;
}
.modal-fade-enter-from .modal-content,
.modal-fade-leave-to .modal-content {
  transform: translateY(-20px);
}
</style>
