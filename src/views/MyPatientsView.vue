<!-- 檔案路徑: src/views/MyPatientsView.vue (v6 - 新增 "新增交辦" 功能 - 完整無省略版) -->
<template>
  <div class="my-patients-container">
    <div class="page-header">
      <div>
        <h1 class="page-title">我的今日病人</h1>
        <p v-if="currentUser" class="page-subtitle">
          {{ currentUser.name }} / {{ todayDateString }}
        </p>
      </div>
      <div class="header-actions">
        <button
          @click="openCreateModal(null)"
          class="btn btn-primary"
          :disabled="!hasPermission('viewer')"
        >
          <i class="fas fa-plus"></i> 新增交辦/留言
        </button>
        <button @click="fetchMyPatientData" :disabled="isLoading" class="btn-refresh">
          <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
          {{ isLoading ? '載入中...' : '重新整理' }}
        </button>
      </div>
    </div>

    <div v-if="isLoading && !hasAnyPatients" class="status-panel">
      <div class="spinner"></div>
      <p>正在為您準備今日的病人照護列表...</p>
    </div>

    <div v-else-if="!hasAnyPatients" class="status-panel">
      <i class="fas fa-check-circle icon-success"></i>
      <p>您今天沒有被分配到照護病人，或班表尚未更新。</p>
    </div>

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
                  <!-- ✨ 核心修改: 加上 data-label 屬性 -->
                  <td data-label="床位">{{ patient.bedNum }}</td>
                  <td
                    data-label="姓名"
                    class="patient-name clickable"
                    @click="openOrderModal(patient)"
                    title="點擊以編輯此病人醫囑"
                  >
                    {{ patient.name }}
                  </td>
                  <td data-label="AK">{{ patient.preparation.ak }}</td>
                  <td data-label="Ca">{{ patient.preparation.dialysateCa }}</td>
                  <td data-label="Heparin">{{ patient.preparation.heparin }}</td>
                  <td data-label="BF">{{ patient.preparation.bloodFlow }}</td>
                  <td data-label="通路/穿刺針">{{ patient.preparation.vascAccess }}</td>
                  <td data-label="須施打藥物">
                    <ul v-if="patient.injections.length > 0" class="info-list">
                      <li v-for="injection in patient.injections" :key="injection.orderCode">
                        {{ formatInjection(injection) }}
                      </li>
                    </ul>
                    <span v-else class="no-data">–</span>
                  </td>
                  <td data-label="交班備忘">
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

    <!-- ... 其他 Dialog 元件維持不變 ... -->
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
    <DialysisOrderModal
      :is-visible="isOrderModalVisible"
      :patient-data="selectedPatientForOrder"
      @close="closeOrderModal"
      @save="handleOrderSave"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMyPatientList } from '@/composables/useMyPatientList.js'
import { useAuth } from '@/composables/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier'
import { doc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/composables/useFirebase'
import TaskCreateDialog from '@/components/TaskCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
// ✨ 核心修正：引入我們剛剛建立的共用函式
import { handleTaskCreated } from '@/utils/taskHandlers.js'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue' // ✨ 1. 引入醫囑元件

// --- 初始化 Composables 和 Stores ---
const { isLoading, patientListByShift, fetchMyPatientData } = useMyPatientList()
const { currentUser, hasPermission } = useAuth()
const patientStore = usePatientStore()
const { createGlobalNotification } = useGlobalNotifier()

// --- 藥品對照表和轉換函式 ---
const INJECTION_MEDS_MASTER = [
  { code: 'INES2', tradeName: 'NESP', unit: 'mcg' },
  { code: 'IREC1', tradeName: 'Recormon', unit: 'KIU' },
  { code: 'IFER2', tradeName: 'Fe-back', unit: 'mg' },
  { code: 'ICAC', tradeName: 'Cacare', unit: 'amp' },
  { code: 'IPAR1', tradeName: 'Parsabiv', unit: 'mg' },
]
const injectionTradeNameMap = new Map(INJECTION_MEDS_MASTER.map((med) => [med.code, med.tradeName]))

function formatInjection(injection) {
  const displayName =
    injectionTradeNameMap.get(injection.orderCode) || injection.orderName || '未知藥品'
  const parts = [
    displayName,
    `${injection.dose || ''} ${injection.unit || ''}`.trim(),
    injection.note || '',
  ]
  return parts.filter((part) => part).join(' / ')
}

// --- Dialog 狀態管理 ---
const isCreateModalVisible = ref(false)
const editingItem = ref(null)
const isConfirmDeleteVisible = ref(false)
const itemToDelete = ref(null)
const isOrderModalVisible = ref(false)
const selectedPatientForOrder = ref(null)

// --- Computed Properties ---
const todayDateString = computed(() =>
  new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }),
)
const hasAnyPatients = computed(() => {
  if (!patientListByShift.value) return false
  return Object.values(patientListByShift.value).some((list) => list.length > 0)
})

// --- 輔助函式 ---
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

// --- 事件處理函式 ---

// 開啟「新增/編輯」Dialog
function openCreateModal(itemToEdit = null) {
  if (!hasPermission('viewer')) {
    createGlobalNotification('您的權限不足，無法執行此操作。', 'error')
    return
  }
  editingItem.value = itemToEdit
  isCreateModalVisible.value = true
}

// 關閉「新增/編輯」Dialog
function closeCreateModal() {
  isCreateModalVisible.value = false
  editingItem.value = null
}

// 處理 Dialog 送出的事件 (可能是新增或編輯)
async function handleTaskSubmit(data) {
  if (data.id) {
    // 編輯模式
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
  } else {
    // 新增模式
    try {
      await handleTaskCreated(data, currentUser.value)
      createGlobalNotification('交辦/留言已成功新增！', 'success')
    } catch (error) {
      console.error('新增項目失敗:', error)
      createGlobalNotification(`新增失敗: ${error.message}`, 'error')
    }
  }
  closeCreateModal()
}

// 更新任務狀態 (例如：已讀)
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

// 開啟「刪除確認」Dialog
function confirmDeleteTask(item) {
  itemToDelete.value = item
  isConfirmDeleteVisible.value = true
}

// 執行刪除
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

// 為了方便，我們把 openEditModal 也定義一下
function openEditModal(itemToEdit) {
  openCreateModal(itemToEdit)
}

// ✨ 3. 新增開啟醫囑 Modal 的函式
function openOrderModal(patientFromList) {
  // 從 patientStore 中找到最完整的病人資料，因為列表上的 patient 物件可能經過簡化
  const fullPatientData = patientStore.allPatients.find((p) => p.id === patientFromList.patientId)
  if (fullPatientData) {
    selectedPatientForOrder.value = fullPatientData
    isOrderModalVisible.value = true
  } else {
    console.error('找不到完整的病人資料:', patientFromList.patientId)
    createGlobalNotification('無法載入病人醫囑，請稍後再試', 'error')
  }
}

// ✨ 4. 新增關閉和儲存醫囑的處理函式
function closeOrderModal() {
  isOrderModalVisible.value = false
  selectedPatientForOrder.value = null
}

async function handleOrderSave(updatedOrders) {
  if (!selectedPatientForOrder.value) return

  const patientRef = doc(db, 'patients', selectedPatientForOrder.value.id)
  const historyRef = collection(db, 'dialysis_order_history')

  try {
    // 步驟 1: 更新 patient 文件中的 dialysisOrders
    await updateDoc(patientRef, {
      dialysisOrders: updatedOrders,
    })

    // 步驟 2: 新增一筆歷史紀錄
    await addDoc(historyRef, {
      patientId: selectedPatientForOrder.value.id,
      patientName: selectedPatientForOrder.value.name,
      orders: updatedOrders,
      updatedBy: currentUser.value?.name || '未知使用者',
      updatedAt: serverTimestamp(),
    })

    createGlobalNotification(`${selectedPatientForOrder.value.name} 的醫囑已更新`, 'success')

    // 手動更新 store 中的資料，讓畫面即時反應
    patientStore.updatePatientOrders(selectedPatientForOrder.value.id, updatedOrders)

    closeOrderModal()
  } catch (error) {
    console.error('儲存醫囑失敗:', error)
    createGlobalNotification('醫囑儲存失敗，請檢查網路連線', 'error')
  }
}
</script>

<style scoped>
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */
.my-patients-container {
  padding: 10px;
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
  font-size: 32px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0;
}

.page-subtitle {
  font-size: 1rem;
  color: #6c757d;
  margin: 0.25rem 0 0 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border: none;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  background-color: #6c757d;
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
  background-color: #5a6268;
}

.btn-refresh:disabled {
  background-color: #adb5bd;
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
  background-color: #f8f9fa;
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
  background-color: #f0f3f5;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 5;
}

.patient-table td:nth-child(1),
.patient-table td:nth-child(2) {
  background-color: #f7faff;
}
.patient-table td:nth-child(n + 3):nth-child(-n + 7) {
  background-color: #f8fcf8;
}

.patient-table tbody tr:hover td {
  background-color: #f1f7ff;
}

.patient-name {
  font-weight: 500;
}

.patient-name.clickable {
  cursor: pointer;
  color: #0056b3;
  text-decoration: underline;
  text-decoration-color: transparent;
  transition: text-decoration-color 0.2s;
}

.patient-name.clickable:hover {
  text-decoration-color: #0056b3;
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

.col-bed {
  width: 4%;
}
.col-name {
  width: 7%;
}
.col-prep {
  width: 5%;
}
.col-access {
  width: 10%;
}
.col-meds {
  width: 15%;
}
.col-memos {
  width: 54%;
}

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

/* ================================== */
/*         ✨✨ 行動版優化 ✨✨         */
/* ================================== */
@media (max-width: 768px) {
  .my-patients-container {
    padding: 8px;
  }

  .page-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .page-title {
    font-size: 2rem;
  }

  .header-actions {
    justify-content: space-between;
  }

  .header-actions .btn {
    flex-grow: 1;
    justify-content: center;
  }

  .shift-title {
    font-size: 1.2rem;
  }

  .table-wrapper {
    border: none;
    overflow-x: visible;
  }

  /* --- 核心: 表格轉卡片 --- */
  .patient-table {
    border: none;
  }

  .patient-table thead {
    /* 隱藏桌面版的表頭 */
    display: none;
  }

  .patient-table tr {
    /* 每一個 tr 變成一張卡片 */
    display: block;
    margin-bottom: 1rem;
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background-color: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .patient-table td {
    /* 每一個 td 變成一行 */
    display: block;
    text-align: right; /* 資料靠右 */
    padding-left: 50%; /* 留出左半邊給標籤 */
    position: relative;
    border: none;
    border-bottom: 1px solid #f0f0f0;
    background-color: transparent !important; /* 取消分區顏色 */
  }

  .patient-table tr td:last-child {
    border-bottom: none;
  }

  /* 使用 ::before 偽元素來顯示標籤 */
  .patient-table td::before {
    content: attr(data-label); /* 讀取 data-label 的內容 */
    position: absolute;
    left: 15px;
    width: calc(50% - 25px);
    text-align: left; /* 標籤靠左 */
    font-weight: bold;
    color: #333;
  }

  /* --- 針對特殊欄位微調 --- */

  /* 姓名欄位特別樣式 */
  .patient-table td[data-label='姓名'] {
    font-size: 1.1rem;
    font-weight: bold;
    background-color: #f8f9fa;
  }

  /* 藥物和備忘欄位內容靠左對齊 */
  .patient-table td[data-label='須施打藥物'],
  .patient-table td[data-label='交班備忘'] {
    text-align: left;
    padding-top: 2.5rem; /* 給標題留出空間 */
    padding-left: 15px;
  }
  .patient-table td[data-label='須施打藥物']::before,
  .patient-table td[data-label='交班備忘']::before {
    top: 12px;
  }
}
</style>
