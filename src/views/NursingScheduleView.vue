<!-- 檔案路徑: src/views/NursingScheduleView.vue (完整重構版) -->
<template>
  <div class="nursing-schedule-container">
    <h1 class="page-title">護理班表與職責</h1>

    <!-- 頁籤導覽列 -->
    <nav class="tabs-nav">
      <button :class="{ active: activeTab === 'master' }" @click="activeTab = 'master'">
        當月總班表
      </button>
      <button :class="{ active: activeTab === 'weekly' }" @click="activeTab = 'weekly'">
        當月週班表
      </button>
      <button
        :class="{ active: activeTab === 'responsibilities' }"
        @click="activeTab = 'responsibilities'"
      >
        護理當班分組工作職責
      </button>
    </nav>

    <!-- 頁籤內容區域 -->
    <main class="tab-content">
      <!-- 1. 當月總班表 -->
      <div v-if="activeTab === 'master'" class="tab-pane">
        <!-- 合併的控制區域 -->
        <section class="controls-section">
          <div class="controls-left">
            <label for="schedule-month">月份：</label>
            <input
              type="month"
              id="schedule-month"
              v-model="selectedMonth"
              @change="loadMonthlySchedule"
            />
            <button @click="loadMonthlySchedule" :disabled="isLoadingSchedule" class="btn-primary">
              {{ isLoadingSchedule ? '載入中...' : '重新載入' }}
            </button>
          </div>

          <div class="controls-right">
            <label class="file-upload-label">
              <input
                type="file"
                @change="handleFileUpload"
                accept=".xlsx, .xls"
                :disabled="isUploading"
                class="file-input-hidden"
              />
              <span class="btn-secondary">
                <i class="fas fa-file-excel"></i>
                {{ selectedFile ? selectedFile.name : '選擇檔案' }}
              </span>
            </label>
            <button
              @click="processAndUpload"
              :disabled="!selectedFile || isUploading"
              class="btn-primary"
            >
              {{ isUploading ? '上傳中...' : '上傳班表' }}
            </button>
          </div>
        </section>

        <!-- 上傳狀態訊息 -->
        <div
          v-if="uploadStatus"
          :class="['status-message', uploadStatus.includes('成功') ? 'success' : 'error']"
        >
          {{ uploadStatus }}
        </div>

        <!-- 班表顯示區域 -->
        <section class="schedule-display-section">
          <div v-if="isLoadingSchedule" class="loading-schedule">
            <div class="spinner"></div>
            <span>正在載入班表資料...</span>
          </div>

          <div v-else-if="!monthlySchedule || !monthlySchedule.scheduleByNurse" class="no-schedule">
            <i class="fas fa-calendar-times"></i>
            <p>本月尚無班表資料</p>
            <p class="hint">請點擊右上方「選擇檔案」上傳 Excel 班表</p>
          </div>

          <div v-else class="schedule-table-wrapper">
            <h3>{{ monthlySchedule.title || `${selectedMonth} 護理班表` }}</h3>

            <table class="schedule-table">
              <thead>
                <tr>
                  <th class="nurse-name-col">護理師</th>
                  <th
                    v-for="dayInfo in monthDays"
                    :key="dayInfo.day"
                    :class="['date-col', { weekend: dayInfo.isWeekend }]"
                  >
                    <div class="date-num">{{ dayInfo.day }}</div>
                    <div class="weekday">{{ dayInfo.weekday }}</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(nurseData, nurseId) in sortedSchedule" :key="nurseId">
                  <td class="nurse-name">
                    {{ nurseData.nurseName }}
                    <span v-if="showUsername && nurseData.nurseUsername" class="nurse-username">
                      ({{ nurseData.nurseUsername }})
                    </span>
                  </td>
                  <td
                    v-for="(dayInfo, index) in monthDays"
                    :key="`${nurseId}-${index}`"
                    :class="['shift-cell', { weekend: dayInfo.isWeekend }]"
                  >
                    <span
                      v-if="nurseData.shifts && nurseData.shifts[index]"
                      :class="getShiftClass(nurseData.shifts[index])"
                    >
                      {{ nurseData.shifts[index] }}
                    </span>
                    <span v-else class="empty-cell">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- 2. 當月週班表 -->
      <div v-if="activeTab === 'weekly'" class="tab-pane">
        <!-- 控制按鈕 -->
        <section class="controls-section">
          <div class="controls-left">
            <label for="schedule-month-weekly">月份：</label>
            <input
              type="month"
              id="schedule-month-weekly"
              v-model="selectedMonth"
              @change="loadMonthlySchedule"
            />
          </div>
          <div class="controls-right">
            <button v-if="!isGroupEditMode" @click="enterGroupEditMode" class="btn-primary">
              編輯組別
            </button>
            <template v-else>
              <button @click="saveGroupAssignments" :disabled="isUploading" class="btn-primary">
                {{ isUploading ? '儲存中...' : '儲存分組' }}
              </button>
              <button @click="cancelGroupEditMode" class="btn-secondary">取消編輯</button>
            </template>
          </div>
        </section>

        <!-- 上傳狀態訊息 -->
        <div
          v-if="uploadStatus"
          :class="['status-message', uploadStatus.includes('成功') ? 'success' : 'error']"
        >
          {{ uploadStatus }}
        </div>

        <!-- 週班表顯示區域 -->
        <div v-if="isLoadingSchedule" class="loading-schedule">
          <div class="spinner"></div>
          <span>正在載入班表資料...</span>
        </div>
        <div v-else-if="!monthlySchedule" class="no-schedule">
          <i class="fas fa-calendar-times"></i>
          <p>本月尚無班表資料，請至「當月總班表」頁籤上傳</p>
        </div>

        <!-- 統一的頁籤化佈局 (只要有資料就顯示) -->
        <div v-else>
          <!-- 週次頁籤導覽列 (常駐) -->
          <nav class="weekly-tabs-nav">
            <button :class="{ active: activeWeekTab === 0 }" @click="activeWeekTab = 0">
              分組統計
            </button>
            <button
              v-for="(week, index) in weeklyData"
              :key="`tab-${index}`"
              :class="{ active: activeWeekTab === index + 1 }"
              @click="activeWeekTab = index + 1"
            >
              第 {{ week.weekNumber }} 週
            </button>
          </nav>

          <!-- 分組儀表板 (頁籤 0 被選中時顯示) -->
          <section v-if="activeWeekTab === 0" class="dashboard-section">
            <h3 class="dashboard-title">護理師分組統計</h3>
            <div class="dashboard-table-wrapper">
              <table class="dashboard-table">
                <thead>
                  <tr>
                    <th v-for="header in groupCountsDashboard.header" :key="header">
                      {{ header }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="nurse in groupCountsDashboard.nurses" :key="nurse.id">
                    <td>{{ nurse.name }}</td>
                    <td v-for="group in groupCountsDashboard.header.slice(1)" :key="group">
                      {{ nurse.counts[group] || 0 }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- 週班表內容 (根據頁籤切換顯示) -->
          <div class="weekly-schedule-container">
            <template v-for="(week, weekIndex) in weeklyData" :key="weekIndex">
              <div v-if="activeWeekTab === weekIndex + 1" class="week-section">
                <h4 class="week-title">
                  第 {{ week.weekNumber }} 週 ({{ week.startDate }} - {{ week.endDate }})
                </h4>
                <div class="week-table-wrapper">
                  <table class="week-table">
                    <thead>
                      <tr>
                        <th class="nurse-name-col-weekly">護理師</th>
                        <th
                          v-for="day in week.days"
                          :key="day.date"
                          :class="{ weekend: day.isWeekend }"
                        >
                          {{ day.day }} ({{ day.weekday }})
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(nurseData, nurseId) in sortedSchedule" :key="nurseId">
                        <td class="nurse-name-weekly">{{ nurseData.nurseName }}</td>
                        <td
                          v-for="day in week.days"
                          :key="day.date"
                          :class="{ weekend: day.isWeekend }"
                        >
                          <div v-if="nurseData.shifts[day.dayIndex]" class="weekly-shift-cell">
                            <span :class="getShiftClass(nurseData.shifts[day.dayIndex])">
                              {{ nurseData.shifts[day.dayIndex] }}
                            </span>
                            <!-- 編輯模式 -->
                            <template v-if="isGroupEditMode && tempScheduleWithGroups">
                              <select
                                v-if="
                                  canAssignGroup(
                                    tempScheduleWithGroups.scheduleByNurse[nurseId].shifts[
                                      day.dayIndex
                                    ],
                                  )
                                "
                                v-model="
                                  tempScheduleWithGroups.scheduleByNurse[nurseId].groups[
                                    day.dayIndex
                                  ]
                                "
                                class="group-select"
                              >
                                <option value="">-</option>
                                <option
                                  v-for="group in getAvailableGroups(
                                    tempScheduleWithGroups.scheduleByNurse[nurseId].shifts[
                                      day.dayIndex
                                    ],
                                    day.date,
                                  )"
                                  :key="group"
                                  :value="group"
                                >
                                  {{ group }} 組
                                </option>
                              </select>
                              <span
                                v-else-if="
                                  tempScheduleWithGroups.scheduleByNurse[nurseId].groups[
                                    day.dayIndex
                                  ]
                                "
                                class="group-badge-fixed"
                              >
                                {{
                                  tempScheduleWithGroups.scheduleByNurse[nurseId].groups[
                                    day.dayIndex
                                  ]
                                }}
                                組
                              </span>
                            </template>
                            <!-- 檢視模式 -->
                            <template v-else>
                              <span
                                v-if="nurseData.groups && nurseData.groups[day.dayIndex]"
                                :class="[
                                  'group-badge',
                                  getGroupClass(nurseData.groups[day.dayIndex]),
                                ]"
                              >
                                {{ nurseData.groups[day.dayIndex] }} 組
                              </span>
                            </template>
                          </div>
                          <div v-else class="empty-cell">-</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 3. 護理當班分組工作職責 -->
      <div v-if="activeTab === 'responsibilities'" class="tab-pane">
        <header class="pane-header">
          <h2 class="table-title">洗腎中心當班分組工作職責</h2>
          <div class="header-actions">
            <span
              v-if="lastModifiedInfo.date"
              class="revision-date"
              :title="`最後修改者: ${lastModifiedInfo.user}`"
            >
              {{ lastModifiedInfo.date }} 修改
            </span>
            <button
              @click="saveData"
              :disabled="!hasChanges || !auth.isAdmin.value"
              class="save-button"
              title="儲存所有修改"
            >
              <i class="fas fa-save"></i> 儲存
            </button>
          </div>
        </header>

        <section class="info-section">
          <div @click="enterEditMode('announcement', 0, 'content')">
            <div
              v-if="!isEditing('announcement', 0, 'content')"
              class="editable-text announcement-text"
              v-html="formatText(announcementText)"
            ></div>
            <textarea
              v-else
              :ref="(el) => setInputRef(el)"
              v-model="announcementText"
              @blur="exitEditMode"
              class="edit-input announcement-input"
            ></textarea>
          </div>
        </section>

        <section class="duties-section">
          <table class="duties-table">
            <thead>
              <tr>
                <th class="shift-type-col">班別</th>
                <th class="shift-code-col">班次代碼</th>
                <th class="tasks-col">各組負責項目</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="shift-type-cell"><strong>白班</strong></td>
                <td @click="enterEditMode('dayShift', 0, 'codes')">
                  <div
                    v-if="!isEditing('dayShift', 0, 'codes')"
                    class="editable-text"
                    v-html="formatText(dayShiftData.codes)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="dayShiftData.codes"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
                <td @click="enterEditMode('dayShift', 0, 'tasks')">
                  <div
                    v-if="!isEditing('dayShift', 0, 'tasks')"
                    class="editable-text task-text"
                    v-html="formatText(dayShiftData.tasks)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="dayShiftData.tasks"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
              </tr>
              <tr v-for="(duty, index) in nightShiftDuties" :key="`night-${index}`">
                <td v-if="index === 0" :rowspan="nightShiftDuties.length" class="shift-type-cell">
                  <strong>夜班</strong>
                </td>
                <td @click="enterEditMode('nightShift', index, 'code')">
                  <span v-if="!isEditing('nightShift', index, 'code')" class="editable-text">{{
                    duty.code
                  }}</span>
                  <input
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="duty.code"
                    @blur="exitEditMode"
                    class="edit-input-inline"
                  />
                </td>
                <td @click="enterEditMode('nightShift', index, 'tasks')">
                  <div
                    v-if="!isEditing('nightShift', index, 'tasks')"
                    class="editable-text task-text"
                    v-html="formatText(duty.tasks)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="duty.tasks"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <div class="closing-section">
          <div class="closing-column">
            <h3 class="table-title">關門前結束檢查</h3>
            <div class="checklist">
              <div
                v-for="(item, index) in checklistItems"
                :key="index"
                @click="enterEditMode('checklist', index, 'item')"
                class="check-item"
              >
                <span class="checkbox"></span>
                <span v-if="!isEditing('checklist', index, 'item')" class="editable-text">{{
                  item
                }}</span>
                <input
                  v-else
                  :ref="(el) => setInputRef(el)"
                  v-model="checklistItems[index]"
                  @blur="exitEditMode"
                  class="edit-input-inline"
                />
              </div>
            </div>
          </div>
          <div class="closing-column">
            <h3 class="table-title">互助合作組</h3>
            <div class="teamwork-list">
              <div
                v-for="(item, index) in teamworkItems"
                :key="index"
                @click="enterEditMode('teamwork', index, 'item')"
              >
                <div
                  v-if="!isEditing('teamwork', index, 'item')"
                  class="editable-text"
                  v-html="formatText(item)"
                ></div>
                <textarea
                  v-else
                  :ref="(el) => setInputRef(el)"
                  v-model="teamworkItems[index]"
                  @blur="exitEditMode"
                  class="edit-input"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import * as XLSX from 'xlsx'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { fetchDuties, saveDuties } from '@/services/optimizedApiService.js'
import { httpsCallable } from 'firebase/functions'
import { functions } from '@/composables/useFirebase.js'
import { useGroupAssigner } from '@/composables/useGroupAssigner.js'

const { createGlobalNotification } = {
  createGlobalNotification: (msg, type) => {
    alert(`[${type.toUpperCase()}] ${msg}`)
  },
}

// --- 狀態管理 ---
const activeTab = ref('master')
const auth = useAuth()
const hasChanges = ref(false)
const editingCell = ref(null)
let inputRef = null

// "當月總班表" 頁籤的狀態
const selectedFile = ref(null)
const isUploading = ref(false)
const isLoadingSchedule = ref(true)
const uploadStatus = ref('')
const monthlySchedule = ref(null)
const selectedMonth = ref(new Date().toISOString().slice(0, 7))
const showUsername = ref(false)

// "當月週班表" 頁籤的狀態
const isGroupEditMode = ref(false)
const tempScheduleWithGroups = ref(null)
const activeWeekTab = ref(1) // 預設顯示第一週

// ✨ 核心修改：建立動態資料來源給 Composable
const scheduleSourceForStats = computed(() => {
  return isGroupEditMode.value ? tempScheduleWithGroups.value : monthlySchedule.value
})
const { groupCountsDashboard, generateGroupAssignments } = useGroupAssigner(scheduleSourceForStats)

// "工作職責" 頁籤的狀態
const announcementText = ref('')
const dayShiftData = ref({ codes: '', tasks: '' })
const nightShiftDuties = ref([])
const checklistItems = ref([])
const teamworkItems = ref([])
const lastModifiedInfo = ref({ date: '', user: '' })

// --- API 實例 ---
const usersApi = ApiManager('users')
const nursingSchedulesApi = ApiManager('nursing_schedules')

// --- 計算屬性 ---
const monthDays = computed(() => {
  const source = isGroupEditMode.value ? tempScheduleWithGroups.value : monthlySchedule.value
  if (!source?.yearMonth && !selectedMonth.value) return []
  const yearMonth = source?.yearMonth || selectedMonth.value
  const [year, month] = yearMonth.split('-').map(Number)
  const daysInMonth = source?.maxDaysInMonth || new Date(year, month, 0).getDate()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']
  const days = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    days.push({
      day: day,
      weekday: weekdays[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
  }
  return days
})

const sortedSchedule = computed(() => {
  const scheduleSource = isGroupEditMode.value
    ? tempScheduleWithGroups.value?.scheduleByNurse
    : monthlySchedule.value?.scheduleByNurse
  if (!scheduleSource) return {}
  const nurses = Object.entries(scheduleSource)
  const sourceForOrder = monthlySchedule.value || tempScheduleWithGroups.value
  if (sourceForOrder?.processingOrder) {
    const orderMap = new Map(sourceForOrder.processingOrder.map((id, index) => [id, index]))
    nurses.sort((a, b) => (orderMap.get(a[0]) ?? 999) - (orderMap.get(b[0]) ?? 999))
  } else if (sourceForOrder?.scheduleByNurse) {
    nurses.sort((a, b) => a[1].nurseName.localeCompare(b[1].nurseName, 'zh-TW'))
  }
  return Object.fromEntries(nurses)
})

const weeklyData = computed(() => {
  const source = isGroupEditMode.value ? tempScheduleWithGroups.value : monthlySchedule.value
  if (!source || !monthDays.value.length) return []
  const yearMonth = source.yearMonth
  const [year, month] = yearMonth.split('-').map(Number)
  const weeks = []
  let currentWeek = { weekNumber: 1, days: [], startDate: '', endDate: '' }
  monthDays.value.forEach((dayInfo, dayIndex) => {
    const dayOfWeek = new Date(year, month - 1, dayInfo.day).getDay()
    if (dayOfWeek === 1 && currentWeek.days.length > 0) {
      currentWeek.endDate = `${month}/${currentWeek.days[currentWeek.days.length - 1].day}`
      weeks.push(currentWeek)
      currentWeek = {
        weekNumber: weeks.length + 1,
        days: [],
        startDate: `${month}/${dayInfo.day}`,
        endDate: '',
      }
    }
    if (currentWeek.days.length === 0) {
      currentWeek.startDate = `${month}/${dayInfo.day}`
    }
    currentWeek.days.push({
      date: `${yearMonth}-${String(dayInfo.day).padStart(2, '0')}`,
      day: dayInfo.day,
      weekday: dayInfo.weekday,
      isWeekend: dayInfo.isWeekend,
      dayIndex: dayIndex,
    })
  })
  if (currentWeek.days.length > 0) {
    currentWeek.endDate = `${month}/${currentWeek.days[currentWeek.days.length - 1].day}`
    weeks.push(currentWeek)
  }
  return weeks
})

// --- 生命週期 ---
onMounted(() => {
  loadMonthlySchedule()
  loadData() // 職責頁籤資料
})

// --- 方法 ---

function enterGroupEditMode() {
  if (!monthlySchedule.value) {
    alert('請先載入月班表資料！')
    return
  }
  const hasGroups = Object.values(monthlySchedule.value.scheduleByNurse).some(
    (nurse) => nurse.groups && nurse.groups.some((g) => g),
  )
  if (!hasGroups) {
    tempScheduleWithGroups.value = generateGroupAssignments(monthlySchedule.value)
  } else {
    tempScheduleWithGroups.value = JSON.parse(JSON.stringify(monthlySchedule.value))
  }
  activeWeekTab.value = 0
  isGroupEditMode.value = true
}

function cancelGroupEditMode() {
  isGroupEditMode.value = false
  tempScheduleWithGroups.value = null
  uploadStatus.value = ''
  activeWeekTab.value = 1
}

async function saveGroupAssignments() {
  if (!tempScheduleWithGroups.value) return
  isUploading.value = true
  uploadStatus.value = '正在儲存分組結果...'
  try {
    const documentId = selectedMonth.value
    const scheduleDataToSave = tempScheduleWithGroups.value.scheduleByNurse
    await nursingSchedulesApi.update(documentId, { scheduleByNurse: scheduleDataToSave })
    uploadStatus.value = '分組成功儲存！'
    isGroupEditMode.value = false
    tempScheduleWithGroups.value = null
    await loadMonthlySchedule()
    activeWeekTab.value = 1
  } catch (error) {
    console.error('儲存護理分組失敗:', error)
    uploadStatus.value = `儲存失敗：${error.message}`
  } finally {
    isUploading.value = false
  }
}

const canAssignGroup = (shift) => {
  const s = (shift || '').trim()
  if (!s || s.includes('休') || s.includes('例') || s.includes('國定')) return false
  if (s.includes('74/L') || s.includes('816')) return false
  const isDayShift = ['74', '75'].some((ds) => s.includes(ds))
  const isNightShift = ['311', '3-11'].some((ns) => s.includes(ns))
  return isDayShift || isNightShift
}

const getAvailableGroups = (shift, date) => {
  const s = (shift || '').trim()
  const dayOfWeek = new Date(date).getDay()
  if (['74', '75'].some((ds) => s.includes(ds))) {
    return ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K']
  }
  if (['311', '3-11'].some((ns) => s.includes(ns))) {
    if ([1, 3, 5].includes(dayOfWeek)) {
      return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
    } else if ([2, 4, 6].includes(dayOfWeek)) {
      return ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
    }
  }
  return []
}

const getGroupClass = (group) => {
  if (!group) return ''
  const groupChar = group.charAt(0).toUpperCase()
  if (group === '外圍') return 'group-peripheral'
  return `group-${groupChar}`
}

const getShiftClass = (shift) => {
  if (!shift) return ''
  const shiftStr = String(shift).trim()
  const EARLY_SHIFTS = ['74', '75', '84', '74/L', '816', '815']
  const LATE_SHIFTS = ['3-11', '311']
  if (EARLY_SHIFTS.some((s) => shiftStr.includes(s))) return 'shift-badge shift-早班'
  if (LATE_SHIFTS.some((s) => shiftStr.includes(s))) return 'shift-badge shift-晚班'
  if (shiftStr === '休' || shiftStr.includes('休息')) return 'shift-badge shift-休息'
  if (shiftStr === '例' || shiftStr.includes('例假')) return 'shift-badge shift-例假'
  if (shiftStr.includes('國定')) return 'shift-badge shift-國定'
  return 'shift-badge shift-其他'
}

function handleFileUpload(event) {
  selectedFile.value = event.target.files[0]
  uploadStatus.value = ''
}

async function loadMonthlySchedule() {
  isLoadingSchedule.value = true
  uploadStatus.value = ''
  cancelGroupEditMode()
  try {
    const documentId = selectedMonth.value
    const schedule = await nursingSchedulesApi.fetchById(documentId)
    monthlySchedule.value = schedule || null
    activeWeekTab.value = 1
  } catch (error) {
    console.error('❌ 載入月班表失敗:', error)
    monthlySchedule.value = null
  } finally {
    isLoadingSchedule.value = false
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = (error) => reject(error)
  })
}

async function processAndUpload() {
  if (!selectedFile.value) {
    uploadStatus.value = '請先選擇一個 Excel 檔案'
    return
  }
  isUploading.value = true
  uploadStatus.value = '正在上傳檔案...'
  try {
    const fileContentBase64 = await fileToBase64(selectedFile.value)
    const payload = {
      fileName: selectedFile.value.name,
      fileContentBase64: fileContentBase64,
    }
    const saveScheduleFunction = httpsCallable(functions, 'saveNursingSchedule')
    const result = await saveScheduleFunction(payload)
    if (!result.data.success) throw new Error(result.data.message || '處理失敗')
    uploadStatus.value = `成功！${result.data.message}`
    selectedFile.value = null
    if (result.data.stats?.month) {
      selectedMonth.value = result.data.stats.month
    }
    await loadMonthlySchedule()
  } catch (error) {
    console.error('上傳失敗:', error)
    uploadStatus.value = `失敗：${error.message || '發生未知錯誤'}`
  } finally {
    isUploading.value = false
  }
}

const formatText = (text) => {
  if (!text) return ''
  let escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'ICU']
  const qwGroups = ['QW1', 'QW2', 'QW3', 'QW4', 'QW5', 'QW6', 'QW7']
  const allGroups = [...groups, ...qwGroups]
  allGroups.forEach((group) => {
    const patterns = [
      new RegExp(`\\b${group}\\s*組[:：]?`, 'g'),
      new RegExp(`^${group}\\s*[:：]`, 'gm'),
      new RegExp(`(?<=[，,、]\\s*)${group}\\s*組`, 'g'),
    ]
    patterns.forEach((pattern) => {
      escapedText = escapedText.replace(
        pattern,
        (match) => `<span class="group-tag group-${group}">${match}</span>`,
      )
    })
  })
  escapedText = escapedText.replace(/^(※[^\n]*)/gm, '<span class="group-tag is-note">$1</span>')
  escapedText = escapedText.replace(
    /^(組長[:：][^\n]*)/gm,
    '<span class="group-tag is-leader">$1</span>',
  )
  escapedText = escapedText.replace(
    /^(互助小組長[:：][^\n]*)/gm,
    '<span class="group-tag is-leader">$1</span>',
  )
  escapedText = escapedText.replace(/^(\d+\.\s)/gm, '<span class="group-tag is-numeric">$1</span>')
  return escapedText
}
const setInputRef = (el) => {
  if (el) inputRef = el
}
watch(
  [announcementText, dayShiftData, nightShiftDuties, checklistItems, teamworkItems],
  (newValue, oldValue) => {
    if (oldValue.some((v) => v !== undefined && v !== null)) {
      hasChanges.value = true
    }
  },
  { deep: true, immediate: false },
)
const enterEditMode = async (type, rowIndex, field) => {
  if (!auth.isAdmin.value) return
  editingCell.value = { type, rowIndex, field }
  await nextTick()
  if (inputRef) {
    inputRef.focus()
    inputRef.select()
  }
}
const exitEditMode = () => {
  editingCell.value = null
}
const isEditing = (type, rowIndex, field) => {
  return (
    editingCell.value?.type === type &&
    editingCell.value?.rowIndex === rowIndex &&
    editingCell.value?.field === field
  )
}
const loadData = async () => {
  announcementText.value =
    '一、班別規則：護病比為1:4為原則，採團隊分工方式執行，無法執行時主動告知與協助。\n二、休息時間：實際狀況依各組協調調整，給予30分鐘。務必配合以免影響他人，白班為11:00-11:30；11:30-12:00；13:20-13:50，晚班為18:00-18:30；18:30-19:00；19:00-19:30。\n三、各班組別工作內容'
  dayShiftData.value = {
    codes: '7-3*9\n8-4*1\n7-5*2',
    tasks:
      'A 組：預備機化消及測餘氯。\nB 組：點班(急救車、電擊器測試)。備 12-8，午班用物。\nQW3 血糖機測試並上傳測試數值。 (試劑沒有向檢驗科拿，試紙沒了請書記備)\nC 組：支援 ICU 組(含備機)，如 ICU 組被 P，接 ICU 組， ICU 機台化消及餘氯檢測，需 cover ICU 組吃飯時間 30 分鐘(要自行電話與 ICU 組約時間但要避開 OPD 上下針時間 11:30-13:00)。\nD 組：送消、點班(衛材、庫房溫溼度)、整理供應室衛材歸位， NO.1。\nE 組：點班(氧療、冰箱溫度、補充冰箱常備藥)。 NO.2。每月最後一周 W1 須執行氧氣桶鋼瓶 查核表(114.07.17)\nF 組：電訪關心病患， NO.3。\nG 組：協助準備醫師拔 D/L 備物及病人觀察。\nH 組： 住院組。\nI 組： 住院組。\nJ 組： W3 泡製 3 桶消毒液。 W6 幫忙協助收行動 RO 機(若 ICU 組無法收機時)\nK 組：擔任 Leader。\nICU 組：接 ICU 組， ICU 機台化消及餘氯檢測， W6 協助收行動 RO 機。\n※若放 P 一整天，則該組工作由 G 組負責。\n※若當日僅有十組組別，組長則併入 A 組， A 組負責工作由 G 組協助完成。\n※白班 12-8 組別由 Leader 安排。',
  }
  nightShiftDuties.value = [
    {
      code: '3-11*8or9',
      tasks:
        'A 組: 擔任 Leader，核對當日人數， 將當日護理日誌、排程，隔天分組匯出轉 PDF 黨並存檔 (114.09.01 更新) ， 下班前須到 PD 衛教室電腦開啟隔日診間叫號系統(114.09.22 更新)。\nB 組: 10PM 後核對隔日娃娃頭與電腦排程是否一致，並須製作隔日早班洗腎住院床 病人移動方式，排主護(排到中班收針列)及 Leader 牌。備隔日 B 組 AK。\nC 組: 接 ICU 組，協同 B 組核對隔日娃娃頭、 W4 補充 ICU 消毒液，備隔日 C+D 組 AK。若 G 組 放 P 時，備 K 組 AK。\nD 組: 點班(衛材)，備隔日 E+F 組 AK， NO.1。\nE 組: 點班(氧療、冰箱)、備隔日 I+J 組 AK， NO.2，若 H 組放 P，協助點班(急 救車)。\nF 組: 接 12-8，備隔日 G+H 組 AK。 (每月 1 號點消防箱物資，遇假日順延。 )， NO.3。\nG 組: 住院組、 備隔日 K 組 AK。\nH 組: 住院組、 點班(急救車) 。\nI 組: 備隔日 A 組 AK。關門前結束檢查(項目見背面)若 C 組去洗 ICU，則協同 B 組核對隔日 娃娃頭。\n※若當日僅有 8 組組別， I 組負責工作由 A 組協助完成。\nQW4 夜班倒酸。\n 若放 P3-8 班，放 P 人員須自行完成該組工作職責。\n 每個月雙週的 W5 需刷機器。\n 每週星期一夜班汙水管需倒漂白水(A 組倒 1-7 床； B 組倒 8-15； C 組倒 16-22 床； D 組 倒 23-29 床； E 組倒 35-41 床； F 組倒 42-48 床； G 組倒 49-55 床； H 組倒 31-33 床)(若 H 組放 P 則由 G 組協助倒漂白水)',
    },
  ]
  checklistItems.value = [
    '電視儀器電源，遙控器收回。',
    '周圍設備歸位，空桶補好，管路放好。',
    '1234 門及庫房門上鎖。',
    '護理車關機，物品確認補充否。',
    '儀器及病床周邊消毒無血漬。',
    '護理站餐桌維持整齊，無標示者丟棄。',
    '護理站關電腦及燈光。',
    '檢體送檢。',
  ]
  teamworkItems.value = [
    '組長: C. A. B. C. 一組。',
    '組長: F. D. E. F. 一組（夜班加 I 組）。',
    '組長: H. G. H. I. 一組。',
    '互助小組長: (現場至少要有三位巡視)',
    '1. 關懷分配同仁用餐。',
    '2. 用餐前確認工作並告知病人誰 COVER。',
    '3. COVER 者主動巡視病人或協助查房。',
  ]
  lastModifiedInfo.value = { date: '114.09.22', user: '系統預設' }
  await nextTick()
  hasChanges.value = false
}
const saveData = async () => {
  if (!hasChanges.value || !auth.isAdmin.value) return
  try {
    const now = new Date()
    const formattedDate = `${now.getFullYear() - 1911}.${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}.${String(now.getDate()).padStart(2, '0')}`
    const currentUserFullName = auth.currentUser.value?.name || '未知使用者'
    const rawPayload = {
      announcement: announcementText.value,
      dayShift: dayShiftData.value,
      nightShift: nightShiftDuties.value,
      checklist: checklistItems.value,
      teamwork: teamworkItems.value,
      lastModified: { date: formattedDate, user: currentUserFullName },
    }
    const payload = JSON.parse(JSON.stringify(rawPayload))
    lastModifiedInfo.value = payload.lastModified
    hasChanges.value = false
    exitEditMode()
    createGlobalNotification('工作職責已成功儲存！', 'success')
  } catch (error) {
    createGlobalNotification(error.message || '儲存失敗，請稍後再試', 'error')
  }
}
</script>

<style scoped>
/* ===== 基礎容器樣式 ===== */
.nursing-schedule-container {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.page-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 1.2rem;
}
/* ===== 頁籤導覽 ===== */
.tabs-nav {
  display: flex;
  border-bottom: 2px solid #dee2e6;
  margin-bottom: 1.5rem;
}
.tabs-nav button {
  padding: 0.8rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  background-color: transparent;
  cursor: pointer;
  color: #495057;
  position: relative;
  transition: color 0.2s;
}
.tabs-nav button::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: #1abc9c;
  transform: scaleX(0);
  transition: transform 0.3s ease;
}
.tabs-nav button.active {
  color: #1abc9c;
}
.tabs-nav button.active::after {
  transform: scaleX(1);
}
/* ===== 合併的控制區域 ===== */
.controls-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1rem;
  background-color: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 1rem;
  gap: 1rem;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.controls-section label {
  font-weight: 500;
  color: #495057;
  font-size: 0.9rem;
}
.controls-section input[type='month'] {
  padding: 0.4rem 0.8rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 0.9rem;
}
/* 按鈕樣式 */
.btn-primary,
.btn-secondary {
  padding: 0.4rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-primary {
  background-color: #007bff;
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}
.btn-primary:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.65;
}
.btn-secondary {
  background-color: #fff;
  color: #495057;
  border: 1px solid #dee2e6;
}
.btn-secondary:hover {
  background-color: #f8f9fa;
  border-color: #adb5bd;
}
/* 檔案上傳樣式 */
.file-upload-label {
  display: inline-block;
  cursor: pointer;
}
.file-input-hidden {
  display: none;
}
/* 狀態訊息 */
.status-message {
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  animation: slideDown 0.3s ease;
}
.status-message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}
.status-message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}
@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
/* ===== Loading 和 Spinner ===== */
.loading-schedule,
.no-schedule {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #6c757d;
}
.no-schedule i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}
.no-schedule .hint {
  font-size: 0.9rem;
  color: #868e96;
}
.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem auto;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
/* ===== 班表表格樣式 ===== */
.schedule-table-wrapper {
  overflow-x: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: white;
}
.schedule-table-wrapper h3 {
  text-align: center;
  padding: 1rem;
  margin: 0;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 1.2rem;
  font-weight: 600;
  color: #2c3e50;
}
.schedule-table {
  width: 100%;
  min-width: 1200px;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.schedule-table th,
.schedule-table td {
  border: 1px solid #dee2e6;
  padding: 0.4rem;
  text-align: center;
  vertical-align: middle;
}
.schedule-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
}
.nurse-name-col {
  width: 100px;
  position: sticky;
  left: 0;
  z-index: 11;
  background-color: #f8f9fa !important;
}
.nurse-name {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: #fff;
  font-weight: 500;
  width: 100px;
  min-width: 100px;
}
.nurse-username {
  font-size: 0.7rem;
  color: #6c757d;
  font-style: italic;
  margin-left: 0.25rem;
}
.schedule-table tbody tr:nth-child(even) td:first-child {
  background-color: #f8f9fa;
}
.date-col {
  width: 60px;
  min-width: 60px;
}
.date-col.weekend {
  background-color: #fff5f5;
}
.date-num {
  font-weight: 600;
}
.weekday {
  font-size: 0.75rem;
  color: #6c757d;
  margin-top: 2px;
}
.shift-cell {
  padding: 0.2rem;
}
.shift-cell.weekend {
  background-color: #fffafa;
}
/* 班別樣式 */
.shift-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
  min-width: 35px;
}
.shift-早班 {
  background-color: #fff3cd;
  color: #856404;
}
.shift-晚班 {
  background-color: #cce5ff;
  color: #004085;
}
.shift-休息 {
  background-color: #f8d7da;
  color: #721c24;
}
.shift-例假 {
  background-color: #e2e3e5;
  color: #383d41;
}
.shift-國定 {
  background-color: #d4edda;
  color: #155724;
}
.shift-其他 {
  background-color: #e7e7e7;
  color: #495057;
}
.empty-cell {
  color: #dee2e6;
}

/* 週次頁籤導覽列 */
.weekly-tabs-nav {
  display: flex;
  flex-wrap: wrap;
  border-bottom: 2px solid #007bff;
  margin-bottom: 1.5rem;
  margin-top: 1rem;
}
.weekly-tabs-nav button {
  padding: 0.6rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  border: none;
  background-color: transparent;
  cursor: pointer;
  color: #495057;
  border-radius: 6px 6px 0 0;
  margin-bottom: -2px;
  transition: all 0.2s ease-in-out;
}
.weekly-tabs-nav button:hover {
  background-color: #e9ecef;
}
.weekly-tabs-nav button.active {
  color: #0056b3;
  background-color: #fff;
  border: 2px solid #007bff;
  border-bottom: 2px solid #fff;
}
/* 週班表樣式 */
.weekly-schedule-container {
  margin-top: 1.5rem;
}
.week-section {
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  animation: fadeIn 0.5s;
}
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.week-title {
  background-color: #f8f9fa;
  padding: 0.8rem 1.2rem;
  margin: 0;
  font-size: 1.2rem;
  border-bottom: 1px solid #e0e0e0;
}
.week-table-wrapper {
  overflow-x: auto;
}
.week-table {
  width: 100%;
  border-collapse: collapse;
}
.week-table th,
.week-table td {
  border: 1px solid #e9ecef;
  padding: 0.6rem;
  text-align: center;
  min-width: 120px;
}
.week-table th {
  background-color: #f1f3f5;
  font-weight: 600;
}
.nurse-name-col-weekly,
.nurse-name-weekly {
  position: sticky;
  left: 0;
  background-color: #f8f9fa;
  font-weight: 500;
  z-index: 1;
  min-width: 100px;
  width: 100px;
}
.week-table .weekend {
  background-color: #fff5f5;
}
.weekly-shift-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}
.group-badge {
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 12px;
  color: white;
  font-size: 0.85em;
}
.group-A {
  background-color: #c0392b;
}
.group-B {
  background-color: #27ae60;
}
.group-C {
  background-color: #2980b9;
}
.group-D {
  background-color: #8e44ad;
}
.group-E {
  background-color: #f39c12;
}
.group-F {
  background-color: #d35400;
}
.group-G {
  background-color: #7f8c8d;
}
.group-H {
  background-color: #34495e;
}
.group-I {
  background-color: #16a085;
}
.group-J {
  background-color: #2c3e50;
}
.group-K {
  background-color: #95a5a6;
}
.group-peripheral {
  background-color: #007bff;
}
/* 分組儀表板樣式 */
.dashboard-section {
  margin-top: 1rem;
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  animation: fadeIn 0.5s;
}
.dashboard-title {
  margin-top: 0;
  margin-bottom: 1rem;
}
.dashboard-table-wrapper {
  overflow-x: auto;
}
.dashboard-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9em;
  min-width: 800px;
}
.dashboard-table th,
.dashboard-table td {
  border: 1px solid #ced4da;
  padding: 0.5rem;
  text-align: center;
}
.dashboard-table th {
  background-color: #e9ecef;
  position: sticky;
  top: 0;
}
.dashboard-table td:first-child,
.dashboard-table th:first-child {
  font-weight: bold;
  background-color: #f1f3f5;
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 80px;
}
.dashboard-table th:first-child {
  z-index: 2;
}
/* 編輯模式下拉選單樣式 */
.group-select {
  margin-top: 0.3rem;
  padding: 2px 4px;
  border-radius: 4px;
  border: 1px solid #adb5bd;
  font-size: 0.85em;
  background-color: #fff;
  cursor: pointer;
}
.group-badge-fixed {
  font-weight: bold;
  padding: 2px 8px;
  border-radius: 12px;
  color: #343a40;
  background-color: #e9ecef;
  border: 1px solid #ced4da;
  font-size: 0.85em;
  margin-top: 0.3rem;
}
/* 響應式處理 */
@media (max-width: 768px) {
  .controls-section {
    flex-direction: column;
    gap: 1rem;
  }
  .controls-left,
  .controls-right {
    width: 100%;
    justify-content: space-between;
  }
  .schedule-table {
    font-size: 0.75rem;
  }
  .date-col {
    width: 50px;
    min-width: 50px;
  }
  .shift-badge {
    font-size: 0.7rem;
    padding: 1px 4px;
  }
}
</style>
