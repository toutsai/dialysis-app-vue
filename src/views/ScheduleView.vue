<!-- 檔案路徑: src/views/ScheduleView.vue (採用 Composable 的最終完整版) -->
<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
    </div>
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button class="btn" @click="changeDate(-1)">< 上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button class="btn" @click="changeDate(1)">下一天 ></button>
            <button class="btn" @click="goToToday">回到今日</button>
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
          <button class="btn btn-secondary" @click="clearInpatients" :disabled="isPageLocked">
            清除住院病人
          </button>
          <button class="btn btn-secondary" @click="clearNurseTeams" :disabled="isPageLocked">
            清除護理分組
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

    <!-- ✨ [核心修正] 傳遞 predefined-patient-groups -->
    <BedAssignmentDialog
      :is-visible="isAssignmentDialogVisible"
      :all-patients="allPatients"
      :bed-layout="allBedNumbers"
      :schedule-data="currentRecord.schedule"
      :shifts="ORDERED_SHIFT_CODES"
      :freq-map="freqToDays"
      assignment-mode="singleDay"
      :day-of-week="dayOfWeek"
      :predefined-patient-groups="patientGroupsForDialog"
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
import {
  fetchAllPatients as optimizedFetchAllPatients,
  fetchAllSchedules as optimizedFetchAllSchedules,
  saveSchedule as optimizedSaveSchedule,
  updateSchedule as optimizedUpdateSchedule,
  fetchAllMemos as optimizedFetchAllMemos,
} from '@/services/optimizedApiService.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useNotification } from '@/composables/useNotification.js'
import { useScheduleAnalysis } from '@/composables/useScheduleAnalysis.js' // ✨ [核心修正] 引入 Composable

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
import { getUnifiedCellStyle } from '@/utils/scheduleUtils.js'

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
/*const STYLE_CHECK_ORDER = [
  { key: '住', class: 'status-ipd' },
  { key: '隔', class: 'status-ipd' },
  { key: 'R', class: 'status-ipd' },
  { key: '抽', class: 'tag-chou' },
  { key: '新', class: 'tag-new' },
  { key: '換', class: 'tag-huan' },
  { key: '兩', class: 'tag-liang' },
  { key: 'B', class: 'tag-b' },
]
  */
const freqToDays = {
  一三五: [1, 3, 5],
  二四六: [2, 4, 6],
  一四: [1, 4],
  二五: [2, 5],
  三六: [3, 6],
  一五: [1, 5],
  二六: [2, 6],
  每周一次: [0, 1, 2, 3, 4, 5, 6],
  臨時: [],
}
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']

// --- Reactive State ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
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
const isLoading = ref(false)

// --- Auth ---
const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) {
    return true
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})

const { addNotification } = useNotification()

function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => '星期' + ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const dayOfWeek = computed(() => {
  const day = currentDate.value.getDay()
  return day === 0 ? 7 : day
})

// ✨ [核心修正] 使用 Composable 來進行所有排程分析
const { scheduledPatientIds, getDailyUnassignedPatients, getDailyTemporaryPatients } =
  useScheduleAnalysis(
    allPatients,
    computed(() => currentRecord.schedule),
    freqToDays,
  )

// ✨ [核心修正] 格式化 Composable 的結果，以符合 UI 需求
const patientGroupsForDialog = computed(() => {
  const groups = {
    '今日應排 - 急診': [],
    '今日應排 - 住院': [],
    '今日應排 - 門診': [],
    '今日非排 (臨洗) - 急診': [],
    '今日非排 (臨洗) - 住院': [],
    '今日非排 (臨洗) - 門診': [],
  }

  const dailyUnassigned = getDailyUnassignedPatients(dayOfWeek).value
  dailyUnassigned.forEach((p) => {
    if (p.status === 'er') groups['今日應排 - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日應排 - 住院'].push(p)
    else if (p.status === 'opd') groups['今日應排 - 門診'].push(p)
  })

  const dailyTemporary = getDailyTemporaryPatients(dayOfWeek).value
  dailyTemporary.forEach((p) => {
    if (p.status === 'er') groups['今日非排 (臨洗) - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p)
    else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p)
  })

  return groups
})

const statsToolbarData = computed(() => {
  // 🔥 修正：動態生成 counts 對象，而不是硬編碼
  const counts = {}
  ORDERED_SHIFT_CODES.forEach((shiftCode) => {
    counts[shiftCode] = { total: 0, opd: 0, ipd: 0, er: 0 }
  })

  const dailyData = {
    counts: counts, // 🔥 使用動態生成的 counts
    total: 0,
  }

  if (currentRecord.schedule) {
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (!patient) continue

        // 🔥 修正：智能解析 shiftCode
        let shiftCode
        if (slotData.shiftId?.includes('-')) {
          // 格式如: "bed-1-early" -> 取最後一部分
          shiftCode = slotData.shiftId.split('-').pop()
        } else {
          // 格式如: "early" -> 直接使用
          shiftCode = slotData.shiftId
        }

        console.log(`🔍 [DEBUG] shiftId: ${slotData.shiftId}, shiftCode: ${shiftCode}`) // 除錯用

        if (shiftCode && dailyData.counts[shiftCode]) {
          const shiftStats = dailyData.counts[shiftCode]
          shiftStats.total++
          dailyData.total++
          if (patient.status === 'opd') shiftStats.opd++
          else if (patient.status === 'ipd') shiftStats.ipd++
          else if (patient.status === 'er') shiftStats.er++
        } else {
          console.warn(
            `⚠️ [DEBUG] 無法匹配的 shiftCode: ${shiftCode}, 可用的: ${Object.keys(dailyData.counts)}`,
          )
        }
      }
    }
  }

  console.log(`📊 [DEBUG] 統計結果:`, dailyData) // 除錯用

  return [dailyData]
})

const statsToolbarWeekdays = computed(() => ['本日'])

// --- [新增] 新的清除功能 ---
function clearInpatients() {
  if (isPageLocked.value) return
  confirmDialogMessage.value = '確定要清除畫面上所有的「住院/急診」病人嗎？(此操作需儲存後才會生效)'
  onConfirmAction.value = () => {
    const newSchedule = { ...currentRecord.schedule }
    let clearedCount = 0
    for (const shiftId in newSchedule) {
      const slotData = newSchedule[shiftId]
      if (slotData && slotData.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (patient && (patient.status === 'ipd' || patient.status === 'er')) {
          delete newSchedule[shiftId]
          clearedCount++
        }
      }
    }
    if (clearedCount > 0) {
      currentRecord.schedule = newSchedule
      setChange()
      addNotification(`已清除 ${clearedCount} 位住院/急診病人`, 'schedule')
    } else {
      alertDialogTitle.value = '提示'
      alertDialogMessage.value = '畫面上沒有住院或急診病人可供清除。'
      isAlertDialogVisible.value = true
    }
  }
  isConfirmDialogVisible.value = true
}

function clearNurseTeams() {
  if (isPageLocked.value) return
  confirmDialogMessage.value = '確定要清除畫面上所有的「護理分組」嗎？(此操作需儲存後才會生效)'
  onConfirmAction.value = () => {
    const newSchedule = { ...currentRecord.schedule }
    let cleared = false
    for (const shiftId in newSchedule) {
      const slotData = newSchedule[shiftId]
      if (slotData) {
        if (slotData.nurseTeam || slotData.nurseTeamIn || slotData.nurseTeamOut) {
          cleared = true
        }
        slotData.nurseTeam = null
        slotData.nurseTeamIn = null
        slotData.nurseTeamOut = null
      }
    }
    if (cleared) {
      currentRecord.schedule = newSchedule
      setChange()
      addNotification(`已清除所有護理分組`, 'team')
    } else {
      alertDialogTitle.value = '提示'
      alertDialogMessage.value = '畫面上沒有護理分組可供清除。'
      isAlertDialogVisible.value = true
    }
  }
  isConfirmDialogVisible.value = true
}

// --- Functions ---

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    const dailyRecords = await optimizedFetchAllSchedules([where('date', '==', dateStr)])
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
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
    Object.assign(currentRecord, { id: null, date: dateStr, schedule: {}, names: {} })
  } finally {
    isLoading.value = false
  }
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
    console.error('獲取病人或備忘資料失敗:', error)
    statusIndicator.value = '讀取病人或備忘資料失敗'
  }
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
      names: currentRecord.names || {},
    }

    if (currentRecord.id) {
      await optimizedUpdateSchedule(currentRecord.id, dataToSave)
    } else if (Object.keys(dataToSave.schedule).length > 0) {
      const savedRecord = await optimizedSaveSchedule(dataToSave)
      currentRecord.id = savedRecord.id
    }

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
  } catch (error) {
    console.error('儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

function changeDate(days) {
  const performChange = () => {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentDate.value = newDate
  }

  if (hasUnsavedChanges.value && !isPageLocked.value) {
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換日期嗎？'
    onConfirmAction.value = performChange
    isConfirmDialogVisible.value = true
  } else {
    performChange()
  }
}

function goToToday() {
  const performChange = () => {
    currentDate.value = new Date()
  }

  if (hasUnsavedChanges.value && !isPageLocked.value) {
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換到今天嗎？'
    onConfirmAction.value = performChange
    isConfirmDialogVisible.value = true
  } else {
    performChange()
  }
}

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
    confirmDialogMessage.value = `警告：病人 ${patient.name} 在本日已有排班，您確定要重複排班嗎？`
    onConfirmAction.value = () => {
      if (currentRecord.schedule[targetShiftId]?.patientId) {
        alert('目標床位已被佔用，無法放置！')
        return
      }
      handleSlotUpdate(targetShiftId, droppedSlotData.patientId)
    }
    isConfirmDialogVisible.value = true
    return
  }
  const targetSlotData = currentRecord.schedule[targetShiftId]
  if (targetSlotData && targetSlotData.patientId) {
    if (!sourceShiftId) {
      alert('目標床位已被佔用，無法放置！')
      return
    }
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData }
    currentRecord.schedule[sourceShiftId] = { ...targetSlotData }
  } else {
    currentRecord.schedule[targetShiftId] = { ...droppedSlotData }
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

function runScheduleCheck() {
  const warnings = []
  const todayScheduledPatientIds = new Set(scheduledPatientIds.value) // Use the one from composable
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

  // ✨ [核心修正] 直接使用 Composable 的計算結果
  const missingPatients = getDailyUnassignedPatients(dayOfWeek).value
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

  // 🔥 使用統一的顏色邏輯，而不是原本的 STYLE_CHECK_ORDER
  return getUnifiedCellStyle(slotData, patient)
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

function executeAutoAssignment() {
  const scheduleCopy = JSON.parse(JSON.stringify(currentRecord.schedule))

  const getRichPatientList = (shiftCode) => {
    return Object.entries(scheduleCopy)
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

  const earlyMain = mainArea(allEarlyPatients)
  const useEarlyTeamA = earlyMain.length > 36
  const earlyTeamsForDistribution = (
    useEarlyTeamA ? baseTeams.slice(0, 11) : baseTeams.slice(1, 11)
  ).map((t) => `早${t}`)
  const earlyRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'], // 移除早K
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 4 }, // 移除早K的容量設定
    },
    mainDistribution: {
      specialTeam: useEarlyTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: earlyTeamsForDistribution,
      primaryCapacity: 4,
      fillMethod: useEarlyTeamA ? 'block' : 'average',
    },
  }

  const noonMain = mainArea(allNoonPatients)
  const useNoonTeamA = noonMain.length > 36
  const noonTeamsForDistribution = (
    useNoonTeamA ? baseTeams.slice(0, 11) : baseTeams.slice(1, 11)
  ).map((t) => `早${t}`)
  const noonRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'], // 移除早K
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 4 }, // 移除早K的容量設定
    },
    mainDistribution: {
      specialTeam: useNoonTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: noonTeamsForDistribution,
      primaryCapacity: 4,
      fillMethod: useNoonTeamA ? 'block' : 'average',
    },
  }

  const lateMainOnly = mainArea(allLatePatients)

  const lateTeamsForDistribution = baseTeams.slice(0, 8).map((t) => `晚${t}`)
  const lateRules = {
    priorityTeams: {
      hepatitis: '晚G',
      inPatientTeams: ['晚H', '晚I'], // 本來就沒有晚K，保持不變
      inPatientCapacity: { 晚H: 2, 晚I: 2 },
    },
    mainDistribution: {
      specialTeam: null,
      regularTeams: lateTeamsForDistribution,
      primaryCapacity: 4,
      fillMethod: 'average',
    },
  }

  const earlyAssignments = distributePatients(
    sort(earlyMain),
    ['早A', ...earlyTeamsForDistribution, '早H', '早I', '早J'].filter(Boolean), // 移除早K
    earlyRules,
  )
  earlyAssignments['早外圍'] = peripheral(allEarlyPatients)

  const noonOnAssignments = distributePatients(
    sort(noonMain),
    ['早A', ...noonTeamsForDistribution, '早H', '早I', '早J'].filter(Boolean), // 移除早K
    noonRules,
  )
  noonOnAssignments['早外圍'] = peripheral(allNoonPatients)

  const lateAssignments = distributePatients(
    sort(lateMainOnly),
    [...lateTeamsForDistribution, '晚H', '晚I'], // 本來就沒有晚K，保持不變
    lateRules,
  )
  lateAssignments['晚外圍'] = peripheral(allLatePatients)

  Object.values(scheduleCopy).forEach((slot) => {
    if (slot) {
      slot.nurseTeam = null
      slot.nurseTeamIn = null
      slot.nurseTeamOut = null
    }
  })

  const applyToSchedule = (assignments, prop) => {
    for (const team in assignments) {
      for (const patient of assignments[team]) {
        if (scheduleCopy[patient.shiftId]) {
          scheduleCopy[patient.shiftId][prop] = team
        }
      }
    }
  }

  applyToSchedule(earlyAssignments, 'nurseTeam')
  applyToSchedule(noonOnAssignments, 'nurseTeamIn')
  applyToSchedule(lateAssignments, 'nurseTeam')

  currentRecord.schedule = scheduleCopy

  setChange()
  statusIndicator.value = '自動分組完成，請確認並儲存'
  alertDialogTitle.value = '操作成功'
  alertDialogMessage.value = '自動分組已完成！請檢視結果並點擊「儲存」。'
  isAlertDialogVisible.value = true
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(async () => {
  isLoading.value = true
  await loadAllData()
  await loadDataForDay(currentDate.value)
  isLoading.value = false
})

watch(currentDate, (newDate, oldDate) => {
  if (oldDate && formatDate(newDate) !== formatDate(oldDate)) {
    loadDataForDay(newDate)
  }
})
</script>

<style scoped>
/* [新增] 載入中遮罩樣式 */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 999;
  font-size: 1.5rem;
  color: #333;
  gap: 20px;
  backdrop-filter: blur(2px);
}
.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #3498db;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* ======================== 【CSS 權限修正點】 ======================== */
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

/* 特別恢復 memo-icon 的點擊能力 */
.is-locked .memo-icon-inline,
.is-locked :deep(.memo-icon-wrapper) {
  pointer-events: auto;
  cursor: pointer;
}
/* ================================================================= */

.page-container {
  position: relative; /* 為了讓 loading overlay 正確定位 */
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
  color: var(--primary-color, #007bff);
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
  background-color: var(--hepatitis-bg, #fffde7);
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

/* 🔥 統一顏色系統 - 新增的樣式 */
.shift-row.status-opd,
.peripheral-shift-row.status-opd {
  background-color: var(--green-bg, #e8f5e9); /* 門診 - 綠色 */
}
.shift-row.status-ipd,
.peripheral-shift-row.status-ipd {
  background-color: var(--red-bg, #ffebee); /* 住院 - 紅色 */
}
.shift-row.status-er,
.peripheral-shift-row.status-er {
  background-color: var(--purple-bg, #f3e5f5); /* 急診 - 紫色 */
}
.shift-row.status-biweekly,
.peripheral-shift-row.status-biweekly {
  background-color: #ffcc80; /* 兩班 - 橘色 */
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #658ee0; /* 抽血 - 藍色 */
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #f5ec8e; /* 新診 - 金黃 */
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa; /* 換 - 淺青 */
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0; /* 兩 - 淺橙 */
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4; /* B - 淺黃 */
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
