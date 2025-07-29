<!-- 檔案路徑: src/views/ExceptionManagerView.vue (智慧衝突處理版) -->
<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">排程例外管理中心</h1>
          <button class="btn btn-primary" @click="openCreateDialog" :disabled="isPageLocked">
            <i class="fas fa-plus-circle"></i> 新增例外申請
          </button>
        </div>
      </div>
      <p class="page-description">
        此處用於處理「臨時調班」或「區間暫停排程」等特殊情況。此處建立的申請將會自動更新對應日期的排班表。
      </p>
    </header>

    <main class="page-main-content">
      <div class="exceptions-list-container">
        <h2 class="section-title">目前的例外申請列表</h2>
        <div v-if="isLoading" class="loading-state">正在載入例外申請資料...</div>
        <div v-else-if="exceptions.length === 0" class="empty-state">
          <i class="fas fa-check-circle"></i>
          <p>目前沒有任何待處理或已生效的例外申請。</p>
        </div>
        <table v-else class="exceptions-table">
          <thead>
            <tr>
              <th>狀態</th>
              <th>病患姓名</th>
              <th>類型</th>
              <th>日期區間</th>
              <th>原因 / 目的</th>
              <th>申請時間</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ex in exceptions" :key="ex.id" :class="`status-${ex.status}`">
              <td>
                <span class="status-badge" :class="`status-${ex.status}`">
                  {{ statusMap[ex.status] || '未知' }}
                </span>
              </td>
              <td>{{ ex.patientName }}</td>
              <td>
                <span class="type-badge" :class="`type-${ex.type}`">
                  {{ typeMap[ex.type] || '未知' }}
                </span>
              </td>
              <td>
                {{ ex.startDate }}
                <span v-if="ex.endDate !== ex.startDate"> ~ {{ ex.endDate }}</span>
              </td>
              <td class="reason-cell">
                <div v-if="ex.type === 'MOVE' && ex.from && ex.to">
                  <div>
                    <strong>從:</strong> {{ ex.from.sourceDate }} ({{ ex.from.bedNum }}床 /
                    {{ ex.from.shiftCode }}班)
                  </div>
                  <div>
                    <strong>移至:</strong> {{ ex.to.goalDate }} ({{ ex.to.bedNum }}床 /
                    {{ ex.to.shiftCode }}班)
                  </div>
                  <!-- 🔥 新增：顯示錯誤訊息 -->
                  <small v-if="ex.status === 'error'" class="error-message"
                    >錯誤: {{ ex.errorMessage }}</small
                  >
                  <small v-else>原因: {{ ex.reason }}</small>
                </div>
                <div v-else>
                  {{ ex.reason }}
                </div>
              </td>
              <td>{{ formatTimestamp(ex.createdAt) }}</td>
              <td>
                <button
                  class="btn btn-danger btn-sm"
                  @click="confirmDeleteException(ex.id)"
                  :disabled="isActionDisabled(ex) || isPageLocked"
                >
                  <i class="fas fa-trash-alt"></i> 撤銷
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>

    <!-- 🔥 核心修改：傳遞 initial-data prop -->
    <ExceptionCreateDialog
      :is-visible="isCreateDialogVisible"
      :all-patients="allPatients"
      :is-page-locked="isPageLocked"
      :initial-data="exceptionToReEdit"
      @close="closeCreateDialog"
      @submit="handleCreateException"
    />

    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      title="確認撤銷"
      message="您確定要撤銷這筆例外申請嗎？此操作可能會導致相關日期的排班恢復為總表預設值。"
      @confirm="executeDeleteException"
      @cancel="isConfirmDeleteVisible = false"
    />

    <!-- 🔥 新增：衝突提示 Dialog -->
    <AlertDialog
      :is-visible="isConflictAlertVisible"
      title="排班衝突！"
      :message="conflictAlertMessage"
      @confirm="handleConflictAlertConfirm"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router' // ✨ 1. 在頂部引入 useRouter
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import ApiManager from '@/services/api_manager.js'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService.js'
import { useAuth } from '@/composables/useAuth.js'

import ExceptionCreateDialog from '@/components/ExceptionCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue' // 引入 AlertDialog

const exceptionsApi = ApiManager('schedule_exceptions')
const memosApi = ApiManager('memos')
const router = useRouter() // ✨ 2. 在這裡定義 router 常數
const allPatients = ref([])
const exceptions = ref([])
const isLoading = ref(true)
const isCreateDialogVisible = ref(false)
const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)

let unsubscribe = null

const auth = useAuth()
const isPageLocked = computed(() => !auth.canEditSchedules.value)

// 🔥 新增：衝突處理相關狀態
const exceptionToReEdit = ref(null)
const isConflictAlertVisible = ref(false)
const conflictAlertMessage = ref('')

const statusMap = {
  pending: '待處理',
  processing: '處理中',
  applied: '已生效',
  error: '錯誤',
  expired: '已過期',
  conflict_requires_resolution: '衝突待解決', // 新增狀態
}

const typeMap = {
  MOVE: '臨時調班',
  SUSPEND: '區間暫停',
}

function formatTimestamp(ts) {
  if (!ts || !ts.toDate) return 'N/A'
  return ts.toDate().toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function openCreateDialog() {
  if (isPageLocked.value) return
  exceptionToReEdit.value = null // 確保是新增模式
  isCreateDialogVisible.value = true
}

function closeCreateDialog() {
  isCreateDialogVisible.value = false
  // 延遲一點時間再清理，避免 Dialog 在關閉動畫時內容突然消失
  setTimeout(() => {
    exceptionToReEdit.value = null
  }, 300)
}

async function handleCreateException(formData) {
  try {
    const isUpdating = !!formData.id // 判斷是新增還是解決衝突

    if (isUpdating) {
      await deleteDoc(doc(db, 'schedule_exceptions', formData.id))
      console.log(`[Re-Submit] 已刪除舊的衝突申請: ${formData.id}`)
    }

    const dataToSave = {
      patientId: formData.patientId,
      patientName: formData.patientName,
      type: formData.type,
      reason: formData.reason,
      startDate: formData.type === 'MOVE' ? formData.from.sourceDate : formData.startDate,
      endDate: formData.type === 'MOVE' ? formData.to.goalDate : formData.endDate,
      from: formData.type === 'MOVE' ? formData.from : null,
      to: formData.type === 'MOVE' ? formData.to : null,
      status: 'pending',
      createdAt: new Date(),
    }
    await exceptionsApi.save(dataToSave)
    console.log('✅ 新的/已修正的例外申請已成功提交！')

    closeCreateDialog()

    // --- ✨ 核心修正：自動建立備忘錄的邏輯 ---

    // ✨ 1. 新增一個輔助函式，專門用來格式化床位顯示
    const getBedDisplay = (bedNum) => {
      if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
        return `外圍 ${bedNum.split('-')[1]}`
      }
      return `${bedNum}床`
    }

    let memoContent = ''
    if (formData.type === 'MOVE') {
      const fromShift =
        formData.from.shiftCode === 'early'
          ? '早'
          : formData.from.shiftCode === 'noon'
            ? '午'
            : '晚'
      const toShift =
        formData.to.shiftCode === 'early' ? '早' : formData.to.shiftCode === 'noon' ? '午' : '晚'

      // ✨ 2. 使用輔助函式取得床位顯示文字
      const fromBedDisplay = getBedDisplay(formData.from.bedNum)
      const toBedDisplay = getBedDisplay(formData.to.bedNum)

      // ✨ 3. 產生包含完整床位資訊的備忘錄內容
      memoContent = `【${isUpdating ? '更新-臨時調班' : '臨時調班'}】\n原排班: ${formData.from.sourceDate} (${fromBedDisplay} / ${fromShift}班)\n新排班: ${formData.to.goalDate} (${toBedDisplay} / ${toShift}班)\n原因: ${formData.reason}`
    } else if (formData.type === 'SUSPEND') {
      memoContent = `【區間暫停】\n從 ${formData.startDate} 至 ${formData.endDate}\n原因: ${formData.reason}`
    }

    if (memoContent) {
      const newMemo = {
        content: memoContent,
        patientId: formData.patientId,
        patientName: formData.patientName,
        targetDate: formData.type === 'MOVE' ? formData.to.goalDate : formData.endDate,
        status: 'pending',
        isResolved: false,
        createdAt: new Date().toISOString(),
      }
      await memosApi.save(newMemo)
      console.log('✅ 已同步建立對應的備忘錄！')
    }
  } catch (error) {
    console.error('❌ 提交例外申請或建立備忘失敗:', error)
  }
}

function confirmDeleteException(id) {
  if (isPageLocked.value) return
  exceptionToDeleteId.value = id
  isConfirmDeleteVisible.value = true
}

async function executeDeleteException() {
  if (!exceptionToDeleteId.value) return
  try {
    await deleteDoc(doc(db, 'schedule_exceptions', exceptionToDeleteId.value))
    console.log(`✅ 已撤銷例外申請: ${exceptionToDeleteId.value}`)
  } catch (error) {
    console.error('❌ 撤銷失敗:', error)
  } finally {
    isConfirmDeleteVisible.value = false
    exceptionToDeleteId.value = null
  }
}

function isActionDisabled(exception) {
  // 1. 如果是錯誤狀態，永遠可以被撤銷（以便修正）
  //    除非我們定義錯誤狀態不能被撤銷，這裡假設可以
  if (exception.status === 'error') {
    return false // 允許撤銷錯誤的申請
  }

  // 2. 獲取一個有效的結束日期
  //    無論是 MOVE 還是 SUSPEND，我們都以 endDate 為準
  const endDateStr = exception.endDate

  // 3. 如果連 endDate 都沒有，我們不禁用它，讓使用者可以刪除這筆可能有問題的資料
  if (!endDateStr) {
    return false
  }

  // 4. 只有當 endDate 明確存在，並且是過去的日期時，才禁用按鈕
  const today = new Date().toISOString().split('T')[0]
  return endDateStr < today
}

// 🔥 新增：處理衝突的函式
function handleConflictAlertConfirm() {
  isConflictAlertVisible.value = false
  // 使用 nextTick 確保 alert dialog 關閉後再打開新的 dialog
  nextTick(() => {
    isCreateDialogVisible.value = true
  })
}

import { useRoute } from 'vue-router' // 引入 useRoute
const route = useRoute() // 獲取路由實例

onMounted(async () => {
  try {
    allPatients.value = await optimizedFetchAllPatients()
    const q = query(collection(db, 'schedule_exceptions'), orderBy('createdAt', 'desc'))

    unsubscribe = onSnapshot(q, (snapshot) => {
      exceptions.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value = false

      // ✨ 核心：檢查 URL 中是否有需要解決的衝突
      const conflictId = route.query.resolveConflict
      if (conflictId) {
        const conflictException = exceptions.value.find((ex) => ex.id === conflictId)
        if (conflictException) {
          console.log(`[ExceptionManager] 接收到衝突解決指令: ${conflictId}`)
          exceptionToReEdit.value = conflictException
          isCreateDialogVisible.value = true
          // (可選) 清除 URL query，避免重複觸發
          router.replace({ query: {} })
        }
      }
    })
  } catch (error) {
    console.error('❌ 載入資料失敗:', error)
    isLoading.value = false
  }
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');
.page-container {
  height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.page-header {
  border-bottom: 2px solid #dee2e6;
  padding-bottom: 1.5rem;
  margin-bottom: 2rem;
}
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.page-title {
  font-size: 32px;
  font-weight: 700;
  color: #343a40;
  margin: 0;
}
.page-description {
  margin-top: 0.5rem;
  font-size: 1rem;
  color: #6c757d;
}
.btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  font-size: 1rem;
}
.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.btn-primary:hover {
  background-color: #0069d9;
}
.btn-danger {
  background-color: #dc3545;
  color: white;
  border-color: #dc3545;
}
.btn-danger:hover {
  background-color: #c82333;
}
.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}
button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.page-main-content {
  flex-grow: 1;
  background-color: #fff;
  padding: 1rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow-y: auto;
}
.section-title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
}
.exceptions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.exceptions-table th,
.exceptions-table td {
  padding: 0.5rem;
  text-align: left;
  border-bottom: 1px solid #e9ecef;
  vertical-align: middle;
}
.exceptions-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  color: #495057;
}
.exceptions-table tbody tr:hover {
  background-color: #f1f3f5;
}
.status-badge,
.type-badge {
  padding: 0.25em 0.6em;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.8em;
  text-transform: uppercase;
  color: white;
}
.status-pending,
.status-processing {
  background-color: #ffc107;
  color: #333;
}
.status-applied {
  background-color: #28a745;
}
.status-error {
  background-color: #dc3545;
}
.status-expired {
  background-color: #6c757d;
}
.status-conflict_requires_resolution {
  background-color: #fd7e14; /* 醒目的橘色 */
  color: white;
}

.type-MOVE {
  background-color: #17a2b8;
}
.type-SUSPEND {
  background-color: #6610f2;
}
.reason-cell small {
  color: #6c757d;
}
.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 0;
  color: #6c757d;
}
.empty-state i {
  font-size: 3rem;
  color: #28a745;
  margin-bottom: 1rem;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
/* 🔥 新增錯誤訊息樣式 */
.error-message {
  color: #dc3545;
  font-weight: bold;
}
</style>
