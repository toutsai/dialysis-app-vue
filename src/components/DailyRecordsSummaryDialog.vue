<!-- src/components/DailyRecordsSummaryDialog.vue (全新邏輯版) -->
<template>
  <div v-if="isVisible" class="dialog-overlay" v-overlay-close="closeDialog">
    <div class="dialog-content">
      <div class="dialog-header">
        <h3>{{ dialogTitle }}</h3>
        <button @click="closeDialog" class="close-btn" title="關閉">×</button>
      </div>
      <div class="dialog-body">
        <div v-if="isLoading" class="panel-loading">
          <div class="loading-spinner"></div>
          <span>正在載入病情紀錄...</span>
        </div>
        <!-- ✨ 邏輯更新：現在直接檢查 allRecords 的長度 -->
        <div v-else-if="allRecords.length > 0">
          <!-- 不再需要按班別分組 -->
          <div class="shift-section">
            <table class="records-table">
              <thead>
                <tr>
                  <th class="col-name">病人</th>
                  <th class="col-time">紀錄時間</th>
                  <th class="col-content">紀錄內容</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="record in allRecords" :key="record.id">
                  <td class="col-name">{{ record.patientName }}</td>
                  <td class="col-time">{{ formatTime(record.createdAt) }}</td>
                  <td class="col-content">{{ record.content }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="panel-empty">
          <p><i class="fas fa-check-circle"></i> 此班別尚無任何病情紀錄</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
// ✨ 步驟 1: 引入 'in' 查詢運算子
import { where } from 'firebase/firestore'

const props = defineProps({
  isVisible: Boolean,
  targetDate: {
    type: String, // YYYY-MM-DD
    required: true,
  },
  // ✨ 步驟 2: 修改 props
  shiftCode: {
    // 用來顯示標題
    type: String, // 'early', 'noon', or 'late'
    default: null,
  },
  patientIds: {
    // 接收病人 ID 列表
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close'])
const closeDialog = () => emit('close')

const conditionRecordsApi = ApiManager('condition_records')
const isLoading = ref(false)
const allRecords = ref([])

const formattedDate = computed(() => {
  if (!props.targetDate) return ''
  try {
    const date = new Date(props.targetDate + 'T00:00:00')
    return date.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' })
  } catch {
    return props.targetDate
  }
})

const dialogTitle = computed(() => {
  if (props.shiftCode) {
    return `${getShiftDisplayName(props.shiftCode)} 病情紀錄摘要 - ${formattedDate.value}`
  }
  return `本日病情紀錄摘要 - ${formattedDate.value}` // 備用標題
})

function getShiftDisplayName(shiftCode) {
  const map = { early: '早班', noon: '午班', late: '晚班' }
  return map[shiftCode] || '未知班別'
}

function formatTime(timestamp) {
  if (!timestamp || !timestamp.toDate) return 'N/A'
  return timestamp.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

// ✨✨✨ 核心修正點：重構 fetchRecords 函式以支援分批查詢 ✨✨✨
async function fetchRecords(date, patientIdList) {
  isLoading.value = true
  allRecords.value = []

  if (!date || !patientIdList || patientIdList.length === 0) {
    isLoading.value = false
    return
  }

  try {
    // 1. 將 patientIdList 切割成多個小於等於 30 的陣列
    const chunks = []
    for (let i = 0; i < patientIdList.length; i += 30) {
      chunks.push(patientIdList.slice(i, i + 30))
    }

    console.log(`[Records] 病人總數 ${patientIdList.length} 人，將分 ${chunks.length} 批次查詢。`)

    // 2. 為每一個小陣列建立一個查詢 Promise
    const promises = chunks.map((chunk) => {
      // 確保即使只有一個小陣列，查詢邏輯也一樣
      return conditionRecordsApi.fetchAll([
        where('recordDate', '==', date),
        where('patientId', 'in', chunk),
      ])
    })

    // 3. 使用 Promise.all 等待所有的查詢都完成
    const chunkResults = await Promise.all(promises)

    // 4. 將所有批次的查詢結果合併成一個陣列
    const combinedRecords = chunkResults.flat()

    // 5. 對合併後的結果進行排序
    combinedRecords.sort((a, b) => {
      const timeA = a.createdAt?.toDate() || 0
      const timeB = b.createdAt?.toDate() || 0
      return timeA - timeB
    })

    allRecords.value = combinedRecords
  } catch (error) {
    console.error(`讀取 ${date} 的病情紀錄失敗 (可能是分批查詢錯誤):`, error)
    // 這裡可以加上更友善的錯誤提示給使用者
  } finally {
    isLoading.value = false
  }
}

watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      fetchRecords(props.targetDate, props.patientIds)
    }
  },
)
</script>

<style scoped>
/* ... 您現有的 Dialog 樣式 ... */
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
}
.dialog-content {
  background: white;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e5e5;
}
.dialog-header h3 {
  margin: 0;
  font-size: 1.5rem;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #aaa;
  padding: 0;
  line-height: 1;
}
.dialog-body {
  padding: 1.5rem;
  overflow-y: auto;
}

.shift-section {
  margin-bottom: 2rem;
}
.shift-title {
  font-size: 1.25rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #007bff;
  margin-bottom: 1rem;
}
.records-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 1rem;
}
.records-table th,
.records-table td {
  border: 1px solid #ddd;
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}
.records-table th {
  background-color: #f8f9fa;
  font-weight: 600;
}

/* 重新分配欄寬 */
.col-name {
  width: 20%;
}
.col-time {
  width: 20%;
  text-align: center;
}
.col-content {
  width: 60%;
  white-space: pre-wrap;
} /* 讓內容欄更寬 */

.panel-loading,
.panel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  color: #6c757d;
  min-height: 200px;
}
.panel-empty i {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
  opacity: 0.7;
}
.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
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
