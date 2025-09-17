<!-- 檔案路徑: src/components/LabMedCorrelationView.vue (最終修正版 v5) -->
<template>
  <div class="correlation-view-container">
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>正在載入檢驗與藥囑歷史資料...</p>
    </div>
    <div v-else-if="error" class="error-state">
      <p>⚠️ 載入失敗: {{ error }}</p>
      <button @click="fetchData">重試</button>
    </div>
    <div v-else-if="!patient" class="empty-state">
      <p>請先選擇病人。</p>
    </div>
    <div v-else class="correlation-content">
      <!-- (1) 操作按鈕區域 -->
      <div class="actions-header">
        <div class="header-info">
          <i class="fas fa-edit"></i>
          為 **{{ currentTargetMonth }}** 建立藥囑草稿
        </div>
        <button @click="saveDraftOrders" :disabled="isSubmitting || !isDraftChanged">
          <i v-if="isSubmitting" class="fas fa-spinner fa-spin"></i>
          {{ isSubmitting ? '儲存中...' : '儲存藥囑草稿' }}
        </button>
      </div>

      <!-- (2) 合併後的趨勢與開藥表格 -->
      <div class="table-wrapper">
        <table class="correlation-table">
          <thead>
            <tr>
              <th class="sticky-col group-header">項目</th>
              <th class="draft-col-header">當月藥囑 ({{ currentTargetMonth }})</th>
              <th v-for="month in timelineMonths" :key="month" class="month-header">
                {{ month }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in correlationGroups" :key="group.title">
              <!-- Group Header Row -->
              <tr class="group-separator">
                <th :colspan="timelineMonths.length + 2">{{ group.title }}</th>
              </tr>
              <!-- Lab Item Rows -->
              <tr v-for="labKey in group.labKeys" :key="labKey">
                <td class="sticky-col lab-item">{{ labItemDisplayNames[labKey] || labKey }}</td>
                <td class="draft-col-header"></td>
                <!-- 檢驗項目在草稿欄留空 -->
                <td v-for="month in timelineMonths" :key="month">
                  <span
                    v-if="processedLabs[labKey]?.[month] !== undefined"
                    :class="getAbnormalClass(labKey, processedLabs[labKey][month])"
                  >
                    {{ processedLabs[labKey][month] }}
                  </span>
                  <span v-else class="no-data">-</span>
                </td>
              </tr>
              <!-- Medication Rows -->
              <tr v-for="med in group.meds" :key="med.tradeName">
                <td class="sticky-col med-item">{{ med.tradeName }}</td>
                <td class="draft-col">
                  <div class="order-input-cell">
                    <input
                      type="text"
                      v-model="orderDraft[med.code].dose"
                      placeholder="劑量"
                      class="dose-input"
                    />
                    <span class="unit-display">{{ med.unit }}</span>
                    <input
                      type="text"
                      v-model="orderDraft[med.code].frequency"
                      :placeholder="med.type === 'injection' ? '備註' : '頻率'"
                      class="freq-input"
                    />
                  </div>
                </td>
                <td v-for="month in timelineMonths" :key="month">
                  <span v-if="processedOrders[med.code]?.[month]">
                    {{ processedOrders[med.code][month].dose }}
                    {{ processedOrders[med.code][month].unit }}
                    <small v-if="processedOrders[med.code][month].frequency">
                      ({{ processedOrders[med.code][month].frequency }})
                    </small>
                  </span>
                  <span v-else class="no-data">-</span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
      <div v-if="!isLoading && timelineMonths.length === 0" class="empty-state-in-content">
        <p>找不到該病人的任何歷史檢驗報告或藥囑，無法進行對照。</p>
        <p class="sub-text">您仍然可以在上方區域為本月建立藥囑草稿。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { db } from '@/composables/useFirebase.js'
// ✨ 1. 引入 doc 和 collection 函式 ✨
import { where, orderBy, writeBatch, query, collection, getDocs, doc } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'

const props = defineProps({
  patient: Object,
})

const labReportsApi = ApiManager('lab_reports')
const ordersApi = ApiManager('medication_orders')
// ApiManager 仍然可以用於 fetchAll 等自訂的函式，但對於底層操作，我們直接用 SDK
const draftOrdersApi = ApiManager('medication_drafts')
const { currentUser } = useAuth()

const correlationGroups = [
  {
    title: '貧血管理 (Anemia)',
    labKeys: ['Hb'],
    meds: [
      { code: 'INES2', tradeName: 'NESP', type: 'injection', unit: 'mcg' },
      { code: 'IREC1', tradeName: 'Recormon', type: 'injection', unit: 'U' },
      { code: 'OVAF', tradeName: 'Vafseo', type: 'oral', unit: 'mg' },
    ],
  },
  {
    title: '鐵質狀態 (Iron Status)',
    labKeys: ['Ferritin', 'TSAT'],
    meds: [{ code: 'IFER2', tradeName: 'Fe-back', type: 'injection', unit: 'mg' }],
  },
  {
    title: '鈣磷代謝 (Mineral Metabolism)',
    labKeys: ['Ca', 'P', 'CaXP'],
    meds: [
      { code: 'OCAL1', tradeName: 'A-Cal', type: 'oral', unit: '顆' },
      { code: 'OCAA', tradeName: 'Pro-Ca', type: 'oral', unit: '顆' },
      { code: 'OFOS4', tradeName: 'Lanclean', type: 'oral', unit: 'gm' },
      { code: 'OALK1', tradeName: 'Alkantin', type: 'oral', unit: '顆' },
    ],
  },
  {
    title: '副甲狀腺 (PTH)',
    labKeys: ['iPTH'],
    meds: [
      { code: 'ICAC', tradeName: 'Cacare', type: 'injection', unit: 'amp' },
      { code: 'IPAR1', tradeName: 'Parsabiv', type: 'injection', unit: 'mg' },
      { code: 'OUCA1', tradeName: 'U-Ca', type: 'oral', unit: '顆' },
      { code: 'OORK', tradeName: 'Orkedia', type: 'oral', unit: 'mcg' },
    ],
  },
]
const allMedsMaster = correlationGroups.flatMap((g) => g.meds)
const labItemDisplayNames = {
  Hb: 'Hb',
  Ferritin: 'Ferritin',
  TSAT: 'TSAT (%)',
  Ca: 'Ca',
  P: 'P',
  CaXP: 'Ca x P',
  iPTH: 'iPTH',
}
const LAB_REFERENCE_RANGES = {
  Hb: { min: 8, max: 12 },
  P: { max: 5.5 },
  iPTH: { min: 150, max: 300 },
  Ca: { min: 8.6, max: 10.3 },
  Ferritin: { max: 800 },
  CaXP: { max: 60 },
}

const isLoading = ref(true)
const isSubmitting = ref(false)
const error = ref(null)
const rawLabReports = ref([])
const rawMedOrders = ref([])
const orderDraft = reactive({})
const initialDraftState = ref({})

const currentTargetMonth = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
})

const timelineMonths = computed(() => {
  const monthSet = new Set()
  const nowMonth = currentTargetMonth.value
  rawLabReports.value.forEach((r) => {
    const month = r.reportDate.slice(0, 7)
    if (month <= nowMonth) {
      monthSet.add(month)
    }
  })
  rawMedOrders.value.forEach((o) => {
    const month = o.changeDate.slice(0, 7)
    if (month <= nowMonth) {
      monthSet.add(month)
    }
  })
  if (monthSet.size === 0) return []
  return Array.from(monthSet).sort().reverse().slice(0, 12)
})

const processedLabs = computed(() => {
  const data = {}
  rawLabReports.value.forEach((report) => {
    const monthKey = report.reportDate.slice(0, 7)
    for (const itemKey in report.data) {
      if (!data[itemKey]) data[itemKey] = {}
      if (!data[itemKey][monthKey]) {
        data[itemKey][monthKey] = report.data[itemKey]
      }
    }
  })
  for (const monthKey of timelineMonths.value) {
    const ca = data['Ca']?.[monthKey]
    const p = data['P']?.[monthKey]
    if (ca !== undefined && p !== undefined) {
      if (!data['CaXP']) data['CaXP'] = {}
      data['CaXP'][monthKey] = (ca * p).toFixed(2)
    }
  }
  return data
})

const processedOrders = computed(() => {
  const data = {}
  const sortedOrders = [...rawMedOrders.value].sort(
    (a, b) => new Date(b.changeDate) - new Date(a.changeDate),
  )
  sortedOrders.forEach((order) => {
    const monthKey = order.changeDate.slice(0, 7)
    if (!data[order.orderCode]) data[order.orderCode] = {}
    if (!data[order.orderCode][monthKey]) {
      data[order.orderCode][monthKey] = {
        dose: order.dose,
        unit: order.unit,
        frequency: order.frequency || order.note,
      }
    }
  })
  return data
})

const isDraftChanged = computed(() => {
  if (Object.keys(orderDraft).length === 0) return false
  return JSON.stringify(orderDraft) !== JSON.stringify(initialDraftState.value)
})

function initializeDraft() {
  const newDraft = {}
  allMedsMaster.forEach((med) => {
    const historicalOrdersForMed = processedOrders.value[med.code]
    let lastOrder = null
    if (historicalOrdersForMed && Object.keys(historicalOrdersForMed).length > 0) {
      const sortedMonths = Object.keys(historicalOrdersForMed).sort().reverse()
      const latestMonthForThisMed = sortedMonths[0]
      lastOrder = historicalOrdersForMed[latestMonthForThisMed]
    }
    newDraft[med.code] = {
      dose: lastOrder?.dose || '',
      frequency: lastOrder?.frequency || '',
    }
  })
  Object.assign(orderDraft, newDraft)
  initialDraftState.value = JSON.parse(JSON.stringify(newDraft))
}

function formatDateFromTimestamp(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function fetchData() {
  if (!props.patient?.id) {
    isLoading.value = false
    return
  }
  isLoading.value = true
  error.value = null
  try {
    const twoYearsAgo = new Date()
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2)
    const [reports, orders] = await Promise.all([
      labReportsApi.fetchAll([
        where('patientId', '==', props.patient.id),
        where('reportDate', '>=', twoYearsAgo),
        orderBy('reportDate', 'desc'),
      ]),
      ordersApi.fetchAll([
        where('patientId', '==', props.patient.id),
        where('changeDate', '>=', twoYearsAgo.toISOString().slice(0, 10)),
        orderBy('changeDate', 'desc'),
      ]),
    ])
    rawLabReports.value = reports.map((r) => ({
      ...r,
      reportDate: formatDateFromTimestamp(r.reportDate),
    }))
    rawMedOrders.value = orders
    initializeDraft()
  } catch (err) {
    console.error('獲取資料失敗:', err)
    error.value = err.message
  } finally {
    isLoading.value = false
  }
}

async function saveDraftOrders() {
  if (!isDraftChanged.value) {
    alert('藥囑草稿未變更，無需儲存。')
    return
  }
  isSubmitting.value = true
  const batch = writeBatch(db)

  try {
    const oldDraftsQuery = query(
      collection(db, 'medication_drafts'),
      where('patientId', '==', props.patient.id),
      where('targetMonth', '==', currentTargetMonth.value),
    )
    const oldDraftsSnapshot = await getDocs(oldDraftsQuery)
    oldDraftsSnapshot.forEach((doc) => batch.delete(doc.ref))

    for (const medCode in orderDraft) {
      const draft = orderDraft[medCode]
      if (draft.dose || draft.frequency) {
        const medInfo = allMedsMaster.find((m) => m.code === medCode)
        // ✨ 2. 使用正確的方式建立新的文件參照 ✨
        const newDraftRef = doc(collection(db, 'medication_drafts'))
        batch.set(newDraftRef, {
          patientId: props.patient.id,
          patientName: props.patient.name,
          medicalRecordNumber: props.patient.medicalRecordNumber,
          targetMonth: currentTargetMonth.value,
          status: 'pending',
          createdAt: new Date(),
          authorId: currentUser.value.uid,
          authorName: currentUser.value.name,
          orderCode: medInfo.code,
          orderName: medInfo.tradeName,
          orderType: medInfo.type,
          dose: draft.dose,
          unit: medInfo.unit,
          frequency: medInfo.type === 'oral' ? draft.frequency : '',
          note: medInfo.type === 'injection' ? draft.frequency : '',
        })
      }
    }

    await batch.commit()
    alert('藥囑草稿儲存成功！')
    initialDraftState.value = JSON.parse(JSON.stringify(orderDraft))
  } catch (error) {
    console.error('儲存藥囑草稿失敗:', error)
    alert(`儲存藥囑草稿時發生錯誤: ${error.message}`)
  } finally {
    isSubmitting.value = false
  }
}

function getAbnormalClass(itemKey, value) {
  const range = LAB_REFERENCE_RANGES[itemKey]
  if (!range || value === undefined) return ''
  if (range.min !== undefined && value < range.min) return 'value-low'
  if (range.max !== undefined && value > range.max) return 'value-high'
  return ''
}

watch(
  () => props.patient?.id,
  (newPatientId) => {
    rawLabReports.value = []
    rawMedOrders.value = []
    Object.keys(orderDraft).forEach((key) => delete orderDraft[key])
    initialDraftState.value = {}

    if (newPatientId) {
      fetchData()
    } else {
      isLoading.value = false
    }
  },
  { immediate: true },
)
</script>

<style scoped>
/* 所有樣式與前一版完全相同 */
.correlation-view-container {
  height: 100%;
  display: flex;
  flex-direction: column;
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
  flex-grow: 1;
}
.empty-state-in-content {
  text-align: center;
  color: #6c757d;
  padding: 2rem;
  background-color: #f8f9fa;
  border-top: 1px solid #dee2e6;
}
.empty-state-in-content .sub-text {
  font-size: 0.9rem;
  color: #adb5bd;
  margin-top: 0.5rem;
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

.correlation-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  height: 100%;
  min-height: 0;
}

.actions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem;
  background-color: #e9ecef;
  border-radius: 8px;
  flex-shrink: 0;
}
.header-info {
  font-weight: 500;
  color: #495057;
}
.actions-header button {
  padding: 0.5rem 1rem;
  border: none;
  background-color: #28a745;
  color: white;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.actions-header button:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.table-wrapper {
  overflow: auto;
  height: 100%;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}
.correlation-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}
.correlation-table th,
.correlation-table td {
  padding: 0.5rem;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
}

/* 凍結首欄 */
.sticky-col {
  position: sticky;
  left: 0;
  z-index: 2;
  font-weight: bold;
  min-width: 150px;
  border-right-width: 2px !important;
  border-right-color: #dee2e6 !important;
}
tbody .sticky-col {
  background-color: #f8f9fa;
  text-align: left !important;
}
thead .sticky-col {
  background-color: #f8f9fa;
  z-index: 4;
}

/* 凍結表頭 */
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 3;
}
.group-separator th {
  background-color: #343a40;
  color: white;
  text-align: center !important;
  padding: 0.5rem;
  position: sticky;
  top: 0;
  z-index: 3;
}

/* 草稿欄位樣式 */
.draft-col-header,
.draft-col {
  position: sticky;
  left: 150px; /* 等於 .sticky-col 的寬度 */
  z-index: 1;
  background-color: #fefbec;
  min-width: 240px;
  border-right-width: 2px !important;
  border-right-color: #dee2e6 !important;
}
thead .draft-col-header {
  background-color: #fffbe3;
  z-index: 3;
}

/* 歷史月份表頭樣式 */
.month-header {
  min-width: 120px;
  background-color: #f8f9fa;
}

.lab-item {
  padding-left: 1rem;
}
.med-item {
  padding-left: 2rem;
  font-weight: normal;
  color: #495057;
}
.no-data {
  color: #adb5bd;
}
.value-high {
  color: #dc3545;
  font-weight: bold;
}
.value-low {
  color: #007bff;
  font-weight: bold;
}

.order-input-cell {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 4px;
  padding: 2px;
  align-items: center;
}
.order-input-cell input {
  width: 100%;
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
}
.order-input-cell input:focus {
  outline: 2px solid #80bdff;
  border-color: #80bdff;
}
.unit-display {
  padding: 0 4px;
  font-size: 0.85em;
  color: #6c757d;
  font-weight: 500;
}
</style>
