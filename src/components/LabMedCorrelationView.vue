<!-- 檔案路徑: src/components/LabMedCorrelationView.vue -->
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
    <div v-else-if="reportMonths.length === 0" class="empty-state">
      <p>找不到該病人的檢驗報告或藥囑資料。</p>
    </div>
    <div v-else class="correlation-content">
      <!-- (1) 操作按鈕區域 -->
      <div class="actions-header">
        <div class="header-info">
          <i class="fas fa-edit"></i>
          為最新月份 ({{ latestMonth }}) 建立藥囑草稿
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
              <th v-for="month in reportMonths" :key="month" class="month-header">
                {{ month }}
              </th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in correlationGroups" :key="group.title">
              <!-- Group Header Row -->
              <tr class="group-separator">
                <th :colspan="reportMonths.length + 1">{{ group.title }}</th>
              </tr>
              <!-- Lab Item Rows -->
              <tr v-for="labKey in group.labKeys" :key="labKey">
                <td class="sticky-col lab-item">{{ labItemDisplayNames[labKey] || labKey }}</td>
                <td v-for="month in reportMonths" :key="month">
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
                <td v-for="(month, index) in reportMonths" :key="month">
                  <!-- 最新月份 (index 0) 顯示為輸入框 -->
                  <div v-if="index === 0" class="order-input-cell">
                    <input
                      type="text"
                      v-model="orderDraft[med.code].dose"
                      placeholder="劑量"
                      class="dose-input"
                    />
                    <input
                      type="text"
                      v-model="orderDraft[med.code].note"
                      :placeholder="med.type === 'injection' ? '備註' : '頻率'"
                      class="note-input"
                    />
                  </div>
                  <!-- 其他月份為唯讀顯示 -->
                  <span v-else>
                    <span v-if="processedOrders[med.tradeName]?.[month]">
                      {{ processedOrders[med.tradeName][month].dose }}
                      <small v-if="processedOrders[med.tradeName][month].note"
                        >({{ processedOrders[med.tradeName][month].note }})</small
                      >
                    </span>
                    <span v-else class="no-data">-</span>
                  </span>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
// ✨ 錯誤修復 1/2: 從正確的 firebase 設定檔中引入 db ✨
import { db } from '@/composables/useFirebase.js'
import { where, orderBy, writeBatch, query } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'

// --- Props & Emits ---
const props = defineProps({
  patient: Object,
})

// --- API, Auth & Constants ---
const labReportsApi = ApiManager('lab_reports')
const ordersApi = ApiManager('medication_orders')
const draftOrdersApi = ApiManager('medication_drafts')
const { currentUser } = useAuth()

// ... (常數定義與之前相同)
const correlationGroups = [
  {
    title: '貧血管理 (Anemia)',
    labKeys: ['Hb'],
    meds: [
      { code: 'INES2', tradeName: 'NESP', type: 'injection' },
      { code: 'IREC1', tradeName: 'Recormon', type: 'injection' },
    ],
  },
  {
    title: '鐵質狀態 (Iron Status)',
    labKeys: ['Ferritin', 'TSAT'],
    meds: [{ code: 'IFER2', tradeName: 'Fe-back', type: 'injection' }],
  },
  {
    title: '鈣磷代謝 (Mineral Metabolism)',
    labKeys: ['Ca', 'P', 'CaXP'],
    meds: [
      { code: 'OCAL1', tradeName: 'A-Cal', type: 'oral' },
      { code: 'OCAA', tradeName: 'Pro-Ca', type: 'oral' },
      { code: 'OFOS4', tradeName: 'Lanclean', type: 'oral' },
      { code: 'OALK1', tradeName: 'Alkantin', type: 'oral' },
    ],
  },
  {
    title: '副甲狀腺 (PTH)',
    labKeys: ['iPTH'],
    meds: [
      { code: 'ICAC', tradeName: 'Cacare', type: 'injection' },
      { code: 'IPAR1', tradeName: 'Parsabiv', type: 'injection' },
      { code: 'OUCA1', tradeName: 'U-Ca', type: 'oral' },
      { code: 'OORK', tradeName: 'Orkedia', type: 'oral' },
      { code: 'OVAF', tradeName: 'Vafseo', type: 'oral' },
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

// ... (Component State & Computed Properties 與之前相同)
const isLoading = ref(true)
const isSubmitting = ref(false)
const error = ref(null)
const rawLabReports = ref([])
const rawMedOrders = ref([])
const orderDraft = reactive({})
const initialDraftState = ref({})
const allMonths = computed(() => {
  const monthSet = new Set()
  rawLabReports.value.forEach((r) => monthSet.add(r.reportDate.slice(0, 7)))
  rawMedOrders.value.forEach((o) => monthSet.add(o.changeDate.slice(0, 7)))
  return Array.from(monthSet).sort().reverse()
})
const reportMonths = computed(() => allMonths.value.slice(0, 12))
const latestMonth = computed(() => reportMonths.value[0] || '')
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
  for (const monthKey of reportMonths.value) {
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
    if (!data[order.orderName]) data[order.orderName] = {}
    if (!data[order.orderName][monthKey]) {
      data[order.orderName][monthKey] = {
        dose: order.dose,
        note: order.note || order.frequency,
      }
    }
  })
  return data
})
const isDraftChanged = computed(() => {
  return JSON.stringify(orderDraft) !== JSON.stringify(initialDraftState.value)
})

// --- Methods ---
function initializeDraft() {
  const newDraft = {}
  allMedsMaster.forEach((med) => {
    const latestOrder = processedOrders.value[med.tradeName]?.[latestMonth.value]
    newDraft[med.code] = {
      dose: latestOrder?.dose || '',
      note: latestOrder?.note || '',
    }
  })
  Object.assign(orderDraft, newDraft)
  initialDraftState.value = JSON.parse(JSON.stringify(newDraft))
}

async function fetchData() {
  if (!props.patient?.id) return
  isLoading.value = true
  error.value = null
  try {
    const oneYearAgo = new Date()
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
    const [reports, orders] = await Promise.all([
      labReportsApi.fetchAll([
        where('patientId', '==', props.patient.id),
        where('reportDate', '>=', oneYearAgo.toISOString().slice(0, 10)),
        orderBy('reportDate', 'desc'),
      ]),
      ordersApi.fetchAll([
        where('patientId', '==', props.patient.id),
        where('changeDate', '>=', oneYearAgo.toISOString().slice(0, 10)),
        orderBy('changeDate', 'desc'),
      ]),
    ])
    rawLabReports.value = reports.map((r) => ({
      ...r,
      reportDate: r.reportDate.toDate
        ? r.reportDate.toDate().toISOString().slice(0, 10)
        : r.reportDate,
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
  // ✨ 錯誤修復 2/2: 直接使用從 useFirebase.js 引入的 db 實例 ✨
  const batch = writeBatch(db)

  try {
    const oldDraftsQuery = query(
      draftOrdersApi.collectionRef,
      where('patientId', '==', props.patient.id),
      where('targetMonth', '==', latestMonth.value),
    )
    const oldDraftsSnapshot = await draftOrdersApi.getDocs(oldDraftsQuery)
    oldDraftsSnapshot.forEach((doc) => batch.delete(doc.ref))

    for (const medCode in orderDraft) {
      const draft = orderDraft[medCode]
      if (draft.dose || draft.note) {
        const medInfo = allMedsMaster.find((m) => m.code === medCode)
        const newDraftRef = draftOrdersApi.doc()
        batch.set(newDraftRef, {
          patientId: props.patient.id,
          patientName: props.patient.name,
          medicalRecordNumber: props.patient.medicalRecordNumber,
          targetMonth: latestMonth.value,
          status: 'pending',
          createdAt: new Date(),
          authorId: currentUser.value.uid,
          authorName: currentUser.value.name,
          orderCode: medInfo.code,
          orderName: medInfo.tradeName,
          orderType: medInfo.type,
          dose: draft.dose,
          frequency: medInfo.type === 'oral' ? draft.note : '',
          note: medInfo.type === 'injection' ? draft.note : '',
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
    if (newPatientId) {
      fetchData()
    }
  },
  { immediate: true },
)
</script>

<style scoped>
/* 樣式與前一版完全相同，此處省略 */
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
  border-collapse: collapse;
}
.correlation-table th,
.correlation-table td {
  padding: 0.5rem;
  text-align: center;
  white-space: nowrap;
  border: 1px solid #e9ecef;
  min-width: 130px; /* 增加最小寬度以容納輸入框 */
}
.sticky-col {
  position: sticky;
  left: 0;
  background-color: #fff;
  z-index: 1;
  text-align: left !important;
  font-weight: bold;
  min-width: 150px;
}
thead .sticky-col {
  background-color: #f8f9fa;
  z-index: 3;
}
.group-separator th {
  background-color: #343a40;
  color: white;
  text-align: center !important;
  padding: 0.5rem;
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
  display: flex;
  gap: 4px;
  padding: 2px;
}
.order-input-cell input {
  width: 50%;
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
}
.order-input-cell input:focus {
  outline: 2px solid #80bdff;
  border-color: #80bdff;
}
</style>
