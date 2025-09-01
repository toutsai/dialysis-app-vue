<!-- 檔案路徑: src/components/TaskCreateDialog.vue (✨ 支援編輯模式的最終版 ✨) -->
<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="close">
    <div class="modal-container">
      <header class="modal-header">
        <h2>{{ isEditMode ? '修改交辦 / 留言' : '新增交辦 / 留言' }}</h2>
        <button class="close-btn" @click="close">&times;</button>
      </header>
      <main class="modal-body">
        <!-- 類型選擇 -->
        <div class="form-group">
          <label class="form-label">類型</label>
          <div class="radio-group">
            <label class="radio-label"
              ><input
                type="radio"
                v-model="formData.category"
                value="message"
                :disabled="isEditMode"
              /><span>病人留言</span></label
            >
            <label class="radio-label"
              ><input
                type="radio"
                v-model="formData.category"
                value="task"
                :disabled="isEditMode"
              /><span>交辦事項</span></label
            >
          </div>
        </div>

        <!-- 備忘類型 -->
        <div v-if="formData.category === 'message'" class="form-group">
          <label for="messageType" class="form-label">備忘類型</label>
          <div class="assignee-btn-group">
            <button
              v-for="msgType in messageTypeOptions"
              :key="msgType.value"
              @click="formData.messageType = msgType.value"
              :class="{ active: formData.messageType === msgType.value }"
              class="btn-assignee"
            >
              <span class="message-type-icon">{{ msgType.icon }}</span>
              {{ msgType.label }}
            </button>
          </div>
        </div>

        <!-- 交辦給 (僅在交辦事項時顯示) -->
        <div v-if="formData.category === 'task'" class="form-group">
          <label for="assignee" class="form-label">交辦給</label>
          <div class="assignee-btn-group">
            <button
              v-for="assignee in assigneeOptions"
              :key="assignee.value"
              @click="formData.assigneeValue = assignee.value"
              :class="{ active: formData.assigneeValue === assignee.value }"
              class="btn-assignee"
            >
              {{ assignee.label }}
            </button>
          </div>
        </div>

        <!-- 關聯病人 -->
        <div class="form-group">
          <label for="patient" class="form-label">關聯病人 (可選)</label>
          <div v-if="selectedPatient" class="selected-patient-display">
            <span>{{ selectedPatient.name }} ({{ selectedPatient.medicalRecordNumber }})</span>
            <button
              class="clear-patient-btn"
              @click="clearPatient"
              title="清除選擇"
              :disabled="isEditMode"
            >
              ×
            </button>
          </div>
          <button
            v-else
            @click="isPatientDialogVisible = true"
            class="btn btn-outline"
            :disabled="isEditMode"
          >
            選擇病人
          </button>
        </div>

        <!-- 目標日期 (僅在病人留言時顯示) -->
        <div v-if="formData.category === 'message'" class="form-group">
          <label for="targetDate" class="form-label">目標日期</label>
          <input type="date" id="targetDate" v-model="formData.targetDate" class="form-control" />
        </div>

        <!-- 內容輸入區 -->
        <div class="form-group">
          <label for="content" class="form-label">內容</label>

          <!-- ✨ [修改] 書記耗材介面在編輯模式下禁用 -->
          <div
            v-if="isClerkSupplyTask"
            class="supply-container"
            :class="{ 'disabled-view': isEditMode }"
          >
            <div
              v-for="(item, index) in dynamicSupplyItems"
              :key="item.id"
              class="dynamic-supply-item"
            >
              <select
                v-model="item.type"
                @change="onItemTypeChange(item)"
                class="supply-type-select"
                :disabled="isEditMode"
              >
                <option disabled value="">選擇類型</option>
                <option v-for="opt in supplyTypeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>

              <select
                v-if="item.type === 'AK'"
                v-model="item.spec"
                class="supply-spec-select"
                :disabled="isEditMode"
              >
                <option disabled value="">選擇AK規格</option>
                <option v-for="ak in akOptions" :key="ak" :value="ak">{{ ak }}</option>
              </select>
              <select
                v-else-if="item.type === 'A液'"
                v-model="item.spec"
                class="supply-spec-select"
                :disabled="isEditMode"
              >
                <option disabled value="">選擇A液規格</option>
                <option v-for="a in aLiquidOptions" :key="a" :value="a">{{ a }}</option>
              </select>
              <select
                v-else-if="item.type === 'B液'"
                v-model="item.spec"
                class="supply-spec-select"
                :disabled="isEditMode"
              >
                <option disabled value="">選擇B液規格</option>
                <option v-for="b in bLiquidOptions" :key="b" :value="b">{{ b }}</option>
              </select>
              <select
                v-else-if="item.type === '耗衛材'"
                v-model="item.spec"
                class="supply-spec-select"
                :disabled="isEditMode"
              >
                <option disabled value="">選擇衛材品項</option>
                <option v-for="supply in medicalSuppliesOptions" :key="supply" :value="supply">
                  {{ supply }}
                </option>
              </select>

              <div v-else class="spec-placeholder"></div>

              <div class="quantity-stepper">
                <button
                  @click="item.quantity > 0 && item.quantity--"
                  class="quantity-btn"
                  :disabled="isEditMode"
                >
                  -
                </button>
                <span class="quantity-display">{{ item.quantity }}</span>
                <button @click="item.quantity++" class="quantity-btn" :disabled="isEditMode">
                  +
                </button>
              </div>

              <button
                @click="removeSupplyItem(index)"
                class="remove-item-btn"
                title="移除此項"
                :disabled="isEditMode"
              >
                ×
              </button>
            </div>

            <button @click="addSupplyItem" class="btn btn-add-supply" :disabled="isEditMode">
              <i class="fas fa-plus"></i> 新增耗材項目
            </button>

            <textarea
              v-model="otherSupplyInfo"
              placeholder="其他備註..."
              rows="2"
              class="other-supply-input"
              :disabled="isEditMode"
            ></textarea>
          </div>

          <textarea
            v-else
            id="content"
            v-model="formData.content"
            rows="4"
            placeholder="請輸入詳細內容..."
            class="form-control"
          ></textarea>
        </div>
      </main>
      <footer class="modal-footer">
        <button class="btn btn-secondary" @click="close">取消</button>
        <button
          class="btn btn-primary"
          @click="handleSubmit"
          :disabled="!isFormValid || isSubmitting"
        >
          {{ isSubmitting ? '處理中...' : isEditMode ? '更新' : '送出' }}
        </button>
      </footer>
    </div>

    <PatientSelectDialog
      :is-visible="isPatientDialogVisible"
      title="選擇關聯病人"
      :patients="allPatients"
      :show-fill-options="false"
      @confirm="handlePatientSelected"
      @cancel="isPatientDialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { serverTimestamp } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier'

// ✨ [新增] initialData Prop
const props = defineProps({
  isVisible: Boolean,
  preselectedPatient: Object,
  allPatients: Array,
  initialData: {
    type: Object,
    default: null,
  },
})
const emit = defineEmits(['close', 'submit'])

const { currentUser } = useAuth()
const tasksApi = ApiManager('tasks')
const { createGlobalNotification } = useGlobalNotifier()

const isSubmitting = ref(false)
const isPatientDialogVisible = ref(false)
const selectedPatient = ref(null)

// ✨ [新增] 判斷是否為編輯模式
const isEditMode = computed(() => !!props.initialData)

const formData = reactive({
  id: null, // ✨ [新增] 用於存放正在編輯的項目ID
  isLegacy: false, // ✨ [新增] 判斷是否為舊的 memo
  category: 'message',
  assigneeValue: '',
  targetDate: new Date().toISOString().slice(0, 10),
  content: '',
  messageType: '常規',
})

// ... messageTypeOptions 和 assigneeOptions 保持不變 ...
const messageTypeOptions = [
  { value: '常規', label: '一般交班', icon: '📝' },
  { value: '抽血', label: '抽血提醒', icon: '🩸' },
  { value: '衛教', label: '衛教事項', icon: '📢' },
]
const assigneeOptions = [
  { value: 'clerk', label: '書記' },
  { value: 'doctor', label: '醫師' },
  { value: 'np', label: '專科護理師' },
  { value: 'editor', label: '護理師組長' },
]
const akOptions = [
  '13M',
  '15S',
  '17UX',
  '17HX',
  'FX80',
  'BG-1.8U',
  'Pro-19H',
  '21S',
  'Hi23',
  '25S',
  'CTA2000',
]
const aLiquidOptions = ['2.5', '3.0', '3.5']
const bLiquidOptions = ['5L B液', '罐裝B粉', '袋裝B粉']
const medicalSuppliesOptions = [
  '傷口照護包',
  '住院包',
  'EKG貼片',
  'OP site(每周)',
  'OP site(每三天)',
  '鼻導管',
]
const supplyTypeOptions = ref([
  { value: 'AK', label: 'AK' },
  { value: 'A液', label: 'A液' },
  { value: 'B液', label: 'B液' },
  { value: 'Tubing', label: 'Tubing' },
  { value: 'NS500', label: 'NS (500cc)' },
  { value: 'NS1000', label: 'NS (1000cc)' },
  { value: '耗衛材', label: '耗衛材' },
])

const dynamicSupplyItems = ref([])
const otherSupplyInfo = ref('')
const isClerkSupplyTask = computed(
  () => formData.category === 'task' && formData.assigneeValue === 'clerk' && !isEditMode.value,
)

const isFormValid = computed(() => {
  // ✨ [修改] 編輯模式下只檢查內容
  if (isEditMode.value) {
    return formData.content.trim() !== ''
  }

  if (isClerkSupplyTask.value) {
    const allItemsValid = dynamicSupplyItems.value.every((item) => {
      if (['AK', 'A液', 'B液', '耗衛材'].includes(item.type)) {
        return item.type && item.spec && item.quantity > 0
      }
      return item.type && item.quantity > 0
    })
    if (dynamicSupplyItems.value.length === 0) {
      return otherSupplyInfo.value.trim() !== ''
    }
    return allItemsValid
  }
  if (!formData.content.trim()) return false
  if (formData.category === 'task' && !formData.assigneeValue) return false
  return true
})

// ✨ [修改] watch isVisible 的邏輯，加入處理 initialData 的部分
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      if (isEditMode.value) {
        // --- 編輯模式 ---
        const item = props.initialData
        formData.id = item.id
        formData.isLegacy = item.isLegacy || false
        formData.category = item.assignee ? 'task' : 'message'
        formData.assigneeValue = item.assignee?.value || ''
        formData.targetDate = item.targetDate || new Date().toISOString().slice(0, 10)
        formData.content = item.content
        formData.messageType = item.type || '常規'

        if (item.patientId) {
          selectedPatient.value = props.allPatients.find((p) => p.id === item.patientId)
        } else {
          selectedPatient.value = null
        }
      } else {
        // --- 新增模式 ---
        resetForm()
      }
    }
  },
)

function addSupplyItem() {
  dynamicSupplyItems.value.push({
    id: Date.now(),
    type: '',
    spec: '',
    quantity: 1,
  })
}

function removeSupplyItem(index) {
  dynamicSupplyItems.value.splice(index, 1)
}

function onItemTypeChange(item) {
  item.spec = ''
}

function resetForm() {
  formData.id = null
  formData.isLegacy = false
  formData.category = 'message'
  formData.assigneeValue = ''
  formData.targetDate = new Date().toISOString().slice(0, 10)
  formData.content = ''
  formData.messageType = '常規'
  selectedPatient.value = props.preselectedPatient || null
  dynamicSupplyItems.value = []
  otherSupplyInfo.value = ''
}

function handlePatientSelected({ patientId }) {
  selectedPatient.value = props.allPatients.find((p) => p.id === patientId)
  isPatientDialogVisible.value = false
}

function clearPatient() {
  selectedPatient.value = null
}

// ✨ [修改] 讓 handleSubmit 處理新增和更新兩種情況
async function handleSubmit() {
  if (isClerkSupplyTask.value) {
    const parts = dynamicSupplyItems.value
      .filter((item) => item.type && item.quantity > 0)
      .map((item) => {
        let itemName =
          supplyTypeOptions.value.find((opt) => opt.value === item.type)?.label || item.type
        if (item.spec) {
          itemName += ` (${item.spec})`
        }
        return `${itemName} x${item.quantity}`
      })

    let generatedContent = parts.length > 0 ? `補帳：${parts.join('、')}` : ''
    if (otherSupplyInfo.value.trim()) {
      generatedContent += `${generatedContent ? '。' : ''}其他：${otherSupplyInfo.value.trim()}`
    }
    formData.content = generatedContent
  }

  if (!isFormValid.value) return
  isSubmitting.value = true

  // --- 新增模式 ---
  if (!isEditMode.value) {
    const dataToSave = {
      category: formData.category,
      content: formData.content.trim(),
      status: 'pending',
      creator: {
        uid: currentUser.value.uid,
        name: currentUser.value.name,
        title: currentUser.value.title,
      },
      patientId: selectedPatient.value?.id || null,
      patientName: selectedPatient.value?.name || null,
      createdAt: serverTimestamp(),
    }

    if (dataToSave.category === 'task') {
      dataToSave.assignee = { type: 'role', value: formData.assigneeValue }
      dataToSave.targetDate = new Date().toISOString().slice(0, 10)
    } else {
      dataToSave.type = formData.messageType
      dataToSave.targetDate = formData.targetDate
      dataToSave.assignee = null
    }

    try {
      const savedDoc = await tasksApi.save(dataToSave)
      // ... 通知邏輯不變 ...
      let notifMessage = ''
      let notifType = 'info'
      if (dataToSave.category === 'message') {
        const typeLabel =
          messageTypeOptions.find((opt) => opt.value === dataToSave.type)?.label || '新留言'
        const patientPart = dataToSave.patientName ? `給 ${dataToSave.patientName}` : ''
        const contentPart =
          dataToSave.content.substring(0, 15) + (dataToSave.content.length > 15 ? '...' : '')
        notifMessage = `${typeLabel}: ${patientPart} - ${contentPart}`
        notifType = 'message'
      } else {
        const assigneeLabel =
          assigneeOptions.find((opt) => opt.value === dataToSave.assignee.value)?.label || ''
        notifMessage = `新交辦: 給 ${assigneeLabel} - ${dataToSave.content.substring(0, 20)}...`
        notifType = 'task'
      }
      createGlobalNotification(notifMessage, notifType, { documentId: savedDoc.id })
      emit('submit', { ...dataToSave, id: savedDoc.id }) // ✨ 發送帶有新ID的事件
      close()
    } catch (error) {
      console.error('新增失敗:', error)
    } finally {
      isSubmitting.value = false
    }

    // --- 編輯模式 ---
  } else {
    const dataToUpdate = {
      content: formData.content.trim(),
      // 如果是 message，可以更新 type 和 targetDate
      ...(formData.category === 'message' && {
        type: formData.messageType,
        targetDate: formData.targetDate,
      }),
      // ✨ [新增] 更新編輯者資訊
      lastEditedBy: {
        uid: currentUser.value.uid,
        name: currentUser.value.name,
      },
      lastEditedAt: serverTimestamp(),
    }

    // ✨ [新增] 將更新的資料發送回父元件
    emit('submit', { id: formData.id, isLegacy: formData.isLegacy, ...dataToUpdate })
    isSubmitting.value = false // 在父元件處理 API，這裡直接關閉
  }
}

function close() {
  emit('close')
}
</script>

<style scoped>
/* ✨ [新增] 禁用狀態的樣式 */
.disabled-view {
  opacity: 0.6;
  pointer-events: none;
}
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e9ecef;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}
.modal-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-label {
  font-weight: 600;
  color: #495047;
}
.form-control,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.6rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  box-sizing: border-box;
}
.selected-patient-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem;
  background-color: #e9ecef;
  border-radius: 4px;
}
.clear-patient-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  color: #6c757d;
}
.clear-patient-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.radio-group {
  display: flex;
  gap: 1.5rem;
  align-items: center;
}
.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 1rem;
}
.radio-label input[type='radio'] {
  width: 1.15em;
  height: 1.15em;
  cursor: pointer;
}
.radio-label input[type='radio']:disabled {
  cursor: not-allowed;
}
.btn {
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  font-size: 1rem;
}
.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.btn-outline {
  background-color: transparent;
  color: #007bff;
  border-color: #007bff;
}
.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.supply-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.dynamic-supply-item {
  display: grid;
  grid-template-columns: 1fr 1fr auto auto;
  gap: 0.5rem;
  align-items: center;
}
.supply-type-select,
.supply-spec-select {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
}
.spec-placeholder {
  height: 38px;
}
.quantity-stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-self: center;
}
.quantity-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #ced4da;
  background-color: white;
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
}
.quantity-display {
  font-size: 1.1rem;
  font-weight: bold;
  width: 30px;
  text-align: center;
}
.remove-item-btn {
  background: none;
  border: none;
  color: #dc3545;
  font-size: 1.5rem;
  cursor: pointer;
  justify-self: end;
}
.btn-add-supply {
  background-color: #e9ecef;
  color: #495047;
  border-color: #ced4da;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 500;
}
.other-supply-input {
  margin-top: 0.5rem;
}
.assignee-btn-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.btn-assignee {
  flex: 1 1 auto;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  border: 1px solid #ced4da;
  background-color: #f8f9fa;
  color: #495047;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  text-align: center;
  transition: all 0.2s ease-in-out;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.btn-assignee:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
}

.btn-assignee.active {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.message-type-icon {
  font-size: 1.1em;
}
</style>
