<!-- src/views/MemoView.vue (Memo路由整合最終版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import { useRoute, useRouter } from 'vue-router' // <-- 【新增】引入 useRoute 和 useRouter

// --- API 實例 ---
const memosApi = ApiManager('memos')
const patientsApi = ApiManager('patients')

// --- 核心狀態 ---
const memos = ref([])
const allPatients = ref([])
const contentInput = ref('')
const dateInput = ref('')

// --- UI 狀態 ---
const isPatientDialogVisible = ref(false)
const selectedPatient = ref(null)
const filterPatientId = ref(null) // <-- 【新增】用於篩選列表的專用狀態

// 【新增】路由實例
const route = useRoute()
const router = useRouter()

// --- 計算屬性 ---

// 【修改】讓 pendingList 根據 filterPatientId 篩選
const pendingList = computed(() =>
  memos.value
    .filter((memo) => {
      const isPending = !memo.isResolved
      if (filterPatientId.value) {
        return isPending && memo.patientId === filterPatientId.value
      }
      return isPending
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
)

// 【修改】讓 resolvedList 根據 filterPatientId 篩選
const resolvedList = computed(() => {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return memos.value
    .filter((memo) => {
      const isRecentResolved = memo.isResolved && new Date(memo.createdAt) > sevenDaysAgo
      if (filterPatientId.value) {
        return isRecentResolved && memo.patientId === filterPatientId.value
      }
      return isRecentResolved
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

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
    alert('備忘內容不能為空！')
    return
  }
  const newMemo = {
    content: contentInput.value.trim(),
    patientId: selectedPatient.value ? selectedPatient.value.id : null,
    patientName: selectedPatient.value ? selectedPatient.value.name : null,
    targetDate: dateInput.value || null,
    isResolved: false,
    createdAt: new Date().toISOString(),
  }
  try {
    await memosApi.save(newMemo)
    contentInput.value = ''
    dateInput.value = ''

    // 如果當前處於篩選狀態，新增備忘後不要清除篩選
    if (!filterPatientId.value) {
      clearPatientSelection()
    }

    await fetchMemos()
  } catch (error) {
    console.error('新增備忘失敗:', error)
    alert('新增備忘失敗！')
  }
}

function handlePatientSelected({ patientId }) {
  const patient = allPatients.value.find((p) => p.id === patientId) || null
  selectedPatient.value = patient

  // 【新增】當使用者手動選擇時，也更新篩選狀態
  filterPatientId.value = patient ? patient.id : null

  isPatientDialogVisible.value = false

  // 【新增】手動選擇後，更新 URL，但不留下歷史紀錄
  if (patient) {
    router.replace({ query: { patientId: patient.id } })
  } else {
    router.replace({ query: {} })
  }
}

// 【修改】清除病人選擇時，也要清除篩選狀態和 URL query
function clearPatientSelection() {
  selectedPatient.value = null
  filterPatientId.value = null
  router.replace({ query: {} }) // 清除 URL 中的 query
}

async function updateMemoStatus(id, isResolved) {
  try {
    await memosApi.update(id, { isResolved })
    await fetchMemos()
  } catch (error) {
    console.error('更新狀態失敗:', error)
    alert('更新狀態失敗！')
  }
}

async function deleteMemo(id) {
  if (!confirm('確定要永久刪除這條備忘嗎？此操作無法復原。')) return
  try {
    await memosApi.delete(id)
    await fetchMemos()
  } catch (error) {
    console.error('刪除失敗:', error)
    alert('刪除失敗！')
  }
}

function openPatientDialog() {
  isPatientDialogVisible.value = true
}

// 【修改】onMounted 邏輯，以處理路由參數
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
      <!-- ================================== -->
      <!-- == Grid 區塊一 (左上): 新增備忘 == -->
      <!-- ================================== -->
      <div id="form-section" class="memo-form-container">
        <div class="memo-form">
          <!-- 【修改】動態標題，告知使用者正在篩選 -->
          <h2 v-if="filterPatientId">{{ selectedPatient?.name }} 的備忘</h2>
          <h2 v-else>新增備忘</h2>
          <textarea v-model="contentInput" placeholder="請輸入交班事項或備註..."></textarea>

          <div class="form-actions">
            <div class="options-wrapper">
              <div class="option-item">
                <label>關聯病人(可選):</label>
                <!-- 【修改】這裡的 v-if 改用 filterPatientId 判斷，避免 UI 在篩選時閃爍 -->
                <div v-if="filterPatientId && selectedPatient" class="selected-patient-display">
                  <span>{{ selectedPatient.name }}</span>
                  <button @click="clearPatientSelection" class="clear-btn" title="清除篩選">
                    ×
                  </button>
                </div>
                <!-- 沒在篩選時，顯示選擇按鈕 -->
                <button v-else-if="!filterPatientId" @click="openPatientDialog" class="select-btn">
                  選擇病人
                </button>
              </div>
              <div class="option-item">
                <label for="memo-date-input">目標日期(可選):</label>
                <input v-model="dateInput" type="date" id="memo-date-input" />
              </div>
            </div>
            <button @click="addMemo" class="add-btn">新增備忘</button>
          </div>
        </div>
      </div>

      <!-- ================================== -->
      <!-- ==   Grid 區塊二 (右側): 待處理   == -->
      <!-- ================================== -->
      <div id="pending-section" class="memo-section">
        <!-- 【修改】動態標題 -->
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
                  >| 目標日期: <strong>{{ memo.targetDate }}</strong></span
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
          <!-- 【修改】動態空狀態提示 -->
          <li v-if="pendingList.length === 0" class="empty-state">
            {{ filterPatientId ? '該病人無待辦事項' : '太棒了，沒有待辦事項！' }}
          </li>
        </ul>
      </div>

      <!-- ================================== -->
      <!-- == Grid 區塊三 (左下): 已處理   == -->
      <!-- ================================== -->
      <div id="resolved-section" class="memo-section">
        <!-- 【修改】動態標題 -->
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
          <!-- 【修改】動態空狀態提示 -->
          <li v-if="resolvedList.length === 0" class="empty-state">
            {{ filterPatientId ? '最近7天該病人無已處理事項' : '最近7天沒有已處理事項。' }}
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Dialog 元件放在根元素之外 -->
  <PatientSelectDialog
    :is-visible="isPatientDialogVisible"
    title="選擇關聯病人"
    :patients="allPatients"
    :show-fill-options="false"
    @confirm="handlePatientSelected"
    @cancel="isPatientDialogVisible = false"
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
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'form pending'
    'resolved pending';
  gap: 24px;
  height: calc(100vh - 150px);
}

#form-section {
  grid-area: form;
}
#pending-section {
  grid-area: pending;
}
#resolved-section {
  grid-area: resolved;
}

#form-section,
#pending-section,
#resolved-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 10px;
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
.memo-options {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  align-items: center;
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
