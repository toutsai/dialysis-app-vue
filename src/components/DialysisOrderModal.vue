<!-- 檔案路徑: src/components/DialysisOrderModal.vue (✨ 最終功能增強版 ✨) -->
<script setup>
import { ref, reactive, watch, computed } from 'vue'
import { where, orderBy, limit } from 'firebase/firestore'
import {
  fetchDialysisOrderHistory as optimizedFetchDialysisOrderHistory,
  deleteDialysisOrderHistory as optimizedDeleteDialysisOrderHistory,
} from '@/services/optimizedApiService.js'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps({
  isVisible: Boolean,
  patientData: {
    type: Object,
    default: () => null,
  },
})

const emit = defineEmits(['close', 'save'])

const orderHistory = ref([])
const isLoadingHistory = ref(false)
const isConfirmDeleteVisible = ref(false)
const orderToDelete = ref(null)

// ✅ 選項列表
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
  '25H',
  'CTA2000',
]
const caOptions = ['2.5', '3.0', '3.5']
// ✨ 新增：血管通路和穿刺針選項
const vascAccessOptions = ['D/L', 'Perm', 'AVF', 'AVG']
const needleSizeOptions = ['15G', '16G', '17G']

const localOrderData = reactive({
  ak: '',
  dialysateCa: '',
  heparinInitial: '',
  heparinMaintenance: '',
  bloodFlow: '',
  dryWeight: '',
  effectiveDate: '',
  // ✨ 新增：表單資料欄位
  vascAccess: '',
  arterialNeedle: '',
  venousNeedle: '',
})

// ✨ 新增：計算屬性，判斷是否需要顯示穿刺針選項
const shouldShowNeedleSize = computed(() => {
  return localOrderData.vascAccess === 'AVF' || localOrderData.vascAccess === 'AVG'
})

const getDate = (dateValue) => {
  if (!dateValue) return null
  if (typeof dateValue.toDate === 'function') {
    return dateValue.toDate()
  }
  const date = new Date(dateValue)
  return isNaN(date.getTime()) ? null : date
}

const todayStr = computed(() => new Date().toISOString().slice(0, 10))

const activeOrder = computed(() => {
  const effectiveOrders = orderHistory.value
    .filter((o) => o.orders.effectiveDate <= todayStr.value)
    .sort((a, b) => getDate(b.updatedAt) - getDate(a.updatedAt))
  return effectiveOrders.length > 0 ? effectiveOrders[0] : null
})

const pendingOrders = computed(() => {
  return orderHistory.value
    .filter((o) => o.orders.effectiveDate > todayStr.value)
    .sort((a, b) => getDate(a.orders.effectiveDate) - getDate(b.orders.effectiveDate))
})

const archivedOrders = computed(() => {
  const activeId = activeOrder.value ? activeOrder.value.id : null
  const pendingIds = new Set(pendingOrders.value.map((p) => p.id))

  return orderHistory.value
    .filter((o) => o.id !== activeId && !pendingIds.has(o.id))
    .sort((a, b) => getDate(b.updatedAt) - getDate(a.updatedAt))
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
    const historyData = await optimizedFetchDialysisOrderHistory(queryConstraints)
    orderHistory.value = historyData
  } catch (error) {
    console.error('❌ [DialysisOrderModal] 讀取醫囑歷史失敗:', error)
    alert(`載入醫囑歷史失敗：${error.message}`)
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
      // ✨ 新增：初始化新欄位的資料
      localOrderData.vascAccess = orders.vascAccess || ''
      localOrderData.arterialNeedle = orders.arterialNeedle || ''
      localOrderData.venousNeedle = orders.venousNeedle || ''

      fetchOrderHistory(props.patientData.id)
    } else {
      orderHistory.value = []
    }
  },
)

// ✨ 新增：當血管通路改變時，如果不是 AVF/AVG，就清空穿刺針大小
watch(
  () => localOrderData.vascAccess,
  (newValue) => {
    if (newValue !== 'AVF' && newValue !== 'AVG') {
      localOrderData.arterialNeedle = ''
      localOrderData.venousNeedle = ''
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
  if (!record || !record.id) {
    console.error('❌ [DialysisOrderModal] 無效的刪除記錄:', record)
    alert('錯誤：無法識別要刪除的記錄')
    return
  }
  orderToDelete.value = record
  isConfirmDeleteVisible.value = true
}

async function confirmDelete() {
  if (!orderToDelete.value || !orderToDelete.value.id) {
    console.error('❌ [DialysisOrderModal] 刪除操作：缺少有效的記錄ID')
    alert('錯誤：無法識別要刪除的記錄')
    return
  }

  const recordId = orderToDelete.value.id
  const patientName = orderToDelete.value.patientName || '未知患者'

  try {
    await optimizedDeleteDialysisOrderHistory(recordId)
    orderHistory.value = orderHistory.value.filter((item) => item.id !== recordId)
    alert(`成功刪除 ${patientName} 的醫囑歷史記錄`)
  } catch (error) {
    console.error('❌ [DialysisOrderModal] 刪除醫囑歷史失敗:', error)
    alert(`刪除失敗：${error.message}`)
  } finally {
    isConfirmDeleteVisible.value = false
    orderToDelete.value = null
  }
}

function formatDate(isoString) {
  if (!isoString) return 'N/A'
  const date = getDate(isoString)
  if (!date) return 'N/A'
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

              <!-- ✨ 新增：血管通路和穿刺針表單欄位 -->
              <div class="form-group">
                <label for="vascAccess">血管通路</label>
                <select id="vascAccess" v-model="localOrderData.vascAccess">
                  <option disabled value="">請選擇...</option>
                  <option v-for="option in vascAccessOptions" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
              </div>

              <div v-if="shouldShowNeedleSize" class="form-group needle-group">
                <div class="sub-group">
                  <label for="arterialNeedle">動脈穿刺針</label>
                  <select id="arterialNeedle" v-model="localOrderData.arterialNeedle">
                    <option disabled value="">大小...</option>
                    <option v-for="size in needleSizeOptions" :key="`a-${size}`" :value="size">
                      {{ size }}
                    </option>
                  </select>
                </div>
                <div class="sub-group">
                  <label for="venousNeedle">靜脈穿刺針</label>
                  <select id="venousNeedle" v-model="localOrderData.venousNeedle">
                    <option disabled value="">大小...</option>
                    <option v-for="size in needleSizeOptions" :key="`v-${size}`" :value="size">
                      {{ size }}
                    </option>
                  </select>
                </div>
              </div>
              <!-- ✨ 新增結束 -->

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
                  v-model.number="localOrderData.dryWeight"
                  type="number"
                  step="0.1"
                  placeholder="單位: kg"
                />
              </div>
              <div class="form-group">
                <label for="bloodFlow">血液流速 (BF)</label>
                <input
                  id="bloodFlow"
                  v-model.number="localOrderData.bloodFlow"
                  type="number"
                  placeholder="ml/min"
                />
              </div>
              <div class="form-group">
                <label for="heparinInitial">Heparin 初劑量</label>
                <input
                  id="heparinInitial"
                  v-model.number="localOrderData.heparinInitial"
                  type="number"
                  placeholder="單位: u"
                />
              </div>
              <div class="form-group">
                <label for="heparinMaintenance">Heparin 維持劑量</label>
                <input
                  id="heparinMaintenance"
                  v-model.number="localOrderData.heparinMaintenance"
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
                  <th>生效日</th>
                  <!-- ✨ 新增：歷史表格欄位 -->
                  <th>通路/穿刺針</th>
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
                  <td>{{ formatDate(activeOrder.orders.effectiveDate) }}</td>
                  <!-- ✨ 新增：歷史表格資料 -->
                  <td>
                    {{ activeOrder.orders.vascAccess || '–' }}
                    <span
                      v-if="activeOrder.orders.arterialNeedle || activeOrder.orders.venousNeedle"
                    >
                      ({{ activeOrder.orders.arterialNeedle || 'N/A' }}/{{
                        activeOrder.orders.venousNeedle || 'N/A'
                      }})
                    </span>
                  </td>
                  <td>{{ activeOrder.orders.dryWeight ?? '–' }}</td>
                  <td>{{ activeOrder.orders.bloodFlow ?? '–' }}</td>
                  <td>{{ activeOrder.orders.ak || '–' }}</td>
                  <td>{{ activeOrder.orders.dialysateCa || '–' }}</td>
                  <td>
                    {{ activeOrder.orders.heparinInitial ?? '–' }}/{{
                      activeOrder.orders.heparinMaintenance ?? '–'
                    }}
                  </td>
                </tr>

                <tr
                  v-for="record in pendingOrders"
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
                  <td>{{ formatDate(record.orders.effectiveDate) }}</td>
                  <!-- ✨ 新增：歷史表格資料 -->
                  <td>
                    {{ record.orders.vascAccess || '–' }}
                    <span v-if="record.orders.arterialNeedle || record.orders.venousNeedle">
                      ({{ record.orders.arterialNeedle || 'N/A' }}/{{
                        record.orders.venousNeedle || 'N/A'
                      }})
                    </span>
                  </td>
                  <td>{{ record.orders.dryWeight ?? '–' }}</td>
                  <td>{{ record.orders.bloodFlow ?? '–' }}</td>
                  <td>{{ record.orders.ak || '–' }}</td>
                  <td>{{ record.orders.dialysateCa || '–' }}</td>
                  <td>
                    {{ record.orders.heparinInitial ?? '–' }}/{{
                      record.orders.heparinMaintenance ?? '–'
                    }}
                  </td>
                </tr>

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
                  <!-- ✨ 新增：歷史表格資料 -->
                  <td>
                    {{ record.orders.vascAccess || '–' }}
                    <span v-if="record.orders.arterialNeedle || record.orders.venousNeedle">
                      ({{ record.orders.arterialNeedle || 'N/A' }}/{{
                        record.orders.venousNeedle || 'N/A'
                      }})
                    </span>
                  </td>
                  <td>{{ record.orders.dryWeight ?? '–' }}</td>
                  <td>{{ record.orders.bloodFlow ?? '–' }}</td>
                  <td>{{ record.orders.ak || '–' }}</td>
                  <td>{{ record.orders.dialysateCa || '–' }}</td>
                  <td>
                    {{ record.orders.heparinInitial ?? '–' }}/{{
                      record.orders.heparinMaintenance ?? '–'
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
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */

/* ✨ CSS 核心修改點：使用 Flexbox 佈局 ✨ */
.dialog-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 900px;
  display: flex;
  flex-direction: column;
  max-height: 90vh; /* 確保 Modal 不會超出視窗高度 */
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
  /* ✨ 修改：增加一欄以容納新欄位 */
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
.form-group {
  display: flex;
  flex-direction: column;
}
.form-group.full-width {
  grid-column: 1 / -1;
}

/* ✨ 新增：穿刺針群組樣式 */
.form-group.needle-group {
  display: flex;
  flex-direction: row;
  gap: 10px;
  grid-column: span 2; /* 讓這個群組佔據兩欄空間 */
}
.needle-group .sub-group {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.needle-group .sub-group label {
  white-space: nowrap;
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
  background-color: #38a169;
}
.status-tag.pending {
  background-color: #f97316;
}
.status-tag.history {
  background-color: #718096;
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
  color: #dc3545;
  font-weight: bold;
}

/* ================================== */
/* ‼️        新增的響應式樣式        ‼️ */
/* ================================== */
@media (max-width: 768px) {
  /* 讓 Modal 幾乎佔滿全螢幕，並從頂部對齊 */
  .dialog-overlay {
    align-items: flex-start;
    padding-top: 2.5vh; /* 距離頂部一點距離 */
  }

  .dialog-content {
    width: 95%; /* 左右留一點邊距 */
    max-height: 95vh; /* 確保上下也有邊距 */
  }

  .dialog-header h2 {
    font-size: 1.2rem;
  }

  /* 將表單從兩欄改為單欄佈局 */
  .form-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }

  /* ✨ 新增：在行動版上，讓穿刺針群組佔滿整行 */
  .form-group.needle-group {
    grid-column: 1 / -1;
  }

  /* 歷史表格啟用水平滾動 */
  .history-table-wrapper {
    overflow-x: auto;
  }

  .history-table-wrapper table {
    min-width: 800px; /* ✨ 增加最小寬度以容納新欄位 */
  }

  .history-table-wrapper th,
  .history-table-wrapper td {
    padding: 6px 8px; /* 縮小一點 padding */
    font-size: 0.9rem; /* 縮小一點字體 */
  }

  /* 底部按鈕垂直堆疊 */
  .dialog-footer {
    flex-direction: column-reverse; /* 讓儲存按鈕在上方 */
    gap: 0.5rem;
  }

  .dialog-footer button {
    width: 100%;
  }
}
</style>
