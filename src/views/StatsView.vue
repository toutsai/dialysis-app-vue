<!-- 檔案路徑: src/views/StatsView.vue (還原為 ApiManager 的穩定版) -->
<template>
  <div class="page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <span>正在載入 {{ formatDate(currentDate) }} 的資料...</span>
    </div>
    <div class="header-toolbar">
      <div class="toolbar-left">
        <h1 class="page-title">護理分組檢視</h1>
        <div class="date-navigator">
          <button @click="changeDate(-1)" class="date-nav-btn">< 上一天</button>
          <span class="current-date-text">{{ formatDate(currentDate) }}</span>
          <span class="weekday-display">{{ weekdayDisplay }}</span>
          <button @click="changeDate(1)" class="date-nav-btn">下一天 ></button>
          <button @click="goToToday">回到今日</button>
        </div>
      </div>
      <div class="toolbar-right">
        <span class="status-indicator">{{ statusIndicator }}</span>
        <button
          id="save-changes-btn"
          :disabled="!hasUnsavedChanges || isPageLocked"
          @click="saveChangesToCloud"
        >
          儲存變更
        </button>
        <button @click="triggerPrint">列印報表</button>
      </div>
    </div>

    <div class="duty-command-bar">
      <div class="main-commanders">
        <span class="duty-title">消防編組:</span>
        <span class="duty-role-tag role-commander">總指揮官</span>
        <span class="duty-person">廖丁瑩主任</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-reporter">通報班</span>
        <span class="duty-person">謝淑琴書記</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-field-commander">現場指揮官</span>
        <span class="duty-person">莊明月護理長</span>
        <span class="duty-divider"></span>
        <span class="duty-role-tag role-guide">引導救護班</span>
        <span class="duty-person">工友</span>
      </div>
      <div class="duty-dropdown-wrapper">
        <button
          class="duty-dropdown-trigger"
          @click="isFireDutyDropdownVisible = !isFireDutyDropdownVisible"
        >
          <span>勤務分組詳情</span>
          <span class="toggle-arrow" :class="{ 'is-rotated': isFireDutyDropdownVisible }">▼</span>
        </button>
        <transition name="slide-fade">
          <div v-if="isFireDutyDropdownVisible" class="duty-dropdown-menu">
            <div v-for="(duties, shift) in dutyAssignments" :key="shift" class="duty-shift-group">
              <h4 class="duty-shift-header">
                {{ shift === 'early' ? '早班' : shift === 'late' ? '午/晚班' : '夜班' }}
              </h4>
              <div class="duty-item" v-for="(teams, dutyName) in duties" :key="dutyName">
                <div class="duty-name" :class="getDutyTagClass(dutyName)">{{ dutyName }}</div>
                <div class="duty-teams">
                  <span
                    v-if="Array.isArray(teams)"
                    v-for="team in teams"
                    :key="team"
                    class="duty-team-tag"
                    >{{ team }}</span
                  >
                  <span v-else class="duty-team-tag">{{ teams }}</span>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>

    <div class="stats-sections-wrapper">
      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <div class="grid-header">
            <div class="row-header section-title-cell">早班</div>
            <div
              v-for="(_, teamName) in effectiveStatsData.early"
              :key="teamName"
              class="team-header-cell"
            >
              {{ teamName.replace('早', '') }}組
            </div>
          </div>
          <div class="grid-body">
            <div class="grid-row">
              <div class="row-header">姓名</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                  :disabled="isPageLocked"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">早班</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'earlyShift')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.earlyShift.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'earlyShift')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.earlyShift.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'earlyShift')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(上針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOn')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOn.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOn')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOn.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOn')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(收針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.early"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOff.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOff')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
          </div>
          <div class="grid-footer">
            <div class="row-header">照護人數</div>
            <div
              v-for="(teamData, teamName) in effectiveStatsData.early"
              :key="teamName"
              class="total-count-summary"
            >
              門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
                teamData.totalErCount
              }}
            </div>
          </div>
        </div>
      </div>

      <div class="stats-section" :class="{ 'is-locked': isPageLocked }">
        <div class="grid-container">
          <div class="grid-header">
            <div class="row-header section-title-cell">晚班</div>
            <div
              v-for="(_, teamName) in effectiveStatsData.late"
              :key="teamName"
              class="team-header-cell"
            >
              {{ teamName.replace('晚', '') }}組
            </div>
          </div>
          <div class="grid-body">
            <div class="grid-row">
              <div class="row-header">姓名</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell name-cell"
              >
                <select
                  :value="teamData.nurseName"
                  @change="updateNurseName(teamName, $event)"
                  class="name-select"
                  :disabled="isPageLocked"
                >
                  <option value="">-- 未指派 --</option>
                  <option v-for="name in nurseNameList" :key="name" :value="name">
                    {{ name }}
                  </option>
                </select>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">午班(收針)</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'noonShiftOff')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.noonShiftOff.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'noonShiftOff')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.noonShiftOff.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'noonShiftOff')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
            <div class="grid-row">
              <div class="row-header">晚班</div>
              <div
                v-for="(teamData, teamName) in effectiveStatsData.late"
                :key="teamName"
                class="grid-cell patient-list-cell"
                @drop="!isPageLocked && onDrop($event, teamName, 'lateShift')"
                @dragover.prevent="!isPageLocked && onDragOver($event)"
                @dragleave="onDragLeave"
              >
                <div class="patient-wrapper">
                  <div
                    v-for="patient in teamData.lateShift.patients"
                    :key="patient.shiftId"
                    :class="patient.classes"
                    :draggable="!isPageLocked"
                    @dragstart="!isPageLocked && onDragStart($event, patient, 'lateShift')"
                  >
                    <div
                      class="patient-main-info"
                      @click="!isPageLocked && openBedChangeDialog(patient)"
                      v-html="getPatientDisplayString(patient)"
                      title="點擊換床"
                    ></div>
                    <MemoIcon :patient-id="patient.id" />
                  </div>
                </div>
                <div
                  class="prep-list-trigger"
                  v-if="teamData.lateShift.patients.length > 0"
                  @click="showPrepPopover($event, teamData, 'lateShift')"
                  title="顯示備物清單"
                >
                  📋
                </div>
              </div>
            </div>
          </div>
          <div class="grid-footer">
            <div class="row-header">照護人數</div>
            <div
              v-for="(teamData, teamName) in effectiveStatsData.late"
              :key="teamName"
              class="total-count-summary"
            >
              門{{ teamData.totalOpdCount }} 住{{ teamData.totalIpdCount }} 急{{
                teamData.totalErCount
              }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <MemoDisplayDialog
      :is-visible="isMemoDialogVisible"
      :patient-name="patientNameForDialog"
      :memos="memosForDialog"
      @close="isMemoDialogVisible = false"
    />
    <BedChangeDialog
      :is-visible="isBedChangeDialogVisible"
      :patient-info="editingPatientInfo"
      :current-schedule="currentRecord.schedule"
      :target-shift-filter="bedChangeTargetShift"
      @confirm="handleBedChange"
      @cancel="handleDialogCancel"
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
    <PreparationPopover
      :is-visible="isPrepPopoverVisible"
      :patients="prepPopoverData.patients"
      :target-element="prepPopoverData.targetElement"
      @close="onPrepPopoverClose"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, computed, reactive, watch, provide } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, limit } from 'firebase/firestore'
import BedChangeDialog from '@/components/BedChangeDialog.vue'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import { useAuth } from '@/composables/useAuth.js'
import MemoDisplayDialog from '@/components/MemoDisplayDialog.vue'
import MemoIcon from '@/components/MemoIcon.vue'
import { useNotification } from '@/composables/useNotification.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PreparationPopover from '@/components/PreparationPopover.vue'
import { getUnifiedCellStyle } from '@/utils/scheduleUtils.js'

// --- [核心修正] 回歸使用舊版、獨立的 ApiManager ---
const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')
const memosApi = ApiManager('memos')
const ordersHistoryApi = ApiManager('dialysis_orders_history')

// --- 常量 ---
const nurseNameList = [
  '陳素秋',
  '古孟麗',
  '謝常菁',
  '林玉麗',
  '陳聖柔',
  '田姿瑛',
  '陳韋吟',
  '劉姿秀',
  '劉舒婷',
  '李慈賢',
  '黃羿寧',
  '高佩鳳',
  '林沛儀',
  '陳芃諭',
  '葛孟萍',
  '蘇愛玲',
  '郭芳君',
  '林馨如',
  '胡國暄',
  '施艾利',
  '陳淑玲',
  '謝慶諭',
  '林佩佳',
  '吳思婷',
  '吳幸美',
  '林芳羽',
]
const earlyBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const lateBaseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = earlyBaseTeams.map((t) => `早${t}`)
const lateTeams = lateBaseTeams.map((t) => `晚${t}`)
const dutyAssignments = {
  early: {
    現場指揮官: 'K',
    安全防護班: ['A', 'B', 'J-75'],
    引導救護班: ['C', 'D', 'E', 'G', 'H-1', 'I-2'],
    滅火班: 'F-75',
  },
  late: {
    現場指揮官: 'K',
    安全防護班: ['A', 'B', 'J-75'],
    引導救護班: ['C', 'D', 'E', 'G', 'H-1', 'I-2'],
    滅火班: 'F-75',
  },
  night: {
    現場指揮官: 'A',
    '安全防護班/通報班': 'B',
    引導救護班: ['C', 'D', 'E', 'G', 'H'],
    滅火班: 'F-128',
  },
}
const isFireDutyDropdownVisible = ref(false)

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const activeMemos = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const isLoading = ref(false)

// --- UI 狀態 ---
const isBedChangeDialogVisible = ref(false)
const editingPatientInfo = ref(null)
const isMemoDialogVisible = ref(false)
const memosForDialog = ref([])
const patientNameForDialog = ref('')
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogMessage = ref('')
const onConfirmAction = ref(null)
// ✨ 新增：撞床處理狀態
const pendingChangeInfo = ref(null)
const bedChangeTargetShift = ref(null)
const isPrepPopoverVisible = ref(false)
const prepPopoverData = reactive({ patients: [], targetElement: null })

const { addNotification } = useNotification()
const auth = useAuth()
const isPageLocked = computed(() => {
  if (!auth.canEditSchedules.value) return true
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentDay = new Date(currentDate.value)
  currentDay.setHours(0, 0, 0, 0)
  return currentDay < today
})

// --- Helper Functions & 計算屬性 ---
const formatDate = (date) => {
  if (!date) return ''
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

function showPrepPopover(event, teamData, shiftType) {
  const patientsInShift = teamData[shiftType]?.patients || []
  if (patientsInShift.length === 0) return
  prepPopoverData.patients = patientsInShift
  prepPopoverData.targetElement = event.currentTarget
  isPrepPopoverVisible.value = true
}

function onPrepPopoverClose() {
  isPrepPopoverVisible.value = false
}

function showPatientMemos(patientId) {
  if (!patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  memosForDialog.value = activeMemos.value.filter((memo) => memo.patientId === patientId)
  patientNameForDialog.value = patient.name
  isMemoDialogVisible.value = true
}

const getPatientDisplayString = (patientDetail) => {
  if (!patientDetail) return ''
  let identifier = ''
  if (patientDetail.shiftId.startsWith('peripheral')) {
    identifier = patientDetail.wardNumber || '外圍'
  } else {
    const parts = patientDetail.shiftId.split('-')
    if (parts.length >= 2) {
      identifier = parts[1]
    }
  }
  const name = patientDetail.name
  const firstLineHtml = `<div class="patient-line-one">${identifier} - ${name}</div>`
  let secondLineContent = ''
  if (patientDetail.mode && patientDetail.mode !== 'HD') {
    secondLineContent += `<span class="stats-special-mode">(${patientDetail.mode})</span>`
  }
  const autoTags = (patientDetail.autoNote || '').split(' ').filter(Boolean)
  const manualTags = (patientDetail.manualNote || '').split(' ').filter(Boolean)
  const combinedTags = [...new Set([...autoTags, ...manualTags])]
  const finalTags = combinedTags.filter((tag) => !['住', '急'].includes(tag))
  if (finalTags.length > 0) {
    secondLineContent += ` <span class="note-display">${finalTags.join(' ')}</span>`
  }
  const secondLineHtml = secondLineContent
    ? `<div class="patient-line-two">${secondLineContent.trim()}</div>`
    : ''
  return firstLineHtml + secondLineHtml
}

const patientWithMemoIds = computed(
  () => new Set(activeMemos.value.filter((memo) => memo.patientId).map((memo) => memo.patientId)),
)
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const weekdayDisplay = computed(() => {
  if (!currentDate.value) return ''
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  return weekdays[new Date(currentDate.value).getDay()]
})

// ✨ --- 核心修正：將 watchEffect 改為 computed 屬性 --- ✨
const effectiveStatsData = computed(() => {
  // 依賴項：如果 schedule 或 patientMap 還沒準備好，就返回空結構
  if (!currentRecord.schedule || patientMap.value.size === 0) {
    return { early: {}, late: {} }
  }

  // 1. 初始化空的組別統計物件
  const earlyShiftStats = {}
  const lateShiftStats = {}
  earlyTeams.forEach((team) => {
    earlyShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      earlyShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOn: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })
  lateTeams.forEach((team) => {
    lateShiftStats[team] = {
      nurseName: (currentRecord.names && currentRecord.names[team]) || '',
      noonShiftOff: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      lateShift: { patients: [], opdCount: 0, ipdCount: 0, erCount: 0 },
      totalOpdCount: 0,
      totalIpdCount: 0,
      totalErCount: 0,
    }
  })

  // 2. 遍歷當前的排程資料，將病人分配到組別中
  for (const shiftId in currentRecord.schedule) {
    const shiftDetails = currentRecord.schedule[shiftId]
    if (!shiftDetails || !shiftDetails.patientId) continue

    const patient = patientMap.value.get(shiftDetails.patientId)
    if (!patient) continue

    const { patientId, autoNote, manualNote, wardNumber, nurseTeam, nurseTeamIn, nurseTeamOut } =
      shiftDetails

    // 創建詳細的病人物件以供顯示
    const detail = {
      id: patientId,
      shiftId,
      name: patient.name,
      status: patient.status,
      mode: patient.mode,
      autoNote: autoNote || '',
      manualNote: manualNote || '',
      wardNumber: wardNumber || '',
      classes: 'patient-item',
      dialysisOrders: patient.dialysisOrders || {},
    }

    // 🔥 【修正】使用統一的顏色邏輯來設定 CSS 類名
    const colorClasses = getUnifiedCellStyle(shiftDetails, patient)

    // 將顏色類名轉換為 StatsView 需要的格式
    let cssClasses = 'patient-item'

    if (colorClasses['status-opd']) cssClasses += ' status-opd'
    if (colorClasses['status-ipd']) cssClasses += ' status-ipd'
    if (colorClasses['status-er']) cssClasses += ' status-er'
    if (colorClasses['status-biweekly']) cssClasses += ' status-biweekly' // ✅ 新增橘色兩班
    if (colorClasses['tag-chou']) cssClasses += ' tag-chou'
    if (colorClasses['tag-new']) cssClasses += ' tag-new'

    // 🔥 【向後兼容】保留 StatsView 特有的標籤類名
    const combinedNote = [
      ...new Set([
        ...(autoNote || '').split(' ').filter(Boolean),
        ...(manualNote || '').split(' ').filter(Boolean),
      ]),
    ].join(' ')

    if (combinedNote) cssClasses += ' has-note-highlight'
    if (combinedNote.includes('兩')) cssClasses += ' tag-liang'
    if (combinedNote.includes('換')) cssClasses += ' tag-huan'
    if (combinedNote.includes('B')) cssClasses += ' tag-b'

    detail.classes = cssClasses

    const assignAndCount = (group, patientDetail) => {
      group.patients.push(patientDetail)
      if (patientDetail.status === 'ipd') group.ipdCount++
      else if (patientDetail.status === 'er') group.erCount++
      else group.opdCount++
    }

    const shiftCode = shiftId.split('-')[2]

    if (shiftCode === SHIFT_CODES.EARLY && nurseTeam && earlyShiftStats[nurseTeam]) {
      assignAndCount(earlyShiftStats[nurseTeam].earlyShift, detail)
    } else if (shiftCode === SHIFT_CODES.LATE && nurseTeam && lateShiftStats[nurseTeam]) {
      assignAndCount(lateShiftStats[nurseTeam].lateShift, detail)
    } else if (shiftCode === SHIFT_CODES.NOON) {
      if (nurseTeamIn && earlyShiftStats[nurseTeamIn]) {
        assignAndCount(earlyShiftStats[nurseTeamIn].noonShiftOn, detail)
      }
      if (nurseTeamOut) {
        if (lateShiftStats[nurseTeamOut]) {
          assignAndCount(lateShiftStats[nurseTeamOut].noonShiftOff, detail)
        } else if (earlyShiftStats[nurseTeamOut]) {
          assignAndCount(earlyShiftStats[nurseTeamOut].noonShiftOff, detail)
        }
      }
    }
  }

  // 3. 排序和計算總數 (保持原有邏輯)
  const sortPatientsByBed = (a, b) => {
    const getSortKey = (shiftId) => {
      if (!shiftId || typeof shiftId !== 'string') return 999
      const parts = shiftId.split('-')
      if (parts[0] === 'peripheral') return 100 + parseInt(parts[1], 10)
      const num = parseInt(parts[1], 10)
      return isNaN(num) ? 999 : num
    }
    return getSortKey(a.shiftId) - getSortKey(b.shiftId)
  }

  for (const team in earlyShiftStats) {
    Object.values(earlyShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
    const teamData = earlyShiftStats[team]
    teamData.totalOpdCount =
      (teamData.earlyShift.opdCount || 0) + (teamData.noonShiftOn.opdCount || 0)
    teamData.totalIpdCount =
      (teamData.earlyShift.ipdCount || 0) + (teamData.noonShiftOn.ipdCount || 0)
    teamData.totalErCount = (teamData.earlyShift.erCount || 0) + (teamData.noonShiftOn.erCount || 0)
  }
  for (const team in lateShiftStats) {
    Object.values(lateShiftStats[team]).forEach((group) => {
      if (group.patients) group.patients.sort(sortPatientsByBed)
    })
    const teamData = lateShiftStats[team]
    teamData.totalOpdCount =
      (teamData.lateShift.opdCount || 0) + (teamData.noonShiftOff.opdCount || 0)
    teamData.totalIpdCount =
      (teamData.lateShift.ipdCount || 0) + (teamData.noonShiftOff.ipdCount || 0)
    teamData.totalErCount = (teamData.lateShift.erCount || 0) + (teamData.noonShiftOff.erCount || 0)
  }

  // 4. 返回最終結果
  return { early: earlyShiftStats, late: lateShiftStats }
})

async function getEffectiveOrdersForDate(patientId, targetDate) {
  if (!patientId || !targetDate) return {}
  const dateStr = targetDate.toISOString().slice(0, 10)
  try {
    const results = await ordersHistoryApi.fetchAll([
      where('patientId', '==', patientId),
      where('orders.effectiveDate', '<=', dateStr),
      orderBy('orders.effectiveDate', 'desc'),
      orderBy('updatedAt', 'desc'),
      limit(1),
    ])
    return results.length > 0 ? results[0].orders : {}
  } catch (error) {
    if (error.code === 'failed-precondition') {
      console.error(`Firestore 錯誤：查詢需要複合索引。`)
    } else {
      console.error(`獲取病人 ${patientId} 的醫囑失敗:`, error)
    }
    return {}
  }
}

// ✨ --- 核心修正：修改 loadData 來預先處理醫囑 --- ✨
async function loadData(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  isLoading.value = true
  const dateStr = formatDate(date)
  try {
    // 並行獲取所有基礎資料
    const [dailyRecords, patientsData, memosData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
      patientsApi.fetchAll(),
      memosApi.fetchAll([where('status', '==', 'pending')]),
    ])

    // ✨ 為每個病人預先獲取當日有效的醫囑
    const patientsWithOrdersPromises = patientsData.map(async (patient) => {
      const orders = await getEffectiveOrdersForDate(patient.id, date)
      return { ...patient, dialysisOrders: orders }
    })
    allPatients.value = await Promise.all(patientsWithOrdersPromises)
    activeMemos.value = memosData

    // 處理當日排程
    if (dailyRecords.length > 0) {
      const record = dailyRecords[0]
      // (可選，但推薦) 自動筆記的邏輯也可以在這裡處理一次
      if (record.schedule) {
        const localPatientMap = new Map(allPatients.value.map((p) => [p.id, p]))
        for (const shiftId in record.schedule) {
          const slot = record.schedule[shiftId]
          if (slot && slot.patientId) {
            const patient = localPatientMap.get(slot.patientId)
            slot.autoNote = patient ? generateAutoNote(patient) : ''
          }
        }
      }
      Object.assign(currentRecord, record)
      statusIndicator.value = '資料已載入'
    } else {
      Object.assign(currentRecord, { id: null, date: dateStr, schedule: {}, names: {} })
      statusIndicator.value = '本日無排程資料'
    }
  } catch (error) {
    console.error('讀取報表資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  } finally {
    isLoading.value = false
  }
}

function setChange() {
  if (isPageLocked.value) return
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function saveChangesToCloud() {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作禁止'
    alertDialogMessage.value = '操作被鎖定：無法儲存或權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  if (!currentRecord.id && Object.keys(currentRecord.schedule).length === 0) {
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '沒有資料可以儲存。'
    isAlertDialogVisible.value = true
    return
  }
  statusIndicator.value = '儲存中...'
  try {
    const dataToSave = {
      date: currentRecord.date,
      schedule: currentRecord.schedule,
      names: currentRecord.names,
    }
    if (currentRecord.id) {
      await schedulesApi.update(currentRecord.id, dataToSave)
    } else {
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id
    }
    hasUnsavedChanges.value = false
    statusIndicator.value = '變更已儲存！'
    addNotification(`修改護理分組: ${currentRecord.date}`, 'team')
    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = '變更儲存成功！'
    isAlertDialogVisible.value = true
    await loadData(currentDate.value)
  } catch (error) {
    console.error('儲存變更失敗:', error)
    statusIndicator.value = '儲存失敗'
    alertDialogTitle.value = '儲存失敗'
    alertDialogMessage.value = `儲存失敗: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

// ✨ --- 增強的 onDrop 函數：處理撞床情況 --- ✨
function onDrop(event, newTeam, newResponsibility) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.remove('drag-over-active')

  const patientDetail = JSON.parse(event.dataTransfer.getData('application/json'))
  const oldShiftId = patientDetail.shiftId
  if (!oldShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error(`拖曳失敗: 找不到原始紀錄 ${oldShiftId}`)
    return
  }

  const oldShiftIdParts = oldShiftId.split('-')
  const bedPart = oldShiftIdParts.slice(0, -1).join('-')

  let newShiftCode
  if (newResponsibility === 'earlyShift') newShiftCode = SHIFT_CODES.EARLY
  else if (newResponsibility === 'lateShift') newShiftCode = SHIFT_CODES.LATE
  else newShiftCode = SHIFT_CODES.NOON

  const newShiftId = `${bedPart}-${newShiftCode}`

  // 🔥 關鍵改進：如果目標床位被佔用，觸發換床對話框而不是直接報錯
  if (newShiftId !== oldShiftId && currentRecord.schedule[newShiftId]) {
    // 儲存待處理的變更信息
    pendingChangeInfo.value = {
      patientDetail: patientDetail,
      newTeam: newTeam,
      newResponsibility: newResponsibility,
    }
    bedChangeTargetShift.value = newShiftCode
    openBedChangeDialog(patientDetail)
    return
  }

  // 🎯 直接移動病人（沒有撞床的情況）
  performDirectMove(oldShiftId, newShiftId, newTeam, newResponsibility, event)
}

// ✨ --- 新增：執行直接移動的輔助函數 --- ✨
function performDirectMove(oldShiftId, newShiftId, newTeam, newResponsibility, event) {
  const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
  movingSlotData.shiftId = newShiftId

  // 清除舊的護理組別
  delete movingSlotData.nurseTeam
  delete movingSlotData.nurseTeamIn
  delete movingSlotData.nurseTeamOut

  // 設定新的護理組別
  if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
    movingSlotData.nurseTeam = newTeam
  } else if (newResponsibility === 'noonShiftOn') {
    movingSlotData.nurseTeamIn = newTeam
    // 如果原本是午班，保留 nurseTeamOut
    const oldResp = event?.dataTransfer?.getData('text/plain')
    if (oldResp === 'noonShiftOff' && currentRecord.schedule[oldShiftId].nurseTeamOut) {
      movingSlotData.nurseTeamOut = currentRecord.schedule[oldShiftId].nurseTeamOut
    }
  } else if (newResponsibility === 'noonShiftOff') {
    movingSlotData.nurseTeamOut = newTeam
    // 如果原本是午班，保留 nurseTeamIn
    const oldResp = event?.dataTransfer?.getData('text/plain')
    if (oldResp === 'noonShiftOn' && currentRecord.schedule[oldShiftId].nurseTeamIn) {
      movingSlotData.nurseTeamIn = currentRecord.schedule[oldShiftId].nurseTeamIn
    }
  }

  // 執行移動
  delete currentRecord.schedule[oldShiftId]
  currentRecord.schedule[newShiftId] = movingSlotData
  setChange()
}

function onDragStart(event, patientDetail, responsibility) {
  if (isPageLocked.value) {
    event.preventDefault()
    return
  }
  event.dataTransfer.setData('application/json', JSON.stringify(patientDetail))
  event.dataTransfer.setData('text/plain', responsibility)
  event.dataTransfer.effectAllowed = 'move'
}

function openBedChangeDialog(patientDetail) {
  if (isPageLocked.value) return
  editingPatientInfo.value = patientDetail
  isBedChangeDialogVisible.value = true
}

// ✨ --- 增強的 handleBedChange 函數：處理護理組別變更 --- ✨
function handleBedChange({ oldShiftId, newShiftId }) {
  if (isPageLocked.value) return
  if (!oldShiftId || !newShiftId || !currentRecord.schedule[oldShiftId]) {
    console.error('換床失敗，參數無效或找不到舊床位資料。')
    isBedChangeDialogVisible.value = false
    return
  }

  // 🔥 關鍵：如果有待處理的護理組別變更，一併處理
  if (pendingChangeInfo.value) {
    const { newTeam, newResponsibility } = pendingChangeInfo.value
    const movingSlotData = { ...currentRecord.schedule[oldShiftId] }
    movingSlotData.shiftId = newShiftId

    // 清除舊的護理組別
    delete movingSlotData.nurseTeam
    delete movingSlotData.nurseTeamIn
    delete movingSlotData.nurseTeamOut

    // 🎯 設定新的護理組別（來自拖曳目標）
    if (newResponsibility === 'earlyShift' || newResponsibility === 'lateShift') {
      movingSlotData.nurseTeam = newTeam
    } else if (newResponsibility === 'noonShiftOn') {
      movingSlotData.nurseTeamIn = newTeam
      // 如果目標班次是午班，可能需要保留原有的 nurseTeamOut
      if (
        bedChangeTargetShift.value === SHIFT_CODES.NOON &&
        currentRecord.schedule[oldShiftId].nurseTeamOut
      ) {
        movingSlotData.nurseTeamOut = currentRecord.schedule[oldShiftId].nurseTeamOut
      }
    } else if (newResponsibility === 'noonShiftOff') {
      movingSlotData.nurseTeamOut = newTeam
      // 如果目標班次是午班，可能需要保留原有的 nurseTeamIn
      if (
        bedChangeTargetShift.value === SHIFT_CODES.NOON &&
        currentRecord.schedule[oldShiftId].nurseTeamIn
      ) {
        movingSlotData.nurseTeamIn = currentRecord.schedule[oldShiftId].nurseTeamIn
      }
    }

    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = movingSlotData

    console.log(
      `🔄 [StatsView] 完成換班+換床+護理組別調整: ${oldShiftId} → ${newShiftId}, 組別: ${newTeam}`,
    )
  } else {
    // 🔄 純換床（不涉及護理組別變更）
    const patientData = { ...currentRecord.schedule[oldShiftId], shiftId: newShiftId }
    delete currentRecord.schedule[oldShiftId]
    currentRecord.schedule[newShiftId] = patientData
    console.log(`🔄 [StatsView] 完成純換床: ${oldShiftId} → ${newShiftId}`)
  }

  setChange()
  isBedChangeDialogVisible.value = false

  // 清理待處理狀態
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}

function updateNurseName(teamId, event) {
  if (isPageLocked.value) {
    event.target.value = currentRecord.names?.[teamId] || ''
    return
  }
  if (!currentRecord.names) {
    currentRecord.names = {}
  }
  currentRecord.names[teamId] = event.target.value
  setChange()
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    onConfirmAction.value = () => {
      const newDate = new Date(currentDate.value)
      newDate.setDate(newDate.getDate() + days)
      currentDate.value = newDate
    }
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換日期嗎？'
    isConfirmDialogVisible.value = true
  } else {
    const newDate = new Date(currentDate.value)
    newDate.setDate(newDate.getDate() + days)
    currentDate.value = newDate
  }
}

function goToToday() {
  if (hasUnsavedChanges.value && !isPageLocked.value) {
    onConfirmAction.value = () => {
      currentDate.value = new Date()
    }
    confirmDialogMessage.value = '您有未儲存的變更，確定要切換到今天嗎？'
    isConfirmDialogVisible.value = true
  } else {
    currentDate.value = new Date()
  }
}

function handleConfirm() {
  if (onConfirmAction.value) {
    onConfirmAction.value()
  }
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  onConfirmAction.value = null
}

function onDragOver(event) {
  if (isPageLocked.value) return
  event.preventDefault()
  event.currentTarget.classList.add('drag-over-active')
}

function onDragLeave(event) {
  event.currentTarget.classList.remove('drag-over-active')
}

// ✨ --- 增強的 handleDialogCancel 函數：清理待處理狀態 --- ✨
function handleDialogCancel() {
  isBedChangeDialogVisible.value = false

  // 🧹 清理待處理狀態
  pendingChangeInfo.value = null
  bedChangeTargetShift.value = null
}

function triggerPrint() {
  window.print()
}

provide('patientWithMemoIds', patientWithMemoIds)
provide('showPatientMemos', showPatientMemos)

onMounted(() => {
  loadData(currentDate.value)
})

watch(currentDate, (newDate) => {
  loadData(newDate)
})
</script>

<!-- 將 StatsView.vue 文件最末尾的 CSS 部分替換為這個 -->
<style scoped>
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
  box-sizing: border-box;
  position: relative;
}
.stats-sections-wrapper {
  overflow-y: auto;
  flex-grow: 1;
}
.stats-section {
  margin-bottom: 20px;
}
.header-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 10px;
}
.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 15px;
}
.page-title {
  font-size: 32px;
  color: #333;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 5px;
}
.current-date-text {
  font-size: 26px;
  font-weight: bold;
  color: #333;
  padding: 0 10px;
}
.weekday-display {
  font-size: 26px;
  font-weight: bold;
  color: var(--primary-color);
  margin-left: -5px;
  margin-right: 5px;
}
.status-indicator {
  font-size: 0.9em;
  font-weight: bold;
  color: #757575;
  font-style: italic;
}
.toolbar-left button,
.toolbar-right button {
  padding: 8px 15px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #fff;
  transition:
    background-color 0.2s,
    border-color 0.2s;
  white-space: nowrap;
}
#save-changes-btn {
  background-color: #4caf50;
  color: white;
  border-color: #4caf50;
}
.grid-container {
  display: grid;
  grid-template-columns: 90px repeat(12, 1fr);
  border: 1px solid #ddd;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}
.grid-header,
.grid-body,
.grid-footer {
  display: contents;
}
.grid-row {
  display: contents;
}
.row-header,
.team-header-cell,
.grid-cell,
.total-count-summary {
  border-right: 1px solid #ddd;
  border-bottom: 1px solid #ddd;
  padding: 8px;
  word-wrap: break-word;
}
.grid-container div:nth-child(13n) {
  border-right: none;
}
.grid-footer > div {
  border-bottom: none;
}
.row-header {
  background-color: #f2f2f2;
  font-weight: bold;
  text-align: center;
  position: sticky;
  left: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
}
.team-header-cell {
  background-color: #e3f2fd;
  font-weight: bold;
  text-align: center;
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.section-title-cell {
  font-size: 1.5em;
  color: #005a9c;
  background-color: #e3f2fd;
  position: sticky;
  top: 0;
  left: 0;
  z-index: 3;
}
.name-cell {
  padding: 0 !important;
}
.name-select {
  width: 100%;
  height: 100%;
  border: none;
  background-color: #fffde7;
  text-align: center;
  font-size: 1em;
  cursor: pointer;
  -webkit-appearance: none;
  appearance: none;
  padding: 8px;
}
.name-select:focus {
  outline: 2px solid #fbc02d;
}
.patient-list-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  text-align: left;
  vertical-align: top;
  min-height: 120px;
  transition: background-color 0.2s;
}
.patient-list-cell.drag-over-active {
  background-color: #e8f5e9;
  border: 2px dashed #4caf50;
}
.patient-wrapper {
  flex-grow: 1;
}
.total-count-summary {
  background-color: #f8f9fa;
  font-weight: bold;
  text-align: center;
  color: #333;
  padding: 10px 8px;
}
.patient-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: relative;
  padding: 6px 8px;
  margin-bottom: 5px;
  border-radius: 4px;
  border: 1px solid #b0bec5;
  background-color: #f5f5f5;
  font-size: 0.95em;
  line-height: 1.4;
  user-select: none;
}
.patient-main-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex-grow: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
:deep(.patient-line-one) {
  font-weight: bold;
  font-size: 1em;
  white-space: nowrap;
}
:deep(.patient-line-two) {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  white-space: nowrap;
}
:deep(.note-display) {
  color: #c62828;
  font-weight: bold;
}
:deep(.memo-icon-wrapper) {
  flex-shrink: 0;
  margin-left: auto;
  padding-left: 8px;
  align-self: center;
}
.patient-item:active {
  cursor: grabbing;
  background-color: #e0e0e0;
  opacity: 0.8;
  transform: scale(1.02);
}

/* 🔥 統一顏色系統 - 修正後的樣式 */
.patient-item.status-opd {
  background-color: var(--green-bg, #e8f5e9); /* 門診 - 綠色 */
  border-color: #a5d6a7;
}
.patient-item.status-ipd {
  background-color: var(--red-bg, #ffebee); /* 住院 - 紅色 */
  border-color: #ef9a9a;
}
.patient-item.status-er {
  background-color: var(--purple-bg, #f3e5f5); /* 急診 - 紫色 */
  border-color: #ce93d8;
}
.patient-item.status-biweekly {
  background-color: #ffcc80; /* 兩班 - 橘色 */
  border-color: #ffb74d;
}
.patient-item.tag-chou {
  background-color: #658ee0; /* 抽血 - 藍色 */
  border-color: #42a5f5;
}
.patient-item.tag-new {
  background-color: #f5ec8e; /* 新診 - 金黃 */
  border-color: #e0d567;
}
.patient-item.tag-huan {
  background-color: #e0f7fa; /* 換 - 淺青 */
  border-color: #b2ebf2;
}
.patient-item.tag-liang {
  background-color: #fff3e0; /* 兩 - 淺橙 */
  border-color: #ffe0b2;
}
.patient-item.tag-b {
  background-color: #fff9c4; /* B - 淺黃 */
  border-color: #fff59d;
}

.patient-item.has-note-highlight :deep(.patient-line-one) {
  color: #c62828;
}
:deep(.stats-special-mode) {
  display: inline-block;
  vertical-align: middle;
  padding: 1px 5px;
  background-color: var(--red-bg, #ffebee);
  color: #c62828;
  border: 1px solid #ef9a9a;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9em;
  line-height: 1.2;
}
.prep-list-trigger {
  position: absolute;
  bottom: 4px;
  right: 6px;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 2px;
  border-radius: 4px;
  transition: background-color 0.2s;
  user-select: none;
}
.prep-list-trigger:hover {
  background-color: #e0e0e0;
}
.is-locked .stats-section {
  cursor: not-allowed;
}
.is-locked .patient-list-cell {
  background-color: #f5f5f5;
}
.is-locked .name-select {
  pointer-events: none;
  background-color: #eeeeee;
}
.is-locked .patient-main-info {
  cursor: not-allowed;
}
.is-locked .patient-item {
  pointer-events: none;
}
.is-locked :deep(.memo-icon-wrapper),
.is-locked .prep-list-trigger {
  pointer-events: auto;
  cursor: pointer;
}
.duty-command-bar {
  background-color: #fffbeb;
  border: 1px solid #fef3c7;
  padding: 4px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}
.main-commanders {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.duty-title {
  font-weight: 600;
  font-size: 1.1em;
  color: #b45309;
}
.duty-role-tag {
  font-size: 0.85em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  color: #fff;
}
.duty-role-tag.role-commander {
  background-color: #be185d;
}
.duty-role-tag.role-reporter {
  background-color: #059669;
}
.duty-role-tag.role-field-commander {
  background-color: #d97706;
}
.duty-role-tag.role-worker {
  background-color: #6d28d9;
}
.duty-role-tag.role-guide {
  background-color: #0d9488;
}
.duty-person {
  font-weight: 500;
  color: #1e293b;
  margin-left: -4px;
}
.duty-divider {
  width: 1px;
  height: 16px;
  background-color: #d1d5db;
  margin: 0 4px;
}
.duty-dropdown-wrapper {
  position: relative;
}
.duty-dropdown-trigger {
  background-color: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
  height: 40px;
}
.duty-dropdown-trigger:hover {
  background-color: #e2e8f0;
}
.duty-dropdown-trigger .toggle-arrow {
  transition: transform 0.2s ease-in-out;
  font-size: 0.8em;
}
.duty-dropdown-trigger .toggle-arrow.is-rotated {
  transform: rotate(180deg);
}
.duty-dropdown-menu {
  position: absolute;
  top: calc(100% + 5px);
  right: 0;
  background-color: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 600px;
  z-index: 100;
  padding: 12px;
}
.duty-shift-group {
  margin-bottom: 12px;
}
.duty-shift-group:last-child {
  margin-bottom: 0;
}
.duty-shift-header {
  font-size: 1.1em;
  font-weight: bold;
  color: #005a9c;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 2px solid #e2e8f0;
}
.duty-item {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px;
  align-items: center;
  padding: 4px 0;
  font-size: 0.95em;
}
.duty-name {
  font-size: 0.9em;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 12px;
  color: #fff;
  text-align: center;
  justify-self: end;
}
.duty-name.role-field-commander {
  background-color: #d97706;
}
.duty-name.role-safety {
  background-color: #2563eb;
}
.duty-name.role-guide {
  background-color: #0d9488;
}
.duty-name.role-fire {
  background-color: #be185d;
}
.duty-name.role-reporter,
.duty-name[class*='通報班'] {
  background-color: #059669;
}
.duty-name.role-default {
  background-color: #475569;
}
.duty-teams {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.duty-team-tag {
  background-color: #e0e7ff;
  color: #3730a3;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}
.slide-fade-enter-active {
  transition: all 0.2s ease-out;
}
.slide-fade-leave-active {
  transition: all 0.2s cubic-bezier(1, 0.5, 0.8, 1);
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}
:global(.notification-item) {
  background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.08),
    0 1px 2px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;
}
:global(.notification-item:hover) {
  transform: translateY(-1px);
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.1),
    0 2px 4px rgba(0, 0, 0, 0.06);
  border-color: #cbd5e1;
}
:global(.notification-item.type-schedule) {
  border-left: 4px solid #3b82f6;
  background: linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%);
}
:global(.notification-item.type-patient) {
  border-left: 4px solid #10b981;
  background: linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%);
}
:global(.notification-item.type-memo) {
  border-left: 4px solid #f59e0b;
  background: linear-gradient(135deg, #fed7aa 0%, #fef3c7 100%);
}
:global(.notification-item.type-stats) {
  border-left: 4px solid #6545af;
  background: linear-gradient(135deg, #e9d5ff 0%, #f3e8ff 100%);
}
:global(.notification-icon) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 8px;
  margin-right: 12px;
  font-size: 16px;
  flex-shrink: 0;
}
:global(.notification-icon.type-schedule) {
  background: #3b82f6;
  color: white;
}
:global(.notification-icon.type-patient) {
  background: #10b981;
  color: white;
}
:global(.notification-icon.type-memo) {
  background: #f59e0b;
  color: white;
}
:global(.notification-icon.type-stats) {
  background: #8b5cf6;
  color: white;
}
:global(.notification-content) {
  display: flex;
  align-items: center;
  flex: 1;
}
:global(.notification-text) {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  line-height: 1.4;
}
:global(.notification-time) {
  font-size: 12px;
  color: #64748b;
  margin-left: 8px;
  flex-shrink: 0;
}
:global(.notification-close) {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.1);
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #64748b;
  opacity: 0;
  transition: all 0.2s ease;
}
:global(.notification-item:hover .notification-close) {
  opacity: 1;
}
:global(.notification-close:hover) {
  background: rgba(148, 163, 184, 0.2);
  color: #475569;
}
@keyframes notification-appear {
  0% {
    opacity: 0;
    transform: translateX(100%);
  }
  100% {
    opacity: 1;
    transform: translateX(0);
  }
}
:global(.notification-item.is-new) {
  animation: notification-appear 0.3s ease-out;
}
:global(.notification-empty) {
  text-align: center;
  padding: 24px 16px;
  color: #64748b;
  font-size: 14px;
}
:global(.notification-empty-icon) {
  font-size: 32px;
  margin-bottom: 8px;
  opacity: 0.5;
}
@media (prefers-color-scheme: dark) {
  :global(.notification-item) {
    background: linear-gradient(135deg, #1e293b 0%, #334155 100%);
    border-color: #475569;
    color: #e2e8f0;
  }
  :global(.notification-item:hover) {
    border-color: #64748b;
  }
  :global(.notification-text) {
    color: #e2e8f0;
  }
  :global(.notification-time) {
    color: #94a3b8;
  }
  :global(.notification-close) {
    color: #94a3b8;
  }
  :global(.notification-close:hover) {
    color: #cbd5e1;
  }
}

/* 🔥 使用 :deep() 確保樣式生效 */
:deep(.patient-item.status-opd) {
  background-color: #e8f5e9; /* 門診 - 綠色 */
}
:deep(.patient-item.status-ipd) {
  background-color: #ffebee; /* 住院 - 紅色 */
}
:deep(.patient-item.status-er) {
  background-color: #f3e5f5; /* 急診 - 紫色 */
}
:deep(.patient-item.status-biweekly) {
  background-color: #ffcc80; /* 兩班 - 橘色 */
}
:deep(.patient-item.tag-chou) {
  background-color: #658ee0; /* 抽血 - 藍色 */
}
:deep(.patient-item.tag-new) {
  background-color: #f5ec8e; /* 新診 - 金黃 */
}
:deep(.patient-item.tag-huan) {
  background-color: #e0f7fa; /* 換 - 淺青 */
}
:deep(.patient-item.tag-liang) {
  background-color: #fff3e0; /* 兩 - 淺橙 */
}
:deep(.patient-item.tag-b) {
  background-color: #fff9c4; /* B - 淺黃 */
}
</style>
