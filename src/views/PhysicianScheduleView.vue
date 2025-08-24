<template>
  <div class="page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入醫師與排班資料...</p>
    </div>

    <header class="page-header">
      <div class="header-left">
        <h1 class="page-main-title">醫師班表</h1>
        <div class="month-navigator">
          <button @click="goToPreviousMonth" title="上一個月">❮</button>
          <span class="month-display">{{ selectedYear }} 年 {{ selectedMonth }} 月</span>
          <button @click="goToNextMonth" title="下一個月">❯</button>
        </div>
      </div>
      <div class="header-right">
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
          <h2>醫師資訊與門診設定</h2>
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
                          vif="physicianClinicSelections[doc.id]"
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
                <th>本月平日(含國定假日)班</th>
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
                <th>累計平日假日班</th>
                <th>累計週末班</th>
              </tr>
            </thead>
            <!-- ✨ 2. 修改 "今年累計" 的 <tbody> 區塊 ✨ -->
            <tbody v-if="statsViewMode === 'ytd'">
              <tr v-for="stat in scheduleStats" :key="stat.name">
                <td>{{ stat.name }}</td>
                <td>{{ stat.ytdTotal }}</td>
                <td>{{ stat.ytdHolidays }}</td>
                <!-- ytdDoubleWeekends 已被移除，這裡直接顯示 ytdWeekends -->
                <td>{{ stat.ytdWeekends }}</td>
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

        <div class="notes-panel">
          <h2>國定假日管理 (本月)</h2>
          <div class="holiday-manager">
            <div class="holiday-add-form">
              <select v-model="holidayForm.name" class="holiday-input">
                <option disabled value="">選擇或自訂假日</option>
                <option v-for="holiday in holidays2025" :key="holiday.date" :value="holiday.name">
                  {{ holiday.name }} ({{ holiday.date }})
                </option>
                <option value="custom">-- 自訂假日 --</option>
              </select>
              <input
                v-if="holidayForm.name === 'custom'"
                type="text"
                v-model="holidayForm.customName"
                placeholder="輸入假日名稱"
                class="holiday-input"
              />
              <input type="date" v-model="holidayForm.date" class="holiday-input" />
              <button @click="addHoliday" class="add-holiday-btn">新增</button>
            </div>
            <ul v-if="managedHolidays.length > 0" class="holiday-list">
              <li v-for="(holiday, index) in managedHolidays" :key="index">
                <span>{{ holiday.name }} ({{ holiday.date }})</span>
                <button @click="removeHoliday(index)" class="remove-holiday-btn">×</button>
              </li>
            </ul>
            <p v-else class="no-holidays-text">本月沒有設定國定假日。</p>
          </div>
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

// PhysicianScheduleView.vue (最終前端方案)

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// --- API 管理器 ---
const usersApi = ApiManager('users') // 主要的醫師資料來源
const physicianSchedulesApi = ApiManager('physician_schedules')

// --- 頁面狀態 (Refs) ---
const isLoading = ref(true)
const selectedDate = ref(new Date())
const availablePhysicians = ref([])
const scheduleData = ref({})
const scheduleNotes = ref('')
const hasUnsavedChanges = ref(false)
const physicianClinicSelections = ref({})
const monthlyPdClinicSelections = ref({})
const statsViewMode = ref('monthly')
const yearScheduleData = ref({})

// --- 面板資料 (Refs) ---
const bloodDrawDate1 = ref('')
const bloodDrawDate2 = ref('')
const reportDate1 = ref('')
const reportDate2 = ref('')
const managedHolidays = ref([])
const holidayForm = ref({ name: '', customName: '', date: '' })

// --- 對話框狀態 (Refs) ---
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const cancelAction = ref(null)

// --- 靜態資料 ---
const holidays2025 = [
  { name: '中華民國開國紀念日', date: '2025-01-01' },
  { name: '農曆除夕', date: '2025-01-28' },
  { name: '農曆春節', date: '2025-01-29' },
  { name: '農曆春節', date: '2025-01-30' },
  { name: '農曆春節', date: '2025-01-31' },
  { name: '和平紀念日', date: '2025-02-28' },
  { name: '兒童節', date: '2025-04-04' },
  { name: '民族掃墓節(清明節)', date: '2025-04-05' },
  { name: '端午節', date: '2025-05-31' },
  { name: '中秋節', date: '2025-10-06' },
  { name: '國慶日', date: '2025-10-10' },
]
const physicianColorClasses = [
  'physician-color-1',
  'physician-color-2',
  'physician-color-3',
  'physician-color-4',
  'physician-color-5',
]

// --- Computed (計算屬性) ---
// ... (所有 computed 屬性保持不變) ...
const statusText = computed(() => {
  return hasUnsavedChanges.value ? '有未儲存的變更' : '所有變更已儲存'
})
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
    days.push({ day: date.getDate(), isWeekend: dayOfWeek === 0 || dayOfWeek === 6 })
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

const scheduleStats = computed(() => {
  return availablePhysicians.value.map((doc) => {
    const stats = {
      name: doc.name,
      monthlyWeekday: 0,
      monthlyWeekend: 0,
      ytdTotal: 0,
      ytdHolidays: 0,
      ytdWeekends: 0,
    }

    // --- 1. 計算本月統計 ---
    const currentMonthData = scheduleData.value
    if (Object.keys(currentMonthData).length > 0) {
      daysInMonth.value.forEach((dayInfo) => {
        const day = dayInfo.day
        ;['early', 'noon', 'late'].forEach((shift) => {
          if (currentMonthData[day]?.[shift]?.physicianId === doc.id) {
            // 正確的邏輯: 只有週六日 (isWeekend) 才算週末班
            if (dayInfo.isWeekend) {
              stats.monthlyWeekend++
            }
            // 其他日子 (週一至五，包含國定假日) 都算平日班
            else {
              stats.monthlyWeekday++
            }
          }
        })
      })
    }

    // --- 2. 計算年度累計統計 ---
    for (const monthKey in yearScheduleData.value) {
      const monthScheduleData = yearScheduleData.value[monthKey]
      if (!monthScheduleData || !monthScheduleData.schedule) continue
      const monthSchedule = monthScheduleData.schedule
      const monthHolidays = new Set((monthScheduleData.managedHolidays || []).map((h) => h.date))
      const year = monthScheduleData.year
      const monthNum = monthScheduleData.month
      const daysInThisMonth = new Date(year, monthNum, 0).getDate()

      for (let day = 1; day <= daysInThisMonth; day++) {
        const date = new Date(year, monthNum - 1, day)
        const dayOfWeek = date.getDay()
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
        const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        const isHoliday = monthHolidays.has(dateStr)

        ;['early', 'noon', 'late'].forEach((shift) => {
          if (monthSchedule[day]?.[shift]?.physicianId === doc.id) {
            stats.ytdTotal++
            // 累計平日假日班 (必須是國定假日，且 *不是* 週末)
            if (isHoliday && !isWeekend) {
              stats.ytdHolidays++
            }
            // 累計週末班 (只要是週六或週日就累加)
            if (isWeekend) {
              stats.ytdWeekends++
            }
          }
        })
      }
    }
    return stats
  })
})

const physicianClassMap = computed(() => {
  const map = new Map()
  availablePhysicians.value.forEach((doc, index) => {
    map.set(doc.id, physicianColorClasses[index % physicianColorClasses.length])
  })
  return map
})

// --- Functions (方法) ---

// ✨ 1. ✨ 用這個新版本替換舊的 fetchPhysicians
async function fetchPhysicians() {
  try {
    // 從 'users' 集合中，查詢 title 為 '主治醫師' 的所有文件
    const physicians = await usersApi.fetchAll([where('title', '==', '主治醫師')])

    const desiredOrder = ['廖丁瑩', '蔡宜潔', '蘇哲弘', '蔡亨政', '林天佑'] // 排序用
    physicians.sort((a, b) => {
      const indexA = desiredOrder.indexOf(a.name)
      const indexB = desiredOrder.indexOf(b.name)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return a.name.localeCompare(b.name, 'zh-Hant')
    })

    // 初始化門診時間選擇
    const clinicSelections = {}
    physicians.forEach((doc) => {
      const hours = Array.isArray(doc.clinicHours) ? doc.clinicHours : []
      clinicSelections[doc.id] = [hours[0] || '', hours[1] || '', hours[2] || '', hours[3] || '']
    })
    physicianClinicSelections.value = clinicSelections

    // 將最終的醫師列表存入 ref
    availablePhysicians.value = physicians
  } catch (error) {
    console.error('讀取主治醫師列表失敗:', error)
    showAlert('錯誤', '無法從使用者列表讀取主治醫師資料，請檢查網路或聯繫管理員。')
  }
}

// ✨ 2. ✨ 用這個新版本替換舊的 generateBlankSchedule
/**
 * 根據所有醫師的預設規則，在前端生成一個新的月份班表範本。
 * @param {number} year 年份
 * @param {number} month 月份
 * @param {Array<object>} physicians - 從 users 集合讀取的所有主治醫師列表
 * @returns {object} - 生成的班表物件
 */
function generateBlankSchedule(year, month, physicians) {
  const blankSchedule = {}
  const daysCount = new Date(year, month, 0).getDate()

  // 步驟 1: 先建立一個完全空白的月份結構
  for (let i = 1; i <= daysCount; i++) {
    blankSchedule[i] = {
      early: { physicianId: null, name: null },
      noon: { physicianId: null, name: null },
      late: { physicianId: null, name: null },
    }
  }

  // 步驟 2: 遍歷每一位醫師，將他們的預設規則填入空白班表
  physicians.forEach((physician) => {
    if (Array.isArray(physician.defaultSchedules) && physician.defaultSchedules.length > 0) {
      // 遍歷該醫師的所有預設規則
      physician.defaultSchedules.forEach((rule) => {
        const [ruleDayOfWeek, ruleShift] = rule.split('-') // e.g., "1-early"

        // 遍歷這個月的所有天
        for (let day = 1; day <= daysCount; day++) {
          const date = new Date(year, month - 1, day)
          if (date.getDay() == ruleDayOfWeek) {
            // 注意：JS getDay() 0=週日, 1=週一...
            // 如果這一天符合規則，就把醫師填進去
            if (blankSchedule[day] && blankSchedule[day][ruleShift]) {
              blankSchedule[day][ruleShift] = {
                physicianId: physician.id,
                name: physician.name,
              }
            }
          }
        }
      })
    }
  })

  return blankSchedule
}

// ✨ 3. ✨ 用這個新版本替換舊的 loadScheduleForDate
async function loadScheduleForDate(date) {
  isLoading.value = true
  hasUnsavedChanges.value = false
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`

  try {
    await fetchAllYearSchedules(year, month) // 載入年度統計資料

    // 嘗試從雲端讀取本月班表
    const existingSchedule = await physicianSchedulesApi.fetchById(yearMonth)

    // 清空現有資料，準備填入新的
    Object.keys(scheduleData.value).forEach((key) => delete scheduleData.value[key])
    const pdSelections = {}
    availablePhysicians.value.forEach((doc) => {
      pdSelections[doc.id] = [
        { date: '', shift: '' },
        { date: '', shift: '' },
      ]
    })

    if (existingSchedule) {
      // --- 情況 A: 雲端有資料，直接使用 ---
      console.log(`[Schedule] 成功讀取 ${yearMonth} 的已存班表。`)
      const finalSchedule = { ...(existingSchedule.schedule || {}) }
      Object.assign(scheduleData.value, finalSchedule)

      // 載入其他相關資料
      scheduleNotes.value = existingSchedule.notes || ''
      const dates = existingSchedule.specialDates || {}
      bloodDrawDate1.value = dates.bloodDraw1 || ''
      bloodDrawDate2.value = dates.bloodDraw2 || ''
      reportDate1.value = dates.report1 || ''
      reportDate2.value = dates.report2 || ''
      managedHolidays.value = existingSchedule.managedHolidays || []
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
      // --- 情況 B: 雲端沒有資料，呼叫 generateBlankSchedule 產生初始範本 ---
      console.log(`[Schedule] ${yearMonth} 班表不存在，正在生成初始範本...`)
      const newSchedule = generateBlankSchedule(year, month, availablePhysicians.value)
      Object.assign(scheduleData.value, newSchedule)

      // 重置其他相關資料為空
      scheduleNotes.value = ''
      bloodDrawDate1.value = ''
      bloodDrawDate2.value = ''
      reportDate1.value = ''
      reportDate2.value = ''
      managedHolidays.value = []
    }
    monthlyPdClinicSelections.value = pdSelections
  } catch (error) {
    console.error(`讀取 ${yearMonth} 班表失敗:`, error)
    showAlert('讀取失敗', `讀取 ${yearMonth} 班表時發生錯誤。`)
    Object.keys(scheduleData.value).forEach((key) => delete scheduleData.value[key])
  } finally {
    isLoading.value = false
    nextTick(() => {
      hasUnsavedChanges.value = false
    })
  }
}

// ✨ 4. ✨ 用這個新版本替換舊的 saveAllChanges
async function saveAllChanges() {
  isLoading.value = true
  const schedulePromise = saveScheduleOnly()

  // 將門診時間更新回 'users' 集合
  const clinicUpdatePromises = availablePhysicians.value.map((doc) => {
    const selectedHours = physicianClinicSelections.value[doc.id] || []
    const newClinicHours = selectedHours.filter((hour) => hour)
    const originalHours = (doc.clinicHours || []).sort().join(',')
    const newHours = [...newClinicHours].sort().join(',')

    if (originalHours !== newHours) {
      return usersApi.update(doc.id, { clinicHours: newClinicHours })
    }
    return Promise.resolve()
  })

  try {
    await Promise.all([...clinicUpdatePromises, schedulePromise])
    // 儲存後重新載入醫師資料，以確保門診時間等資料同步
    await fetchPhysicians()
    await loadScheduleForDate(selectedDate.value)
    hasUnsavedChanges.value = false
    showAlert('儲存成功', `所有變更已成功儲存！`)
  } catch (error) {
    console.error('儲存所有變更失敗:', error)
    showAlert('儲存失敗', '儲存時發生錯誤。')
  } finally {
    isLoading.value = false
  }
}

// ... (其他所有函式，如 addHoliday, checkClinicConflict, saveScheduleOnly, goToNextMonth 等都保持不變) ...
function addHoliday() {
  const name =
    holidayForm.value.name === 'custom' ? holidayForm.value.customName : holidayForm.value.name
  const date = holidayForm.value.date
  if (!name || !date) {
    showAlert('輸入不完整', '請提供完整的假日名稱和日期。')
    return
  }
  if (managedHolidays.value.some((h) => h.date === date)) {
    showAlert('日期重複', '這個日期已經被設定為假日了。')
    return
  }
  managedHolidays.value.push({ name, date })
  managedHolidays.value.sort((a, b) => a.date.localeCompare(b.date))
  holidayForm.value = { name: '', customName: '', date: '' }
}
function removeHoliday(index) {
  managedHolidays.value.splice(index, 1)
}
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
  const regularClinicHours = physicianClinicSelections.value[newPhysicianId] || []
  const regularConflictCode = `${dayOfWeek === 0 ? 7 : dayOfWeek}-${currentShiftCode}`
  if (regularClinicHours.includes(regularConflictCode)) {
    conflictType = '常規門診'
  }
  const pdClinicHours = monthlyPdClinicSelections.value[newPhysicianId] || []
  const pdConflict = pdClinicHours.some(
    (pd) => pd.date === dateStr && pd.shift === currentShiftCode,
  )
  if (pdConflict) {
    conflictType = 'PD 門診'
  }
  if (conflictType) {
    const originalPhysicianId = scheduleData.value[day.day][shift].physicianId
    confirmDialogTitle.value = '門診時間衝突'
    confirmDialogMessage.value = `提醒：${physician.name} 醫師在該時段有${conflictType}，您確定要排此班嗎？`
    confirmAction.value = () => {
      isConfirmDialogVisible.value = false
    }
    cancelAction.value = () => {
      scheduleData.value[day.day][shift].physicianId = originalPhysicianId
      event.target.value = originalPhysicianId
      isConfirmDialogVisible.value = false
    }
    isConfirmDialogVisible.value = true
  }
}
function getDisplayName(physician) {
  if (physician.name === '蔡亨政') return '政'
  return physician.name.charAt(0)
}
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
  if (managedHolidays.value.some((h) => h.date === dateStr)) return 'is-holiday'
  if (day.isWeekend) return 'is-weekend'
  return 'is-weekday'
}
function getShiftCellClass(day) {
  if (!day || !day.day) return 'is-empty'
  const dateStr = `${selectedYear.value}-${String(selectedMonth.value).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  if (managedHolidays.value.some((h) => h.date === dateStr)) return 'is-holiday-text-only'
  if (day.isWeekend) return 'is-weekend-text-only'
  return ''
}
async function fetchAllYearSchedules(year, endMonth) {
  try {
    const schedules = await physicianSchedulesApi.fetchAll([
      where('year', '==', year),
      where('month', '<=', endMonth),
    ])
    const data = {}
    schedules.forEach((doc) => {
      data[doc.id] = doc
    })
    yearScheduleData.value = data
  } catch (error) {
    console.error(`獲取 ${year} 年排班資料失敗:`, error)
    throw new Error(`獲取 ${year} 年的年度排班資料時發生錯誤。`)
  }
}
async function loadAllData() {
  isLoading.value = true
  try {
    await fetchPhysicians()
    await loadScheduleForDate(selectedDate.value)
  } catch (error) {
    console.error('初始化載入失敗:', error)
    showAlert('初始化失敗', '載入頁面所需資料時發生錯誤，請重新整理。')
  } finally {
    isLoading.value = false
  }
}

function saveScheduleOnly() {
  const physicianMap = new Map(availablePhysicians.value.map((p) => [p.id, p.name]))
  const dataToSave = {
    year: selectedYear.value,
    month: selectedMonth.value,
    schedule: {},
    notes: scheduleNotes.value,
    specialDates: {
      bloodDraw1: bloodDrawDate1.value,
      bloodDraw2: bloodDrawDate2.value,
      report1: reportDate1.value,
      report2: reportDate2.value, // 確保這裡也是 report2
    },
    pdClinicHours: {},
    managedHolidays: managedHolidays.value,
  }

  // 過濾掉空的 PD 門診設定
  for (const docId in monthlyPdClinicSelections.value) {
    const validPdHours = monthlyPdClinicSelections.value[docId].filter((pd) => pd.date && pd.shift)
    if (validPdHours.length > 0) {
      dataToSave.pdClinicHours[docId] = validPdHours
    }
  }

  // 遍歷所有排班資料，準備儲存
  for (const day in scheduleData.value) {
    dataToSave.schedule[day] = {}
    for (const shift of ['early', 'noon', 'late']) {
      const physicianId = scheduleData.value[day][shift]?.physicianId // 使用可選串聯 ?. 避免錯誤

      // ✨ 核心修正點 ✨
      // 如果有 physicianId，才建立這個班別的物件
      if (physicianId) {
        dataToSave.schedule[day][shift] = {
          physicianId: physicianId,
          // 防呆處理：如果從 map 中找不到名字，就存入 null，而不是 undefined
          name: physicianMap.get(physicianId) || null,
        }
      }
      // 如果連 physicianId 都沒有，就完全不要建立這個 shift 物件，保持資料庫乾淨
    }
    // 如果某一天三個班別都沒有人，就從要儲存的資料中移除這一天
    if (Object.keys(dataToSave.schedule[day]).length === 0) {
      delete dataToSave.schedule[day]
    }
  }

  return physicianSchedulesApi.save(selectedYearMonth.value, dataToSave)
}

function goToPreviousMonth() {
  const performNavigation = () => {
    selectedDate.value = new Date(selectedDate.value.setMonth(selectedDate.value.getMonth() - 1))
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
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}

// --- Lifecycle & Watchers ---
onMounted(() => {
  loadAllData()
})
watch(selectedYearMonth, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    loadScheduleForDate(selectedDate.value)
  }
})
watch(
  () => holidayForm.value.name,
  (newName) => {
    if (newName && newName !== 'custom') {
      const found = holidays2025.find((h) => h.name === newName)
      if (found) {
        holidayForm.value.date = found.date
      }
    }
  },
)
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
watch(
  managedHolidays,
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

.schedule-content.new-layout {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  gap: 1.5rem;
  background-color: transparent;
  padding: 0;
  border: none;
  box-shadow: none;
}

.schedule-grid-container {
  flex: 2.5;
  min-width: 0;
  overflow-y: auto;
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.panels-container {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
}
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
/* ✨ 新增：用於新增醫師的樣式 ✨ */
.add-physician-row td {
  padding: 8px !important;
  background-color: #f8f9fa;
}
.form-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  box-sizing: border-box; /* 確保 padding 不會讓寬度超出 */
}
.form-input:focus {
  border-color: #80bdff;
  outline: 0;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}
.add-action-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-btn {
  padding: 0;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background-color: #28a745;
  color: white;
  border: none;
  font-size: 1.5rem;
  font-weight: bold;
  cursor: pointer;
  line-height: 32px; /* 讓 '+' 垂直置中 */
  flex-shrink: 0; /* 防止按鈕被壓縮 */
  transition: background-color 0.2s;
}
.add-btn:hover {
  background-color: #218838;
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
.pd-input-group input[type='date'],
.pd-input-group select {
  width: 100%;
  padding: 4px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.85rem;
}

/* ✨ 新增：假日管理面板樣式 */
.holiday-add-form {
  display: flex;
  gap: 8px;
  margin-bottom: 1rem;
}
.holiday-input {
  padding: 6px;
  border: 1px solid #ced4da;
  border-radius: 4px;
  flex: 1;
}
.add-holiday-btn {
  padding: 6px 12px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.add-holiday-btn:hover {
  background-color: #0056b3;
}
.holiday-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.holiday-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background-color: #f8f9fa;
  border-radius: 4px;
}
.remove-holiday-btn {
  background: none;
  border: none;
  color: #dc3545;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
}
.no-holidays-text {
  color: #6c757d;
  font-style: italic;
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
