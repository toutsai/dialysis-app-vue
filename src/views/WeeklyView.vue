<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

// 1. 引入所有需要的子元件和工具函式
import StatsToolbar from '@/components/StatsToolbar.vue'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import { createEmptySlotData } from '@/utils/scheduleUtils.js'

// --- 輔助函式 ---
function getStartOfWeek(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  return new Date(new Date(d.setDate(diff)).setHours(0, 0, 0, 0))
}

function formatDate(date, withYear = false) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = d.getMonth() + 1
  const day = d.getDate()
  if (withYear) {
    return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
  }
  return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

function formatDateForQuery(date) {
  const d = new Date(date)
  if (isNaN(d.getTime())) return ''
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules')

// --- 常量定義 ---
const SHIFTS = ['早班', '午班', '晚班']
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

// --- 核心狀態 ---
const allPatients = ref([])
const weekScheduleRecords = ref(new Map())
const currentWeekStartDate = ref(getStartOfWeek(new Date()))
const hasUnsavedChanges = ref(false)
const statusText = ref('資料已載入')

// --- UI 狀態 ---
const isDialogVisible = ref(false)
const currentSlotId = ref(null)
const isClearDialogVisible = ref(false)
const clearingSlotId = ref(null)
const CLEAR_OPTIONS = [{ value: 'single', text: '僅清除此班次' }]

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const weekDisplay = computed(() => {
  const start = new Date(currentWeekStartDate.value)
  const end = new Date(start)
  end.setDate(start.getDate() + 5)
  return `${formatDate(start, true)} ~ ${formatDate(end, true)}`
})
const weekDates = computed(() => {
  return Array.from({ length: 6 }).map((_, i) => {
    const d = new Date(currentWeekStartDate.value)
    d.setDate(d.getDate() + i)
    return { weekday: WEEKDAYS[i], date: `(${formatDate(d)})`, queryDate: formatDateForQuery(d) }
  })
})
const statsToolbarData = computed(() => {
  const baseData = WEEKDAYS.map(() => ({ counts: { 早班: 0, 午班: 0, 晚班: 0 } }))
  for (const [dateStr, record] of weekScheduleRecords.value.entries()) {
    if (record && record.schedule) {
      const d = new Date(dateStr + 'T00:00:00')
      const dayIndex = d.getDay() === 0 ? 6 : d.getDay() - 1
      if (dayIndex >= 0 && dayIndex < 6 && baseData[dayIndex]) {
        for (const slotData of Object.values(record.schedule)) {
          if (slotData && slotData.patientId && slotData.shiftId) {
            const shiftName = slotData.shiftId.split('-')[2]
            if (baseData[dayIndex].counts[shiftName] !== undefined) {
              baseData[dayIndex].counts[shiftName]++
            }
          }
        }
      }
    }
  }
  return baseData
})
const statsToolbarWeekdays = computed(() => WEEKDAYS.map((w) => w.slice(-1)))
const scheduledPatientIds = computed(() => {
  const ids = new Set()

  // 遍歷 Map 中的每一個 dailyRecord
  for (const dailyRecord of weekScheduleRecords.value.values()) {
    if (dailyRecord && dailyRecord.schedule) {
      // 遍歷當天的 schedule 中的每一個 slotData
      for (const slotData of Object.values(dailyRecord.schedule)) {
        if (slotData && slotData.patientId) {
          ids.add(slotData.patientId)
        }
      }
    }
  }

  return ids
})

// --- 方法 ---
function setChange() {
  hasUnsavedChanges.value = true
  statusText.value = '有未儲存的變更'
}

async function loadAllData() {
  hasUnsavedChanges.value = false
  statusText.value = '讀取中...'
  try {
    const datesForQuery = weekDates.value.map((d) => d.queryDate)
    if (datesForQuery.length === 0) return

    const [patients, weeklyRecords] = await Promise.all([
      patientsApi.fetchAll(),
      schedulesApi.fetchAll([where('date', 'in', datesForQuery)]),
    ])

    allPatients.value = patients

    const newWeekRecords = new Map()
    weeklyRecords.forEach((record) => {
      const loadedSchedule = record.schedule || {}
      const finalSchedule = {}
      for (const shiftId in loadedSchedule) {
        if (loadedSchedule[shiftId] && loadedSchedule[shiftId].patientId) {
          finalSchedule[shiftId] = {
            ...createEmptySlotData(shiftId),
            ...loadedSchedule[shiftId],
          }
        }
      }
      record.schedule = finalSchedule
      newWeekRecords.set(record.date, record)
    })
    weekScheduleRecords.value = newWeekRecords
    statusText.value = '資料已載入'
  } catch (error) {
    console.error('讀取週排班資料失敗:', error)
    statusText.value = '讀取失敗'
  }
}

function changeWeek(days) {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  const newDate = new Date(currentWeekStartDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentWeekStartDate.value = newDate
  loadAllData()
}

function goToToday() {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  currentWeekStartDate.value = getStartOfWeek(new Date())
  loadAllData()
}

function handleSlotUpdate(slotId, patientId, note = '') {
  const [bed, shiftIndex, dayIndex] = slotId.split('-')
  const d = new Date(currentWeekStartDate.value)
  d.setDate(d.getDate() + parseInt(dayIndex, 10))
  const dateStr = formatDateForQuery(d)

  const newWeekRecords = new Map(weekScheduleRecords.value)
  let dailyRecord = newWeekRecords.get(dateStr)

  if (!dailyRecord) {
    dailyRecord = { id: null, date: dateStr, schedule: {} }
    newWeekRecords.set(dateStr, dailyRecord)
  }

  const shiftName = SHIFTS[shiftIndex]
  const dailyShiftId = `bed-${bed}-${shiftName}`

  if (patientId) {
    const patient = patientMap.value.get(patientId)
    const newSlotData = createEmptySlotData(shiftId)
    newSlotData.patientId = patientId
    // **使用新函式生成備註**
    newSlotData.note = generateStandardNote(patient)
    currentRecord.schedule[shiftId] = newSlotData
  } else {
    delete dailyRecord.schedule[dailyShiftId]
  }

  weekScheduleRecords.value = new Map(newWeekRecords)
  setChange()
}

async function loadBaseSchedule() {
  if (!confirm('確定要載入常規班表嗎？這將會覆蓋當前週的所有排班。')) return
  statusText.value = '正在載入常規班表...'
  try {
    // 假設 ApiManager 有 fetchById 方法來精確獲取單一文件
    const masterRecord = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')

    if (!masterRecord || !masterRecord.schedule) {
      alert('找不到常規班表範本 (MASTER_SCHEDULE)，沒有資料可以載入。')
      statusText.value = '常規班表為空'
      return
    }

    const newWeekRecords = new Map(weekScheduleRecords.value)
    // 先清空當前週的所有排班
    for (const record of newWeekRecords.values()) {
      record.schedule = {}
    }

    const baseSchedule = masterRecord.schedule
    for (const weeklySlotId in baseSchedule) {
      const baseSlotData = baseSchedule[weeklySlotId]
      if (baseSlotData && baseSlotData.patientId) {
        handleSlotUpdate(weeklySlotId, baseSlotData.patientId, baseSlotData.note)
      }
    }

    setChange()
    statusText.value = '常規班表已載入，請記得儲存。'
  } catch (error) {
    console.error('載入常規班表失敗:', error)
    statusText.value = '載入失敗'
  }
}

function handleGridClick(slotId) {
  const slotData = getSlotData(slotId)
  if (slotData?.patientId) {
    clearingSlotId.value = slotId
    isClearDialogVisible.value = true
  } else {
    currentSlotId.value = slotId
    isDialogVisible.value = true
  }
}

function handleClearSelect(selectedOptionText) {
  if (clearingSlotId.value && selectedOptionText === '僅清除此班次') {
    handleSlotUpdate(clearingSlotId.value, null)
  }
  isClearDialogVisible.value = false
}

function handlePatientSelect({ patientId, fillType }) {
  if (!currentSlotId.value || !patientId) return
  const patient = patientMap.value.get(patientId)
  if (!patient) return
  const [bed, shiftIndex, dayIndex] = currentSlotId.value.split('-')
  const daysToFill =
    fillType === 'frequency' && patient.frequency && FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      ? FREQ_MAP_TO_DAY_INDEX[patient.frequency]
      : [parseInt(dayIndex, 10)]
  daysToFill.forEach((d_idx) => {
    const newSlotId = `${bed}-${shiftIndex}-${d_idx}`
    handleSlotUpdate(newSlotId, patientId)
  })
  isDialogVisible.value = false
}

async function saveChangesToCloud() {
  statusText.value = '儲存中...'
  try {
    const promises = []
    for (const record of weekScheduleRecords.value.values()) {
      const cleanSchedule = {}
      for (const shiftId in record.schedule) {
        const slotData = record.schedule[shiftId]
        if (slotData && slotData.patientId) {
          cleanSchedule[shiftId] = {
            patientId: slotData.patientId,
            note: slotData.note || '',
            shiftId: slotData.shiftId || shiftId,
            nurseTeam: slotData.nurseTeam || null,
            nurseTeamIn: slotData.nurseTeamIn || null,
            nurseTeamOut: slotData.nurseTeamOut || null,
          }
        }
      }
      const dataToSave = { date: record.date, schedule: cleanSchedule }
      if (record.id) {
        if (Object.keys(cleanSchedule).length > 0) {
          promises.push(schedulesApi.update(record.id, dataToSave))
        } else {
          promises.push(schedulesApi.delete(record.id))
        }
      } else if (Object.keys(cleanSchedule).length > 0) {
        promises.push(schedulesApi.save(dataToSave))
      }
    }
    await Promise.all(promises)
    hasUnsavedChanges.value = false
    statusText.value = '變更已儲存！'
    await loadAllData()
  } catch (error) {
    console.error('儲存失敗:', error)
    statusText.value = '儲存失敗'
  }
}

function getSlotData(slotId) {
  if (!slotId) return null
  const [_bed, _shiftIndex, dayIndex] = slotId.split('-').map(Number)
  const dateStr = weekDates.value[dayIndex]?.queryDate
  if (!dateStr) return null
  const dailyRecord = weekScheduleRecords.value.get(dateStr)
  const shiftName = SHIFTS[_shiftIndex]
  const dailyShiftId = `bed-${_bed}-${shiftName}`
  return dailyRecord?.schedule?.[dailyShiftId] || null
}

function getWeeklyCellStyle(slotId) {
  const slotData = getSlotData(slotId)
  if (!slotData || !slotData.patientId) return {}
  const patient = patientMap.value.get(slotData.patientId)
  if (!patient) return {}
  const classes = { filled: true }
  const note = slotData.note || ''
  for (const key in STYLE_PRIORITY) {
    if (note.includes(key)) {
      classes[STYLE_PRIORITY[key].class] = true
      return classes
    }
  }
  if (patient.status === 'ip') {
    classes[STYLE_PRIORITY['住'].class] = true
  }
  return classes
}

// --- Drag and Drop ---
function onDragStart(event, slotId) {
  const slotData = getSlotData(slotId)
  if (!slotData || !slotData.patientId) {
    event.preventDefault()
    return
  }
  const patientId = slotData.patientId
  event.dataTransfer.setData('patientId', patientId)
  event.dataTransfer.setData('sourceSlotId', slotId)
  event.dataTransfer.effectAllowed = 'move'
}

function onSidebarDragStart(event, patientId) {
  event.dataTransfer.setData('patientId', patientId)
  event.dataTransfer.effectAllowed = 'copy'
}

/**
 * 處理拖放事件的最終函式。
 * @param {DragEvent} event - 拖放事件物件。
 * @param {string} targetShiftId - 放置目標格子的唯一 ID。
 */
function onDrop(event, targetShiftId) {
  event.preventDefault()
  event.target.closest('.patient-name, .patient-tag, .schedule-slot')?.classList.remove('drag-over')

  // 1. 從拖曳資料中獲取病人 ID 和來源位置 ID
  const patientId = event.dataTransfer.getData('patientId')
  if (!patientId) return // 如果沒有 patientId，中止操作

  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')

  // 2. 獲取相關的資料物件
  const patient = patientMap.value.get(patientId)
  if (!patient) {
    console.error(`在 onDrop 中找不到 ID 為 ${patientId} 的病患資料！`)
    return
  }

  const sourceSlotData = sourceShiftId ? currentRecord.schedule[sourceShiftId] : null
  const targetSlotData = currentRecord.schedule[targetShiftId]

  // 3. 準備新的備註 (note)
  //    - 如果是從側邊欄新增，manualNote 為空，會從頭生成。
  //    - 如果是從床位移動，manualNote 是來源格子的 note，會被傳入 generateStandardNote 進行處理。
  const manualNote = sourceSlotData?.note || ''
  const noteToSet = generateStandardNote(patient, manualNote)

  // 4. 準備新的 slot 資料 (使用擴展語法優雅地合併)
  const newSlotData = {
    // a. 以一個標準的空白物件打底
    ...createEmptySlotData(targetShiftId),

    // b. 用目標格子已有的資料覆蓋 (保留可能已存在的護理師設定)
    ...(targetSlotData || {}),

    // c. 用來源格子的資料覆蓋 (繼承護理師組別等設定)
    ...(sourceSlotData || {}),

    // d. 最後，用本次操作的最終資料覆蓋，確保它們的優先級最高
    patientId: patientId,
    note: noteToSet,
    shiftId: targetShiftId, // 確保 shiftId 是目標格子的 ID
  }

  // 5. 更新目標格子
  currentRecord.schedule[targetShiftId] = newSlotData

  // 6. 處理來源格子 (如果是從床位移動過來的)
  if (sourceShiftId && sourceShiftId !== targetShiftId) {
    // 判斷是否為「換床」操作
    if (targetSlotData && targetSlotData.patientId) {
      // 目標格子原本有病人，執行交換邏輯
      const swappedPatient = patientMap.value.get(targetSlotData.patientId)
      const swappedNote = generateStandardNote(swappedPatient, targetSlotData.note || '')

      const swappedSlotData = { ...newSlotData } // 複製一份結構
      swappedSlotData.patientId = targetSlotData.patientId
      swappedSlotData.note = swappedNote
      swappedSlotData.shiftId = sourceShiftId

      currentRecord.schedule[sourceShiftId] = swappedSlotData
    } else {
      // 目標格子是空的，清空來源格子
      currentRecord.schedule[sourceShiftId] = createEmptySlotData(sourceShiftId)
    }
  }

  // 7. 觸發未儲存狀態
  setChange()
}

function onDragOver(event) {
  event.preventDefault()
  const targetSlot = event.target.closest('.schedule-slot')
  if (targetSlot) {
    targetSlot.classList.add('drag-over')
  }
}

function onDragLeave(event) {
  event.target.closest('.schedule-slot')?.classList.remove('drag-over')
}

// --- 其他方法 ---
function handleDialogCancel() {
  isDialogVisible.value = false
}

// --- 生命週期鉤子 ---
onMounted(loadAllData)
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">週排班總表</h1>
          <div class="date-navigator">
            <button @click="changeWeek(-7)">< 上一週</button>
            <span class="week-display-text">{{ weekDisplay }}</span>
            <button @click="changeWeek(7)">下一週 ></button>
          </div>
          <div class="main-actions">
            <button @click="goToToday">回到本週</button>
            <button @click="loadBaseSchedule">載入常規班表</button>
          </div>
        </div>
        <div class="main-actions">
          <span class="status-text">{{ statusText }}</span>
          <button class="btn-save" :disabled="!hasUnsavedChanges" @click="saveChangesToCloud">
            儲存變更
          </button>
        </div>
      </div>
      <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
    </header>

    <main class="page-main-content">
      <div class="schedule-area">
        <div class="table-wrapper">
          <table class="weekly-schedule-table">
            <thead>
              <tr>
                <th>床位</th>
                <th>班次</th>
                <th v-for="day in weekDates" :key="day.weekday">
                  <div class="weekday">{{ day.weekday }}</div>
                  <div class="date">{{ day.date }}</div>
                </th>
              </tr>
            </thead>
            <tbody>
              <template v-for="bedNumber in bedLayout" :key="bedNumber">
                <tr
                  v-for="(shift, shiftIndex) in SHIFTS"
                  :key="shift"
                  :class="{ 'hepatitis-bed': hepatitisBeds.includes(bedNumber) }"
                >
                  <td v-if="shiftIndex === 0" :rowspan="SHIFTS.length">{{ bedNumber }}號床</td>
                  <td>{{ shift }}</td>
                  <td v-for="(day, dayIndex) in weekDates" :key="day.weekday">
                    <div
                      class="schedule-slot"
                      :class="getWeeklyCellStyle(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @click="handleGridClick(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @drop="onDrop($event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      @dragover.prevent="onDragOver"
                      @dragleave.prevent="onDragLeave"
                      @dragstart="onDragStart($event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                      :draggable="
                        !!getSlotData(`${bedNumber}-${shiftIndex}-${dayIndex}`)?.patientId
                      "
                    >
                      <!-- 使用 v-for 技巧為 slotData 創建一個局部變數 -->
                      <template
                        v-for="slotData in [getSlotData(`${bedNumber}-${shiftIndex}-${dayIndex}`)]"
                        :key="slotData?.shiftId"
                      >
                        <!-- 只有當 slotData 和 patientId 都存在時才渲染內部 -->
                        <template v-if="slotData && slotData.patientId">
                          <!-- 同樣地，為 patient 物件創建一個局部變數 -->
                          <template
                            v-for="patient in [patientMap.get(slotData.patientId)]"
                            :key="patient?.id"
                          >
                            <template v-if="patient">
                              <!-- 現在，我們可以清晰地顯示所有資訊 -->
                              <div class="slot-patient-name">
                                <span>{{ patient.name }}</span>
                                <!-- 遍歷並顯示疾病標籤 -->
                                <span
                                  v-for="disease in patient.diseases"
                                  :key="disease"
                                  class="disease-tag"
                                >
                                  {{ disease }}
                                </span>
                              </div>
                              <div class="slot-patient-mrn">
                                ({{ patient.medicalRecordNumber || 'N/A' }})
                              </div>
                              <div class="slot-note" v-if="slotData.note">
                                {{ slotData.note }}
                              </div>
                            </template>
                          </template>
                        </template>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>

      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onSidebarDragStart"
      />
    </main>

    <PatientSelectDialog
      :is-visible="isDialogVisible"
      title="選擇排班病人"
      :patients="allPatients"
      @confirm="handlePatientSelect"
      @cancel="handleDialogCancel"
    />
    <SelectionDialog
      :is-visible="isClearDialogVisible"
      title="清除排班選項"
      :options="CLEAR_OPTIONS.map((opt) => opt.text)"
      @select="handleClearSelect"
      @cancel="isClearDialogVisible = false"
    />
  </div>
</template>

<style scoped>
.page-main-content {
  /* main.css 已經定義了 display: flex，這裡不需要重複 */
  gap: 20px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 20px;
}
.schedule-area {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.table-wrapper {
  flex-grow: 1;
  overflow: auto;
  min-height: 0;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}
.weekday {
  font-weight: bold;
}
.date {
  font-size: 0.8em;
  color: #6c757d;
}
tr.hepatitis-bed > td:first-child {
  background-color: var(--hepatitis-bg);
  font-weight: bold;
}
.schedule-slot {
  width: 100%;
  height: 100%;
  box-sizing: border;
  border-radius: 5px;
  padding: 5px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  min-height: 60px; /* 確保空格子也有最小高度 */
  font-size: 0.9em;
}

.schedule-slot:not(.filled):hover {
  background-color: #e9ecef;
}

.schedule-slot.filled {
  cursor: grab;
  font-size: 0.9em;
}
.schedule-slot.filled:active {
  cursor: grabbing;
}

.schedule-slot.drag-over {
  transform: scale(1.05);
  background-color: #d4edda !important; /* 使用 !important 提高優先級，覆蓋掉其他背景色 */
  border: 2px dashed #155724;
}

/* --- 格子內容樣式 --- */
.slot-patient-name {
  font-weight: bold;
}
.slot-patient-mrn {
  font-size: 0.8em;
  color: #6c757d;
}
.slot-note {
  font-size: 0.8em;
  color: #005a9c;
  font-style: italic;
  margin-top: 2px;
  max-width: 100%; /* 確保備註不會超出格子 */
  white-space: nowrap; /* 讓過長的備註... */
  overflow: hidden; /* ...被隱藏 */
  text-overflow: ellipsis; /* ...並顯示省略號 */
}

/* ============================================= */
/* ==      根據備註和身份變換底色的核心樣式     == */
/* ============================================= */
.schedule-slot.tag-ip {
  background-color: #ffebee;
} /* 住 - 淡紅色 */
.schedule-slot.tag-chou {
  background-color: #e3f2fd;
} /* 抽 - 淡藍色 */
.schedule-slot.tag-new {
  background-color: #fffde7;
} /* 新 - 淡黃色 */
.schedule-slot.tag-huan {
  background-color: #e0f7fa;
} /* 換 - 淡青色 */
.schedule-slot.tag-liang {
  background-color: #fff3e0;
} /* 兩 - 淡橘色 */
.schedule-slot.tag-b {
  background-color: #fff9c4;
} /* B肝 - 象牙黃 */
</style>
