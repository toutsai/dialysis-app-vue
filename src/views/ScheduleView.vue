<!-- 檔案路徑: src/views/ScheduleView.vue (桌面/行動雙系統最終版) -->
<template>
  <div class="page-container" :class="{ 'is-locked': isPageLocked }">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
    </div>

    <!-- ======================================================= -->
    <!--                  共用的 Header 和 Modal                  -->
    <!-- ======================================================= -->

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
          <!-- 以下按鈕僅在桌面版顯示 -->
          <button class="btn btn-warning desktop-only" @click="runScheduleCheck">排程檢視</button>
          <button
            class="btn btn-info desktop-only"
            @click="isAssignmentDialogVisible = true"
            :disabled="isPageLocked"
          >
            智慧排床
          </button>
          <button
            class="btn desktop-only"
            @click="autoAssignNurseTeams"
            :disabled="isPageLocked"
            style="background-color: #007bff; color: white; border-color: #007bff"
          >
            自動分組
          </button>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
          <!-- 儲存按鈕僅在桌面版顯示，因為行動版是純查閱 -->
          <button
            class="btn btn-success desktop-only"
            @click="saveDataToCloud"
            :disabled="!hasUnsavedChanges || isPageLocked"
          >
            儲存
          </button>
          <button class="btn btn-info" @click="triggerPrint">列印</button>
        </div>
      </div>
      <!-- 控制面板僅在桌面版顯示 -->
      <div class="controls-panel desktop-only">
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
      <!-- ======================================================= -->
      <!--                   1. 桌面版複雜佈局                     -->
      <!-- ======================================================= -->
      <div class="schedule-content desktop-only">
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

      <!-- 2. 手機版/列印版 簡化列表 -->
      <div class="simplified-view mobile-and-print-only">
        <div class="simplified-stats">
          <div v-for="shiftCode in ORDERED_SHIFT_CODES" :key="shiftCode" class="stat-item">
            <span class="stat-label">{{ getShiftDisplayName(shiftCode) }}</span>
            <span class="stat-value">
              門{{ statsToolbarData[0]?.counts[shiftCode]?.opd || 0 }} | 住{{
                statsToolbarData[0]?.counts[shiftCode]?.ipd || 0
              }}
              | 急{{ statsToolbarData[0]?.counts[shiftCode]?.er || 0 }}
            </span>
          </div>
        </div>

        <table class="simplified-table">
          <thead>
            <tr>
              <th class="col-bed">床號</th>
              <th v-for="shiftCode in ORDERED_SHIFT_CODES" :key="shiftCode">
                {{ getShiftDisplayName(shiftCode) }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="bedNum in sortedBedNumbers" :key="bedNum">
              <td class="col-bed">{{ bedNum }}</td>
              <td
                v-for="shiftCode in ORDERED_SHIFT_CODES"
                :key="shiftCode"
                :class="getPatientCellStyle(`bed-${bedNum}-${shiftCode}`)"
                @click="handleSlotClick(`bed-${bedNum}-${shiftCode}`)"
              >
                <div
                  v-if="currentRecord.schedule[`bed-${bedNum}-${shiftCode}`]"
                  class="patient-info-cell"
                >
                  <div class="patient-mrn-name">
                    <span>{{
                      patientMap.get(currentRecord.schedule[`bed-${bedNum}-${shiftCode}`].patientId)
                        ?.medicalRecordNumber
                    }}</span>
                    <span>{{ getPatientName(`bed-${bedNum}-${shiftCode}`) }}</span>
                  </div>
                  <div class="patient-note">
                    {{ getCombinedNote(`bed-${bedNum}-${shiftCode}`) }}
                  </div>
                </div>
              </td>
            </tr>
            <tr v-for="i in peripheralBedCount" :key="`p-${i}`">
              <td class="col-bed">外圍 {{ i }}</td>
              <td
                v-for="shiftCode in ORDERED_SHIFT_CODES"
                :key="shiftCode"
                :class="getPatientCellStyle(`peripheral-${i}-${shiftCode}`)"
                @click="handleSlotClick(`peripheral-${i}-${shiftCode}`)"
              >
                <div
                  v-if="currentRecord.schedule[`peripheral-${i}-${shiftCode}`]"
                  class="patient-info-cell"
                >
                  <div class="patient-mrn-name">
                    <span>{{
                      patientMap.get(
                        currentRecord.schedule[`peripheral-${i}-${shiftCode}`].patientId,
                      )?.medicalRecordNumber
                    }}</span>
                    <span>{{ getPatientName(`peripheral-${i}-${shiftCode}`) }}</span>
                  </div>
                  <div class="patient-ward-note">
                    <span class="ward-number">{{
                      currentRecord.schedule[`peripheral-${i}-${shiftCode}`]?.wardNumber
                    }}</span>
                    <span class="patient-note">{{
                      getCombinedNote(`peripheral-${i}-${shiftCode}`)
                    }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
        class="desktop-only"
        :class="{ 'sidebar-locked': isPageLocked }"
        :use-daily-filter="true"
        :day-of-week="dayOfWeek"
      />
    </main>

    <!-- Modal 組件 -->
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
    <ConditionRecordModal
      :is-visible="isConditionModalVisible"
      :patient="selectedPatientForRecord"
      :current-date="currentDate"
      @close="isConditionModalVisible = false"
      @save="handleSaveConditionRecord"
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
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useTeamAssigner } from '@/composables/useTeamAssigner.js'
import { useNotification } from '@/composables/useNotification.js'
import { useScheduleAnalysis } from '@/composables/useScheduleAnalysis.js'

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
import ConditionRecordModal from '@/components/ConditionRecordModal.vue'
import { getUnifiedCellStyle } from '@/utils/scheduleUtils.js'

// --- API and Constants ---
const conditionRecordsApi = ApiManager('condition_records')

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
].filter((b) => b !== '空')

const sortedBedNumbers = computed(() => {
  const numericBeds = allBedNumbers.filter((b) => typeof b === 'number')
  return [...numericBeds].sort((a, b) => a - b)
})

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

const isConditionModalVisible = ref(false)
const selectedPatientForRecord = ref(null)

const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})

const { addNotification } = useNotification()

// ‼️‼️‼️ 在這裡新增 showAlert 函式 ‼️‼️‼️
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}

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

const { scheduledPatientIds, getDailyUnassignedPatients, getDailyTemporaryPatients } =
  useScheduleAnalysis(
    allPatients,
    computed(() => currentRecord.schedule),
    freqToDays,
  )

const patientGroupsForDialog = computed(() => {
  const groups = {
    '今日應排 - 急診': [],
    '今日應排 - 住院': [],
    '今日應排 - 門診': [],
    '今日非排 (臨洗) - 急診': [],
    '今日非排 (臨洗) - 住院': [],
    '今日非排 (臨洗) - 門診': [],
  }
  getDailyUnassignedPatients(dayOfWeek).value.forEach((p) => {
    if (p.status === 'er') groups['今日應排 - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日應排 - 住院'].push(p)
    else if (p.status === 'opd') groups['今日應排 - 門診'].push(p)
  })
  getDailyTemporaryPatients(dayOfWeek).value.forEach((p) => {
    if (p.status === 'er') groups['今日非排 (臨洗) - 急診'].push(p)
    else if (p.status === 'ipd') groups['今日非排 (臨洗) - 住院'].push(p)
    else if (p.status === 'opd') groups['今日非排 (臨洗) - 門診'].push(p)
  })
  return groups
})

const statsToolbarData = computed(() => {
  const counts = {}
  ORDERED_SHIFT_CODES.forEach((shiftCode) => {
    counts[shiftCode] = { total: 0, opd: 0, ipd: 0, er: 0 }
  })
  const dailyData = { counts: counts, total: 0 }
  if (currentRecord.schedule) {
    for (const slotData of Object.values(currentRecord.schedule)) {
      if (slotData && slotData.patientId) {
        const patient = patientMap.value.get(slotData.patientId)
        if (!patient) continue
        let shiftCode = slotData.shiftId?.split('-').pop()
        if (shiftCode && dailyData.counts[shiftCode]) {
          const shiftStats = dailyData.counts[shiftCode]
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

function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  const isMobile = window.innerWidth <= 992
  if (isMobile) {
    if (slotData?.patientId) {
      const patient = patientMap.value.get(slotData.patientId)
      if (patient) {
        selectedPatientForRecord.value = patient
        isConditionModalVisible.value = true
      }
    }
    return
  }
  if (isPageLocked.value) {
    if (slotData?.patientId) showPatientMemos(slotData.patientId)
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

async function handleSaveConditionRecord(recordData) {
  if (!selectedPatientForRecord.value || !recordData.content) {
    return
  }
  try {
    const dataToSave = {
      patientId: selectedPatientForRecord.value.id,
      patientName: selectedPatientForRecord.value.name,
      recordDate: formatDate(currentDate.value),
      content: recordData.content,
      authorId: auth.currentUser.value.uid,
      authorName: auth.currentUser.value.name,
      createdAt: new Date(),
    }
    await conditionRecordsApi.save(dataToSave)
    isConditionModalVisible.value = false
    addNotification(`已為 ${selectedPatientForRecord.value.name} 新增一筆病情紀錄`, 'schedule')
  } catch (error) {
    console.error('儲存病情紀錄失敗:', error)
    showAlert('儲存失敗', `儲存病情紀錄時發生錯誤: ${error.message}`)
  }
}

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
        if (slotData.nurseTeam || slotData.nurseTeamIn || slotData.nurseTeamOut) cleared = true
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
          if (patient) mergedSlot.autoNote = generateAutoNote(patient)
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
  if (!highlightedTeam.value) return false
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
  if (targetCell) targetCell.classList.add('drag-over')
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
  return getUnifiedCellStyle(slotData, patient)
}
function triggerPrint() {
  window.print()
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
  const allEarlyPatients = getRichPatientList(SHIFT_CODES.EARLY)
  const allNoonPatients = getRichPatientList(SHIFT_CODES.NOON)
  const allLatePatients = getRichPatientList(SHIFT_CODES.LATE)
  const earlyMain = mainArea(allEarlyPatients)
  const useEarlyTeamA = earlyMain.length > 36
  const earlyTeamsToUse = baseTeams.filter((t) => t !== 'L').map((t) => `早${t}`)
  const earlyRegularTeams = baseTeams
    .filter((t) => !['A', 'K', 'L'].includes(t))
    .map((t) => `早${t}`)
  const earlyRules = {
    priorityTeams: {
      hepatitis: '早G',
      inPatientTeams: ['早H', '早I', '早J'],
      inPatientCapacity: { 早H: 2, 早I: 2, 早J: 2 },
    },
    mainDistribution: {
      specialTeam: useEarlyTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: earlyRegularTeams,
    },
  }
  const earlyAssignments = distributePatients(sort(earlyMain), earlyTeamsToUse, earlyRules)
  earlyAssignments['早外圍'] = peripheral(allEarlyPatients)
  const noonMain = mainArea(allNoonPatients)
  const useNoonTeamA = noonMain.length > 36
  const noonOnRules = {
    ...earlyRules,
    mainDistribution: {
      specialTeam: useNoonTeamA ? { name: '早A', capacity: 2 } : null,
      regularTeams: earlyRegularTeams,
    },
  }
  const noonOnAssignments = distributePatients(sort(noonMain), earlyTeamsToUse, noonOnRules)
  noonOnAssignments['早外圍'] = peripheral(allNoonPatients)
  const lateTeamsToUse = baseTeams.filter((t) => t <= 'H').map((t) => `晚${t}`)
  const lateRules = {
    priorityTeams: { hepatitis: '晚G', inPatientTeams: ['晚H'], inPatientCapacity: { 晚H: 2 } },
    mainDistribution: { specialTeam: null, regularTeams: lateTeamsToUse },
  }
  const noonOffAssignments = distributePatients(sort(noonMain), lateTeamsToUse, lateRules)
  noonOffAssignments['晚外圍'] = peripheral(allNoonPatients)
  const lateMain = mainArea(allLatePatients)
  const lateAssignments = distributePatients(sort(lateMain), lateTeamsToUse, lateRules)
  lateAssignments['晚外圍'] = peripheral(allLatePatients)
  Object.values(scheduleCopy).forEach((slot) => {
    if (slot) {
      slot.nurseTeam = null
      slot.nurseTeamIn = null
      slot.nurseTeamOut = null
    }
  })
  for (const team in earlyAssignments) {
    for (const patient of earlyAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) scheduleCopy[patient.shiftId].nurseTeam = team
    }
  }
  for (const team in noonOnAssignments) {
    for (const patient of noonOnAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) scheduleCopy[patient.shiftId].nurseTeamIn = team
    }
  }
  for (const team in noonOffAssignments) {
    for (const patient of noonOffAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) scheduleCopy[patient.shiftId].nurseTeamOut = team
    }
  }
  for (const team in lateAssignments) {
    for (const patient of lateAssignments[team]) {
      if (scheduleCopy[patient.shiftId]) scheduleCopy[patient.shiftId].nurseTeam = team
    }
  }
  currentRecord.schedule = scheduleCopy
  setChange()
  statusIndicator.value = '自動分組完成，請確認並儲存'
  alertDialogTitle.value = '操作成功'
  alertDialogMessage.value = '四個班次的自動分組已全部完成！請檢視結果並點擊「儲存」。'
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
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */
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

.page-container {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  padding: 0.5rem 1rem;
}
.page-header {
  flex-shrink: 0;
  border-bottom: 1px solid #e0e0e0;
  z-index: 10;
  padding-bottom: 0.5rem;
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
  padding: 0.5rem;
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
  gap: 10px;
}
.page-title {
  font-size: 24px;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 8px;
}
.current-date-text,
.weekday-display {
  font-size: 22px;
  font-weight: bold;
}
.weekday-display {
  color: var(--primary-color, #007bff);
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
  font-size: 0.9em;
}
.controls-panel {
  display: flex;
  flex-wrap: nowrap;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.controls-right {
  margin-left: auto;
}
.btn,
button {
  padding: 6px 12px;
  font-size: 0.9em;
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
  gap: 12px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 15px 4px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-size: 1.2em;
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
  gap: 8px;
}
.bed-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.bed,
.nursing-station,
.peripheral-bed {
  border: 1px solid #ccc;
  border-radius: 6px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: all 0.2s ease-in-out;
}
.bed {
  min-height: 150px;
}
.nursing-station {
  background-color: #f0f4c3;
  border: 2px dashed #afb42b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2em;
  font-weight: bold;
  color: #558b2f;
  grid-column: span 3;
  padding: 30px 0;
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 5px;
  text-align: center;
  font-size: 0.9em;
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
  grid-template-columns: 24px 45px 1fr 35px;
}
.peripheral-shift-row {
  grid-template-columns: 24px 60px 70px 1fr 40px;
}
.shift-label {
  background-color: #f5f5f5;
  font-size: 0.75em;
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
  padding: 2px 4px;
  min-height: 45px;
  border-left: 1px solid #e0e0e0;
  word-break: break-all;
  text-align: center;
}
.patient-tag {
  font-size: 0.8em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 4px;
  color: #dc3545;
  font-weight: bold;
}
.nurse-team-select {
  padding: 2px;
  border: none;
  font-size: 0.75em;
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
  background-color: #fffde7;
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
  border-left: 4px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 4px solid #4caf50;
}
.shift-row.status-opd,
.peripheral-shift-row.status-opd {
  background-color: #e8f5e9;
}
.shift-row.status-ipd,
.peripheral-shift-row.status-ipd {
  background-color: #ffebee;
}
.shift-row.status-er,
.peripheral-shift-row.status-er {
  background-color: #f3e5f5;
}
.shift-row.status-biweekly,
.peripheral-shift-row.status-biweekly {
  background-color: #fff3e0;
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #e3f2fd;
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #fffde7;
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
  font-size: 1em;
  font-weight: bold;
  padding: 2px 4px;
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
  font-size: 1.2rem;
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
  margin-top: 20px;
}
.peripheral-section {
  margin-bottom: 20px;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 8px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  color: #c2185b;
}
.team-highlight-container {
  display: flex;
  gap: 0.5rem;
  padding: 6px;
  background-color: #e9ecef;
  border-radius: 8px;
}
.team-group {
  display: flex;
  align-items: center;
}
.team-group-label {
  font-weight: bold;
  font-size: 1rem;
  color: #495057;
  margin-right: 6px;
  writing-mode: vertical-rl;
  background-color: #ced4da;
  padding: 6px 3px;
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
  padding: 4px 10px;
  font-size: 0.85em;
  min-width: 35px;
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

/* ================================== */
/*         響應式與列印樣式            */
/* ================================== */
.mobile-and-print-only {
  display: none;
}
.desktop-only {
  display: block;
}
.page-main-content > .desktop-only:first-child {
  display: flex;
  flex-grow: 1;
  min-width: 0;
  flex-direction: column;
}
.page-main-content > .desktop-only:last-child {
  display: flex;
  flex-direction: column;
}

.simplified-stats {
  display: flex;
  justify-content: space-around;
  background-color: #f8f9fa;
  padding: 0.75rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  border: 1px solid #dee2e6;
}
.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}
.stat-label {
  font-weight: bold;
  font-size: 1.1rem;
  color: #343a40;
}
.stat-value {
  font-size: 0.9rem;
  color: #6c757d;
}
.simplified-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
  table-layout: fixed;
}
.simplified-table th,
.simplified-table td {
  border: 1px solid #ccc;
  padding: 0.5rem;
  text-align: center;
  vertical-align: top;
}
.simplified-table th {
  background-color: #e9ecef;
  font-weight: 600;
}
.simplified-table .col-bed {
  font-weight: bold;
  background-color: #f8f9fa;
  width: 80px;
}
.patient-info-cell {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  cursor: pointer;
}
.patient-mrn-name {
  font-weight: bold;
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.patient-note {
  font-size: 0.85rem;
  color: #dc3545;
  font-weight: 500;
}
.patient-ward-note {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ward-number {
  font-weight: bold;
  background-color: #ffc107;
  color: #333;
  padding: 0 4px;
  border-radius: 4px;
}

@media screen and (max-width: 992px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-and-print-only {
    display: block;
  }

  .page-container {
    padding: 0;
  }
  .page-header {
    padding: 1rem;
  }
  .page-main-content {
    display: block;
    overflow-y: auto;
  }
  .schedule-content {
    padding: 0;
  }
  .simplified-view {
    padding: 1rem;
  }

  .header-toolbar {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .toolbar-left,
  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
  }
  .date-navigator {
    justify-content: space-between;
  }
  .page-title {
    text-align: center;
  }

  .controls-panel {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .controls-right {
    flex-direction: column;
    align-items: stretch;
  }
  .team-highlight-container {
    justify-content: center;
  }

  .simplified-stats {
    flex-direction: column;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .stat-item {
    flex-direction: row;
    width: 100%;
    justify-content: space-between;
  }
}

@media print {
  .desktop-only,
  .page-header,
  .inpatient-sidebar {
    display: none !important;
  }
  .mobile-and-print-only {
    display: block !important;
  }

  @page {
    size: A4;
    margin: 1cm;
  }
  body,
  .page-container {
    background-color: #fff !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  .page-main-content {
    box-shadow: none;
    border: none;
    overflow: visible;
  }
  .simplified-table {
    font-size: 10pt;
  }
  .simplified-table th,
  .simplified-table td {
    padding: 4px;
  }
  .simplified-table td[class*='status-'] {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
