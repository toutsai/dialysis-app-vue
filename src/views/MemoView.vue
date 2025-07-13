<!-- src/views/MemoView.vue (已修改) -->
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
      // 狀態為 'pending' 或沒有 status 欄位的舊資料
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
      // 狀態為 'resolved' 的資料
      const isRecentResolved = memo.status === 'resolved' && new Date(memo.createdAt) > sevenDaysAgo
      if (filterPatientId.value) {
        return isRecentResolved && memo.patientId === filterPatientId.value
      }
      return isRecentResolved
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

// 【新增】expiredList 的計算屬性
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
    status: 'pending', // 使用 status 欄位，預設為 'pending'
    isResolved: false, // 為了兼容舊的 resolvedList，暫時保留
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

// 【修改】updateMemoStatus 函式以處理新狀態
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

    await memosApi.update(id, { status: newStatus, isResolved: resolve }) // 同時更新兩個欄位
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
      <div id="form-section" class="memo-form-container">
        <div class="memo-form">
          <h2 v-if="filterPatientId">{{ selectedPatient?.name }} 的備忘</h2>
          <h2 v-else>新增備忘</h2>
          <textarea v-model="contentInput" placeholder="請輸入交班事項或備註..."></textarea>

          <div class="form-actions">
            <div class="options-wrapper">
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
      </div>

      <div id="pending-section" class="memo-section">
        <h2>{{ filterPatientId ? '待處理事項' : '所有待處理事項' }}</h2>
        <ul class="memo-list">
          <li v-for="memo in pendingList" :key="memo.id" class="memo-item">
            <div class="memo-content">
              <p>{{ memo.content }}</p>
              <div class="memo-meta">
                <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                <span v-if="memo.patientName"
                  >| 關聯病人: <strong>{{ memo.patientName }}</strong></span
                >
                <span v-if="memo.targetDate"
                  >| 到期日: <strong>{{ memo.targetDate }}</strong></span
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

      <div id="expired-section" class="memo-section">
        <h2>{{ filterPatientId ? '已到期事項' : '所有已到期事項' }}</h2>
        <ul class="memo-list">
          <li v-for="memo in expiredList" :key="memo.id" class="memo-item expired">
            <div class="memo-content">
              <p>{{ memo.content }}</p>
              <div class="memo-meta">
                <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                <span v-if="memo.targetDate"
                  >| 到期於: <strong>{{ memo.targetDate }}</strong></span
                >
                <span v-if="memo.patientName"
                  >| 關聯病人: <strong>{{ memo.patientName }}</strong></span
                >
              </div>
            </div>
            <div class="memo-actions">
              <button @click="updateMemoStatus(memo.id, false, true)">移回待處理</button>
              <button class="delete-btn" @click="deleteMemo(memo.id)">刪除</button>
            </div>
          </li>
          <li v-if="expiredList.length === 0" class="empty-state">沒有已到期的事項。</li>
        </ul>
      </div>

      <div id="resolved-section" class="memo-section">
        <h2>{{ filterPatientId ? '已處理事項 (最近7天)' : '所有已處理事項 (最近7天)' }}</h2>
        <ul class="memo-list">
          <li v-for="memo in resolvedList" :key="memo.id" class="memo-item resolved">
            <div class="memo-content">
              <p>{{ memo.content }}</p>
              <div class="memo-meta">
                <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
                <span v-if="memo.patientName"
                  >| 關聯病人: <strong>{{ memo.patientName }}</strong></span
                >
              </div>
            </div>
            <div class="memo-actions">
              <button @click="updateMemoStatus(memo.id, false)">移回待處理</button>
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
.memo-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.page-title {
  margin-bottom: 0;
}
.memo-layout-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    'form pending'
    'expired pending'
    'resolved pending';
  gap: 24px;
  height: calc(100vh - 150px);
}
#form-section {
  grid-area: form;
}
#pending-section {
  grid-area: pending;
  /* 讓 pending 區塊佔滿垂直空間 */
  grid-row: 1 / span 3;
}
#resolved-section {
  grid-area: resolved;
}
#expired-section {
  grid-area: expired;
}

#form-section,
#pending-section,
#resolved-section,
#expired-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 5px;
  border: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.memo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex-grow: 1;
}
.memo-form {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.memo-form textarea {
  width: 100%;
  min-height: 120px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  font-size: 1.1rem;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
}
.add-btn {
  align-self: flex-start;
  padding: 10px 20px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
}
.memo-section h2 {
  margin-top: 0;
  padding-bottom: 10px;
  border-bottom: 1px solid #e9ecef;
}
.memo-item {
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 15px;
}
.memo-item.resolved p {
  text-decoration: line-through;
  color: #6c757d;
}
.memo-item.expired {
  background-color: #f1f5f9;
  border-left: 5px solid #64748b;
}
.memo-item.expired p {
  color: #64748b;
}
.memo-content p {
  margin: 0 0 10px 0;
  white-space: pre-wrap;
}
.memo-meta {
  font-size: 0.9rem;
  color: #6c757d;
}
.memo-meta strong {
  color: #495057;
}
.memo-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.memo-actions button {
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid transparent;
  cursor: pointer;
  height: 35px;
}
.resolve-btn {
  background-color: #28a745;
  color: white;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
}
.empty-state {
  text-align: center;
  color: #adb5bd;
  padding: 40px 20px;
}
.form-actions {
  display: flex;
  flex-direction: column;
  gap: 15px;
}
.options-wrapper {
  display: flex;
  gap: 20px;
  align-items: center;
  flex-wrap: wrap;
}
.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-grow: 1;
  flex-basis: 0;
}
.option-item label {
  flex-shrink: 0;
}
.option-item input[type='text'],
.option-item input[type='date'],
.option-item .selected-patient-display,
.option-item .select-btn {
  flex-grow: 1;
  width: 100%;
  height: 45px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  box-sizing: border-box;
}
.add-btn {
  width: 100%;
  padding: 10px 20px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  text-align: center;
  box-sizing: border-box;
}
.selected-patient-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #e9ecef;
}
.clear-btn {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 0 5px;
}
</style>
