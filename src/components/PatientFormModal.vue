// 檔案路徑: src/components/PatientFormModal.vue (最終修正版 SCRIPT)
<script setup>
import { ref, watch } from 'vue'

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

// watch 監聽器只負責一件事：把傳入的資料複製給 form
watch(
  () => props.patientData,
  (newData) => {
    form.value = { ...newData }
  },
  { immediate: true, deep: true },
)

function closeModal() {
  emit('close')
}

function handleSave() {
  if (!form.value.name || !form.value.medicalRecordNumber) {
    alert('姓名和病歷號為必填項！')
    return
  }
  // 直接把 form.value 整個丟出去，不做任何處理
  emit('save', form.value)
}
</script>

<template>
  <!-- v-if 控制元件的顯示與否 -->
  <div v-if="isModalVisible" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <!-- 標題根據 patientData 是否有 id 來判斷是新增還是編輯 -->
        <h2>{{ form.id ? '編輯' : '新增' }} {{ patientType === 'ipd' ? '住院' : '門診' }}病人</h2>
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
            <label>{{ patientType === 'ipd' ? '會診醫師' : '收案醫師' }}</label>
            <select v-model="form.physician">
              <option v-for="p in PHYSICIANS" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>

          <!-- ========== 【修改三】修改模板中的綁定 ========== -->
          <div class="form-field">
            <label for="freq">透析頻率</label>
            <select id="freq" v-model="form.freq">
              <option v-for="f in FREQ_OPTIONS" :key="f" :value="f">{{ f }}</option>
            </select>
          </div>
          <!-- ============================================= -->

          <div class="form-field">
            <label for="mode">透析模式</label>
            <select id="mode" v-model="form.mode">
              <option v-for="m in MODES" :key="m" :value="m">{{ m }}</option>
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

          <!-- 僅在住院病人時顯示 -->

          <fieldset class="form-group form-field-full">
            <legend>須注意疾病</legend>
            <div class="checkbox-container">
              <div v-for="d in DISEASES" :key="d" class="checkbox-group">
                <!-- v-model 對 checkbox 陣列的特殊用法 -->
                <input type="checkbox" :id="`disease-${d}`" :value="d" v-model="form.diseases" />
                <label :for="`disease-${d}`">{{ d }}</label>
              </div>
            </div>
          </fieldset>
          <div class="form-field form-field-full">
            <label for="remarks">備註</label>
            <textarea id="remarks" rows="3" v-model="form.remarks"></textarea>
          </div>
          <fieldset v-if="patientType === 'ipd'" class="form-group form-field-full">
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
/* 您的樣式維持不變 */
.modal {
  display: flex; /* 改為 flex 來居中 */
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
