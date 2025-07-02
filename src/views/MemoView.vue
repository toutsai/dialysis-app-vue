<!-- src/views/MemoView.vue 的 <template> 部分修改後 -->
<script setup>
import { ref, onMounted, computed } from 'vue' // <-- 引入 computed
import ApiManager from '@/services/api_manager.js'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue' // <-- 導入元件

// --- API 實例 ---
const memosApi = ApiManager('memos')
const patientsApi = ApiManager('patients') // <-- 新增 patients API

// --- 核心狀態 ---
const memos = ref([]) // 用來儲存所有備忘錄
const allPatients = ref([]) // <-- 新增 allPatients 狀態
const contentInput = ref('')
const dateInput = ref('')

// --- UI 狀態 ---
const isPatientDialogVisible = ref(false)
const selectedPatient = ref(null) // <-- 用來儲存選中的整個病人物件
const pendingList = computed(() =>
  memos.value
    .filter((memo) => !memo.isResolved)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
)
const resolvedList = computed(() => {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  return memos.value
    .filter((memo) => memo.isResolved && new Date(memo.createdAt) > sevenDaysAgo)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
})

async function fetchMemos() {
  try {
    memos.value = await memosApi.fetchAll()
    // **不再需要手動呼叫 renderMemos()**
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
    // **同時儲存 id 和 name**
    patientId: selectedPatient.value ? selectedPatient.value.id : null,
    patientName: selectedPatient.value ? selectedPatient.value.name : null,
    targetDate: dateInput.value || null,
    isResolved: false,
    createdAt: new Date().toISOString(),
  }
  try {
    await memosApi.save(newMemo)
    // 清空輸入框和選擇
    contentInput.value = ''
    dateInput.value = ''
    clearPatientSelection()

    await fetchMemos()
  } catch (error) {
    console.error('新增備忘失敗:', error)
    alert('新增備忘失敗！')
  }
}

// 新增處理病人選擇的函式
function handlePatientSelected(patientId) {
  selectedPatient.value = allPatients.value.find((p) => p.id === patientId) || null
  isPatientDialogVisible.value = false
}

// 新增清除病人選擇的函式
function clearPatientSelection() {
  selectedPatient.value = null
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
  console.log('「選擇病人」按鈕被點擊了！準備將 isPatientDialogVisible 設為 true。')
  console.log('當前的 allPatients 列表:', allPatients.value) // <-- 新增這一行
  isPatientDialogVisible.value = true
}

// onMounted() 會在元件被掛載到畫面上之後自動執行。
onMounted(() => {
  // 頁面載入時，同時獲取備忘錄和病人列表
  Promise.all([fetchMemos(), fetchAllPatients()])
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
          <h2>新增備忘</h2>
          <textarea v-model="contentInput" placeholder="請輸入交班事項或備註..."></textarea>

          <div class="form-actions">
            <!-- 新增的 wrapper，用於水平排列選項 -->
            <div class="options-wrapper">
              <div class="option-item">
                <label>關聯病人(可選):</label>
                <div v-if="selectedPatient" class="selected-patient-display">
                  <span>{{ selectedPatient.name }}</span>
                  <button @click="clearPatientSelection" class="clear-btn">×</button>
                </div>
                <button v-else @click="isPatientDialogVisible = true" class="select-btn">
                  選擇病人
                </button>
              </div>
              <div class="option-item">
                <label for="memo-date-input">目標日期(可選):</label>
                <input v-model="dateInput" type="date" id="memo-date-input" />
              </div>
            </div>
            <!-- 新增按鈕現在是 form-actions 的第二個子項目 -->
            <button @click="addMemo" class="add-btn">新增備忘</button>
          </div>
        </div>
      </div>

      <!-- ================================== -->
      <!-- ==   Grid 區塊二 (右側): 待處理   == -->
      <!-- ================================== -->
      <div id="pending-section" class="memo-section">
        <h2>待處理事項</h2>
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
          <li v-if="pendingList.length === 0" class="empty-state">太棒了，沒有待辦事項！</li>
        </ul>
      </div>

      <!-- ================================== -->
      <!-- == Grid 區塊三 (左下): 已處理   == -->
      <!-- ================================== -->
      <div id="resolved-section" class="memo-section">
        <h2>已處理事項 (最近7天)</h2>
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
          <li v-if="resolvedList.length === 0" class="empty-state">最近7天沒有已處理事項。</li>
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
  grid-template-columns: 1fr 1fr; /* 創建兩欄等寬 */
  grid-template-rows: auto 1fr; /* 第一行高度自動，第二行填滿剩餘空間 */
  grid-template-areas:
    'form pending'
    'resolved pending'; /* <-- 像這樣定義佈局 */
  gap: 24px;
  height: calc(100vh - 150px);
}

/* 將各區塊放到對應的 grid area */
#form-section {
  grid-area: form;
}
#pending-section {
  grid-area: pending;
}
#resolved-section {
  grid-area: resolved;
}

/* 讓每個區塊都能正確處理內部滾動 */
#form-section,
#pending-section,
#resolved-section {
  background-color: #fff;
  border-radius: 8px;
  padding: 10px;
  border: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* 防止子元素溢出 */
}

.memo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto; /* 關鍵：讓列表可以內部滾動 */
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

.memo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto; /* 讓列表內容過多時可以滾動 */
  flex-grow: 1;
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
  white-space: pre-wrap; /* 保留換行 */
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
  flex-direction: column; /* 讓所有子項目垂直排列 */
  gap: 15px; /* 項目之間的間距 */
}
/* 新增：用於水平排列選項的容器 */
.options-wrapper {
  display: flex;
  gap: 20px; /* 選項之間的水平間距 */
  align-items: center;
  flex-wrap: wrap; /* 在小螢幕上可以換行 */
}
/* 讓每個選項項目自動分配空間 */
.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-grow: 1; /* 讓兩個 option-item 均分寬度 */
  flex-basis: 0; /* 確保 flex-grow 生效 */
}

.option-item label {
  flex-shrink: 0;
  /* 這裡可以不用固定寬度，讓它自適應 */
}

/* 讓輸入控制項填滿其 .option-item 的剩餘空間 */
.option-item input[type='text'],
.option-item input[type='date'],
.option-item .selected-patient-display,
.option-item .select-btn {
  flex-grow: 1;
  width: 100%; /* 確保在某些情況下能正確計算寬度 */
  height: 45px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  box-sizing: border-box;
}
/* 按鈕樣式保持不變 */
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
