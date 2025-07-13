<!-- 檔案路徑: src/views/MemoView.vue (已修改姓名樣式) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import { useRoute, useRouter } from 'vue-router'
import { useNotification } from '@/composables/useNotification.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// --- API 實例 ---
const memosApi = ApiManager('memos')
const patientsApi = ApiManager('patients')

// --- 核心狀態 ---
const memos = ref([])
const allPatients = ref([])
const contentInput = ref('')
const dateInput = ref('') // 到期日

// --- UI 狀態 ---
const isPatientDialogVisible = ref(false)
const selectedPatient = ref(null)
const filterPatientId = ref(null)
const activeTab = ref('expired')

// --- Dialog State ---
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)

const { addNotification } = useNotification()

// --- 路由實例 ---
const route = useRoute()
const router = useRouter()

// --- 計算屬性 ---
const pendingList = computed(() =>
  memos.value
    .filter((memo) => {
      const isPending = memo.status === 'pending' || !memo.status
      if (filterPatientId.value) {
        return isPending && memo.patientId === filterPatientId.value
      }
      return isPending
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
)

const resolvedList = computed(() => {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return memos.value
    .filter((memo) => {
      const isRecentResolved = memo.status === 'resolved' && new Date(memo.createdAt) > sevenDaysAgo
      if (filterPatientId.value) {
        return isRecentResolved && memo.patientId === filterPatientId.value
      }
      return isRecentResolved
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const expiredList = computed(() =>
  memos.value
    .filter((memo) => {
      const isExpired = memo.status === 'expired'
      if (filterPatientId.value) {
        return isExpired && memo.patientId === filterPatientId.value
      }
      return isExpired
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
)

// --- 方法 ---
async function fetchMemos() {
  try {
    memos.value = await memosApi.fetchAll()
  } catch (error) {
    console.error('讀取備忘錄失敗:', error)
  }
}

async function fetchAllPatients() {
  try {
    allPatients.value = await patientsApi.fetchAll()
  } catch (error) {
    console.error('獲取病人列表失敗:', error)
  }
}

async function addMemo() {
  if (!contentInput.value.trim()) {
    alertDialogTitle.value = '提示'
    alertDialogMessage.value = '備忘內容不能為空！'
    isAlertDialogVisible.value = true
    return
  }
  const newMemo = {
    content: contentInput.value.trim(),
    patientId: selectedPatient.value ? selectedPatient.value.id : null,
    patientName: selectedPatient.value ? selectedPatient.value.name : null,
    targetDate: dateInput.value || null,
    status: 'pending',
    isResolved: false,
    createdAt: new Date().toISOString(),
  }
  try {
    await memosApi.save(newMemo)
    addNotification('新增交班備忘', 'memo')
    contentInput.value = ''
    dateInput.value = ''
    clearPatientSelection()
    await fetchMemos()
  } catch (error) {
    console.error('新增備忘失敗:', error)
    alertDialogTitle.value = '錯誤'
    alertDialogMessage.value = '新增備忘失敗！'
    isAlertDialogVisible.value = true
  }
}

function handlePatientSelected({ patientId }) {
  const patient = allPatients.value.find((p) => p.id === patientId) || null
  selectedPatient.value = patient
  filterPatientId.value = patient ? patient.id : null
  isPatientDialogVisible.value = false

  if (patient) {
    router.replace({ query: { patientId: patient.id } })
  } else {
    router.replace({ query: {} })
  }
}

function clearPatientSelection() {
  selectedPatient.value = null
  filterPatientId.value = null
  router.replace({ query: {} })
}

async function updateMemoStatus(id, resolve, isFromExpired = false) {
  try {
    let newStatus = ''
    let message = ''

    if (resolve) {
      newStatus = 'resolved'
      message = '備忘已處理'
    } else {
      newStatus = 'pending'
      message = isFromExpired ? '備忘已從過期中移回待辦' : '備忘移回待辦'
    }

    await memosApi.update(id, { status: newStatus, isResolved: resolve })
    await fetchMemos()
    addNotification(message, 'memo')
  } catch (error) {
    console.error('更新狀態失敗:', error)
    alertDialogTitle.value = '錯誤'
    alertDialogMessage.value = '更新狀態失敗！'
    isAlertDialogVisible.value = true
  }
}

async function deleteMemo(id) {
  confirmDialogTitle.value = '確認刪除'
  confirmDialogMessage.value = '確定要永久刪除這條備忘嗎？此操作無法復原。'
  confirmAction.value = async () => {
    try {
      await memosApi.delete(id)
      await fetchMemos()
      addNotification('刪除一則備忘', 'memo')
    } catch (error) {
      console.error('刪除失敗:', error)
      alertDialogTitle.value = '錯誤'
      alertDialogMessage.value = '刪除失敗！'
      isAlertDialogVisible.value = true
    }
  }
  isConfirmDialogVisible.value = true
}

function openPatientDialog() {
  isPatientDialogVisible.value = true
}

function handleConfirm() {
  if (confirmAction.value) {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

// ✨ 1. 修改函式，讓它回傳包含 HTML 的字串 ✨
function getMemoDisplayContent(memo) {
  if (memo.patientName) {
    // 使用一個特殊的 class 來包裹病人姓名
    return `<span class="memo-patient-name">${memo.patientName}</span> ${memo.content}`
  }
  return memo.content
}

onMounted(() => {
  const patientIdFromQuery = route.query.patientId

  Promise.all([fetchMemos(), fetchAllPatients()]).then(() => {
    if (patientIdFromQuery) {
      const patient = allPatients.value.find((p) => p.id === patientIdFromQuery)
      if (patient) {
        selectedPatient.value = patient
        filterPatientId.value = patientIdFromQuery
      }
    }
  })
})
</script>

<template>
  <div class="page-container memo-view">
    <h1 class="page-title">交班備忘錄</h1>

    <div class="memo-layout-grid">
      <!-- 左欄 -->
      <div class="left-column">
        <div class="memo-card form-card">
          <h2 class="card-title">
            <span v-if="filterPatientId">{{ selectedPatient?.name }} 的備忘</span>
            <span v-else>新增備忘</span>
          </h2>
          <div class="memo-form">
            <textarea v-model="contentInput" placeholder="請輸入交班事項或備註..."></textarea>
            <div class="form-actions">
              <div class="option-item">
                <label>關聯病人</label>
                <div v-if="selectedPatient" class="selected-patient-display">
                  <span>{{ selectedPatient.name }}</span>
                  <button @click="clearPatientSelection" class="clear-btn" title="清除選擇與篩選">
                    ×
                  </button>
                </div>
                <button v-else @click="openPatientDialog" class="select-btn">選擇病人</button>
              </div>
              <div class="option-item">
                <label for="memo-date-input">到期日</label>
                <input v-model="dateInput" type="date" id="memo-date-input" />
              </div>
            </div>
            <button @click="addMemo" class="add-btn">新增備忘</button>
          </div>
        </div>
        <div class="memo-card history-card">
          <div class="tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'expired' }"
              @click="activeTab = 'expired'"
            >
              已到期事項
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'resolved' }"
              @click="activeTab = 'resolved'"
            >
              已處理事項 (最近7天)
            </button>
          </div>
          <div class="tab-content">
            <ul v-if="activeTab === 'expired'" class="memo-list">
              <li v-for="memo in expiredList" :key="memo.id" class="memo-item expired">
                <div class="memo-content">
                  <!-- ✨ 2. 使用 v-html 指令來渲染 ✨ -->
                  <p v-html="getMemoDisplayContent(memo)"></p>
                  <div class="memo-meta">
                    <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                    <span v-if="memo.targetDate"
                      >| 到期於: <strong>{{ memo.targetDate }}</strong></span
                    >
                  </div>
                </div>
                <div class="memo-actions">
                  <button class="revert-btn" @click="updateMemoStatus(memo.id, false, true)">
                    移回待辦
                  </button>
                  <button class="delete-btn" @click="deleteMemo(memo.id)">刪除</button>
                </div>
              </li>
              <li v-if="expiredList.length === 0" class="empty-state">沒有已到期的事項。</li>
            </ul>
            <ul v-if="activeTab === 'resolved'" class="memo-list">
              <li v-for="memo in resolvedList" :key="memo.id" class="memo-item resolved">
                <div class="memo-content">
                  <p v-html="getMemoDisplayContent(memo)"></p>
                  <div class="memo-meta">
                    <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                  </div>
                </div>
                <div class="memo-actions">
                  <button class="revert-btn" @click="updateMemoStatus(memo.id, false)">
                    移回待辦
                  </button>
                  <button class="delete-btn" @click="deleteMemo(memo.id)">刪除</button>
                </div>
              </li>
              <li v-if="resolvedList.length === 0" class="empty-state">
                {{ filterPatientId ? '最近7天該病人無已處理事項' : '最近7天沒有已處理事項。' }}
              </li>
            </ul>
          </div>
        </div>
      </div>
      <!-- 右欄 -->
      <div class="memo-card pending-card">
        <h2 class="card-title">
          {{ filterPatientId ? '待處理事項' : '所有待處理事項' }}
        </h2>
        <ul class="memo-list">
          <li v-for="memo in pendingList" :key="memo.id" class="memo-item">
            <div class="memo-content">
              <p v-html="getMemoDisplayContent(memo)"></p>
              <div class="memo-meta">
                <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                <span v-if="memo.targetDate"
                  >| 到期日: <strong class="date-highlight">{{ memo.targetDate }}</strong></span
                >
              </div>
            </div>
            <div class="memo-actions">
              <button class="resolve-btn" @click="updateMemoStatus(memo.id, true)">
                標為已處理
              </button>
              <button class="delete-btn" @click="deleteMemo(memo.id)">刪除</button>
            </div>
          </li>
          <li v-if="pendingList.length === 0" class="empty-state">
            {{ filterPatientId ? '該病人無待辦事項' : '太棒了，沒有待辦事項！' }}
          </li>
        </ul>
      </div>
    </div>
  </div>

  <PatientSelectDialog
    :is-visible="isPatientDialogVisible"
    title="選擇關聯病人"
    :patients="allPatients"
    :show-fill-options="false"
    @confirm="handlePatientSelected"
    @cancel="isPatientDialogVisible = false"
  />

  <AlertDialog
    :is-visible="isAlertDialogVisible"
    :title="alertDialogTitle"
    :message="alertDialogMessage"
    @confirm="isAlertDialogVisible = false"
  />
  <ConfirmDialog
    :is-visible="isConfirmDialogVisible"
    :title="confirmDialogTitle"
    :message="confirmDialogMessage"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  />
</template>

<style scoped>
/* ✨ 3. 新增/修改 CSS 樣式 ✨ */
.memo-content p {
  margin: 0 0 10px 0;
  white-space: pre-wrap;
  color: #212529;
  font-size: 1.05rem;
  font-weight: 500;
}

/* 使用 :deep() 或 >>> 來穿透 scoped 樣式，設定 v-html 渲染出的內容 */
:deep(.memo-patient-name) {
  font-weight: 700; /* 粗體 */
  color: #0056b3; /* 深藍色 */
  margin-right: 0.5em; /* 和後面的內容稍微隔開 */
}

.memo-meta {
  font-size: 0.85rem;
  color: #6c757d;
}
.memo-meta strong {
  color: #495057;
}
.memo-meta .date-highlight {
  color: #c82333;
  font-weight: bold;
}
/* 其他樣式保持不變 */
.memo-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-title {
  margin-bottom: 0;
  color: #2c3e50;
}
.memo-layout-grid {
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 24px;
  align-items: start;
  height: calc(100vh - 120px);
}
.left-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
}
.memo-card {
  background-color: #ffffff;
  border-radius: 12px;
  border: 1px solid #e9ecef;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  padding: 24px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.card-title {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.6rem;
  color: #343a40;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f3f5;
}
.form-card {
  flex-shrink: 0;
}
.form-card .memo-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-card textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ced4da;
  font-size: 1rem;
  line-height: 1.6;
}
.form-card .form-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-card .option-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
}
.form-card label {
  font-weight: 600;
  color: #495057;
  font-size: 0.9rem;
}
.form-card input[type='date'],
.form-card .selected-patient-display,
.form-card .select-btn {
  width: 100%;
  height: 42px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  box-sizing: border-box;
}
.form-card .select-btn {
  background-color: #fff;
  cursor: pointer;
}
.form-card .selected-patient-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #e9ecef;
}
.form-card .clear-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 5px;
  color: #6c757d;
}
.form-card .add-btn {
  grid-column: 1 / -1;
  padding: 12px 20px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: 600;
  transition: background-color 0.2s;
}
.form-card .add-btn:hover {
  background-color: #0056b3;
}
.pending-card {
  height: 100%;
}
.history-card {
  flex-grow: 1;
  min-height: 0;
}
.tabs {
  display: flex;
  border-bottom: 1px solid #dee2e6;
  margin-bottom: 16px;
}
.tab-btn {
  padding: 10px 16px;
  border: none;
  background: none;
  font-size: 1rem;
  cursor: pointer;
  position: relative;
  color: #6c757d;
  font-weight: 500;
  margin-bottom: -1px;
}
.tab-btn.active {
  color: var(--primary-color);
  font-weight: 600;
  border-bottom: 3px solid var(--primary-color);
}
.tab-content {
  flex-grow: 1;
  min-height: 0;
  overflow-y: auto;
}
.memo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.memo-item {
  background-color: #f8f9fa;
  padding: 16px;
  border: 1px solid #e9ecef;
  border-left-width: 5px;
  border-radius: 8px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.memo-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.memo-actions button {
  padding: 6px 12px;
  border-radius: 5px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  color: white;
}
.empty-state {
  text-align: center;
  color: #adb5bd;
  padding: 40px 20px;
  font-style: italic;
}
.memo-item {
  border-left-color: #ffc107;
}
.memo-item.resolved {
  border-left-color: #28a745;
}
.memo-item.resolved p {
  text-decoration: line-through;
  color: #6c757d;
}
.memo-item.expired {
  border-left-color: #6c757d;
}
.memo-item.expired p {
  color: #6c757d;
}
.resolve-btn {
  background-color: #28a745;
  border-color: #28a745;
}
.delete-btn {
  background-color: #dc3545;
  border-color: #dc3545;
}
.revert-btn {
  background-color: #007bff;
  border-color: #007bff;
}
</style>
