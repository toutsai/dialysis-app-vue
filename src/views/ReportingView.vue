<script setup>
import { ref, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants.js'
import * as XLSX from 'xlsx'

const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')

const formatDate = (date) => {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

const reportType = ref('daily')
const selectedDate = ref(formatDate(new Date()))
const selectedMonth = ref(new Date().toISOString().slice(0, 7))
const selectedYear = ref(new Date().getFullYear())

const isLoading = ref(false)
const reportDateRange = ref({ start: '', end: '' })

// 表格數據
const dailyTableHeaders = ref([])
const dailyTableRows = ref([])
const monthlyTableHeaders = ref([])
const monthlyTableRows = ref([])
const yearlyTableHeaders = ref([])
const yearlyTableRows = ref([])

const reportTitle = computed(() => {
  if (reportDateRange.value.start === '') return '統計結果'

  if (reportType.value === 'daily') {
    return `${reportDateRange.value.start} 日報表`
  }
  if (reportType.value === 'monthly') {
    return `${selectedMonth.value} 月報表`
  }
  if (reportType.value === 'yearly') {
    return `${selectedYear.value} 年度報表`
  }
  return '統計報表'
})

const noData = computed(() => {
  if (reportType.value === 'daily') return dailyTableRows.value.length === 0
  if (reportType.value === 'monthly') return monthlyTableRows.value.length === 0
  if (reportType.value === 'yearly') return yearlyTableRows.value.length === 0
  return true
})

async function generateReport() {
  if (
    (reportType.value === 'daily' && !selectedDate.value) ||
    (reportType.value === 'monthly' && !selectedMonth.value) ||
    (reportType.value === 'yearly' && !selectedYear.value)
  ) {
    alert('請先選擇日期、月份或年份！')
    return
  }
  isLoading.value = true
  dailyTableHeaders.value = []
  dailyTableRows.value = []
  monthlyTableHeaders.value = []
  monthlyTableRows.value = []
  yearlyTableHeaders.value = []
  yearlyTableRows.value = []

  try {
    let startDate, endDate
    if (reportType.value === 'daily') {
      startDate = selectedDate.value
      endDate = selectedDate.value
    } else if (reportType.value === 'monthly') {
      const year = parseInt(selectedMonth.value.split('-')[0], 10)
      const month = parseInt(selectedMonth.value.split('-')[1], 10) - 1
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
      startDate = formatDate(firstDay)
      endDate = formatDate(lastDay)
    } else if (reportType.value === 'yearly') {
      const year = selectedYear.value
      const firstDay = new Date(year, 0, 1) // 1月1日
      const lastDay = new Date(year, 11, 31) // 12月31日
      startDate = formatDate(firstDay)
      endDate = formatDate(lastDay)
    }

    reportDateRange.value = { start: startDate, end: endDate }

    const [schedulesData, patientsData] = await Promise.all([
      schedulesApi.fetchAll([where('date', '>=', startDate), where('date', '<=', endDate)]),
      patientsApi.fetchAll(),
    ])
    const patientMap = new Map(patientsData.map((p) => [p.id, p]))

    if (reportType.value === 'daily') {
      processDailyReport(schedulesData, patientMap)
    } else if (reportType.value === 'monthly') {
      processMonthlyReport(schedulesData, patientMap, startDate)
    } else if (reportType.value === 'yearly') {
      processYearlyReport(schedulesData, patientMap)
    }
  } catch (error) {
    console.error('生成報表失敗:', error)
    alert('生成報表時發生錯誤，請檢查主控台訊息。')
  } finally {
    isLoading.value = false
  }
}

function exportToExcel() {
  if (noData.value) {
    alert('沒有可匯出的數據！')
    return
  }

  let headers, dataRows, filename, excelTitle
  excelTitle = reportTitle.value

  if (reportType.value === 'daily') {
    headers = ['透析模式', '類別', ...dailyTableHeaders.value, '當日總計']
    dataRows = dailyTableRows.value.map((row) => [
      row.mode,
      row.status,
      ...row.shiftCounts,
      row.dailyTotal,
    ])
    filename = `日報表_${selectedDate.value}.xlsx`
  } else if (reportType.value === 'monthly') {
    headers = ['透析模式', '類別', ...monthlyTableHeaders.value, '月總計']
    dataRows = monthlyTableRows.value.map((row) => [
      row.mode,
      row.status,
      ...row.dailyCounts,
      row.monthlyTotal,
    ])
    filename = `月報表_${selectedMonth.value}.xlsx`
  } else if (reportType.value === 'yearly') {
    headers = ['透析模式', '類別', ...yearlyTableHeaders.value, '年總計']
    dataRows = yearlyTableRows.value.map((row) => [
      row.mode,
      row.status,
      ...row.monthlyCounts,
      row.yearlyTotal,
    ])
    filename = `年度報表_${selectedYear.value}.xlsx`
  }

  const titleRow = [excelTitle]
  const emptyRow = []
  const data = [titleRow, emptyRow, headers, ...dataRows]

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(data)
  const merge = { s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }
  if (!worksheet['!merges']) worksheet['!merges'] = []
  worksheet['!merges'].push(merge)
  if (worksheet['A1']) {
    worksheet['A1'].s = { alignment: { horizontal: 'center', vertical: 'center' } }
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, '報表')
  XLSX.writeFile(workbook, filename)
}

function processDailyReport(schedulesData, patientMap) {
  const shiftBreakdown = {}
  const dailyRecord = schedulesData[0]
  if (dailyRecord && dailyRecord.schedule) {
    for (const slotData of Object.values(dailyRecord.schedule)) {
      if (!slotData?.patientId || !slotData.shiftId) continue
      const patient = patientMap.get(slotData.patientId)
      if (!patient) continue
      const parts = slotData.shiftId.split('-')
      const shiftCode = parts[parts.length - 1]
      if (!shiftCode) continue
      if (!shiftBreakdown[shiftCode]) shiftBreakdown[shiftCode] = {}
      const status = patient.status || 'unknown'
      const mode = patient.mode || 'HD'
      const comboKey = `${mode}-${status}`
      if (!shiftBreakdown[shiftCode][comboKey]) shiftBreakdown[shiftCode][comboKey] = 0
      shiftBreakdown[shiftCode][comboKey]++
    }
  }
  const shiftOrder = [SHIFT_CODES.EARLY, SHIFT_CODES.NOON, SHIFT_CODES.LATE]
  dailyTableHeaders.value = shiftOrder.map((code) => getShiftDisplayName(code))
  const reportMatrix = {}
  const statusDisplay = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' }
  shiftOrder.forEach((shiftCode, shiftIndex) => {
    const shiftData = shiftBreakdown[shiftCode] || {}
    for (const comboKey in shiftData) {
      if (!reportMatrix[comboKey]) {
        const [mode, status] = comboKey.split('-')
        reportMatrix[comboKey] = {
          mode: mode,
          status: statusDisplay[status] || status,
          shiftCounts: Array(shiftOrder.length).fill(0),
          dailyTotal: 0,
        }
      }
      const count = shiftData[comboKey]
      reportMatrix[comboKey].shiftCounts[shiftIndex] = count
      reportMatrix[comboKey].dailyTotal += count
    }
  })
  const shiftTotalsRow = {
    mode: '每班總計',
    status: '',
    shiftCounts: Array(shiftOrder.length).fill(0),
    dailyTotal: 0,
  }
  const sortedRows = Object.values(reportMatrix).sort(
    (a, b) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status),
  )
  sortedRows.forEach((row) => {
    row.shiftCounts.forEach((count, index) => {
      shiftTotalsRow.shiftCounts[index] += count
    })
  })
  shiftTotalsRow.dailyTotal = shiftTotalsRow.shiftCounts.reduce((sum, count) => sum + count, 0)
  dailyTableRows.value = [...sortedRows, shiftTotalsRow]
}

function processMonthlyReport(schedulesData, patientMap, monthStartDate) {
  const dailyBreakdown = {}
  for (const dailyRecord of schedulesData) {
    if (!dailyRecord.schedule) continue
    const dateKey = dailyRecord.date
    if (!dailyBreakdown[dateKey]) dailyBreakdown[dateKey] = {}
    for (const slotData of Object.values(dailyRecord.schedule)) {
      if (!slotData?.patientId) continue
      const patient = patientMap.get(slotData.patientId)
      if (!patient) continue
      const status = patient.status || 'unknown'
      const mode = patient.mode || 'HD'
      const comboKey = `${mode}-${status}`
      if (!dailyBreakdown[dateKey][comboKey]) dailyBreakdown[dateKey][comboKey] = 0
      dailyBreakdown[dateKey][comboKey]++
    }
  }
  const month = new Date(monthStartDate).getMonth()
  const year = new Date(monthStartDate).getFullYear()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  monthlyTableHeaders.value = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const reportMatrix = {}
  const statusDisplay = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day))
    const dayData = dailyBreakdown[dateStr] || {}
    for (const comboKey in dayData) {
      if (!reportMatrix[comboKey]) {
        const [mode, status] = comboKey.split('-')
        reportMatrix[comboKey] = {
          mode: mode,
          status: statusDisplay[status] || status,
          dailyCounts: Array(daysInMonth).fill(0),
          monthlyTotal: 0,
        }
      }
      const count = dayData[comboKey]
      reportMatrix[comboKey].dailyCounts[day - 1] = count
      reportMatrix[comboKey].monthlyTotal += count
    }
  }
  const dailyTotalsRow = {
    mode: '每日總計',
    status: '',
    dailyCounts: Array(daysInMonth).fill(0),
    monthlyTotal: 0,
  }
  const sortedRows = Object.values(reportMatrix).sort(
    (a, b) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status),
  )
  sortedRows.forEach((row) => {
    row.dailyCounts.forEach((count, index) => {
      dailyTotalsRow.dailyCounts[index] += count
    })
  })
  dailyTotalsRow.monthlyTotal = dailyTotalsRow.dailyCounts.reduce((sum, count) => sum + count, 0)
  monthlyTableRows.value = [...sortedRows, dailyTotalsRow]
}

function processYearlyReport(schedulesData, patientMap) {
  const monthlyBreakdown = {}

  for (const dailyRecord of schedulesData) {
    if (!dailyRecord.schedule) continue

    const recordDate = new Date(dailyRecord.date + 'T00:00:00')
    const monthIndex = recordDate.getMonth()

    for (const slotData of Object.values(dailyRecord.schedule)) {
      if (!slotData?.patientId) continue
      const patient = patientMap.get(slotData.patientId)
      if (!patient) continue

      const status = patient.status || 'unknown'
      const mode = patient.mode || 'HD'
      const comboKey = `${mode}-${status}`

      if (!monthlyBreakdown[comboKey]) {
        monthlyBreakdown[comboKey] = Array(12).fill(0)
      }
      monthlyBreakdown[comboKey][monthIndex]++
    }
  }

  yearlyTableHeaders.value = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)

  const reportMatrix = {}
  const statusDisplay = { opd: '門診', ipd: '住院', er: '急診', unknown: '未知' }

  for (const comboKey in monthlyBreakdown) {
    const [mode, status] = comboKey.split('-')
    const monthlyCounts = monthlyBreakdown[comboKey]

    reportMatrix[comboKey] = {
      mode: mode,
      status: statusDisplay[status] || status,
      monthlyCounts: monthlyCounts,
      yearlyTotal: monthlyCounts.reduce((sum, count) => sum + count, 0),
    }
  }

  const monthlyTotalsRow = {
    mode: '每月總計',
    status: '',
    monthlyCounts: Array(12).fill(0),
    yearlyTotal: 0,
  }

  const sortedRows = Object.values(reportMatrix).sort(
    (a, b) => a.mode.localeCompare(b.mode) || a.status.localeCompare(b.status),
  )

  sortedRows.forEach((row) => {
    row.monthlyCounts.forEach((count, index) => {
      monthlyTotalsRow.monthlyCounts[index] += count
    })
  })
  monthlyTotalsRow.yearlyTotal = monthlyTotalsRow.monthlyCounts.reduce(
    (sum, count) => sum + count,
    0,
  )

  yearlyTableRows.value = [...sortedRows, monthlyTotalsRow]
}
</script>

<template>
  <div class="reporting-view-container">
    <h1 class="page-title">統計報表生成</h1>

    <div class="report-controls">
      <div class="control-group">
        <label for="report-type">報表類型：</label>
        <select id="report-type" v-model="reportType">
          <option value="daily">日報表</option>
          <option value="monthly">月報表</option>
          <option value="yearly">年度報表</option>
        </select>
      </div>
      <div class="control-group">
        <template v-if="reportType === 'daily'">
          <label for="report-date">選擇日期：</label>
          <input id="report-date" type="date" v-model="selectedDate" />
        </template>
        <template v-if="reportType === 'monthly'">
          <label for="report-month">選擇月份：</label>
          <input id="report-month" type="month" v-model="selectedMonth" />
        </template>
        <template v-if="reportType === 'yearly'">
          <label for="report-year">選擇年份：</label>
          <input id="report-year" type="number" v-model="selectedYear" />
        </template>
      </div>
      <button class="generate-btn" @click="generateReport" :disabled="isLoading">
        {{ isLoading ? '生成中...' : '生成報表' }}
      </button>
      <button class="export-btn" @click="exportToExcel" :disabled="isLoading || noData">
        匯出 Excel
      </button>
    </div>

    <div class="report-results">
      <div v-if="isLoading" class="loading-state">
        <p>報表生成中，請稍候...</p>
      </div>

      <!-- 日報表顯示區 -->
      <div v-else-if="reportType === 'daily' && !noData" class="results-table-container">
        <h2>{{ reportTitle }}</h2>
        <table class="results-table daily-table">
          <thead>
            <tr>
              <th>透析模式</th>
              <th>類別</th>
              <th v-for="header in dailyTableHeaders" :key="header">{{ header }}</th>
              <th>當日總計</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in dailyTableRows"
              :key="rowIndex"
              :class="{ 'total-row': row.mode === '每班總計' }"
            >
              <td>{{ row.mode }}</td>
              <td>{{ row.status }}</td>
              <td v-for="(count, shiftIndex) in row.shiftCounts" :key="shiftIndex">
                {{ count > 0 ? count : '' }}
              </td>
              <td class="total-col">{{ row.dailyTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 月報表顯示區 -->
      <div
        v-else-if="reportType === 'monthly' && !noData"
        class="results-table-container monthly-report"
      >
        <h2>{{ reportTitle }}</h2>
        <table class="results-table monthly-table">
          <thead>
            <tr>
              <th class="sticky-col first-col">透析模式</th>
              <th class="sticky-col second-col">類別</th>
              <th v-for="day in monthlyTableHeaders" :key="day" class="day-col">{{ day }}</th>
              <th class="total-col">月總計</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in monthlyTableRows"
              :key="rowIndex"
              :class="{ 'total-row': row.mode === '每日總計' }"
            >
              <td class="sticky-col first-col">{{ row.mode }}</td>
              <td class="sticky-col second-col">{{ row.status }}</td>
              <td v-for="(count, dayIndex) in row.dailyCounts" :key="dayIndex" class="day-col">
                {{ count > 0 ? count : '' }}
              </td>
              <td class="total-col">{{ row.monthlyTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 年度報表顯示區 -->
      <div
        v-else-if="reportType === 'yearly' && !noData"
        class="results-table-container yearly-report"
      >
        <h2>{{ reportTitle }}</h2>
        <table class="results-table yearly-table">
          <thead>
            <tr>
              <th>透析模式</th>
              <th>類別</th>
              <th v-for="header in yearlyTableHeaders" :key="header">{{ header }}</th>
              <th>年總計</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(row, rowIndex) in yearlyTableRows"
              :key="rowIndex"
              :class="{ 'total-row': row.mode === '每月總計' }"
            >
              <td>{{ row.mode }}</td>
              <td>{{ row.status }}</td>
              <td v-for="(count, monthIndex) in row.monthlyCounts" :key="monthIndex">
                {{ count > 0 ? count : '' }}
              </td>
              <td class="total-col">{{ row.yearlyTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="initial-state">
        <p>請選擇報表類型和日期，然後點擊「生成報表」。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.reporting-view-container {
  padding: 1.5rem;
  background-color: #f8f9fa;
  min-height: 100vh;
  box-sizing: border-box;
}
.page-title {
  font-size: 32px;
  font-weight: 600;
  color: #343a40;
  margin-bottom: 2rem;
  border-bottom: 2px solid #dee2e6;
  padding-bottom: 1rem;
}
.report-controls {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  background-color: #ffffff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
  flex-wrap: wrap;
}
.control-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.control-group label {
  font-size: 1.1rem;
  font-weight: 500;
  color: #495057;
  white-space: nowrap;
}
.control-group select,
.control-group input {
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
}
.generate-btn,
.export-btn {
  padding: 0.6rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.generate-btn {
  background-color: var(--primary-color, #007bff);
}
.export-btn {
  background-color: #28a745;
}
.generate-btn:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #0056b3);
}
.export-btn:hover:not(:disabled) {
  background-color: #218838;
}
.generate-btn:disabled,
.export-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
}
.report-results {
  background-color: #ffffff;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  min-height: 400px;
}
.report-results h2 {
  font-size: 1.8rem;
  margin-top: 0;
  margin-bottom: 1.5rem;
  color: #495057;
}
.loading-state,
.initial-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 300px;
  color: #6c757d;
  font-size: 1.2rem;
  text-align: center;
}
.results-table-container {
  max-width: 100%;
  overflow-x: auto;
}
.results-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 600px;
}
.results-table th,
.results-table td {
  border: 1px solid #dee2e6;
  padding: 0.8rem 0.5rem;
  text-align: center;
  white-space: nowrap;
}
.results-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  font-size: 1rem;
}
.results-table tbody tr:nth-child(even) {
  background-color: #f8f9fa;
}
.results-table .total-col {
  font-weight: bold;
}
.results-table .total-row {
  font-weight: bold;
  background-color: #e9ecef;
}

/* ================================== */
/* ‼️        主要的修正區域         ‼️ */
/* ================================== */

/* 將凍結欄位的樣式改為標準 CSS，並應用到所有表格 */
.daily-table th:first-child,
.daily-table td:first-child,
.yearly-table th:first-child,
.yearly-table td:first-child,
.monthly-table .first-col {
  position: sticky;
  left: 0;
  z-index: 10;
  min-width: 90px;
  border-right: 2px solid #ced4da;
}

.daily-table th:nth-child(2),
.daily-table td:nth-child(2),
.yearly-table th:nth-child(2),
.yearly-table td:nth-child(2),
.monthly-table .second-col {
  position: sticky;
  left: 90px; /* 等於第一欄的寬度 */
  z-index: 10;
  min-width: 80px;
  border-right: 2px solid #ced4da;
}

/* 統一 sticky 欄位的背景色 */
.results-table th.sticky-col,
.results-table thead th:first-child,
.results-table thead th:nth-child(2) {
  background-color: #f8f9fa;
  z-index: 20; /* 確保表頭在最上層 */
}

.results-table tbody tr:nth-child(odd) td:first-child,
.results-table tbody tr:nth-child(odd) td:nth-child(2) {
  background-color: #ffffff;
}
.results-table tbody tr:nth-child(even) td:first-child,
.results-table tbody tr:nth-child(even) td:nth-child(2) {
  background-color: #f0f3f5;
}

.results-table .total-row td:first-child,
.results-table .total-row td:nth-child(2),
.results-table .total-row .sticky-col {
  background-color: #e9ecef;
}

/* 月報表特有樣式 */
.monthly-table {
  min-width: 1200px;
}
.monthly-table .day-col {
  min-width: 35px;
}
.monthly-table .total-col {
  min-width: 60px;
}

/* ================================== */
/*         響應式樣式 (不變)          */
/* ================================== */
@media (max-width: 768px) {
  .reporting-view-container {
    padding: 1rem;
  }
  .page-title {
    font-size: 24px;
    margin-bottom: 1.5rem;
  }
  .report-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
    padding: 1rem;
  }
  .control-group {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    width: 100%;
  }
  .control-group label {
    font-size: 1rem;
  }
  .control-group select,
  .control-group input {
    width: 100%;
    box-sizing: border-box;
  }
  .generate-btn,
  .export-btn {
    width: 100%;
    font-size: 1.2rem;
    padding: 0.8rem;
  }
  .report-results {
    padding: 1rem;
  }
  .report-results h2 {
    font-size: 1.5rem;
  }
  .results-table {
    font-size: 0.9rem;
  }
  .results-table th,
  .results-table td {
    padding: 0.6rem 0.4rem;
  }
}
</style>
