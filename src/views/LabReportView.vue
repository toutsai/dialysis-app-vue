<!-- 檔案路徑: src/views/LabReportView.vue (請用此程式碼完整替換) -->
<template>
  <div class="page-container">
    <header class="page-header">
      <h1>檢驗報告管理</h1>
      <p class="page-description">匯入批次檢驗報告，並提供多維度的查詢與檢視功能。</p>
    </header>

    <!-- 頁籤導覽 -->
    <div class="tabs-navigation">
      <button :class="{ active: activeTab === 'query' }" @click="activeTab = 'query'">
        報告查詢
      </button>
      <button :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
        資料上傳
      </button>
    </div>

    <!-- 頁籤內容面板 -->
    <main class="page-main-content">
      <!-- 報告查詢頁籤 -->
      <div v-show="activeTab === 'query'" class="tab-panel query-panel">
        <div class="search-controls">
          <div class="search-field">
            <label for="search-type">查詢模式:</label>
            <select id="search-type" v-model="searchType">
              <option value="group">依群組查詢</option>
              <option value="individual">依個人查詢</option>
            </select>
          </div>

          <div v-if="searchType === 'group'" class="filter-wrapper">
            <div class="group-filters">
              <div class="search-field">
                <label for="group-freq">頻率:</label>
                <select id="group-freq" v-model="groupSearchParams.freq">
                  <option v-for="freq in freqOptions" :key="freq" :value="freq">{{ freq }}</option>
                </select>
              </div>
              <div class="search-field">
                <label for="group-shift">班別:</label>
                <select id="group-shift" v-model="groupSearchParams.shift">
                  <option value="early">早班</option>
                  <option value="noon">午班</option>
                  <option value="late">晚班</option>
                </select>
              </div>
              <div class="search-field">
                <label for="group-month">月份:</label>
                <input type="month" id="group-month" v-model="groupSearchParams.month" />
              </div>
            </div>
            <button @click="handleSearch" :disabled="isLoadingReports" class="search-btn">
              {{ isLoadingReports ? '查詢中...' : '查詢報告' }}
            </button>
          </div>

          <div v-if="searchType === 'individual'" class="filter-wrapper">
            <div class="individual-filters">
              <div class="search-field">
                <label>病人 (姓名/病歷號):</label>
                <input
                  type="text"
                  v-model="individualSearchQuery"
                  @keyup.enter="handleSearch"
                  placeholder="輸入後按 Enter..."
                />
              </div>
              <div class="year-selector">
                <button @click="changeYear(-1)">< 上一年</button>
                <span>{{ individualSearchYear }} 年</span>
                <button @click="changeYear(1)">下一年 ></button>
              </div>
            </div>
            <button @click="handleSearch" :disabled="isLoadingReports" class="search-btn">
              {{ isLoadingReports ? '查詢中...' : '查詢報告' }}
            </button>
          </div>
        </div>
        <div class="report-display">
          <div v-if="isLoadingReports" class="loading-state">正在查詢報告...</div>
          <div v-else-if="!searchPerformed" class="placeholder-text">請選擇條件並點擊查詢。</div>
          <div
            v-else-if="
              (searchType === 'group' && reportData.length === 0) ||
              (searchType === 'individual' && reportColumns.length === 0)
            "
            class="empty-state"
          >
            查無符合條件的報告。
          </div>
          <div v-else class="table-container">
            <!-- 依群組查詢的結果表格 -->
            <table v-if="searchType === 'group'">
              <thead>
                <tr>
                  <th class="sticky-col">床號</th>
                  <th class="sticky-col col-name">姓名</th>
                  <th v-for="itemKey in prioritizedLabItems" :key="itemKey">
                    {{ labItemDisplayNames[itemKey] || itemKey }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in reportData" :key="row.patientId">
                  <td class="sticky-col">{{ row.bedNum || '-' }}</td>
                  <td class="sticky-col col-name">{{ row.patientName }}</td>
                  <td v-for="itemKey in prioritizedLabItems" :key="itemKey">
                    {{ row.labData[itemKey] !== undefined ? row.labData[itemKey] : '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- 依個人查詢的結果表格 -->
            <table v-if="searchType === 'individual'">
              <thead>
                <tr>
                  <th class="sticky-col">月份</th>
                  <th v-for="itemKey in prioritizedLabItems" :key="itemKey">
                    {{ labItemDisplayNames[itemKey] || itemKey }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="month in reportColumns" :key="month">
                  <td class="sticky-col">{{ month }}</td>
                  <td v-for="itemKey in prioritizedLabItems" :key="itemKey">
                    {{ reportData[itemKey]?.[month] || '-' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 資料上傳頁籤 -->
      <div v-show="activeTab === 'upload'" class="tab-panel upload-panel">
        <div class="section-card upload-card">
          <h2>步驟一：上傳 Excel 檔案</h2>
          <div class="upload-controls">
            <input
              type="file"
              @change="handleFileSelect"
              accept=".xlsx, .xls"
              :disabled="isUploading"
            />
            <button @click="handleUpload" :disabled="!selectedFile || isUploading">
              {{ isUploading ? '處理中...' : '上傳並處理' }}
            </button>
          </div>
          <div v-if="selectedFile" class="file-info">
            已選擇檔案：<strong>{{ selectedFile.name }}</strong>
          </div>
        </div>
        <div class="section-card results-card">
          <h2>步驟二：檢視處理結果</h2>
          <div v-if="uploadResult" class="upload-result">
            <p :class="uploadResult.errorCount > 0 ? 'has-error' : 'is-success'">
              {{ uploadResult.message }}
            </p>
            <div v-if="uploadResult.errorCount > 0" class="error-details">
              <h4>問題詳情 (最多顯示 50 筆)：</h4>
              <ul>
                <li v-for="(err, index) in uploadResult.errors" :key="index">
                  <strong>原因: {{ err.reason }}</strong>
                  <div class="error-data">原始資料: {{ err.rowData }}</div>
                </li>
              </ul>
            </div>
          </div>
          <div v-else class="placeholder-text">上傳檔案後，這裡會顯示匯入的結果報告。</div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getFunctions, httpsCallable } from 'firebase/functions'
import ApiManager from '@/services/api_manager.js'
import {
  where,
  orderBy,
  documentId,
  collection,
  getDocs,
  query as firestoreQuery,
} from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'

// --- API & Services ---
const patientsApi = ApiManager('patients')
const labReportsApi = ApiManager('lab_reports')
const baseSchedulesApi = ApiManager('base_schedules')
const route = useRoute()

// --- 頁籤控制 ---
const activeTab = ref('query')

// --- 上傳相關狀態 ---
const selectedFile = ref(null)
const isUploading = ref(false)
const uploadResult = ref(null)

// --- 查詢相關狀態 ---
const searchType = ref('group')
const groupSearchParams = reactive({
  freq: '一三五',
  shift: 'early',
  month: new Date().toISOString().slice(0, 7),
})
const individualSearchQuery = ref('')
const individualSearchYear = ref(new Date().getFullYear())
const isLoadingReports = ref(false)
const searchPerformed = ref(false)
const reportData = ref([])
const reportColumns = ref([])

const freqOptions = ['一三五', '二四六', '一四', '二五', '三六', '一五', '二六']
const SHIFT_MAP = { early: 0, noon: 1, late: 2 }

// ✨ 1. 調整顯示順序、省略項目、加入計算欄位鍵
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

// ✨ 2. 項目名稱英文化，並為計算欄位命名
const labItemDisplayNames = {
  BUN: 'BUN',
  Creatinine: 'Creatinine',
  Albumin: 'Albumin',
  P: 'P',
  Ca: 'Ca',
  Hb: 'Hb',
  Hct: 'Hct',
  Platelet: 'Platelet',
  WBC: 'WBC',
  Na: 'Na',
  K: 'K',
  eGFR: 'eGFR',
  GlucoseAC: 'Glucose AC',
  TotalProtein: 'Total Protein',
  Iron: 'Iron',
  TIBC: 'TIBC',
  Ferritin: 'Ferritin',
  iPTH: 'iPTH',
  PostBUN: 'Post-BUN',
  // 計算欄位
  CaXP: 'Ca x P',
  'Kt/V': 'Kt/V',
  URR: 'URR (%)',
  TSAT: 'TSAT (%)',
}

// ‼️‼️‼️ 在這裡加入檢驗項目標準值 ‼️‼️‼️
const STANDARDS = {
  Albumin: { min: 3.5 },
  P: { max: 5.5 },
  Ca: { min: 8.4, max: 10.2 },
  'Kt/V': { min: 1.2 },
  URR: { min: 65 },
  Hb: { min: 10 },
  Hct: { min: 33, max: 36 },
  Ferritin: { min: 200, max: 500 },
  TSAT: { min: 20 },
  iPTH: { min: 150, max: 300 },
  // ... 您可以隨時在此處新增或修改標準
}

// ‼️‼️‼️ 以下是完整的上傳邏輯函式 ‼️‼️‼️
function handleFileSelect(event) {
  selectedFile.value = event.target.files[0]
  uploadResult.value = null
}

async function handleUpload() {
  if (!selectedFile.value) {
    alert('請先選擇一個檔案！')
    return
  }
  isUploading.value = true
  uploadResult.value = null
  try {
    const fileContentBase64 = await toBase64(selectedFile.value)
    const functions = getFunctions()
    const processLabReport = httpsCallable(functions, 'processLabReport')
    const result = await processLabReport({
      fileName: selectedFile.value.name,
      fileContent: fileContentBase64,
    })
    uploadResult.value = result.data
  } catch (error) {
    console.error('上傳處理失敗:', error)
    uploadResult.value = { message: `上傳失敗: ${error.message}`, errorCount: 1 }
  } finally {
    isUploading.value = false
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result.toString().replace(/^data:(.*,)?/, ''))
    reader.onerror = (error) => reject(error)
  })
}
// ‼️‼️‼️ 上傳邏輯函式結束 ‼️‼️‼️

// --- 查詢邏輯 ---
async function handleSearch() {
  isLoadingReports.value = true
  searchPerformed.value = true
  try {
    if (searchType.value === 'group') {
      await searchGroupReports()
    } else {
      await searchIndividualReports()
    }
  } catch (error) {
    console.error('查詢報告失敗:', error)
    if (searchType.value === 'group') {
      reportData.value = []
    } else {
      reportData.value = {}
    }
    alert(error.message)
  } finally {
    isLoadingReports.value = false
  }
}

watch(searchType, (newType) => {
  searchPerformed.value = false
  reportColumns.value = []
  if (newType === 'group') {
    reportData.value = []
  } else {
    reportData.value = {}
  }
})

async function searchGroupReports() {
  const masterScheduleDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
  const masterRules = masterScheduleDoc?.schedule || {}
  const shiftIndex = SHIFT_MAP[groupSearchParams.shift]
  const allPatientIdsInGroup = Object.keys(masterRules).filter(
    (id) =>
      masterRules[id].freq === groupSearchParams.freq && masterRules[id].shiftIndex === shiftIndex,
  )
  if (allPatientIdsInGroup.length === 0) {
    reportData.value = []
    return
  }

  const CHUNK_SIZE = 30
  const chunks = Array.from(
    { length: Math.ceil(allPatientIdsInGroup.length / CHUNK_SIZE) },
    (v, i) => allPatientIdsInGroup.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE),
  )

  const patientInfoMap = new Map()
  const patientsRef = collection(db, 'patients')
  for (const chunk of chunks) {
    const q = firestoreQuery(patientsRef, where(documentId(), 'in', chunk))
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((doc) => patientInfoMap.set(doc.id, { id: doc.id, ...doc.data() }))
  }

  const patientList = allPatientIdsInGroup
    .map((id) => {
      const info = patientInfoMap.get(id)
      return info ? { patientId: id, patientName: info.name, bedNum: masterRules[id].bedNum } : null
    })
    .filter(Boolean)
  if (patientList.length === 0) {
    reportData.value = []
    return
  }

  const [year, month] = groupSearchParams.month.split('-').map(Number)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 1)

  const allReports = []
  const reportsRef = collection(db, 'lab_reports')
  const patientIdsInList = patientList.map((p) => p.patientId)
  const reportChunks = Array.from(
    { length: Math.ceil(patientIdsInList.length / CHUNK_SIZE) },
    (v, i) => patientIdsInList.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE),
  )

  for (const chunk of reportChunks) {
    const q = firestoreQuery(
      reportsRef,
      where('patientId', 'in', chunk),
      where('reportDate', '>=', startDate),
      where('reportDate', '<', endDate),
      orderBy('reportDate', 'desc'),
    )
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((doc) => {
      const data = doc.data()
      if (data.reportDate?.toDate)
        data.reportDate = data.reportDate.toDate().toISOString().slice(0, 10)
      allReports.push({ id: doc.id, ...data })
    })
  }

  const latestReports = new Map()
  allReports.forEach((report) => {
    if (!latestReports.has(report.patientId)) latestReports.set(report.patientId, report)
  })

  reportData.value = patientList
    .map((p) => {
      const report = latestReports.get(p.patientId)
      const labData = report?.data || {}
      if (labData.Ca && labData.P) labData.CaXP = (labData.Ca * labData.P).toFixed(2)
      if (labData.Iron && labData.TIBC > 0)
        labData.TSAT = ((labData.Iron / labData.TIBC) * 100).toFixed(1)
      if (labData.BUN && labData.PostBUN > 0) {
        labData.URR = (((labData.BUN - labData.PostBUN) / labData.BUN) * 100).toFixed(1)
        labData['Kt/V'] = Math.log(labData.BUN / labData.PostBUN).toFixed(2)
      }
      return {
        patientId: p.patientId,
        patientName: p.patientName,
        bedNum: p.bedNum,
        labData: labData,
      }
    })
    .sort((a, b) => String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true }))
}

async function searchIndividualReports() {
  if (!individualSearchQuery.value.trim()) return
  const query = individualSearchQuery.value.trim().toLowerCase()
  const allPatients = await patientsApi.fetchAll()
  const foundPatient = allPatients.find(
    (p) =>
      p.medicalRecordNumber?.toLowerCase().includes(query) || p.name?.toLowerCase().includes(query),
  )
  if (!foundPatient) throw new Error(`找不到病人: ${individualSearchQuery.value}`)

  const year = individualSearchYear.value
  const startDate = new Date(year, 0, 1)
  const endDate = new Date(year + 1, 0, 1)

  const reportsRaw = []
  const reportsRef = collection(db, 'lab_reports')
  const q = firestoreQuery(
    reportsRef,
    where('patientId', '==', foundPatient.id),
    where('reportDate', '>=', startDate),
    where('reportDate', '<', endDate),
    orderBy('reportDate', 'desc'),
  )
  const querySnapshot = await getDocs(q)
  querySnapshot.forEach((doc) => {
    const data = doc.data()
    if (data.reportDate?.toDate)
      data.reportDate = data.reportDate.toDate().toISOString().slice(0, 10)
    reportsRaw.push({ id: doc.id, ...data })
  })

  // ‼️‼️‼️ 核心修正：簡化數據處理與計算流程 ‼️‼️‼️

  // 1. 準備最終的數據結構和月份欄位
  const processedData = {}
  const monthSet = new Set()
  for (let i = 1; i <= 12; i++) {
    monthSet.add(`${year}-${String(i).padStart(2, '0')}`)
  }

  // 2. 遍歷從 Firestore 拿回來的報告
  reportsRaw.forEach((report) => {
    const monthKey = report.reportDate.slice(0, 7)
    const labData = report.data

    // 3. 先將所有原始數據填入 processedData
    for (const itemKey in labData) {
      if (!processedData[itemKey]) {
        processedData[itemKey] = {}
      }
      // 確保只填入該月份的最新一筆數據
      if (!processedData[itemKey][monthKey]) {
        processedData[itemKey][monthKey] = labData[itemKey]
      }
    }
  })

  // 4. 在所有原始數據都就位後，再遍歷所有月份進行計算
  for (const monthKey of monthSet) {
    // 從 processedData 中反向取出該月份的數據，方便計算
    const bun = processedData['BUN']?.[monthKey]
    const postBun = processedData['PostBUN']?.[monthKey]
    const ca = processedData['Ca']?.[monthKey]
    const p = processedData['P']?.[monthKey]
    const iron = processedData['Iron']?.[monthKey]
    const tibc = processedData['TIBC']?.[monthKey]

    // 進行計算，並將結果填回 processedData
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

  // 5. 更新最終的 ref 狀態
  reportData.value = processedData
  reportColumns.value = Array.from(monthSet).sort().reverse()
}

function changeYear(offset) {
  individualSearchYear.value += offset
  if (individualSearchQuery.value.trim()) handleSearch()
}

onMounted(() => {
  const patientIdFromQuery = route.query.patientId
  if (patientIdFromQuery) {
    searchType.value = 'individual'
    patientsApi.fetchById(patientIdFromQuery).then((patient) => {
      if (patient) {
        individualSearchQuery.value = patient.name
        handleSearch()
      }
    })
  }
})
</script>

<style scoped>
/* 頁面主體 Flexbox 佈局，解決滾動條問題 */
.page-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 2rem); /* 假設外層有 1rem 的上下 padding */
  padding: 1rem;
  background-color: #f8f9fa;
}

.page-header {
  flex-shrink: 0;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #dee2e6;
}

h1 {
  font-size: 2rem;
  margin: 0;
}
.page-description {
  font-size: 1rem;
  color: #6c757d;
}

/* 頁籤導覽樣式 */
.tabs-navigation {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
  margin-bottom: -1px;
}
.tabs-navigation button {
  padding: 0.75rem 1.5rem;
  font-size: 1.1rem;
  font-weight: 500;
  border: 1px solid transparent;
  border-bottom: none;
  background-color: transparent;
  color: #6c757d;
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  transition: all 0.2s;
}
.tabs-navigation button.active {
  background-color: #fff;
  color: #007bff;
  border-color: #dee2e6;
}

/* 主內容區與頁籤面板佈局 */
.page-main-content {
  flex-grow: 1;
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 0 8px 8px 8px;
  overflow: hidden;
  display: flex;
}
.tab-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
}
.upload-panel {
  gap: 1.5rem;
}

.upload-card,
.results-card {
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  border-radius: 8px;
}

/* 查詢控制項與結果顯示區的 Flexbox 佈局 */
.search-controls {
  flex-shrink: 0;
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e9ecef;
}
.report-display {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.table-container {
  flex-grow: 1;
  overflow: auto;
  border: 1px solid #dee2e6;
  border-radius: 4px;
}

/* --- 其他元件的樣式 --- */
.filter-wrapper {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.group-filters,
.individual-filters {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
}
.year-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.year-selector span {
  font-weight: bold;
  font-size: 1.1rem;
  width: 80px;
  text-align: center;
}
.search-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.search-field label {
  font-weight: 500;
  font-size: 0.9rem;
  color: #495057;
}
.search-field input,
.search-field select {
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #ccc;
  min-width: 150px;
  height: 38px;
  box-sizing: border-box;
}
.search-btn,
.year-selector button {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: 1px solid #007bff;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  height: 38px;
  box-sizing: border-box;
}
.year-selector button {
  padding: 0.5rem 1rem;
  background-color: #f8f9fa;
  color: #333;
  border-color: #ccc;
}
.loading-state,
.placeholder-text,
.empty-state {
  text-align: center;
  color: #6c757d;
  padding: 2rem;
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
  z-index: 20;
}
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 10;
  background-color: #f8f9fa;
  text-align: left;
  min-width: 120px;
}
.sticky-col.col-name {
  left: 80px;
  min-width: 100px;
}
tbody .sticky-col {
  background-color: #fff;
  font-weight: bold;
}
tbody tr:nth-child(even) {
  background-color: #f8f9fa;
}
tbody tr:nth-child(even) .sticky-col {
  background-color: #f8f9fa;
}
.upload-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.upload-result {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 4px;
}
.upload-result .is-success {
  color: #155724;
  background-color: #d4edda;
}
.upload-result .has-error {
  color: #721c24;
  background-color: #f8d7da;
}
.file-info {
  margin-top: 1rem;
}
.error-details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #ffc107;
  text-align: left;
}
.error-details h4 {
  margin-top: 0;
  color: #856404;
}
.error-details ul {
  padding-left: 20px;
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}
.error-details li {
  margin-bottom: 0.5rem;
}
.error-data {
  font-size: 0.85rem;
  color: #666;
  font-family: monospace;
}
</style>
