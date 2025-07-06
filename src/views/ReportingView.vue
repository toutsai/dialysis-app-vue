<script setup>
// ... 其他 script 內容保持不變，此處省略 ...
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
const isLoading = ref(false)
const reportDateRange = ref({ start: '', end: '' })
const dailyTableHeaders = ref([])
const dailyTableRows = ref([])
const monthlyTableHeaders = ref([])
const monthlyTableRows = ref([])

const reportTitle = computed(() => {
  if (reportDateRange.value.start === '') return '統計結果'
  const { start, end } = reportDateRange.value
  if (start === end) {
    return `${start} 日報表`
  }
  return `${start} 至 ${end} 月報表`
})

const noData = computed(() => {
  if (reportType.value === 'daily') return dailyTableRows.value.length === 0
  if (reportType.value === 'monthly') return monthlyTableRows.value.length === 0
  return true
})

async function generateReport() {
  if (
    (reportType.value === 'daily' && !selectedDate.value) ||
    (reportType.value === 'monthly' && !selectedMonth.value)
  ) {
    alert('請先選擇日期或月份！')
    return
  }
  isLoading.value = true
  dailyTableHeaders.value = []
  dailyTableRows.value = []
  monthlyTableHeaders.value = []
  monthlyTableRows.value = []

  try {
    let startDate, endDate
    if (reportType.value === 'daily') {
      startDate = selectedDate.value
      endDate = selectedDate.value
    } else {
      const year = parseInt(selectedMonth.value.split('-')[0], 10)
      const month = parseInt(selectedMonth.value.split('-')[1], 10) - 1
      const firstDay = new Date(year, month, 1)
      const lastDay = new Date(year, month + 1, 0)
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
    } else {
      processMonthlyReport(schedulesData, patientMap, startDate)
    }
  } catch (error) {
    console.error('生成報表失敗:', error)
    alert('生成報表時發生錯誤，請檢查主控台訊息。')
  } finally {
    isLoading.value = false
  }
}
// 【核心修改】更新 exportToExcel 函數
function exportToExcel() {
  if (noData.value) {
    alert('沒有可匯出的數據！')
    return
  }

  let headers, dataRows, filename, excelTitle

  // 獲取我們在 computed property 中計算好的標題
  excelTitle = reportTitle.value

  if (reportType.value === 'daily') {
    headers = ['透析模式', '類別', ...dailyTableHeaders.value, '當日總計']
    dataRows = dailyTableRows.value.map((row) => {
      return [row.mode, row.status, ...row.shiftCounts, row.dailyTotal]
    })
    filename = `日報表_${selectedDate.value}.xlsx`
  } else {
    headers = ['透析模式', '類別', ...monthlyTableHeaders.value, '月總計']
    dataRows = monthlyTableRows.value.map((row) => {
      return [row.mode, row.status, ...row.dailyCounts, row.monthlyTotal]
    })
    filename = `月報表_${selectedMonth.value}.xlsx`
  }

  // 準備要寫入 Excel 的最終數據陣列
  // 第一行是標題，第二行是空行，第三行是表頭，後面是數據
  const titleRow = [excelTitle]
  const emptyRow = [] // 用於製造間隔
  const data = [titleRow, emptyRow, headers, ...dataRows]

  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(data)

  // --- 【新增】處理單元格合併 ---
  // 合併標題行。它從 A1 單元格開始，合併的列數等於表頭的長度
  const merge = {
    s: { r: 0, c: 0 }, // s = start, r = row, c = column (0-indexed)
    e: { r: 0, c: headers.length - 1 }, // e = end
  }

  if (!worksheet['!merges']) worksheet['!merges'] = []
  worksheet['!merges'].push(merge)

  // --- 【可選】設置標題單元格的樣式 (置中) ---
  if (worksheet['A1']) {
    worksheet['A1'].s = {
      alignment: {
        horizontal: 'center',
        vertical: 'center',
      },
    }
  }

  XLSX.utils.book_append_sheet(workbook, worksheet, '報表')
  XLSX.writeFile(workbook, filename)
}

// ... processDailyReport 和 processMonthlyReport 保持不變 ...
function processDailyReport(schedulesData, patientMap) {
  const shiftBreakdown = {}
  const dailyRecord = schedulesData[0]
  if (dailyRecord && dailyRecord.schedule) {
    for (const slotData of Object.values(dailyRecord.schedule)) {
      if (!slotData?.patientId || !slotData.shiftId) continue
      const patient = patientMap.get(slotData.patientId)
      if (!patient) continue
      const shiftCode = slotData.shiftId.split('-')[2]
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
  const statusDisplay = { opd: '門診', ipd: '住院', unknown: '未知' }
  shiftOrder.forEach((shiftCode, shiftIndex) => {
    const shiftData = shiftBreakdown[shiftCode] || {}
    for (const comboKey in shiftData) {
      if (!reportMatrix[comboKey]) {
        const [mode, status] = comboKey.split('-')
        reportMatrix[comboKey] = {
          mode: mode,
          status: statusDisplay[status],
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
  const statusDisplay = { opd: '門診', ipd: '住院', unknown: '未知' }
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day))
    const dayData = dailyBreakdown[dateStr] || {}
    for (const comboKey in dayData) {
      if (!reportMatrix[comboKey]) {
        const [mode, status] = comboKey.split('-')
        reportMatrix[comboKey] = {
          mode: mode,
          status: statusDisplay[status],
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
</script>

<template>
  <!-- template 部分保持不變 -->
  <div class="reporting-view-container">
    <h1 class="page-title">統計報表生成</h1>

    <div class="report-controls">
      <div class="control-group">
        <label for="report-type">報表類型：</label>
        <select id="report-type" v-model="reportType">
          <option value="daily">日報表</option>
          <option value="monthly">月報表</option>
        </select>
      </div>
      <div class="control-group">
        <label v-if="reportType === 'daily'" for="report-date">選擇日期：</label>
        <input v-if="reportType === 'daily'" id="report-date" type="date" v-model="selectedDate" />
        <label v-if="reportType === 'monthly'" for="report-month">選擇月份：</label>
        <input
          v-if="reportType === 'monthly'"
          id="report-month"
          type="month"
          v-model="selectedMonth"
        />
      </div>
      <button class="generate-btn" @click="generateReport" :disabled="isLoading">
        {{ isLoading ? '生成中...' : '生成報表' }}
      </button>
      <!-- 【新增】匯出按鈕 -->
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

      <div v-else class="initial-state">
        <p>請選擇報表類型和日期，然後點擊「生成報表」。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* style 部分保持不變 */
.reporting-view-container {
  padding: 1.5rem;
  background-color: #f8f9fa;
  height: 100%;
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
}
.control-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.control-group label {
  font-size: 1.1rem;
  font-weight: 500;
  color: #495057;
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
}
.results-table-container {
  display: inline-block;
  max-width: 100%;
}
.results-table {
  width: 100%;
  border-collapse: collapse;
}
.results-table th,
.results-table td {
  border: 1px solid #dee2e6;
  padding: 0.8rem 0.5rem;
  text-align: center;
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

.daily-table th:first-child,
.daily-table td:first-child,
.daily-table th:nth-child(2),
.daily-table td:nth-child(2) {
  background-color: #f8f9fa;
  min-width: 90px;
}
.daily-table tbody tr:nth-child(even) td:first-child,
.daily-table tbody tr:nth-child(even) td:nth-child(2) {
  background-color: #f0f3f5;
}
.daily-table .total-row td {
  background-color: #e9ecef;
}

.monthly-report {
  overflow-x: auto;
}
.monthly-table {
  width: max-content;
  min-width: 100%;
}
.monthly-table th,
.monthly-table td {
  white-space: nowrap;
}
.monthly-table .day-col {
  min-width: 35px;
}
.monthly-table .total-col {
  min-width: 60px;
}
.monthly-table .sticky-col {
  position: sticky;
  left: 0;
  z-index: 10;
  border-right: 2px solid #ced4da;
}
.monthly-table .first-col {
  width: 100px;
}
.monthly-table .second-col {
  width: 80px;
  left: 100px;
}
.monthly-table thead .sticky-col {
  z-index: 20;
  background-color: #f8f9fa;
}
.monthly-table .total-row .sticky-col {
  background-color: #e9ecef;
}
.monthly-table tbody tr:nth-child(odd) .sticky-col {
  background-color: #ffffff;
}
.monthly-table tbody tr:nth-child(even) .sticky-col {
  background-color: #f8f9fa;
}
</style>
