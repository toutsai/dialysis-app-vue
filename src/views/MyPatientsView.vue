<!-- 檔案路徑: src/views/MyPatientsView.vue (v4 - 班別分區美化版 - 完整無省略) -->
<template>
  <div class="my-patients-container">
    <div class="page-header">
      <div>
        <h1 class="page-title">我的今日病人</h1>
        <!-- ✨ 新增：個人化副標題 -->
        <p v-if="currentUser" class="page-subtitle">
          {{ currentUser.name }} / {{ todayDateString }}
        </p>
      </div>
      <button @click="fetchMyPatientData" :disabled="isLoading" class="btn-refresh">
        <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
        {{ isLoading ? '載入中...' : '重新整理' }}
      </button>
    </div>

    <!-- 載入中狀態 -->
    <div v-if="isLoading && !hasAnyPatients" class="status-panel">
      <div class="spinner"></div>
      <p>正在為您準備今日的病人照護列表...</p>
    </div>

    <!-- 沒有病人的狀態 -->
    <div v-else-if="!hasAnyPatients" class="status-panel">
      <i class="fas fa-check-circle icon-success"></i>
      <p>您今天沒有被分配到照護病人，或班表尚未更新。</p>
    </div>

    <!-- ✨ 核心修正：使用 v-for 遍歷分組後的 patientListByShift 物件 -->
    <div v-else class="tables-container">
      <template v-for="(shiftPatients, shiftCode) in patientListByShift" :key="shiftCode">
        <div v-if="shiftPatients.length > 0" class="shift-table-section">
          <h2 class="shift-title">{{ getShiftTitle(shiftCode) }}</h2>
          <div class="table-wrapper">
            <table class="patient-table">
              <thead>
                <tr>
                  <th class="col-bed">床位</th>
                  <th class="col-name">姓名</th>
                  <th class="col-prep">AK</th>
                  <th class="col-prep">Ca</th>
                  <th class="col-prep">Heparin</th>
                  <th class="col-prep">BF</th>
                  <th class="col-access">通路/穿刺針</th>
                  <th class="col-meds">須施打藥物</th>
                  <th class="col-memos">交班備忘</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="patient in shiftPatients" :key="patient.id">
                  <td>{{ patient.bedNum }}</td>
                  <td class="patient-name">{{ patient.name }}</td>
                  <td>{{ patient.preparation.ak }}</td>
                  <td>{{ patient.preparation.dialysateCa }}</td>
                  <td>{{ patient.preparation.heparin }}</td>
                  <td>{{ patient.preparation.bloodFlow }}</td>
                  <td>{{ patient.preparation.vascAccess }}</td>
                  <td>
                    <ul v-if="patient.injections.length > 0" class="info-list">
                      <li
                        v-for="(med, index) in patient.injections"
                        :key="`${patient.id}-med-${index}`"
                      >
                        {{ med }}
                      </li>
                    </ul>
                    <span v-else class="no-data">–</span>
                  </td>
                  <td>
                    <ul v-if="patient.memos.length > 0" class="info-list memo-list">
                      <li v-for="memo in patient.memos" :key="memo.id" class="memo-item">
                        <div class="memo-content">
                          <span class="memo-icon" :title="memo.type || '一般'">{{
                            getMessageTypeIcon(memo.type)
                          }}</span>
                          <span v-if="memo.targetDate" class="memo-date"
                            >[{{ memo.targetDate.slice(5) }}]</span
                          >
                          {{ memo.content }}
                        </div>
                        <div class="memo-actions">
                          <button @click="openEditModal(memo)" title="編輯">
                            <i class="fas fa-edit"></i>
                          </button>
                          <button @click="confirmDeleteTask(memo)" title="刪除">
                            <i class="fas fa-trash"></i>
                          </button>
                          <button
                            v-if="memo.type !== '衛教'"
                            @click="updateTaskStatus(memo, 'completed')"
                            class="btn-complete"
                            title="標示已讀"
                          >
                            <i class="fas fa-check"></i> 已讀
                          </button>
                          <span v-else class="education-task-tag" title="衛教事項"
                            ><i class="fas fa-chalkboard-teacher"></i
                          ></span>
                        </div>
                      </li>
                    </ul>
                    <span v-else class="no-data">–</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>

    <!-- Dialogs -->
    <TaskCreateDialog
      :is-visible="isCreateModalVisible"
      :all-patients="patientStore.allPatients"
      :initial-data="editingItem"
      @close="closeCreateModal"
      @submit="handleTaskSubmit"
    />
    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      title="確認刪除"
      message="您確定要永久刪除此項目嗎？此操作無法復原。"
      confirm-text="刪除"
      cancel-text="取消"
      confirm-class="btn-danger"
      @confirm="executeDeleteTask"
      @cancel="isConfirmDeleteVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMyPatientList } from '@/composables/useMyPatientList.js'
import { useAuth } from '@/composables/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier'
import { doc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// 接收從 composable 來的分組後物件
const { isLoading, patientListByShift, fetchMyPatientData } = useMyPatientList()
const { currentUser, hasPermission } = useAuth()
const patientStore = usePatientStore()
const { createGlobalNotification } = useGlobalNotifier()

// 管理 Dialog 狀態的 refs
const isCreateModalVisible = ref(false)
const editingItem = ref(null)
const isConfirmDeleteVisible = ref(false)
const itemToDelete = ref(null)

// 計算屬性
const todayDateString = computed(() =>
  new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }),
)
const hasAnyPatients = computed(() => {
  if (!patientListByShift.value) return false
  return Object.values(patientListByShift.value).some((list) => list.length > 0)
})

// 輔助函式
const getShiftTitle = (shiftCode) => {
  const map = {
    early: '早班 (主責)',
    noonOn: '午班 (上針)',
    noonOff: '午班 (收針)',
    late: '晚班 (主責)',
  }
  return map[shiftCode] || shiftCode
}

function getMessageTypeIcon(type) {
  switch (type) {
    case '抽血':
      return '🩸'
    case '衛教':
      return '📢'
    case '常規':
    default:
      return '📝'
  }
}

// 處理任務狀態更新的函式
async function updateTaskStatus(task, newStatus) {
  if (!currentUser.value) return
  try {
    const collectionName = task.isLegacy ? 'memos' : 'tasks'
    const taskRef = doc(db, collectionName, task.id)
    await updateDoc(taskRef, {
      status: newStatus,
      resolvedBy: { uid: currentUser.value.uid, name: currentUser.value.name },
      resolvedAt: new Date(),
    })
    createGlobalNotification(
      newStatus === 'completed' ? '狀態已更新為已讀' : '狀態已移回待辦',
      'success',
    )
  } catch (error) {
    console.error('更新任務狀態失敗:', error)
    createGlobalNotification('更新失敗，請稍後再試', 'error')
  }
}

// 處理刪除的函式
function confirmDeleteTask(item) {
  itemToDelete.value = item
  isConfirmDeleteVisible.value = true
}

async function executeDeleteTask() {
  if (!itemToDelete.value) return
  const collectionName = itemToDelete.value.isLegacy ? 'memos' : 'tasks'
  const taskRef = doc(db, collectionName, itemToDelete.value.id)
  try {
    await deleteDoc(taskRef)
    createGlobalNotification('訊息已刪除', 'info')
  } catch (error) {
    console.error('刪除任務失敗:', error)
    createGlobalNotification('刪除失敗，請稍後再試', 'error')
  }
  isConfirmDeleteVisible.value = false
  itemToDelete.value = null
}

// 處理編輯/新增 Dialog 的函式
function openEditModal(itemToEdit) {
  if (!hasPermission('viewer')) return
  editingItem.value = itemToEdit
  isCreateModalVisible.value = true
}

function closeCreateModal() {
  isCreateModalVisible.value = false
  editingItem.value = null
}

async function handleTaskSubmit(data) {
  if (data.id) {
    const collectionName = data.isLegacy ? 'memos' : 'tasks'
    const taskRef = doc(db, collectionName, data.id)
    const { id, isLegacy, ...updateData } = data
    try {
      await updateDoc(taskRef, updateData)
      createGlobalNotification('備忘已更新', 'success')
    } catch (error) {
      console.error('更新項目失敗:', error)
      createGlobalNotification('更新失敗，請稍後再試', 'error')
    }
  }
  closeCreateModal()
}
</script>

<style scoped>
.my-patients-container {
  padding: 1.5rem;
  background-color: #f8f9fa;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.page-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin: 0;
}

.page-subtitle {
  font-size: 1rem;
  color: #6c757d;
  margin: 0.25rem 0 0 0;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-refresh:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.status-panel {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
  border-radius: 8px;
  padding: 2rem;
  color: #6c757d;
  font-size: 1.1rem;
}

.icon-success {
  font-size: 3rem;
  color: #28a745;
  margin-bottom: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
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

.tables-container {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
}

.shift-table-section {
  margin-bottom: 2.5rem;
}

.shift-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #343a40;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #007bff;
  position: sticky;
  top: 0;
  background-color: #f8f9fa; /* Add background to prevent content overlap on scroll */
  z-index: 10;
}

.table-wrapper {
  overflow-x: auto;
  background-color: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}

.patient-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.patient-table th,
.patient-table td {
  border: 1px solid #dee2e6;
  padding: 12px 15px;
  text-align: center;
  vertical-align: middle;
}

.patient-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 5;
}

.patient-table tbody tr:hover {
  background-color: #f1f7ff;
}

.patient-name {
  font-weight: 500;
}

.info-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.no-data {
  color: #adb5bd;
}

/* 欄位寬度 */
.col-shift {
  width: 8%;
}
.col-bed {
  width: 6%;
}
.col-name {
  width: 8%;
}
.col-prep {
  width: 7%;
}
.col-access {
  width: 12%;
}
.col-meds {
  width: 18%;
}
.col-memos {
  width: 30%;
}

/* 交班備忘樣式 */
.memo-list {
  gap: 8px;
}
.memo-item {
  position: relative;
  padding: 8px 12px;
  background-color: #fff9e6;
  border-left: 3px solid #ffc107;
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.memo-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-grow: 1;
  word-break: break-all;
}
.memo-icon {
  font-size: 1.2rem;
}
.memo-date {
  font-weight: bold;
  color: #007bff;
  white-space: nowrap;
}
.memo-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.memo-actions button {
  background: none;
  border: none;
  cursor: pointer;
  color: #6c757d;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}
.memo-actions button:hover {
  background-color: #e9ecef;
  color: #212529;
}
.memo-actions .btn-complete {
  background-color: #007bff;
  color: white;
  padding: 4px 8px;
  font-size: 0.8rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}
.memo-actions .btn-complete:hover {
  background-color: #0056b3;
}

/* 衛教標籤樣式 */
.education-task-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  padding: 4px 10px;
  border-radius: 4px;
  background-color: #f0fdf4;
  color: #15803d;
  font-weight: 500;
}
</style>
