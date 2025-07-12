<!-- 檔案路徑: src/components/DialysisOrderModal.vue (已修正) -->
<script setup>
import { ref, reactive, watch, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where, orderBy, limit } from 'firebase/firestore'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps({
  isVisible: Boolean,
  patientData: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['close', 'save', 'delete-order'])

const ordersHistoryApi = ApiManager('dialysis_orders_history')
const orderHistory = ref([])
const isLoadingHistory = ref(false)
const isConfirmDeleteVisible = ref(false)
const orderToDelete = ref(null)

const akOptions = [
  '13M',
  '15S',
  '17UX',
  '17HX',
  'FX80',
  'BG-1.8U',
  'Pro-19H',
  '21S',
  'Hi23',
  '25S',
  'CTA2000',
]
const caOptions = ['2.5', '3.0', '3.5']

const localOrderData = reactive({
  ak: '',
  dialysateCa: '',
  heparinInitial: '',
  heparinMaintenance: '',
  bloodFlow: '',
  dryWeight: '',
  effectiveDate: '',
})

const todayStr = computed(() => new Date().toISOString().slice(0, 10))

const activeOrder = computed(() => {
  const effectiveOrders = orderHistory.value
    .filter((o) => o.orders.effectiveDate <= todayStr.value)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  return effectiveOrders.length > 0 ? effectiveOrders[0] : null
})

const pendingOrders = computed(() => {
  return orderHistory.value
    .filter((o) => o.orders.effectiveDate > todayStr.value)
    .sort((a, b) => new Date(a.orders.effectiveDate) - new Date(b.orders.effectiveDate))
})

const archivedOrders = computed(() => {
  const activeId = activeOrder.value ? activeOrder.value.id : null
  const pendingIds = new Set(pendingOrders.value.map((p) => p.id))

  return orderHistory.value
    .filter((o) => o.id !== activeId && !pendingIds.has(o.id))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
})

async function fetchOrderHistory(patientId) {
  if (!patientId) return
  isLoadingHistory.value = true
  orderHistory.value = []
  try {
    const queryConstraints = [
      where('patientId', '==', patientId),
      orderBy('updatedAt', 'desc'),
      limit(20),
    ]
    const historyData = await ordersHistoryApi.fetchAll(queryConstraints)
    orderHistory.value = historyData
  } catch (error) {
    console.error('讀取醫囑歷史失敗:', error)
  } finally {
    isLoadingHistory.value = false
  }
}

watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue && props.patientData) {
      const orders = props.patientData.dialysisOrders || {}
      localOrderData.ak = orders.ak || ''
      localOrderData.dialysateCa = orders.dialysateCa || ''
      localOrderData.heparinInitial = orders.heparinInitial || ''
      localOrderData.heparinMaintenance = orders.heparinMaintenance || ''
      localOrderData.bloodFlow = orders.bloodFlow || ''
      localOrderData.dryWeight = orders.dryWeight || ''
      localOrderData.effectiveDate = orders.effectiveDate || new Date().toISOString().slice(0, 10)

      fetchOrderHistory(props.patientData.id)
    } else {
      orderHistory.value = []
    }
  },
)

function handleSave() {
  emit('save', { ...localOrderData })
}

function handleClose() {
  emit('close')
}

function requestDeleteOrder(record) {
  orderToDelete.value = record
  isConfirmDeleteVisible.value = true
}

async function confirmDelete() {
  if (!orderToDelete.value) return
  try {
    await ordersHistoryApi.delete(orderToDelete.value.id)
    orderHistory.value = orderHistory.value.filter((item) => item.id !== orderToDelete.value.id)
  } catch (error) {
    console.error('刪除醫囑歷史失敗:', error)
  } finally {
    isConfirmDeleteVisible.value = false
    orderToDelete.value = null
  }
}

function formatDate(isoString) {
  if (!isoString) return 'N/A'
  const date = typeof isoString.toDate === 'function' ? isoString.toDate() : new Date(isoString)
  if (isNaN(date.getTime())) return 'N/A'
  return date.toISOString().slice(0, 10)
}

function getComparisonClass(currentValue, previousValue) {
  if (previousValue === undefined) return ''
  return (currentValue || '') !== (previousValue || '') ? 'is-changed' : ''
}
</script>

<template>
  <div>
    <div v-if="isVisible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog-content">
        <div class="dialog-header">
          <h2>{{ patientData?.name }} - 透析醫囑</h2>
          <button @click="handleClose" class="close-btn">×</button>
        </div>

        <div class="form-section">
          <form @submit.prevent="handleSave" class="order-form">
            <div class="form-grid">
              <div class="form-group full-width">
                <label for="effectiveDate">醫囑生效日期</label>
                <input id="effectiveDate" v-model="localOrderData.effectiveDate" type="date" />
              </div>
              <div class="form-group">
                <label for="ak">人工腎臟 (AK)</label>
                <select id="ak" v-model="localOrderData.ak">
                  <option disabled value="">請選擇...</option>
                  <option v-for="option in akOptions" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label for="dialysateCa">透析液鈣離子 (Ca)</label>
                <select id="dialysateCa" v-model="localOrderData.dialysateCa">
                  <option disabled value="">請選擇...</option>
                  <option v-for="option in caOptions" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label for="dryWeight">乾體重 (DW)</label>
                <input
                  id="dryWeight"
                  v-model="localOrderData.dryWeight"
                  type="number"
                  step="0.1"
                  placeholder="單位: kg"
                />
              </div>
              <div class="form-group">
                <label for="bloodFlow">血液流速 (BF)</label>
                <input
                  id="bloodFlow"
                  v-model="localOrderData.bloodFlow"
                  type="number"
                  placeholder="ml/min"
                />
              </div>
              <div class="form-group">
                <label for="heparinInitial">Heparin 初劑量</label>
                <input
                  id="heparinInitial"
                  v-model="localOrderData.heparinInitial"
                  type="number"
                  placeholder="單位: u"
                />
              </div>
              <div class="form-group">
                <label for="heparinMaintenance">Heparin 維持劑量</label>
                <input
                  id="heparinMaintenance"
                  v-model="localOrderData.heparinMaintenance"
                  type="number"
                  placeholder="單位: u/hr"
                />
              </div>
            </div>
          </form>
        </div>

        <div class="history-section">
          <h3 class="history-title">醫囑歷史</h3>
          <div class="history-table-wrapper">
            <div v-if="isLoadingHistory" class="loading-state">載入中...</div>
            <table v-else-if="orderHistory.length > 0">
              <thead>
                <tr>
                  <th class="col-action">操作</th>
                  <th>狀態</th>
                  <th>修改日期</th>
                  <th>生效日期</th>
                  <th>DW</th>
                  <th>BF</th>
                  <th>AK</th>
                  <th>Ca</th>
                  <th>Heparin</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="activeOrder" class="active-order">
                  <td class="col-action">
                    <button
                      @click="requestDeleteOrder(activeOrder)"
                      class="btn-delete"
                      title="刪除此筆歷史"
                    >
                      ×
                    </button>
                  </td>
                  <td><span class="status-tag active">最新</span></td>
                  <td>{{ formatDate(activeOrder.updatedAt) }}</td>
                  <!-- ✨ 核心修正點 1：拿「新」的 activeOrder 去跟「舊」的 archivedOrders[0] (或 pendingOrders) 比較 ✨ -->
                  <td
                    :class="
                      getComparisonClass(
                        activeOrder.orders.effectiveDate,
                        (archivedOrders[0] || pendingOrders[0])?.orders.effectiveDate,
                      )
                    "
                  >
                    {{ formatDate(activeOrder.orders.effectiveDate) }}
                  </td>
                  <td
                    :class="
                      getComparisonClass(
                        activeOrder.orders.dryWeight,
                        (archivedOrders[0] || pendingOrders[0])?.orders.dryWeight,
                      )
                    "
                  >
                    {{ activeOrder.orders.dryWeight || '–' }}
                  </td>
                  <td
                    :class="
                      getComparisonClass(
                        activeOrder.orders.bloodFlow,
                        (archivedOrders[0] || pendingOrders[0])?.orders.bloodFlow,
                      )
                    "
                  >
                    {{ activeOrder.orders.bloodFlow || '–' }}
                  </td>
                  <td
                    :class="
                      getComparisonClass(
                        activeOrder.orders.ak,
                        (archivedOrders[0] || pendingOrders[0])?.orders.ak,
                      )
                    "
                  >
                    {{ activeOrder.orders.ak || '–' }}
                  </td>
                  <td
                    :class="
                      getComparisonClass(
                        activeOrder.orders.dialysateCa,
                        (archivedOrders[0] || pendingOrders[0])?.orders.dialysateCa,
                      )
                    "
                  >
                    {{ activeOrder.orders.dialysateCa || '–' }}
                  </td>
                  <td
                    :class="
                      getComparisonClass(
                        `${activeOrder.orders.heparinInitial || ''}/${activeOrder.orders.heparinMaintenance || ''}`,
                        `${(archivedOrders[0] || pendingOrders[0])?.orders.heparinInitial || ''}/${(archivedOrders[0] || pendingOrders[0])?.orders.heparinMaintenance || ''}`,
                      )
                    "
                  >
                    {{ activeOrder.orders.heparinInitial || '–' }}/{{
                      activeOrder.orders.heparinMaintenance || '–'
                    }}
                  </td>
                </tr>

                <tr
                  v-for="(record, index) in pendingOrders"
                  :key="`pending-${record.id}`"
                  class="pending-order"
                >
                  <td class="col-action">
                    <button
                      @click="requestDeleteOrder(record)"
                      class="btn-delete"
                      title="刪除此筆歷史"
                    >
                      ×
                    </button>
                  </td>
                  <td><span class="status-tag pending">未生效</span></td>
                  <td>{{ formatDate(record.updatedAt) }}</td>
                  <!-- 未生效的醫囑，我們通常不進行比較，因為它們還沒有基準 -->
                  <td>{{ formatDate(record.orders.effectiveDate) }}</td>
                  <td>{{ record.orders.dryWeight || '–' }}</td>
                  <td>{{ record.orders.bloodFlow || '–' }}</td>
                  <td>{{ record.orders.ak || '–' }}</td>
                  <td>{{ record.orders.dialysateCa || '–' }}</td>
                  <td>
                    {{ record.orders.heparinInitial || '–' }}/{{
                      record.orders.heparinMaintenance || '–'
                    }}
                  </td>
                </tr>

                <!-- ✨ 核心修正點 2：歷史紀錄現在不需要高亮，因為高亮顯示在「最新」那一行 ✨ -->
                <tr v-for="record in archivedOrders" :key="`archived-${record.id}`">
                  <td class="col-action">
                    <button
                      @click="requestDeleteOrder(record)"
                      class="btn-delete"
                      title="刪除此筆歷史"
                    >
                      ×
                    </button>
                  </td>
                  <td><span class="status-tag history">歷史</span></td>
                  <td>{{ formatDate(record.updatedAt) }}</td>
                  <td>{{ formatDate(record.orders.effectiveDate) }}</td>
                  <td>{{ record.orders.dryWeight || '–' }}</td>
                  <td>{{ record.orders.bloodFlow || '–' }}</td>
                  <td>{{ record.orders.ak || '–' }}</td>
                  <td>{{ record.orders.dialysateCa || '–' }}</td>
                  <td>
                    {{ record.orders.heparinInitial || '–' }}/{{
                      record.orders.heparinMaintenance || '–'
                    }}
                  </td>
                </tr>
              </tbody>
            </table>
            <div v-else class="empty-state">無歷史紀錄</div>
          </div>
        </div>

        <div class="dialog-footer">
          <button @click="handleSave" class="btn-save">儲存醫囑</button>
          <button @click="handleClose" class="btn-cancel">取消</button>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :is-visible="isConfirmDeleteVisible"
      title="確認刪除"
      message="您確定要永久刪除這筆醫囑歷史紀錄嗎？此操作無法復原。"
      @confirm="confirmDelete"
      @cancel="isConfirmDeleteVisible = false"
    />
  </div>
</template>

<style scoped>
/* ✨ CSS 核心修改點：使用 Flexbox 佈局 ✨ */
.dialog-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 900px; /* 稍微加寬以容納新欄位 */
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}
.dialog-header,
.dialog-footer {
  flex-shrink: 0; /* 確保頭尾不被壓縮 */
}
.form-section {
  flex-shrink: 0;
  padding: 1rem 1.5rem;
}
.history-section {
  flex-grow: 1; /* 讓歷史區塊填滿剩餘空間 */
  padding: 0 1.5rem 1rem;
  overflow-y: hidden; /* 自身不滾動 */
  display: flex;
  flex-direction: column;
}
.history-table-wrapper {
  flex-grow: 1; /* 讓表格 wrapper 填滿歷史區塊的剩餘空間 */
  overflow-y: auto; /* ✨ 只有表格滾動 ✨ */
  border: 1px solid #ddd;
  border-radius: 4px;
}

/* 其他樣式調整 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.dialog-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e5e5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.dialog-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #333;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #aaa;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
.form-group {
  display: flex;
  flex-direction: column;
}
.form-group.full-width {
  grid-column: 1 / -1;
}
.form-group label {
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #555;
}
.form-group input,
.form-group select {
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
  background-color: white;
}
.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.history-title {
  margin-top: 0;
  margin-bottom: 0.5rem;
  font-size: 1.2rem;
  color: #333;
}
.history-table-wrapper table {
  width: 100%;
  border-collapse: collapse;
}
.history-table-wrapper th,
.history-table-wrapper td {
  padding: 8px 12px;
  text-align: center;
  border-bottom: 1px solid #ddd;
  white-space: nowrap;
}
.history-table-wrapper th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}
.history-table-wrapper tr:last-child td {
  border-bottom: none;
}
.col-action {
  width: 50px;
}
.btn-delete {
  background: none;
  border: 1px solid #e53e3e;
  color: #e53e3e;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-weight: bold;
  line-height: 1;
  padding: 0;
  transition: all 0.2s;
}
.btn-delete:hover {
  background-color: #e53e3e;
  color: white;
}

.status-tag {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
  color: white;
}
.status-tag.active {
  background-color: #38a169; /* 綠色 */
}
.status-tag.pending {
  background-color: #f97316; /* 橘色 */
}
.status-tag.history {
  background-color: #718096; /* 灰色 */
}
tr.active-order {
  background-color: #f0fff4;
  font-weight: 500;
}
tr.active-order td {
  font-weight: bold;
}
tr.active-order td:nth-child(2) {
  border-left: 4px solid #38a169;
}
tr.pending-order {
  background-color: #fffbeb;
}
tr.pending-order td:nth-child(2) {
  border-left: 4px solid #f97316;
}

.loading-state,
.empty-state {
  padding: 2rem;
  text-align: center;
  color: #6c757d;
}

.dialog-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e5e5;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  background-color: #f8f9fa;
}
.dialog-footer button {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: bold;
  cursor: pointer;
}
.btn-cancel {
  background-color: #6c757d;
  color: white;
}
.btn-save {
  background-color: #007bff;
  color: white;
}

.is-changed {
  color: #dc3545; /* 紅色 */
  font-weight: bold;
}
</style>
