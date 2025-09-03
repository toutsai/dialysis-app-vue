<!-- 檔案路徑: src/views/OrdersView.vue -->
<template>
  <div class="page-container">
    <header class="page-header">
      <h1>藥囑管理</h1>
      <p>上傳並查詢病患的口服藥與針劑藥囑紀錄。</p>
    </header>

    <div class="tabs-navigation">
      <button :class="{ active: activeTab === 'query' }" @click="activeTab = 'query'">
        藥囑查詢
      </button>
      <button :class="{ active: activeTab === 'upload' }" @click="activeTab = 'upload'">
        資料上傳
      </button>
    </div>

    <main class="page-main-content">
      <!-- (A) 藥囑查詢頁籤 -->
      <div v-show="activeTab === 'query'" class="tab-panel query-panel">
        <!-- 1. 搜尋控制項 -->
        <div class="search-controls">
          <div class="search-type-toggle">
            <button :class="{ active: searchType === 'group' }" @click="searchType = 'group'">
              群組搜尋
            </button>
            <button
              :class="{ active: searchType === 'individual' }"
              @click="searchType = 'individual'"
            >
              個人搜尋
            </button>
          </div>

          <!-- 群組搜尋條件 -->
          <div v-if="searchType === 'group'" class="group-filters">
            <select v-model="groupSearchParams.freq">
              <option value="一三五">一三五</option>
              <option value="二四六">二四六</option>
              <option value="other">其他</option>
            </select>
            <select v-model="groupSearchParams.shift">
              <option value="early">早班</option>
              <option value="noon">午班</option>
              <option value="late">晚班</option>
            </select>
          </div>

          <!-- 個人搜尋條件 -->
          <div v-if="searchType === 'individual'" class="individual-filters">
            <input
              type="text"
              v-model="individualSearchTerm"
              placeholder="輸入姓名或病歷號..."
              @keyup.enter="handleSearch"
            />
          </div>

          <button @click="handleSearch" :disabled="isLoading" class="search-btn">
            <i class="fas fa-search"></i> {{ isLoading ? '查詢中...' : '查詢' }}
          </button>
        </div>

        <!-- 2. 查詢結果顯示區 -->
        <div class="results-display">
          <div v-if="isLoading" class="loading-state">
            <div class="loading-spinner"></div>
            正在查詢藥囑資料...
          </div>
          <div v-else-if="!searchPerformed" class="placeholder-text">請選擇條件並點擊查詢。</div>
          <div v-else-if="searchedPatients.length === 0" class="empty-state">
            查無符合條件的病人。
          </div>
          <!-- ✨ [核心修改 3] 全新的橫向滾動佈局 -->
          <div v-else class="results-scroll-area">
            <div v-for="patient in searchedPatients" :key="patient.id" class="patient-orders-card">
              <div class="patient-header">
                <h3>{{ patient.name }} ({{ patient.medicalRecordNumber }})</h3>
                <span>床號: {{ patient.scheduleRule?.bedNum || 'N/A' }}</span>
              </div>

              <!-- ✨ [核心修改] 模板渲染邏輯調整 -->
              <template
                v-if="
                  getEffectiveOrders(patient.id).injections.length > 0 ||
                  getEffectiveOrders(patient.id).orals.length > 0
                "
              >
                <!-- 針劑藥物表格 -->
                <div
                  v-if="getEffectiveOrders(patient.id).injections.length > 0"
                  class="orders-section"
                >
                  <h4>針劑藥物</h4>
                  <div class="table-wrapper">
                    <table class="orders-table compact-table">
                      <thead>
                        <tr>
                          <th rowspan="2" class="sticky-col">商品名</th>
                          <!-- ✨ 使用 injectionDates 來生成表頭 -->
                          <th
                            v-for="date in getEffectiveOrders(patient.id).injectionDates"
                            :key="date"
                            colspan="2"
                            class="date-header"
                          >
                            {{ date }}
                          </th>
                        </tr>
                        <tr>
                          <!-- ✨ 使用 injectionDates 來生成次級表頭 -->
                          <template
                            v-for="date in getEffectiveOrders(patient.id).injectionDates"
                            :key="date + '-sub'"
                          >
                            <th>次劑量</th>
                            <th>備註</th>
                          </template>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="med in getEffectiveOrders(patient.id).injections"
                          :key="med.tradeName"
                        >
                          <td class="sticky-col">{{ med.tradeName }}</td>
                          <!-- ✨ 遍歷 injectionDates 來填入資料 -->
                          <template
                            v-for="date in getEffectiveOrders(patient.id).injectionDates"
                            :key="date + '-data'"
                          >
                            <td>{{ med.ordersByDate[date]?.dose || '' }}</td>
                            <td>{{ med.ordersByDate[date]?.note || '' }}</td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <!-- 口服藥物表格 -->
                <div v-if="getEffectiveOrders(patient.id).orals.length > 0" class="orders-section">
                  <h4>口服藥物</h4>
                  <div class="table-wrapper">
                    <table class="orders-table compact-table">
                      <thead>
                        <tr>
                          <th rowspan="2" class="sticky-col">商品名</th>
                          <!-- ✨ 使用 oralDates 來生成表頭 -->
                          <th
                            v-for="date in getEffectiveOrders(patient.id).oralDates"
                            :key="date"
                            colspan="2"
                            class="date-header"
                          >
                            {{ date }}
                          </th>
                        </tr>
                        <tr>
                          <!-- ✨ 使用 oralDates 來生成次級表頭 -->
                          <template
                            v-for="date in getEffectiveOrders(patient.id).oralDates"
                            :key="date + '-sub'"
                          >
                            <th>次劑量</th>
                            <th>頻率服法</th>
                          </template>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="med in getEffectiveOrders(patient.id).orals"
                          :key="med.tradeName"
                        >
                          <td class="sticky-col">{{ med.tradeName }}</td>
                          <!-- ✨ 遍歷 oralDates 來填入資料 -->
                          <template
                            v-for="date in getEffectiveOrders(patient.id).oralDates"
                            :key="date + '-data'"
                          >
                            <td>{{ med.ordersByDate[date]?.dose || '' }}</td>
                            <td>{{ med.ordersByDate[date]?.frequency || '' }}</td>
                          </template>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </template>

              <div v-else class="no-orders-message">此病人尚無藥囑紀錄。</div>
            </div>
          </div>
        </div>
      </div>

      <!-- (B) 資料上傳頁籤 -->
      <div v-show="activeTab === 'upload'" class="tab-panel upload-panel">
        <div class="upload-core-panel">
          <h4>批次上傳藥囑 Excel</h4>
          <div
            class="upload-drop-zone"
            :class="{ 'is-dragover': isDragOver }"
            @dragover.prevent="isDragOver = true"
            @dragleave.prevent="isDragOver = false"
            @drop.prevent="handleFileDrop"
          >
            <div class="upload-icon">💊</div>
            <h3 v-if="!selectedFile">拖曳藥囑 Excel 檔案至此，或點擊按鈕選擇</h3>
            <h3 v-else>
              已選擇檔案：<strong>{{ selectedFile.name }}</strong>
            </h3>
            <p class="upload-hint">
              支援 .xlsx, .xls 格式。請確保檔案包含 '病歷號', '醫令碼', '名稱', '異動日期' 等欄位。
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
            :class="{
              'has-error': uploadResult.errorCount > 0,
              'is-success': uploadResult.errorCount === 0,
            }"
          >
            <p>{{ uploadResult.message }}</p>
            <ul v-if="uploadResult.errors && uploadResult.errors.length > 0">
              <li v-for="(error, index) in uploadResult.errors" :key="index">
                第 {{ error.rowNumber }} 行: {{ error.reason }}
              </li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { functions } from '@/composables/useFirebase.js'
import { httpsCallable } from 'firebase/functions'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, documentId } from 'firebase/firestore'
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'
import { queryWithInChunks } from '@/utils/firestoreUtils.js'

// --- Stores and APIs ---
const patientStore = usePatientStore()
const { opdPatients, patientMap } = storeToRefs(patientStore)
const ordersApi = ApiManager('medication_orders')

// --- Component State ---
const activeTab = ref('query')
const isLoading = ref(false)
const searchPerformed = ref(false)

// Search Parameters
const searchType = ref('group')
const groupSearchParams = reactive({
  freq: '一三五',
  shift: 'early',
})
const individualSearchTerm = ref('')
// ✨ [核心修改 1] 新增藥物主資料定義
const INJECTION_MEDS_MASTER = [
  { code: 'INES2', tradeName: 'NESP' },
  { code: 'IREC1', tradeName: 'Recormon' },
  { code: 'IFER2', tradeName: 'Fe-back' },
  { code: 'ICAC', tradeName: 'Cacare' },
  { code: 'IPAR1', tradeName: 'Parsabiv' },
]

const ORAL_MEDS_MASTER = [
  { code: 'OCAL1', tradeName: 'A-Cal' },
  { code: 'OCAA', tradeName: 'Pro-Cal' },
  { code: 'OFOS4', tradeName: 'Lanclean' },
  { code: 'OALK1', tradeName: 'Alkantin' },
  { code: 'OVAF', tradeName: 'Vafseo' },
  { code: 'OORK', tradeName: 'Orkedia' },
  { code: 'OUCA1', tradeName: 'U-Ca' },
]

// Search Results
const searchedPatients = ref([])
const allOrdersHistory = ref([]) // 用來儲存所有查詢到的原始藥囑紀錄

// Upload Tab State
const selectedFile = ref(null)
const isUploading = ref(false)
const uploadResult = ref(null)
const isDragOver = ref(false)

// --- Lifecycle ---
onMounted(async () => {
  await patientStore.fetchPatientsIfNeeded()
})

// --- Methods ---

// 核心查詢函式
async function handleSearch() {
  isLoading.value = true
  searchPerformed.value = true
  searchedPatients.value = []
  allOrdersHistory.value = []

  try {
    let targetPatients = []

    // 1. 根據搜尋類型，篩選出目標病人
    if (searchType.value === 'group') {
      const shiftIndexMap = { early: 0, noon: 1, late: 2 }
      const shiftIndex = shiftIndexMap[groupSearchParams.shift]
      const regularFreqs = ['一三五', '二四六']

      targetPatients = opdPatients.value.filter((p) => {
        const rule = p.scheduleRule
        if (!rule) return false
        const matchesShift = rule.shiftIndex === shiftIndex
        if (!matchesShift) return false
        if (groupSearchParams.freq === 'other') {
          return !regularFreqs.includes(rule.freq)
        } else {
          return rule.freq === groupSearchParams.freq
        }
      })
    } else {
      // individual search
      const term = individualSearchTerm.value.trim().toLowerCase()
      if (!term) {
        alert('請輸入姓名或病歷號')
        isLoading.value = false
        return
      }
      targetPatients = opdPatients.value.filter(
        (p) => p.name.toLowerCase().includes(term) || p.medicalRecordNumber.includes(term),
      )
    }

    if (targetPatients.length === 0) {
      isLoading.value = false
      return
    }

    // 2. 根據病人 ID 列表，查詢所有相關的藥囑歷史紀錄
    const patientIds = targetPatients.map((p) => p.id)
    const ordersHistory = await queryWithInChunks('medication_orders', 'patientId', patientIds)

    allOrdersHistory.value = ordersHistory
    searchedPatients.value = targetPatients.sort((a, b) =>
      String(a.scheduleRule?.bedNum).localeCompare(String(b.scheduleRule?.bedNum), undefined, {
        numeric: true,
      }),
    )
  } catch (error) {
    console.error('查詢藥囑失敗:', error)
    alert('查詢藥囑時發生錯誤，請稍後再試。')
  } finally {
    isLoading.value = false
  }
}

// ✨ [核心修正 v2.0] 重寫 getEffectiveOrders 函式，使其能夠處理併行醫囑 ✨
function getEffectiveOrders(patientId) {
  // 步驟 A: 過濾出該病人的所有歷史藥囑
  const patientHistory = allOrdersHistory.value.filter((order) => order.patientId === patientId)

  // 步驟 B: 找出每條獨立醫囑線的最新版本
  // 我們使用 "藥物代碼 + 頻率/備註" 作為獨立醫囑的唯一標識
  const latestEffectiveOrdersMap = new Map()

  // 先將歷史由新到舊排序
  patientHistory.sort((a, b) => new Date(b.changeDate) - new Date(a.changeDate))

  for (const record of patientHistory) {
    const uniqueKey = `${record.orderCode}_${(record.note || record.frequency || '').trim()}`
    if (!latestEffectiveOrdersMap.has(uniqueKey)) {
      latestEffectiveOrdersMap.set(uniqueKey, record)
    }
  }

  const allEffectiveOrders = Array.from(latestEffectiveOrdersMap.values())

  // 步驟 C: 沿用舊的邏輯，將藥物分類、分組並排序
  const oralOrders = allEffectiveOrders.filter((o) => o.orderType === 'oral')
  const injectionOrders = allEffectiveOrders.filter((o) => o.orderType === 'injection')

  const oralDates = Array.from(new Set(oralOrders.map((o) => o.changeDate.slice(0, 10)))).sort()
  const injectionDates = Array.from(
    new Set(injectionOrders.map((o) => o.changeDate.slice(0, 10))),
  ).sort()

  const buildOrdersByCode = (orders) => {
    const ordersByCode = {}
    for (const order of orders) {
      if (!ordersByCode[order.orderCode]) {
        const masterMed =
          INJECTION_MEDS_MASTER.find((m) => m.code === order.orderCode) ||
          ORAL_MEDS_MASTER.find((m) => m.code === order.orderCode)

        ordersByCode[order.orderCode] = {
          tradeName: masterMed ? masterMed.tradeName : order.orderName,
          orderType: order.orderType,
          ordersByDate: {},
        }
      }
      // 將異動日期作為 key
      ordersByCode[order.orderCode].ordersByDate[order.changeDate.slice(0, 10)] = order
    }
    return ordersByCode
  }

  const injectionOrdersByCode = buildOrdersByCode(injectionOrders)
  const oralOrdersByCode = buildOrdersByCode(oralOrders)

  const sortedInjectionData = INJECTION_MEDS_MASTER.map(
    (masterMed) => injectionOrdersByCode[masterMed.code],
  ).filter(Boolean)

  const sortedOralData = ORAL_MEDS_MASTER.map(
    (masterMed) => oralOrdersByCode[masterMed.code],
  ).filter(Boolean)

  return {
    injectionDates: injectionDates,
    oralDates: oralDates,
    injections: sortedInjectionData,
    orals: sortedOralData,
  }
}

// --- Upload Tab Methods ---
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
    const processOrders = httpsCallable(functions, 'processOrders')
    const result = await processOrders({
      fileName: selectedFile.value.name,
      fileContent: fileContentBase64,
    })
    uploadResult.value = result.data
  } catch (error) {
    console.error('上傳處理失敗:', error)
    uploadResult.value = { message: `上傳失敗: ${error.message}`, errorCount: 1, errors: [] }
  } finally {
    isUploading.value = false
  }
}
</script>

<style scoped>
/* 這裡的樣式可以大量複製 ConsumablesView.vue 的樣式 */
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
p {
  margin-top: 0.5rem;
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
}

/* --- 查詢頁籤樣式 --- */
.query-panel {
  padding: 1.5rem;
  gap: 1.5rem;
}
.search-controls {
  flex-shrink: 0;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid #e9ecef;
}
.search-type-toggle {
  display: flex;
  border: 1px solid #007bff;
  border-radius: 6px;
  overflow: hidden;
}
.search-type-toggle button {
  background: none;
  border: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  font-weight: 500;
}
.search-type-toggle button.active {
  background-color: #007bff;
  color: white;
}
.group-filters,
.individual-filters {
  display: flex;
  gap: 0.5rem;
}
.group-filters select,
.individual-filters input {
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #ccc;
  font-size: 1rem;
}
.search-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: 1px solid #007bff;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.search-btn:disabled {
  background-color: #6c757d;
  border-color: #6c757d;
  cursor: not-allowed;
}
.results-display {
  flex-grow: 1;
  min-height: 0;
}
.loading-state,
.placeholder-text,
.empty-state {
  text-align: center;
  color: #6c757d;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
}
.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.results-scroll-area {
  overflow-y: auto;
  height: 100%;
  padding-right: 10px;
}
.patient-orders-card {
  margin-bottom: 2rem;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}
.patient-header {
  background-color: #f8f9fa;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #dee2e6;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.patient-header h3 {
  margin: 0;
  font-size: 1.2rem;
}
.patient-header small {
  color: #6c757d;
}
.orders-section {
  padding: 1rem;
}
.orders-section h4 {
  margin-top: 0;
  margin-bottom: 0.75rem;
  font-size: 1.1rem;
}
.orders-table {
  width: 100%;
  border-collapse: collapse;
}
.orders-table th,
.orders-table td {
  border: 1px solid #e9ecef;
  padding: 0.5rem;
  text-align: left;
}
.orders-table th {
  background-color: #f8f9fa;
}
.no-orders-message {
  padding: 1rem;
  color: #6c757d;
  font-style: italic;
}

/* --- 上傳頁籤樣式 --- */
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
.upload-result-toast {
  width: 100%;
  padding: 1rem;
  border-radius: 6px;
  font-weight: 500;
  text-align: left;
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
.upload-result-toast ul {
  padding-left: 20px;
  margin-top: 10px;
}
.query-panel {
  color: #6c757d;
}
/* 新增的表格樣式 */
.orders-section h4 {
  border-bottom: 2px solid #007bff;
  padding-bottom: 0.5rem;
  display: inline-block;
}

/* 關鍵：讓表格可以橫向滾動的容器 */
.table-wrapper {
  overflow-x: auto;
  width: 100%;
}

/* 將 .orders-table 的 width: 100% 移除或修改 */
.orders-table {
  /* width: 100%;  <-- 刪除或註解掉這一行 */
  border-collapse: collapse; /* 改用 collapse，讓邊框更好看 */
  font-size: 0.9rem;
  border-spacing: 0;
}

/* ✨ [新增] 新 class 來控制緊緻表格 */
.orders-table.compact-table {
  width: auto; /* 關鍵：讓表格寬度由內容決定 */
  /* min-width: 100%; <-- 刪除或註解掉這一行 */
}

.orders-table th,
.orders-table td {
  padding: 0.6rem;
  white-space: nowrap; /* 防止文字換行 */
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
}
.orders-table th:first-child,
.orders-table td:first-child {
  border-left: 1px solid #e9ecef;
}
.orders-table thead tr:first-child th {
  border-top: 1px solid #e9ecef;
}

.orders-table th {
  background-color: #f8f9fa;
  font-weight: 600;
}

/* 確保第一欄的寬度是固定的 */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 1;
  background-color: #ffffff;
  border-right: 2px solid #dee2e6 !important;
  width: 150px; /* ✨ 新增：固定商品名欄位的寬度 */
  min-width: 150px;
  max-width: 150px;
}

thead .sticky-col {
  background-color: #f8f9fa; /* 表頭的 sticky 背景色 */
  z-index: 2; /* 層級要高於 tbody */
}

/* 表頭日期樣式 */
.date-header {
  min-width: 200px; /* 確保每個日期區塊有足夠寬度 */
}
</style>
