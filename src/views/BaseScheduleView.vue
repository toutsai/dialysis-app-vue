<!-- 檔案路徑: src/views/BaseScheduleView.vue (修正顏色顯示優先級 - 完整無省略) -->
<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">門住總床位表</h1>
          <button class="btn btn-warning" @click="handleScheduleCheck">排程檢視</button>
          <button class="btn btn-info" @click="openBaseAssignmentDialog" :disabled="isPageLocked">
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
          :schedule-data="weekScheduleMap"
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

    <SelectionDialog
      :is-visible="isActionDialogVisible"
      :title="`操作病人：${actionTarget.patientName}`"
      :options="ACTION_OPTIONS"
      @select="handleActionSelect"
      @cancel="isActionDialogVisible = false"
    />
    <BedAssignmentDialog
      :is-visible="isAssignmentDialogVisible"
      :all-patients="allPatients"
      :bed-layout="bedLayout"
      :schedule-data="weekScheduleMap"
      :shifts="SHIFTS"
      :freq-map="FREQ_MAP_TO_DAY_INDEX"
      :context="assignmentContext"
      :is-page-locked="isPageLocked"
      @close="isAssignmentDialogVisible = false"
      @assign-bed="handleBedAssigned"
    />
    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <PatientSelectDialog
      :is-visible="isPatientSelectDialogVisible"
      title="選擇病人排班 (總表)"
      :patients="allPatients.filter((p) => p.freq)"
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
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, provide, nextTick } from 'vue'
import {
  fetchAllPatients as optimizedFetchAllPatients,
  updatePatient,
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
import { getUnifiedCellStyle } from '@/utils/scheduleUtils.js'

// --- API and Constants ---
const baseSchedulesApi = ApiManager('base_schedules')

const SHIFTS = ORDERED_SHIFT_CODES
const WEEKDAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
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
  // ✅ 新增：外圍床位 1-6
  ...Array.from({ length: 6 }, (_, i) => `peripheral-${i + 1}`),
].sort((a, b) => {
  // ✅ 新增：更新排序邏輯以處理外圍床位
  const numA = typeof a === 'number' ? a : Infinity
  const numB = typeof b === 'number' ? b : Infinity
  if (numA !== Infinity || numB !== Infinity) return numA - numB
  return String(a).localeCompare(String(b))
})
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
const ACTION_OPTIONS = [
  { value: 'delete_rule', text: '刪除此排班規則' },
  { value: 'change_freq_and_bed', text: '變更頻率與床位' },
  { value: 'change_bed_only', text: '僅更換床位 (同頻率)' },
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
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isPatientSelectDialogVisible = ref(false)
const currentSlotId = ref(null)
const searchQuery = ref('')
const isSearchFocused = ref(false)
const auth = useAuth()

const isActionDialogVisible = ref(false)
const actionTarget = ref({ patientId: null, ruleId: null, patientName: '' })
const isAssignmentDialogVisible = ref(false)
const assignmentContext = ref({ mode: 'base', patient: null, originalRuleId: null })

// --- Computed Properties ---
const isPageLocked = computed(() => !auth.canEditSchedules.value)
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)

// 6. 確保 weekScheduleMap 正確計算
const weekScheduleMap = computed(() => {
  const combinedSchedule = {}
  if (!masterRecord.value || !masterRecord.value.schedule) {
    return combinedSchedule
  }

  for (const ruleId in masterRecord.value.schedule) {
    const ruleData = masterRecord.value.schedule[ruleId]
    if (ruleData && ruleData.patientId && ruleData.freq) {
      const dayIndices = FREQ_MAP_TO_DAY_INDEX[ruleData.freq] || []

      // 🔥 關鍵修正：正確解析新格式的 ruleId
      const parts = ruleId.split('-')
      let bedNum, shiftIndex

      if (parts.length >= 3) {
        const lastPart = parts[parts.length - 1]

        // 檢查最後一部分是否為頻率
        if (Object.keys(FREQ_MAP_TO_DAY_INDEX).includes(lastPart)) {
          // 新格式
          if (parts[0] === 'peripheral') {
            // peripheral-1-0-一三五
            bedNum = `${parts[0]}-${parts[1]}`
            shiftIndex = parseInt(parts[2], 10)
          } else {
            // 1-0-一三五
            bedNum = parts[0]
            shiftIndex = parseInt(parts[1], 10)
          }
        } else {
          // 舊格式：向後相容
          bedNum = parts[0]
          shiftIndex = parseInt(parts[1], 10)
        }
      } else {
        // 舊格式：向後相容
        bedNum = parts[0]
        shiftIndex = parseInt(parts[1], 10)
      }

      if (!isNaN(shiftIndex)) {
        dayIndices.forEach((dayIndex) => {
          const weeklySlotId = `${bedNum}-${shiftIndex}-${dayIndex}`
          combinedSchedule[weeklySlotId] = ruleData
        })
      }
    }
  }
  return combinedSchedule
})

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
  for (const ruleId in masterRecord.value.schedule) {
    const ruleData = masterRecord.value.schedule[ruleId]
    if (ruleData && ruleData.patientId) {
      const patient = localPatientMap.get(ruleData.patientId)
      if (!patient) continue
      const dayIndices = FREQ_MAP_TO_DAY_INDEX[ruleData.freq] || []
      const [, shiftIndexStr] = ruleId.split('-')
      const shiftCode = SHIFTS[parseInt(shiftIndexStr, 10)]
      dayIndices.forEach((dayIndex) => {
        if (dayIndex >= 0 && dayIndex < 6 && shiftCode) {
          const shiftStats = dailyCounts[dayIndex].counts[shiftCode]
          if (shiftStats) {
            shiftStats.total++
            if (patient.status === 'opd') shiftStats.opd++
            else if (patient.status === 'ipd') shiftStats.ipd++
            else if (patient.status === 'er') shiftStats.er++
            dailyCounts[dayIndex].total++
          }
        }
      })
    }
  }
  return dailyCounts
})

const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))
const shiftDisplayNames = { early: '早班', noon: '午班', late: '晚班' }
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
function getBaseCellStyle(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  const patient = patientMap.value.get(slotData?.patientId)
  return getUnifiedCellStyle(slotData, patient)
}

function updateLeftOffset(newOffset) {
  leftOffset.value = newOffset
}

function updateColumnWidths(newWidths) {
  columnWidths.value = newWidths
}

function handleSearchBlur() {
  setTimeout(() => {
    isSearchFocused.value = false
  }, 200)
}

// 1. 頻率衝突檢測函數
function hasFrequencyConflict(freq1, freq2) {
  if (!freq1 || !freq2) return false
  if (freq1 === freq2) return true // 相同頻率一定衝突

  const days1 = FREQ_MAP_TO_DAY_INDEX[freq1] || []
  const days2 = FREQ_MAP_TO_DAY_INDEX[freq2] || []

  // 檢查是否有重疊的日期
  return days1.some((day) => days2.includes(day))
}

function locatePatientOnGrid(patientId) {
  searchQuery.value = ''
  isSearchFocused.value = false

  if (!masterRecord.value || !masterRecord.value.schedule) return

  const targetRuleId = Object.keys(masterRecord.value.schedule).find(
    (ruleId) => masterRecord.value.schedule[ruleId]?.patientId === patientId,
  )
  if (!targetRuleId) {
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '該病人未被排入總床位表。'
    isAlertDialogVisible.value = true
    return
  }

  const ruleData = masterRecord.value.schedule[targetRuleId]
  const dayIndices = FREQ_MAP_TO_DAY_INDEX[ruleData.freq] || []
  if (dayIndices.length === 0) return

  const [bedNum, shiftIndex] = targetRuleId.split('-')
  const firstDayIndex = dayIndices[0]
  const targetSlotId = `${bedNum}-${shiftIndex}-${firstDayIndex}`

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
    }
  })
}

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
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
}

async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '權限不足，無法儲存。'
    isAlertDialogVisible.value = true
    return
  }

  console.log('💾 [BaseScheduleView] 開始儲存總床位表規則...')
  statusText.value = '儲存中...'

  try {
    const docId = 'MASTER_SCHEDULE'
    const scheduleToSave = masterRecord.value.schedule || {}

    console.log(`📊 [BaseScheduleView] 準備儲存 ${Object.keys(scheduleToSave).length} 條排班規則`)

    const dataPayload = {
      schedule: scheduleToSave,
      updatedAt: new Date(),
      lastModifiedBy: auth?.user?.value?.uid || 'unknown_user',
    }

    await baseSchedulesApi.save(docId, dataPayload)

    if (!masterRecord.value.id) {
      masterRecord.value.id = docId
    }

    hasUnsavedChanges.value = false
    statusText.value = '總表規則儲存成功！'

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

// 1. handleActionSelect 函數（Vue 警告中缺失的）
function handleActionSelect(actionValue) {
  isActionDialogVisible.value = false
  const target = actionTarget.value
  if (!target.ruleId) return

  if (actionValue === 'delete_rule') {
    handleDeleteRule()
  } else if (actionValue === 'change_freq_and_bed') {
    openChangeFreqAndBedDialog()
  } else if (actionValue === 'change_bed_only') {
    openChangeBedOnlyDialog()
  }
}

function handleScheduleCheck() {
  console.log(`🔍 [BaseScheduleView] 執行床位檢查...`)
  const results = runBedCheck()
  let issueMessage = ''

  if (results.unassignedCrucial.length > 0) {
    issueMessage += '【重要病人未排床】:\n- ' + results.unassignedCrucial.join('\n- ') + '\n\n'
  }

  if (results.duplicates.length > 0) {
    issueMessage += '【床位規則重複】:\n- ' + results.duplicates.join('\n- ') + '\n\n'
  }

  if (results.freqMismatch.length > 0) {
    issueMessage += '【頻率不符問題】:\n- ' + results.freqMismatch.join('\n- ') + '\n\n'
  }

  // ✨ 新增：顯示所有未排班病人
  if (results.unassignedAll.length > 0) {
    issueMessage += '【完全未排班病人】:\n- ' + results.unassignedAll.join('\n- ') + '\n\n'
  }

  if (issueMessage) {
    alertDialogTitle.value = '排班問題檢查結果'
    alertDialogMessage.value = issueMessage
  } else {
    alertDialogTitle.value = '排程檢視完畢'
    alertDialogMessage.value = '✅ 太棒了！未發現明顯的排班問題。'
  }
  isAlertDialogVisible.value = true
}

function openBaseAssignmentDialog() {
  if (isPageLocked.value) return
  assignmentContext.value = {
    mode: 'base',
    patient: null,
    originalRuleId: null,
  }
  isAssignmentDialogVisible.value = true
}

function handleGridClick(slotId) {
  const slotData = weekScheduleMap.value[slotId]
  const patientId = slotData?.patientId

  if (isPageLocked.value) {
    if (patientId) showPatientMemos(patientId)
    return
  }

  if (patientId) {
    const parts = slotId.split('-')

    // 🔥 關鍵修正：直接使用 patientId 來查找正確的 ruleId
    const correctRuleId = Object.keys(masterRecord.value.schedule || {}).find((ruleId) => {
      const ruleData = masterRecord.value.schedule[ruleId]
      return ruleData?.patientId === patientId
    })

    if (!correctRuleId) {
      console.warn(`⚠️ [BaseScheduleView] 找不到病人 ${patientId} 對應的規則`)
      return
    }

    actionTarget.value = {
      patientId: patientId,
      ruleId: correctRuleId, // 使用通過 patientId 找到的正確 ruleId
      patientName: patientMap.value.get(patientId)?.name || '未知病人',
    }
    isActionDialogVisible.value = true
  } else {
    currentSlotId.value = slotId
    isPatientSelectDialogVisible.value = true
  }
}

// 2. 修正 handlePatientSelect 函數
function handlePatientSelect({ patientId }) {
  if (isPageLocked.value || !patientId || !currentSlotId.value) return

  const patient = patientMap.value.get(patientId)
  if (!patient || !patient.freq) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `病人 ${patient?.name || '未知'} 沒有設定頻率，無法排入總表。`
    isAlertDialogVisible.value = true
    return
  }

  const parts = currentSlotId.value.split('-')

  // 🔥 修正：正確生成包含頻率的 ruleId
  let ruleId
  if (parts[0] === 'peripheral') {
    // 外圍床位：peripheral-1-0-dayIndex -> peripheral-1-0-一三五
    ruleId = `${parts[0]}-${parts[1]}-${parts[2]}-${patient.freq}`
  } else {
    // 一般床位：1-0-dayIndex -> 1-0-一三五
    ruleId = `${parts[0]}-${parts[1]}-${patient.freq}`
  }

  isPatientSelectDialogVisible.value = false

  const newRuleData = {
    patientId: patientId,
    freq: patient.freq,
    shiftId: SHIFTS[parseInt(parts[parts.length - 2], 10)], // 正確獲取 shiftId
    manualNote: patient.baseNote || '',
    autoNote: generateAutoNote(patient),
  }

  const newScheduleRules = { ...masterRecord.value.schedule }
  newScheduleRules[ruleId] = newRuleData
  masterRecord.value.schedule = newScheduleRules

  setChange()
  currentSlotId.value = null

  console.log(`✅ [BaseScheduleView] 已建立新規則: ${ruleId}`)
}

function handleDeleteRule() {
  confirmDialogTitle.value = `刪除排班規則`
  confirmDialogMessage.value = `您確定要將 ${actionTarget.value.patientName} 從總表中移除嗎？此操作將刪除其所有常規排班。`
  confirmAction.value = () => {
    const newScheduleRules = { ...masterRecord.value.schedule }

    // 🔥 修正：確保刪除正確的 ruleId
    const ruleIdToDelete = actionTarget.value.ruleId
    if (newScheduleRules[ruleIdToDelete]) {
      delete newScheduleRules[ruleIdToDelete]
      masterRecord.value.schedule = newScheduleRules
      setChange()
      console.log(`🗑️ [BaseScheduleView] 已刪除規則: ${ruleIdToDelete}`)
    } else {
      console.warn(`⚠️ [BaseScheduleView] 找不到要刪除的規則: ${ruleIdToDelete}`)
    }
  }
  isConfirmDialogVisible.value = true
}

// 2. 修正 openChangeFreqAndBedDialog 函數
function openChangeFreqAndBedDialog() {
  const patient = patientMap.value.get(actionTarget.value.patientId)
  if (!patient) return

  // 🔥 關鍵修正：傳遞完整的病人信息
  assignmentContext.value = {
    mode: 'change_freq_and_bed',
    patient: patient, // 完整的病人對象
    originalRuleId: actionTarget.value.ruleId,
  }
  isAssignmentDialogVisible.value = true
}

// 3. 修正 openChangeBedOnlyDialog 函數
function openChangeBedOnlyDialog() {
  const patient = patientMap.value.get(actionTarget.value.patientId)
  if (!patient) return

  // 🔥 關鍵修正：傳遞完整的病人信息
  assignmentContext.value = {
    mode: 'change_bed_only',
    patient: patient, // 完整的病人對象
    originalRuleId: actionTarget.value.ruleId,
  }
  isAssignmentDialogVisible.value = true
}

// 修正後的 handleBedAssigned 函數 - 移除單個排床的成功提示
async function handleBedAssigned({ patientId, bedNum, shiftCode, newFreq }) {
  const patient = patientMap.value.get(patientId)
  if (!patient) return

  const newShiftIndex = SHIFTS.indexOf(shiftCode)
  if (newShiftIndex === -1) return

  // 🔥 關鍵修正：支援新頻率
  const finalFreq = newFreq || patient.freq
  if (!finalFreq) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `病人 ${patient.name} 沒有設定頻率，無法排入總表。`
    isAlertDialogVisible.value = true
    return
  }

  // 🔥 新增：檢查頻率衝突
  let baseRulePrefix
  if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
    baseRulePrefix = `${bedNum}-${newShiftIndex}-`
  } else {
    baseRulePrefix = `${bedNum}-${newShiftIndex}-`
  }

  const conflictingRules = Object.keys(masterRecord.value.schedule || {}).filter(
    (ruleId) =>
      ruleId.startsWith(baseRulePrefix) && ruleId !== assignmentContext.value.originalRuleId,
  )

  // 檢查頻率衝突
  for (const existingRuleId of conflictingRules) {
    const existingRule = masterRecord.value.schedule[existingRuleId]
    if (existingRule?.freq && hasFrequencyConflict(finalFreq, existingRule.freq)) {
      const conflictPatient = patientMap.value.get(existingRule.patientId)
      alertDialogTitle.value = '排班衝突'
      alertDialogMessage.value = `此床位已有 ${conflictPatient?.name || '其他病人'} (${existingRule.freq})，與您選擇的頻率 (${finalFreq}) 有時間衝突。`
      isAlertDialogVisible.value = true
      return
    }
  }

  // ✅ 處理外圍床位的 ruleId 格式
  let newRuleId
  if (typeof bedNum === 'string' && bedNum.startsWith('peripheral-')) {
    newRuleId = `${bedNum}-${newShiftIndex}-${finalFreq}` // peripheral-1-0-一三五
  } else {
    newRuleId = `${bedNum}-${newShiftIndex}-${finalFreq}` // 1-0-一三五
  }

  const originalRuleId = assignmentContext.value.originalRuleId

  // 🔥 關鍵修正：如果有新頻率，更新病人的頻率
  if (newFreq && patient.freq !== newFreq) {
    try {
      await updatePatient(patientId, { freq: newFreq })
      // 更新本地病人列表中的頻率
      const patientInList = allPatients.value.find((p) => p.id === patientId)
      if (patientInList) {
        patientInList.freq = newFreq
      }
      console.log(
        `🔄 [BaseScheduleView] 已更新病人 ${patient.name} 的頻率從 ${patient.freq} 為 ${newFreq}`,
      )
    } catch (error) {
      console.error('更新病人頻率失敗:', error)
      alertDialogTitle.value = '錯誤'
      alertDialogMessage.value = '更新病人頻率失敗，請稍後再試。'
      isAlertDialogVisible.value = true
      return
    }
  }

  const newScheduleRules = { ...masterRecord.value.schedule }

  // 刪除舊規則
  if (originalRuleId) {
    delete newScheduleRules[originalRuleId]
    console.log(`🗑️ [BaseScheduleView] 已刪除舊規則: ${originalRuleId}`)
  }

  // 建立新規則
  newScheduleRules[newRuleId] = {
    patientId: patientId,
    freq: finalFreq,
    shiftId: shiftCode,
    autoNote: generateAutoNote(patient),
    manualNote: patient.baseNote || '',
  }

  masterRecord.value.schedule = newScheduleRules
  setChange()
  isAssignmentDialogVisible.value = false

  console.log(`✅ [BaseScheduleView] 已建立新規則: ${newRuleId}`)

  // ❌ 移除：單個排床的成功提示
  // 只保留批量排床的成功提示，移除單個排床的"操作成功"提示
}

// 2. 修正後的 onDrop 函數
function onDrop(event, targetSlotId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const itemToDrop = draggedItem.value
  if (!itemToDrop) return

  const targetParts = targetSlotId.split('-')
  const sourceRuleId = itemToDrop.sourceRuleId

  // 🔥 修正：生成目標位置的基礎 ruleId（不含頻率）
  let targetBaseRuleId
  if (targetParts[0] === 'peripheral') {
    targetBaseRuleId = `${targetParts[0]}-${targetParts[1]}-${targetParts[2]}`
  } else {
    targetBaseRuleId = `${targetParts[0]}-${targetParts[1]}`
  }

  // 不允許將規則拖放到自己身上
  if (sourceRuleId && sourceRuleId.startsWith(targetBaseRuleId)) {
    draggedItem.value = null
    return
  }

  const newScheduleRules = { ...masterRecord.value.schedule }

  // 🔥 關鍵修正：檢查頻率衝突而非簡單的床位佔用
  if (sourceRuleId && newScheduleRules[sourceRuleId]) {
    const draggedPatientFreq = newScheduleRules[sourceRuleId].freq

    // 找到目標床位的所有現有規則
    const conflictingRuleIds = Object.keys(newScheduleRules).filter((ruleId) => {
      if (targetParts[0] === 'peripheral') {
        return ruleId.startsWith(`${targetParts[0]}-${targetParts[1]}-${targetParts[2]}-`)
      } else {
        return ruleId.startsWith(`${targetParts[0]}-${targetParts[1]}-`)
      }
    })

    // 檢查是否有頻率衝突
    let hasConflict = false
    let conflictPatientName = ''

    for (const existingRuleId of conflictingRuleIds) {
      const existingRule = newScheduleRules[existingRuleId]
      if (existingRule?.patientId && existingRule.freq) {
        if (hasFrequencyConflict(draggedPatientFreq, existingRule.freq)) {
          hasConflict = true
          const conflictPatient = patientMap.value.get(existingRule.patientId)
          conflictPatientName = conflictPatient?.name || '未知病人'
          break
        }
      }
    }

    if (hasConflict) {
      alertDialogTitle.value = '排班衝突'
      alertDialogMessage.value = `無法放置！目標床位的 ${conflictPatientName} (${newScheduleRules[conflictingRuleIds[0]]?.freq}) 與被拖拽病人的頻率 (${draggedPatientFreq}) 有時間衝突。`
      isAlertDialogVisible.value = true
      draggedItem.value = null
      return
    }
  }

  // 如果沒有頻率衝突，則執行「移動」操作
  console.log(`➡️ [BaseScheduleView] 移動規則: ${sourceRuleId} -> ${targetBaseRuleId}`)

  if (sourceRuleId && newScheduleRules[sourceRuleId]) {
    // 複製來源規則的資料
    const sourceRuleData = { ...newScheduleRules[sourceRuleId] }

    // 🔥 修正：生成新的完整 ruleId（包含頻率）
    let newTargetRuleId
    if (targetParts[0] === 'peripheral') {
      newTargetRuleId = `${targetParts[0]}-${targetParts[1]}-${targetParts[2]}-${sourceRuleData.freq}`
    } else {
      newTargetRuleId = `${targetParts[0]}-${targetParts[1]}-${sourceRuleData.freq}`
    }

    // 在新位置建立規則
    newScheduleRules[newTargetRuleId] = sourceRuleData

    // 從舊位置刪除規則
    delete newScheduleRules[sourceRuleId]

    // 更新最終的 schedule 物件
    masterRecord.value.schedule = newScheduleRules
    setChange()

    console.log(`✅ [BaseScheduleView] 成功移動到新位置: ${newTargetRuleId}`)
  }

  // 清理拖曳狀態
  draggedItem.value = null
}

function onDragStart(event, slotId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = weekScheduleMap.value[slotId]
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }

  const parts = slotId.split('-')

  // 🔥 修正：找到完整的 ruleId
  let baseRuleId
  if (parts[0] === 'peripheral') {
    baseRuleId = `${parts[0]}-${parts[1]}-${parts[2]}`
  } else {
    baseRuleId = `${parts[0]}-${parts[1]}`
  }

  // 🔥 關鍵修正：找到包含頻率的完整 ruleId
  const completeRuleId = Object.keys(masterRecord.value.schedule || {}).find((fullRuleId) => {
    return fullRuleId.startsWith(baseRuleId + '-')
  })

  console.log(`🖱️ [BaseScheduleView] 開始拖拽規則: ${completeRuleId}`)
  draggedItem.value = {
    sourceRuleId: completeRuleId,
    sourceSlotId: slotId,
  }
  event.dataTransfer.effectAllowed = 'move'
}

async function loadAllData() {
  console.log('🚀 [BaseScheduleView] 組件已掛載，開始初始化...')
  statusText.value = '讀取中...'
  try {
    const [patients, memos, baseScheduleDoc] = await Promise.all([
      optimizedFetchAllPatients(),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
      baseSchedulesApi.fetchById('MASTER_SCHEDULE'),
    ])

    allPatients.value = patients
    activeMemos.value = memos

    if (baseScheduleDoc && baseScheduleDoc.schedule) {
      console.log(
        `📊 [BaseScheduleView] 已載入 ${Object.keys(baseScheduleDoc.schedule).length} 條排班規則`,
      )
      masterRecord.value = {
        id: baseScheduleDoc.id,
        schedule: baseScheduleDoc.schedule,
      }
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

function runBedCheck() {
  const validationResult = {
    duplicates: [],
    unassignedCrucial: [],
    unassignedAll: [], // ✨ 新增：所有未排班病人
    freqMismatch: [],
  }
  const scheduledPatientIds = new Set()

  if (!masterRecord.value || !masterRecord.value.schedule) {
    console.log('無排程資料可檢查')
    return validationResult
  }

  // 🔥 修正：正確收集已排床的病人ID
  for (const ruleId in masterRecord.value.schedule) {
    const ruleData = masterRecord.value.schedule[ruleId]
    if (ruleData?.patientId) {
      // 檢查重複排班
      if (scheduledPatientIds.has(ruleData.patientId)) {
        const patient = patientMap.value.get(ruleData.patientId)
        validationResult.duplicates.push(`病人 ${patient?.name || '未知'} 被重複排入多個規則中。`)
      }
      scheduledPatientIds.add(ruleData.patientId)
    }
  }

  console.log('🔍 [BaseScheduleView] 已排床病人ID:', Array.from(scheduledPatientIds))

  // 🔥 修正：檢查重要病人（住院/急診）是否未排床
  const unassignedCrucialPatients = allPatients.value.filter((p) => {
    const isUnassigned = !scheduledPatientIds.has(p.id)
    const isCrucial = (p.status === 'ipd' || p.status === 'er') && !p.isDeleted && !p.isDiscontinued

    if (isCrucial && isUnassigned) {
      console.log(`⚠️ [BaseScheduleView] 未排床的重要病人: ${p.name} (${p.status})`)
    }

    return isCrucial && isUnassigned
  })

  unassignedCrucialPatients.forEach((p) => {
    validationResult.unassignedCrucial.push(`${p.name} (${p.status === 'ipd' ? '住院' : '急診'})`)
  })

  // ✨ 新增：檢查所有完全沒排到班的病人
  const unassignedAllPatients = allPatients.value.filter((p) => {
    const isUnassigned = !scheduledPatientIds.has(p.id)
    const isActivePatient = !p.isDeleted && !p.isDiscontinued // 排除已刪除或已停止的病人

    if (isActivePatient && isUnassigned) {
      console.log(`📋 [BaseScheduleView] 未排班的病人: ${p.name} (${p.status || '未知狀態'})`)
    }

    return isActivePatient && isUnassigned
  })

  unassignedAllPatients.forEach((p) => {
    const statusText =
      p.status === 'opd'
        ? '門診'
        : p.status === 'ipd'
          ? '住院'
          : p.status === 'er'
            ? '急診'
            : '未知'
    validationResult.unassignedAll.push(`${p.name} (${statusText})`)
  })

  // ✨ 新增：檢查頻率是否符合病人設定
  for (const ruleId in masterRecord.value.schedule) {
    const ruleData = masterRecord.value.schedule[ruleId]
    if (ruleData?.patientId && ruleData.freq) {
      const patient = patientMap.value.get(ruleData.patientId)
      if (patient && patient.status === 'opd') {
        // 只檢查門診病人
        // 比較規則中的頻率與病人實際設定的頻率
        if (patient.freq && patient.freq !== ruleData.freq) {
          validationResult.freqMismatch.push(
            `${patient.name} - 規則頻率: ${ruleData.freq}, 病人設定頻率: ${patient.freq}`,
          )
        }
      }
    }
  }

  console.log('🔍 [BaseScheduleView] 檢查結果:', {
    總病人數: allPatients.value.length,
    已排床病人數: scheduledPatientIds.size,
    未排床重要病人: validationResult.unassignedCrucial.length,
    未排床所有病人: validationResult.unassignedAll.length, // ✨ 新增
    重複排班: validationResult.duplicates.length,
    頻率不符: validationResult.freqMismatch.length,
  })

  return validationResult
}

function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
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
  background-color: var(--orange-bg, #ffcc80);
}
/* 其他 tag class 可以保留，以防未來需要 */
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

:deep(.shift-row.status-opd),
:deep(.peripheral-shift-row.status-opd),
:deep(.patient-item.status-opd) {
  background-color: #e8f5e9; /* 綠色 - 門診 */
}

:deep(.shift-row.status-ipd),
:deep(.peripheral-shift-row.status-ipd),
:deep(.patient-item.status-ipd) {
  background-color: #ffebee; /* 紅色 - 住院 */
}

:deep(.shift-row.status-er),
:deep(.peripheral-shift-row.status-er),
:deep(.patient-item.status-er) {
  background-color: #f3e5f5; /* 紫色 - 急診 */
}

:deep(.shift-row.status-biweekly),
:deep(.peripheral-shift-row.status-biweekly),
:deep(.patient-item.status-biweekly) {
  background-color: #ffcc80; /* 橘色 - 兩班 (一週兩次) */
}

:deep(.shift-row.tag-chou),
:deep(.peripheral-shift-row.tag-chou),
:deep(.patient-item.tag-chou) {
  background-color: #658ee0; /* 藍色 - 抽血 */
}

:deep(.shift-row.tag-new),
:deep(.peripheral-shift-row.tag-new),
:deep(.patient-item.tag-new) {
  background-color: #f5ec8e; /* 金黃 - 新診 */
}

:deep(.shift-row.tag-huan),
:deep(.peripheral-shift-row.tag-huan),
:deep(.patient-item.tag-huan) {
  background-color: #e0f7fa; /* 淺青 - 換 */
}

:deep(.shift-row.tag-liang),
:deep(.peripheral-shift-row.tag-liang),
:deep(.patient-item.tag-liang) {
  background-color: #fff3e0; /* 淺橙 - 兩 */
}

:deep(.shift-row.tag-b),
:deep(.peripheral-shift-row.tag-b),
:deep(.patient-item.tag-b) {
  background-color: #fff9c4; /* 淺黃 - B */
}
:deep(.schedule-slot.status-biweekly) {
  background-color: #ffcc80; /* 橘色 - 兩班 */
}
:deep(.schedule-slot.tag-chou) {
  background-color: #658ee0; /* 藍色 - 抽血 */
}
:deep(.schedule-slot.tag-new) {
  background-color: #f5ec8e; /* 金黃 - 新診 */
}
</style>
