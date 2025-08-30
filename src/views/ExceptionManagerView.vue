<!-- 檔案路徑: src/views/ExceptionManagerView.vue (Pinia 遷移版) -->
<template>
  <div class="page-container">
    <!-- 頁首區域保持不變，包含標題和新增按鈕 -->
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
        此處用於處理「臨時調班」、「區間暫停」或「臨時加洗」等特殊情況。此處建立的申請將會自動更新對應日期的排班表。
      </p>
    </header>

    <!-- 主要內容區域 -->
    <main class="page-main-content">
      <div class="exceptions-list-container">
        <!-- ✨ --- 【新增/取代】自訂日曆導航列 --- ✨ -->
        <div class="custom-calendar-header">
          <div class="date-navigator">
            <button @click="handlePrev">&lt;</button>
            <span class="calendar-title-text">{{ calendarTitle }}</span>
            <button @click="handleNext">&gt;</button>
          </div>
          <div class="view-actions">
            <button @click="handleToday">今天</button>
            <button @click="handleViewChange('dayGridMonth')">月</button>
            <button @click="handleViewChange('dayGridWeek')">週</button>
          </div>
        </div>

        <!-- 狀態一：正在載入資料 -->
        <div v-if="isLoading" class="loading-state">正在載入調班申請資料...</div>

        <!-- 狀態二：載入完成後，顯示日曆或無資料提示 -->
        <div v-else class="calendar-wrapper">
          <!-- ✨ --- 【修改】加上 ref="fullCalendar" 來獲取元件實例 --- ✨ -->
          <FullCalendar ref="fullCalendar" :options="calendarOptions" />

          <!-- 如果沒有任何調班資料，在日曆下方顯示提示訊息 -->
          <div v-if="!isLoading && exceptions.length === 0" class="empty-state">
            <i class="fas fa-check-circle"></i>
            <p>目前沒有任何待處理或已生效的調班。</p>
          </div>
        </div>
      </div>
    </main>

    <!-- 手機版新增按鈕 (FAB) 保持不變 -->
    <button class="fab mobile-only" @click="openCreateDialog" :disabled="isPageLocked">
      <i class="fas fa-plus"></i>
    </button>

    <!-- 所有彈出視窗 (Dialogs) 元件都保持不變 -->
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
    <!-- 用於顯示日曆事件詳細資訊的 AlertDialog -->
    <AlertDialog
      :is-visible="isInfoAlertVisible"
      :title="infoAlertTitle"
      :message="infoAlertMessage"
      @confirm="closeInfoAlert"
    />
  </div>
</template>

<script setup>
import { ref, onUnmounted, watch, computed, nextTick } from 'vue' // ✨ onMounted 已不再需要
import { useRouter, useRoute } from 'vue-router'
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { useRealtimeNotifications } from '@/composables/useRealtimeNotifications.js'
import ExceptionCreateDialog from '@/components/ExceptionCreateDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import interactionPlugin from '@fullcalendar/interaction'
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'

import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore)

const exceptionsApi = ApiManager('schedule_exceptions')
const memosApi = ApiManager('memos')
const router = useRouter()
const route = useRoute()
const { createGlobalNotification } = useGlobalNotifier()
const { addLocalNotification } = useRealtimeNotifications()

const { currentUser, canEditSchedules } = useAuth()
const isPageLocked = computed(() => !canEditSchedules.value)

const exceptions = ref([])
const isLoading = ref(true) // 初始為 true
const isCreateDialogVisible = ref(false)
const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)
const exceptionToReEdit = ref(null)
const isConflictAlertVisible = ref(false)
const conflictAlertMessage = ref('')
const isInfoAlertVisible = ref(false)
const infoAlertTitle = ref('')
const infoAlertMessage = ref('')

let unsubscribe = null

const fullCalendar = ref(null)
const calendarApi = ref(null)
const calendarTitle = ref('')

const statusMap = {
  pending: '待處理',
  processing: '處理中',
  applied: '已生效',
  error: '錯誤',
  expired: '已過期',
  conflict_requires_resolution: '衝突待解決',
}
const typeMap = {
  MOVE: '臨時調班',
  SUSPEND: '區間暫停',
  ADD_SESSION: '臨時加洗',
  RANGE_MOVE: '區間調班',
}
const shiftMap = { early: '早班', noon: '午班', late: '晚班' }

const calendarEvents = computed(() => {
  if (!exceptions.value) return []
  return exceptions.value.flatMap((ex) => {
    const colorMap = {
      MOVE: '#17a2b8',
      SUSPEND: '#6610f2',
      ADD_SESSION: '#20c977',
      RANGE_MOVE: '#e83e8c',
    }
    let description = ''
    if (ex.type === 'MOVE' && ex.from && ex.to) {
      description = `從 ${formatShiftInfo({ ...ex.from, date: ex.from.sourceDate })} 移至 ${formatShiftInfo({ ...ex.to, date: ex.to.goalDate })}`
    } else if (ex.type === 'ADD_SESSION' && ex.to) {
      description = `新增於 ${formatShiftInfo({ ...ex.to, date: ex.to.goalDate })}`
    } else if (ex.type === 'RANGE_MOVE' && ex.to) {
      description = `區間內移至: ${formatBedAndShift(ex.to)}`
    } else {
      description = ex.reason
    }
    if (ex.type === 'MOVE' && ex.from && ex.to) {
      const fromEvent = {
        id: `${ex.id}-from`,
        title: `[原班] ${ex.patientName}`,
        start: ex.from.sourceDate,
        allDay: true,
        backgroundColor: '#adb5bd',
        borderColor: '#adb5bd',
        extendedProps: { ...ex, formattedDetails: description },
      }
      const toEvent = {
        id: ex.id,
        title: `[新班] ${ex.patientName} - 調班`,
        start: ex.to.goalDate,
        allDay: true,
        backgroundColor: colorMap.MOVE,
        borderColor: colorMap.MOVE,
        extendedProps: { ...ex, formattedDetails: description },
      }
      return [fromEvent, toEvent]
    }
    let exclusiveEndDate = null
    if (ex.endDate && ex.endDate !== ex.startDate) {
      const endDateObj = new Date(ex.endDate + 'T00:00:00Z')
      endDateObj.setUTCDate(endDateObj.getUTCDate() + 1)
      exclusiveEndDate = endDateObj.toISOString().split('T')[0]
    }
    return [
      {
        id: ex.id,
        title: `${ex.patientName} - ${typeMap[ex.type] || '未知'}`,
        start: ex.startDate,
        end: exclusiveEndDate,
        allDay: true,
        backgroundColor: colorMap[ex.type] || '#6c757d',
        borderColor: colorMap[ex.type] || '#6c757d',
        extendedProps: { ...ex, formattedDetails: description },
      },
    ]
  })
})

const calendarOptions = computed(() => {
  return {
    plugins: [dayGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    locale: zhTwLocale,
    headerToolbar: false,
    events: calendarEvents.value,
    eventDisplay: 'block',
    datesSet: (arg) => {
      calendarTitle.value = arg.view.title
    },
    eventClick: (info) => {
      const ex = info.event.extendedProps
      infoAlertTitle.value = '調班詳細資訊'
      infoAlertMessage.value =
        `病患: ${ex.patientName}\n` +
        `類型: ${typeMap[ex.type] || '未知'}\n` +
        `區間: ${ex.startDate} ~ ${ex.endDate}\n` +
        `詳細: ${ex.formattedDetails}\n` +
        `申請時間: ${formatTimestamp(ex.createdAt)}`
      isInfoAlertVisible.value = true
    },
  }
})

function handlePrev() {
  calendarApi.value?.prev()
}
function handleNext() {
  calendarApi.value?.next()
}
function handleToday() {
  calendarApi.value?.today()
}
function handleViewChange(viewName) {
  calendarApi.value?.changeView(viewName)
}

function closeInfoAlert() {
  isInfoAlertVisible.value = false
}

// --- Methods ---
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

function formatShiftInfo(shiftData) {
  if (!shiftData) return ''
  const shiftName = shiftMap[shiftData.shiftCode] || shiftData.shiftCode
  const bedDisplay = String(shiftData.bedNum).startsWith('peripheral-')
    ? `外圍 ${String(shiftData.bedNum).split('-')[1]}`
    : `${shiftData.bedNum}床`
  return `${shiftData.date || ''} (${shiftName} ${bedDisplay})`
}

function formatBedAndShift(targetData) {
  if (!targetData || !targetData.bedNum || !targetData.shiftCode) return 'N/A'
  const shiftName = shiftMap[targetData.shiftCode] || targetData.shiftCode
  const bedDisplay = String(targetData.bedNum).startsWith('peripheral-')
    ? `外圍 ${String(targetData.bedNum).split('-')[1]}`
    : `${targetData.bedNum}床`
  return `${bedDisplay} / ${shiftName}`
}

function openCreateDialog() {
  if (isPageLocked.value) return
  exceptionToReEdit.value = null
  isCreateDialogVisible.value = true
}

function closeCreateDialog() {
  isCreateDialogVisible.value = false
  setTimeout(() => {
    exceptionToReEdit.value = null
  }, 300)
}

async function handleCreateException(formData) {
  try {
    const isUpdating = !!formData.id
    if (isUpdating) {
      await deleteDoc(doc(db, 'schedule_exceptions', formData.id))
    }
    const dataToSave = {
      patientId: formData.patientId,
      patientName: formData.patientName,
      type: formData.type,
      reason: formData.reason,
      startDate: formData.startDate,
      endDate: formData.endDate,
      from: formData.from,
      to: formData.to,
      status: 'pending',
      createdAt: new Date(),
    }
    await exceptionsApi.save(dataToSave)
    closeCreateDialog()
    const actionText = isUpdating ? '更新' : '新增'
    const typeText = typeMap[formData.type] || '調班'
    const message = `${actionText}申請: ${formData.patientName} (${typeText})`
    createGlobalNotification(message, 'exception', { routePath: '/exception-manager' })
    let memoContent = ''
    const reasonText = `\n原因: ${formData.reason}`
    switch (formData.type) {
      case 'MOVE':
        const fromBedDisplay = formatBedAndShift(formData.from)
        const toBedDisplay = formatBedAndShift(formData.to)
        memoContent =
          `【${isUpdating ? '更新-臨時調班' : '臨時調班'}】\n原排班: ${formData.from.sourceDate} (${fromBedDisplay})\n新排班: ${formData.to.goalDate} (${toBedDisplay})` +
          reasonText
        break
      case 'SUSPEND':
        memoContent = `【區間暫停】\n從 ${formData.startDate} 至 ${formData.endDate}` + reasonText
        break
      case 'ADD_SESSION':
        const addBedDisplay = formatBedAndShift(formData.to)
        memoContent = `【臨時加洗】\n日期: ${formData.to.goalDate} (${addBedDisplay})` + reasonText
        break
      case 'RANGE_MOVE':
        const targetBedDisplay = formatBedAndShift(formData.to)
        memoContent =
          `【區間調班】\n區間: ${formData.startDate} ~ ${formData.endDate}\n目標: 全部移至 ${targetBedDisplay}` +
          reasonText
        break
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
    }
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
      const typeText = typeMap[exceptionData.type] || '調班'
      const message = `撤銷調班申請: ${exceptionData.patientName} (${typeText})`
      createGlobalNotification(message, 'exception', { routePath: '/exception-manager' })
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

async function initializePageData() {
  if (unsubscribe) {
    unsubscribe()
    unsubscribe = null
  }
  isLoading.value = true
  try {
    await patientStore.fetchPatientsIfNeeded()
    const q = query(collection(db, 'schedule_exceptions'), orderBy('createdAt', 'desc'))
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        exceptions.value = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        isLoading.value = false // ✨ 資料載入完成後，設定 isLoading 為 false
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

// --- Watchers & Lifecycle Hooks ---

// ✨ --- 【最終修正】移除 onMounted，改為監聽 isLoading --- ✨
watch(isLoading, (newIsLoading) => {
  // 當 isLoading 從 true 變為 false 時
  if (!newIsLoading) {
    // 使用 nextTick 確保 DOM 已經更新完畢
    nextTick(() => {
      if (fullCalendar.value) {
        calendarApi.value = fullCalendar.value.getApi()
        if (calendarApi.value) {
          // 立即設定一次初始標題
          calendarTitle.value = calendarApi.value.view.title
        } else {
          console.error('無法獲取 FullCalendar API。')
        }
      } else {
        console.error('找不到 FullCalendar 元件的 ref。')
      }
    })
  }
})

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
        console.log(`正在打開衝突解決對話框 for ID: ${conflictId}`)
        exceptionToReEdit.value = conflictException
        isCreateDialogVisible.value = true
        router.replace({ query: {} })
      } else {
        console.warn(`URL 帶有 conflictId ${conflictId}，但在列表中找不到對應的調班申請。`)
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
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */
.page-container {
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  padding: 0.5rem;
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

/* ================================== */
/* ✨      自訂日曆標題列 新增樣式      ✨ */
/* ================================== */
.custom-calendar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  flex-wrap: wrap; /* 在小螢幕換行 */
  gap: 1rem; /* 新增間距 */
}

.date-navigator {
  display: flex;
  align-items: center;
  gap: 0.75rem; /* 調整按鈕和標題間距 */
}

.calendar-title-text {
  font-weight: 600; /* 加粗 */
  font-size: 1.75rem; /* 加大字體 */
  color: #343a40;
  white-space: nowrap;
}

.view-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.custom-calendar-header button {
  padding: 0.5rem 1rem;
  border: 1px solid #ced4da; /* 統一邊框顏色 */
  border-radius: 6px;
  cursor: pointer;
  background-color: #f8f9fa;
  font-weight: 500;
  transition: all 0.2s;
}

.custom-calendar-header button:hover {
  border-color: #868e96;
  background-color: #e9ecef;
}

/* 調整日曆容器的上邊距 */
.calendar-wrapper {
  padding-top: 0; /* 因為標題列已有 padding，這裡歸零 */
}

/* ================================== */
/* ✨      FullCalendar 內部樣式      ✨ */
/* ================================== */
/* 使用 :deep() 來修改 FullCalendar 子元件的樣式 */
:deep(.fc) {
  font-family: inherit; /* 繼承父層的字體，保持一致性 */
}
:deep(.fc-daygrid-event) {
  cursor: pointer;
  border-radius: 4px;
  padding: 3px 5px;
  font-size: 0.85em;
  font-weight: 500;
  border: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
:deep(.fc-event:hover) {
  opacity: 0.85;
}
:deep(.fc-day-today) {
  background-color: #eaf6ff !important; /* 凸顯今天的日期 */
}

/* ================================== */
/*         響應式樣式 (既有)            */
/* ================================== */
.fab.mobile-only {
  display: none;
}
.btn.desktop-only {
  display: inline-flex;
}

@media (max-width: 992px) {
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
  .calendar-title-text {
    font-size: 1.25rem;
  }
}
</style>
