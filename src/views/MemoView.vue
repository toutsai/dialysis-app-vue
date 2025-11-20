<!-- 檔案路徑: src/views/MemoView.vue (Pinia 遷移版) -->
<template>
  <div class="page-container memo-view">
    <h1 class="page-title">
      交班備忘錄
      <span v-if="!isLoading && memoStats.total > 0" class="title-stats">
        ({{ filterPatientId ? `${selectedPatient?.name}: ` : '' }}待辦{{ memoStats.pending }}筆)
      </span>
    </h1>

    <div v-if="error" class="error-banner">
      <span>{{ error }}</span>
      <button @click="retryLoadData" class="retry-btn">重試</button>
    </div>

    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在載入備忘錄資料...</p>
    </div>

    <div v-else class="memo-layout-grid">
      <!-- 新增備忘卡片只在桌面顯示 -->
      <div class="memo-card form-card desktop-only">
        <h2 class="card-title">
          <span v-if="filterPatientId">{{ selectedPatient?.name }} 的備忘</span>
          <span v-else>新增備忘</span>
        </h2>
        <div class="memo-form">
          <div class="textarea-wrapper">
            <textarea
              v-model="contentInput"
              placeholder="請輸入交班事項或備註..."
              :disabled="isSubmitting"
            ></textarea>
            <div class="char-count">{{ contentInput.length }}/500</div>
          </div>
          <div class="form-actions">
            <div class="option-item">
              <label>關聯病人</label>
              <div v-if="selectedPatient" class="selected-patient-display">
                <span>{{ selectedPatient.name }}</span>
                <button
                  @click="clearPatientSelection"
                  class="clear-btn"
                  title="清除選擇與篩選"
                  :disabled="isSubmitting"
                >
                  ×
                </button>
              </div>
              <button
                v-else
                @click="openPatientDialog"
                class="select-btn"
                :disabled="isSubmitting || isPatientsLoading"
              >
                <span>{{ isPatientsLoading ? '載入中...' : '選擇病人' }}</span>
              </button>
            </div>
            <div class="option-item">
              <label for="memo-date-input">到期日</label>
              <input
                v-model="dateInput"
                type="date"
                id="memo-date-input"
                :disabled="isSubmitting"
              />
            </div>
          </div>
          <button @click="addMemo" class="add-btn" :disabled="isSubmitting || !contentInput.trim()">
            <span>{{ isSubmitting ? '新增中...' : '新增備忘' }}</span>
          </button>
        </div>
      </div>

      <!-- 待辦事項卡片 -->
      <div class="memo-card pending-card">
        <h2 class="card-title">
          {{ filterPatientId ? '待處理事項' : '所有待處理事項' }}
          <span v-if="memoStats.pending > 0" class="title-count">{{ memoStats.pending }}</span>
        </h2>
        <div v-if="isMemosLoading" class="card-loading">
          <div class="loading-spinner"></div>
          <p>載入待處理事項...</p>
        </div>
        <ul v-else class="memo-list">
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

      <!-- 歷史/已處理卡片 -->
      <div class="memo-card history-card">
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'expired' }"
            @click="activeTab = 'expired'"
          >
            已到期事項 (最近7天)
            <!-- ✨ 修改這裡的文字 -->
            <span v-if="memoStats.expired > 0" class="tab-count expired-count">{{
              memoStats.expired
            }}</span>
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'resolved' }"
            @click="activeTab = 'resolved'"
          >
            已處理事項 (最近90天)
            <span v-if="memoStats.resolved > 0" class="tab-count resolved-count">{{
              memoStats.resolved
            }}</span>
          </button>
        </div>
        <div class="tab-content">
          <div v-if="isMemosLoading" class="tab-loading">
            <div class="loading-spinner small"></div>
            <span>載入中...</span>
          </div>
          <ul v-else-if="activeTab === 'expired'" class="memo-list">
            <li v-for="memo in expiredList" :key="memo.id" class="memo-item expired">
              <div class="memo-content">
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
          <ul v-else-if="activeTab === 'resolved'" class="memo-list">
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
              {{ filterPatientId ? '最近90天該病人無已處理事項' : '最近90天沒有已處理事項。' }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- 手機版專用的 FAB 按鈕 -->
    <button class="fab mobile-only" @click="openFormModal">+</button>

    <!-- 手機版專用的新增表單 Modal -->
    <div v-if="isFormModalVisible" class="form-modal-overlay" v-overlay-close="closeFormModal">
      <div class="memo-card form-card">
        <h2 class="card-title">
          <span v-if="filterPatientId">{{ selectedPatient?.name }} 的備忘</span>
          <span v-else>新增備忘</span>
          <button @click="closeFormModal" class="close-modal-btn">×</button>
        </h2>
        <div class="memo-form">
          <div class="textarea-wrapper">
            <textarea
              v-model="contentInput"
              placeholder="請輸入交班事項或備註..."
              :disabled="isSubmitting"
            ></textarea>
            <div class="char-count">{{ contentInput.length }}/500</div>
          </div>
          <div class="form-actions">
            <div class="option-item">
              <label>關聯病人</label>
              <div v-if="selectedPatient" class="selected-patient-display">
                <span>{{ selectedPatient.name }}</span>
                <button
                  @click="clearPatientSelection"
                  class="clear-btn"
                  title="清除選擇與篩選"
                  :disabled="isSubmitting"
                >
                  ×
                </button>
              </div>
              <button
                v-else
                @click="openPatientDialog"
                class="select-btn"
                :disabled="isSubmitting || isPatientsLoading"
              >
                <span>{{ isPatientsLoading ? '載入中...' : '選擇病人' }}</span>
              </button>
            </div>
            <div class="option-item">
              <label for="memo-date-input-mobile">到期日</label>
              <input
                v-model="dateInput"
                type="date"
                id="memo-date-input-mobile"
                :disabled="isSubmitting"
              />
            </div>
          </div>
          <button @click="addMemo" class="add-btn" :disabled="isSubmitting || !contentInput.trim()">
            <span>{{ isSubmitting ? '新增中...' : '新增備忘' }}</span>
          </button>
        </div>
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

// src/views/MemoView.vue
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import ApiManager from '@/services/api_manager'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import { useRoute, useRouter } from 'vue-router'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

import { usePatientStore } from '@/stores/patientStore'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients, isLoading: isPatientsLoading } = storeToRefs(patientStore)

const memosApi = ApiManager('memos')

const memos = ref([])
const contentInput = ref('')
const dateInput = ref('')
const isPatientDialogVisible = ref(false)
const selectedPatient = ref(null)
const filterPatientId = ref(null)
const activeTab = ref('expired')
const isFormModalVisible = ref(false)
const isLoading = ref(false)
const isSubmitting = ref(false)
const isMemosLoading = ref(false)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)

const { createGlobalNotification } = useGlobalNotifier()
const route = useRoute()
const router = useRouter()
const error = ref(null)

const SYSTEM_MEMO_KEYWORDS = [
  '【臨時調班】',
  '【區間暫停】',
  '【臨時加洗】',
  '【區間調班】',
  '【更新-臨時調班】',
]

function isSystemMemo(memo) {
  return SYSTEM_MEMO_KEYWORDS.some((keyword) => memo.content.startsWith(keyword))
}

const pendingList = computed(() =>
  memos.value
    .filter((memo) => {
      const isPending = memo.status === 'pending' || !memo.status
      if (isPending && !isSystemMemo(memo)) {
        if (filterPatientId.value) {
          return memo.patientId === filterPatientId.value
        }
        return true
      }
      return false
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
)

const resolvedList = computed(() => {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  return memos.value
    .filter((memo) => {
      const isRecentResolved =
        memo.status === 'resolved' && new Date(memo.createdAt) > ninetyDaysAgo
      if (isRecentResolved && !isSystemMemo(memo)) {
        if (filterPatientId.value) {
          return memo.patientId === filterPatientId.value
        }
        return true
      }
      return false
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

// ✨ --- 【核心修改】 --- ✨
// 只顯示 7 天內的已到期事項
const expiredList = computed(() => {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return memos.value
    .filter((memo) => {
      // 條件 1: 狀態是 'expired'
      // 條件 2: "到期日" (targetDate) 在過去 7 天內
      // 條件 3: 不是系統生成的備忘
      const isExpired = memo.status === 'expired'
      const isRecent = memo.targetDate && new Date(memo.targetDate) >= sevenDaysAgo

      if (isExpired && isRecent && !isSystemMemo(memo)) {
        if (filterPatientId.value) {
          return memo.patientId === filterPatientId.value
        }
        return true
      }
      return false
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

const memoStats = computed(() => ({
  total: memos.value.length,
  pending: pendingList.value.length,
  resolved: resolvedList.value.length,
  expired: expiredList.value.length,
}))

// ... (所有其他 methods 和生命週期鉤子保持不變) ...
async function fetchMemos() {
  if (isMemosLoading.value) return
  isMemosLoading.value = true
  error.value = null
  try {
    memos.value = await memosApi.fetchAll()
  } catch (err) {
    error.value = '載入備忘錄失敗，請重試'
    handleError('讀取備忘錄失敗', err)
  } finally {
    isMemosLoading.value = false
  }
}
async function initializeData() {
  isLoading.value = true
  try {
    await patientStore.fetchPatientsIfNeeded()
    await fetchMemos()
    const patientIdFromQuery = route.query.patientId
    if (patientIdFromQuery && allPatients.value.length > 0) {
      const patient = allPatients.value.find((p) => p.id === patientIdFromQuery)
      if (patient) {
        selectedPatient.value = patient
        filterPatientId.value = patientIdFromQuery
      }
    }
  } catch (err) {
    error.value = '初始化失敗，請重新整理頁面'
  } finally {
    isLoading.value = false
  }
}
async function addMemo() {
  if (!contentInput.value.trim()) {
    showAlert('提示', '備忘內容不能為空！')
    return
  }
  if (isSubmitting.value) return
  isSubmitting.value = true
  const newMemo = {
    content: contentInput.value.trim(),
    patientId: selectedPatient.value?.id || null,
    patientName: selectedPatient.value?.name || null,
    targetDate: dateInput.value || null,
    status: 'pending',
    isResolved: false,
    createdAt: new Date().toISOString(),
  }
  try {
    const tempId = `temp_${Date.now()}`
    memos.value.unshift({ ...newMemo, id: tempId })
    const contentPreview =
      contentInput.value.substring(0, 20) + (contentInput.value.length > 20 ? '...' : '')
    const patientContext = selectedPatient.value ? ` (${selectedPatient.value.name})` : ''
    contentInput.value = ''
    dateInput.value = ''
    clearPatientSelection()
    const savedMemo = await memosApi.save(newMemo)
    const tempIndex = memos.value.findIndex((m) => m.id === tempId)
    if (tempIndex !== -1) memos.value[tempIndex] = savedMemo
    createGlobalNotification(`新增備忘：${contentPreview}${patientContext}`, 'memo')
    closeFormModal()
  } catch (err) {
    const tempIndex = memos.value.findIndex((m) => m.content === newMemo.content)
    if (tempIndex !== -1) memos.value.splice(tempIndex, 1)
    contentInput.value = newMemo.content
    dateInput.value = newMemo.targetDate || ''
    if (newMemo.patientId) {
      const patient = allPatients.value.find((p) => p.id === newMemo.patientId)
      if (patient) {
        selectedPatient.value = patient
      }
    }
    handleError('新增備忘失敗', err)
  } finally {
    isSubmitting.value = false
  }
}
function handlePatientSelected({ patientId }) {
  const patient = allPatients.value.find((p) => p.id === patientId) || null
  selectedPatient.value = patient
  isPatientDialogVisible.value = false
}
function clearPatientSelection() {
  selectedPatient.value = null
  if (route.query.patientId) {
    filterPatientId.value = null
    router.replace({ query: {} })
  }
}
async function updateMemoStatus(id, resolve) {
  const memoIndex = memos.value.findIndex((m) => m.id === id)
  if (memoIndex === -1) return
  const originalMemo = { ...memos.value[memoIndex] }
  const newStatus = resolve ? 'resolved' : 'pending'
  memos.value[memoIndex] = { ...originalMemo, status: newStatus, isResolved: resolve }
  try {
    await memosApi.update(id, { status: newStatus, isResolved: resolve })
    const contentPreview =
      originalMemo.content.substring(0, 20) + (originalMemo.content.length > 20 ? '...' : '')
    const patientContext = originalMemo.patientName ? ` (${originalMemo.patientName})` : ''
    if (resolve) {
      createGlobalNotification(`已處理備忘：${contentPreview}${patientContext}`, 'success')
    } else {
      createGlobalNotification(`已移回待辦：${contentPreview}${patientContext}`, 'info')
    }
  } catch (err) {
    memos.value[memoIndex] = originalMemo
    handleError('更新狀態失敗', err)
  }
}
async function deleteMemo(id) {
  confirmDialogTitle.value = '確認刪除'
  confirmDialogMessage.value = '您確定要刪除這筆備忘錄嗎？此操作無法復原。'
  confirmAction.value = async () => {
    const memoIndex = memos.value.findIndex((m) => m.id === id)
    if (memoIndex === -1) return
    const memoToDelete = { ...memos.value[memoIndex] }
    memos.value.splice(memoIndex, 1)
    try {
      await memosApi.delete(id)
      const contentPreview =
        memoToDelete.content.substring(0, 20) + (memoToDelete.content.length > 20 ? '...' : '')
      const patientContext = memoToDelete.patientName ? ` (${memoToDelete.patientName})` : ''
      createGlobalNotification(`已刪除備忘：${contentPreview}${patientContext}`, 'info')
    } catch (err) {
      memos.value.splice(memoIndex, 0, memoToDelete)
      handleError('刪除備忘失敗', err)
    }
  }
  isConfirmDialogVisible.value = true
}
function openPatientDialog() {
  isPatientDialogVisible.value = true
}
function handleConfirm() {
  if (confirmAction.value) confirmAction.value()
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function handleError(title, error) {
  console.error(`❌ [MemoView] ${title}:`, error)
  showAlert('錯誤', `${title}！請稍後重試。`)
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
async function retryLoadData() {
  error.value = null
  await initializeData()
}
function getMemoDisplayContent(memo) {
  if (memo.patientName) {
    return `<span class="memo-patient-name">${memo.patientName}</span> ${memo.content}`
  }
  return memo.content
}
function openFormModal() {
  isFormModalVisible.value = true
}
function closeFormModal() {
  isFormModalVisible.value = false
}
watch(
  () => route.query.patientId,
  (newPatientId) => {
    filterPatientId.value = newPatientId || null
    if (newPatientId && allPatients.value.length > 0) {
      const patient = allPatients.value.find((p) => p.id === newPatientId)
      if (patient) {
        selectedPatient.value = patient
      }
    } else {
      selectedPatient.value = null
    }
  },
  { immediate: true },
)
onMounted(() => {
  initializeData()
})
</script>

<style scoped>
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */

.page-container.memo-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 0.5rem;
  box-sizing: border-box;
}

.page-title {
  margin: 0;
  padding-bottom: 1rem;
  border-bottom: 1px solid #dee2e6;
  color: #2c3e50;
  display: flex;
  align-items: baseline;
  flex-shrink: 0;
}

.title-stats {
  font-size: 0.9rem;
  font-weight: 400;
  color: #6c757d;
  margin-left: 12px;
}

.error-banner,
.loading-container {
  flex-shrink: 0;
}

.error-banner {
  background-color: #f8d7da;
  color: #721c24;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid #f5c6cb;
}
.retry-btn {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
}

.card-loading,
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: #6c757d;
}
.tab-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 150px;
  gap: 8px;
  color: #6c757d;
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}
.loading-spinner.small {
  width: 20px;
  height: 20px;
  border-width: 2px;
  margin-bottom: 0;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.memo-layout-grid {
  display: grid;
  grid-template-areas:
    'form pending'
    'history pending';
  grid-template-columns: 1fr 1.5fr;
  grid-template-rows: auto 1fr;
  gap: 24px;
  flex-grow: 1;
  min-height: 0;
}

.form-card {
  grid-area: form;
}
.pending-card {
  grid-area: pending;
}
.history-card {
  grid-area: history;
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
  margin: 0 0 20px 0;
  font-size: 1.6rem;
  color: #343a40;
  padding-bottom: 16px;
  border-bottom: 1px solid #f1f3f5;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.title-count {
  font-size: 0.9rem;
  background-color: #dc3545;
  color: white;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 12px;
}

.form-card {
  flex-shrink: 0;
}

.pending-card,
.tab-content {
  overflow-y: auto;
  flex-grow: 1;
}

.form-card .memo-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.textarea-wrapper {
  position: relative;
}
.form-card textarea {
  width: 100%;
  min-height: 120px;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #ced4da;
  font-size: 1rem;
  resize: vertical;
}
.char-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 0.8rem;
  color: #6c757d;
}
.form-card .form-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-card .option-item {
  display: flex;
  flex-direction: column;
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
}
.form-card .add-btn {
  padding: 12px 20px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
}

.tabs {
  display: flex;
  border-bottom: 1px solid #dee2e6;
  margin-bottom: 16px;
  flex-shrink: 0;
}
.tab-btn {
  padding: 10px 16px;
  border: none;
  background: none;
  cursor: pointer;
  color: #6c757d;
  font-weight: 500;
  margin-bottom: -1px;
}
.tab-btn.active {
  color: #007bff;
  font-weight: 600;
  border-bottom: 3px solid #007bff;
}
.tab-count {
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 6px;
}
.tab-count.expired-count {
  background-color: #007bff;
  color: white;
}
.tab-count.resolved-count {
  background-color: #28a745;
  color: white;
}

.memo-list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.memo-item {
  background-color: #f8f9fa;
  padding: 16px;
  border-left: 5px solid #ffc107;
  border-radius: 8px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.memo-content {
  flex-grow: 1;
  min-width: 0;
}
.memo-content p {
  margin: 0 0 10px 0;
  white-space: pre-wrap;
  font-size: 1.05rem;
}
:deep(.memo-patient-name) {
  font-weight: 700;
  color: #0056b3;
}
.memo-meta {
  font-size: 0.85rem;
  color: #6c757d;
}
.memo-meta .date-highlight {
  color: #c82333;
  font-weight: bold;
}
.memo-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.memo-actions button {
  padding: 6px 12px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  color: white;
}
.empty-state {
  text-align: center;
  color: #adb5bd;
  padding: 40px 20px;
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
.resolve-btn {
  background-color: #28a745;
}
.delete-btn {
  background-color: #dc3545;
}
.revert-btn {
  background-color: #007bff;
}
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.fab {
  position: fixed;
  bottom: 2rem;
  right: 1.5rem;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background-color: #007bff;
  color: white;
  border: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  font-size: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  cursor: pointer;
}

.form-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.form-modal-overlay .form-card {
  width: 100%;
  max-width: 500px;
}

.close-modal-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
  margin-left: auto;
}

.mobile-only {
  display: none;
}
.desktop-only {
  display: flex;
}

@media (max-width: 1024px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: flex;
  }

  .page-container.memo-view {
    height: auto;
    display: block;
    padding: 1rem;
  }

  .memo-layout-grid {
    display: flex;
    flex-direction: column;
    grid-template-areas: none;
    grid-template-columns: 1fr;
    flex-grow: unset;
    min-height: unset;
  }

  .pending-card {
    order: 1;
  }
  .history-card {
    order: 2;
  }

  .pending-card,
  .history-card {
    min-height: auto;
    overflow-y: visible;
  }
  .tab-content {
    overflow-y: visible;
  }

  .page-title {
    font-size: 1.8rem;
    padding-bottom: 1rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid #dee2e6;
  }
}

@media (max-width: 768px) {
  .form-card .form-actions {
    grid-template-columns: 1fr;
  }
  .memo-card {
    padding: 1rem;
  }
  .memo-actions {
    flex-direction: column;
    align-items: flex-end;
  }
}
</style>
