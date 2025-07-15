<!-- 檔案路徑: src/views/MemoView.vue (優化版) -->
<script setup>
import { ref, onMounted, computed, watch } from 'vue'
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

// --- 🆕 加載狀態 ---
const isLoading = ref(false)
const isSubmitting = ref(false)
const isMemosLoading = ref(false)
const isPatientsLoading = ref(false)

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

// --- 🆕 錯誤狀態 ---
const error = ref(null)

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

// --- 🆕 統計計算屬性 ---
const memoStats = computed(() => ({
  total: memos.value.length,
  pending: pendingList.value.length,
  resolved: resolvedList.value.length,
  expired: expiredList.value.length,
  filtered: filterPatientId.value
    ? {
        pending: pendingList.value.length,
        resolved: resolvedList.value.length,
        expired: expiredList.value.length,
      }
    : null,
}))

// --- 方法 ---
async function fetchMemos() {
  if (isMemosLoading.value) return // 防止重複請求

  console.log('🔄 [MemoView] 開始載入備忘錄...')
  isMemosLoading.value = true
  error.value = null

  try {
    const startTime = performance.now()
    memos.value = await memosApi.fetchAll()
    const endTime = performance.now()

    console.log(
      `✅ [MemoView] 備忘錄載入完成: ${memos.value.length} 筆 (${Math.round(endTime - startTime)}ms)`,
    )
    // ❌ 移除載入通知
  } catch (err) {
    console.error('❌ [MemoView] 讀取備忘錄失敗:', err)
    error.value = '載入備忘錄失敗，請重試'
    handleError('讀取備忘錄失敗', err)
  } finally {
    isMemosLoading.value = false
  }
}

async function fetchAllPatients() {
  if (isPatientsLoading.value) return // 防止重複請求

  console.log('🔄 [MemoView] 開始載入患者列表...')
  isPatientsLoading.value = true

  try {
    const startTime = performance.now()
    allPatients.value = await patientsApi.fetchAll()
    const endTime = performance.now()

    console.log(
      `✅ [MemoView] 患者列表載入完成: ${allPatients.value.length} 筆 (${Math.round(endTime - startTime)}ms)`,
    )
    // ❌ 移除載入通知
  } catch (err) {
    console.error('❌ [MemoView] 獲取病人列表失敗:', err)
    handleError('獲取病人列表失敗', err)
  } finally {
    isPatientsLoading.value = false
  }
}

// --- 🆕 初始化函數 ---
async function initializeData() {
  console.log('🚀 [MemoView] 開始初始化資料...')
  isLoading.value = true

  try {
    // 並行載入兩個 API
    await Promise.all([fetchMemos(), fetchAllPatients()])

    // ❌ 移除載入通知，處理 URL 參數
    const patientIdFromQuery = route.query.patientId
    if (patientIdFromQuery && allPatients.value.length > 0) {
      const patient = allPatients.value.find((p) => p.id === patientIdFromQuery)
      if (patient) {
        selectedPatient.value = patient
        filterPatientId.value = patientIdFromQuery
        console.log(`🎯 [MemoView] 已選擇患者: ${patient.name}`)
      }
    }

    console.log('✅ [MemoView] 初始化完成')
  } catch (err) {
    console.error('❌ [MemoView] 初始化失敗:', err)
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

  if (isSubmitting.value) return // 防止重複提交

  console.log('🔄 [MemoView] 開始新增備忘...')
  isSubmitting.value = true

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
    // 🆕 樂觀更新：先更新 UI
    const tempId = `temp_${Date.now()}`
    const optimisticMemo = { ...newMemo, id: tempId }
    memos.value.unshift(optimisticMemo)

    // 清空表單
    contentInput.value = ''
    dateInput.value = ''
    const wasFiltered = !!selectedPatient.value
    clearPatientSelection()

    // 實際保存到後端
    const savedMemo = await memosApi.save(newMemo)

    // 替換樂觀更新的項目
    const tempIndex = memos.value.findIndex((m) => m.id === tempId)
    if (tempIndex !== -1) {
      memos.value[tempIndex] = savedMemo
    }

    addNotification('新增交班備忘', 'memo')
    console.log('✅ [MemoView] 備忘新增成功')

    // 🆕 如果之前有篩選，提示用戶
    if (wasFiltered) {
      // ❌ 移除這個提示通知，因為它不在核心業務操作中
      // addNotification('已清除病人篩選，可在右側查看新增的備忘', 'info')
    }
  } catch (err) {
    console.error('❌ [MemoView] 新增備忘失敗:', err)

    // 回滾樂觀更新
    const tempIndex = memos.value.findIndex((m) => m.id === tempId)
    if (tempIndex !== -1) {
      memos.value.splice(tempIndex, 1)
    }

    // 恢復表單內容
    contentInput.value = newMemo.content
    dateInput.value = newMemo.targetDate || ''
    if (newMemo.patientId) {
      const patient = allPatients.value.find((p) => p.id === newMemo.patientId)
      if (patient) {
        selectedPatient.value = patient
        filterPatientId.value = patient.id
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
  filterPatientId.value = patient ? patient.id : null
  isPatientDialogVisible.value = false

  if (patient) {
    router.replace({ query: { patientId: patient.id } })
    console.log(`🎯 [MemoView] 已篩選患者: ${patient.name}`)
  } else {
    router.replace({ query: {} })
    console.log('🔄 [MemoView] 已清除患者篩選')
  }
}

function clearPatientSelection() {
  selectedPatient.value = null
  filterPatientId.value = null
  router.replace({ query: {} })
  console.log('🔄 [MemoView] 已清除病人選擇')
}

// --- 🆕 優化的狀態更新函數 ---
async function updateMemoStatus(id, resolve, isFromExpired = false) {
  console.log(`🔄 [MemoView] 更新備忘狀態: ${id} -> ${resolve ? 'resolved' : 'pending'}`)

  // 🆕 樂觀更新：先更新 UI
  const memoIndex = memos.value.findIndex((m) => m.id === id)
  if (memoIndex === -1) {
    console.warn('⚠️ [MemoView] 找不到要更新的備忘錄:', id)
    return
  }

  const originalMemo = { ...memos.value[memoIndex] }
  const newStatus = resolve ? 'resolved' : 'pending'

  // 先更新 UI
  memos.value[memoIndex] = {
    ...originalMemo,
    status: newStatus,
    isResolved: resolve,
  }

  let message = ''
  if (resolve) {
    message = '備忘已處理'
  } else {
    message = isFromExpired ? '備忘已從過期中移回待辦' : '備忘移回待辦'
  }

  try {
    // 實際更新後端
    await memosApi.update(id, { status: newStatus, isResolved: resolve })
    addNotification(message, 'memo')
    console.log(`✅ [MemoView] 備忘狀態更新成功: ${id}`)
  } catch (err) {
    console.error('❌ [MemoView] 更新狀態失敗:', err)

    // 🆕 回滾樂觀更新
    memos.value[memoIndex] = originalMemo
    handleError('更新狀態失敗', err)
  }
}

// --- 🆕 優化的刪除函數 ---
async function deleteMemo(id) {
  const memo = memos.value.find((m) => m.id === id)
  if (!memo) return

  confirmDialogTitle.value = '確認刪除'
  confirmDialogMessage.value = `確定要永久刪除備忘「${memo.content.substring(0, 20)}${memo.content.length > 20 ? '...' : ''}」嗎？此操作無法復原。`

  confirmAction.value = async () => {
    console.log(`🔄 [MemoView] 刪除備忘: ${id}`)

    // 🆕 樂觀更新：先從 UI 移除
    const memoIndex = memos.value.findIndex((m) => m.id === id)
    if (memoIndex === -1) return

    const removedMemo = memos.value.splice(memoIndex, 1)[0]

    try {
      // 實際刪除
      await memosApi.delete(id)
      addNotification('刪除一則備忘', 'memo')
      console.log(`✅ [MemoView] 備忘刪除成功: ${id}`)
    } catch (err) {
      console.error('❌ [MemoView] 刪除失敗:', err)

      // 🆕 回滾：重新插入到原位置
      memos.value.splice(memoIndex, 0, removedMemo)
      handleError('刪除失敗', err)
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

// --- 🆕 統一錯誤處理 ---
function handleError(title, error) {
  console.error(`❌ [MemoView] ${title}:`, error)
  showAlert('錯誤', `${title}！請稍後重試。`)
}

function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}

// --- 🆕 重試功能 ---
async function retryLoadData() {
  console.log('🔄 [MemoView] 用戶觸發重試載入')
  error.value = null
  await initializeData()
}

// ✨ 修改函式，讓它回傳包含 HTML 的字串 ✨
function getMemoDisplayContent(memo) {
  if (memo.patientName) {
    // 使用一個特殊的 class 來包裹病人姓名
    return `<span class="memo-patient-name">${memo.patientName}</span> ${memo.content}`
  }
  return memo.content
}

// --- 🆕 監聽器 ---
watch(
  () => route.query.patientId,
  (newPatientId) => {
    if (newPatientId && allPatients.value.length > 0) {
      const patient = allPatients.value.find((p) => p.id === newPatientId)
      if (patient && (!selectedPatient.value || selectedPatient.value.id !== newPatientId)) {
        selectedPatient.value = patient
        filterPatientId.value = newPatientId
        console.log(`🎯 [MemoView] URL 變更，已選擇患者: ${patient.name}`)
      }
    } else if (!newPatientId && selectedPatient.value) {
      selectedPatient.value = null
      filterPatientId.value = null
      console.log('🔄 [MemoView] URL 變更，已清除患者選擇')
    }
  },
)

onMounted(() => {
  console.log('🚀 [MemoView] 組件已掛載，開始初始化...')
  initializeData()
})
</script>

<template>
  <div class="page-container memo-view">
    <h1 class="page-title">
      交班備忘錄
      <!-- 🆕 統計資訊 -->
      <span v-if="!isLoading && memoStats.total > 0" class="title-stats">
        ({{ filterPatientId ? `${selectedPatient?.name}: ` : '' }}待辦{{ memoStats.pending }}筆)
      </span>
    </h1>

    <!-- 🆕 全局錯誤提示 -->
    <div v-if="error" class="error-banner">
      <span>{{ error }}</span>
      <button @click="retryLoadData" class="retry-btn">重試</button>
    </div>

    <!-- 🆕 全局加載狀態 -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在載入備忘錄資料...</p>
    </div>

    <div v-else class="memo-layout-grid">
      <!-- 左欄 -->
      <div class="left-column">
        <div class="memo-card form-card">
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
              <!-- 🆕 字數統計 -->
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
                  <span v-if="isPatientsLoading">載入中...</span>
                  <span v-else>選擇病人</span>
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

            <button
              @click="addMemo"
              class="add-btn"
              :disabled="isSubmitting || !contentInput.trim()"
            >
              <span v-if="isSubmitting">新增中...</span>
              <span v-else>新增備忘</span>
            </button>
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
              <span v-if="memoStats.expired > 0" class="tab-count expired-count">{{
                memoStats.expired
              }}</span>
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'resolved' }"
              @click="activeTab = 'resolved'"
            >
              已處理事項 (最近7天)
              <span v-if="memoStats.resolved > 0" class="tab-count resolved-count">{{
                memoStats.resolved
              }}</span>
            </button>
          </div>

          <div class="tab-content">
            <!-- 🆕 載入狀態 -->
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
          <span v-if="memoStats.pending > 0" class="title-count">{{ memoStats.pending }}</span>
        </h2>

        <!-- 🆕 載入狀態 -->
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
/* ✨ 基礎樣式保持不變 ✨ */
.memo-content p {
  margin: 0 0 10px 0;
  white-space: pre-wrap;
  color: #212529;
  font-size: 1.05rem;
  font-weight: 500;
}

:deep(.memo-patient-name) {
  font-weight: 700;
  color: #0056b3;
  margin-right: 0.5em;
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

/* --- 🆕 新增的樣式 --- */

/* 標題統計 */
.title-stats {
  font-size: 0.9rem;
  font-weight: 400;
  color: #6c757d;
  margin-left: 12px;
}

.title-count {
  font-size: 0.9rem;
  font-weight: 600;
  color: white; /* 🆕 白色文字 */
  background-color: #dc3545; /* 🆕 實心紅色背景 */
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 12px;
}

/* 錯誤橫幅 */
.error-banner {
  background-color: #f8d7da;
  color: #721c24;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 20px;
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
  font-size: 0.9rem;
}

.retry-btn:hover {
  background-color: #c82333;
}

/* 加載容器 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: #6c757d;
}

.card-loading {
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
  color: #6c757d;
  gap: 8px;
}

/* 加載動畫 */
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

/* 輸入區域改進 */
.textarea-wrapper {
  position: relative;
}

.char-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  font-size: 0.8rem;
  color: #6c757d;
  background-color: rgba(255, 255, 255, 0.9);
  padding: 2px 6px;
  border-radius: 4px;
}

/* Tab 計數 */
.tab-count {
  font-size: 0.8rem;
  padding: 2px 6px;
  border-radius: 10px;
  margin-left: 6px;
  min-width: 18px;
  display: inline-block;
  text-align: center;
  font-weight: 600;
}

/* 🆕 已到期數量 - 藍色資訊 */
.tab-count.expired-count {
  background-color: #007bff;
  color: white;
}

/* 🆕 已處理數量 - 綠色完成 */
.tab-count.resolved-count {
  background-color: #28a745;
  color: white;
}

/* 禁用狀態 */
button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

textarea:disabled,
input:disabled {
  background-color: #f8f9fa;
  opacity: 0.8;
}

/* 原有樣式 */
.memo-view {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.page-title {
  margin-bottom: 0;
  color: #2c3e50;
  display: flex;
  align-items: baseline;
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
  display: flex;
  align-items: center;
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
  resize: vertical;
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
  transition: border-color 0.2s;
}
.form-card .select-btn:hover:not(:disabled) {
  border-color: #007bff;
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
  transition: color 0.2s;
}
.form-card .clear-btn:hover:not(:disabled) {
  color: #dc3545;
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
.form-card .add-btn:hover:not(:disabled) {
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
  display: flex;
  align-items: center;
  transition: color 0.2s;
}
.tab-btn.active {
  color: var(--primary-color);
  font-weight: 600;
  border-bottom: 3px solid var(--primary-color);
}
.tab-btn:hover:not(.active) {
  color: #495057;
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
  transition: box-shadow 0.2s;
}
.memo-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.memo-content {
  flex-grow: 1;
  min-width: 0;
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
  font-size: 0.9rem;
  transition: background-color 0.2s;
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
.resolve-btn:hover {
  background-color: #218838;
}
.delete-btn {
  background-color: #dc3545;
  border-color: #dc3545;
}
.delete-btn:hover {
  background-color: #c82333;
}
.revert-btn {
  background-color: #007bff;
  border-color: #007bff;
}
.revert-btn:hover {
  background-color: #0056b3;
}
</style>
