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
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
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
import listPlugin from '@fullcalendar/list' // 確保 listPlugin 被引入
import zhTwLocale from '@fullcalendar/core/locales/zh-tw'
import MonthYearPicker from '@/components/MonthYearPicker.vue'
import { useBreakpoints } from '@/composables/useBreakpoints.js'

import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

// --- Store & Hook Instantiation ---
const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore)

// ✨✨✨ START: [核心修正] 宣告 isMobile ✨✨✨
const { isMobile } = useBreakpoints()
// ✨✨✨ END: [核心修正] ✨✨✨

const exceptionsApi = ApiManager('schedule_exceptions')
const tasksApi = ApiManager('tasks')
const router = useRouter()
const route = useRoute()
const { createGlobalNotification } = useGlobalNotifier()
const { addLocalNotification } = useRealtimeNotifications()
const { currentUser, canEditSchedules } = useAuth()

// --- Reactive State ---
const isPageLocked = computed(() => !canEditSchedules.value)
const exceptions = ref([])
const isLoading = ref(true)
const isCreateDialogVisible = ref(false)
const isConfirmDeleteVisible = ref(false)
const exceptionToDeleteId = ref(null)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const exceptionToReEdit = ref(null)
const isConflictAlertVisible = ref(false) // 雖然現在沒用到，但暫時保留以防萬一
const conflictAlertMessage = ref('')
// ✨✨✨ START: [核心修正] 在這裡補上遺漏的 ref 宣告 ✨✨✨
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
// ✨✨✨ END: [核心修正] ✨✨✨
let unsubscribe = null
const fullCalendar = ref(null)
const calendarApi = ref(null)
const calendarTitle = ref('')
const isMonthPickerVisible = ref(false)

// --- Constants & Maps ---
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

// --- Computed Properties ---
const calendarEvents = computed(() => {
  if (!exceptions.value) return []
  return exceptions.value.flatMap((ex) => {
    const statusStyles = {
      pending: { color: '#ffc107', prefix: '[待]' },
      processing: { color: '#0dcaf0', prefix: '[中]' },
      applied: { color: '#198754', prefix: '[✓]' },
      error: { color: '#dc3545', prefix: '[!] ' },
      conflict_requires_resolution: { color: '#fd7e14', prefix: '[衝突]' },
    }
    const baseColorMap = {
      MOVE: '#17a2b8',
      SUSPEND: '#6610f2',
      ADD_SESSION: '#20c997',
      RANGE_MOVE: '#e83e8c',
      SWAP: '#fd7e14',
    }
    const style = statusStyles[ex.status] || { color: '#6c757d', prefix: '[?]' }
    const finalColor = ex.status === 'applied' ? baseColorMap[ex.type] || '#6c757d' : style.color
    let baseTitle = ''
    if (ex.type === 'SWAP') {
      baseTitle = `${ex.patient1?.patientName || ''} <=> ${ex.patient2?.patientName || ''}`
    } else {
      baseTitle = `${ex.patientName || ''} - ${typeMap[ex.type] || '未知'}`
    }
    const title = `${style.prefix} ${baseTitle}`
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
        title: title.replace('調班', '[新班]'),
        start: ex.to.goalDate,
        allDay: true,
        backgroundColor: finalColor,
        borderColor: finalColor,
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
        backgroundColor: finalColor,
        borderColor: finalColor,
        extendedProps: { ...ex, formattedDetails: description },
      },
    ]
  })
})

function handleConflictClick(exceptionData) {
  const reEditData = {
    id: exceptionData.id,
    patientId: exceptionData.patientId,
    patientName: exceptionData.patientName,
    type: exceptionData.type,
    reason: exceptionData.reason,
    startDate: exceptionData.startDate,
    endDate: exceptionData.endDate,
    date: exceptionData.date,
    from: exceptionData.from,
    to: exceptionData.to,
    patient1: exceptionData.patient1,
    patient2: exceptionData.patient2,
  }
  exceptionToReEdit.value = reEditData
  isCreateDialogVisible.value = true
}

const calendarOptions = computed(() => {
  const isMobileView = isMobile.value
  return {
    plugins: [dayGridPlugin, interactionPlugin, listPlugin],
    initialView: isMobileView ? 'dayGridWeek' : 'dayGridMonth',
    locale: zhTwLocale,
    headerToolbar: false,
    dayMaxEvents: true,
    events: calendarEvents.value,
    eventDisplay: isMobileView ? 'list-item' : 'block',
    datesSet: (arg) => {
      calendarTitle.value = arg.view.title
    },
    eventClick: (info) => {
      const ex = info.event.extendedProps
      if (ex.status === 'conflict_requires_resolution') {
        handleConflictClick(ex)
      } else {
        exceptionToDeleteId.value = ex.id
        let patientDisplayName = ex.patientName
        if (ex.type === 'SWAP') {
          patientDisplayName = `${ex.patient1?.patientName} & ${ex.patient2?.patientName}`
        }
        confirmDialogTitle.value = '調班詳細資訊'
        confirmDialogMessage.value =
          `病患: ${patientDisplayName}\n` +
          `類型: ${typeMap[ex.type] || '未知'}\n` +
          `狀態: ${statusMap[ex.status] || '未知'}\n` +
          `區間: ${ex.startDate} ~ ${ex.endDate || ex.startDate}\n` +
          `詳細: ${ex.formattedDetails}\n` +
          `申請時間: ${formatTimestamp(ex.createdAt)}`
        isConfirmDeleteVisible.value = true
      }
    },
  }
})

const currentCalendarDate = computed(() => {
  return calendarApi.value ? calendarApi.value.getDate() : new Date()
})

// --- Functions ---
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

// ✨ [核心修改] 更新 handleCreateException 函式 ✨
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
      createdAt: serverTimestamp(),
    }
    if (formData.type === 'SWAP') {
      dataToSave.date = formData.date
      dataToSave.patient1 = formData.patient1
      dataToSave.patient2 = formData.patient2
    }
    await exceptionsApi.save(dataToSave)
    closeCreateDialog()
    const actionText = isUpdating ? '更新' : '新增'
    let message = ''
    if (formData.type === 'SWAP') {
      message = `${actionText}申請: ${formData.patient1.patientName} 與 ${formData.patient2.patientName} (同日互調)`
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
      const createMessageTask = (patientInfo) => ({
        category: 'message',
        type: '常規',
        content: messageContent,
        patientId: patientInfo.id,
        patientName: patientInfo.name,
        targetDate: formData.date || formData.startDate,
        status: 'pending',
        creator: {
          uid: currentUser.value.uid,
          name: currentUser.value.name,
          title: currentUser.value.title,
        },
        createdAt: serverTimestamp(),
        // ✨ 在這裡為自動產生的留言也加上 expireAt 欄位 ✨
        expireAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 天後過期
        assignee: null,
      })

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
    addLocalNotification(`操作失敗: ${error.message || '無法儲存調班申請，請檢查後再試。'}`)
  }
}

async function executeDeleteException() {
  if (!exceptionToDeleteId.value) return

  const exceptionData = exceptions.value.find((ex) => ex.id === exceptionToDeleteId.value)
  if (!exceptionData) {
    // 如果找不到資料，直接關閉對話框
    isConfirmDeleteVisible.value = false
    exceptionToDeleteId.value = null
    return
  }

  // ✨✨✨ START: [核心修正] 在前端進行日期預先檢查 ✨✨✨
  const todayStr = new Date().toISOString().split('T')[0]

  // 找出該申請最晚影響的日期
  let latestDateStr = exceptionData.endDate || exceptionData.startDate || exceptionData.date
  if (exceptionData.type === 'MOVE') {
    latestDateStr =
      exceptionData.to?.goalDate > exceptionData.from?.sourceDate
        ? exceptionData.to?.goalDate
        : exceptionData.from?.sourceDate
  }

  // 如果最晚影響日期都在過去，則阻止刪除並提示使用者
  if (latestDateStr && latestDateStr < todayStr) {
    isConfirmDeleteVisible.value = false

    // 現在這幾行程式碼可以正確地控制那個唯一的 AlertDialog 了
    alertDialogTitle.value = '撤銷失敗'
    alertDialogMessage.value = '此調班申請已完全成為過去事件，無法進行撤銷操作。'
    isAlertDialogVisible.value = true

    exceptionToDeleteId.value = null
    return
  }

  // 如果檢查通過 (至少有一天在今天或未來)，才執行真正的刪除
  try {
    await deleteDoc(doc(db, 'schedule_exceptions', exceptionToDeleteId.value))

    let message = ''
    if (exceptionData.type === 'SWAP') {
      message = `成功撤銷調班申請: ${exceptionData.patient1.patientName}與${exceptionData.patient2.patientName} (同日互調)`
    } else {
      const typeText = typeMap[exceptionData.type] || '調班'
      message = `成功撤銷調班申請: ${exceptionData.patientName} (${typeText})`
    }
    createGlobalNotification(message, 'exception', { routePath: '/exception-manager' })
  } catch (error) {
    console.error('撤銷失敗:', error)
    // 可以在這裡也加入一個 AlertDialog 提示
    alertDialogTitle.value = '撤銷失敗'
    alertDialogMessage.value = `執行撤銷操作時發生錯誤: ${error.message}`
    isAlertDialogVisible.value = true
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
watch(exceptions, (newExceptions, oldExceptions) => {
  if (!oldExceptions || oldExceptions.length === 0) {
    return
  }
  const oldExceptionsMap = new Map(oldExceptions.map((ex) => [ex.id, ex]))
  newExceptions.forEach((newEx) => {
    const oldEx = oldExceptionsMap.get(newEx.id)
    if (oldEx && (oldEx.status === 'pending' || oldEx.status === 'processing')) {
      if (newEx.status === 'error') {
        addLocalNotification(
          `調班申請失敗: ${newEx.patientName || ''} (${typeMap[newEx.type] || ''}) - ${newEx.errorMessage || '未知錯誤'}`,
        )
      } else if (newEx.status === 'conflict_requires_resolution') {
        addLocalNotification(
          `調班申請衝突: ${newEx.patientName || ''} (${typeMap[newEx.type] || ''}) - ${newEx.errorMessage || '床位已被佔用'}`,
        )
      }
    }
  })
})
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
  /* ✨✨✨【核心修正】移除 height: 100% ✨✨✨ */
  /* height: 100%; */ /* <--- 移除這一行 */

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
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
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
  /* ✨✨✨【核心修正】我們不再需要特別重置 page-container 的樣式 ✨✨✨ */
  /*
  .page-container {
    height: auto;
    display: block;
    padding: 0;
  }
  */
  /* 因為基礎樣式已經被修正，這裡的覆蓋就不再需要了，可以刪除或註解掉 */

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
