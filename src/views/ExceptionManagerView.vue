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
            <!-- ✨ 【修改】讓標題可以點擊 -->
            <span class="calendar-title-text is-clickable" @click="openMonthPicker">
              {{ calendarTitle }}
            </span>
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
    <!-- ✨ --- 【修改】我們現在只用這一個 ConfirmDialog --- ✨ -->
    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      confirm-text="撤銷"
      cancel-text="關閉"
      confirm-class="btn-danger"
      @confirm="executeDeleteException"
      @cancel="isConfirmDeleteVisible = false"
    />
    <AlertDialog
      :is-visible="isConflictAlertVisible"
      title="排班衝突！"
      :message="conflictAlertMessage"
      @confirm="handleConflictAlertConfirm"
    />
    <!-- AlertDialog 現在只用於衝突警告 -->
    <AlertDialog
      :is-visible="isConflictAlertVisible"
      title="排班衝突！"
      :message="conflictAlertMessage"
      @confirm="handleConflictAlertConfirm"
    />
    <!-- ✨ 【新增】將 MonthYearPicker 元件加到頁面中 -->
    <MonthYearPicker
      :is-visible="isMonthPickerVisible"
      :initial-date="currentCalendarDate"
      @close="isMonthPickerVisible = false"
      @date-selected="handleDateSelected"
    />
  </div>
</template>

// 檔案路徑: src/views/ExceptionManagerView.vue

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
  serverTimestamp,
} from 'firebase/firestore'
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
import MonthYearPicker from '@/components/MonthYearPicker.vue'

import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore)

const exceptionsApi = ApiManager('schedule_exceptions')
const tasksApi = ApiManager('tasks')
const router = useRouter()
const route = useRoute()
const { createGlobalNotification } = useGlobalNotifier()
const { addLocalNotification } = useRealtimeNotifications()

const { currentUser, canEditSchedules } = useAuth()
const isPageLocked = computed(() => !canEditSchedules.value)

const exceptions = ref([])
const isLoading = ref(true)
const isCreateDialogVisible = ref(false)

const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')

const exceptionToReEdit = ref(null)
const isConflictAlertVisible = ref(false)
const conflictAlertMessage = ref('')

let unsubscribe = null

const fullCalendar = ref(null)
const calendarApi = ref(null)
const calendarTitle = ref('')
const isMonthPickerVisible = ref(false)

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
  SWAP: '同日互調',
}
const shiftMap = { early: '早班', noon: '午班', late: '晚班' }

const calendarEvents = computed(() => {
  if (!exceptions.value) return []
  return exceptions.value.flatMap((ex) => {
    const colorMap = {
      MOVE: '#17a2b8',
      SUSPEND: '#6610f2',
      ADD_SESSION: '#20c997',
      RANGE_MOVE: '#e83e8c',
      SWAP: '#fd7e14',
    }

    let title = ''
    if (ex.type === 'SWAP') {
      title = `${ex.patient1?.patientName || ''} <=> ${ex.patient2?.patientName || ''}`
    } else {
      title = `${ex.patientName || ''} - ${typeMap[ex.type] || '未知'}`
    }

    let description = ''
    if (ex.type === 'MOVE' && ex.from && ex.to) {
      description = `從 ${formatShiftInfo({ ...ex.from, date: ex.from.sourceDate })} 移至 ${formatShiftInfo({ ...ex.to, date: ex.to.goalDate })}`
    } else if (ex.type === 'ADD_SESSION' && ex.to) {
      description = `新增於 ${formatShiftInfo({ ...ex.to, date: ex.to.goalDate })}`
    } else if (ex.type === 'RANGE_MOVE' && ex.to) {
      description = `區間內移至: ${formatBedAndShift(ex.to)}`
    } else if (ex.type === 'SWAP' && ex.patient1 && ex.patient2) {
      const from1 = formatBedAndShift(ex.patient1)
      const from2 = formatBedAndShift(ex.patient2)
      description = `${ex.patient1.patientName} (${from1}) 與 ${ex.patient2.patientName} (${from2}) 互換`
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
        title: title,
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
    dayMaxEvents: true,
    events: calendarEvents.value,
    eventDisplay: 'block',
    datesSet: (arg) => {
      calendarTitle.value = arg.view.title
    },
    eventClick: (info) => {
      const ex = info.event.extendedProps
      exceptionToDeleteId.value = ex.id
      let patientDisplayName = ex.patientName
      if (ex.type === 'SWAP') {
        patientDisplayName = `${ex.patient1?.patientName} & ${ex.patient2?.patientName}`
      }
      confirmDialogTitle.value = '調班詳細資訊'
      confirmDialogMessage.value =
        `病患: ${patientDisplayName}\n` +
        `類型: ${typeMap[ex.type] || '未知'}\n` +
        `區間: ${ex.startDate} ~ ${ex.endDate}\n` +
        `詳細: ${ex.formattedDetails}\n` +
        `申請時間: ${formatTimestamp(ex.createdAt)}`
      isConfirmDeleteVisible.value = true
    },
  }
})

const currentCalendarDate = computed(() => {
  return calendarApi.value ? calendarApi.value.getDate() : new Date()
})

async function scrollToCurrentWeek() {
  await nextTick()
  if (!fullCalendar.value) return
  try {
    const calendarEl = fullCalendar.value.$el
    if (!calendarEl) return
    const todayEl = calendarEl.querySelector('.fc-day-today')
    if (todayEl) {
      const weekRowEl = todayEl.closest('tr')
      if (weekRowEl) {
        weekRowEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }
  } catch (error) {
    console.error('滾動到當前週失敗:', error)
  }
}

function handlePrev() {
  calendarApi.value?.prev()
}
function handleNext() {
  calendarApi.value?.next()
}
function handleToday() {
  calendarApi.value?.today()
  scrollToCurrentWeek()
}
function handleViewChange(viewName) {
  calendarApi.value?.changeView(viewName)
}
function openMonthPicker() {
  isMonthPickerVisible.value = true
}
function handleDateSelected(newDate) {
  calendarApi.value?.gotoDate(newDate)
  isMonthPickerVisible.value = false
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
function formatShiftInfo(shiftData) {
  if (!shiftData) return ''
  const shiftName = shiftMap[shiftData.shiftCode] || shiftData.shiftCode
  const bedDisplay = String(shiftData.bedNum).startsWith('peripheral-')
    ? `外圍 ${String(shiftData.bedNum).split('-')[1]}`
    : `${shiftData.bedNum}床`
  return `${shiftData.date || ''} (${shiftName} ${bedDisplay})`
}

function formatBedAndShift(targetData) {
  if (!targetData) return 'N/A'

  // ✨ 核心修正：同時檢查 fromBedNum 和 bedNum
  const bedNum = targetData.fromBedNum || targetData.bedNum
  const shiftCode = targetData.fromShiftCode || targetData.shiftCode

  if (!bedNum || !shiftCode) return 'N/A'

  const shiftName = shiftMap[shiftCode] || shiftCode
  const bedDisplay = String(bedNum).startsWith('peripheral-')
    ? `外圍 ${String(bedNum).split('-')[1]}`
    : `${bedNum}床`

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

// ✨✨✨ 核心修正點 ✨✨✨
async function handleCreateException(formData) {
  try {
    const isUpdating = !!formData.id
    if (isUpdating) {
      await deleteDoc(doc(db, 'schedule_exceptions', formData.id))
    }

    // 準備一個乾淨的物件來儲存資料
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
      createdAt: serverTimestamp(),
    }

    // 根據不同類型，附加特定的資料
    if (formData.type === 'SWAP') {
      dataToSave.date = formData.date // <-- 確保 date 欄位被複製
      dataToSave.patient1 = formData.patient1
      dataToSave.patient2 = formData.patient2
    }

    await exceptionsApi.save(dataToSave)
    closeCreateDialog()

    // --- 建立通知和留言 ---
    const actionText = isUpdating ? '更新' : '新增'
    let message = ''
    let patientForMessage = { id: formData.patientId, name: formData.patientName }

    if (formData.type === 'SWAP') {
      message = `${actionText}申請: ${formData.patient1.patientName} 與 ${formData.patient2.patientName} (同日互調)`
      patientForMessage = { id: formData.patient1.patientId, name: formData.patient1.patientName }
    } else {
      const typeText = typeMap[formData.type] || '調班'
      message = `${actionText}申請: ${formData.patientName} (${typeText})`
    }
    createGlobalNotification(message, 'exception', { routePath: '/exception-manager' })

    let messageContent = ''
    const reasonText = `\n原因: ${formData.reason}`
    switch (formData.type) {
      case 'MOVE':
        const fromBedDisplay = formatBedAndShift(formData.from)
        const toBedDisplay = formatBedAndShift(formData.to)
        messageContent =
          `【${isUpdating ? '更新-臨時調班' : '臨時調班'}】\n原排班: ${formData.from.sourceDate} (${fromBedDisplay})\n新排班: ${formData.to.goalDate} (${toBedDisplay})` +
          reasonText
        break
      case 'SUSPEND':
        messageContent =
          `【區間暫停】\n從 ${formData.startDate} 至 ${formData.endDate}` + reasonText
        break
      case 'ADD_SESSION':
        const addBedDisplay = formatBedAndShift(formData.to)
        messageContent =
          `【臨時加洗】\n日期: ${formData.to.goalDate} (${addBedDisplay})` + reasonText
        break
      case 'SWAP':
        const swapFrom1 = formatBedAndShift(formData.patient1)
        const swapFrom2 = formatBedAndShift(formData.patient2)
        messageContent =
          `【同日互調】\n日期: ${formData.date}\n${formData.patient1.patientName} (${swapFrom1}) <=> ${formData.patient2.patientName} (${swapFrom2})` +
          reasonText
        break
    }

    if (messageContent && currentUser.value) {
      const createMessageTask = (patientInfo) => {
        return {
          category: 'message',
          type: '常規',
          content: messageContent,
          patientId: patientInfo.id,
          patientName: patientInfo.name,
          targetDate: formData.date || formData.startDate, // 使用 date 或 startDate
          status: 'pending',
          creator: {
            uid: currentUser.value.uid,
            name: currentUser.value.name,
            title: currentUser.value.title,
          },
          createdAt: serverTimestamp(),
          assignee: null,
        }
      }

      if (formData.type === 'SWAP') {
        const task1 = createMessageTask({
          id: formData.patient1.patientId,
          name: formData.patient1.patientName,
        })
        const task2 = createMessageTask({
          id: formData.patient2.patientId,
          name: formData.patient2.patientName,
        })
        await Promise.all([tasksApi.save(task1), tasksApi.save(task2)])
      } else {
        const task = createMessageTask({ id: formData.patientId, name: formData.patientName })
        await tasksApi.save(task)
      }
    }
  } catch (error) {
    console.error('提交調班申請或建立留言失敗:', error)
    addLocalNotification({
      message: `操作失敗: ${error.message || '無法儲存調班申請，請檢查後再試。'}`,
      type: 'exception',
      config: { bgColor: '#dc3545', textColor: 'white', icon: '❌' },
    })
  }
}

async function executeDeleteException() {
  if (!exceptionToDeleteId.value) return
  try {
    const exceptionData = exceptions.value.find((ex) => ex.id === exceptionToDeleteId.value)
    await deleteDoc(doc(db, 'schedule_exceptions', exceptionToDeleteId.value))
    if (exceptionData) {
      let message = ''
      if (exceptionData.type === 'SWAP') {
        message = `撤銷調班申請: ${exceptionData.patient1.patientName}與${exceptionData.patient2.patientName} (同日互調)`
      } else {
        const typeText = typeMap[exceptionData.type] || '調班'
        message = `撤銷調班申請: ${exceptionData.patientName} (${typeText})`
      }
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
        isLoading.value = false
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
watch(isLoading, (newIsLoading) => {
  if (!newIsLoading) {
    nextTick(() => {
      if (fullCalendar.value) {
        calendarApi.value = fullCalendar.value.getApi()
        if (calendarApi.value) {
          calendarTitle.value = calendarApi.value.view.title
          scrollToCurrentWeek()
        }
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
  min-height: 0;
  display: flex;
  flex-direction: column;
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
  flex-wrap: wrap;
  gap: 1rem;
  flex-shrink: 0;
}

.exceptions-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.date-navigator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.calendar-title-text {
  font-weight: 600;
  font-size: 1.75rem;
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
  border: 1px solid #ced4da;
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

.calendar-wrapper {
  flex-grow: 1; /* 保持這個，讓它填滿空間 */
  overflow-y: auto; /* ✨ 關鍵新增：如果內容超高，產生垂直滾動條 */
  min-height: 0; /* ✨ 關鍵新增：在 Flex 佈局中，這是讓 overflow 生效的必要條件 */
}
.calendar-title-text.is-clickable {
  cursor: pointer;
  transition: color 0.2s;
}

.calendar-title-text.is-clickable:hover {
  color: #007bff;
}
/* ================================== */
/* ✨      FullCalendar 內部樣式      ✨ */
/* ================================== */
:deep(.fc) {
  font-family: inherit;
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
  background-color: #eaf6ff !important;
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
  /* ✨✨✨ 核心修正：在這裡重置 page-container 的佈局 ✨✨✨ */
  .page-container {
    height: auto; /* 允許容器高度隨內容增長，而不是鎖定100% */
    display: block; /* 解除 Flex 佈局，回歸正常的文檔流 */
    padding: 0;
  }

  .fab.mobile-only {
    display: flex;
  }
  .btn.desktop-only,
  .desktop-only-flex {
    display: none !important;
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
    /* 因為父層不再是 flex，這裡也不需要 flex-grow */
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
