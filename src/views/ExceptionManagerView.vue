<!-- 檔案路徑: src/views/ExceptionManagerView.vue (最終整合修正版) -->
<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">調班管理</h1>
          <button
            class="btn btn-primary desktop-only"
            @click="openCreateDialog"
            :disabled="isPageLocked"
          >
            <i class="fas fa-plus-circle"></i> 新增調班申請
          </button>
        </div>
      </div>
      <p class="page-description">
        此處用於處理「臨時調班」或「區間暫停排程」等特殊情況。此處建立的申請將會自動更新對應日期的排班表。
      </p>
    </header>

    <main class="page-main-content">
      <div class="exceptions-list-container">
        <h2 class="section-title">目前的調班申請列表</h2>
        <div v-if="isLoading" class="loading-state">正在載入調班申請資料...</div>
        <div v-else-if="exceptions.length === 0" class="empty-state">
          <i class="fas fa-check-circle"></i>
          <p>目前沒有任何待處理或已生效的例外申請。</p>
        </div>

        <div v-else>
          <!-- 桌機版表格 -->
          <table class="exceptions-table desktop-only">
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
                    <div>{{ formatShiftInfo({ ...ex.from, date: ex.from.sourceDate }) }}</div>
                    <div>移至 {{ formatShiftInfo({ ...ex.to, date: ex.to.goalDate }) }}</div>

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

          <!-- 手機版卡片列表 -->
          <div class="exception-cards-container mobile-only">
            <div
              v-for="ex in exceptions"
              :key="ex.id"
              class="exception-card"
              :class="`status-border-${ex.status}`"
            >
              <div class="card-header">
                <div class="header-left">
                  <span class="patient-name">{{ ex.patientName }}</span>
                  <span class="type-badge" :class="`type-${ex.type}`">{{
                    typeMap[ex.type] || '未知'
                  }}</span>
                </div>
                <span class="status-badge" :class="`status-${ex.status}`">{{
                  statusMap[ex.status] || '未知'
                }}</span>
              </div>
              <div class="card-body">
                <div class="info-row">
                  <strong class="info-label">日期區間:</strong>
                  <span class="info-value">
                    {{ ex.startDate
                    }}<span v-if="ex.endDate !== ex.startDate"> ~ {{ ex.endDate }}</span>
                  </span>
                </div>
                <div class="info-row details">
                  <strong class="info-label">詳細內容:</strong>
                  <div class="info-value">
                    <div v-if="ex.type === 'MOVE' && ex.from && ex.to">
                      <div>{{ formatShiftInfo({ ...ex.from, date: ex.from.sourceDate }) }}</div>
                      <div>移至 {{ formatShiftInfo({ ...ex.to, date: ex.to.goalDate }) }}</div>

                      <small v-if="ex.status === 'error'" class="error-message"
                        >錯誤: {{ ex.errorMessage }}</small
                      >
                      <small v-else>原因: {{ ex.reason }}</small>
                    </div>
                    <div v-else>{{ ex.reason }}</div>
                  </div>
                </div>
                <div class="info-row">
                  <strong class="info-label">申請時間:</strong>
                  <span class="info-value">{{ formatTimestamp(ex.createdAt) }}</span>
                </div>
              </div>
              <div class="card-footer">
                <button
                  class="btn btn-danger btn-sm"
                  @click="confirmDeleteException(ex.id)"
                  :disabled="isActionDisabled(ex) || isPageLocked"
                >
                  <i class="fas fa-trash-alt"></i> 撤銷申請
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <button class="fab mobile-only" @click="openCreateDialog" :disabled="isPageLocked">
      <i class="fas fa-plus"></i>
    </button>

    <ExceptionCreateDialog
      :is-visible="isCreateDialogVisible"
      :all-patients="allPatients"
      :initial-data="exceptionToEdit"
      :bed-layout="bedLayout"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      @close="closeCreateDialog"
      @submit="handleExceptionSubmit"
    />
    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      title="確認撤銷"
      message="您確定要撤銷這筆調班申請嗎？此操作可能會導致相關日期的排班恢復為總表預設值。"
      @confirm="executeDeleteException"
      @cancel="isConfirmDeleteVisible = false"
    />
    <AlertDialog
      :is-visible="isConflictAlertVisible"
      title="排班衝突！"
      :message="conflictAlertMessage"
      @confirm="handleConflictAlertConfirm"
    />
  </div>
</template>

<script setup>
import { ref, onUnmounted, watch, computed, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import {
  fetchAllPatients as optimizedFetchAllPatients,
  saveException,
  saveMemo,
} from '@/services/optimizedApiService.js'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import ExceptionCreateDialog from '@/components/ExceptionCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'

// --- API & Services ---
const router = useRouter()
const route = useRoute()
const { createGlobalNotification } = useGlobalNotifier()
const { addLocalNotification } = useRealtimeNotifications()

// --- Auth ---
const { currentUser, canEditSchedules } = useAuth()
const isPageLocked = computed(() => !canEditSchedules.value)

// --- ✨ 1. [核心修正] 加回這兩個基礎常量 ---
const bedLayout = [
  1,
  2,
  3,
  5,
  6,
  7,
  8,
  9,
  11,
  12,
  13,
  15,
  16,
  17,
  18,
  19,
  21,
  22,
  23,
  25,
  26,
  27,
  28,
  29,
  31,
  32,
  33,
  35,
  36,
  37,
  38,
  39,
  51,
  52,
  53,
  55,
  56,
  57,
  58,
  59,
  61,
  62,
  63,
  65,
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
].sort((a, b) => {
  const numA = typeof a === 'number' ? a : Infinity
  const numB = typeof b === 'number' ? b : Infinity
  if (numA !== Infinity || numB !== Infinity) return numA - numB
  return String(a).localeCompare(String(b))
})
const FREQ_MAP_TO_DAY_INDEX = {
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
}

// --- Component State ---
const allPatients = ref([])
const exceptions = ref([])
const isLoading = ref(true)
const isCreateDialogVisible = ref(false)
const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)
const exceptionToEdit = ref(null) // ✨ 2. [核心修正] 統一變數名稱
const isConflictAlertVisible = ref(false)
const conflictAlertMessage = ref('')
let unsubscribe = null

// --- Data Maps ---
const statusMap = {
  pending: '待處理',
  processing: '處理中',
  applied: '已生效',
  error: '錯誤',
  expired: '已過期',
  conflict_requires_resolution: '衝突待解決',
}
const typeMap = { MOVE: '臨時調班', SUSPEND: '區間暫停' }
const shiftMap = { early: '早班', noon: '午班', late: '晚班' }

// --- Methods ---
function formatTimestamp(ts) {
  if (!ts) return 'N/A'
  const date = ts.toDate ? ts.toDate() : new Date(ts)
  if (isNaN(date.getTime())) return '無效日期'
  return date.toLocaleString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatShiftInfo(shiftData) {
  if (!shiftData) return ''
  const shiftName = shiftMap[shiftData.shiftCode] || shiftData.shiftCode
  const bedDisplay = String(shiftData.bedNum).startsWith('peripheral-')
    ? `外圍 ${String(shiftData.bedNum).split('-')[1]}`
    : `${shiftData.bedNum}床`
  return `${shiftData.date || ''} (${bedDisplay} / ${shiftName})`
}

function openCreateDialog() {
  if (isPageLocked.value) return
  exceptionToEdit.value = null // ✨ 3. [核心修正] 統一變數名稱
  isCreateDialogVisible.value = true
}

function closeCreateDialog() {
  isCreateDialogVisible.value = false
  setTimeout(() => {
    exceptionToEdit.value = null // ✨ 4. [核心修正] 統一變數名稱
  }, 300)
}

// ✨ 5. [核心修正] 整合並還原舊版成功邏輯
async function handleExceptionSubmit(formData) {
  try {
    const isUpdating = !!formData.id
    if (isUpdating) {
      // 在更新模式下，先刪除舊的 exception
      await deleteDoc(doc(db, 'schedule_exceptions', formData.id))
    }

    // 準備要儲存的新 exception 資料
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
      createdAt: serverTimestamp(), // 使用 serverTimestamp 確保資料庫時間
    }

    await saveException(dataToSave)
    closeCreateDialog()

    // --- 產生備忘錄 ---
    const getBedDisplay = (bedNum) =>
      typeof bedNum === 'string' && bedNum.startsWith('peripheral-')
        ? `外圍 ${bedNum.split('-')[1]}`
        : `${bedNum}床`
    let memoContent = ''
    if (formData.type === 'MOVE') {
      const fromShift = shiftMap[formData.from.shiftCode] || formData.from.shiftCode
      const toShift = shiftMap[formData.to.shiftCode] || formData.to.shiftCode
      const fromBedDisplay = getBedDisplay(formData.from.bedNum)
      const toBedDisplay = getBedDisplay(formData.to.bedNum)
      memoContent = `【${isUpdating ? '更新-臨時調班' : '臨時調班'}】\n原排班: ${formData.from.sourceDate} (${fromBedDisplay} / ${fromShift})\n新排班: ${formData.to.goalDate} (${toBedDisplay} / ${toShift})\n原因: ${formData.reason}`
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
        createdAt: new Date().toISOString(), // 使用 ISO 字串確保與舊版格式一致
      }
      await saveMemo(newMemo)
    }

    // --- 產生通知 ---
    const actionText = isUpdating ? '更新' : '新增'
    const typeText = formData.type === 'MOVE' ? '臨時調班' : '區間暫停'
    const message = `${actionText}調班申請: ${formData.patientName} (${typeText})`
    createGlobalNotification(message, 'info')
  } catch (error) {
    console.error('提交調班申請或建立備忘失敗:', error)
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
    const exceptionData = exceptions.value.find((ex) => ex.id === exceptionToDeleteId.value)
    await deleteDoc(doc(db, 'schedule_exceptions', exceptionToDeleteId.value))
    if (exceptionData) {
      const typeText = exceptionData.type === 'MOVE' ? '臨時調班' : '區間暫停'
      const message = `撤銷調班申請: ${exceptionData.patientName} (${typeText})`
      createGlobalNotification(message, 'warning')
    }
  } catch (error) {
    console.error('撤銷失敗:', error)
  } finally {
    isConfirmDeleteVisible.value = false
    exceptionToDeleteId.value = null
  }
}

function isActionDisabled(exception) {
  if (exception.status === 'error') return false
  const endDateStr = exception.endDate
  if (!endDateStr) return false
  const today = new Date().toISOString().split('T')[0]
  return endDateStr < today
}

function handleConflictAlertConfirm() {
  isConflictAlertVisible.value = false
  nextTick(() => {
    isCreateDialogVisible.value = true
  })
}

// --- Initialization Logic ---
async function initializePageData() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  isLoading.value = true
  try {
    allPatients.value = await optimizedFetchAllPatients()
    const q = query(collection(db, 'schedule_exceptions'), orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const newExceptions = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        const oldExceptionsMap = new Map(exceptions.value.map((ex) => [ex.id, ex]))
        newExceptions.forEach((newEx) => {
          if (newEx.status === 'conflict_requires_resolution') {
            const oldEx = oldExceptionsMap.get(newEx.id)
            if (!oldEx || oldEx.status !== 'conflict_requires_resolution') {
              addLocalNotification(
                `排程衝突：${newEx.patientName} 的申請失敗，請點此解決。`,
                'conflict',
                {
                  action: () => {
                    router.push({
                      path: '/exception-manager',
                      query: { resolveConflict: newEx.id },
                    })
                  },
                },
              )
            }
          }
        })
        exceptions.value = newExceptions
        cleanupExpiredExceptions(newExceptions)
        if (isLoading.value) {
          isLoading.value = false
        }
      },
      (error) => {
        console.error('❌ Firestore 監聽器發生錯誤:', error)
        isLoading.value = false
      },
    )
  } catch (error) {
    console.error('載入資料失敗:', error)
    isLoading.value = false
  }
}

async function cleanupExpiredExceptions(currentExceptions) {
  const todayStr = new Date().toISOString().split('T')[0]
  const expiredExceptions = currentExceptions.filter((ex) => {
    return ex.status === 'applied' && ex.endDate && ex.endDate < todayStr
  })
  if (expiredExceptions.length > 0 && canEditSchedules.value) {
    try {
      const batch = writeBatch(db)
      expiredExceptions.forEach((ex) => {
        const docRef = doc(db, 'schedule_exceptions', ex.id)
        batch.delete(docRef)
      })
      await batch.commit()
      createGlobalNotification(
        `系統自動清理了 ${expiredExceptions.length} 筆過期的調班申請`,
        'info',
      )
    } catch (error) {
      console.error('自動清理過期申請失敗:', error)
    }
  }
}

// --- Watchers & Lifecycle Hooks ---
watch(
  currentUser,
  (newUser) => {
    if (newUser) {
      initializePageData()
    } else {
      if (unsubscribe) {
        unsubscribe()
        unsubscribe = null
      }
      exceptions.value = []
      isLoading.value = false
    }
  },
  { immediate: true },
)

watch(
  () => route.query.resolveConflict,
  (conflictId) => {
    if (conflictId) {
      const conflictException = exceptions.value.find((ex) => ex.id === conflictId)
      if (conflictException) {
        exceptionToEdit.value = conflictException // ✨ 6. [核心修正] 統一變數名稱
        isCreateDialogVisible.value = true
        router.replace({ query: {} })
      } else {
        console.warn(`URL 帶有 conflictId ${conflictId}，但在列表中找不到對應的例外申請。`)
      }
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})
</script>

<style scoped>
/* 您的所有 CSS 樣式保持不變 */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');
.page-container {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  padding: 10px;
}
.page-header {
  border-bottom: 2px solid #dee2e6;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
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
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
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
  padding: 0.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow-y: auto;
  min-height: 0;
}
.section-title {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  color: #495057;
}
.exceptions-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.exceptions-table th,
.exceptions-table td {
  padding: 0.75rem 1rem;
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
  white-space: nowrap;
}
.status-pending,
.status-processing {
  background-color: #ffc107;
  color: #333;
}
.status-applied {
  background-color: #28a745;
}
.status-error,
.status-conflict_requires_resolution {
  background-color: #dc3545;
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
.error-message {
  color: #dc3545;
  font-weight: bold;
  display: block;
  margin-top: 4px;
}
.desktop-only {
  display: table;
}
.mobile-only {
  display: none;
}
@media (max-width: 992px) {
  .exceptions-table.desktop-only {
    display: none;
  }
  .exception-cards-container.mobile-only {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .fab.mobile-only {
    display: flex;
  }
  .btn.desktop-only {
    display: none;
  }
  .page-container {
    padding: 0;
  }
  .page-header {
    margin-bottom: 1rem;
    padding: 1rem 1rem 0.75rem;
    border-radius: 0;
  }
  .page-title {
    font-size: 28px;
  }
  .page-description {
    font-size: 0.9rem;
  }
  .page-main-content {
    padding: 1rem;
    border-radius: 0;
    box-shadow: none;
  }
  .section-title {
    font-size: 1.3rem;
    margin-bottom: 1rem;
  }
  .exception-card {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border-left: 5px solid #ccc;
    overflow: hidden;
  }
  .status-border-pending,
  .status-border-processing {
    border-left-color: #ffc107;
  }
  .status-border-applied {
    border-left-color: #28a745;
  }
  .status-border-error,
  .status-border-conflict_requires_resolution {
    border-left-color: #dc3545;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .patient-name {
    font-size: 1.1rem;
    font-weight: 600;
  }
  .card-body {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .info-row {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: 0.5rem;
    align-items: start;
  }
  .info-label {
    color: #6c757d;
    font-weight: bold;
  }
  .info-value {
    font-weight: 500;
  }
  .info-row.details .info-value {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .card-footer {
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
    display: flex;
    justify-content: flex-end;
  }
  .fab {
    position: fixed;
    bottom: 2rem;
    right: 1.5rem;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background-color: #007bff;
    color: white;
    border: none;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    font-size: 1.5rem;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
}
@media (max-width: 480px) {
  .page-title {
    font-size: 24px;
  }
  .page-header {
    padding: 1rem 1rem 0.5rem;
    margin-bottom: 1rem;
  }
  .info-row {
    grid-template-columns: 1fr;
    gap: 0.25rem;
  }
  .info-label {
    font-size: 0.8rem;
  }
}
</style>
