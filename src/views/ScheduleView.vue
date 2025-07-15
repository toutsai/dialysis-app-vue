<!-- 檔案路徑: src/views/ScheduleView.vue (完全優化版) -->
<script setup>
import { ref, onMounted, computed, reactive, watch, provide } from 'vue'
// ❌ 移除 ApiManager
// import ApiManager from '@/services/api_manager.js'
import {
  where,
  collection,
  getDocs,
  query,
  addDoc,
  setDoc,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useNotification } from '@/composables/useNotification.js'

// ✅ 使用我們的優化函式
import {
  clearFutureSchedulesForPatient,
  cleanTemporaryDataInFutureSchedules,
  getPatientSchedules,
} from '@/services/scheduleService.js'

// ✅ 使用錯誤處理系統
import { useErrorHandler } from '@/composables/useErrorHandler.js'

import SystemDiagnostic from '@/components/SystemDiagnostic.vue'

import {
  SHIFT_CODES,
  ORDERED_SHIFT_CODES,
  getShiftDisplayName,
  earlyTeams,
  lateTeams,
  allTeams,
} from '@/constants/scheduleConstants.js'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import MemoIcon from '@/components/MemoIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// ✅ 初始化錯誤處理系統
const { handleApiCall, performanceMonitor } = useErrorHandler()

// ✅ 直接使用 Firestore 集合，替代 ApiManager
const patientsCollection = collection(db, 'patients')
const schedulesCollection = collection(db, 'schedules')
const memosCollection = collection(db, 'memos')

// ✅ 優化的資料獲取函式
const fetchPatients = performanceMonitor('fetchPatients', async () => {
  return await handleApiCall(
    async () => {
      const querySnapshot = await getDocs(patientsCollection)
      const patients = []
      querySnapshot.forEach((doc) => {
        patients.push({ id: doc.id, ...doc.data() })
      })
      console.log(`📊 Loaded ${patients.length} patients`)
      return patients
    },
    {
      loadingMessage: '載入病人資料中...',
      errorPrefix: '載入病人資料失敗',
    },
  )
})

const fetchMemos = performanceMonitor('fetchMemos', async () => {
  return await handleApiCall(
    async () => {
      // ✅ 修正查詢條件：改為查詢 status === 'pending'
      const q = query(memosCollection, where('status', '==', 'pending'))
      const querySnapshot = await getDocs(q)
      const memos = []
      querySnapshot.forEach((doc) => {
        memos.push({ id: doc.id, ...doc.data() })
      })
      console.log(`📝 Loaded ${memos.length} pending memos`)
      return memos
    },
    {
      loadingMessage: '載入備忘資料中...',
      errorPrefix: '載入備忘資料失敗',
    },
  )
})

const fetchSchedulesByDate = performanceMonitor('fetchSchedulesByDate', async (dateStr) => {
  return await handleApiCall(
    async () => {
      const q = query(schedulesCollection, where('date', '==', dateStr))
      const querySnapshot = await getDocs(q)
      const schedules = []
      querySnapshot.forEach((doc) => {
        schedules.push({ id: doc.id, ...doc.data() })
      })
      console.log(`📅 Loaded ${schedules.length} schedule documents for ${dateStr}`)
      return schedules
    },
    {
      errorPrefix: `載入 ${dateStr} 排程失敗`,
      showNotification: false,
    },
  )
})

const saveScheduleData = performanceMonitor(
  'saveScheduleData',
  async (scheduleData, scheduleId = null) => {
    return await handleApiCall(
      async () => {
        if (scheduleId) {
          // 更新現有記錄
          const docRef = doc(schedulesCollection, scheduleId)
          await updateDoc(docRef, {
            ...scheduleData,
            updatedAt: new Date(),
            lastModifiedBy: 'ScheduleView',
          })
          console.log(`✅ Updated schedule document: ${scheduleId}`)
          return { id: scheduleId, ...scheduleData }
        } else {
          // 創建新記錄
          const docRef = await addDoc(schedulesCollection, {
            ...scheduleData,
            createdAt: new Date(),
            updatedAt: new Date(),
            lastModifiedBy: 'ScheduleView',
          })
          console.log(`✅ Created new schedule document: ${docRef.id}`)
          return { id: docRef.id, ...scheduleData }
        }
      },
      {
        loadingMessage: '儲存排程資料中...',
        successMessage: '排程儲存成功！',
        errorPrefix: '儲存排程失敗',
      },
    )
  },
)

// --- Layout and Constants ---
const layoutData = {
  leftWingRows: [
    ['空', 32, 31],
    [33, 35, 36],
    [39, 38, 37],
    [51, 52, 53],
    [57, 56, 55],
    [58, 59, 61],
    [65, 63, 62],
  ],
  rightWingRows: [
    [29, 28, 27],
    [23, 25, 26],
    [22, 21, 19],
    [16, 17, 18],
    [15, 13, 12],
    [8, 9, 11],
    [7, 6, 5],
    [1, 2, 3],
  ],
}
const allBedNumbers = [
  ...layoutData.leftWingRows.flat(),
  ...layoutData.rightWingRows.flat(),
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
].filter((b) => b !== '空')
const hepatitisBeds = ['空', 31, 32, 33, 35, 36]
const aisleSideBeds = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65]
const peripheralBedCount = 6
const STYLE_CHECK_ORDER = [
  { key: '住', class: 'status-ipd' },
  { key: '隔', class: 'status-ipd' },
  { key: 'R', class: 'status-ipd' },
  { key: '抽', class: 'tag-chou' },
  { key: '新', class: 'tag-new' },
  { key: '換', class: 'tag-huan' },
  { key: '兩', class: 'tag-liang' },
  { key: 'B', class: 'tag-b' },
]
const freqToDays = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
  每周一次: [0, 1, 2, 3, 4, 5, 6],
  臨時: [0, 1, 2, 3, 4, 5, 6, 7],
}
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

// --- Reactive State ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const copySourceDate = ref(formatDate(new Date()))

const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isAssignmentDialogVisible = ref(false)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)
const highlightedTeam = ref(null)

const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)

// --- 權限控制 ---
const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) {
    return true
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return currentDate.value < today
})

const { addNotification } = useNotification()

function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- Computed Properties ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const dayOfWeek = computed(() => {
  const day = currentDate.value.getDay()
  return day === 0 ? 7 : day
})
const statsToolbarData = computed(() => {
  const dailyData = {
    counts: {
      early: { total: 0, opd: 0, ipd: 0, er: 0 },
      noon: { total: 0, opd: 0, ipd: 0, er: 0 },
      late: { total: 0, opd: 0, ipd: 0, er: 0 },
    },
    total: 0,
  }
  if (currentRecord.schedule) {
    const localPatientMap = new Map(allPatients.value.map((p) => [p.id, p]))
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = localPatientMap.get(slotData.patientId)
        if (!patient) continue
        const shiftCode = slotData.shiftId.split('-')[2]
        const shiftStats = dailyData.counts[shiftCode]
        if (shiftStats) {
          shiftStats.total++
          dailyData.total++
          if (patient.status === 'opd') shiftStats.opd++
          else if (patient.status === 'ipd') shiftStats.ipd++
          else if (patient.status === 'er') shiftStats.er++
        }
      }
    }
  }
  return [dailyData]
})
const statsToolbarWeekdays = computed(() => ['本日'])
const scheduledPatientIds = computed(() => {
  if (!currentRecord.schedule) return new Set()
  return new Set(
    Object.values(currentRecord.schedule)
      .filter((slot) => slot && slot.patientId)
      .map((slot) => slot.patientId),
  )
})

// --- Functions ---
function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter((memo) => memo.patientId === patientId)
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

function toggleHighlight(type, team) {
  const currentHighlight = highlightedTeam.value
  if (currentHighlight && currentHighlight.type === type && currentHighlight.team === team) {
    highlightedTeam.value = null
  } else {
    highlightedTeam.value = { type, team }
  }
}

function isSlotHighlighted(shiftId) {
  if (!highlightedTeam.value) {
    return false
  }
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return false
  const { type, team } = highlightedTeam.value
  const shiftCode = shiftId.split('-')[2]
  if (type === 'early') {
    if (shiftCode === SHIFT_CODES.EARLY && slotData.nurseTeam === `早${team}`) return true
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamIn === `早${team}`) return true
  } else if (type === 'late') {
    if (shiftCode === SHIFT_CODES.LATE && slotData.nurseTeam === `晚${team}`) return true
    if (shiftCode === SHIFT_CODES.NOON && slotData.nurseTeamOut === `晚${team}`) return true
  }
  return false
}

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

// ✅ 優化版的儲存函式
async function saveDataToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足或日期已過。'
    isAlertDialogVisible.value = true
    return
  }

  try {
    const cleanSchedule = {}
    for (const shiftId in currentRecord.schedule) {
      const slotData = currentRecord.schedule[shiftId]
      if (slotData && slotData.patientId) {
        const standardSlot = createEmptySlotData(shiftId)
        Object.keys(standardSlot).forEach((key) => {
          if (slotData[key] !== null && slotData[key] !== undefined) {
            standardSlot[key] = slotData[key]
          }
        })

        // 在儲存前，清空所有午班的 nurseTeamOut
        if (shiftId.endsWith(SHIFT_CODES.NOON)) {
          standardSlot.nurseTeamOut = null
        }

        cleanSchedule[shiftId] = standardSlot
      }
    }

    const dataToSave = {
      date: currentRecord.date,
      schedule: cleanSchedule,
      names: currentRecord.names,
    }

    // ✅ 使用優化的儲存函式
    const savedRecord = await saveScheduleData(dataToSave, currentRecord.id)
    currentRecord.id = savedRecord.id

    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'

    const updateEvent = new CustomEvent('schedule-updated', {
      detail: { date: currentRecord.date },
    })
    window.dispatchEvent(updateEvent)

    addNotification(`修改每日排程: ${currentRecord.date}`, 'schedule')
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '排程已成功儲存！'
    isAlertDialogVisible.value = true

    // 儲存後重新載入資料，確保畫面與資料庫同步
    await loadDataForDay(currentDate.value)
  } catch (error) {
    console.error('❌ 儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

function clearBoard() {
  confirmDialogMessage.value = '確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)'
  onConfirmAction.value = () => {
    currentRecord.schedule = {}
    setChange()
  }
  isConfirmDialogVisible.value = true
}

// ✅ 優化版的複製函式
async function copySchedule() {
  if (isPageLocked.value) {
    alert('操作被鎖定：無法複製排程。')
    return
  }
  if (!copySourceDate.value || copySourceDate.value === formatDate(currentDate.value)) {
    alert('請選擇一個與當前不同的來源日期！')
    return
  }
  confirmDialogMessage.value = `確定要將 ${copySourceDate.value} 的排程複製到本日嗎？\n這會覆蓋當前畫面的所有內容！`
  onConfirmAction.value = async () => {
    try {
      // ✅ 使用優化的資料獲取函式
      const sourceRecords = await fetchSchedulesByDate(copySourceDate.value)

      if (sourceRecords.length > 0) {
        const sourceSchedule = sourceRecords[0].schedule || {}
        const processedSchedule = {}
        for (const shiftId in sourceSchedule) {
          if (sourceSchedule[shiftId]?.patientId) {
            processedSchedule[shiftId] = { ...sourceSchedule[shiftId] }
          }
        }
        currentRecord.schedule = processedSchedule
        setChange()
        statusIndicator.value = '複製成功，請記得儲存'
      } else {
        alertDialogTitle.value = '複製失敗'
        alertDialogMessage.value = `在雲端找不到 ${copySourceDate.value} 的排程資料。`
        isAlertDialogVisible.value = true
        statusIndicator.value = '複製失敗'
      }
    } catch (error) {
      alertDialogTitle.value = '複製失敗'
      alertDialogMessage.value = `複製失敗: ${error.message}`
      isAlertDialogVisible.value = true
      statusIndicator.value = '複製失敗'
    }
  }
  isConfirmDialogVisible.value = true
}

function onDrop(event, targetShiftId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')
  const droppedSlotData = JSON.parse(event.dataTransfer.getData('application/json'))
  if (!droppedSlotData || !droppedSlotData.patientId) return
  const patient = patientMap.value.get(droppedSlotData.patientId)
  if (!patient) return
  if (!sourceShiftId && scheduledPatientIds.value.has(patient.id)) {
    if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) return
  }
  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (targetSlotData && targetSlotData.patientId) {
    if (!sourceShiftId) {
      alert('目標床位已被佔用，無法放置！')
      return
    }
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData, shiftId: targetShiftId }
    currentRecord.schedule[sourceShiftId] = { ...targetSlotData, shiftId: sourceShiftId }
  } else {
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData, shiftId: targetShiftId }
    if (sourceShiftId) delete currentRecord.schedule[sourceShiftId]
  }
  setChange()
}

function handleSlotUpdate(shiftId, patientId) {
  if (isPageLocked.value) return
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    currentRecord.schedule[shiftId] = {
      ...createEmptySlotData(shiftId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: patient.status === 'ipd' ? '住' : '',
    }
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]

  if (isPageLocked.value) {
    if (slotData?.patientId) {
      showPatientMemos(slotData.patientId)
    }
    return
  }

  if (slotData?.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    confirmDialogMessage.value = `確定要將「${patient?.name}」從此班次中移除嗎？`
    onConfirmAction.value = () => {
      handleSlotUpdate(shiftId, null)
    }
    isConfirmDialogVisible.value = true
  } else {
    currentSlotId.value = shiftId
    isPatientSelectDialogVisible.value = true
  }
}

function handlePatientSelect({ patientId }) {
  if (!patientId || !currentSlotId.value) return
  isPatientSelectDialogVisible.value = false
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    alertDialogTitle.value = '重複排班警告'
    alertDialogMessage.value = `病人 ${patient.name} 在本日已有排班，無法重複排入。`
    isAlertDialogVisible.value = true
    currentSlotId.value = null
    return
  }
  handleSlotUpdate(currentSlotId.value, patientId)
  currentSlotId.value = null
}

function updateNurseTeam(event, shiftId, type) {
  if (isPageLocked.value) {
    event.target.value =
      currentRecord.schedule[shiftId]?.[
        type === 'single' ? 'nurseTeam' : type === 'in' ? 'nurseTeamIn' : 'nurseTeamOut'
      ] || ''
    return
  }
  const value = event.target.value
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  const slot = currentRecord.schedule[shiftId]
  const isPeripheralNoon = shiftId.startsWith('peripheral') && shiftId.endsWith(SHIFT_CODES.NOON)
  if (type === 'single' && isPeripheralNoon) {
    slot.nurseTeamIn = value || null
    slot.nurseTeamOut = value || null
    slot.nurseTeam = null
  } else if (type === 'single') {
    slot.nurseTeam = value || null
  } else if (type === 'in') {
    slot.nurseTeamIn = value || null
  } else if (type === 'out') {
    slot.nurseTeamOut = value || null
  }
  setChange()
}

function updateNote(event, shiftId) {
  if (isPageLocked.value) {
    event.target.textContent = getCombinedNote(shiftId)
    return
  }
  if (!currentRecord.schedule[shiftId]) {
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }
  currentRecord.schedule[shiftId].manualNote = event.target.textContent.trim()
  setChange()
}

const updateWardNumber = (event, shiftId) => {
  if (isPageLocked.value) {
    event.target.textContent = currentRecord.schedule[shiftId]?.wardNumber || ''
    return
  }
  const value = event.target.textContent.trim()
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].wardNumber = value
  setChange()
}

function onBedDragStart(event, sourceShiftId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = currentRecord.schedule[sourceShiftId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('sourceShiftId', sourceShiftId)
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}

function onSidebarDragStart(event, patient) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = {
    ...createEmptySlotData('sidebar-source'),
    patientId: patient.id,
    autoNote: generateAutoNote(patient),
    manualNote: patient.status === 'ipd' ? '住' : '',
  }
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    if (!confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  }
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
}

function goToToday() {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    if (!confirm('您有未儲存的變更，確定要切換到今天嗎？')) return
  }
  currentDate.value = new Date()
}

// ✅ 優化版的資料載入函式
const loadAllData = performanceMonitor('loadAllData', async () => {
  try {
    console.log('🔄 Loading all data...')
    const [patientsData, memosData] = await Promise.all([fetchPatients(), fetchMemos()])
    allPatients.value = patientsData
    activeMemos.value = memosData
    console.log('✅ All data loaded successfully')
  } catch (error) {
    console.error('❌ Failed to load data:', error)
    statusIndicator.value = '讀取病人或備忘資料失敗'
  }
})

// ✅ 優化版的每日資料載入函式
const loadDataForDay = performanceMonitor('loadDataForDay', async (date) => {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)

  try {
    console.log(`📅 Loading data for ${dateStr}`)

    // ✅ 使用優化的資料獲取函式
    const dailyRecords = await fetchSchedulesByDate(dateStr)
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }

    const finalSchedule = {}
    if (record.schedule) {
      for (const shiftId in record.schedule) {
        const dbSlotData = record.schedule[shiftId]
        if (dbSlotData && dbSlotData.patientId) {
          const patient = patientMap.value.get(dbSlotData.patientId)
          const mergedSlot = { ...createEmptySlotData(shiftId), ...dbSlotData }
          if (patient) {
            mergedSlot.autoNote = generateAutoNote(patient)
          }
          finalSchedule[shiftId] = mergedSlot
        }
      }
    }

    Object.assign(currentRecord, {
      id: record.id || null,
      date: dateStr,
      schedule: finalSchedule,
      names: record.names || {},
    })

    statusIndicator.value = record.id ? '資料已載入' : '本日無排程'
    console.log(
      `✅ Data loaded for ${dateStr}, found ${Object.keys(finalSchedule).length} scheduled slots`,
    )
  } catch (error) {
    console.error('❌ Failed to load day data:', error)
    statusIndicator.value = '讀取失敗'
  }
})

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (!patient.freq) return false
  const scheduledDays = freqToDays[patient.freq]
  const checkDay = dayOfWeek === 0 ? 7 : dayOfWeek
  return scheduledDays ? scheduledDays.includes(checkDay) : false
}

function runScheduleCheck() {
  const warnings = []
  const dayOfWeek = currentDate.value.getDay()
  const todayScheduledPatientIds = new Set(scheduledPatientIds.value)
  const duplicateNames = new Set()
  let tempScheduled = {}
  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot && slot.patientId) {
      if (tempScheduled[slot.patientId]) {
        const patientName = patientMap.value.get(slot.patientId)?.name
        if (patientName) duplicateNames.add(patientName)
      }
      tempScheduled[slot.patientId] = true
    }
  })
  if (duplicateNames.size > 0) {
    warnings.push(
      `【重複排班】:\n- 病人 ${Array.from(duplicateNames).join(', ')} 在本日出現超過一次。`,
    )
  }
  const allPatientsToCheck = allPatients.value.filter((p) => !p.isDeleted)
  const missingPatients = allPatientsToCheck.filter((p) => {
    const shouldBeScheduled = shouldPatientBeScheduled(p, dayOfWeek)
    return shouldBeScheduled && !todayScheduledPatientIds.has(p.id)
  })
  if (missingPatients.length > 0) {
    const missingPatientNames = missingPatients
      .map((p) => `${p.name} (${p.status === 'ipd' ? '住院' : '門診'})`)
      .join('\n- ')
    warnings.push(`【未排床病人】:\n- ${missingPatientNames}`)
  }
  if (warnings.length > 0) {
    alertDialogTitle.value = '排班檢視警告'
    alertDialogMessage.value = warnings.join('\n\n')
  } else {
    alertDialogTitle.value = '排班檢視完畢'
    alertDialogMessage.value = '未發現明顯的排班或遺漏問題。'
  }
  isAlertDialogVisible.value = true
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name, .peripheral-patient-name')
  if (targetCell) {
    targetCell.classList.add('drag-over')
  }
}

function onDragLeave(event) {
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
}

function handleAssignBed({ patientId, shiftId }) {
  if (!patientId || !shiftId) return
  if (isPageLocked.value) return
  if (scheduledPatientIds.value.has(patientId)) {
    const patient = patientMap.value.get(patientId)
    if (!confirm(`警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`)) return
  }
  if (currentRecord.schedule[shiftId]?.patientId) {
    alert('錯誤：目標床位已被佔用！')
    return
  }
  handleSlotUpdate(shiftId, patientId)
}

function getPatientName(shiftId) {
  const patientId = currentRecord.schedule[shiftId]?.patientId
  return patientMap.value.get(patientId)?.name || ''
}

function getCombinedNote(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData) return ''
  const autoTags = (slotData.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (slotData.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  return finalTags.join(' ')
}

function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}
  if (patient.status === 'ipd') return { 'status-ipd': true }
  const combinedNote = getCombinedNote(shiftId)
  for (const style of STYLE_CHECK_ORDER) {
    if (combinedNote.includes(style.key)) {
      return { [style.class]: true }
    }
  }
  if (patient.status === 'er') return { 'status-er': true }
  if (patient.status === 'opd') return { 'status-opd': true }
  return {}
}

function triggerPrint() {
  window.print()
}

function handleConfirm() {
  if (typeof onConfirmAction.value === 'function') {
    onConfirmAction.value()
  }
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

const { distributePatients } = useTeamAssigner()

function executeAutoAssignment() {
  const getRichPatientList = (shiftCode) => {
    const patients = []
    for (const shiftId in currentRecord.schedule) {
      if (!shiftId.endsWith(shiftCode)) continue

      const slot = currentRecord.schedule[shiftId]
      if (slot?.patientId) {
        const patientData = patientMap.value.get(slot.patientId)
        if (patientData) {
          const bedNumberStr = shiftId.split('-')[1]
          const bedNumber = parseInt(bedNumberStr, 10)
          patients.push({
            id: slot.patientId,
            shiftId: slot.shiftId,
            status: patientData.status,
            isHepatitis: !isNaN(bedNumber) && hepatitisBeds.includes(bedNumber),
            isPeripheral: shiftId.startsWith('peripheral'),
          })
        }
      }
    }
    return patients
  }

  const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY)
  const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON)
  const allLatePatients = getRichPatientList(SHIFT_CODES.LATE)

  const mainArea = (list) => list.filter((p) => !p.isPeripheral)
  const peripheral = (list) => list.filter((p) => p.isPeripheral)
  const sort = (list) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10)
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return [...list].sort((a, b) => getSortKey(a.shiftId) - getSortKey(b.shiftId))
  }

  const dayBaseTeams = baseTeams.filter((t) => t !== 'K')

  // --- 早班 ---
  const earlyMain = mainArea(allEarlyPatients)
  const earlyTeamsToUse = dayBaseTeams.map((t) => `早${t}`)
  const useEarlyTeamA = earlyMain.length > 36
  const earlyRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'],
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 4 },
    },
    mainDistribution: {
      specialTeam: useEarlyTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: (useEarlyTeamA ? dayBaseTeams : dayBaseTeams.filter((t) => t !== 'A')).map(
        (t) => `早${t}`,
      ),
      primaryCapacity: 4,
      fillMethod: useEarlyTeamA ? 'block' : 'average',
    },
  }
  const earlyAssignments = distributePatients(sort(earlyMain), earlyTeamsToUse, earlyRules)
  earlyAssignments['早外圍'] = peripheral(allEarlyPatients)

  // --- 午班 (上針) ---
  const noonMain = mainArea(allNoonPatients)
  const noonTeamsToUse = dayBaseTeams.map((t) => `早${t}`)
  const useNoonTeamA = noonMain.length > 36
  const noonRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'],
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 4 },
    },
    mainDistribution: {
      specialTeam: useNoonTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: (useNoonTeamA ? dayBaseTeams : dayBaseTeams.filter((t) => t !== 'A')).map(
        (t) => `早${t}`,
      ),
      primaryCapacity: 4,
      fillMethod: useNoonTeamA ? 'block' : 'average',
    },
  }
  const noonOnAssignments = distributePatients(sort(noonMain), noonTeamsToUse, noonRules)
  noonOnAssignments['早外圍'] = peripheral(allNoonPatients)

  // --- 晚班 ---
  const lateMain = mainArea(allLatePatients)
  const lateTeamsToUse = baseTeams.slice(0, 8).map((t) => `晚${t}`)
  const lateRules = {
    priorityTeams: {
      hepatitis: '晚G',
      inPatientTeams: ['晚H', '晚I'],
      inPatientCapacity: { 晚H: 2, 晚I: 2 },
    },
    mainDistribution: {
      specialTeam: null,
      regularTeams: baseTeams.slice(0, 8).map((t) => `晚${t}`),
      primaryCapacity: 4,
      fillMethod: 'average',
    },
  }
  const lateAssignments = distributePatients(sort(lateMain), lateTeamsToUse, lateRules)
  lateAssignments['晚外圍'] = peripheral(allLatePatients)

  // --- 更新 schedule ---
  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot) {
      slot.nurseTeam = null
      slot.nurseTeamIn = null
    }
  })

  const applyToSchedule = (assignments, prop) => {
    for (const team in assignments) {
      for (const patient of assignments[team]) {
        if (currentRecord.schedule[patient.shiftId]) {
          currentRecord.schedule[patient.shiftId][prop] = team
        }
      }
    }
  }

  applyToSchedule(earlyAssignments, 'nurseTeam')
  applyToSchedule(noonOnAssignments, 'nurseTeamIn')
  applyToSchedule(lateAssignments, 'nurseTeam')

  setChange()
  statusIndicator.value = '自動分組完成，請確認並儲存'
  alertDialogTitle.value = '操作成功'
  alertDialogMessage.value =
    '自動分組已完成！請檢視結果並點擊「儲存」。\n(注意：午班收針組別未變動)'
  isAlertDialogVisible.value = true
}

function autoAssignNurseTeams() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '頁面已鎖定，無法執行自動分組。'
    isAlertDialogVisible.value = true
    return
  }
  confirmDialogMessage.value = '此操作將會覆蓋現有的護理師分組，您確定要繼續嗎？'
  onConfirmAction.value = () => {
    executeAutoAssignment()
  }
  isConfirmDialogVisible.value = true
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(async () => {
  await loadAllData()
  await loadDataForDay(currentDate.value)
})

watch(currentDate, (newDate, oldDate) => {
  if (oldDate && formatDate(newDate) !== formatDate(oldDate)) {
    loadDataForDay(newDate)
  }
})
</script>

<template>
  <!-- 🩺 診斷組件 -->
  <SystemDiagnostic />

  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button class="btn" @click="changeDate(-1)">< 上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button @click="changeDate(1)">下一天 ></button>
            <button @click="goToToday">回到今日</button>
          </div>
          <button class="btn btn-warning" @click="runScheduleCheck">排程檢視</button>
          <button
            class="btn btn-info"
            @click="isAssignmentDialogVisible = true"
            :disabled="isPageLocked"
          >
            智慧排床
          </button>
          <button
            class="btn"
            @click="autoAssignNurseTeams"
            :disabled="isPageLocked"
            style="background-color: #007bff; color: white; border-color: #007bff"
          >
            自動分組
          </button>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <button
            class="btn btn-success"
            @click="saveDataToCloud"
            :disabled="!hasUnsavedChanges || isPageLocked"
          >
            儲存
          </button>
          <button class="btn btn-info" @click="triggerPrint">列印</button>
        </div>
      </div>
      <div class="controls-panel">
        <div class="controls-left">
          <button class="btn btn-secondary" @click="clearBoard" :disabled="isPageLocked">
            清除畫面
          </button>
          <input type="date" v-model="copySourceDate" :disabled="isPageLocked" />
          <button class="add-btn" @click="copySchedule" :disabled="isPageLocked">從他日複製</button>
        </div>
        <div class="controls-right">
          <div class="team-highlight-container">
            <div class="team-group">
              <span class="team-group-label">早</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`early-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'early' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('early', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
            <div class="team-group">
              <span class="team-group-label">晚</span>
              <div class="team-buttons">
                <button
                  v-for="team in baseTeams"
                  :key="`late-${team}`"
                  class="team-btn"
                  :class="{
                    active: highlightedTeam?.type === 'late' && highlightedTeam?.team === team,
                  }"
                  @click="toggleHighlight('late', team)"
                >
                  {{ team }}
                </button>
              </div>
            </div>
          </div>
          <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
        </div>
      </div>
    </header>

    <main class="page-main-content" :class="{ 'is-locked': isPageLocked }">
      <div class="schedule-content">
        <div class="dialysis-unit">
          <template
            v-for="(wing, wingName) in {
              left: layoutData.leftWingRows,
              right: layoutData.rightWingRows,
            }"
            :key="wingName"
          >
            <div :class="`${wingName}-wing`">
              <div v-for="(row, rowIndex) in wing" :key="`${wingName}-${rowIndex}`" class="bed-row">
                <div
                  v-for="bedNum in row"
                  :key="`bed-${wingName}-${bedNum}`"
                  class="bed"
                  :class="{
                    unassigned: bedNum === '空',
                    hepatitis: hepatitisBeds.includes(bedNum),
                    'aisle-side': aisleSideBeds.includes(bedNum),
                    [`${wingName}-wing-bed`]: true,
                  }"
                >
                  <div class="bed-header">
                    {{ bedNum === '空' ? '未排床' : `床號 ${bedNum}` }}
                    <span v-if="hepatitisBeds.includes(bedNum) && bedNum !== '空'">(BC肝炎)</span>
                  </div>
                  <template v-if="bedNum !== '空'">
                    <div
                      v-for="shiftCode in ORDERED_SHIFT_CODES"
                      :key="shiftCode"
                      class="shift-row"
                      :class="[
                        getPatientCellStyle(`bed-${bedNum}-${shiftCode}`),
                        { 'split-shift': shiftCode === SHIFT_CODES.NOON },
                        { 'highlighted-slot': isSlotHighlighted(`bed-${bedNum}-${shiftCode}`) },
                      ]"
                    >
                      <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                      <div v-if="shiftCode === SHIFT_CODES.NOON" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamIn
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'in')"
                          :disabled="isPageLocked"
                        >
                          <option value="">上針</option>
                          <option v-for="team in earlyTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                        <select
                          class="nurse-team-select nurse-out"
                          :value="
                            currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeamOut
                          "
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'out')"
                          :disabled="isPageLocked"
                        >
                          <option value="">收針</option>
                          <option v-for="team in allTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                      </div>
                      <select
                        v-else
                        class="nurse-team-select"
                        :value="
                          currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.nurseTeam
                        "
                        @change="updateNurseTeam($event, `bed-${bedNum}-${shiftCode}`, 'single')"
                        :disabled="isPageLocked"
                      >
                        <option value="">-</option>
                        <option
                          v-for="team in shiftCode === SHIFT_CODES.EARLY ? earlyTeams : lateTeams"
                          :key="team"
                          :value="team"
                        >
                          {{ team }}組
                        </option>
                      </select>
                      <div
                        class="patient-name"
                        :draggable="!isPageLocked && !!getPatientName(`bed-${bedNum}-${shiftCode}`)"
                        @click="handleSlotClick(`bed-${bedNum}-${shiftCode}`)"
                        @drop="!isPageLocked && onDrop($event, `bed-${bedNum}-${shiftCode}`)"
                        @dragover="!isPageLocked && onDragOver($event)"
                        @dragleave="onDragLeave"
                        @dragstart="
                          !isPageLocked && onBedDragStart($event, `bed-${bedNum}-${shiftCode}`)
                        "
                      >
                        <span v-if="getPatientName(`bed-${bedNum}-${shiftCode}`)">
                          {{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}
                          <MemoIcon
                            :patient-id="
                              currentRecord.schedule['bed-' + bedNum + '-' + shiftCode]?.patientId
                            "
                          />
                        </span>
                        <span v-else class="empty-slot-placeholder">+</span>
                      </div>
                      <div
                        class="patient-tag"
                        :contenteditable="!isPageLocked"
                        @blur="updateNote($event, `bed-${bedNum}-${shiftCode}`)"
                        @drop="!isPageLocked && onDrop($event, `bed-${bedNum}-${shiftCode}`)"
                        @dragover="!isPageLocked && onDragOver($event)"
                        @dragleave="onDragLeave"
                      >
                        {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <div v-if="wingName === 'left'" class="bed-row">
                <div class="nursing-station">護理站</div>
              </div>
            </div>
            <div v-if="wingName === 'left'" class="aisle">中 央 走 道</div>
          </template>
        </div>
        <div class="extra-sections">
          <div class="peripheral-section">
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div
                  v-for="shiftCode in ORDERED_SHIFT_CODES"
                  :key="shiftCode"
                  class="peripheral-shift-row"
                  :class="[
                    getPatientCellStyle(`peripheral-${i}-${shiftCode}`),
                    { 'highlighted-slot': isSlotHighlighted(`peripheral-${i}-${shiftCode}`) },
                  ]"
                >
                  <div class="shift-label">{{ getShiftDisplayName(shiftCode) }}</div>
                  <select
                    class="nurse-team-select"
                    :value="
                      shiftCode === SHIFT_CODES.NOON
                        ? currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeamIn
                        : currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeam
                    "
                    @change="
                      updateNurseTeam(
                        $event,
                        `peripheral-${i}-${shiftCode}`,
                        shiftCode === SHIFT_CODES.NOON ? 'in' : 'single',
                      )
                    "
                    :disabled="isPageLocked"
                  >
                    <option value="">-</option>
                    <option
                      v-for="team in shiftCode === SHIFT_CODES.EARLY
                        ? earlyTeams
                        : shiftCode === SHIFT_CODES.LATE
                          ? lateTeams
                          : allTeams"
                      :key="team"
                      :value="team"
                    >
                      {{ team }}組
                    </option>
                  </select>
                  <div
                    class="peripheral-bed-number"
                    :contenteditable="!isPageLocked"
                    @blur="updateWardNumber($event, `peripheral-${i}-${shiftCode}`)"
                  >
                    {{ currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.wardNumber }}
                  </div>
                  <div
                    class="peripheral-patient-name"
                    :draggable="!isPageLocked && !!getPatientName(`peripheral-${i}-${shiftCode}`)"
                    @click="handleSlotClick(`peripheral-${i}-${shiftCode}`)"
                    @drop="!isPageLocked && onDrop($event, `peripheral-${i}-${shiftCode}`)"
                    @dragover="!isPageLocked && onDragOver($event)"
                    @dragleave="onDragLeave"
                    @dragstart="
                      !isPageLocked && onBedDragStart($event, `peripheral-${i}-${shiftCode}`)
                    "
                  >
                    <span v-if="getPatientName(`peripheral-${i}-${shiftCode}`)">
                      {{ getPatientName(`peripheral-${i}-${shiftCode}`) }}
                      <MemoIcon
                        :patient-id="
                          currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.patientId
                        "
                      />
                    </span>
                    <span v-else class="empty-slot-placeholder">+</span>
                  </div>
                  <div
                    class="patient-tag"
                    :contenteditable="!isPageLocked"
                    @blur="updateNote($event, `peripheral-${i}-${shiftCode}`)"
                    @drop="!isPageLocked && onDrop($event, `peripheral-${i}-${shiftCode}`)"
                    @dragover="!isPageLocked && onDragOver($event)"
                    @dragleave="onDragLeave"
                  >
                    {{ getCombinedNote(`peripheral-${i}-${shiftCode}`) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
        :class="{ 'sidebar-locked': isPageLocked }"
        :use-daily-filter="true"
        :day-of-week="dayOfWeek"
      />
    </main>
  </div>

  <MemoDisplayDialog
    :is-visible="isMemoDialogVisible"
    :patient-name="patientNameForDialog"
    :memos="memosForDialog"
    @close="isMemoDialogVisible = false"
  />
  <BedAssignmentDialog
    :is-visible="isAssignmentDialogVisible"
    :all-patients="allPatients"
    :bed-layout="allBedNumbers"
    :schedule-data="currentRecord.schedule"
    :shifts="ORDERED_SHIFT_CODES"
    :freq-map="freqToDays"
    assignment-mode="singleDay"
    :day-of-week="dayOfWeek"
    :is-page-locked="isPageLocked"
    @close="isAssignmentDialogVisible = false"
    @assign-bed="handleAssignBed"
  />
  <PatientSelectDialog
    :is-visible="isPatientSelectDialogVisible"
    title="選擇病人 (單次排班)"
    :patients="allPatients"
    :show-fill-options="false"
    :is-page-locked="isPageLocked"
    @confirm="handlePatientSelect"
    @cancel="isPatientSelectDialogVisible = false"
  />
  <AlertDialog
    :is-visible="isAlertDialogVisible"
    :title="alertDialogTitle"
    :message="alertDialogMessage"
    @confirm="isAlertDialogVisible = false"
  />
  <ConfirmDialog
    :is-visible="isConfirmDialogVisible"
    title="請確認"
    :message="confirmDialogMessage"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<style scoped>
/* CSS 部分保持原樣 */
.page-container.is-locked .btn,
.page-container.is-locked .add-btn,
.page-container.is-locked input[type='date'] {
  opacity: 0.65;
  cursor: not-allowed;
}

.page-container.is-locked button:disabled,
.page-container.is-locked .btn:disabled {
  pointer-events: none;
}

.page-container.is-locked .page-main-content {
  cursor: not-allowed;
}
.page-container.is-locked .schedule-content,
.page-container.is-locked .sidebar-locked {
  background-color: #f5f5f5;
}

.is-locked [draggable='true'],
.is-locked [contenteditable='true'],
.is-locked .nurse-team-select {
  cursor: not-allowed;
}

.is-locked .memo-icon-inline,
.is-locked :deep(.memo-icon-wrapper) {
  pointer-events: auto;
  cursor: pointer;
}

.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}
.page-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e0e0e0;
  z-index: 10;
}
.page-main-content {
  flex-grow: 1;
  display: flex;
  min-height: 0;
}
.schedule-content {
  flex-grow: 1;
  overflow-y: auto;
  min-width: 0;
}
.inpatient-sidebar {
  flex-shrink: 0;
  width: 240px;
  border-left: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
  height: 100%;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}
.page-title {
  font-size: 32px;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.current-date-text,
.weekday-display {
  font-size: 26px;
  font-weight: bold;
}
.weekday-display {
  color: var(--primary-color);
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}
.controls-panel {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  margin-top: 1rem;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.btn,
button {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  cursor: pointer;
  background-color: #fff;
  transition: all 0.2s ease-in-out;
}
.btn-success {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
}
.btn-success:hover:not(:disabled) {
  background-color: #218838;
}
.btn-info {
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.btn-info:hover:not(:disabled) {
  background-color: #138496;
}
.btn-warning {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn-warning:hover:not(:disabled) {
  background-color: #e0a800;
}
.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.btn-secondary:hover:not(:disabled) {
  background-color: #545b62;
}
.add-btn {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
.add-btn:hover:not(:disabled) {
  background-color: #0069d9;
}
button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.controls-panel input[type='date'] {
  padding: 8px 15px;
  font-size: 0.95em;
  border: 1px solid #ccc;
  border-radius: 6px;
  height: 41px;
  box-sizing: border-box;
  background-color: #fff;
  transition: all 0.2s;
  cursor: pointer;
  white-space: nowrap;
}
.controls-panel input[type='date']:disabled {
  opacity: 0.65;
  cursor: not-allowed;
  background-color: #e9ecef;
}
.dialysis-unit {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 20px 5px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-size: 1.5em;
  letter-spacing: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
}
.left-wing,
.right-wing {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bed-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.bed,
.nursing-station,
.peripheral-bed {
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease-in-out;
}
.bed {
  min-height: 160px;
}
.nursing-station {
  background-color: #f0f4c3;
  border: 2px dashed #afb42b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #558b2f;
  grid-column: span 3;
  padding: 40px 0;
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px;
  text-align: center;
  font-size: 1em;
}
.shift-row,
.peripheral-shift-row {
  position: relative;
  display: grid;
  align-items: stretch;
  border-top: 1px solid #e0e0e0;
  transition: background-color 0.3s;
}
.shift-row {
  grid-template-columns: 28px 50px 1fr 40px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 80px 1fr 50px;
}
.shift-label {
  background-color: #f5f5f5;
  font-size: 0.8em;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e0e0e0;
}
.shift-row > div,
.shift-row > select,
.peripheral-shift-row > div,
.peripheral-shift-row > select {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  min-height: 48px;
  border-left: 1px solid #e0e0e0;
  word-break: break-all;
  text-align: center;
}
.patient-tag {
  font-size: 0.9em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 4px 6px;
  color: #dc3545;
  font-weight: bold;
}
.nurse-team-select {
  padding: 4px;
  border: none;
  font-size: 0.8em;
  width: 100%;
  background: transparent;
  border-radius: 0;
  appearance: none;
  text-align: center;
}
.shift-row.split-shift .nurse-split-column {
  display: flex;
  flex-direction: column;
  padding: 0;
}
.nurse-split-column .nurse-team-select {
  flex-grow: 1;
  height: 50%;
}
.nurse-split-column .nurse-team-select:first-child {
  border-bottom: 1px solid #e0e0e0;
}
.bed.hepatitis .bed-header {
  background-color: var(--hepatitis-bg);
  color: #af8203;
}
.bed.unassigned .bed-header {
  background-color: #bdbdbd;
  color: #424242;
}
.bed.unassigned .shift-row {
  display: none;
}
.bed.aisle-side.right-wing-bed {
  border-left: 5px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 5px solid #4caf50;
}
.shift-row.status-opd,
.peripheral-shift-row.status-opd {
  background-color: var(--green-bg, #e8f5e9);
}
.shift-row.status-ipd,
.peripheral-shift-row.status-ipd {
  background-color: var(--red-bg, #ffebee);
}
.shift-row.status-er,
.peripheral-shift-row.status-er {
  background-color: var(--purple-bg, #e9d5ff);
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #8cbdf6;
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #f5ec8e;
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa;
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0;
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4;
}
.patient-name,
.peripheral-patient-name {
  font-size: 1.1em;
  font-weight: bold;
  padding: 4px 6px;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.empty-slot-placeholder {
  color: #adb5bd;
  font-size: 1.5rem;
  user-select: none;
  transition: color 0.2s;
}
.patient-name:hover .empty-slot-placeholder,
.peripheral-patient-name:hover .empty-slot-placeholder {
  color: #007bff;
}
.patient-name.drag-over,
.peripheral-patient-name.drag-over {
  background-color: #c8e6c9 !important;
  border: 2px dashed #4caf50;
}
.extra-sections {
  margin-top: 30px;
}
.peripheral-section {
  margin-bottom: 20px;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 10px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  color: #c2185b;
}
.team-highlight-container {
  display: flex;
  gap: 1rem;
  padding: 8px;
  background-color: #e9ecef;
  border-radius: 8px;
}
.team-group {
  display: flex;
  align-items: center;
}
.team-group-label {
  font-weight: bold;
  font-size: 1.2rem;
  color: #495057;
  margin-right: 8px;
  writing-mode: vertical-rl;
  background-color: #ced4da;
  padding: 8px 4px;
  border-radius: 4px;
}
.team-group:first-of-type .team-group-label {
  background-color: #ffe082;
  color: #333;
}
.team-group:last-of-type .team-group-label {
  background-color: #90caf9;
  color: #333;
}
.team-buttons {
  display: flex;
  border: 1px solid #ced4da;
  border-radius: 6px;
  overflow: hidden;
}
.team-btn {
  padding: 6px 12px;
  font-size: 0.9em;
  min-width: 40px;
  border: none;
  border-left: 1px solid #ced4da;
  background-color: #fff;
  transition: all 0.2s;
}
.team-buttons .team-btn:first-child {
  border-left: none;
}
.team-btn.active {
  background-color: #dc3545;
  color: white;
  border-color: #c82333;
}
.shift-row.highlighted-slot,
.peripheral-shift-row.highlighted-slot {
  outline: 3px solid #dc3545;
  outline-offset: -3px;
  z-index: 1;
}
.memo-icon-inline {
  position: relative;
  z-index: 2;
}
.patient-name {
  position: relative;
}
</style>
