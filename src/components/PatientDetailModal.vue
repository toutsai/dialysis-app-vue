<!-- 檔案路徑: src/components/PatientDetailModal.vue (最終整合版) -->
<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container large">
      <div class="modal-header">
        <h2>{{ patient?.name }} - 詳細資料</h2>
        <button @click="handleClose" class="close-btn">×</button>
      </div>

      <!-- 頁籤導覽列 -->
      <div class="tabs-navigation">
        <button :class="{ active: activeTab === 'records' }" @click="activeTab = 'records'">
          病情紀錄
        </button>
        <button :class="{ active: activeTab === 'memos' }" @click="activeTab = 'memos'">
          <span v-if="hasPendingMemos" class="memo-indicator">!</span>
          查看備忘
        </button>
        <button :class="{ active: activeTab === 'labs' }" @click="activeTab = 'labs'">
          檢驗報告
        </button>
      </div>

      <!-- 頁籤內容 -->
      <div class="modal-body">
        <!-- 病情紀錄頁籤 -->
        <div v-show="activeTab === 'records'" class="tab-panel">
          <!-- 綁定 save, update, delete 事件到處理函式上 -->
          <ConditionRecordPanel
            v-if="patient"
            :patient="patient"
            :current-date="currentDate"
            @save="handleSaveConditionRecord"
            @update="handleUpdateConditionRecord"
            @delete="handleDeleteConditionRecord"
          />
        </div>

        <!-- 備忘頁籤 -->
        <div v-show="activeTab === 'memos'" class="tab-panel">
          <MemoPanel v-if="patient" :patient-id="patient.id" />
        </div>

        <!-- 檢驗報告頁籤 -->
        <div v-show="activeTab === 'labs'" class="tab-panel">
          <!-- 綁定 save-record 事件到處理函式上 -->
          <PatientLabSummaryPanel
            v-if="patient"
            :patient="patient"
            @save-record="handleSaveLabSummaryAsRecord"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js' // 引入 useAuth 以獲取作者資訊

// 引入我們需要用到的 "內容面板" 元件
import ConditionRecordPanel from './ConditionRecordPanel.vue'
import MemoPanel from './MemoPanel.vue'
import PatientLabSummaryPanel from './PatientLabSummaryPanel.vue'

// --- Props & Emits ---
const props = defineProps({
  isVisible: Boolean,
  patient: Object,
  currentDate: Date,
  hasPendingMemos: Boolean,
})
const emit = defineEmits(['close', 'record-updated']) // record-updated 用於通知父層刷新資料

// --- Component State ---
const activeTab = ref('records')
const { createGlobalNotification } = useGlobalNotifier()
const conditionRecordsApi = ApiManager('condition_records')
const auth = useAuth() // 初始化 useAuth

// --- Methods ---
function handleClose() {
  emit('close')
}

// 處理來自 ConditionRecordPanel 的 'save' 事件
async function handleSaveConditionRecord(recordData) {
  try {
    await conditionRecordsApi.save(recordData)
    createGlobalNotification(`已為 ${recordData.patientName} 新增病情紀錄`, 'schedule')
    emit('record-updated')
  } catch (error) {
    console.error('儲存病情紀錄失敗:', error)
    // 可以在此處添加用戶錯誤提示
  }
}

// 處理來自 ConditionRecordPanel 的 'update' 事件
async function handleUpdateConditionRecord({ id, content }) {
  try {
    await conditionRecordsApi.update(id, { content })
    createGlobalNotification('病情紀錄已更新', 'schedule')
    emit('record-updated')
  } catch (error) {
    console.error('更新病情紀錄失敗:', error)
  }
}

// 處理來自 ConditionRecordPanel 的 'delete' 事件
async function handleDeleteConditionRecord(recordId) {
  // 可以在這裡替換成更美觀的確認對話框組件
  if (confirm('您確定要永久刪除這筆病情紀錄嗎？')) {
    try {
      await conditionRecordsApi.delete(recordId)
      createGlobalNotification('病情紀錄已刪除', 'schedule')
      emit('record-updated')
    } catch (error) {
      console.error('刪除病情紀錄失敗:', error)
    }
  }
}

// 處理來自 PatientLabSummaryPanel 的 'save-record' 事件
async function handleSaveLabSummaryAsRecord({ patient, content }) {
  if (!auth.isContributor.value || !auth.currentUser.value) {
    alert('權限不足或未登入，無法儲存紀錄。')
    return
  }

  try {
    const recordData = {
      patientId: patient.id,
      patientName: patient.name,
      recordDate: props.currentDate
        ? props.currentDate.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      content: content,
      authorId: auth.currentUser.value.uid,
      authorName: auth.currentUser.value.name,
      createdAt: new Date(),
    }
    await conditionRecordsApi.save(recordData)
    createGlobalNotification(`已為 ${patient.name} 新增檢驗報告處置紀錄`, 'schedule')
    emit('record-updated')
    // 儲存後自動切換到病情紀錄頁籤，讓使用者看到新增的紀錄
    activeTab.value = 'records'
  } catch (error) {
    console.error('儲存檢驗摘要紀錄失敗:', error)
  }
}

// --- Watcher ---
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      // 當視窗打開時，如果病人有待辦備忘，預設跳到備忘頁籤，否則跳到病情紀錄
      activeTab.value = props.hasPendingMemos ? 'memos' : 'records'
    }
  },
)
</script>

<style scoped>
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
  backdrop-filter: blur(2px);
}
.modal-container {
  background-color: #f8f9fa;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 1100px;
  height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #6c757d;
}
.close-btn:hover {
  color: #343a40;
}

.tabs-navigation {
  display: flex;
  background-color: #e9ecef;
  padding: 0.5rem 1.5rem 0 1.5rem;
  flex-shrink: 0;
  gap: 0.5rem;
}
.tabs-navigation button {
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-bottom: none;
  background-color: transparent;
  color: #6c757d;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
  position: relative;
}
.tabs-navigation button.active {
  background-color: #fff;
  color: #007bff;
  border-color: #dee2e6;
}
.memo-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 10px;
  height: 10px;
  background-color: #dc3545;
  border-radius: 50%;
  border: 2px solid #e9ecef; /* 與背景色相同的邊框，使其看起來更精緻 */
}
.tabs-navigation button.active .memo-indicator {
  border-color: #fff; /* Active 時邊框與頁籤背景色相同 */
}

.modal-body {
  flex-grow: 1;
  /* overflow-y: auto; (移除這個，讓子元素自己決定滾動) */
  overflow: hidden; /* ✨ 新增：防止 body 自身滾動 */
  background-color: #fff;
  padding: 1.5rem;
  display: flex; /* ✨ 新增：將 body 設為 flex 容器 */
}

.tab-panel {
  width: 100%;
  /* height: 100%; (移除這個) */
  display: flex; /* ✨ 新增：將頁籤面板也設為 flex 容器 */
  flex-direction: column; /* ✨ 新增：讓面板內的元素垂直排列 */
}
@media (max-width: 992px) {
  .modal-body {
    /* 在行動版上，恢復 body 的滾動能力，因為內部 panel 變成了自然高度 */
    overflow-y: auto;
  }
}
</style>
