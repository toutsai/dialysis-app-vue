<!-- 檔案路徑: src/components/PatientLabSummaryModal.vue -->
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

        <div v-else class="content-grid">
          <!-- 上半部: 數據判讀與處置 -->
          <div class="summary-and-action-panel">
            <div class="summary-section">
              <h3>數據判讀摘要 ({{ latestMonth }})</h3>
              <div class="summary-item">
                <strong>本月不合格項目:</strong>
                <ul v-if="analysisResults.nonCompliantItems.length > 0">
                  <li v-for="item in analysisResults.nonCompliantItems" :key="item.key">
                    {{ item.key }}: <span :class="item.class">{{ item.value }}</span> ({{
                      item.reason
                    }})
                  </li>
                </ul>
                <p v-else>無</p>
              </div>
              <div class="summary-item">
                <strong>連續三個月趨勢異常:</strong>
                <ul v-if="analysisResults.trendItems.length > 0">
                  <li v-for="item in analysisResults.trendItems" :key="item.key">
                    {{ item.key }} ({{ item.reason }})
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

          <!-- 下半部: 歷次檢驗表格 -->
          <div class="table-panel">
            <h3>歷次檢驗數據</h3>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>月份</th>
                    <th v-for="itemKey in prioritizedLabItems" :key="itemKey">
                      <!-- ✨ 使用 labItemDisplayNames 來顯示別名 -->
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
// ✨ 1. 修正並補完檢驗項目列表 (使用資料庫原始鍵名)
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

// ✨ 2. 新增顯示名稱對應表 (從 LabReportView 移植過來)
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

// ✨ 3. 修正正常值參考範圍 (使用資料庫原始鍵名)
const LAB_REFERENCE_RANGES = {
  WBC: { min: 4.0, max: 10.0 },
  Hb: { min: 10 },
  P: { max: 5.5 },
  Albumin: { min: 3.5 }, // 使用 'Albumin' 而不是 'ALB'
  'Kt/V': { min: 1.2 },
  URR: { min: 65 }, // 使用 'URR' 而不是 'URR (%)'
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

  // ✨ 4. 修正計算欄位邏輯 (使用原始鍵名)
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

  // 1. 分析本月不合格項目
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

  // 2. 分析連續三個月趨勢
  if (reportMonths.value.length < 3) return results
  const last3Months = reportMonths.value.slice(0, 3)

  for (const key in processedReports.value) {
    const val1 = processedReports.value[key][last3Months[0]] // 最新
    const val2 = processedReports.value[key][last3Months[1]]
    const val3 = processedReports.value[key][last3Months[2]]

    if (val1 === undefined || val2 === undefined || val3 === undefined) continue

    // 連續上升或下降
    if (val1 > val2 && val2 > val3) results.trendItems.push({ key, reason: '連續上升' })
    if (val1 < val2 && val2 < val3) results.trendItems.push({ key, reason: '連續下降' })

    // 連續不合格
    const range = LAB_REFERENCE_RANGES[key]
    if (range) {
      const isAbnormal = (v) =>
        (range.min !== undefined && v < range.min) || (range.max !== undefined && v > range.max)
      if (isAbnormal(val1) && isAbnormal(val2) && isAbnormal(val3)) {
        if (!results.trendItems.some((item) => item.key === key)) {
          // 避免重複
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

  // 自動生成內容
  let autoContent = `【檢驗報告處置 - ${latestMonth.value}】\n\n摘要：\n`
  if (analysisResults.value.nonCompliantItems.length > 0) {
    autoContent += ` • 本月不合格項目:\n`
    analysisResults.value.nonCompliantItems.forEach((item) => {
      autoContent += `   - ${item.key}: ${item.value} (${item.reason})\n`
    })
  }
  if (analysisResults.value.trendItems.length > 0) {
    autoContent += ` • 連續三個月趨勢異常:\n`
    analysisResults.value.trendItems.forEach((item) => {
      autoContent += `   - ${item.key} (${item.reason})\n`
    })
  }
  autoContent += `\n處置與計畫：\n${dispositionText.value.trim()}`

  // 透過 emit 將整理好的內容傳遞給父元件
  emit('save-record', {
    patient: props.patient,
    content: autoContent,
  })

  // 延遲關閉，讓父元件有時間處理
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
      // 重置狀態
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

.content-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 1.5rem;
}

.summary-and-action-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
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
}
.summary-item li {
  margin-bottom: 0.25rem;
}

.action-section textarea {
  width: 100%;
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
}
.action-section button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.table-panel {
  display: flex;
  flex-direction: column;
}
.table-container {
  flex-grow: 1;
  overflow-x: auto;
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
  .content-grid {
    grid-template-columns: minmax(0, 100%); /* <--- 修改成這一行 */
  }
  .table-panel {
    order: -1; /* 將表格移到最上面 */
    margin-bottom: 1.5rem;
  }
}
</style>
