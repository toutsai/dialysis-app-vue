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
        <!-- 美化後的上傳介面 -->
        <div
          class="upload-drop-zone"
          :class="{ 'is-dragover': isDragOver }"
          @dragover.prevent="isDragOver = true"
          @dragleave.prevent="isDragOver = false"
          @drop.prevent="handleFileDrop"
        >
          <div class="upload-icon">📤</div>
          <h3 v-if="!selectedFile">拖曳 Excel 檔案至此，或點擊按鈕選擇</h3>
          <h3 v-else>
            已選擇檔案：<strong>{{ selectedFile.name }}</strong>
          </h3>
          <p class="upload-hint">支援 .xlsx, .xls 格式</p>

          <!-- 隱藏的原始 input，透過 label 觸發 -->
          <input
            id="file-input"
            type="file"
            @change="handleFileSelect"
            accept=".xlsx, .xls"
            :disabled="isUploading"
          />
          <!-- 美化後的按鈕，點擊它等於點擊上面的 input -->
          <label for="file-input" class="file-input-label">
            {{ selectedFile ? '重新選擇檔案' : '選擇檔案' }}
          </label>

          <!-- 主要的上傳按鈕 -->
          <button
            class="upload-btn-main"
            @click="handleUpload"
            :disabled="!selectedFile || isUploading"
          >
            {{ isUploading ? '處理中...' : '開始上傳並處理' }}
          </button>
        </div>

        <!-- 處理結果區塊 -->
        <div v-if="uploadResult" class="results-card">
          <h2>處理結果</h2>
          <div class="upload-result">
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
const isDragOver = ref(false)

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
  'Glucose',
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
  GlucoseAC: 'Glucose',
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

  // 1. 建立唯一的、供所有後續查詢使用的病人 ID 批次
  const CHUNK_SIZE = 30
  const chunks = Array.from(
    { length: Math.ceil(allPatientIdsInGroup.length / CHUNK_SIZE) },
    (v, i) => allPatientIdsInGroup.slice(i * CHUNK_SIZE, i * CHUNK_SIZE + CHUNK_SIZE),
  )

  // 2. 查詢病人詳細資訊 (不變)
  const patientInfoMap = new Map()
  const patientsRef = collection(db, 'patients')
  for (const chunk of chunks) {
    const q = firestoreQuery(patientsRef, where(documentId(), 'in', chunk))
    const querySnapshot = await getDocs(q)
    querySnapshot.forEach((doc) => patientInfoMap.set(doc.id, { id: doc.id, ...doc.data() }))
  }

  // 3. 組合出完整的「點名單」 (不變)
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

  // 4. 準備日期範圍 (不變)
  const [year, month] = groupSearchParams.month.split('-').map(Number)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 1)

  const allReports = []
  const reportsRef = collection(db, 'lab_reports')

  // ‼️‼️‼️ 核心修正：直接使用第 1 步建立的 `chunks` 進行查詢 ‼️‼️‼️
  for (const chunk of chunks) {
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
      const reportDate = data.reportDate?.toDate
        ? data.reportDate.toDate()
        : new Date(data.reportDate)
      allReports.push({
        id: doc.id,
        ...data,
        reportDate: reportDate,
        reportDateString: reportDate.toISOString().slice(0, 10),
      })
    })
  }

  // 5. 聚合與組合數據 (不變)
  const latestReports = new Map()
  allReports.forEach((report) => {
    const existingReport = latestReports.get(report.patientId)
    if (!existingReport || report.reportDate > existingReport.reportDate) {
      latestReports.set(report.patientId, report)
    }
  })

  reportData.value = patientList
    .map((p) => {
      const report = latestReports.get(p.patientId)
      const labData = report?.data || {}
      // ... (計算邏輯不變) ...
      if (labData.Ca && labData.P) labData.CaXP = (labData.Ca * labData.P).toFixed(2)
      if (labData.Iron && labData.TIBC > 0)
        labData.TSAT = ((labData.Iron / labData.TIBC) * 100).toFixed(1)
      if (labData.BUN && labData.PostBUN > 0 && labData.BUN > 0) {
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

function handleFileDrop(event) {
  isDragOver.value = false
  const files = event.dataTransfer.files
  if (files.length > 0) {
    selectedFile.value = files[0]
    uploadResult.value = null
  }
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
/* --- 頁面主體與頁籤 (不變) --- */
.page-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 2rem);
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
.page-main-content {
  flex-grow: 1;
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 0 8px 8px 8px;
  display: flex;
  overflow: hidden;
}
.tab-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
}
.query-panel {
  gap: 1.5rem;
}

/* --- 美化後的上傳頁籤樣式 --- */
.upload-panel {
  align-items: center;
  justify-content: flex-start; /* 從置中改為從頂部開始 */
  gap: 2rem;
  overflow-y: auto;
}
.upload-drop-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2.5rem;
  border: 2px dashed #adb5bd;
  border-radius: 12px;
  background-color: #f8f9fa;
  width: 100%;
  max-width: 600px;
  text-align: center;
  transition: all 0.2s ease-in-out;
}
.upload-drop-zone.is-dragover {
  border-color: #007bff;
  background-color: #e7f1ff;
}
.upload-icon {
  font-size: 3rem;
  color: #007bff;
  margin-bottom: 1rem;
}
.upload-drop-zone h3 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}
.upload-hint {
  color: #6c757d;
  margin: 0 0 1.5rem 0;
}
input[type='file'] {
  display: none;
}
.file-input-label {
  display: inline-block;
  padding: 0.6rem 1.2rem;
  background-color: #fff;
  border: 1px solid #6c757d;
  color: #495057;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 1rem;
  transition: all 0.2s;
}
.file-input-label:hover {
  background-color: #e9ecef;
}
.upload-btn-main {
  padding: 0.75rem 2rem;
  font-size: 1.1rem;
  font-weight: 500;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;
}
.upload-btn-main:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

/* --- 處理結果區塊的樣式 --- */
.results-card {
  width: 100%;
  max-width: 600px;
  padding: 1.5rem;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  background-color: #fff;
}
.results-card h2 {
  margin-top: 0;
}
.upload-result {
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
  max-height: 150px;
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

/* --- 查詢頁籤的樣式 (不變) --- */
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
.filter-wrapper,
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
.file-info {
  margin-top: 1rem;
}
.abnormal-high,
.abnormal-low {
  font-weight: bold;
}
.abnormal-high {
  color: #dc3545;
}
.abnormal-low {
  color: #007bff;
}
.cell-content {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.5rem;
}
.trend-up {
  color: #dc3545;
  font-size: 0.8em;
}
.trend-down {
  color: #28a745;
  font-size: 0.8em;
}

/* ‼️‼️‼️ 行動版響應式樣式 (已包含上傳頁籤優化) ‼️‼️‼️ */
@media (max-width: 768px) {
  .page-container {
    height: auto;
    padding: 0;
  }
  .page-header,
  .tab-panel {
    padding: 1rem;
  }
  .page-main-content {
    border-radius: 0;
    overflow: visible;
  }
  .tab-panel.query-panel {
    overflow: visible;
  }
  .search-controls {
    position: relative;
    z-index: 40;
  }
  h1 {
    font-size: 1.5rem;
  }
  .tabs-navigation button {
    font-size: 1rem;
    padding: 0.5rem 1rem;
  }
  .search-controls,
  .filter-wrapper,
  .group-filters,
  .individual-filters {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .search-field input,
  .search-field select {
    min-width: 100%;
  }
  .search-btn {
    align-self: auto;
  }
  .year-selector {
    justify-content: space-between;
    width: 100%;
  }
  table {
    font-size: 0.8rem;
  }
  th,
  td {
    padding: 0.5rem 0.25rem;
  }
  .sticky-col {
    min-width: 80px;
  }

  /* ✨ 新增：行動版上傳介面優化 ✨ */
  .upload-panel {
    justify-content: flex-start;
  }
  .upload-drop-zone {
    padding: 1.5rem; /* 縮小內邊距 */
  }
  .upload-icon {
    font-size: 2.5rem; /* 縮小圖示 */
    margin-bottom: 0.5rem;
  }
  .upload-drop-zone h3 {
    font-size: 1.1rem; /* 縮小標題字體 */
  }
  .upload-hint {
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }
  .file-input-label,
  .upload-btn-main {
    width: 100%; /* 讓按鈕變滿版 */
    box-sizing: border-box;
    padding: 0.75rem;
  }
}
</style>
