<!-- 檔案路徑: src/views/ConsumablesView.vue -->
<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-main-content">
        <h1>每月耗材總表</h1>
        <p class="page-description">依據排班群組查詢病患每月使用的耗材，並支援資料上傳。</p>
      </div>
    </header>

    <div class="tabs-navigation">
      <button :class="{ active: activeTab === 'query' }" @click="activeTab = 'query'">
        耗材查詢
      </button>
      <button :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
        資料上傳
      </button>
    </div>

    <main class="page-main-content">
      <!-- (A) 耗材查詢頁籤 -->
      <div v-show="activeTab === 'query'" class="tab-panel query-panel">
        <div class="search-controls">
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
          <button @click="handleSearch" :disabled="isLoading" class="search-btn">
            {{ isLoading ? '查詢中...' : '查詢耗材' }}
          </button>
          <button
            @click="exportConsumablesToExcel"
            :disabled="isLoading || consumablesData.length === 0"
            class="export-btn"
          >
            匯出 Excel
          </button>
        </div>

        <div class="report-display">
          <div v-if="isLoading" class="loading-state">正在查詢耗材資料...</div>
          <div v-else-if="!searchPerformed" class="placeholder-text">請選擇條件並點擊查詢。</div>
          <div v-else-if="consumablesData.length === 0" class="empty-state">
            查無符合條件的病人或耗材資料。
          </div>
          <div v-else class="table-container">
            <table>
              <thead>
                <tr>
                  <th class="sticky-col">床號</th>
                  <th class="sticky-col col-name">姓名</th>
                  <th>人工腎臟</th>
                  <th>透析藥水CA</th>
                  <th>B液種類</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in consumablesData" :key="row.patientId">
                  <td class="sticky-col">{{ row.bedNum || '-' }}</td>
                  <td class="sticky-col col-name">{{ row.patientName }}</td>
                  <td>{{ row.consumables.artificialKidney || '-' }}</td>
                  <td>{{ row.consumables.dialysateCa || '-' }}</td>
                  <td>{{ row.consumables.bicarbonateType || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- (B) 資料上傳頁籤 -->
      <div v-show="activeTab === 'upload'" class="tab-panel upload-panel">
        <div class="upload-core-panel">
          <h4>批次上傳每月耗材 Excel</h4>
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
            <p class="upload-hint">
              支援 .xlsx, .xls 格式。請確保標題行包含 '人工腎臟', '透析藥水CA', 或 'B液種類'。
            </p>
            <input
              id="file-input"
              type="file"
              @change="handleFileSelect"
              accept=".xlsx, .xls"
              :disabled="isUploading"
            />
            <label for="file-input" class="file-input-label">{{
              selectedFile ? '重新選擇檔案' : '選擇檔案'
            }}</label>
          </div>
          <button
            class="upload-btn-main"
            @click="handleUpload"
            :disabled="!selectedFile || isUploading"
          >
            {{ isUploading ? '處理中...' : '開始上傳' }}
          </button>
          <div
            v-if="uploadResult"
            class="upload-result-toast"
            :class="uploadResult.errorCount > 0 ? 'has-error' : 'is-success'"
          >
            {{ uploadResult.message }}
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { documentId } from 'firebase/firestore'
import { functions } from '@/composables/useFirebase.js'
import * as XLSX from 'xlsx'
import { queryWithInChunks } from '@/utils/firestoreUtils.js'
import { httpsCallable } from 'firebase/functions'
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

// --- Store & State ---
const patientStore = usePatientStore()
const { patientMap } = storeToRefs(patientStore)

const activeTab = ref('query')
const isLoading = ref(false)
const searchPerformed = ref(false)
const consumablesData = ref([])

const groupSearchParams = reactive({
  freq: '一三五',
  shift: 'early',
  month: new Date().toISOString().slice(0, 7),
})

const selectedFile = ref(null)
const isUploading = ref(false)
const uploadResult = ref(null)
const isDragOver = ref(false)

// --- Constants ---
const freqOptions = ['一三五', '二四六', '一四', '二五', '三六', '一五', '二六']
const SHIFT_MAP = { early: 0, noon: 1, late: 2 }

// --- API Manager ---
const baseSchedulesApi = ApiManager('base_schedules')

// --- Methods ---

onMounted(async () => {
  // 確保進入頁面時病人資料已載入
  await patientStore.fetchPatientsIfNeeded()
})

async function handleSearch() {
  isLoading.value = true
  searchPerformed.value = true
  consumablesData.value = []

  try {
    // 1. 根據頻率和班別，從總表找出符合條件的病人 ID 列表
    const masterScheduleDoc = await baseSchedulesApi.fetchById('MASTER_SCHEDULE')
    const masterRules = masterScheduleDoc?.schedule || {}
    const shiftIndex = SHIFT_MAP[groupSearchParams.shift]

    const allPatientIdsInGroup = Object.keys(masterRules).filter(
      (id) =>
        masterRules[id].freq === groupSearchParams.freq &&
        masterRules[id].shiftIndex === shiftIndex,
    )

    if (allPatientIdsInGroup.length === 0) {
      return // 如果這個群組沒人，直接結束
    }

    // 2. 根據病人 ID 列表和所選月份，查詢 'lab_reports' 集合
    const reportMonth = groupSearchParams.month
    // 組合出文件 ID，例如 "2025-08_patientId123"
    const reportIdsForMonth = allPatientIdsInGroup.map((id) => `${reportMonth}_${id}`)

    const monthlyReports = await queryWithInChunks('lab_reports', documentId(), reportIdsForMonth)
    const reportsMap = new Map(monthlyReports.map((r) => [r.patientId, r.data]))

    // 3. 組合最終要顯示在表格上的資料
    consumablesData.value = allPatientIdsInGroup
      .map((patientId) => {
        const patient = patientMap.value.get(patientId)
        const rule = masterRules[patientId]
        const consumables = reportsMap.get(patientId) || {}

        return {
          patientId: patientId,
          patientName: patient?.name || '未知病人',
          bedNum: rule?.bedNum || 'N/A',
          consumables: {
            artificialKidney: consumables.artificialKidney,
            dialysateCa: consumables.dialysateCa,
            bicarbonateType: consumables.bicarbonateType,
          },
        }
      })
      .sort((a, b) =>
        String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true }),
      )
  } catch (error) {
    console.error('查詢耗材資料失敗:', error)
    alert('查詢耗材資料時發生錯誤，請檢查主控台。')
  } finally {
    isLoading.value = false
  }
}

function exportConsumablesToExcel() {
  if (consumablesData.value.length === 0) {
    alert('沒有可匯出的資料。')
    return
  }

  const { freq, shift, month } = groupSearchParams
  const shiftNameMap = { early: '早班', noon: '午班', late: '晚班' }
  const shiftName = shiftNameMap[shift] || shift
  const title = `每月耗材總表: ${freq} / ${shiftName} / ${month}`

  const headers = ['床號', '姓名', '人工腎臟', '透析藥水CA', 'B液種類']

  const dataRows = consumablesData.value.map((row) => [
    row.bedNum || '-',
    row.patientName,
    row.consumables.artificialKidney || '-',
    row.consumables.dialysateCa || '-',
    row.consumables.bicarbonateType || '-',
  ])

  const sheetData = [[title], [], headers, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  const numCols = headers.length
  if (!ws['!merges']) ws['!merges'] = []
  ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } })
  ws['!cols'] = [{ wch: 8 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 30 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '耗材總表')
  const fileName = `耗材總表_${freq}_${shiftName}_${month}.xlsx`
  XLSX.writeFile(wb, fileName)
}

function handleFileSelect(event) {
  selectedFile.value = event.target.files[0]
  uploadResult.value = null
}

function handleFileDrop(event) {
  isDragOver.value = false
  const files = event.dataTransfer.files
  if (files.length > 0) {
    selectedFile.value = files[0]
    uploadResult.value = null
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

async function handleUpload() {
  if (!selectedFile.value) {
    alert('請先選擇一個檔案！')
    return
  }
  isUploading.value = true
  uploadResult.value = null

  try {
    const fileContentBase64 = await toBase64(selectedFile.value)

    // ✨ --- 核心修改：呼叫新的 processConsumables 函式 --- ✨
    const processConsumables = httpsCallable(functions, 'processConsumables')
    const result = await processConsumables({
      fileName: selectedFile.value.name,
      fileContent: fileContentBase64,
    })
    // --- (修改結束) ---

    uploadResult.value = result.data
  } catch (error) {
    console.error('上傳處理失敗:', error)
    uploadResult.value = { message: `上傳失敗: ${error.message}`, errorCount: 1 }
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
/* --- 複製 LabReportView 的樣式，但移除警示報告和手動補登的專用樣式 --- */
.page-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 2rem);
  padding: 0.5rem;
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
.group-filters {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
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
.export-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: 1px solid #007bff;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  height: 38px;
  box-sizing: border-box;
}
.export-btn {
  background-color: #198754;
  border-color: #198754;
}
.search-btn:disabled,
.export-btn:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
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
  min-width: 80px;
}
.sticky-col.col-name {
  left: 80px; /* 假設床號欄位寬度為 80px */
  min-width: 120px;
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
.upload-panel {
  display: flex;
  justify-content: center;
  align-items: flex-start;
}
.upload-core-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  align-items: center;
  padding: 2rem;
  width: 100%;
  max-width: 600px;
}
.upload-result-toast {
  width: 100%;
  padding: 1rem;
  border-radius: 6px;
  font-weight: 500;
  text-align: center;
}
.upload-result-toast.is-success {
  color: #155724;
  background-color: #d4edda;
  border: 1px solid #c3e6cb;
}
.upload-result-toast.has-error {
  color: #721c24;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
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
</style>
