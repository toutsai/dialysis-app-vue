<!-- 檔案路徑: src/views/ExceptionManagerView.vue (加入 isPageLocked 權限控制) -->
<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <h1 class="page-title">排程例外管理中心</h1>
        <!-- ✨ 權限修改: 加入 :disabled="isPageLocked" -->
        <button class="btn btn-primary" @click="openCreateDialog" :disabled="isPageLocked">
          <i class="fas fa-plus-circle"></i> 新增例外申請
        </button>
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
                <span class="status-badge" :class="`status-${ex.status}`">{{
                  statusMap[ex.status] || '未知'
                }}</span>
              </td>
              <td>{{ ex.patientName }}</td>
              <td>
                <span class="type-badge" :class="`type-${ex.type}`">{{
                  typeMap[ex.type] || '未知'
                }}</span>
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
                    <!-- ✨ 核心修正：讀取 'to' 物件中的 'goalDate' -->
                    <strong>移至:</strong> {{ ex.to.goalDate }} ({{ ex.to.bedNum }}床 /
                    {{ ex.to.shiftCode }}班)
                  </div>
                  <small>原因: {{ ex.reason }}</small>
                </div>
                <div v-else>
                  {{ ex.reason }}
                </div>
              </td>
              <td>{{ formatTimestamp(ex.createdAt) }}</td>
              <td>
                <!-- ✨ 權限修改: 加入 :disabled="... || isPageLocked" -->
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

    <!-- ✨ 權限修改: 傳遞 is-page-locked prop -->
    <ExceptionCreateDialog
      :is-visible="isCreateDialogVisible"
      :all-patients="allPatients"
      :is-page-locked="isPageLocked"
      @close="isCreateDialogVisible = false"
      @submit="handleCreateException"
    />

    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      title="確認撤銷"
      message="您確定要撤銷這筆例外申請嗎？此操作可能會導致相關日期的排班恢復為總表預設值。"
      @confirm="executeDeleteException"
      @cancel="isConfirmDeleteVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import ApiManager from '@/services/api_manager.js'
import { fetchAllPatients as optimizedFetchAllPatients } from '@/services/optimizedApiService.js'
import { useAuth } from '@/composables/useAuth.js'

import ExceptionCreateDialog from '@/components/ExceptionCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const exceptionsApi = ApiManager('schedule_exceptions')
const allPatients = ref([])
const exceptions = ref([])
const isLoading = ref(true)
const isCreateDialogVisible = ref(false)

const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)

let unsubscribe = null

// ✨ --- 新增權限控制 --- ✨
const auth = useAuth()
// 使用和您其他頁面一樣的權限判斷 (canEditSchedules 內部是判斷 editor 或 admin)
const isPageLocked = computed(() => !auth.canEditSchedules.value)

const statusMap = {
  pending: '待處理',
  processing: '處理中',
  applied: '已生效',
  error: '錯誤',
  expired: '已過期',
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
  if (isPageLocked.value) return // ✨ 增加一道防線
  isCreateDialogVisible.value = true
}

async function handleCreateException(formData) {
  try {
    const dataToSave = {
      ...formData,
      status: 'pending',
      createdAt: new Date(),
    }

    // ✨ --- 核心修正 --- ✨
    // 將 save(null, dataToSave) 修改為 save(dataToSave)
    await exceptionsApi.save(dataToSave)

    console.log('✅ 例外申請已成功提交！')
    isCreateDialogVisible.value = false
  } catch (error) {
    console.error('❌ 提交例外申請失敗:', error)
  }
}

function confirmDeleteException(id) {
  if (isPageLocked.value) return // ✨ 增加一道防線
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
  return exception.endDate < today || exception.status === 'error'
}

onMounted(async () => {
  try {
    allPatients.value = await optimizedFetchAllPatients()
    const q = query(collection(db, 'schedule_exceptions'), orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(q, (snapshot) => {
      exceptions.value = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
      isLoading.value = false
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
</style>
