<!-- 檔案路徑: src/components/ConditionRecordModal.vue -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="close">
    <div class="dialog-content">
      <header class="dialog-header">
        <h2>{{ patient?.name }} - 病情紀錄</h2>
        <button class="close-button" @click="close">×</button>
      </header>
      <main class="dialog-body">
        <div class="record-form">
          <div class="form-group new-record-section">
            <label for="recordContent"
              ><strong>新增今日 ({{ formattedCurrentDate }}) 紀錄：</strong></label
            >
            <textarea
              id="recordContent"
              v-model="newContent"
              rows="5"
              placeholder="例如：血壓偏低、病人抱怨不適..."
              ref="textareaRef"
            ></textarea>
          </div>
        </div>

        <div class="history-section">
          <h3>歷史紀錄</h3>
          <div v-if="isLoadingHistory" class="loading-state">
            <div class="loading-spinner"></div>
            <span>載入歷史紀錄中...</span>
          </div>
          <div v-else-if="historyRecords.length > 0" class="history-list">
            <div v-for="record in historyRecords" :key="record.id" class="history-item">
              <div class="history-item-header">
                <strong class="record-date">{{ record.recordDate }}</strong>
                <span class="record-author">by {{ record.authorName }}</span>
              </div>
              <p class="record-content">{{ record.content }}</p>
            </div>
          </div>
          <div v-else class="empty-state">無歷史紀錄</div>
        </div>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="close">關閉</button>
        <button class="btn btn-primary" @click="submit" :disabled="!newContent.trim()">
          儲存紀錄
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy } from 'firebase/firestore'

const props = defineProps({
  isVisible: Boolean,
  patient: {
    type: Object,
    default: null,
  },
  currentDate: {
    type: Date,
    required: true,
  },
})

const emit = defineEmits(['close', 'save'])

const conditionRecordsApi = ApiManager('condition_records')
const newContent = ref('')
const textareaRef = ref(null)
const historyRecords = ref([])
const isLoadingHistory = ref(false)

const formattedCurrentDate = computed(() => {
  if (!props.currentDate) return ''
  const date = new Date(props.currentDate)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${month}/${day}`
})

async function fetchHistory() {
  if (!props.patient?.id) {
    historyRecords.value = []
    return
  }
  isLoadingHistory.value = true
  try {
    historyRecords.value = await conditionRecordsApi.fetchAll([
      where('patientId', '==', props.patient.id),
      orderBy('createdAt', 'desc'),
    ])
  } catch (error) {
    console.error('讀取歷史病情紀錄失敗:', error)
    historyRecords.value = []
  } finally {
    isLoadingHistory.value = false
  }
}

watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      newContent.value = ''
      fetchHistory()
      nextTick(() => {
        textareaRef.value?.focus()
      })
    }
  },
)

function close() {
  emit('close')
}

function submit() {
  if (newContent.value.trim()) {
    emit('save', { content: newContent.value.trim() })
  }
}
</script>

<style scoped>
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
  z-index: 1050;
  padding: 1rem;
}
.dialog-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.dialog-header {
  padding: 1rem 1.5rem;
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
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.record-form,
.new-record-section {
  width: 100%;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.form-group label {
  font-weight: 500;
}
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  box-sizing: border-box;
  resize: vertical;
}
.history-section {
  border-top: 1px solid #e9ecef;
  padding-top: 1.5rem;
}
.history-section h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.2rem;
  color: #495057;
}
.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.history-item {
  background-color: #f8f9fa;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  border: 1px solid #dee2e6;
}
.history-item-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.5rem;
}
.record-date {
  font-weight: bold;
  color: #0056b3;
}
.record-author {
  font-size: 0.85rem;
  color: #6c757d;
}
.record-content {
  margin: 0;
  white-space: pre-wrap;
  color: #212529;
}
.loading-state,
.empty-state {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}
.loading-spinner {
  margin: 0 auto 0.5rem;
  width: 24px;
  height: 24px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  flex-shrink: 0;
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

@media (max-width: 768px) {
  .dialog-overlay {
    align-items: flex-start;
  }
  .dialog-content {
    margin-top: 5vh;
  }
  .dialog-header h2 {
    font-size: 1.25rem;
  }
  .dialog-body,
  .dialog-header,
  .dialog-footer {
    padding: 1rem;
  }
  .dialog-footer {
    flex-direction: column-reverse;
    gap: 0.75rem;
  }
  .btn {
    width: 100%;
  }
}
</style>
