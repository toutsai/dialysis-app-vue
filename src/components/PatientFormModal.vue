<!-- 檔案路徑: src/components/PatientFormModal.vue (最終修正版) -->
<script setup>
import { ref, watch, computed } from 'vue' // 【修改】: 引入 computed

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

// 【新增】: 判斷當前是否為編輯模式
const isEditing = computed(() => !!(form.value && form.value.id))

// 【新增】: 根據 patientType 計算中文標題，增加 'er' 的情況
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

watch(
  () => props.isModalVisible,
  (isVisible) => {
    if (isVisible) {
      // 當彈窗打開時，進行初始化
      // 1. 複製傳入的 patientData
      form.value = { ...props.patientData }

      // 2. 如果是新增模式，手動設定 status
      if (!form.value.id) {
        form.value.status = props.patientType
      }

      // 3. 確保 diseases 屬性永遠是一個陣列，避免 checkbox 出錯
      if (!form.value.diseases) {
        form.value.diseases = []
      }
    }
  },
  { immediate: true },
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
  <div v-if="isModalVisible" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <!-- 【修改】: 使用 computed 屬性來顯示標題 -->
        <h2>{{ isEditing ? '編輯' : '新增' }} {{ patientTypeText }}病人</h2>
        <span class="close-button" @click="closeModal">×</span>
      </div>

      <form @submit.prevent="handleSave">
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
            <!-- 【修改】: 標籤文字能根據狀態變化 -->
            <label>{{ patientType === 'opd' ? '收案醫師' : '開單醫師' }}</label>
            <select v-model="form.physician">
              <option v-for="p in PHYSICIANS" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <div class="form-field">
            <label for="freq">透析頻率</label>
            <select id="freq" v-model="form.freq">
              <option v-for="f in FREQ_OPTIONS" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>

          <div class="form-field">
            <label for="mode">透析模式</label>
            <select id="mode" v-model="form.mode">
              <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>

          <!-- 【新增】: 狀態選擇欄位，僅在新增時可選 -->
          <div class="form-field">
            <label for="status">病人狀態</label>
            <select id="status" v-model="form.status" :disabled="isEditing">
              <option value="er">急診</option>
              <option value="ipd">住院</option>
              <option value="opd">門診</option>
            </select>
          </div>

          <!-- 僅在門診病人時顯示 -->
          <template v-if="patientType === 'opd'">
            <div class="form-field">
              <label for="vasc-access">目前血管通路</label>
              <select id="vasc-access" v-model="form.vascAccess">
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

          <fieldset class="form-group form-field-full">
            <legend>須注意疾病</legend>
            <div class="checkbox-container">
              <div v-for="d in DISEASES" :key="d" class="checkbox-group">
                <input type="checkbox" :id="`disease-${d}`" :value="d" v-model="form.diseases" />
                <label :for="`disease-${d}`">{{ d }}</label>
              </div>
            </div>
          </fieldset>
          <div class="form-field form-field-full">
            <label for="remarks">備註</label>
            <textarea id="remarks" rows="3" v-model="form.remarks"></textarea>
          </div>

          <!-- 【修改】: 狀態標記現在對住院和急診病人都顯示 -->
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
          <button type="submit">儲存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
/* 樣式維持不變 */
.modal {
  display: flex;
  position: fixed;
  z-index: 1000;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  overflow: auto;
  background-color: rgba(0, 0, 0, 0.5);
  align-items: center;
  justify-content: center;
}
.modal-content {
  background-color: #fefefe;
  padding: 20px;
  border: 1px solid #888;
  width: 90%;
  max-width: 700px;
  border-radius: 8px;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  margin-bottom: 20px;
}
.modal-header h2 {
  margin: 0;
}
.close-button {
  color: #aaa;
  font-size: 28px;
  font-weight: bold;
  cursor: pointer;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 15px;
}
.form-field {
  display: flex;
  flex-direction: column;
}
.form-field label {
  margin-bottom: 5px;
  font-weight: bold;
}
.form-field input,
.form-field select,
.form-field textarea {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 100%;
  box-sizing: border-box;
}
.form-field-full {
  grid-column: 1 / -1;
}
.form-group {
  border: 1px solid #e0e0e0;
  padding: 15px;
  border-radius: 5px;
  margin-top: 10px;
}
.form-group legend {
  padding: 0 10px;
  font-weight: bold;
  color: #333;
}
.checkbox-container {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}
.checkbox-group {
  display: flex;
  align-items: center;
  gap: 5px;
}
.checkbox-group input[type='checkbox'] {
  height: 1.2em;
  width: 1.2em;
}
.checkbox-group label {
  font-weight: normal;
  margin-bottom: 0;
}
.modal-footer {
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid #eee;
  text-align: right;
}
.modal-footer button {
  padding: 8px 15px;
  font-size: 1em;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
</style>
