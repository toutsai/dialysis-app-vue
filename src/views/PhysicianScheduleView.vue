<template>
  <div class="page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入醫師與排班資料...</p>
    </div>

    <header class="page-header">
      <div class="header-left">
        <h1 class="page-main-title">醫師排班</h1>
        <div class="month-navigator">
          <button @click="goToPreviousMonth" title="上一個月">❮</button>
          <span class="month-display">{{ selectedYear }} 年 {{ selectedMonth }} 月</span>
          <button @click="goToNextMonth" title="下一個月">❯</button>
        </div>
      </div>
      <div class="header-right">
        <!-- ✨ 核心修改 1：新增狀態列 -->
        <span class="status-indicator" :class="{ 'has-changes': hasUnsavedChanges }">{{
          statusText
        }}</span>
        <button @click="saveAllChanges" class="save-btn" :disabled="!hasUnsavedChanges">
          <i class="fas fa-save"></i> 儲存所有變更
        </button>
      </div>
    </header>

    <div class="tabs-container">
      <a class="tab-link active">洗腎室/ICU 查房</a>
    </div>

    <main class="schedule-content new-layout">
      <!-- 左欄：班表 -->
      <div class="schedule-grid-container">
        <table v-if="!isLoading" class="schedule-table weekly-grid">
          <thead>
            <tr>
              <th class="shift-header-cell"></th>
              <th>星期一</th>
              <th>星期二</th>
              <th>星期三</th>
              <th>星期四</th>
              <th>星期五</th>
              <th class="weekend">星期六</th>
              <th class="weekend">星期日</th>
            </tr>
          </thead>
          <tbody v-for="(week, weekIndex) in weeklyData" :key="weekIndex">
            <tr class="date-row">
              <td class="shift-header-cell">日期</td>
              <td
                v-for="(day, dayIndex) in week"
                :key="day.fullDate || `empty-${weekIndex}-${dayIndex}`"
                :class="getDayClass(day)"
                class="cell-day"
              >
                <span v-if="day.day">{{ selectedMonth }}/{{ day.day }}</span>
              </td>
            </tr>
            <tr class="shift-row">
              <td class="shift-header-cell">早班</td>
              <td
                v-for="(day, dayIndex) in week"
                :key="day.fullDate || `empty-${weekIndex}-${dayIndex}`"
                :class="[getPhysicianClass(day, 'early'), getShiftCellClass(day)]"
              >
                <select
                  v-if="day.day && scheduleData[day.day]"
                  v-model="scheduleData[day.day].early.physicianId"
                  @change="checkClinicConflict($event, day, 'early')"
                  class="physician-select"
                >
                  <option :value="null">--</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ getDisplayName(doc) }}
                  </option>
                </select>
              </td>
            </tr>
            <tr class="shift-row">
              <td class="shift-header-cell">午班</td>
              <td
                v-for="(day, dayIndex) in week"
                :key="day.fullDate || `empty-${weekIndex}-${dayIndex}`"
                :class="[getPhysicianClass(day, 'noon'), getShiftCellClass(day)]"
              >
                <select
                  v-if="day.day && scheduleData[day.day]"
                  v-model="scheduleData[day.day].noon.physicianId"
                  @change="checkClinicConflict($event, day, 'noon')"
                  class="physician-select"
                >
                  <option :value="null">--</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ getDisplayName(doc) }}
                  </option>
                </select>
              </td>
            </tr>
            <tr class="shift-row">
              <td class="shift-header-cell">夜班</td>
              <td
                v-for="(day, dayIndex) in week"
                :key="day.fullDate || `empty-${weekIndex}-${dayIndex}`"
                :class="[getPhysicianClass(day, 'late'), getShiftCellClass(day)]"
              >
                <select
                  v-if="day.day && scheduleData[day.day]"
                  v-model="scheduleData[day.day].late.physicianId"
                  @change="checkClinicConflict($event, day, 'late')"
                  class="physician-select"
                >
                  <option :value="null">--</option>
                  <option v-for="doc in availablePhysicians" :key="doc.id" :value="doc.id">
                    {{ getDisplayName(doc) }}
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 右欄：所有輔助面板 -->
      <div class="panels-container">
        <div class="physician-legend-panel">
          <h2>醫師圖例與門診設定</h2>
          <div class="legend-table-wrapper">
            <table class="legend-table styled-legend">
              <thead>
                <tr>
                  <th>醫師</th>
                  <th>員編</th>
                  <th>電話</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="doc in availablePhysicians" :key="doc.id">
                  <tr class="physician-info-row" :class="getPhysicianClassById(doc.id)">
                    <td class="physician-name-cell">
                      <span class="legend-char">{{ getDisplayName(doc) }}</span>
                      {{ doc.name }}
                    </td>
                    <td>{{ doc.staffId || 'N/A' }}</td>
                    <td>{{ doc.phone || 'N/A' }}</td>
                  </tr>
                  <tr class="clinic-schedule-row" :class="getPhysicianClassById(doc.id)">
                    <td colspan="3">
                      <div class="clinic-select-container">
                        <select
                          v-if="physicianClinicSelections[doc.id]"
                          v-model="physicianClinicSelections[doc.id][0]"
                          class="clinic-select"
                        >
                          <option value="">門診一</option>
                          <option
                            v-for="option in clinicOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.text }}
                          </option>
                        </select>
                        <select
                          v-if="physicianClinicSelections[doc.id]"
                          v-model="physicianClinicSelections[doc.id][1]"
                          class="clinic-select"
                        >
                          <option value="">門診二</option>
                          <option
                            v-for="option in clinicOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.text }}
                          </option>
                        </select>
                        <select
                          v-if="physicianClinicSelections[doc.id]"
                          v-model="physicianClinicSelections[doc.id][2]"
                          class="clinic-select"
                        >
                          <option value="">門診三</option>
                          <option
                            v-for="option in clinicOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.text }}
                          </option>
                        </select>
                        <select
                          v-if="physicianClinicSelections[doc.id]"
                          v-model="physicianClinicSelections[doc.id][3]"
                          class="clinic-select"
                        >
                          <option value="">門診四</option>
                          <option
                            v-for="option in clinicOptions"
                            :key="option.value"
                            :value="option.value"
                          >
                            {{ option.text }}
                          </option>
                        </select>
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div class="pd-clinic-panel">
          <h2>腹膜透析(PD)門診</h2>
          <div class="pd-clinic-grid">
            <div v-for="doc in availablePhysicians" :key="`pd-${doc.id}`" class="pd-clinic-row">
              <span class="pd-doctor-name">{{ doc.name }}</span>
              <div class="pd-input-group">
                <input
                  type="date"
                  v-if="monthlyPdClinicSelections[doc.id]"
                  v-model="monthlyPdClinicSelections[doc.id][0].date"
                />
                <select
                  v-if="monthlyPdClinicSelections[doc.id]"
                  v-model="monthlyPdClinicSelections[doc.id][0].shift"
                >
                  <option value="">班別</option>
                  <option value="AM">上午</option>
                  <option value="PM">下午</option>
                  <option value="NT">晚上</option>
                </select>
              </div>
              <div class="pd-input-group">
                <input
                  type="date"
                  v-if="monthlyPdClinicSelections[doc.id]"
                  v-model="monthlyPdClinicSelections[doc.id][1].date"
                />
                <select
                  v-if="monthlyPdClinicSelections[doc.id]"
                  v-model="monthlyPdClinicSelections[doc.id][1].shift"
                >
                  <option value="">班別</option>
                  <option value="AM">上午</option>
                  <option value="PM">下午</option>
                  <option value="NT">晚上</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div class="statistics-panel">
          <div class="stats-header">
            <h2>排班統計</h2>
            <div class="stats-mode-toggle">
              <button
                :class="{ active: statsViewMode === 'monthly' }"
                @click="statsViewMode = 'monthly'"
              >
                本月
              </button>
              <button :class="{ active: statsViewMode === 'ytd' }" @click="statsViewMode = 'ytd'">
                今年累計
              </button>
            </div>
          </div>
          <table class="stats-table">
            <thead v-if="statsViewMode === 'monthly'">
              <tr>
                <th>醫師姓名</th>
                <th>本月平日班</th>
                <th>本月週末班</th>
              </tr>
            </thead>
            <tbody v-if="statsViewMode === 'monthly'">
              <tr v-for="stat in scheduleStats" :key="stat.name">
                <td>{{ stat.name }}</td>
                <td>{{ stat.monthlyWeekday }}</td>
                <td :class="{ 'has-multiple-weekends': stat.monthlyWeekend > 1 }">
                  {{ stat.monthlyWeekend }}
                </td>
              </tr>
            </tbody>
            <thead v-if="statsViewMode === 'ytd'">
              <tr>
                <th>醫師姓名</th>
                <th>累計總班數</th>
                <th>累計假日班</th>
                <th>多次週末月數</th>
              </tr>
            </thead>
            <tbody v-if="statsViewMode === 'ytd'">
              <tr v-for="stat in scheduleStats" :key="stat.name">
                <td>{{ stat.name }}</td>
                <td>{{ stat.ytdTotal }}</td>
                <td>{{ stat.ytdHolidays }}</td>
                <td :class="{ 'has-multiple-weekends': stat.ytdDoubleWeekends > 0 }">
                  {{ stat.ytdDoubleWeekends }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="special-dates-panel">
          <h2>註記日期</h2>
          <div class="date-input-group">
            <label>月抽血日：</label>
            <input type="date" v-model="bloodDrawDate1" />
            <input type="date" v-model="bloodDrawDate2" />
          </div>
          <div class="date-input-group">
            <label>解釋報告日：</label>
            <input type="date" v-model="reportDate1" />
            <input type="date" v-model="reportDate2" />
          </div>
        </div>

        <div class="notes-panel">
          <h2>排班規則與備註</h2>
          <textarea
            v-model="scheduleNotes"
            class="notes-textarea"
            rows="5"
            placeholder="請在此輸入排班規則、醫師預約不值班等備註事項..."
          ></textarea>
        </div>
      </div>
    </main>

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
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { httpsCallable } from 'firebase/functions'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { functions } from '@/composables/useFirebase.js'

const physiciansApi = ApiManager('physicians')
const physicianSchedulesApi = ApiManager('physician_schedules')

const isLoading = ref(true)
const selectedDate = ref(new Date())
const availablePhysicians = ref([])
const scheduleData = ref({})
const scheduleNotes = ref('')
const hasUnsavedChanges = ref(false)
const bloodDrawDate1 = ref('')
const bloodDrawDate2 = ref('')
const reportDate1 = ref('')
const reportDate2 = ref('')
const physicianClinicSelections = ref({})
const monthlyPdClinicSelections = ref({})
const holidays = ref(new Set())
const workdays = ref(new Set())
const fullYearHolidays = ref(new Set())
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
// ✨ 核心修改 3：新增 ConfirmDialog 相關的 ref
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const cancelAction = ref(null)

// ✨ 核心修改 4：新增 statusText 的 computed 屬性
const statusText = computed(() => {
  return hasUnsavedChanges.value ? '有未儲存的變更' : '所有變更已儲存'
})
const statsViewMode = ref('monthly')
const yearScheduleData = ref({})

const selectedYear = computed(() => selectedDate.value.getFullYear())
const selectedMonth = computed(() => selectedDate.value.getMonth() + 1)
const selectedYearMonth = computed(
  () => `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}`,
)
const clinicOptions = computed(() => {
  const weekdays = ['一', '二', '三', '四', '五', '六']
  const shifts = { AM: '上', PM: '下', NT: '晚' }
  const options = []
  for (let i = 1; i <= 6; i++) {
    if (i === 6) {
      options.push({ value: `${i}-AM`, text: `週${weekdays[i - 1]}上` })
    } else {
      for (const shiftCode in shifts) {
        options.push({
          value: `${i}-${shiftCode}`,
          text: `週${weekdays[i - 1]}${shifts[shiftCode]}`,
        })
      }
    }
  }
  return options
})
const specialDatesSet = computed(() => {
  const dates = new Set()
  if (bloodDrawDate1.value) dates.add(bloodDrawDate1.value)
  if (bloodDrawDate2.value) dates.add(bloodDrawDate2.value)
  if (reportDate1.value) dates.add(reportDate1.value)
  if (reportDate2.value) dates.add(reportDate2.value)
  return dates
})
const daysInMonth = computed(() => {
  const year = selectedYear.value
  const month = selectedMonth.value - 1
  const date = new Date(year, month, 1)
  const days = []
  while (date.getMonth() === month) {
    const dayOfWeek = date.getDay()
    days.push({
      day: date.getDate(),
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
    date.setDate(date.getDate() + 1)
  }
  return days
})
const weeklyData = computed(() => {
  if (daysInMonth.value.length === 0) return []
  const weeks = []
  const firstDayOfMonth = new Date(selectedYear.value, selectedMonth.value - 1, 1).getDay()
  const startDayOfWeek = (firstDayOfMonth + 6) % 7
  let currentWeek = Array.from({ length: startDayOfWeek }, (_, i) => ({
    day: null,
    placeholderIndex: i,
  }))
  daysInMonth.value.forEach((dayInfo, index) => {
    currentWeek.push({
      ...dayInfo,
      fullDate: `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(dayInfo.day).padStart(2, '0')}`,
    })
    if (currentWeek.length === 7 || index === daysInMonth.value.length - 1) {
      while (currentWeek.length < 7) {
        currentWeek.push({ day: null, placeholderIndex: currentWeek.length })
      }
      weeks.push(currentWeek)
      currentWeek = []
    }
  })
  return weeks
})

// ✨ 核心修改 2：根據您的最終定義，重寫整個 scheduleStats
const scheduleStats = computed(() => {
  return availablePhysicians.value.map((doc) => {
    const stats = {
      name: doc.name,
      monthlyWeekday: 0,
      monthlyWeekend: 0,
      ytdTotal: 0,
      ytdHolidays: 0, // 累計平日假日班
      ytdWeekends: 0, // 累計週末班
      ytdDoubleWeekends: 0,
    }

    // --- 1. 計算本月統計 (使用前端的 scheduleData) ---
    const currentMonthData = scheduleData.value
    if (Object.keys(currentMonthData).length > 0) {
      daysInMonth.value.forEach((dayInfo) => {
        const day = dayInfo.day
        ;['early', 'noon', 'late'].forEach((shift) => {
          if (currentMonthData[day]?.[shift]?.physicianId === doc.id) {
            if (dayInfo.isWeekend) {
              stats.monthlyWeekend++ // 週六日 => 週末班
            } else {
              stats.monthlyWeekday++ // 週一至五 (含國定假日) => 平日班
            }
          }
        })
      })
    }

    // --- 2. 計算年度累計統計 (使用雲端的 yearScheduleData) ---
    const weekendCountsByMonth = {}
    for (const monthKey in yearScheduleData.value) {
      const monthScheduleData = yearScheduleData.value[monthKey]
      if (!monthScheduleData || !monthScheduleData.schedule) continue

      const monthSchedule = monthScheduleData.schedule
      weekendCountsByMonth[monthKey] = 0

      const year = monthScheduleData.year
      const monthNum = monthScheduleData.month
      const daysInThisMonth = new Date(year, monthNum, 0).getDate()

      for (let day = 1; day <= daysInThisMonth; day++) {
        const date = new Date(year, monthNum - 1, day)
        const dayOfWeek = date.getDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isHoliday = fullYearHolidays.value.has(dateStr)

        ;['early', 'noon', 'late'].forEach((shift) => {
          if (monthSchedule[day]?.[shift]?.physicianId === doc.id) {
            // 累計總班數
            stats.ytdTotal++

            // 累計平日假日班 (非週末的國定假日)
            if (isHoliday && !isWeekend) {
              stats.ytdHolidays++
            }

            // 累計週末班 (純粹的週六日)
            if (isWeekend) {
              stats.ytdWeekends++
              weekendCountsByMonth[monthKey]++
            }
          }
        })
      }
    }
    // 多次週末月數
    stats.ytdDoubleWeekends = Object.values(weekendCountsByMonth).filter(
      (count) => count > 1,
    ).length

    return stats
  })
})

function checkClinicConflict(event, day, shift) {
  const newPhysicianId = event.target.value
  if (!newPhysicianId) return

  const physician = availablePhysicians.value.find((p) => p.id === newPhysicianId)
  if (!physician) return

  const date = new Date(selectedYear.value, selectedMonth.value - 1, day.day)
  const dayOfWeek = date.getDay()
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  const shiftMap = { early: 'AM', noon: 'PM', late: 'NT' }
  const currentShiftCode = shiftMap[shift]

  let conflictType = null

  // 檢查常規門診
  const regularClinicHours = physicianClinicSelections.value[newPhysicianId] || []
  const regularConflictCode = `${dayOfWeek === 0 ? 7 : dayOfWeek}-${currentShiftCode}`
  if (regularClinicHours.includes(regularConflictCode)) {
    conflictType = '常規門診'
  }

  // 檢查 PD 門診
  const pdClinicHours = monthlyPdClinicSelections.value[newPhysicianId] || []
  const pdConflict = pdClinicHours.some(
    (pd) => pd.date === dateStr && pd.shift === currentShiftCode,
  )
  if (pdConflict) {
    conflictType = 'PD 門診'
  }

  if (conflictType) {
    const weekdayMap = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']
    const shiftNameMap = { early: '早班', noon: '午班', late: '夜班' }
    const originalPhysicianId = scheduleData.value[day.day][shift].physicianId

    // 設定對話框
    confirmDialogTitle.value = '門診時間衝突'
    confirmDialogMessage.value = `提醒：${physician.name} 醫師在該時段有${conflictType}，您確定要排此班嗎？`

    // 設定確認後執行的動作 (什麼都不做，讓 v-model 完成更新)
    confirmAction.value = () => {
      // 由於 v-model 已經更新了 scheduleData，所以這裡不需要做任何事
      isConfirmDialogVisible.value = false
    }

    // 設定取消後執行的動作 (將值改回去)
    cancelAction.value = () => {
      scheduleData.value[day.day][shift].physicianId = originalPhysicianId
      event.target.value = originalPhysicianId // 手動將 select 的值改回去
      isConfirmDialogVisible.value = false
    }

    isConfirmDialogVisible.value = true
  }
}

// ✨ 核心修改 6：新增處理 ConfirmDialog 的函式
function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  resetConfirmDialog()
}

function handleCancel() {
  if (typeof cancelAction.value === 'function') {
    cancelAction.value()
  }
  resetConfirmDialog()
}

function resetConfirmDialog() {
  isConfirmDialogVisible.value = false
  confirmDialogTitle.value = ''
  confirmDialogMessage.value = ''
  confirmAction.value = null
  cancelAction.value = null
}
function getDisplayName(physician) {
  if (physician.name === '蔡亨政') return '政'
  return physician.name.charAt(0)
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
const physicianColorClasses = [
  'physician-color-1',
  'physician-color-2',
  'physician-color-3',
  'physician-color-4',
  'physician-color-5',
]
const physicianClassMap = computed(() => {
  const map = new Map()
  availablePhysicians.value.forEach((doc, index) => {
    map.set(doc.id, physicianColorClasses[index % physicianColorClasses.length])
  })
  return map
})
function getPhysicianClassById(physicianId) {
  return physicianClassMap.value.get(physicianId) || ''
}
function getPhysicianClass(day, shift) {
  if (!day || !day.day) return ''
  const physicianId = scheduleData.value[day.day]?.[shift]?.physicianId
  return physicianId ? physicianClassMap.value.get(physicianId) : ''
}
function getDayClass(day) {
  if (!day || !day.day) return 'is-empty'
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  if (specialDatesSet.value.has(dateStr)) return 'is-special-date'
  if (holidays.value.has(dateStr)) return 'is-holiday'
  if (workdays.value.has(dateStr)) return 'is-workday'
  if (day.isWeekend) return 'is-weekend'
  return 'is-weekday'
}
function getShiftCellClass(day) {
  if (!day || !day.day) return 'is-empty'
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  if (holidays.value.has(dateStr)) return 'is-holiday-text-only'
  if (day.isWeekend) return 'is-weekend-text-only'
  return ''
}
async function fetchHolidayData(year, isFullYear = false) {
  try {
    const getHolidays = httpsCallable(functions, 'getTaiwanHolidays')
    const response = await getHolidays({ year: Number(year) })
    const data = response.data
    const holidaySet = new Set()
    const workdaySet = new Set()
    if (data.success && data.result && Array.isArray(data.result.data)) {
      data.result.data.forEach((record) => {
        const date = record.date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')
        if (record.isHoliday === '是') holidaySet.add(date)
        if (record.isHoliday === '否' && record.description.includes('補行上班'))
          workdaySet.add(date)
      })
    }
    if (isFullYear) {
      fullYearHolidays.value = holidaySet
    } else {
      holidays.value = holidaySet
      workdays.value = workdaySet
    }
  } catch (error) {
    console.error('獲取台灣行事曆資料失敗:', error)
    showAlert('警告', '無法自動載入國定假日，月曆顏色可能不完全準確。')
  }
}
function generateBlankSchedule(year, month, physicians) {
  const blankSchedule = {}
  const daysCount = new Date(year, month, 0).getDate()
  const findPhysicianId = (name) => physicians.find((p) => p.name === name)?.id || null
  const liaoId = findPhysicianId('廖丁瑩')
  const tsaiYiId = findPhysicianId('蔡宜潔')
  const suId = findPhysicianId('蘇哲弘')
  const tsaiHengId = findPhysicianId('蔡亨政')
  for (let i = 1; i <= daysCount; i++) {
    const date = new Date(year, month - 1, i)
    const dayOfWeek = date.getDay()
    const shifts = {
      early: { physicianId: null, name: null },
      noon: { physicianId: null, name: null },
      late: { physicianId: null, name: null },
    }
    switch (dayOfWeek) {
      case 1:
        shifts.early.physicianId = liaoId
        shifts.late.physicianId = liaoId
        break
      case 2:
        shifts.late.physicianId = tsaiHengId
        break
      case 3:
        shifts.early.physicianId = tsaiYiId
        shifts.late.physicianId = tsaiYiId
        break
      case 5:
        shifts.early.physicianId = suId
        shifts.late.physicianId = suId
        break
    }
    blankSchedule[i] = shifts
  }
  return blankSchedule
}
async function fetchPhysicians() {
  try {
    const physicians = await physiciansApi.fetchAll()
    const desiredOrder = ['廖丁瑩', '蔡宜潔', '蘇哲弘', '蔡亨政', '林天佑']
    physicians.sort((a, b) => {
      const indexA = desiredOrder.indexOf(a.name)
      const indexB = desiredOrder.indexOf(b.name)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.name.localeCompare(b.name, 'zh-Hant')
    })
    const clinicSelections = {}
    physicians.forEach((doc) => {
      const hours = Array.isArray(doc.clinicHours) ? doc.clinicHours : []
      clinicSelections[doc.id] = [hours[0] || '', hours[1] || '', hours[2] || '', hours[3] || '']
    })
    physicianClinicSelections.value = clinicSelections
    availablePhysicians.value = physicians
  } catch (error) {
    console.error('讀取醫師列表失敗:', error)
    showAlert('錯誤', '無法讀取醫師列表，請檢查網路或聯繫管理員。')
  }
}

// ✨ 核心修改 1：修正 fetchAllYearSchedules 的查詢方式
async function fetchAllYearSchedules(year, endMonth) {
  try {
    // 建立查詢條件，查詢 year 欄位等於當前年份，且 month 欄位小於等於當前月份
    const schedules = await physicianSchedulesApi.fetchAll([
      where('year', '==', year),
      where('month', '<=', endMonth),
    ])

    const data = {}
    schedules.forEach((doc) => {
      // 使用文件 ID (YYYY-MM) 作為 key
      data[doc.id] = doc
    })
    yearScheduleData.value = data

    if (fullYearHolidays.value.size === 0) {
      await fetchHolidayData(year, true)
    }
  } catch (error) {
    console.error(`獲取 ${year} 年排班資料失敗:`, error)
    throw new Error(`獲取 ${year} 年的年度排班資料時發生錯誤。`)
  }
}

async function loadAllData() {
  isLoading.value = true
  try {
    await fetchPhysicians()
    await fetchHolidayData(selectedYear.value, true)
    await loadScheduleForDate(selectedDate.value)
  } catch (error) {
    console.error('初始化載入失敗:', error)
    showAlert('初始化失敗', '載入頁面所需資料時發生錯誤，請重新整理。')
  } finally {
    isLoading.value = false
  }
}
async function loadScheduleForDate(date) {
  isLoading.value = true
  // 先將 hasUnsavedChanges 設為 false，避免 watch 在載入過程中觸發
  hasUnsavedChanges.value = false
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`
  try {
    await fetchAllYearSchedules(year, month)
    const existingSchedule = await physicianSchedulesApi.fetchById(yearMonth)
    Object.keys(scheduleData.value).forEach((key) => delete scheduleData.value[key])
    const pdSelections = {}
    availablePhysicians.value.forEach((doc) => {
      pdSelections[doc.id] = [
        { date: '', shift: '' },
        { date: '', shift: '' },
      ]
    })
    if (existingSchedule) {
      const blank = generateBlankSchedule(year, month, availablePhysicians.value)
      const finalSchedule = { ...blank, ...(existingSchedule.schedule || {}) }
      Object.assign(scheduleData.value, finalSchedule)
      scheduleNotes.value = existingSchedule.notes || ''
      const dates = existingSchedule.specialDates || {}
      bloodDrawDate1.value = dates.bloodDraw1 || ''
      bloodDrawDate2.value = dates.bloodDraw2 || ''
      reportDate1.value = dates.report1 || ''
      reportDate2.value = dates.report2 || ''
      if (existingSchedule.pdClinicHours) {
        for (const docId in existingSchedule.pdClinicHours) {
          if (pdSelections[docId]) {
            const savedPd = existingSchedule.pdClinicHours[docId]
            pdSelections[docId] = [
              savedPd[0] || { date: '', shift: '' },
              savedPd[1] || { date: '', shift: '' },
            ]
          }
        }
      }
    } else {
      const newSchedule = generateBlankSchedule(year, month, availablePhysicians.value)
      Object.assign(scheduleData.value, newSchedule)
      scheduleNotes.value = ''
      bloodDrawDate1.value = ''
      bloodDrawDate2.value = ''
      reportDate1.value = ''
      reportDate2.value = ''
    }
    monthlyPdClinicSelections.value = pdSelections
  } catch (error) {
    console.error(`讀取 ${yearMonth} 班表失敗:`, error)
    showAlert('讀取失敗', `讀取 ${yearMonth} 班表時發生錯誤。`)
    Object.keys(scheduleData.value).forEach((key) => delete scheduleData.value[key])
    const blank = generateBlankSchedule(year, month, availablePhysicians.value)
    Object.assign(scheduleData.value, blank)
  } finally {
    isLoading.value = false
    nextTick(() => {
      hasUnsavedChanges.value = false
    })
  }
}
async function saveAllChanges() {
  isLoading.value = true
  const schedulePromise = saveScheduleOnly()
  const clinicUpdatePromises = availablePhysicians.value.map((doc) => {
    const selectedHours = physicianClinicSelections.value[doc.id] || []
    const newClinicHours = selectedHours.filter((hour) => hour)
    const originalHours = (doc.clinicHours || []).sort().join(',')
    const newHours = [...newClinicHours].sort().join(',')
    if (originalHours !== newHours) {
      return physiciansApi.update(doc.id, { clinicHours: newClinicHours })
    }
    return Promise.resolve()
  })
  try {
    await Promise.all([...clinicUpdatePromises, schedulePromise])
    await fetchPhysicians()
    await loadScheduleForDate(selectedDate.value) // 儲存後重新載入當月資料以刷新統計
    hasUnsavedChanges.value = false
    showAlert('儲存成功', `所有變更已成功儲存！`)
  } catch (error) {
    console.error('儲存所有變更失敗:', error)
    showAlert('儲存失敗', '儲存時發生錯誤。')
  } finally {
    isLoading.value = false
  }
}
// ✨ 核心修改 2：修正 saveScheduleOnly 的儲存內容
function saveScheduleOnly() {
  const physicianMap = new Map(availablePhysicians.value.map((p) => [p.id, p.name]))
  const dataToSave = {
    // 確保 year 和 month 作為數字欄位被儲存
    year: selectedYear.value,
    month: selectedMonth.value,
    schedule: {},
    notes: scheduleNotes.value,
    specialDates: {
      bloodDraw1: bloodDrawDate1.value,
      bloodDraw2: bloodDrawDate2.value,
      report1: reportDate1.value,
      reportDate2: reportDate2.value,
    },
    pdClinicHours: {},
  }
  // 過濾掉空的 PD 門診設定
  for (const docId in monthlyPdClinicSelections.value) {
    const validPdHours = monthlyPdClinicSelections.value[docId].filter((pd) => pd.date && pd.shift)
    if (validPdHours.length > 0) {
      dataToSave.pdClinicHours[docId] = validPdHours
    }
  }
  for (const day in scheduleData.value) {
    dataToSave.schedule[day] = {}
    for (const shift of ['early', 'noon', 'late']) {
      const physicianId = scheduleData.value[day][shift].physicianId
      dataToSave.schedule[day][shift] = {
        physicianId,
        name: physicianId ? physicianMap.get(physicianId) : null,
      }
    }
  }
  return physicianSchedulesApi.save(selectedYearMonth.value, dataToSave)
}

// ✨ 核心修改 7：在 goToPreviousMonth 和 goToNextMonth 中加入未儲存提示
function goToPreviousMonth() {
  const performNavigation = () => {
    selectedDate.value = new Date(selectedDate.value.setMonth(selectedDate.value.getMonth() - 1))
  }
  if (hasUnsavedChanges.value) {
    confirmDialogTitle.value = '未儲存的變更'
    confirmDialogMessage.value = '您有未儲存的變更，確定要離開嗎？'
    confirmAction.value = performNavigation
    cancelAction.value = null // 取消就是關閉對話框
    isConfirmDialogVisible.value = true
  } else {
    performNavigation()
  }
}

function goToNextMonth() {
  const performNavigation = () => {
    selectedDate.value = new Date(selectedDate.value.setMonth(selectedDate.value.getMonth() + 1))
  }
  if (hasUnsavedChanges.value) {
    confirmDialogTitle.value = '未儲存的變更'
    confirmDialogMessage.value = '您有未儲存的變更，確定要離開嗎？'
    confirmAction.value = performNavigation
    cancelAction.value = null
    isConfirmDialogVisible.value = true
  } else {
    performNavigation()
  }
}
onMounted(() => {
  loadAllData()
})
watch(selectedYearMonth, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    loadScheduleForDate(selectedDate.value)
  }
})
watch(selectedYear, (newYear, oldYear) => {
  if (newYear !== oldYear) {
    fullYearHolidays.value = new Set()
    fetchHolidayData(newYear, true)
  }
})
watch(
  scheduleData,
  (newValue, oldValue) => {
    if (!isLoading.value && Object.keys(oldValue).length > 0) hasUnsavedChanges.value = true
  },
  { deep: true },
)
watch(scheduleNotes, () => {
  if (!isLoading.value) hasUnsavedChanges.value = true
})
watch(bloodDrawDate1, () => {
  if (!isLoading.value) hasUnsavedChanges.value = true
})
watch(bloodDrawDate2, () => {
  if (!isLoading.value) hasUnsavedChanges.value = true
})
watch(reportDate1, () => {
  if (!isLoading.value) hasUnsavedChanges.value = true
})
watch(reportDate2, () => {
  if (!isLoading.value) hasUnsavedChanges.value = true
})
watch(
  physicianClinicSelections,
  () => {
    if (!isLoading.value) hasUnsavedChanges.value = true
  },
  { deep: true },
)
watch(
  monthlyPdClinicSelections,
  () => {
    if (!isLoading.value) hasUnsavedChanges.value = true
  },
  { deep: true },
)
</script>

<style scoped>
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

/* Main Layout */
.page-container {
  padding: 1rem;
  background-color: #f8f9fa;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #dee2e6;
  flex-shrink: 0;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}
.page-main-title {
  font-size: 2rem;
  margin: 0;
  color: #343a40;
}
.month-navigator {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.month-navigator button {
  background: none;
  border: 1px solid #ced4da;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 1.2rem;
  transition: background-color 0.2s;
}
.month-navigator button:hover {
  background-color: #e9ecef;
}
.month-display {
  font-size: 1.5rem;
  font-weight: bold;
  color: #495057;
}
.status-indicator {
  font-style: italic;
  font-weight: 500;
  color: #28a745;
  transition: color 0.3s ease;
}
.status-indicator.has-changes {
  color: #dc3545;
}
.save-btn {
  padding: 0.6rem 1.2rem;
  background-color: #28a745;
  color: white;
  border: 1px solid #28a745;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  transition: all 0.2s;
}
.save-btn:hover:not(:disabled) {
  background-color: #218838;
  border-color: #1e7e34;
}
.save-btn:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}
.tabs-container {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  flex-shrink: 0;
  border-bottom: 1px solid #dee2e6;
}
.tab-link {
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-bottom: none;
  cursor: pointer;
  text-decoration: none;
  color: #007bff;
  margin-bottom: -1px;
}
.tab-link.active {
  background-color: #fff;
  border-color: #dee2e6 #dee2e6 #fff;
  border-radius: 6px 6px 0 0;
  color: #495057;
}

/* ✨ 核心修改 1：重構成 Flexbox 佈局以實現獨立滾動 */
.schedule-content.new-layout {
  flex-grow: 1;
  min-height: 0; /* 關鍵！ */
  display: flex; /* 改為 flex */
  gap: 1.5rem;
  background-color: transparent;
  padding: 0;
  border: none;
  box-shadow: none;
}

.schedule-grid-container {
  flex: 2.5; /* 分配比例 */
  min-width: 0; /* 關鍵！ */
  overflow-y: auto; /* 啟用獨立滾動 */
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.panels-container {
  flex: 1; /* 分配比例 */
  min-width: 0; /* 關鍵！ */
  overflow-y: auto; /* 啟用獨立滾動 */
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  /* ✨ 新增：為右側面板增加一些內距，避免滾動條太貼邊 */
  padding-right: 8px;
}

/* Schedule Table */
.schedule-table.weekly-grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.schedule-table th,
.schedule-table td {
  border: 1px solid #dee2e6;
  text-align: center;
  vertical-align: middle;
  height: 50px;
}
.schedule-table thead th {
  background-color: #f8f9fa;
  font-size: 1.1rem;
  padding: 0.75rem 0.5rem;
  position: sticky;
  top: 0;
  z-index: 10;
  width: 12.5%;
}
.schedule-table thead th.weekend {
  color: #dc3545;
}
.shift-header-cell {
  background-color: #f8f9fa;
  font-weight: bold;
  width: 80px !important;
  position: sticky;
  left: 0;
  z-index: 5;
}
tbody {
  border-top: 3px solid #007bff;
}
tbody:first-of-type {
  border-top: none;
}
tr.date-row {
  background-color: #e9ecef;
}
.cell-day {
  font-weight: bold;
  font-size: 1.2rem;
}
.cell-day span {
  display: inline-block;
  min-width: 50px;
}
.is-weekend {
  background-color: #fff0f1;
  color: #dc3545;
}
.is-holiday {
  background-color: #ffe8e6;
  color: #d90429;
  font-weight: bold;
}
.is-workday {
  background-color: #f0f0f0;
}
.is-empty {
  background-color: #fafafa;
}
.is-special-date {
  background-color: #fffbe3;
  color: #b45309;
  font-weight: bold;
}
.is-holiday-text-only,
.is-weekend-text-only {
  color: #dc3545;
}
.physician-select {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
  text-align: center;
  font-size: 1.5rem;
  font-weight: bold;
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  cursor: pointer;
  color: inherit;
}
.physician-select:focus {
  outline: none;
  box-shadow: none;
}
.physician-select:focus-within {
  background-color: rgba(0, 123, 255, 0.05);
}

/* Panels */
.statistics-panel,
.notes-panel,
.physician-legend-panel,
.special-dates-panel,
.pd-clinic-panel {
  background-color: #fff;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #dee2e6;
  flex-shrink: 0;
} /* ✨ 新增 flex-shrink: 0 */
.statistics-panel h2,
.notes-panel h2,
.physician-legend-panel h2,
.special-dates-panel h2,
.pd-clinic-panel h2 {
  margin-top: 0;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e9ecef;
}
.stats-table,
.legend-table {
  width: 100%;
  border-collapse: collapse;
}
.stats-table th,
.stats-table td,
.legend-table th,
.legend-table td {
  border: 1px solid #e9ecef;
  padding: 0.75rem;
  text-align: center;
}
.stats-table th,
.legend-table th {
  background-color: #f8f9fa;
}
.stats-table .has-multiple-weekends {
  font-weight: bold;
  color: #dc3545;
  font-size: 1.2em;
}
.notes-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
}
.special-dates-panel .date-input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}
.special-dates-panel label {
  font-weight: 500;
  white-space: nowrap;
}
.special-dates-panel input[type='date'] {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  flex-grow: 1;
}
.stats-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.stats-mode-toggle {
  display: flex;
  border: 1px solid #ced4da;
  border-radius: 6px;
  overflow: hidden;
}
.stats-mode-toggle button {
  background-color: #fff;
  border: none;
  padding: 4px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.stats-mode-toggle button.active {
  background-color: #007bff;
  color: white;
}

/* Legend Table */
.legend-table-wrapper {
  overflow-x: auto;
}
.legend-table.styled-legend {
  border-spacing: 0;
  border-collapse: separate;
  border: 1px solid #dee2e6;
  border-radius: 6px;
}
.legend-table.styled-legend thead th {
  border-bottom-width: 2px;
}
.legend-table.styled-legend tbody tr:not(:last-child) td {
  border-bottom: 1px solid #e9ecef;
}
.legend-table.styled-legend td,
.legend-table.styled-legend th {
  border: none;
  vertical-align: middle;
}
.legend-table.styled-legend td:not(:last-child),
.legend-table.styled-legend th:not(:last-child) {
  border-right: 1px solid #e9ecef;
}
.physician-info-row td {
  background-color: #fdfdff;
}
.physician-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
}
.legend-char {
  font-size: 1.5rem;
}
.clinic-schedule-row td {
  padding: 8px !important;
}
.clinic-select-container {
  display: flex;
  gap: 8px;
  justify-content: center;
  align-items: center;
}
.clinic-select {
  flex: 1;
  min-width: 90px;
  padding: 6px 4px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background-color: #fff;
  font-size: 0.85rem;
  cursor: pointer;
}
.clinic-select:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}
.physician-info-row.physician-color-1 .physician-name-cell .legend-char {
  color: #4a148c;
}
.physician-info-row.physician-color-2 .physician-name-cell .legend-char {
  color: #880e4f;
}
.physician-info-row.physician-color-3 .physician-name-cell .legend-char {
  color: #0d47a1;
}
.physician-info-row.physician-color-4 .physician-name-cell .legend-char {
  color: #1b5e20;
}
.physician-info-row.physician-color-5 .physician-name-cell .legend-char {
  color: #ff6f00;
}
.physician-color-1 {
  background-color: #f3e5f5;
}
.physician-color-2 {
  background-color: #fce4ec;
}
.physician-color-3 {
  background-color: #e3f2fd;
}
.physician-color-4 {
  background-color: #e8f5e9;
}
.physician-color-5 {
  background-color: #fff8e1;
}

/* PD Clinic Section */
.pd-clinic-section,
.pd-clinic-panel {
  border-top: 2px solid #007bff;
  margin-top: 1rem;
  padding-top: 1rem;
}
.pd-clinic-panel h2 {
  margin-top: 0;
  font-size: 1.2rem;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e9ecef;
}
.pd-clinic-section h4 {
  margin-top: 0;
  font-size: 1rem;
  color: #0056b3;
}
.pd-clinic-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.pd-clinic-row {
  display: grid;
  grid-template-columns: 80px 1fr 1fr;
  gap: 8px;
  align-items: center;
}
.pd-doctor-name {
  font-weight: 500;
  font-size: 0.9rem;
}
.pd-input-group {
  display: flex;
  gap: 4px;
}
.pd-input-group input[type='date'] {
  width: 100%;
  padding: 4px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.85rem;
}
.pd-input-group select {
  width: 100%;
  padding: 4px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.85rem;
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #007bff;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

@media (max-width: 1400px) {
  .schedule-content.new-layout {
    grid-template-columns: 1fr;
  }
  .panels-container,
  .schedule-grid-container {
    overflow-y: visible;
  }
}
</style>
