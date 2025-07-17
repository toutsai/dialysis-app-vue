<!-- 檔案路徑: src/views/ScheduleView.vue (修正渲染邏輯 - 完整無省略) -->
<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
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
          <button class="btn btn-info" @click="openAssignmentDialog" :disabled="isPageLocked">
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
                        @dragover.prevent="!isPageLocked && onDragOver($event)"
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
                    :value="currentRecord.schedule['peripheral-' + i + '-' + shiftCode]?.nurseTeam"
                    @change="updateNurseTeam($event, `peripheral-${i}-${shiftCode}`, 'single')"
                    :disabled="isPageLocked"
                  >
                    <option value="">-</option>
                    <option v-for="team in allTeams" :key="team" :value="team">{{ team }}組</option>
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
                    @dragover.prevent="!isPageLocked && onDragOver($event)"
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
      :context="{ mode: 'singleDay' }"
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
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive, watch, provide } from 'vue'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useNotification } from '@/composables/useNotification.js'
import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'

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

// --- Initialization ---
const auth = useAuth()
const { addNotification } = useNotification()
const { distributePatients } = useTeamAssigner()

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
const freqToDays = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
}
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

// --- Reactive State ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {} })
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

// --- Auth ---
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return currentDate.value < today
})

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
const dayOfWeek = computed(() => currentDate.value.getDay())

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
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData?.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (!patient) continue
        const shiftCode = slotData.shiftId
        if (shiftCode && dailyData.counts[shiftCode]) {
          dailyData.counts[shiftCode].total++
          dailyData.total++
          if (patient.status === 'opd') dailyData.counts[shiftCode].opd++
          else if (patient.status === 'ipd') dailyData.counts[shiftCode].ipd++
          else if (patient.status === 'er') dailyData.counts[shiftCode].er++
        }
      }
    }
  }
  return [dailyData]
})
const statsToolbarWeekdays = computed(() => ['本日'])
const scheduledPatientIds = computed(
  () =>
    new Set(
      Object.values(currentRecord.schedule || {})
        .map((slot) => slot?.patientId)
        .filter(Boolean),
    ),
)

// --- Main Functions ---
function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function saveDataToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足或日期已過。'
    isAlertDialogVisible.value = true
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule || {},
    }

    if (currentRecord.id) {
      await optimizedUpdateSchedule(currentRecord.id, dataToSave)
    } else if (Object.keys(dataToSave.schedule).length > 0) {
      const savedRecord = await optimizedSaveSchedule(dataToSave)
      currentRecord.id = savedRecord.id
    } else {
      console.log('No data to save.')
      hasUnsavedChanges.value = false
      statusIndicator.value = '沒有需要儲存的變更'
      return
    }

    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'
    addNotification(`修改每日排程: ${currentRecord.date}`, 'schedule')
  } catch (error) {
    console.error('❌ 儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

function handleSlotUpdate(shiftId, patientId) {
  if (isPageLocked.value) return
  const newSchedule = { ...currentRecord.schedule }
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    newSchedule[shiftId] = {
      ...createEmptySlotData(shiftId),
      patientId: patientId,
      shiftId: shiftId.split('-').pop(),
      autoNote: generateAutoNote(patient),
      manualNote: patient.status === 'ipd' ? '住' : '',
    }
  } else {
    delete newSchedule[shiftId]
  }
  currentRecord.schedule = newSchedule
  setChange()
}

function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (isPageLocked.value) {
    if (slotData?.patientId) showPatientMemos(slotData.patientId)
    return
  }
  if (slotData?.patientId) {
    const patient = patientMap.value.get(slotData.patientId)
    showConfirmDialog('移除確認', `確定要將「${patient?.name}」從此班次中移除嗎？`, () => {
      handleSlotUpdate(shiftId, null)
    })
  } else {
    currentSlotId.value = shiftId
    isPatientSelectDialogVisible.value = true
  }
}

function onDrop(event, targetShiftId) {
  if (isPageLocked.value) return
  event.preventDefault()
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'))

  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')
  const droppedSlotData = JSON.parse(event.dataTransfer.getData('application/json'))
  if (!droppedSlotData?.patientId) return

  const patient = patientMap.value.get(droppedSlotData.patientId)
  if (!patient) return

  if (!sourceShiftId && scheduledPatientIds.value.has(patient.id)) {
    showConfirmDialog(
      '重複排班警告',
      `病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`,
      () => {
        if (currentRecord.schedule[targetShiftId]?.patientId) {
          alert('目標床位已被佔用，無法放置！')
          return
        }
        handleSlotUpdate(targetShiftId, patient.id)
      },
    )
    return
  }

  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (targetSlotData?.patientId) {
    if (!sourceShiftId) {
      alert('目標床位已被佔用，無法放置！')
      return
    }
    handleSlotUpdate(targetShiftId, droppedSlotData.patientId)
    handleSlotUpdate(sourceShiftId, targetSlotData.patientId)
  } else {
    handleSlotUpdate(targetShiftId, droppedSlotData.patientId)
    if (sourceShiftId) handleSlotUpdate(sourceShiftId, null)
  }
}

function onBedDragStart(event, sourceShiftId) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  const slotData = currentRecord.schedule[sourceShiftId]
  if (!slotData?.patientId) {
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
  const slotData = { patientId: patient.id }
  event.dataTransfer.setData('application/json', JSON.stringify(slotData))
  event.dataTransfer.effectAllowed = 'move'
}

function changeDate(days) {
  showConfirmDialog(
    '未儲存的變更',
    '您有未儲存的變更，確定要切換日期嗎？',
    () => {
      const newDate = new Date(currentDate.value)
      newDate.setDate(newDate.getDate() + days)
      currentDate.value = newDate
    },
    !hasUnsavedChanges.value,
  )
}

function goToToday() {
  showConfirmDialog(
    '未儲存的變更',
    '您有未儲存的變更，確定要切換到今天嗎？',
    () => {
      currentDate.value = new Date()
    },
    !hasUnsavedChanges.value,
  )
}

async function loadAllData() {
  try {
    const [patientsData, memosData] = await Promise.all([
      optimizedFetchAllPatients(),
      optimizedFetchAllMemos([where('status', '==', 'pending')]),
    ])
    allPatients.value = patientsData
    activeMemos.value = memosData
  } catch (error) {
    console.error('❌ 載入基礎資料失敗:', error)
  }
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)
  try {
    const dailyRecords = await optimizedFetchAllSchedules([where('date', '==', dateStr)])
    const record = dailyRecords[0] || { date: dateStr, schedule: {} }

    currentRecord.id = record.id || null
    currentRecord.date = dateStr
    currentRecord.schedule = record.schedule || {}

    statusIndicator.value = record.id ? '資料已載入' : '本日無排程'
  } catch (error) {
    console.error(`❌ 載入 ${dateStr} 排程失敗:`, error)
    statusIndicator.value = '讀取失敗'
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
  return combinedTags.filter((tag) => !['住', '急'].includes(tag)).join(' ')
}

function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData?.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}
  if (patient.status === 'ipd') return { 'status-ipd': true }
  if (patient.status === 'er') return { 'status-er': true }
  const combinedNote = getCombinedNote(shiftId)
  if (combinedNote.includes('兩')) return { 'status-biweekly': true }

  return { 'status-opd': true }
}

function showConfirmDialog(title, message, onConfirm, skip = false) {
  if (skip || !hasUnsavedChanges.value) {
    onConfirm()
    return
  }
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  onConfirmAction.value = onConfirm
  isConfirmDialogVisible.value = true
}

function handleConfirm() {
  if (typeof onConfirmAction.value === 'function') onConfirmAction.value()
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function clearBoard() {
  showConfirmDialog('清除畫面', '確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)', () => {
    currentRecord.schedule = {}
    setChange()
  })
}

function updateNurseTeam(event, shiftId, type) {
  if (isPageLocked.value) return
  const value = event.target.value
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  const slot = currentRecord.schedule[shiftId]
  if (type === 'single') slot.nurseTeam = value || null
  else if (type === 'in') slot.nurseTeamIn = value || null
  else if (type === 'out') slot.nurseTeamOut = value || null
  setChange()
}

function updateNote(event, shiftId) {
  if (isPageLocked.value) return
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].manualNote = event.target.textContent.trim()
  setChange()
}

function updateWardNumber(event, shiftId) {
  if (isPageLocked.value) return
  if (!currentRecord.schedule[shiftId])
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  currentRecord.schedule[shiftId].wardNumber = event.target.textContent.trim()
  setChange()
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name, .peripheral-patient-name')
  if (targetCell) targetCell.classList.add('drag-over')
}

function onDragLeave(event) {
  event.target.closest('.patient-name, .peripheral-patient-name')?.classList.remove('drag-over')
}

function triggerPrint() {
  window.print()
}

function autoAssignNurseTeams() {
  showConfirmDialog(
    '自動分組確認',
    '此操作將會覆蓋現有的護理師分組，您確定要繼續嗎？',
    () => {
      executeAutoAssignment()
    },
    isPageLocked.value,
  )
}

function executeAutoAssignment() {
  const getRichPatientList = (shiftCode) => {
    return Object.entries(currentRecord.schedule)
      .filter(([shiftId, slot]) => slot?.patientId && shiftId.endsWith(shiftCode))
      .map(([shiftId, slot]) => {
        const patientData = patientMap.value.get(slot.patientId)
        if (!patientData) return null
        const bedNumberStr = shiftId.split('-')[1]
        const bedNumber = parseInt(bedNumberStr, 10)
        return {
          id: slot.patientId,
          shiftId: shiftId,
          status: patientData.status,
          isHepatitis: !isNaN(bedNumber) && hepatitisBeds.includes(bedNumber),
          isPeripheral: shiftId.startsWith('peripheral'),
        }
      })
      .filter(Boolean)
  }

  const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY)
  const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON)
  const allLatePatients = getRichPatientList(SHIFT_CODES.LATE)

  const earlyAssignments = distributePatients(allEarlyPatients, earlyTeams)
  const noonOnAssignments = distributePatients(allNoonPatients, earlyTeams)
  const lateAssignments = distributePatients(allLatePatients, lateTeams)

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
  alertDialogTitle.value = '操作成功'
  alertDialogMessage.value = '自動分組已完成！請檢視結果並點擊「儲存」。'
  isAlertDialogVisible.value = true
}

function handleAssignBed({ patientId, shiftId }) {
  if (!patientId || !shiftId || isPageLocked.value) return
  if (scheduledPatientIds.value.has(patientId)) {
    showConfirmDialog(
      '重複排班警告',
      `病人 ${patientMap.value.get(patientId)?.name} 在本日已有排班，您確定要重複排班嗎？`,
      () => {
        if (currentRecord.schedule[shiftId]?.patientId) alert('錯誤：目標床位已被佔用！')
        else handleSlotUpdate(shiftId, patientId)
      },
    )
    return
  }
  if (currentRecord.schedule[shiftId]?.patientId) {
    alert('錯誤：目標床位已被佔用！')
    return
  }
  handleSlotUpdate(shiftId, patientId)
}

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (patient.freq === '臨時') return true
  if (!patient.freq || !freqToDays[patient.freq]) return false
  const scheduledDays = freqToDays[patient.freq]
  return scheduledDays.includes(dayOfWeek === 0 ? 7 : dayOfWeek)
}

function runScheduleCheck() {
  const warnings = []
  const todayScheduledPatientIds = scheduledPatientIds.value
  const duplicateNames = new Set()
  let tempScheduled = {}
  Object.values(currentRecord.schedule).forEach((slot) => {
    if (slot?.patientId) {
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
  const missingPatients = allPatients.value.filter(
    (p) =>
      !p.isDeleted &&
      shouldPatientBeScheduled(p, dayOfWeek.value) &&
      !todayScheduledPatientIds.has(p.id),
  )
  if (missingPatients.length > 0) {
    const missingPatientNames = missingPatients.map((p) => `${p.name} (${p.status})`).join('\n- ')
    warnings.push(`【應排未排】:\n- ${missingPatientNames}`)
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

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(async () => {
  await loadAllData()
  await loadDataForDay(currentDate.value)
})

watch(currentDate, (newDate) => {
  loadDataForDay(newDate)
})
</script>

<style scoped>
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
  padding: 1rem;
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
  padding: 1rem;
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
  font-size: 2rem;
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
  font-size: 1.5rem;
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
button:disabled {
  opacity: 0.65;
  cursor: not-allowed;
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
  cursor: pointer;
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
.shift-row.status-biweekly,
.peripheral-shift-row.status-biweekly {
  background-color: var(--orange-bg, #ffcc80);
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
  background-color: var(--hepatitis-bg, #fff9c4);
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
</style>
