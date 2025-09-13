<!-- 檔案路徑: src/components/PatientLabSummaryPanel.vue (已更新顯示項目) -->
<template>
  <div class="panel-container">
    <div class="controls-header">
      <div class="year-selector">
        <button @click="changeYear(-1)">&lt; 上一年</button>
        <span class="current-year">{{ displayYear }} 年</span>
        <button @click="changeYear(1)">下一年 &gt;</button>
      </div>
      <div class="notes-section">
        <textarea
          v-model="analysisText"
          rows="2"
          placeholder="此處可記錄對此病患報告的綜合分析..."
        ></textarea>
        <button @click="saveRecord" :disabled="isSaving">
          {{ isSaving ? '儲存中...' : '儲存分析紀錄' }}
        </button>
      </div>
    </div>

    <div class="table-wrapper">
      <div v-if="isLoading" class="loading-state">
        <div class="loading-spinner"></div>
        正在載入 {{ displayYear }} 年的報告...
      </div>
      <div v-else-if="reportColumns.length === 0" class="empty-state">
        {{ displayYear }} 年查無任何檢驗報告。
      </div>
      <table v-else>
        <thead>
          <tr>
            <th class="sticky-col">月份</th>
            <!-- ✨ 1. 表頭已根據新的 prioritizedLabItems 自動更新 -->
            <th v-for="itemKey in prioritizedLabItems" :key="itemKey">
              {{ labItemDisplayNames[itemKey] || itemKey }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="month in reportColumns" :key="month">
            <td class="sticky-col">{{ month }}</td>
            <!-- ✨ 2. 表格內容也已自動更新 -->
            <td v-for="itemKey in prioritizedLabItems" :key="itemKey">
              {{ reportData[itemKey]?.[month] || '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, collection, getDocs, query as firestoreQuery } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

// --- Props and Emits ---
const props = defineProps({
  patient: {
    type: Object,
    required: true,
  },
})
const emit = defineEmits(['save-record'])

// --- State ---
const isLoading = ref(false)
const isSaving = ref(false)
const displayYear = ref(new Date().getFullYear())
const reportData = ref({})
const reportColumns = ref([])
const analysisText = ref('')

const labReportsApi = ApiManager('lab_reports')
const patientHistoryApi = ApiManager('patient_history')

// --- ✨ 3. 核心修改：從 LabReportView.vue 複製過來的常數 ---
const prioritizedLabItems = [
  'WBC',
  'Platelet',
  'Hb',
  // 'Hct', // 移除
  'Ferritin',
  // 'Iron', // 移除
  // 'TIBC', // 移除
  'TSAT',
  'GlucoseAC',
  'Triglyceride', // 新增
  'LDL', // 新增
  'Albumin',
  'ALT', // 新增
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
  BUN: 'BUN',
  Creatinine: 'Cr',
  Albumin: 'ALB',
  P: 'P',
  Ca: 'Ca',
  Hb: 'Hb',
  Hct: 'Hct',
  Platelet: 'PLT',
  WBC: 'WBC',
  Na: 'Na',
  K: 'K',
  eGFR: 'eGFR',
  GlucoseAC: 'Glucose',
  TotalProtein: 'Total Protein',
  Iron: 'Fe',
  TIBC: 'TIBC',
  Ferritin: 'Ferritin',
  iPTH: 'iPTH',
  PostBUN: 'Post-BUN',
  CaXP: 'Ca x P',
  'Kt/V': 'Kt/V',
  URR: 'URR (%)',
  TSAT: 'TSAT (%)',
  // ✨ 4. 新增 TG, LDL, ALT 的顯示名稱
  Triglyceride: 'TG',
  LDL: 'LDL',
  ALT: 'ALT',
}
// --- ✨ 修改結束 ---

// --- Methods ---
async function fetchLabReports() {
  if (!props.patient?.id) {
    reportData.value = {}
    reportColumns.value = []
    return
  }
  isLoading.value = true
  try {
    const year = displayYear.value
    const startDate = new Date(year, 0, 1)
    const endDate = new Date(year + 1, 0, 1)

    const reportsRef = collection(db, 'lab_reports')
    const q = firestoreQuery(
      reportsRef,
      where('patientId', '==', props.patient.id),
      where('reportDate', '>=', startDate),
      where('reportDate', '<', endDate),
      orderBy('reportDate', 'desc'),
    )
    const querySnapshot = await getDocs(q)
    const reportsRaw = []
    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.reportDate?.toDate)
        data.reportDate = data.reportDate.toDate().toISOString().slice(0, 10)
      reportsRaw.push({ id: doc.id, ...data })
    })

    // --- Process data (和 LabReportView 邏輯相同) ---
    const processedData = {}
    const monthSet = new Set()
    for (let i = 1; i <= 12; i++) {
      monthSet.add(`${year}-${String(i).padStart(2, '0')}`)
    }

    reportsRaw.forEach((report) => {
      const monthKey = report.reportDate.slice(0, 7)
      const labData = report.data
      for (const itemKey in labData) {
        if (!processedData[itemKey]) {
          processedData[itemKey] = {}
        }
        if (!processedData[itemKey][monthKey]) {
          processedData[itemKey][monthKey] = labData[itemKey]
        }
      }
    })

    for (const monthKey of monthSet) {
      const bun = processedData['BUN']?.[monthKey]
      const postBun = processedData['PostBUN']?.[monthKey]
      const ca = processedData['Ca']?.[monthKey]
      const p = processedData['P']?.[monthKey]
      const iron = processedData['Iron']?.[monthKey]
      const tibc = processedData['TIBC']?.[monthKey]
      if (ca && p) {
        if (!processedData['CaXP']) processedData['CaXP'] = {}
        processedData['CaXP'][monthKey] = (ca * p).toFixed(2)
      }
      if (iron && tibc > 0) {
        if (!processedData['TSAT']) processedData['TSAT'] = {}
        processedData['TSAT'][monthKey] = ((iron / tibc) * 100).toFixed(1)
      }
      if (bun && postBun > 0) {
        if (!processedData['URR']) processedData['URR'] = {}
        if (!processedData['Kt/V']) processedData['Kt/V'] = {}
        processedData['URR'][monthKey] = (((bun - postBun) / bun) * 100).toFixed(1)
        processedData['Kt/V'][monthKey] = Math.log(bun / postBun).toFixed(2)
      }
    }

    reportData.value = processedData
    reportColumns.value = Array.from(monthSet).sort().reverse()
  } catch (error) {
    console.error(`獲取病人 ${props.patient.id} 的報告失敗:`, error)
    reportData.value = {}
    reportColumns.value = []
  } finally {
    isLoading.value = false
  }
}

function changeYear(offset) {
  displayYear.value += offset
  fetchLabReports()
}

async function saveRecord() {
  if (!analysisText.value.trim() || !props.patient?.id) {
    alert('請輸入分析內容。')
    return
  }
  isSaving.value = true
  try {
    const payload = {
      patientId: props.patient.id,
      patientName: props.patient.name,
      recordType: 'LabSummaryAnalysis',
      content: analysisText.value.trim(),
    }
    emit('save-record', payload) // 觸發事件，交給父元件處理
  } catch (error) {
    console.error('儲存分析紀錄失敗:', error)
    alert('儲存失敗，請稍後再試。')
  } finally {
    isSaving.value = false
  }
}

// --- Watchers ---
watch(
  () => props.patient,
  (newPatient) => {
    if (newPatient?.id) {
      displayYear.value = new Date().getFullYear() // 每次打開都重置為當年
      analysisText.value = '' // 清空上次的紀錄
      fetchLabReports()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
/* 這是一個獨立的 Panel，可以擁有自己的完整樣式 */
.panel-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
  min-height: 0; /* 允許在 flex 佈局中被壓縮 */
}

.controls-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.year-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.year-selector button {
  padding: 0.4rem 0.8rem;
  border: 1px solid #ccc;
  background-color: #fff;
  border-radius: 4px;
  cursor: pointer;
}
.current-year {
  font-weight: bold;
  font-size: 1.2rem;
  width: 90px;
  text-align: center;
}

.notes-section {
  display: flex;
  gap: 0.5rem;
  flex-grow: 1;
}
.notes-section textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
}
.notes-section button {
  padding: 0.5rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}
.notes-section button:disabled {
  background-color: #6c757d;
}

.table-wrapper {
  flex-grow: 1;
  overflow: auto; /* ✨ 關鍵：讓表格自身可以滾動 */
  margin-top: 1rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: #6c757d;
  font-size: 1.1rem;
}
.loading-spinner {
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  width: 40px;
  height: 40px;
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

table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  padding: 0.75rem;
  border: 1px solid #e9ecef;
  text-align: center;
  white-space: nowrap;
}
th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
}
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: #f8f9fa; /* 表頭背景 */
  font-weight: bold;
}
tbody .sticky-col {
  background-color: #fff; /* 表格內容背景 */
}
tbody tr:nth-child(even) {
  background-color: #f8f9fa;
}
tbody tr:nth-child(even) .sticky-col {
  background-color: #f8f9fa;
}

/* 行動版響應式 */
@media (max-width: 992px) {
  .controls-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .table-wrapper {
    border: none;
  }
  th,
  td {
    font-size: 0.8rem;
    padding: 0.5rem;
  }
}
</style>
