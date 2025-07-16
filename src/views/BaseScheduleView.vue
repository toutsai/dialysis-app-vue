<!-- 檔案路徑: src/views/BaseScheduleView.vue (修改為 門住總床位表，並增強排程檢視) -->
<script setup>
import { ref, onMounted, computed, provide, nextTick } from 'vue'

import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'

import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { ORDERED_SHIFT_CODES } from '@/constants/scheduleConstants'
import { createEmptySlotData, generateAutoNote } from '@/utils/scheduleUtils.js'
import SelectionDialog from '@/components/SelectionDialog.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import ScheduleTable from '@/components/ScheduleTable.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import BedAssignmentDialog from '@/components/BedAssignmentDialog.vue'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'

// --- API and Constants ---
const baseSchedulesApi = ApiManager('base_schedules')

const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
const bedLayout = [
  1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 15, 16, 17, 18, 19, 21, 22, 23, 25, 26, 27, 28, 29, 31, 32,
  33, 35, 36, 37, 38, 39, 51, 52, 53, 55, 56, 57, 58, 59, 61, 62, 63, 65,
].sort((a, b) => a - b)
const hepatitisBeds = [31, 32, 33, 35, 36]
const FREQ_MAP_TO_DAY_INDEX = {
  一三五: [0, 2, 4],
  二四六: [1, 3, 5],
  一四: [0, 3],
  二五: [1, 4],
  三六: [2, 5],
  一五: [0, 4],
  二六: [1, 5],
}
const STYLE_PRIORITY = {
  抽: { class: 'tag-chou' },
  新: { class: 'tag-new' },
  住: { class: 'tag-ip' },
  換: { class: 'tag-huan' },
  兩: { class: 'tag-liang' },
  B: { class: 'tag-b' },
}
const CLEAR_OPTIONS = [
  { value: 'single', text: '僅清除此班次' },
  { value: 'all_for_patient', text: '清除此病人在本表的所有排班' },
]

// --- Reactive State ---
const allPatients = ref([])
const masterRecord = ref(null)
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusText = ref('')
const draggedItem = ref(null)
const columnWidths = ref([])
const leftOffset = ref(0)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isAssignmentDialogVisible = ref(false)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)

// --- 搜尋相關狀態 ---
const searchQuery = ref('')
const isSearchFocused = ref(false)

// --- 權限狀態 ---
const auth = useAuth()
const isPageLocked = computed(() => !auth.canEditSchedules.value)

// --- Helper functions for state ---
function updateLeftOffset(newOffset) {
  leftOffset.value = newOffset
}
function updateColumnWidths(newWidths) {
  columnWidths.value = newWidths
}

// --- Computed Properties ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))

const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const statsToolbarData = computed(() => {
  const dailyCounts = Array.from({ length: 6 }).map(() => ({
    counts: {
      early: { total: 0, opd: 0, ipd: 0, er: 0 },
      noon: { total: 0, opd: 0, ipd: 0, er: 0 },
      late: { total: 0, opd: 0, ipd: 0, er: 0 },
    },
    total: 0,
  }))
  if (!masterRecord.value || !masterRecord.value.schedule) {
    return dailyCounts
  }
  const localPatientMap = patientMap.value
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const patient = localPatientMap.get(slotData.patientId)
      if (!patient) continue
      const [, shiftIndex, dayIndex] = slotId.split('-').map(Number)
      if (dayIndex >= 0 && dayIndex < 6) {
        const shiftCode = SHIFTS[shiftIndex]
        const shiftStats = dailyCounts[dayIndex].counts[shiftCode]
        if (shiftStats) {
          shiftStats.total++
          if (patient.status === 'opd') shiftStats.opd++
          else if (patient.status === 'ipd') shiftStats.ipd++
          else if (patient.status === 'er') shiftStats.er++
          dailyCounts[dayIndex].total++
        }
      }
    }
  }
  return dailyCounts
})
const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))

const searchResults = computed(() => {
  if (!searchQuery.value) {
    return []
  }
  const query = searchQuery.value.toLowerCase()
  return allPatients.value
    .filter((p) => {
      const nameMatch = p.name && p.name.toLowerCase().includes(query)
      const mrnMatch = p.medicalRecordNumber && p.medicalRecordNumber.includes(query)
      return nameMatch || mrnMatch
    })
    .slice(0, 5)
})

// --- Functions ---
function handleSearchBlur() {
  setTimeout(() => {
    isSearchFocused.value = false
  }, 200)
}

function locatePatientOnGrid(patientId) {
  console.log(`🔍 [BaseScheduleView] 搜尋病人: ${patientId}`)
  searchQuery.value = ''
  isSearchFocused.value = false

  if (!masterRecord.value || !masterRecord.value.schedule) return

  const targetSlotId = Object.keys(masterRecord.value.schedule).find(
    (slotId) => masterRecord.value.schedule[slotId]?.patientId === patientId,
  )

  if (!targetSlotId) {
    console.log(`⚠️ [BaseScheduleView] 病人 ${patientId} 未在總床位表中`)
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '該病人未被排入總床位表。'
    isAlertDialogVisible.value = true
    return
  }

  console.log(`✅ [BaseScheduleView] 找到病人位置: ${targetSlotId}`)
  nextTick(() => {
    const targetElement = document.querySelector(`[data-slot-id="${targetSlotId}"]`)
    if (targetElement) {
      targetElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
        inline: 'center',
      })
      targetElement.classList.add('highlight-flash')
      setTimeout(() => {
        targetElement.classList.remove('highlight-flash')
      }, 2000)
      console.log(`🎯 [BaseScheduleView] 病人定位完成，高亮 2 秒`)
    }
  })
}

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  console.log(`📝 [BaseScheduleView] 顯示病人備忘錄: ${patient.name}`)
  memosForDialog.value = activeMemos.value.filter(
    (memo) => memo.patientId === patientId && memo.status === 'pending',
  )
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
  console.log(`📝 [BaseScheduleView] 標記變更需要儲存`)
}

async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '權限不足，無法儲存。'
    isAlertDialogVisible.value = true
    return
  }

  console.log('💾 [BaseScheduleView] 開始儲存總床位表變更...')
  statusText.value = '儲存中...'

  try {
    const docId = 'MASTER_SCHEDULE'
    const scheduleToSave = {}

    let savedSlotCount = 0
    for (const slotId in masterRecord.value.schedule) {
      const slotData = masterRecord.value.schedule[slotId]
      if (slotData && slotData.patientId) {
        scheduleToSave[slotId] = {
          patientId: slotData.patientId,
          autoNote: slotData.autoNote || '',
          manualNote: slotData.manualNote || '',
        }
        savedSlotCount++
      }
    }

    console.log(`📊 [BaseScheduleView] 準備儲存 ${savedSlotCount} 個床位排班`)

    const dataPayload = {
      schedule: scheduleToSave,
      updatedAt: new Date(),
    }

    await baseSchedulesApi.save(docId, dataPayload)

    if (!masterRecord.value.id) {
      masterRecord.value.id = docId
    }

    hasUnsavedChanges.value = false
    statusText.value = '床位儲存成功！'

    console.log(`✅ [BaseScheduleView] 總床位表儲存成功: ${savedSlotCount} 個床位`)

    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '門住總床位表已成功儲存！'
    isAlertDialogVisible.value = true
  } catch (error) {
    console.error('❌ [BaseScheduleView] 儲存失敗:', error)
    statusText.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗，請檢查網路連線或聯繫管理員。\n錯誤: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

// ✨ [修改] 增強排程檢視功能
function handleScheduleCheck() {
  console.log(`🔍 [BaseScheduleView] 開始排班檢查...`)
  const results = runBedCheck()
  let issueMessage = ''

  if (results.unassignedCrucial.length > 0) {
    issueMessage += '【重要病人未排床】:\n- ' + results.unassignedCrucial.join('\n- ') + '\n\n'
  }
  if (results.freqMismatch.length > 0) {
    issueMessage += '【門診頻率不符】:\n- ' + results.freqMismatch.join('\n- ') + '\n\n'
  }
  if (results.duplicates.length > 0) {
    issueMessage += '【同日重複排班】:\n- ' + results.duplicates.join('\n- ') + '\n\n'
  }

  if (issueMessage) {
    console.log(`⚠️ [BaseScheduleView] 發現排班問題`)
    alertDialogTitle.value = '排班問題檢查結果'
    alertDialogMessage.value = issueMessage
  } else {
    console.log(`✅ [BaseScheduleView] 排班檢查通過，無問題`)
    alertDialogTitle.value = '排程檢視完畢'
    alertDialogMessage.value = '太棒了！未發現重複排班或頻率不符的問題。'
  }
  isAlertDialogVisible.value = true
}

function openBedAssignmentDialog() {
  if (isPageLocked.value) return
  console.log(`🏥 [BaseScheduleView] 開啟智慧排床對話框`)
  isAssignmentDialogVisible.value = true
}

function handleAssignBed({ patientId, bedNum, shiftCode }) {
  if (isPageLocked.value) return
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return

  console.log(`🛏️ [BaseScheduleView] 智慧排床: ${patient.name} -> 床位 ${bedNum}, ${shiftCode} 班`)

  const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
  const shiftIndex = SHIFTS.indexOf(shiftCode)
  if (shiftIndex === -1) {
    console.warn(`[BaseScheduleView] 無效的班別代碼: ${shiftCode}`)
    return
  }

  // ✨ [修改] 允許沒有頻率的病人單次排入
  if (dayIndices.length === 0) {
    console.log(`[BaseScheduleView] 病人 ${patient.name} 無有效頻率，將進行單次排班`)
    // 這裡我們需要一個方法來確定要排在哪一天，目前智慧排床是基於頻率的。
    // 為了安全起見，提示用戶手動排班。
    alertDialogTitle.value = '智慧排床提示'
    alertDialogMessage.value = `病人 ${patient.name} 沒有設定常規頻率，請從空床位手動點擊排入。`
    isAlertDialogVisible.value = true
    return
  }

  const newSchedule = { ...masterRecord.value.schedule }
  dayIndices.forEach((dayIndex) => {
    const slotId = `${bedNum}-${shiftIndex}-${dayIndex}`
    newSchedule[slotId] = {
      ...createEmptySlotData(slotId),
      patientId: patientId,
      autoNote: generateAutoNote(patient),
      manualNote: patient.baseNote || '',
    }
  })

  masterRecord.value.schedule = newSchedule
  setChange()
  console.log(`✅ [BaseScheduleView] 智慧排床完成: ${dayIndices.length} 個時段`)
}

function handleGridClick(slotId) {
  const patientId = masterRecord.value.schedule[slotId]?.patientId

  if (isPageLocked.value) {
    if (patientId) {
      showPatientMemos(patientId)
    }
    return
  }

  if (patientId) {
    console.log(`🗑️ [BaseScheduleView] 點擊清除床位: ${slotId}`)
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    console.log(`➕ [BaseScheduleView] 點擊空床位，選擇病人: ${slotId}`)
    currentSlotId.value = slotId
    isPatientSelectDialogVisible.value = true
  }
}

function handlePatientSelect({ patientId, fillType }) {
  if (isPageLocked.value) return
  if (!patientId || !currentSlotId.value) return

  const patient = patientMap.value.get(patientId)
  if (!patient) return

  console.log(`👤 [BaseScheduleView] 選擇病人排班: ${patient.name}, 模式: ${fillType}`)

  isPatientSelectDialogVisible.value = false
  const newPatientData = {
    patientId: patientId,
    manualNote: patient.baseNote || '',
    autoNote: generateAutoNote(patient),
  }

  const newSchedule = { ...masterRecord.value.schedule }

  if (fillType === 'single') {
    newSchedule[currentSlotId.value] = newPatientData
    console.log(`✅ [BaseScheduleView] 單次排班完成`)
  } else if (fillType === 'frequency') {
    const dayIndices = FREQ_MAP_TO_DAY_INDEX[patient.freq] || []
    if (dayIndices.length === 0) {
      alertDialogTitle.value = '排班提示'
      alertDialogMessage.value = `病人 ${patient.name} 未設定有效頻率，僅單次排入。`
      isAlertDialogVisible.value = true
      newSchedule[currentSlotId.value] = newPatientData
      masterRecord.value.schedule = newSchedule
      setChange()
      currentSlotId.value = null
      return
    }

    const conflicts = []
    const parts = currentSlotId.value.split('-')
    const bed = parts[0]
    const shiftIndex = parts[1]

    dayIndices.forEach((dayIndex) => {
      const slotId = `${bed}-${shiftIndex}-${dayIndex}`
      if (newSchedule[slotId]?.patientId) {
        conflicts.push(`${WEEKDAYS[dayIndex]}`)
      }
    })

    if (conflicts.length > 0) {
      console.log(`⚠️ [BaseScheduleView] 頻率排班衝突: ${conflicts.join(', ')}`)
      alertDialogTitle.value = '排班衝突'
      alertDialogMessage.value = `無法依頻率排入，以下日期的床位已被佔用：\n${conflicts.join(', ')}`
      isAlertDialogVisible.value = true
    } else {
      dayIndices.forEach((dayIndex) => {
        const slotId = `${bed}-${shiftIndex}-${dayIndex}`
        newSchedule[slotId] = newPatientData
      })
      console.log(`✅ [BaseScheduleView] 頻率排班完成: ${dayIndices.length} 個時段`)
    }
  }

  masterRecord.value.schedule = newSchedule
  setChange()
  currentSlotId.value = null
}

function handleClearSelect(selectedValue) {
  if (isPageLocked.value) return
  if (!clearingSlotId.value) return

  const newSchedule = { ...masterRecord.value.schedule }

  if (selectedValue === 'single') {
    console.log(`🗑️ [BaseScheduleView] 清除單個床位: ${clearingSlotId.value}`)
    delete newSchedule[clearingSlotId.value]
  } else if (selectedValue === 'all_for_patient') {
    const patientIdToClear = newSchedule[clearingSlotId.value]?.patientId
    if (patientIdToClear) {
      const patient = patientMap.value.get(patientIdToClear)
      console.log(`🗑️ [BaseScheduleView] 清除病人所有排班: ${patient?.name || patientIdToClear}`)

      let clearedCount = 0
      Object.keys(newSchedule).forEach((slotId) => {
        if (newSchedule[slotId]?.patientId === patientIdToClear) {
          delete newSchedule[slotId]
          clearedCount++
        }
      })
      console.log(`✅ [BaseScheduleView] 已清除 ${clearedCount} 個床位`)
    }
  }

  masterRecord.value.schedule = newSchedule
  setChange()
  isClearDialogVisible.value = false
  clearingSlotId.value = null
}

function onDrop(event, targetSlotId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop || !itemToDrop.patientId) return

  const newSchedule = { ...masterRecord.value.schedule }
  const sourceSlotId = itemToDrop.sourceSlotId
  const targetSlotData = newSchedule[targetSlotId]

  if (targetSlotData && targetSlotData.patientId) {
    console.log(`🔄 [BaseScheduleView] 拖拽交換: ${sourceSlotId} <-> ${targetSlotId}`)
    const sourceSlotData = { ...newSchedule[sourceSlotId] }
    newSchedule[targetSlotId] = {
      ...sourceSlotData,
      shiftId: targetSlotId,
      sourceSlotId: undefined,
    }
    newSchedule[sourceSlotId] = {
      ...targetSlotData,
      shiftId: sourceSlotId,
      sourceSlotId: undefined,
    }
  } else {
    console.log(`➡️ [BaseScheduleView] 拖拽移動: ${sourceSlotId} -> ${targetSlotId}`)
    newSchedule[targetSlotId] = { ...itemToDrop, shiftId: targetSlotId, sourceSlotId: undefined }
    delete newSchedule[sourceSlotId]
  }

  masterRecord.value.schedule = newSchedule
  setChange()
  draggedItem.value = null
}

function onDragStart(event, slotId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = masterRecord.value.schedule[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  console.log(`🖱️ [BaseScheduleView] 開始拖拽: ${slotId}`)
  draggedItem.value = { ...slotData, sourceSlotId: slotId }
  event.dataTransfer.effectAllowed = 'move'
}

async function loadAllData() {
  console.log('🚀 [BaseScheduleView] 組件已掛載，開始初始化...')
  statusText.value = '讀取中...'

  try {
    console.log('🔄 [BaseScheduleView] 開始載入總床位表資料...')

    const [patients, memos] = await Promise.all([
      optimizedFetchAllPatients([where('isDeleted', '==', false)]),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
    ])

    console.log(
      `🔍 [BaseScheduleView] 過濾檢查: 載入 ${patients.length} 位可排班病人 (門診/住院/急診)`,
    )

    const baseScheduleDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')

    console.log(`✅ [BaseScheduleView] 資料載入完成:`)
    console.log(`   - 患者: ${patients.length} 位`)
    console.log(`   - 備忘錄: ${memos.length} 筆`)
    console.log(`   - 基礎排程: ${baseScheduleDoc ? '已載入' : '無資料'}`)

    allPatients.value = patients
    activeMemos.value = memos

    const tempPatientMap = new Map(patients.map((p) => [p.id, p]))

    if (baseScheduleDoc) {
      const loadedSchedule = baseScheduleDoc.schedule || {}
      const finalSchedule = {}
      let validSlotCount = 0

      for (const slotId in loadedSchedule) {
        const dbSlotData = loadedSchedule[slotId]
        if (dbSlotData && dbSlotData.patientId && tempPatientMap.has(dbSlotData.patientId)) {
          const patient = tempPatientMap.get(dbSlotData.patientId)
          const standardSlot = createEmptySlotData(slotId)

          if (patient) {
            standardSlot.autoNote = generateAutoNote(patient)
          }
          standardSlot.manualNote = dbSlotData.manualNote || dbSlotData.note || ''
          standardSlot.patientId = dbSlotData.patientId
          finalSchedule[slotId] = standardSlot
          validSlotCount++
        }
      }

      console.log(`📊 [BaseScheduleView] 處理完成: ${validSlotCount} 個有效床位排班`)
      masterRecord.value = { id: baseScheduleDoc.id, schedule: finalSchedule }
    } else {
      console.log(`📝 [BaseScheduleView] 初始化空白總床位表`)
      masterRecord.value = { schedule: {} }
    }

    statusText.value = '總床位表已載入'
  } catch (error) {
    console.error('❌ [BaseScheduleView] 載入資料失敗:', error)
    statusText.value = '讀取失敗'
  }
}

// ✨ [修改] 增強的排程檢查邏輯
function runBedCheck() {
  console.log(`🔍 [BaseScheduleView] 執行床位檢查...`)
  // ✨ [修改] 新增 unassignedCrucial 用於存放未排床的住院/急診病人
  const validationResult = { freqMismatch: [], duplicates: [], unassignedCrucial: [] }
  const patientSchedules = {}
  const scheduledPatientIds = new Set()

  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData?.patientId) {
      if (!patientSchedules[slotData.patientId]) {
        patientSchedules[slotData.patientId] = []
      }
      patientSchedules[slotData.patientId].push(slotId)
      scheduledPatientIds.add(slotData.patientId)
    }
  }

  // ✨ [修改] 新增檢查：遍歷所有病人，找出未排床的住院/急診病人
  allPatients.value.forEach((p) => {
    if ((p.status === 'ipd' || p.status === 'er') && !scheduledPatientIds.has(p.id)) {
      validationResult.unassignedCrucial.push(`${p.name} (${p.status === 'ipd' ? '住院' : '急診'})`)
    }
  })

  // 檢查門診頻率是否符合
  for (const patientId in patientSchedules) {
    const patient = patientMap.value.get(patientId)
    // 只檢查門診病人的頻率
    if (!patient || !patient.freq || patient.status !== 'opd') continue

    const scheduledDays = new Set(
      patientSchedules[patientId].map((slotId) => parseInt(slotId.split('-')[2], 10)),
    )
    const expectedDays = new Set(FREQ_MAP_TO_DAY_INDEX[patient.freq] || [])

    const actualDaysArray = Array.from(scheduledDays).sort()
    const expectedDaysArray = Array.from(expectedDays).sort()

    if (JSON.stringify(actualDaysArray) !== JSON.stringify(expectedDaysArray)) {
      const actualDaysText = actualDaysArray.map((d) => WEEKDAYS[d].replace('星期', '')).join('')
      validationResult.freqMismatch.push(
        `${patient.name} (應排 ${patient.freq})，卻排在 ${actualDaysText}。`,
      )
    }
  }

  // 檢查同日重複排班
  const dailyPatientSets = Array.from({ length: 6 }).map(() => new Set())
  for (const slotId in masterRecord.value.schedule) {
    const slotData = masterRecord.value.schedule[slotId]
    if (slotData && slotData.patientId) {
      const dayIndex = parseInt(slotId.split('-')[2], 10)
      const patientName = patientMap.value.get(slotData.patientId)?.name
      if (patientName) {
        if (dailyPatientSets[dayIndex].has(patientName)) {
          validationResult.duplicates.push(
            `病人 ${patientName} 在 ${WEEKDAYS[dayIndex]} 出現超過一次。`,
          )
        } else {
          dailyPatientSets[dayIndex].add(patientName)
        }
      }
    }
  }

  console.log(`✅ [BaseScheduleView] 床位檢查完成`, validationResult)
  return validationResult
}

function handleConflictConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function handleConflictCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function getBaseCellStyle(slotId) {
  if (!masterRecord.value || !masterRecord.value.schedule) return {}
  const slotData = masterRecord.value.schedule[slotId]
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}

  const combinedNote = `${slotData.autoNote || ''} ${slotData.manualNote || ''}`.trim()
  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      if (key === '住' || key === '隔' || key === 'R') {
        return { 'status-ipd': true }
      }
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }
  if (patient.status === 'er') return { 'status-er': true }
  if (patient.status === 'ipd') return { 'status-ipd': true }
  if (patient.status === 'opd') return { 'status-opd': true }
  return {}
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot) {
    targetSlot.classList.add('drag-over')
  }
}

function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(loadAllData)
</script>

<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">門住總床位表</h1>
          <button class="btn btn-warning" @click="handleScheduleCheck">排程檢視</button>
          <button class="btn btn-info" @click="openBedAssignmentDialog" :disabled="isPageLocked">
            智慧排床
          </button>
          <div class="search-container">
            <input
              type="text"
              v-model="searchQuery"
              class="patient-search-input"
              placeholder="搜尋病人姓名/病歷號..."
              @focus="isSearchFocused = true"
              @blur="handleSearchBlur"
            />
            <ul v-if="searchResults.length > 0 && isSearchFocused" class="search-results">
              <li
                v-for="patient in searchResults"
                :key="patient.id"
                @click="locatePatientOnGrid(patient.id)"
              >
                {{ patient.name }} - {{ patient.medicalRecordNumber }}
              </li>
            </ul>
          </div>
        </div>
        <div class="toolbar-right">
          <span class="status-text">{{ statusText }}</span>
          <button
            class="btn-save"
            :disabled="!hasUnsavedChanges || isPageLocked"
            @click="saveChangesToCloud"
          >
            儲存床位
          </button>
        </div>
      </div>
    </header>

    <main class="page-main-content">
      <div class="schedule-area">
        <div class="stats-toolbar-wrapper" :style="{ paddingLeft: `${leftOffset}px` }">
          <StatsToolbar
            :stats-data="statsToolbarData"
            :weekdays="statsToolbarWeekdays"
            :column-widths="columnWidths"
            size="normal"
          />
        </div>
        <ScheduleTable
          v-if="masterRecord"
          class="schedule-table-component"
          :layout="bedLayout"
          :schedule-data="masterRecord.schedule"
          :patient-map="patientMap"
          :shifts="SHIFTS"
          :weekdays="WEEKDAYS"
          :week-dates="[]"
          :hepatitis-beds="hepatitisBeds"
          :get-style-func="getBaseCellStyle"
          :patient-with-memo-ids="patientWithMemoIds"
          :is-page-locked="isPageLocked"
          @grid-click="handleGridClick"
          @drop="onDrop"
          @drag-start="onDragStart"
          @drag-over="onDragOver"
          @dragleave="onDragLeave"
          @show-memos="showPatientMemos"
          @update:column-widths="updateColumnWidths"
          @update:left-offset="updateLeftOffset"
        />
        <div v-else class="loading-state">正在載入總床位表資料...</div>
      </div>
    </main>

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedAssignmentDialog
      :is-visible="isAssignmentDialogVisible"
      :all-patients="allPatients"
      :bed-layout="bedLayout"
      :schedule-data="masterRecord ? masterRecord.schedule : {}"
      :shifts="SHIFTS"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      assignment-mode="base"
      :is-page-locked="isPageLocked"
      @close="isAssignmentDialogVisible = false"
      @assign-bed="handleAssignBed"
    />
    <PatientSelectDialog
      :is-visible="isPatientSelectDialogVisible"
      title="選擇病人排班 (總表)"
      :patients="allPatients"
      :show-fill-options="true"
      :is-page-locked="isPageLocked"
      @confirm="handlePatientSelect"
      @cancel="isPatientSelectDialogVisible = false"
    />
    <SelectionDialog
      :is-visible="isClearDialogVisible"
      title="清除排班選項"
      :options="CLEAR_OPTIONS"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConflictConfirm"
      @cancel="handleConflictCancel"
    />
  </div>
</template>

<style scoped>
.search-container {
  position: relative;
  display: inline-block;
}

.patient-search-input {
  padding: 8px 16px;
  border: 1px solid #ced4da;
  border-radius: 6px;
  width: 220px;
  height: 45px;
  box-sizing: border-box;
  transition: all 0.2s;
  font-size: 1rem;
}
.patient-search-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  background-color: white;
  border: 1px solid #ccc;
  border-top: none;
  border-radius: 0 0 4px 4px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
  z-index: 1000;
}

.search-results li {
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid #eee;
}

.search-results li:last-child {
  border-bottom: none;
}

.search-results li:hover {
  background-color: #f0f0f0;
}

@keyframes highlight-animation {
  0% {
    background-color: #fffbe3;
    outline: 3px solid #f8c000;
  }
  100% {
    background-color: transparent;
    outline: 3px solid transparent;
  }
}

:deep(.highlight-flash) {
  animation: highlight-animation 2s ease-out;
}

.page-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  box-sizing: border-box;
}
.page-header {
  flex-shrink: 0;
  padding: 0 0 10px 0;
  box-sizing: border-box;
}
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 16px;
}
.page-title {
  font-size: 32px;
  font-weight: 600;
  margin: 0;
  color: #343a40;
}
.toolbar-left .btn,
.toolbar-right .btn-save,
.toolbar-left button,
.toolbar-right button {
  padding: 8px 16px;
  font-size: 1rem;
  line-height: 1.5;
  border-radius: 6px;
  border: 1px solid #ced4da;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  color: #212529;
}
.toolbar-left .btn:hover {
  border-color: #adb5bd;
  background-color: #f8f9fa;
}
.btn.btn-info {
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.btn.btn-info:hover {
  background-color: #138496;
  border-color: #117a8b;
}
.btn.btn-warning {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn.btn-warning:hover {
  background-color: #e0a800;
  border-color: #d39e00;
}
.btn-save {
  background-color: #007bff;
  border-color: #007bff;
  color: white;
}
.btn-save:hover:not(:disabled) {
  background-color: #0069d9;
  border-color: #0062cc;
}
.btn-save:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.65;
}
.status-text {
  color: #6c757d;
  font-style: italic;
  font-size: 0.9rem;
}

.page-main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  background-color: #fff;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #dee2e6;
}

.schedule-area {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.stats-toolbar-wrapper {
  flex-shrink: 0;
  padding: 8px 1rem;
  box-sizing: border-box;
  transition: padding-left 0.2s ease-in-out;
}

.schedule-table-component {
  flex-grow: 1;
  overflow: auto;
}

:deep(.schedule-slot.status-opd) {
  background-color: var(--green-bg, #e8f5e9);
}
:deep(.schedule-slot.status-ipd) {
  background-color: var(--red-bg, #ffebee);
}
:deep(.schedule-slot.status-er) {
  background-color: var(--purple-bg, #f3e5f5);
}
:deep(.schedule-slot.status-biweekly) {
  background-color: var(--orange-bg, #fff3e0);
}
:deep(.schedule-slot.tag-chou) {
  background-color: #e3f2fd;
}
:deep(.schedule-slot.tag-new) {
  background-color: #fffde7;
}
:deep(.schedule-slot.tag-huan) {
  background-color: #e0f7fa;
}
:deep(.schedule-slot.tag-liang) {
  background-color: #fff3e0;
}
:deep(.schedule-slot.tag-b) {
  background-color: #fff9c4;
}

.is-locked .page-header button:not(:disabled) {
  opacity: 0.65;
  pointer-events: none;
  cursor: default;
}
.is-locked .page-main-content {
  background-color: #fafafa;
}
.is-locked :deep(.schedule-slot) {
  cursor: not-allowed;
}

.is-locked :deep(.memo-icon-wrapper) {
  pointer-events: auto;
  cursor: pointer;
}

.is-locked :deep(.schedule-slot[draggable='true']) {
  cursor: not-allowed;
}

.loading-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  font-size: 1.5rem;
  color: #6c757d;
}
</style>
