<!-- 檔案路徑: src/components/ConditionRecordModal.vue (功能增強版) -->
<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2 class="modal-title">病情紀錄 - {{ patient?.name }}</h2>
        <button class="close-button" @click="close">×</button>
      </div>
      <div class="modal-body">
        <!-- 新增/編輯紀錄區塊 -->
        <div class="record-form" ref="recordFormElement">
          <textarea
            v-model="newRecordContent"
            :placeholder="
              editingRecordId ? '正在編輯紀錄...' : '請在此輸入病情、透析狀況或注意事項...'
            "
            rows="4"
          ></textarea>
          <div class="form-actions">
            <button v-if="editingRecordId" @click="cancelEditing" class="cancel-button">
              取消編輯
            </button>
            <button @click="handleSave" class="save-button" :disabled="isSaving">
              {{ isSaving ? '儲存中...' : editingRecordId ? '更新紀錄' : '儲存紀錄' }}
            </button>
          </div>
        </div>

        <!-- 歷史紀錄區塊 -->
        <div class="history-section">
          <h3 class="history-title">歷史紀錄</h3>
          <div v-if="isLoading" class="loading-state">
            <div class="spinner"></div>
            正在讀取歷史紀錄...
          </div>
          <div v-else-if="error" class="error-state">
            {{ error }}
          </div>
          <ul v-else-if="history.length > 0" class="history-list">
            <li v-for="record in history" :key="record.id" class="history-item">
              <p class="record-content">{{ record.content }}</p>
              <div class="record-meta">
                <span class="author">紀錄者: {{ record.authorName || '未知' }}</span>
                <span class="timestamp">{{ formatTimestamp(record.createdAt) }}</span>
              </div>
              <!-- ✨ 新增/修改：只有作者能看到編輯和刪除按鈕 -->
              <div
                v-if="auth.currentUser.value && record.authorId === auth.currentUser.value.uid"
                class="record-actions"
              >
                <button @click="startEditing(record)" class="action-btn edit-btn">編輯</button>
                <button @click="handleDelete(record.id)" class="action-btn delete-btn">刪除</button>
              </div>
            </li>
          </ul>
          <div v-else class="empty-state">這位病人目前沒有任何歷史病情紀錄。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, toRefs } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'

const props = defineProps({
  isVisible: Boolean,
  patient: Object,
  currentDate: Date,
})

// ✨ 新增/修改：新增 update 和 delete 事件
const emit = defineEmits(['close', 'save', 'update', 'delete'])

const { isVisible, patient } = toRefs(props)

const newRecordContent = ref('')
const history = ref([])
const isLoading = ref(false)
const isSaving = ref(false)
const error = ref(null)
// ✨ 新增/修改：用於追蹤正在編輯的紀錄 ID
const editingRecordId = ref(null)
const recordFormElement = ref(null)

const conditionRecordsApi = ApiManager('condition_records')
const auth = useAuth()

async function fetchHistory() {
  if (!patient.value?.id) {
    history.value = []
    return
  }

  isLoading.value = true
  error.value = null
  history.value = []

  try {
    const queryConstraints = [
      where('patientId', '==', patient.value.id),
      orderBy('createdAt', 'desc'),
    ]
    history.value = await conditionRecordsApi.fetchAll(queryConstraints)
  } catch (err) {
    console.error('讀取歷史病情紀錄失敗:', err)
    error.value = '讀取歷史紀錄失敗。請確認 Firebase 索引是否已建立。'
  } finally {
    isLoading.value = false
  }
}

function formatTimestamp(ts) {
  if (!ts) return '未知時間'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ✨ 新增/修改：處理儲存（新增或更新）的邏輯
async function handleSave() {
  if (!newRecordContent.value.trim() || !patient.value || isSaving.value) return

  isSaving.value = true

  try {
    if (editingRecordId.value) {
      // --- 更新模式 ---
      emit('update', {
        id: editingRecordId.value,
        content: newRecordContent.value.trim(),
      })
    } else {
      // --- 新增模式 ---
      const recordData = {
        content: newRecordContent.value.trim(),
        authorId: auth.currentUser.value.uid,
        authorName: auth.currentUser.value.name,
      }
      emit('save', recordData)
    }
    // 操作成功後，重置表單狀態
    cancelEditing()
    // 重新載入歷史紀錄以顯示變更
    await fetchHistory()
  } catch (err) {
    console.error('從 Modal 觸發儲存/更新失敗:', err)
  } finally {
    isSaving.value = false
  }
}

// ✨ 新增/修改：開始編輯的函式
function startEditing(record) {
  editingRecordId.value = record.id
  newRecordContent.value = record.content
  // 將視窗滾動到表單位置，方便手機操作
  recordFormElement.value?.scrollIntoView({ behavior: 'smooth' })
}

// ✨ 新增/修改：取消編輯的函式
function cancelEditing() {
  editingRecordId.value = null
  newRecordContent.value = ''
}

// ✨ 新增/修改：處理刪除的函式
async function handleDelete(recordId) {
  emit('delete', recordId)
  // 假定父組件會處理確認，並在成功後重新載入
  // 為了即時反饋，也可以在這裡先從 UI 移除
  history.value = history.value.filter((r) => r.id !== recordId)
}

function close() {
  cancelEditing() // 關閉時也取消編輯狀態
  emit('close')
}

watch(isVisible, (newVal) => {
  if (newVal) {
    cancelEditing()
    error.value = null
    fetchHistory()
  }
})
</script>

<style scoped>
/* (樣式保持不變，但新增了幾個 class 的定義) */
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

.modal-content {
  background-color: #fff;
  border-radius: 12px;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
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

.modal-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #343a40;
}

.close-button {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #6c757d;
  padding: 0;
  line-height: 1;
}

.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.record-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.record-form textarea {
  width: 100%;
  padding: 0.75rem;
  border-radius: 8px;
  border: 1px solid #ced4da;
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
}

/* ✨ 新增/修改：讓儲存和取消按鈕並排 */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.save-button,
.cancel-button {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
}

.save-button {
  background-color: #007bff;
  color: white;
}

.cancel-button {
  background-color: #6c757d;
  color: white;
}

.save-button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.history-section {
  border-top: 1px solid #e9ecef;
  padding-top: 1.5rem;
}

.history-title {
  font-size: 1.25rem;
  color: #495057;
  margin: 0 0 1rem 0;
}

.history-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-item {
  background-color: #f8f9fa;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #e9ecef;
}

.record-content {
  margin: 0 0 0.5rem 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.record-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #6c757d;
  margin-bottom: 0.5rem;
}
.author {
  font-weight: 500;
  color: #495057;
}

/* ✨ 新增/修改：操作按鈕樣式 */
.record-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  border-top: 1px solid #dee2e6;
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}

.action-btn {
  padding: 4px 8px;
  font-size: 0.8rem;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
}

.edit-btn {
  background-color: #ffc107;
  border-color: #ffc107;
  color: #212529;
}

.delete-btn {
  background-color: #dc3545;
  border-color: #dc3545;
  color: white;
}

.loading-state,
.empty-state,
.error-state {
  text-align: center;
  padding: 2rem 0;
  color: #6c757d;
}

.error-state {
  color: #dc3545;
  background-color: #f8d7da;
  border-radius: 8px;
  padding: 1rem;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 0.5rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
