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
    let dataToSave
    let isUpdating = !!formData.id // 判斷是新增還是更新

    if (isUpdating) {
      // 更新模式
      const originalExceptionRef = doc(db, 'schedule_exceptions', formData.id)
      dataToSave = {
        ...formData,
        status: 'pending', // 重置狀態為 pending，讓後端重新處理
        updatedAt: new Date(),
        conflictDetails: null, // 清除衝突標記
        errorMessage: '',
      }
      await updateDoc(originalExceptionRef, dataToSave)
      console.log(`✅ 衝突已解決並重新提交例外申請: ${formData.id}`)
    } else {
      // 新增模式
      dataToSave = {
        ...formData,
        status: 'pending',
        createdAt: new Date(),
      }
      await exceptionsApi.save(dataToSave)
      console.log('✅ 新的例外申請已成功提交！')
    }

    closeCreateDialog()

    // 自動建立備忘錄 (無論新增或更新都執行)
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
      memoContent = `【${isUpdating ? '更新-臨時調班' : '臨時調班'}】\n原排班: ${formData.from.sourceDate} (${fromShift}班)\n新排班: ${formData.to.goalDate} (${toShift}班)\n原因: ${formData.reason}`
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
  const today = new Date().toISOString().split('T')[0]
  return exception.endDate < today
}

// 🔥 新增：處理衝突的函式
function handleConflictAlertConfirm() {
  isConflictAlertVisible.value = false
  // 使用 nextTick 確保 alert dialog 關閉後再打開新的 dialog
  nextTick(() => {
    isCreateDialogVisible.value = true
  })
}

onMounted(async () => {
  try {
    allPatients.value = await optimizedFetchAllPatients()
    const q = query(collection(db, 'schedule_exceptions'), orderBy('createdAt', 'desc'))

    // 🔥 核心修改：增強 onSnapshot 監聽器
    unsubscribe = onSnapshot(q, (snapshot) => {
      const newExceptions = []
      let conflictFound = null

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'modified') {
          const data = change.doc.data()
          if (data.status === 'conflict_requires_resolution') {
            conflictFound = { id: change.doc.id, ...data }
          }
        }
      })

      exceptions.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value = false

      if (conflictFound) {
        console.log(`[ConflictDetector] 偵測到衝突: ${conflictFound.id}`)
        exceptionToReEdit.value = conflictFound
        conflictAlertMessage.value = `您為【${conflictFound.patientName}】申請的調班發生衝突！\n\n目標床位已被總表上的其他病人預定。\n\n請點擊「確定」為此病人重新選擇一個空床位。`
        isConflictAlertVisible.value = true
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
