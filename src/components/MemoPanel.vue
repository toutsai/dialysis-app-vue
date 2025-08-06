<!-- 檔案路徑: src/components/MemoPanel.vue (作為整合式彈窗的子面板) -->
<template>
  <div class="memo-panel-content">
    <div v-if="isLoading" class="loading-state">正在讀取備忘事項...</div>
    <div v-else-if="error" class="error-state">讀取備忘失敗: {{ error }}</div>
    <ul v-else-if="memos.length > 0" class="memo-list-in-panel">
      <li v-for="memo in memos" :key="memo.id" class="memo-item-in-panel">
        <p class="memo-text">{{ memo.content }}</p>
        <div class="memo-meta-in-panel">
          <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
          <span v-if="memo.targetDate"
            >| 目標日期: <strong>{{ memo.targetDate }}</strong></span
          >
        </div>
      </li>
    </ul>
    <div v-else class="empty-state">該病人沒有待處理的備忘事項。</div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy } from 'firebase/firestore'

const props = defineProps({
  // Panel 只需知道 patientId 即可自行獲取資料
  patientId: String,
})

const memosApi = ApiManager('memos')

const memos = ref([])
const isLoading = ref(false)
const error = ref(null)

async function fetchMemos() {
  if (!props.patientId) {
    memos.value = []
    return
  }

  isLoading.value = true
  error.value = null

  try {
    const queryConstraints = [
      where('patientId', '==', props.patientId),
      where('status', '==', 'pending'), // 只顯示待處理的
      orderBy('createdAt', 'desc'),
    ]
    // 直接從 API 獲取資料
    const fetchedMemos = await memosApi.fetchAll(queryConstraints)
    memos.value = fetchedMemos
  } catch (err) {
    console.error('從 Panel 讀取備忘失敗:', err)
    error.value = err.message
  } finally {
    isLoading.value = false
  }
}

// 監聽 patientId 的變化，當父元件切換病人時，自動重新載入備忘
watch(
  () => props.patientId,
  (newId) => {
    if (newId) {
      fetchMemos()
    } else {
      memos.value = [] // 如果沒有病人ID，則清空列表
    }
  },
  { immediate: true },
) // immediate: true 確保組件首次載入時就執行一次
</script>

<style scoped>
/* 樣式是從 MemoDisplayDialog 複製過來的，並做了一些微調 */
.memo-panel-content {
  height: 100%;
}

.memo-list-in-panel {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.memo-item-in-panel {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  border-left: 4px solid #007bff;
}

.memo-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 1rem;
  margin: 0 0 0.75rem 0;
  color: #212529;
}

.memo-meta-in-panel {
  font-size: 0.85rem;
  color: #6c757d;
  text-align: right;
}

.memo-meta-in-panel strong {
  color: #495057;
}

.empty-state,
.loading-state,
.error-state {
  text-align: center;
  color: #6c757d;
  font-size: 1.1rem;
  padding: 3rem 1.5rem;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-state {
  color: #dc3545;
}
</style>
