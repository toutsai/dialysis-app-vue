<!-- src/views/MemoView.vue 的 <template> 部分修改後 -->
<template>
  <div class="page-container">
    <h1 class="page-title">交班備忘錄</h1>
    <div class="memo-form">
      <h2>新增備忘</h2>
      <!-- 1. 使用 v-model 綁定輸入 -->
      <textarea v-model="contentInput" placeholder="請輸入交班事項或備註..."></textarea>
      <div class="memo-options">
        <label for="memo-patient-input">關聯病人(可選):</label>
        <input
          v-model="patientInput"
          type="text"
          id="memo-patient-input"
          placeholder="輸入病人姓名"
        />
        <label for="memo-date-input">目標日期(可選):</label>
        <input v-model="dateInput" type="date" id="memo-date-input" />
      </div>
      <!-- 2. 使用 @click 綁定事件 -->
      <button @click="addMemo">新增備忘</button>
    </div>

    <div class="memo-section">
      <h2>待處理事項</h2>
      <!-- 3. 使用 v-for 渲染列表 -->
      <ul class="memo-list">
        <li v-for="memo in pendingList" :key="memo.id" class="memo-item">
          <div class="memo-content">
            <p>{{ memo.content }}</p>
            <div class="memo-meta">
              <span class="date">建立於: {{ new Date(memo.createdAt).toLocaleString() }}</span>
              <span v-if="memo.patientName">
                | 關聯病人: <strong>{{ memo.patientName }}</strong></span
              >
              <span v-if="memo.targetDate">
                | 目標日期: <strong>{{ memo.targetDate }}</strong></span
              >
            </div>
          </div>
          <div class="memo-actions">
            <button class="resolve-btn" @click="updateMemoStatus(memo.id, true)">標為已處理</button>
            <button class="delete-btn" @click="deleteMemo(memo.id)">永久刪除</button>
          </div>
        </li>
      </ul>
    </div>

    <div class="memo-section">
      <h2>已處理事項 (最近7天)</h2>
      <ul class="memo-list">
        <li v-for="memo in resolvedList" :key="memo.id" class="memo-item resolved">
          <div class="memo-content">
            <p>{{ memo.content }}</p>
            <div class="memo-meta">
              <span class="date">建立於: {{ new Date(memo.createdAt).toLocaleString() }}</span>
              <span v-if="memo.patientName">
                | 關聯病人: <strong>{{ memo.patientName }}</strong></span
              >
              <span v-if="memo.targetDate">
                | 目標日期: <strong>{{ memo.targetDate }}</strong></span
              >
            </div>
          </div>
          <div class="memo-actions">
            <button class="delete-btn" @click="deleteMemo(memo.id)">永久刪除</button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import ApiManager from '@/services/api_manager.js'

// 1. 建立 API 實例
const memosApi = ApiManager('memos')

// 2. 定義響應式狀態 (Reactivity)
// ref() 用來建立一個「響應式」的變數。當它的值改變時，Vue 會自動更新畫面。
const memos = ref([]) // 用來儲存所有備忘錄
const pendingList = ref([]) // 待處理列表
const resolvedList = ref([]) // 已處理列表

// 用於綁定表單輸入框
const contentInput = ref('')
const patientInput = ref('')
const dateInput = ref('')

// 3. 定義方法 (Methods)
async function fetchMemos() {
  try {
    memos.value = await memosApi.fetchAll()
    renderMemos()
  } catch (error) {
    console.error('讀取備忘錄失敗:', error)
    alert('讀取備忘錄失敗！')
  }
}

function renderMemos() {
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  // 對 memos.value 進行排序
  memos.value.sort((a, b) => {
    const dateA = a.createdAt ? new Date(a.createdAt) : 0
    const dateB = b.createdAt ? new Date(b.createdAt) : 0
    return dateB - dateA
  })

  // 過濾出待處理和已處理的列表
  pendingList.value = memos.value.filter((memo) => !memo.isResolved)
  resolvedList.value = memos.value.filter((memo) => {
    if (!memo.isResolved) return false
    const createdAtDate = memo.createdAt ? new Date(memo.createdAt) : new Date(0)
    return createdAtDate > sevenDaysAgo
  })
}

async function addMemo() {
  if (!contentInput.value.trim()) {
    alert('備忘內容不能為空！')
    return
  }
  const newMemo = {
    content: contentInput.value.trim(),
    patientName: patientInput.value.trim() || null,
    targetDate: dateInput.value || null,
    isResolved: false,
    createdAt: new Date().toISOString(),
  }
  try {
    await memosApi.save(newMemo)
    // 清空輸入框
    contentInput.value = ''
    patientInput.value = ''
    dateInput.value = ''
    // 重新獲取資料以更新畫面
    await fetchMemos()
  } catch (error) {
    console.error('新增備忘失敗:', error)
    alert('新增備忘失敗！')
  }
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

// 4. 使用生命週期鉤子 (Lifecycle Hook)
// onMounted() 會在元件被掛載到畫面上之後自動執行。
onMounted(() => {
  fetchMemos()
})
</script>

<style>
body {
  font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif;
  background-color: #f9f9f9;
  margin: 0;
}

h1 {
  text-align: left;
  color: #333;
}
.memo-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 2px solid #eee;
}
.memo-form textarea {
  padding: 10px;
  font-size: 1.1em;
  border-radius: 5px;
  border: 1px solid #ccc;
  resize: vertical;
  min-height: 80px;
}
.memo-options {
  display: flex;
  gap: 20px;
  align-items: center;
}
.memo-options label {
  font-weight: bold;
}
.memo-options input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
}
.memo-form button {
  align-self: flex-end;
  padding: 10px 20px;
  font-size: 1em;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
.memo-form button:hover {
  background-color: #0056b3;
}
.memo-section {
  margin-top: 20px;
}
.memo-section h2 {
  border-bottom: 1px solid #ddd;
  padding-bottom: 10px;
}
.memo-list {
  list-style: none;
  padding: 0;
}
.memo-item {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 5px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 15px;
}
.memo-item.resolved {
  background-color: #f5f5f5;
  text-decoration: line-through;
  color: #888;
}
.memo-content {
  flex-grow: 1;
}
.memo-content p {
  margin: 0 0 10px 0;
  white-space: pre-wrap;
}
.memo-meta {
  font-size: 0.85em;
  color: #666;
}
.memo-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.memo-actions button {
  padding: 5px 10px;
  font-size: 0.9em;
  border: 1px solid #ccc;
  border-radius: 4px;
  cursor: pointer;
}
.resolve-btn {
  background-color: #28a745;
  color: white;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
}
</style>
