<!-- 檔案路徑: src/views/InventoryView.vue -->
<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-main-content">
        <h1>庫存管理</h1>
        <p class="page-description">管理耗材進貨、消耗紀錄、每月盤點與每週訂單。</p>
      </div>
    </header>

    <div class="tabs-navigation">
      <button :class="{ active: activeTab === 'items' }" @click="activeTab = 'items'">
        品項設定
      </button>
      <button :class="{ active: activeTab === 'purchase' }" @click="activeTab = 'purchase'">
        進貨紀錄
      </button>
      <button :class="{ active: activeTab === 'consumption' }" @click="activeTab = 'consumption'">
        消耗紀錄
      </button>
      <button :class="{ active: activeTab === 'monthly' }" @click="activeTab = 'monthly'">
        每月盤點
      </button>
      <button :class="{ active: activeTab === 'weekly' }" @click="activeTab = 'weekly'">
        每週訂單
      </button>
    </div>

    <main class="page-main-content">
      <!-- ========== Tab 0: 品項設定 ========== -->
      <div v-show="activeTab === 'items'" class="tab-panel">
        <div class="panel-header">
          <h3>庫存品項設定</h3>
          <button class="btn-primary" @click="openItemModal()">+ 新增品項</button>
        </div>

        <div class="filter-bar">
          <div class="filter-field">
            <label>類別篩選</label>
            <select v-model="itemFilter.category" @change="fetchInventoryItems">
              <option value="">全部</option>
              <option value="artificialKidney">人工腎臟</option>
              <option value="dialysateCa">透析藥水CA</option>
              <option value="bicarbonateType">B液種類</option>
            </select>
          </div>
          <div class="filter-field">
            <label>搜尋品項</label>
            <input type="text" v-model="itemFilter.search" placeholder="輸入品項名稱或代碼" @input="filterItems" />
          </div>
        </div>

        <div class="table-container">
          <div v-if="itemsLoading" class="loading-state">載入中...</div>
          <div v-else-if="filteredInventoryItems.length === 0" class="empty-state">尚無品項資料</div>
          <table v-else>
            <thead>
              <tr>
                <th>類別</th>
                <th>品項名稱</th>
                <th>院內代碼</th>
                <th>廠商聯絡電話</th>
                <th>建立者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in filteredInventoryItems" :key="item.id">
                <td>{{ CATEGORY_NAMES[item.category] }}</td>
                <td>{{ item.name }}</td>
                <td>{{ item.hospitalCode || '-' }}</td>
                <td>{{ item.vendorPhone || '-' }}</td>
                <td>{{ item.createdBy || '-' }}</td>
                <td>
                  <button class="btn-sm btn-edit" @click="openItemModal(item)">編輯</button>
                  <button class="btn-sm btn-delete" @click="deleteInventoryItem(item.id)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========== Tab 1: 進貨紀錄 ========== -->
      <div v-show="activeTab === 'purchase'" class="tab-panel">
        <div class="panel-header">
          <h3>進貨紀錄管理</h3>
          <button class="btn-primary" @click="openPurchaseModal()">+ 新增進貨</button>
        </div>

        <div class="filter-bar">
          <div class="filter-field">
            <label>月份</label>
            <input type="month" v-model="purchaseFilter.month" @change="fetchPurchases" />
          </div>
          <div class="filter-field">
            <label>類別</label>
            <select v-model="purchaseFilter.category" @change="fetchPurchases">
              <option value="">全部</option>
              <option value="artificialKidney">人工腎臟</option>
              <option value="dialysateCa">透析藥水CA</option>
              <option value="bicarbonateType">B液種類</option>
            </select>
          </div>
        </div>

        <div class="table-container">
          <div v-if="purchaseLoading" class="loading-state">載入中...</div>
          <div v-else-if="purchases.length === 0" class="empty-state">尚無進貨紀錄</div>
          <table v-else>
            <thead>
              <tr>
                <th>日期</th>
                <th>類別</th>
                <th>品項</th>
                <th>數量</th>
                <th>輸入者</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in purchases" :key="item.id">
                <td>{{ formatDate(item.date) }}</td>
                <td>{{ CATEGORY_NAMES[item.category] }}</td>
                <td>{{ item.item }}</td>
                <td>{{ item.quantity }}</td>
                <td>{{ item.createdBy }}</td>
                <td>
                  <button class="btn-sm btn-edit" @click="openPurchaseModal(item)">編輯</button>
                  <button class="btn-sm btn-delete" @click="deletePurchase(item.id)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ========== Tab 2: 消耗紀錄 (保留原有功能) ========== -->
      <div v-show="activeTab === 'consumption'" class="tab-panel">
        <div class="sub-tabs">
          <button :class="{ active: consumptionSubTab === 'query' }" @click="consumptionSubTab = 'query'">
            耗材查詢
          </button>
          <button :class="{ active: consumptionSubTab === 'upload' }" @click="consumptionSubTab = 'upload'">
            資料上傳
          </button>
        </div>

        <!-- 耗材查詢 -->
        <div v-show="consumptionSubTab === 'query'" class="sub-panel">
          <div class="search-controls">
            <div class="group-filters">
              <div class="search-field">
                <label>頻率</label>
                <select v-model="groupSearchParams.freq">
                  <option value="一三五">一三五</option>
                  <option value="二四六">二四六</option>
                  <option value="other">其他</option>
                </select>
              </div>
              <div class="search-field">
                <label>班別</label>
                <select v-model="groupSearchParams.shift">
                  <option value="early">早班</option>
                  <option value="noon">午班</option>
                  <option value="late">晚班</option>
                </select>
              </div>
              <div class="search-field">
                <label>盤點月份</label>
                <input type="month" v-model="groupSearchParams.month" />
              </div>
            </div>
            <button @click="handleConsumptionSearch" :disabled="consumptionLoading" class="btn-primary">
              {{ consumptionLoading ? '查詢中...' : '查詢耗材' }}
            </button>
            <button
              @click="exportConsumablesToExcel"
              :disabled="consumptionLoading || processedConsumptionData.length === 0"
              class="btn-success"
            >
              匯出 Excel
            </button>
          </div>

          <div class="report-display">
            <div v-if="consumptionLoading" class="loading-state">正在查詢耗材資料...</div>
            <div v-else-if="!consumptionSearchPerformed" class="placeholder-text">請選擇條件並點擊查詢。</div>
            <div v-else-if="processedConsumptionData.length === 0" class="empty-state">
              查無符合條件的病人或耗材資料。
            </div>
            <div v-else class="table-container consumption-table">
              <table>
                <thead>
                  <tr>
                    <th rowspan="2" class="sticky-col col-freq">頻率</th>
                    <th rowspan="2" class="sticky-col col-shift">班別</th>
                    <th rowspan="2" class="sticky-col col-bed">床號</th>
                    <th rowspan="2" class="sticky-col col-mrn">病歷號</th>
                    <th rowspan="2" class="sticky-col col-name">姓名</th>
                    <th v-if="dynamicHeaders.artificialKidney.length > 0" :colspan="dynamicHeaders.artificialKidney.length">
                      人工腎臟
                    </th>
                    <th v-if="dynamicHeaders.dialysateCa.length > 0" :colspan="dynamicHeaders.dialysateCa.length">
                      透析藥水CA
                    </th>
                    <th v-if="dynamicHeaders.bicarbonateType.length > 0" :colspan="dynamicHeaders.bicarbonateType.length">
                      B液種類
                    </th>
                  </tr>
                  <tr>
                    <th v-for="header in flattenedHeaders" :key="header">{{ header }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in processedConsumptionData" :key="row.patientId">
                    <td class="sticky-col col-freq">{{ row.freq || '-' }}</td>
                    <td class="sticky-col col-shift">{{ formatShift(row.shiftIndex) }}</td>
                    <td class="sticky-col col-bed">{{ row.bedNum || '-' }}</td>
                    <td class="sticky-col col-mrn">{{ row.medicalRecordNumber || '-' }}</td>
                    <td class="sticky-col col-name">{{ row.patientName }}</td>
                    <td v-for="header in flattenedHeaders" :key="header">
                      {{ row.consumableCounts[header] || '' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 資料上傳 -->
        <div v-show="consumptionSubTab === 'upload'" class="sub-panel upload-panel">
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
              <h3 v-else>已選擇檔案：<strong>{{ selectedFile.name }}</strong></h3>
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
              <label for="file-input" class="file-input-label">
                {{ selectedFile ? '重新選擇檔案' : '選擇檔案' }}
              </label>
            </div>
            <button class="btn-primary upload-btn-main" @click="handleUpload" :disabled="!selectedFile || isUploading">
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
      </div>

      <!-- ========== Tab 3: 每月盤點 ========== -->
      <div v-show="activeTab === 'monthly'" class="tab-panel">
        <div class="panel-header">
          <h3>每月盤點計算</h3>
        </div>

        <div class="filter-bar">
          <div class="filter-field">
            <label>計算月份</label>
            <input type="month" v-model="monthlyFilter.month" />
          </div>
          <button class="btn-primary" @click="calculateMonthlyInventory" :disabled="monthlyLoading">
            {{ monthlyLoading ? '計算中...' : '計算庫存' }}
          </button>
          <button class="btn-success" @click="saveMonthlyCount" :disabled="!monthlyCalculated || monthlyLoading">
            儲存盤點結果
          </button>
        </div>

        <div class="monthly-summary" v-if="monthlyCalculated">
          <div class="summary-card">
            <h4>上月結存</h4>
            <p>{{ monthlyFilter.month }} 之前的庫存</p>
          </div>
          <div class="summary-card">
            <span class="operator">+</span>
            <h4>本月進貨</h4>
            <p>{{ monthlyFilter.month }} 進貨總量</p>
          </div>
          <div class="summary-card">
            <span class="operator">-</span>
            <h4>本月消耗</h4>
            <p>{{ monthlyFilter.month }} 消耗總量</p>
          </div>
          <div class="summary-card result">
            <span class="operator">=</span>
            <h4>本月結存</h4>
            <p>計算後庫存</p>
          </div>
        </div>

        <div class="table-container" v-if="monthlyCalculated">
          <table>
            <thead>
              <tr>
                <th>類別</th>
                <th>品項</th>
                <th>上月結存</th>
                <th>本月進貨</th>
                <th>本月消耗</th>
                <th>本月結存</th>
                <th>調整</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="category in Object.keys(CATEGORY_NAMES)" :key="category">
                <tr v-for="(data, item) in monthlyInventory[category]" :key="`${category}-${item}`">
                  <td>{{ CATEGORY_NAMES[category] }}</td>
                  <td>{{ item }}</td>
                  <td>{{ data.previousStock }}</td>
                  <td class="positive">+{{ data.purchased }}</td>
                  <td class="negative">-{{ data.consumed }}</td>
                  <td class="result-cell">{{ data.currentStock }}</td>
                  <td>
                    <input
                      type="number"
                      v-model.number="data.adjustment"
                      class="adjustment-input"
                      placeholder="調整值"
                    />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div v-else class="placeholder-text">請選擇月份並點擊「計算庫存」。</div>
      </div>

      <!-- ========== Tab 4: 每週訂單 ========== -->
      <div v-show="activeTab === 'weekly'" class="tab-panel">
        <div class="panel-header">
          <h3>每週訂單計算</h3>
          <p class="panel-description">訂購量 = 安全庫存(9天) - 週二盤點 + 預估一週消耗</p>
        </div>

        <div class="filter-bar">
          <div class="filter-field">
            <label>選擇週次</label>
            <input type="week" v-model="weeklyFilter.week" />
          </div>
          <button class="btn-primary" @click="loadWeeklyData" :disabled="weeklyLoading">
            {{ weeklyLoading ? '載入中...' : '載入資料' }}
          </button>
        </div>

        <div v-if="weeklyDataLoaded" class="weekly-content">
          <!-- 週二盤點輸入區 -->
          <div class="weekly-section">
            <div class="section-header">
              <h4>週二盤點輸入</h4>
              <button class="btn-sm btn-primary" @click="saveWeeklyCount" :disabled="weeklyLoading">
                儲存盤點
              </button>
            </div>
            <div class="inventory-grid">
              <template v-for="category in Object.keys(CATEGORY_NAMES)" :key="category">
                <div class="category-section">
                  <h5>{{ CATEGORY_NAMES[category] }}</h5>
                  <div class="item-inputs">
                    <div v-for="item in getItemsForCategory(category)" :key="item" class="item-row">
                      <label>{{ item }}</label>
                      <input
                        type="number"
                        v-model.number="weeklyCount[category][item]"
                        placeholder="庫存數量"
                        min="0"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- 訂購建議表 -->
          <div class="weekly-section">
            <div class="section-header">
              <h4>訂購建議</h4>
              <button class="btn-success" @click="exportWeeklyOrder" :disabled="!hasOrderData">
                匯出訂單
              </button>
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>類別</th>
                    <th>品項</th>
                    <th>週二盤點</th>
                    <th>預估週消耗</th>
                    <th>安全庫存(9天)</th>
                    <th>建議訂購量</th>
                  </tr>
                </thead>
                <tbody>
                  <template v-for="category in Object.keys(CATEGORY_NAMES)" :key="category">
                    <tr v-for="item in getItemsForCategory(category)" :key="`order-${category}-${item}`">
                      <td>{{ CATEGORY_NAMES[category] }}</td>
                      <td>{{ item }}</td>
                      <td>{{ weeklyCount[category]?.[item] || 0 }}</td>
                      <td>{{ getWeeklyConsumption(category, item) }}</td>
                      <td>{{ getSafetyStock(category, item) }}</td>
                      <td :class="{ 'need-order': getOrderQuantity(category, item) > 0 }">
                        {{ getOrderQuantity(category, item) }}
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div v-else class="placeholder-text">請選擇週次並點擊「載入資料」。</div>
      </div>
    </main>

    <!-- 進貨紀錄 Modal -->
    <div v-if="showPurchaseModal" class="modal-overlay" @click.self="closePurchaseModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingPurchase ? '編輯進貨紀錄' : '新增進貨紀錄' }}</h3>
          <button class="modal-close" @click="closePurchaseModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label>日期 *</label>
            <input type="date" v-model="purchaseForm.date" required />
          </div>
          <div class="form-field">
            <label>類別 *</label>
            <select v-model="purchaseForm.category" required>
              <option value="">請選擇</option>
              <option value="artificialKidney">人工腎臟</option>
              <option value="dialysateCa">透析藥水CA</option>
              <option value="bicarbonateType">B液種類</option>
            </select>
          </div>
          <div class="form-field">
            <label>品項 *</label>
            <input
              type="text"
              v-model="purchaseForm.item"
              list="item-suggestions"
              placeholder="輸入或選擇品項"
              required
            />
            <datalist id="item-suggestions">
              <option v-for="item in getItemSuggestions(purchaseForm.category)" :key="item" :value="item" />
            </datalist>
          </div>
          <div class="form-field">
            <label>數量 *</label>
            <input type="number" v-model.number="purchaseForm.quantity" min="1" required />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closePurchaseModal">取消</button>
          <button class="btn-primary" @click="savePurchase" :disabled="!isPurchaseFormValid">
            {{ editingPurchase ? '更新' : '新增' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 品項設定 Modal -->
    <div v-if="showItemModal" class="modal-overlay" @click.self="closeItemModal">
      <div class="modal-content">
        <div class="modal-header">
          <h3>{{ editingItem ? '編輯品項' : '新增品項' }}</h3>
          <button class="modal-close" @click="closeItemModal">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label>類別 *</label>
            <select v-model="itemForm.category" required>
              <option value="">請選擇</option>
              <option value="artificialKidney">人工腎臟</option>
              <option value="dialysateCa">透析藥水CA</option>
              <option value="bicarbonateType">B液種類</option>
            </select>
          </div>
          <div class="form-field">
            <label>品項名稱 *</label>
            <input type="text" v-model="itemForm.name" placeholder="例如：Fresenius FX80" required />
          </div>
          <div class="form-field">
            <label>院內代碼</label>
            <input type="text" v-model="itemForm.hospitalCode" placeholder="例如：AK-001" />
          </div>
          <div class="form-field">
            <label>廠商聯絡電話</label>
            <input type="tel" v-model="itemForm.vendorPhone" placeholder="例如：02-12345678" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-secondary" @click="closeItemModal">取消</button>
          <button class="btn-primary" @click="saveInventoryItem" :disabled="!isItemFormValid">
            {{ editingItem ? '更新' : '新增' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { db, functions } from '@/composables/useFirebase'
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  Timestamp,
  documentId,
  setDoc,
  getDoc,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '@/composables/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { storeToRefs } from 'pinia'
import { queryWithInChunks } from '@/utils/firestoreUtils.js'
import * as XLSX from 'xlsx'

// --- 常數 ---
const CATEGORY_NAMES = {
  artificialKidney: '人工腎臟',
  dialysateCa: '透析藥水CA',
  bicarbonateType: 'B液種類',
}
const SHIFT_MAP = { early: 0, noon: 1, late: 2 }
const SHIFT_INDEX_MAP = { 0: '早班', 1: '午班', 2: '晚班' }

// --- Auth & Store ---
const { currentUser } = useAuth()
const patientStore = usePatientStore()
const { opdPatients, patientMap } = storeToRefs(patientStore)

// --- 全局狀態 ---
const activeTab = ref('items')

// ==================== Tab 0: 品項設定 ====================
const inventoryItems = ref([])
const filteredInventoryItems = ref([])
const itemsLoading = ref(false)
const itemFilter = reactive({
  category: '',
  search: '',
})
const showItemModal = ref(false)
const editingItem = ref(null)
const itemForm = reactive({
  category: '',
  name: '',
  hospitalCode: '',
  vendorPhone: '',
})

const isItemFormValid = computed(() => {
  return itemForm.category && itemForm.name
})

async function fetchInventoryItems() {
  itemsLoading.value = true
  try {
    let q = query(collection(db, 'inventory_items'), orderBy('category'), orderBy('name'))

    const snapshot = await getDocs(q)
    let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

    if (itemFilter.category) {
      results = results.filter((item) => item.category === itemFilter.category)
    }

    inventoryItems.value = results
    filteredInventoryItems.value = results

    // 同步更新 knownItems
    results.forEach((item) => {
      if (!knownItems[item.category].includes(item.name)) {
        knownItems[item.category].push(item.name)
      }
    })
  } catch (error) {
    console.error('載入品項設定失敗:', error)
    alert('載入品項設定失敗')
  } finally {
    itemsLoading.value = false
  }
}

function filterItems() {
  const search = itemFilter.search.toLowerCase()
  if (!search) {
    filteredInventoryItems.value = inventoryItems.value
  } else {
    filteredInventoryItems.value = inventoryItems.value.filter(
      (item) =>
        item.name.toLowerCase().includes(search) ||
        (item.hospitalCode && item.hospitalCode.toLowerCase().includes(search))
    )
  }
}

function openItemModal(item = null) {
  if (item) {
    editingItem.value = item
    itemForm.category = item.category
    itemForm.name = item.name
    itemForm.hospitalCode = item.hospitalCode || ''
    itemForm.vendorPhone = item.vendorPhone || ''
  } else {
    editingItem.value = null
    itemForm.category = ''
    itemForm.name = ''
    itemForm.hospitalCode = ''
    itemForm.vendorPhone = ''
  }
  showItemModal.value = true
}

function closeItemModal() {
  showItemModal.value = false
  editingItem.value = null
}

async function saveInventoryItem() {
  if (!isItemFormValid.value) return

  try {
    const data = {
      category: itemForm.category,
      name: itemForm.name,
      hospitalCode: itemForm.hospitalCode || null,
      vendorPhone: itemForm.vendorPhone || null,
      updatedAt: Timestamp.now(),
      updatedBy: currentUser.value?.name || '未知',
    }

    if (editingItem.value) {
      await updateDoc(doc(db, 'inventory_items', editingItem.value.id), data)
    } else {
      data.createdAt = Timestamp.now()
      data.createdBy = currentUser.value?.name || '未知'
      await addDoc(collection(db, 'inventory_items'), data)
    }

    // 更新 knownItems
    if (!knownItems[itemForm.category].includes(itemForm.name)) {
      knownItems[itemForm.category].push(itemForm.name)
    }

    closeItemModal()
    await fetchInventoryItems()
    alert(editingItem.value ? '更新成功' : '新增成功')
  } catch (error) {
    console.error('儲存品項失敗:', error)
    alert('儲存失敗: ' + error.message)
  }
}

async function deleteInventoryItem(id) {
  if (!confirm('確定要刪除此品項嗎？此操作不會影響已有的進貨和消耗紀錄。')) return

  try {
    await deleteDoc(doc(db, 'inventory_items', id))
    await fetchInventoryItems()
    alert('刪除成功')
  } catch (error) {
    console.error('刪除品項失敗:', error)
    alert('刪除失敗: ' + error.message)
  }
}

// --- 已知品項列表 (從資料庫動態載入) ---
const knownItems = reactive({
  artificialKidney: [],
  dialysateCa: [],
  bicarbonateType: [],
})

// ==================== Tab 1: 進貨紀錄 ====================
const purchases = ref([])
const purchaseLoading = ref(false)
const purchaseFilter = reactive({
  month: new Date().toISOString().slice(0, 7),
  category: '',
})
const showPurchaseModal = ref(false)
const editingPurchase = ref(null)
const purchaseForm = reactive({
  date: new Date().toISOString().slice(0, 10),
  category: '',
  item: '',
  quantity: 1,
})

const isPurchaseFormValid = computed(() => {
  return purchaseForm.date && purchaseForm.category && purchaseForm.item && purchaseForm.quantity > 0
})

async function fetchPurchases() {
  purchaseLoading.value = true
  try {
    const startDate = new Date(`${purchaseFilter.month}-01`)
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59)

    let q = query(
      collection(db, 'inventory_purchases'),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate)),
      orderBy('date', 'desc')
    )

    const snapshot = await getDocs(q)
    let results = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))

    if (purchaseFilter.category) {
      results = results.filter((item) => item.category === purchaseFilter.category)
    }

    purchases.value = results

    // 更新已知品項
    results.forEach((p) => {
      if (!knownItems[p.category].includes(p.item)) {
        knownItems[p.category].push(p.item)
      }
    })
  } catch (error) {
    console.error('載入進貨紀錄失敗:', error)
    alert('載入進貨紀錄失敗')
  } finally {
    purchaseLoading.value = false
  }
}

function openPurchaseModal(item = null) {
  if (item) {
    editingPurchase.value = item
    purchaseForm.date = formatDateForInput(item.date)
    purchaseForm.category = item.category
    purchaseForm.item = item.item
    purchaseForm.quantity = item.quantity
  } else {
    editingPurchase.value = null
    purchaseForm.date = new Date().toISOString().slice(0, 10)
    purchaseForm.category = ''
    purchaseForm.item = ''
    purchaseForm.quantity = 1
  }
  showPurchaseModal.value = true
}

function closePurchaseModal() {
  showPurchaseModal.value = false
  editingPurchase.value = null
}

async function savePurchase() {
  if (!isPurchaseFormValid.value) return

  try {
    const data = {
      date: Timestamp.fromDate(new Date(purchaseForm.date)),
      category: purchaseForm.category,
      item: purchaseForm.item,
      quantity: purchaseForm.quantity,
      createdBy: currentUser.value?.name || '未知',
      updatedAt: Timestamp.now(),
    }

    if (editingPurchase.value) {
      await updateDoc(doc(db, 'inventory_purchases', editingPurchase.value.id), data)
    } else {
      data.createdAt = Timestamp.now()
      await addDoc(collection(db, 'inventory_purchases'), data)
    }

    // 更新已知品項
    if (!knownItems[purchaseForm.category].includes(purchaseForm.item)) {
      knownItems[purchaseForm.category].push(purchaseForm.item)
    }

    closePurchaseModal()
    await fetchPurchases()
    alert(editingPurchase.value ? '更新成功' : '新增成功')
  } catch (error) {
    console.error('儲存進貨紀錄失敗:', error)
    alert('儲存失敗: ' + error.message)
  }
}

async function deletePurchase(id) {
  if (!confirm('確定要刪除此筆進貨紀錄嗎？')) return

  try {
    await deleteDoc(doc(db, 'inventory_purchases', id))
    await fetchPurchases()
    alert('刪除成功')
  } catch (error) {
    console.error('刪除進貨紀錄失敗:', error)
    alert('刪除失敗: ' + error.message)
  }
}

function getItemSuggestions(category) {
  return category ? knownItems[category] : []
}

// ==================== Tab 2: 消耗紀錄 ====================
const consumptionSubTab = ref('query')
const consumptionLoading = ref(false)
const consumptionSearchPerformed = ref(false)
const rawConsumptionData = ref([])
const processedConsumptionData = ref([])
const groupSearchParams = reactive({
  freq: 'other',
  shift: 'early',
  month: new Date().toISOString().slice(0, 7),
})
const dynamicHeaders = ref({
  artificialKidney: [],
  dialysateCa: [],
  bicarbonateType: [],
})

// 上傳相關
const selectedFile = ref(null)
const isUploading = ref(false)
const uploadResult = ref(null)
const isDragOver = ref(false)

const flattenedHeaders = computed(() => {
  return [
    ...dynamicHeaders.value.artificialKidney,
    ...dynamicHeaders.value.dialysateCa,
    ...dynamicHeaders.value.bicarbonateType,
  ]
})

function formatShift(shiftIndex) {
  return SHIFT_INDEX_MAP[shiftIndex] ?? '-'
}

async function handleConsumptionSearch() {
  consumptionLoading.value = true
  consumptionSearchPerformed.value = true
  rawConsumptionData.value = []
  processedConsumptionData.value = []
  dynamicHeaders.value = { artificialKidney: [], dialysateCa: [], bicarbonateType: [] }

  try {
    const shiftIndex = SHIFT_MAP[groupSearchParams.shift]
    const regularFreqs = ['一三五', '二四六']

    const patientsInGroup = opdPatients.value.filter((p) => {
      const rule = p.scheduleRule
      if (!rule) return false
      const matchesShift = rule.shiftIndex === shiftIndex
      if (!matchesShift) return false
      if (groupSearchParams.freq === 'other') {
        return !regularFreqs.includes(rule.freq)
      }
      return rule.freq === groupSearchParams.freq
    })

    const allPatientIdsInGroup = patientsInGroup.map((p) => p.id)

    if (allPatientIdsInGroup.length === 0) {
      consumptionLoading.value = false
      return
    }

    const reportMonth = groupSearchParams.month
    const reportIdsForMonth = allPatientIdsInGroup.map((id) => `${reportMonth}_${id}`)
    const monthlyReports = await queryWithInChunks('consumables_reports', documentId(), reportIdsForMonth)
    rawConsumptionData.value = monthlyReports

    const reportsMap = new Map(rawConsumptionData.value.map((r) => [r.patientId, r]))
    const headers = {
      artificialKidney: new Set(),
      dialysateCa: new Set(),
      bicarbonateType: new Set(),
    }

    for (const report of reportsMap.values()) {
      const data = report.data || {}
      for (const category in headers) {
        if (data[category] && Array.isArray(data[category])) {
          data[category].forEach((item) => headers[category].add(item.item))
        }
      }
    }

    dynamicHeaders.value.artificialKidney = [...headers.artificialKidney].sort()
    dynamicHeaders.value.dialysateCa = [...headers.dialysateCa].sort()
    dynamicHeaders.value.bicarbonateType = [...headers.bicarbonateType].sort()

    // 更新已知品項
    for (const category of Object.keys(headers)) {
      headers[category].forEach((item) => {
        if (!knownItems[category].includes(item)) {
          knownItems[category].push(item)
        }
      })
    }

    processedConsumptionData.value = allPatientIdsInGroup
      .map((patientId) => {
        const patient = patientMap.value.get(patientId)
        const report = reportsMap.get(patientId)
        const consumables = report?.data || {}

        const consumableCounts = {}
        for (const header of flattenedHeaders.value) {
          for (const category in dynamicHeaders.value) {
            if (consumables[category] && Array.isArray(consumables[category])) {
              const foundItem = consumables[category].find((c) => c.item === header)
              if (foundItem) {
                consumableCounts[header] = foundItem.count
                break
              }
            }
          }
        }

        return {
          patientId,
          patientName: patient?.name || report?.patientName || '未知病人',
          medicalRecordNumber: patient?.medicalRecordNumber || report?.medicalRecordNumber || 'N/A',
          bedNum: patient?.scheduleRule?.bedNum || 'N/A',
          freq: patient?.scheduleRule?.freq || 'N/A',
          shiftIndex: patient?.scheduleRule?.shiftIndex,
          consumableCounts,
        }
      })
      .sort((a, b) => String(a.bedNum).localeCompare(String(b.bedNum), undefined, { numeric: true }))
  } catch (error) {
    console.error('查詢耗材資料失敗:', error)
    alert('查詢耗材資料時發生錯誤')
  } finally {
    consumptionLoading.value = false
  }
}

function exportConsumablesToExcel() {
  if (!processedConsumptionData.value || processedConsumptionData.value.length === 0) {
    alert('沒有可匯出的資料。')
    return
  }

  try {
    const { freq, shift, month } = groupSearchParams
    const shiftNameMap = { early: '早班', noon: '午班', late: '晚班' }
    const shiftName = shiftNameMap[shift] || shift
    const title = `每月耗材總表: ${freq} / ${shiftName} / ${month}`

    const headerRow1 = ['頻率', '班別', '床號', '病歷號', '姓名']
    const headerRow2 = ['', '', '', '', '']

    for (const category in dynamicHeaders.value) {
      const items = dynamicHeaders.value[category]
      if (items && Array.isArray(items) && items.length > 0) {
        const categoryName = CATEGORY_NAMES[category]
        headerRow1.push(categoryName)
        for (let i = 1; i < items.length; i++) {
          headerRow1.push('')
        }
        items.forEach((item) => headerRow2.push(String(item || '')))
      }
    }

    const dataRows = processedConsumptionData.value.map((row) => {
      const dataRow = [
        row.freq || '-',
        formatShift(row.shiftIndex),
        row.bedNum || '',
        row.medicalRecordNumber || '',
        row.patientName || '',
      ]
      flattenedHeaders.value.forEach((header) => {
        const count = row.consumableCounts[header]
        dataRow.push(count !== undefined && count !== null ? count : '')
      })
      return dataRow
    })

    const sheetData = [[title], [], headerRow1, headerRow2, ...dataRows]
    const ws = XLSX.utils.aoa_to_sheet(sheetData, { skipHidden: true })

    ws['!merges'] = []
    const totalColumnCount = flattenedHeaders.value.length + 5
    ws['!merges'].push({ s: { r: 0, c: 0 }, e: { r: 0, c: totalColumnCount - 1 } })

    for (let i = 0; i < 5; i++) {
      ws['!merges'].push({ s: { r: 2, c: i }, e: { r: 3, c: i } })
    }

    let currentCol = 5
    for (const category in dynamicHeaders.value) {
      const items = dynamicHeaders.value[category]
      if (items && Array.isArray(items) && items.length > 0) {
        ws['!merges'].push({
          s: { r: 2, c: currentCol },
          e: { r: 2, c: currentCol + items.length - 1 },
        })
        currentCol += items.length
      }
    }

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '耗材總表')

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob([wbout], { type: 'application/octet-stream' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `耗材總表_${freq}_${shiftName}_${month}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(link.href)
  } catch (error) {
    console.error('匯出 Excel 失敗:', error)
    alert('匯出 Excel 時發生錯誤')
  }
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
    const processConsumables = httpsCallable(functions, 'processConsumables')
    const result = await processConsumables({
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

// ==================== Tab 3: 每月盤點 ====================
const monthlyLoading = ref(false)
const monthlyCalculated = ref(false)
const monthlyFilter = reactive({
  month: new Date().toISOString().slice(0, 7),
})
const monthlyInventory = reactive({
  artificialKidney: {},
  dialysateCa: {},
  bicarbonateType: {},
})

async function calculateMonthlyInventory() {
  monthlyLoading.value = true
  monthlyCalculated.value = false

  // 重置
  for (const category of Object.keys(monthlyInventory)) {
    monthlyInventory[category] = {}
  }

  try {
    const selectedMonth = monthlyFilter.month
    const [year, month] = selectedMonth.split('-').map(Number)

    // 計算上個月
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear = month === 1 ? year - 1 : year
    const prevMonthStr = `${prevYear}-${String(prevMonth).padStart(2, '0')}`

    // 1. 取得上月盤點結果
    const prevCountDoc = await getDoc(doc(db, 'inventory_counts', prevMonthStr))
    const prevCounts = prevCountDoc.exists() ? prevCountDoc.data().counts || {} : {}

    // 2. 取得本月進貨
    const startDate = new Date(`${selectedMonth}-01`)
    const endDate = new Date(year, month, 0, 23, 59, 59)

    const purchaseQuery = query(
      collection(db, 'inventory_purchases'),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<=', Timestamp.fromDate(endDate))
    )
    const purchaseSnapshot = await getDocs(purchaseQuery)
    const purchaseData = {}
    purchaseSnapshot.docs.forEach((doc) => {
      const p = doc.data()
      if (!purchaseData[p.category]) purchaseData[p.category] = {}
      purchaseData[p.category][p.item] = (purchaseData[p.category][p.item] || 0) + p.quantity
    })

    // 3. 取得本月消耗 (從 consumables_reports 彙總)
    const consumptionData = await getMonthlyConsumption(selectedMonth)

    // 4. 合併所有品項
    const allItems = new Set()
    for (const category of Object.keys(CATEGORY_NAMES)) {
      const sources = [
        Object.keys(prevCounts[category] || {}),
        Object.keys(purchaseData[category] || {}),
        Object.keys(consumptionData[category] || {}),
        knownItems[category],
      ]
      sources.forEach((items) => items.forEach((item) => allItems.add(`${category}:${item}`)))
    }

    // 5. 計算每個品項的庫存
    allItems.forEach((key) => {
      const [category, item] = key.split(':')
      const previousStock = prevCounts[category]?.[item] || 0
      const purchased = purchaseData[category]?.[item] || 0
      const consumed = consumptionData[category]?.[item] || 0
      const currentStock = previousStock + purchased - consumed

      if (!monthlyInventory[category]) monthlyInventory[category] = {}
      monthlyInventory[category][item] = {
        previousStock,
        purchased,
        consumed,
        currentStock,
        adjustment: 0,
      }
    })

    monthlyCalculated.value = true
  } catch (error) {
    console.error('計算月庫存失敗:', error)
    alert('計算失敗: ' + error.message)
  } finally {
    monthlyLoading.value = false
  }
}

async function getMonthlyConsumption(month) {
  const result = {
    artificialKidney: {},
    dialysateCa: {},
    bicarbonateType: {},
  }

  try {
    // 查詢該月所有消耗報告
    const q = query(collection(db, 'consumables_reports'), where('reportMonth', '==', month))
    const snapshot = await getDocs(q)

    snapshot.docs.forEach((doc) => {
      const report = doc.data()
      const data = report.data || {}

      for (const category of Object.keys(result)) {
        if (data[category] && Array.isArray(data[category])) {
          data[category].forEach((item) => {
            result[category][item.item] = (result[category][item.item] || 0) + (item.count || 0)
          })
        }
      }
    })
  } catch (error) {
    console.error('取得月消耗資料失敗:', error)
  }

  return result
}

async function saveMonthlyCount() {
  if (!monthlyCalculated.value) return

  try {
    const counts = {}
    for (const category of Object.keys(monthlyInventory)) {
      counts[category] = {}
      for (const [item, data] of Object.entries(monthlyInventory[category])) {
        // 最終庫存 = 計算結果 + 調整值
        counts[category][item] = data.currentStock + (data.adjustment || 0)
      }
    }

    await setDoc(doc(db, 'inventory_counts', monthlyFilter.month), {
      type: 'monthly',
      month: monthlyFilter.month,
      counts,
      createdBy: currentUser.value?.name || '未知',
      createdAt: Timestamp.now(),
    })

    alert('盤點結果已儲存')
  } catch (error) {
    console.error('儲存盤點結果失敗:', error)
    alert('儲存失敗: ' + error.message)
  }
}

// ==================== Tab 4: 每週訂單 ====================
const weeklyLoading = ref(false)
const weeklyDataLoaded = ref(false)
const weeklyFilter = reactive({
  week: getISOWeek(new Date()),
})
const weeklyCount = reactive({
  artificialKidney: {},
  dialysateCa: {},
  bicarbonateType: {},
})
const monthlyConsumptionForWeekly = reactive({
  artificialKidney: {},
  dialysateCa: {},
  bicarbonateType: {},
})

function getISOWeek(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getItemsForCategory(category) {
  return knownItems[category] || []
}

async function loadWeeklyData() {
  weeklyLoading.value = true
  weeklyDataLoaded.value = false

  // 重置
  for (const category of Object.keys(weeklyCount)) {
    weeklyCount[category] = {}
    monthlyConsumptionForWeekly[category] = {}
  }

  try {
    // 1. 載入該週的盤點紀錄 (如果有)
    const weeklyCountDoc = await getDoc(doc(db, 'inventory_counts', weeklyFilter.week))
    if (weeklyCountDoc.exists()) {
      const data = weeklyCountDoc.data().counts || {}
      for (const category of Object.keys(weeklyCount)) {
        weeklyCount[category] = { ...data[category] }
      }
    }

    // 2. 載入當月消耗資料 (用於推估週消耗)
    const currentMonth = weeklyFilter.week.slice(0, 7).replace('-W', '-')
    const actualMonth = new Date().toISOString().slice(0, 7)
    const consumption = await getMonthlyConsumption(actualMonth)

    for (const category of Object.keys(monthlyConsumptionForWeekly)) {
      monthlyConsumptionForWeekly[category] = consumption[category] || {}
    }

    // 3. 確保所有已知品項都有初始值
    for (const category of Object.keys(knownItems)) {
      knownItems[category].forEach((item) => {
        if (weeklyCount[category][item] === undefined) {
          weeklyCount[category][item] = 0
        }
      })
    }

    weeklyDataLoaded.value = true
  } catch (error) {
    console.error('載入週資料失敗:', error)
    alert('載入失敗: ' + error.message)
  } finally {
    weeklyLoading.value = false
  }
}

async function saveWeeklyCount() {
  try {
    await setDoc(doc(db, 'inventory_counts', weeklyFilter.week), {
      type: 'weekly',
      week: weeklyFilter.week,
      counts: {
        artificialKidney: { ...weeklyCount.artificialKidney },
        dialysateCa: { ...weeklyCount.dialysateCa },
        bicarbonateType: { ...weeklyCount.bicarbonateType },
      },
      createdBy: currentUser.value?.name || '未知',
      createdAt: Timestamp.now(),
    })
    alert('週盤點已儲存')
  } catch (error) {
    console.error('儲存週盤點失敗:', error)
    alert('儲存失敗: ' + error.message)
  }
}

function getWeeklyConsumption(category, item) {
  // 預估週消耗 = 月消耗 ÷ 4
  const monthlyTotal = monthlyConsumptionForWeekly[category]?.[item] || 0
  return Math.ceil(monthlyTotal / 4)
}

function getSafetyStock(category, item) {
  // 安全庫存 = 週消耗 × (9/7) ≈ 1.29
  const weeklyConsumption = getWeeklyConsumption(category, item)
  return Math.ceil(weeklyConsumption * (9 / 7))
}

function getOrderQuantity(category, item) {
  // 訂購量 = 安全庫存 - 週二盤點 + 預估週消耗
  const safetyStock = getSafetyStock(category, item)
  const currentStock = weeklyCount[category]?.[item] || 0
  const weeklyConsumption = getWeeklyConsumption(category, item)

  const orderQty = safetyStock - currentStock + weeklyConsumption
  return Math.max(0, orderQty) // 不能為負數
}

const hasOrderData = computed(() => {
  return Object.keys(weeklyCount).some((category) => Object.keys(weeklyCount[category]).length > 0)
})

function exportWeeklyOrder() {
  const rows = [['類別', '品項', '週二盤點', '預估週消耗', '安全庫存(9天)', '建議訂購量']]

  for (const category of Object.keys(CATEGORY_NAMES)) {
    for (const item of getItemsForCategory(category)) {
      const orderQty = getOrderQuantity(category, item)
      if (orderQty > 0) {
        rows.push([
          CATEGORY_NAMES[category],
          item,
          weeklyCount[category]?.[item] || 0,
          getWeeklyConsumption(category, item),
          getSafetyStock(category, item),
          orderQty,
        ])
      }
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '訂單')

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], { type: 'application/octet-stream' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `每週訂單_${weeklyFilter.week}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(link.href)
}

// ==================== 工具函式 ====================
function formatDate(timestamp) {
  if (!timestamp) return '-'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toLocaleDateString('zh-TW')
}

function formatDateForInput(timestamp) {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return date.toISOString().slice(0, 10)
}

// ==================== 初始化 ====================
onMounted(async () => {
  await patientStore.fetchPatientsIfNeeded()
  await fetchInventoryItems() // 先載入品項設定
  await fetchPurchases()
  await loadKnownItems()
})

async function loadKnownItems() {
  try {
    // 從消耗報告中取得所有已知品項
    const q = query(collection(db, 'consumables_reports'), orderBy('createdAt', 'desc'))
    const snapshot = await getDocs(q)

    snapshot.docs.slice(0, 50).forEach((doc) => {
      // 只取最近 50 筆
      const report = doc.data()
      const data = report.data || {}

      for (const category of Object.keys(knownItems)) {
        if (data[category] && Array.isArray(data[category])) {
          data[category].forEach((item) => {
            if (!knownItems[category].includes(item.item)) {
              knownItems[category].push(item.item)
            }
          })
        }
      }
    })

    // 排序
    for (const category of Object.keys(knownItems)) {
      knownItems[category].sort()
    }
  } catch (error) {
    console.error('載入已知品項失敗:', error)
  }
}
</script>

<style scoped>
/* === 基礎佈局 === */
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
  margin: 0.5rem 0 0 0;
}

/* === Tabs 導航 === */
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

.tabs-navigation button:hover:not(.active) {
  background-color: #e9ecef;
}

/* === 主內容區 === */
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
  overflow: auto;
}

/* === 面板標頭 === */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.panel-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.panel-description {
  font-size: 0.9rem;
  color: #6c757d;
  margin: 0.25rem 0 0 0;
}

/* === 篩選列 === */
.filter-bar {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.filter-field label {
  font-weight: 500;
  font-size: 0.9rem;
  color: #495057;
}

.filter-field input,
.filter-field select {
  padding: 0.5rem;
  border-radius: 4px;
  border: 1px solid #ccc;
  min-width: 150px;
  height: 38px;
}

/* === 按鈕樣式 === */
.btn-primary {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: none;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  height: 38px;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-primary:hover {
  background-color: #0056b3;
}

.btn-primary:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.btn-success {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: none;
  background-color: #198754;
  color: white;
  cursor: pointer;
  height: 38px;
  font-weight: 500;
}

.btn-success:hover {
  background-color: #157347;
}

.btn-success:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  border: 1px solid #6c757d;
  background-color: #fff;
  color: #6c757d;
  cursor: pointer;
  height: 38px;
}

.btn-sm {
  padding: 0.25rem 0.75rem;
  font-size: 0.875rem;
  border-radius: 4px;
  border: none;
  cursor: pointer;
}

.btn-edit {
  background-color: #ffc107;
  color: #212529;
  margin-right: 0.5rem;
}

.btn-delete {
  background-color: #dc3545;
  color: white;
}

/* === 表格樣式 === */
.table-container {
  flex-grow: 1;
  overflow: auto;
  border: 1px solid #dee2e6;
  border-radius: 4px;
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

tbody tr:nth-child(even) {
  background-color: #f8f9fa;
}

tbody tr:hover {
  background-color: #e9ecef;
}

/* === 狀態顯示 === */
.loading-state,
.placeholder-text,
.empty-state {
  text-align: center;
  color: #6c757d;
  padding: 3rem;
  font-size: 1.1rem;
}

/* === 消耗紀錄子頁籤 === */
.sub-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.sub-tabs button {
  padding: 0.5rem 1rem;
  border: 1px solid #dee2e6;
  background-color: #f8f9fa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.sub-tabs button.active {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}

.sub-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-controls {
  display: flex;
  gap: 1rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.group-filters {
  display: flex;
  gap: 1rem;
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
  min-width: 120px;
  height: 38px;
}

.report-display {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.consumption-table {
  flex: 1;
  overflow: auto;
}

/* === 消耗表格 Sticky 欄位 === */
.sticky-col {
  position: sticky;
  background-color: #f8f9fa;
  z-index: 5;
}

.sticky-col.col-freq {
  left: 0;
  min-width: 70px;
}

.sticky-col.col-shift {
  left: 70px;
  min-width: 70px;
}

.sticky-col.col-bed {
  left: 140px;
  min-width: 70px;
}

.sticky-col.col-mrn {
  left: 210px;
  min-width: 100px;
}

.sticky-col.col-name {
  left: 310px;
  min-width: 100px;
}

tbody .sticky-col {
  background-color: #fff;
}

tbody tr:nth-child(even) .sticky-col {
  background-color: #f8f9fa;
}

/* === 上傳區域 === */
.upload-panel {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 2rem;
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
  transition: all 0.2s;
}

.file-input-label:hover {
  background-color: #e9ecef;
}

.upload-btn-main {
  padding: 0.75rem 2rem;
  font-size: 1.1rem;
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

/* === 每月盤點 === */
.monthly-summary {
  display: flex;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.summary-card {
  flex: 1;
  min-width: 150px;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  text-align: center;
  position: relative;
}

.summary-card h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}

.summary-card p {
  margin: 0;
  font-size: 0.9rem;
  color: #6c757d;
}

.summary-card .operator {
  position: absolute;
  left: -1rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1.5rem;
  font-weight: bold;
  color: #6c757d;
}

.summary-card.result {
  background-color: #d4edda;
}

.summary-card.result h4 {
  color: #155724;
}

.positive {
  color: #198754;
}

.negative {
  color: #dc3545;
}

.result-cell {
  font-weight: bold;
  background-color: #fff3cd;
}

.adjustment-input {
  width: 80px;
  padding: 0.25rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
}

/* === 每週訂單 === */
.weekly-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.weekly-section {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #e9ecef;
}

.section-header h4 {
  margin: 0;
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.category-section {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
}

.category-section h5 {
  margin: 0 0 1rem 0;
  color: #495057;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 0.5rem;
}

.item-inputs {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.item-row label {
  flex: 1;
  font-size: 0.9rem;
}

.item-row input {
  width: 100px;
  padding: 0.375rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  text-align: center;
}

.need-order {
  background-color: #fff3cd;
  font-weight: bold;
  color: #856404;
}

/* === Modal === */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background-color: #fff;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
}

.modal-header h3 {
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}

.modal-body {
  padding: 1.5rem;
}

.form-field {
  margin-bottom: 1rem;
}

.form-field label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #495057;
}

.form-field input,
.form-field select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #dee2e6;
}
</style>
