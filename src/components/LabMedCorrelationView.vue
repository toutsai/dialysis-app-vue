<!-- 檔案路徑: src/components/LabMedCorrelationView.vue (ReferenceError 修正版 v2) -->
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
      <div class="actions-header">
        <div class="header-info">
          <i class="fas fa-edit"></i>
          正在為 **{{ latestTimelineMonth }}** 建立/修改藥囑草稿
        </div>
        <button @click="saveDraftOrders" :disabled="isSubmitting || !isDraftChanged">
          <i v-if="isSubmitting" class="fas fa-spinner fa-spin"></i>
          {{ isSubmitting ? '儲存中...' : '儲存藥囑草稿' }}
        </button>
      </div>

      <!-- 貧血管理表格 -->
      <section class="data-group-section">
        <div class="table-wrapper">
          <table class="correlation-table">
            <thead>
              <tr class="main-header-row">
                <th :colspan="anemiaGroup.labKeys.length + 1">貧血管理 (Anemia)</th>
                <th
                  v-for="med in anemiaGroup.meds"
                  :key="med.code"
                  :colspan="2"
                  class="med-group-header"
                >
                  {{ med.tradeName }}
                </th>
              </tr>
              <tr class="sub-header-row">
                <th class="sticky-col first-col">年月</th>
                <th v-for="labKey in anemiaGroup.labKeys" :key="labKey" class="lab-header">
                  {{ labItemDisplayNames[labKey] || labKey }}
                </th>
                <template v-for="med in anemiaGroup.meds" :key="med.code + '-sub'">
                  <th>劑量</th>
                  <th>頻率/備註</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="month in timelineMonths" :key="month">
                <td class="sticky-col first-col">{{ month }}</td>
                <td v-for="labKey in anemiaGroup.labKeys" :key="labKey">
                  <span
                    v-if="processedLabs[labKey]?.[month] !== undefined"
                    :class="getAbnormalClass(labKey, processedLabs[labKey][month])"
                  >
                    {{ processedLabs[labKey][month] }}
                  </span>
                </td>
                <template v-for="med in anemiaGroup.meds" :key="med.code + '-data'">
                  <template v-if="month === latestTimelineMonth">
                    <td :colspan="2">
                      <div class="order-input-cell">
                        <input type="text" v-model="orderDraft[med.code].dose" placeholder="劑量" />
                        <span class="unit-display">{{ med.unit }}</span>
                        <input
                          type="text"
                          v-model="orderDraft[med.code].frequency"
                          :placeholder="med.type === 'injection' ? '備註' : '頻率'"
                        />
                      </div>
                    </td>
                  </template>
                  <template v-else>
                    <td>{{ processedOrders[med.code]?.[month]?.dose || '' }}</td>
                    <td>{{ processedOrders[med.code]?.[month]?.frequency || '' }}</td>
                  </template>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- 鈣磷代謝表格 -->
      <section class="data-group-section">
        <div class="table-wrapper">
          <table class="correlation-table">
            <thead>
              <tr class="main-header-row">
                <th :colspan="mineralGroup.labKeys.length + 1">鈣磷代謝 (Mineral Metabolism)</th>
                <th
                  :colspan="isCollapsed.phosphate ? 1 : phosphateBinderMeds.length * 2"
                  class="collapsible-header"
                  @click="toggleCollapse('phosphate')"
                >
                  降磷藥物
                  <i
                    class="fas"
                    :class="isCollapsed.phosphate ? 'fa-chevron-right' : 'fa-chevron-left'"
                  ></i>
                </th>
                <th
                  :colspan="isCollapsed.pth ? 1 : pthMeds.length * 2"
                  class="collapsible-header"
                  @click="toggleCollapse('pth')"
                >
                  副甲狀腺亢進藥物
                  <i
                    class="fas"
                    :class="isCollapsed.pth ? 'fa-chevron-right' : 'fa-chevron-left'"
                  ></i>
                </th>
              </tr>
              <tr class="sub-header-row">
                <th class="sticky-col first-col">年月</th>
                <th v-for="labKey in mineralGroup.labKeys" :key="labKey" class="lab-header">
                  {{ labItemDisplayNames[labKey] || labKey }}
                </th>
                <th v-if="isCollapsed.phosphate" class="placeholder-col">...</th>
                <template v-for="med in phosphateBinderMeds" v-else :key="med.code + '-sub'">
                  <th>{{ med.tradeName }} 劑量</th>
                  <th>頻率</th>
                </template>
                <th v-if="isCollapsed.pth" class="placeholder-col">...</th>
                <template v-for="med in pthMeds" v-else :key="med.code + '-sub'">
                  <th>{{ med.tradeName }} 劑量</th>
                  <th>頻率/備註</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="month in timelineMonths" :key="month">
                <td class="sticky-col first-col">{{ month }}</td>
                <td v-for="labKey in mineralGroup.labKeys" :key="labKey">
                  <span
                    v-if="processedLabs[labKey]?.[month] !== undefined"
                    :class="getAbnormalClass(labKey, processedLabs[labKey][month])"
                  >
                    {{ processedLabs[labKey][month] }}
                  </span>
                </td>
                <td v-if="isCollapsed.phosphate" class="placeholder-col"></td>
                <template v-for="med in phosphateBinderMeds" v-else :key="med.code + '-data'">
                  <template v-if="month === latestTimelineMonth">
                    <td :colspan="2">
                      <div class="order-input-cell">
                        <input type="text" v-model="orderDraft[med.code].dose" placeholder="劑量" />
                        <span class="unit-display">{{ med.unit }}</span>
                        <input
                          type="text"
                          v-model="orderDraft[med.code].frequency"
                          :placeholder="med.type === 'injection' ? '備註' : '頻率'"
                        />
                      </div>
                    </td>
                  </template>
                  <template v-else>
                    <td>{{ processedOrders[med.code]?.[month]?.dose || '' }}</td>
                    <td>{{ processedOrders[med.code]?.[month]?.frequency || '' }}</td>
                  </template>
                </template>
                <td v-if="isCollapsed.pth" class="placeholder-col"></td>
                <template v-for="med in pthMeds" v-else :key="med.code + '-data'">
                  <template v-if="month === latestTimelineMonth">
                    <td :colspan="2">
                      <div class="order-input-cell">
                        <input type="text" v-model="orderDraft[med.code].dose" placeholder="劑量" />
                        <span class="unit-display">{{ med.unit }}</span>
                        <input
                          type="text"
                          v-model="orderDraft[med.code].frequency"
                          :placeholder="med.type === 'injection' ? '備註' : '頻率'"
                        />
                      </div>
                    </td>
                  </template>
                  <template v-else>
                    <td>{{ processedOrders[med.code]?.[month]?.dose || '' }}</td>
                    <td>{{ processedOrders[med.code]?.[month]?.frequency || '' }}</td>
                  </template>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { db } from '@/composables/useFirebase.js'
import { where, orderBy, writeBatch, query, collection, getDocs, doc } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'

const props = defineProps({
  patient: Object,
})

const labReportsApi = ApiManager('lab_reports')
const ordersApi = ApiManager('medication_orders')
const draftOrdersApi = ApiManager('medication_drafts')
const { currentUser } = useAuth()

const anemiaGroup = {
  labKeys: ['Hb', 'Ferritin', 'TSAT'],
  meds: [
    { code: 'INES2', tradeName: 'NESP', type: 'injection', unit: 'mcg' },
    { code: 'IREC1', tradeName: 'Recormon', type: 'injection', unit: 'U' },
    { code: 'OVAF', tradeName: 'Vafseo', type: 'oral', unit: 'mg' },
    { code: 'IFER2', tradeName: 'Fe-back', type: 'injection', unit: 'mg' },
  ],
}

const mineralGroup = {
  labKeys: ['Ca', 'P', 'iPTH'],
  meds: [
    { code: 'OCAL1', tradeName: 'A-Cal', type: 'oral', group: 'phosphate', unit: '顆' },
    { code: 'OCAA', tradeName: 'Pro-Ca', type: 'oral', group: 'phosphate', unit: '顆' },
    { code: 'OFOS4', tradeName: 'Lanclean', type: 'oral', group: 'phosphate', unit: 'gm' },
    { code: 'OALK1', tradeName: 'Alkantin', type: 'oral', group: 'phosphate', unit: '顆' },
    { code: 'ICAC', tradeName: 'Cacare', type: 'injection', group: 'pth', unit: 'amp' },
    { code: 'OUCA1', tradeName: 'U-Ca', type: 'oral', group: 'pth', unit: '顆' },
    { code: 'IPAR1', tradeName: 'Parsabiv', type: 'injection', group: 'pth', unit: 'mg' },
    { code: 'OORK', tradeName: 'Orkedia', type: 'oral', group: 'pth', unit: 'mcg' },
  ],
}

// ✨ 修正：將 allMedsMaster 改為 computed 屬性，並增加保護 ✨
const allMedsMaster = computed(() => [...(anemiaGroup.meds || []), ...(mineralGroup.meds || [])])

const labItemDisplayNames = {
  Hb: 'Hb',
  Ferritin: 'Ferritin',
  TSAT: 'TSAT',
  Ca: 'Ca',
  P: 'P',
  iPTH: 'iPTH',
}
const LAB_REFERENCE_RANGES = {
  Hb: { min: 8, max: 12 },
  P: { max: 5.5 },
  iPTH: { min: 150, max: 300 },
  Ca: { min: 8.6, max: 10.3 },
  Ferritin: { max: 800 },
}

const isLoading = ref(true)
const isSubmitting = ref(false)
const error = ref(null)
const rawLabReports = ref([])
const rawMedOrders = ref([])
const isCollapsed = reactive({
  phosphate: false,
  pth: false,
})
const orderDraft = reactive({})
const initialDraftState = ref({})

const currentTargetMonth = computed(() => {
  const now = new Date()
  const year = now.getFullYear()
  const month = (now.getMonth() + 1).toString().padStart(2, '0')
  return `${year}-${month}`
})

// ✨ 1. 新增：用於解析藥囑日期的輔助函式 ✨
const formatOrderDateToYearMonth = (dateString) => {
  if (!dateString || typeof dateString !== 'string' || dateString.length < 6) {
    return null
  }
  const year = dateString.substring(0, 4)
  const month = dateString.substring(4, 6)
  return `${year}-${month}`
}

const timelineMonths = computed(() => {
  const monthSet = new Set()
  const nowMonth = currentTargetMonth.value
  rawLabReports.value.forEach((r) => {
    const month = r.reportDate.slice(0, 7)
    if (month <= nowMonth) monthSet.add(month)
  })
  rawMedOrders.value.forEach((o) => {
    // ✨ 2. 使用新的輔助函式來解析藥囑日期 ✨
    const month = formatOrderDateToYearMonth(o.changeDate)
    if (month && month <= nowMonth) {
      monthSet.add(month)
    }
  })
  if (monthSet.size === 0) return []
  return Array.from(monthSet).sort().reverse().slice(0, 12)
})

const latestTimelineMonth = computed(() => timelineMonths.value[0] || '')

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
  return data
})

const processedOrders = computed(() => {
  const data = {}
  const sortedOrders = [...rawMedOrders.value].sort(
    (a, b) => b.changeDate.localeCompare(a.changeDate), // 字串比較即可
  )
  sortedOrders.forEach((order) => {
    // ✨ 3. 使用新的輔助函式來解析藥囑日期 ✨
    const monthKey = formatOrderDateToYearMonth(order.changeDate)
    if (!monthKey) return // 如果日期格式不對，就跳過

    if (!data[order.orderCode]) data[order.orderCode] = {}
    if (!data[order.orderCode][monthKey]) {
      data[order.orderCode][monthKey] = {
        dose: order.dose,
        frequency: order.frequency || order.note,
      }
    }
  })
  return data
})

const phosphateBinderMeds = computed(() => mineralGroup.meds.filter((m) => m.group === 'phosphate'))
const pthMeds = computed(() => mineralGroup.meds.filter((m) => m.group === 'pth'))

const isDraftChanged = computed(() => {
  if (Object.keys(orderDraft).length === 0) return false
  return JSON.stringify(orderDraft) !== JSON.stringify(initialDraftState.value)
})

function initializeDraft() {
  const newDraft = {}
  const targetMonth = latestTimelineMonth.value

  allMedsMaster.value.forEach((med) => {
    const orderInLatestMonth = processedOrders.value[med.code]?.[targetMonth]
    newDraft[med.code] = {
      dose: orderInLatestMonth?.dose || '',
      frequency: orderInLatestMonth?.frequency || '',
    }
  })

  Object.assign(orderDraft, newDraft)
  initialDraftState.value = JSON.parse(JSON.stringify(newDraft))
}

const formatDateFromTimestamp = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
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
        where('changeDate', '>=', twoYearsAgo.toISOString().slice(0, 10).replace(/-/g, '')), // 查詢也用無分隔符格式
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
      where('targetMonth', '==', latestTimelineMonth.value),
    )
    const oldDraftsSnapshot = await getDocs(oldDraftsQuery)
    oldDraftsSnapshot.forEach((doc) => batch.delete(doc.ref))
    for (const medCode in orderDraft) {
      const draft = orderDraft[medCode]
      if (draft.dose || draft.frequency) {
        const medInfo = allMedsMaster.value.find((m) => m.code === medCode)
        const newDraftRef = doc(collection(db, 'medication_drafts'))
        batch.set(newDraftRef, {
          patientId: props.patient.id,
          patientName: props.patient.name,
          medicalRecordNumber: props.patient.medicalRecordNumber,
          targetMonth: latestTimelineMonth.value,
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
    await fetchData()
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

function toggleCollapse(group) {
  isCollapsed[group] = !isCollapsed[group]
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
  gap: 1.5rem;
  height: 100%;
  overflow: auto;
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

.data-group-section {
  width: 100%;
}

.table-wrapper {
  width: 100%;
  overflow-x: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}
.correlation-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  min-width: max-content;
}
.correlation-table th,
.correlation-table td {
  padding: 0.75rem;
  text-align: center;
  white-space: nowrap;
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
  min-width: 100px;
}
.correlation-table tr th:first-child,
.correlation-table tr td:first-child {
  border-left: none;
}
.correlation-table tr:last-child td {
  border-bottom: none;
}
.correlation-table th:last-of-type,
.correlation-table td:last-of-type {
  border-right: none;
}
.correlation-table .order-input-cell {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 4px;
  padding: 2px;
  align-items: center;
}
.correlation-table .order-input-cell input {
  width: 100%;
  border: 1px solid #ced4da;
  border-radius: 4px;
  padding: 4px;
  text-align: center;
}
.correlation-table .order-input-cell input:focus {
  outline: 2px solid #80bdff;
  border-color: #80bdff;
}
.correlation-table .unit-display {
  padding: 0 4px;
  font-size: 0.85em;
  color: #6c757d;
  font-weight: 500;
}

/* 表頭樣式 */
.main-header-row th {
  background-color: #004a99;
  color: white;
  font-size: 1.1rem;
  position: sticky;
  top: 0;
  z-index: 2;
}
.med-group-header,
.collapsible-header {
  background-color: #0056b3;
}
.sub-header-row th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 45px;
  z-index: 2;
}

/* 首欄固定 */
.sticky-col.first-col {
  position: sticky;
  left: 0;
  z-index: 1;
  font-weight: bold;
  background-color: #f8f9fa;
  border-right: 2px solid #dee2e6 !important;
  min-width: 120px;
}
thead .sticky-col.first-col {
  z-index: 3;
}

/* 可收合表頭 */
.collapsible-header {
  cursor: pointer;
  user-select: none;
}
.collapsible-header:hover {
  background-color: #004a99;
}
.collapsible-header i {
  margin-left: 0.5rem;
  transition: transform 0.2s ease-in-out;
}
.collapsible-header i.fa-chevron-right {
  transform: rotate(90deg);
}
.collapsible-header i.fa-chevron-left {
  transform: rotate(0deg);
}

.placeholder-col {
  padding: 0.75rem 0.5rem !important;
  min-width: 40px !important;
  width: 40px !important;
  max-width: 40px !important;
}

/* 資料格樣式 */
.value-high {
  color: #dc3545;
  font-weight: bold;
}
.value-low {
  color: #007bff;
  font-weight: bold;
}
</style>
