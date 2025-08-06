<!-- 檔案路徑: src/components/PatientLabSummaryModal.vue (桌面版佈局優化後) -->
<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="handleClose">
    <div class="modal-container">
      <div class="modal-header">
        <h2>{{ patient?.name }} - 檢驗報告摘要</h2>
        <button @click="handleClose" class="close-btn">×</button>
      </div>

      <div class="modal-body">
        <div v-if="isLoading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>正在分析檢驗數據...</p>
        </div>

        <div v-else-if="error" class="error-state">
          <p>⚠️ 載入失敗: {{ error }}</p>
          <button @click="fetchLabData">重試</button>
        </div>

        <div v-else-if="reportMonths.length === 0" class="empty-state">
          <p>找不到該病人的檢驗報告資料。</p>
        </div>

        <!-- ✨ 1. 修改 template 結構 ✨ -->
        <div v-else class="content-grid">
          <!-- (A) 新增一個 top-panel 容器，包裹摘要和處置 -->
          <div class="top-panel">
            <div class="summary-section">
              <h3>數據判讀摘要 ({{ latestMonth }})</h3>
              <div class="summary-item">
                <strong>本月不合格項目:</strong>
                <ul v-if="analysisResults.nonCompliantItems.length > 0">
                  <li v-for="item in analysisResults.nonCompliantItems" :key="item.key">
                    {{ labItemDisplayNames[item.key] || item.key }}:
                    <span :class="item.class">{{ item.value }}</span> ({{ item.reason }})
                  </li>
                </ul>
                <p v-else>無</p>
              </div>
              <div class="summary-item">
                <strong>連續三個月趨勢異常:</strong>
                <ul v-if="analysisResults.trendItems.length > 0">
                  <li v-for="item in analysisResults.trendItems" :key="item.key">
                    {{ labItemDisplayNames[item.key] || item.key }} ({{ item.reason }})
                  </li>
                </ul>
                <p v-else>無</p>
              </div>
            </div>

            <div class="action-section">
              <h3>處置與計畫</h3>
              <textarea
                v-model="dispositionText"
                placeholder="請根據以上摘要，輸入處置或醫囑調整..."
              ></textarea>
              <button @click="handleSave" :disabled="isSubmitting || !dispositionText.trim()">
                {{ isSubmitting ? '儲存中...' : '儲存為病情紀錄' }}
              </button>
            </div>
          </div>

          <!-- (B) 表格面板現在是 content-grid 的第二個子元素 -->
          <div class="table-panel">
            <h3>歷次檢驗數據</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th v-for="itemKey in prioritizedLabItems" :key="itemKey">
                      {{ labItemDisplayNames[itemKey] || itemKey }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="month in reportMonths" :key="month">
                    <td>{{ month }}</td>
                    <td v-for="itemKey in prioritizedLabItems" :key="itemKey">
                      <span
                        v-if="processedReports[itemKey]?.[month] !== undefined"
                        :class="getAbnormalClass(itemKey, processedReports[itemKey][month])"
                      >
                        {{ processedReports[itemKey][month] }}
                        <span :class="getTrendArrow(itemKey, month).class">{{
                          getTrendArrow(itemKey, month).arrow
                        }}</span>
                      </span>
                      <span v-else>-</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy } from 'firebase/firestore'

// --- Props & Emits ---
const props = defineProps({
  isVisible: Boolean,
  patient: Object,
})
const emit = defineEmits(['close', 'save-record'])

// --- API & Constants ---
const labReportsApi = ApiManager('lab_reports')
const prioritizedLabItems = [
  'WBC',
  'Platelet',
  'Hb',
  'Hct',
  'Ferritin',
  'Iron',
  'TIBC',
  'TSAT',
  'GlucoseAC',
  'Albumin',
  'Na',
  'K',
  'P',
  'Ca',
  'CaXP',
  'iPTH',
  'BUN',
  'PostBUN',
  'Creatinine',
  'Kt/V',
  'URR',
]
const labItemDisplayNames = {
  Creatinine: 'Cr',
  Albumin: 'ALB',
  GlucoseAC: 'Glucose',
  PostBUN: 'Post-BUN',
  CaXP: 'Ca x P',
  'Kt/V': 'Kt/V',
  URR: 'URR (%)',
  TSAT: 'TSAT (%)',
}
const LAB_REFERENCE_RANGES = {
  WBC: { min: 4.0, max: 10.0 },
  Hb: { min: 10 },
  P: { max: 5.5 },
  Albumin: { min: 3.5 },
  'Kt/V': { min: 1.2 },
  URR: { min: 65 },
  iPTH: { min: 150, max: 300 },
  Ca: { min: 8.5, max: 10.5 },
  K: { min: 3.5, max: 5.5 },
}

// --- Component State ---
const isLoading = ref(false)
const isSubmitting = ref(false)
const error = ref(null)
const rawReports = ref([])
const dispositionText = ref('')

// --- Computed Properties ---
const processedReports = computed(() => {
  const data = {}
  rawReports.value.forEach((report) => {
    const monthKey = report.reportDate.slice(0, 7)
    for (const itemKey in report.data) {
      if (!data[itemKey]) data[itemKey] = {}
      if (!data[itemKey][monthKey]) {
        data[itemKey][monthKey] = report.data[itemKey]
      }
    }
  })
  for (const monthKey of reportMonths.value) {
    const bun = data['BUN']?.[monthKey]
    const postBun = data['PostBUN']?.[monthKey]
    const iron = data['Iron']?.[monthKey]
    const tibc = data['TIBC']?.[monthKey]
    const ca = data['Ca']?.[monthKey]
    const p = data['P']?.[monthKey]

    if (bun !== undefined && postBun !== undefined && postBun > 0 && bun > 0) {
      if (!data['URR']) data['URR'] = {}
      if (!data['Kt/V']) data['Kt/V'] = {}
      data['URR'][monthKey] = (((bun - postBun) / bun) * 100).toFixed(1)
      data['Kt/V'][monthKey] = Math.log(bun / postBun).toFixed(2)
    }
    if (iron !== undefined && tibc !== undefined && tibc > 0) {
      if (!data['TSAT']) data['TSAT'] = {}
      data['TSAT'][monthKey] = ((iron / tibc) * 100).toFixed(1)
    }
    if (ca !== undefined && p !== undefined) {
      if (!data['CaXP']) data['CaXP'] = {}
      data['CaXP'][monthKey] = (ca * p).toFixed(2)
    }
  }
  return data
})
const reportMonths = computed(() => {
  const monthSet = new Set()
  rawReports.value.forEach((r) => monthSet.add(r.reportDate.slice(0, 7)))
  return Array.from(monthSet).sort().reverse()
})
const latestMonth = computed(() => reportMonths.value[0] || '')
const analysisResults = computed(() => {
  const results = { nonCompliantItems: [], trendItems: [] }
  if (!latestMonth.value) return results
  for (const key in processedReports.value) {
    const value = processedReports.value[key][latestMonth.value]
    if (value === undefined) continue
    const range = LAB_REFERENCE_RANGES[key]
    if (!range) continue
    if (range.min !== undefined && value < range.min) {
      results.nonCompliantItems.push({ key, value, reason: '偏低', class: 'value-low' })
    } else if (range.max !== undefined && value > range.max) {
      results.nonCompliantItems.push({ key, value, reason: '偏高', class: 'value-high' })
    }
  }
  if (reportMonths.value.length < 3) return results
  const last3Months = reportMonths.value.slice(0, 3)
  for (const key in processedReports.value) {
    const val1 = processedReports.value[key][last3Months[0]]
    const val2 = processedReports.value[key][last3Months[1]]
    const val3 = processedReports.value[key][last3Months[2]]
    if (val1 === undefined || val2 === undefined || val3 === undefined) continue
    if (val1 > val2 && val2 > val3) results.trendItems.push({ key, reason: '連續上升' })
    if (val1 < val2 && val2 < val3) results.trendItems.push({ key, reason: '連續下降' })
    const range = LAB_REFERENCE_RANGES[key]
    if (range) {
      const isAbnormal = (v) =>
        (range.min !== undefined && v < range.min) || (range.max !== undefined && v > range.max)
      if (isAbnormal(val1) && isAbnormal(val2) && isAbnormal(val3)) {
        if (!results.trendItems.some((item) => item.key === key)) {
          results.trendItems.push({ key, reason: '連續超標' })
        }
      }
    }
  }
  return results
})

// --- Methods ---
async function fetchLabData() {
  if (!props.patient?.id) return
  isLoading.value = true
  error.value = null
  try {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const reports = await labReportsApi.fetchAll([
      where('patientId', '==', props.patient.id),
      where('reportDate', '>=', oneYearAgo),
      orderBy('reportDate', 'desc'),
    ])
    rawReports.value = reports.map((r) => ({
      ...r,
      reportDate: r.reportDate.toDate
        ? r.reportDate.toDate().toISOString().slice(0, 10)
        : r.reportDate,
    }))
  } catch (err) {
    console.error('獲取檢驗報告失敗:', err)
    error.value = err.message
  } finally {
    isLoading.value = false
  }
}
function handleClose() {
  emit('close')
}
function handleSave() {
  isSubmitting.value = true
  let autoContent = `【檢驗報告處置 - ${latestMonth.value}】\n\n摘要：\n`
  if (analysisResults.value.nonCompliantItems.length > 0) {
    autoContent += ` • 本月不合格項目:\n`
    analysisResults.value.nonCompliantItems.forEach((item) => {
      autoContent += `   - ${labItemDisplayNames[item.key] || item.key}: ${item.value} (${item.reason})\n`
    })
  }
  if (analysisResults.value.trendItems.length > 0) {
    autoContent += ` • 連續三個月趨勢異常:\n`
    analysisResults.value.trendItems.forEach((item) => {
      autoContent += `   - ${labItemDisplayNames[item.key] || item.key} (${item.reason})\n`
    })
  }
  autoContent += `\n處置與計畫：\n${dispositionText.value.trim()}`
  emit('save-record', {
    patient: props.patient,
    content: autoContent,
  })
  setTimeout(() => {
    isSubmitting.value = false
    dispositionText.value = ''
    handleClose()
  }, 300)
}
function getAbnormalClass(itemKey, value) {
  const range = LAB_REFERENCE_RANGES[itemKey]
  if (!range || value === undefined) return ''
  if (range.min !== undefined && value < range.min) return 'value-low'
  if (range.max !== undefined && value > range.max) return 'value-high'
  return ''
}
function getTrendArrow(itemKey, month) {
  const currentMonthIndex = reportMonths.value.indexOf(month)
  if (currentMonthIndex >= reportMonths.value.length - 1) return { arrow: '', class: '' }
  const prevMonth = reportMonths.value[currentMonthIndex + 1]
  const currentValue = processedReports.value[itemKey]?.[month]
  const prevValue = processedReports.value[itemKey]?.[prevMonth]
  if (currentValue === undefined || prevValue === undefined) return { arrow: '', class: '' }
  if (currentValue > prevValue) return { arrow: '▲', class: 'value-high' }
  if (currentValue < prevValue) return { arrow: '▼', class: 'value-low' }
  return { arrow: '', class: '' }
}

// --- Watcher ---
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      rawReports.value = []
      dispositionText.value = ''
      fetchLabData()
    }
  },
)
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-container {
  background-color: #f8f9fa;
  border-radius: 12px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 1000px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #343a40;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  font-weight: bold;
  cursor: pointer;
  color: #6c757d;
}
.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex-grow: 1;
}
.loading-state,
.empty-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #6c757d;
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
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

/* ✨ 2. 修改 CSS 樣式 ✨ */
.content-grid {
  display: flex; /* 主佈局改為垂直堆疊 */
  flex-direction: column;
  gap: 1.5rem;
}

/* 新增：頂部面板，用於並排顯示摘要和處置 */
.top-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  flex-shrink: 0; /* 防止被壓縮 */
}

.summary-section,
.action-section {
  background-color: #fff;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #495057;
  font-size: 1.1rem;
  border-bottom: 1px solid #f1f3f5;
  padding-bottom: 0.5rem;
}

.summary-item {
  margin-bottom: 1rem;
}
.summary-item strong {
  color: #212529;
}
.summary-item ul {
  list-style-type: none;
  padding-left: 0.5rem;
  margin: 0.5rem 0 0 0;
  font-size: 0.95rem;
}
.summary-item li {
  margin-bottom: 0.25rem;
}

.action-section {
  display: flex;
  flex-direction: column;
}

.action-section textarea {
  width: 100%;
  flex-grow: 1; /* 讓 text area 填滿剩餘空間 */
  min-height: 100px;
  padding: 0.5rem;
  border-radius: 6px;
  border: 1px solid #ced4da;
  font-size: 0.95rem;
  resize: vertical;
  margin-bottom: 1rem;
}
.action-section button {
  width: 100%;
  padding: 0.75rem;
  background-color: #28a745;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
  flex-shrink: 0; /* 按鈕不壓縮 */
}
.action-section button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.table-panel {
  display: flex;
  flex-direction: column;
  min-height: 0; /* 確保在 flex 容器中可以縮小 */
}
.table-container {
  flex-grow: 1;
  overflow: auto; /* 讓表格自己滾動 */
  border: 1px solid #dee2e6;
  border-radius: 8px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.75rem;
  text-align: center;
  white-space: nowrap;
  border: 1px solid #e9ecef;
}
th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
tbody tr:nth-child(even) {
  background-color: #f8f9fa;
}
td:first-child,
th:first-child {
  position: sticky;
  left: 0;
  background-color: #f8f9fa;
  font-weight: bold;
  z-index: 2; /* 比表頭的 z-index 高 */
}
thead th:first-child {
  z-index: 3; /* 確保左上角單元格在最上層 */
}
tbody tr:nth-child(even) td:first-child {
  background-color: #f0f3f5;
}

.value-high {
  color: #dc3545;
  font-weight: bold;
}
.value-low {
  color: #007bff;
  font-weight: bold;
}

@media (max-width: 992px) {
  .modal-container {
    width: 95%;
  }
  /* 在手機上，讓頂部面板也堆疊起來 */
  .top-panel {
    grid-template-columns: 1fr;
  }
  .table-panel {
    order: -1;
    margin-bottom: 1.5rem;
  }
}
</style>
