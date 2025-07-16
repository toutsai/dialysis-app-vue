<!-- 檔案路徑: src/views/UserManagementView.vue (修正版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import { useNotification } from '@/composables/useNotification.js'
import UserFormModal from '@/components/UserFormModal.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// --- API and State ---
const usersApi = ApiManager('users')
const users = ref([])
const isLoading = ref(true)
const searchTerm = ref('')
const isModalVisible = ref(false)
const isEditing = ref(false)
const userToEdit = ref(null)

// 🆕 優先級 1 & 2: 新增狀態
const selectedRole = ref('all')
const sortBy = ref('name')
const sortOrder = ref('asc')
const isSubmitting = ref(false)
const isDeletingUser = ref(null)

// --- Dialog State ---
const alertInfo = ref({
  isVisible: false,
  title: '',
  message: '',
})

const confirmInfo = ref({
  isVisible: false,
  title: '',
  message: '',
  onConfirm: () => {},
  onCancel: () => {},
})

// --- 權限控制 ---
const { isAdmin } = useAuth()
const { addNotification } = useNotification()

// --- Helper Functions ---
function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  if (isNaN(date)) return '無效日期'
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

// 🆕 優先級 1: 角色篩選選項
const roleOptions = [
  { value: 'all', label: '全部角色' },
  { value: 'admin', label: '管理員' },
  { value: 'editor', label: '編輯者' },
  { value: 'contributor', label: '貢獻者' },
  { value: 'viewer', label: '查看者' },
]

// 🆕 優先級 2: 排序選項
const sortOptions = [
  { value: 'name', label: '姓名' },
  { value: 'username', label: '帳號' },
  { value: 'role', label: '角色' },
  { value: 'createdAt', label: '建立時間' },
]

// --- Computed Properties ---
// 🆕 優先級 1: 統計資訊 (只顯示總數)
const userStats = computed(() => ({
  total: users.value.length,
  filtered: filteredUsers.value.length,
}))

const filteredUsers = computed(() => {
  let result = users.value

  // 🆕 角色篩選
  if (selectedRole.value !== 'all') {
    result = result.filter((user) => user.role === selectedRole.value)
  }

  // 搜尋篩選
  if (searchTerm.value) {
    const search = searchTerm.value.toLowerCase()
    result = result.filter(
      (user) =>
        user.name?.toLowerCase().includes(search) ||
        user.username?.toLowerCase().includes(search) ||
        user.email?.toLowerCase().includes(search) ||
        user.title?.toLowerCase().includes(search),
    )
  }

  // 🆕 優先級 2: 排序邏輯
  return [...result].sort((a, b) => {
    // 管理員總是在最前面
    if (a.role === 'admin' && b.role !== 'admin') return -1
    if (b.role === 'admin' && a.role !== 'admin') return 1

    let aValue = a[sortBy.value]
    let bValue = b[sortBy.value]

    // 處理日期類型
    if (sortBy.value.includes('At') && aValue && bValue) {
      aValue = aValue.toDate ? aValue.toDate() : new Date(aValue)
      bValue = bValue.toDate ? bValue.toDate() : new Date(bValue)
    }

    // 處理字符串類型
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase()
      bValue = bValue.toLowerCase()
    }

    // 排序邏輯
    if (sortOrder.value === 'asc') {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
    } else {
      return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
    }
  })
})

// --- Dialog Helper Functions ---
function showAlert(title, message) {
  alertInfo.value = { isVisible: true, title, message }
}

function handleAlertConfirm() {
  alertInfo.value.isVisible = false
}

function showConfirm(title, message, confirmAction) {
  confirmInfo.value = {
    isVisible: true,
    title,
    message,
    onConfirm: () => {
      confirmInfo.value.isVisible = false
      confirmAction()
    },
    onCancel: () => {
      confirmInfo.value.isVisible = false
    },
  }
}

// 🆕 優先級 1: 清除搜尋篩選
function clearSearch() {
  searchTerm.value = ''
  selectedRole.value = 'all'
}

// --- Functions ---
// 🆕 優先級 2: 增強的載入動畫
async function fetchUsers() {
  console.log('🔄 [UserManagement] 開始載入用戶列表...')
  isLoading.value = true

  try {
    const startTime = performance.now()
    users.value = await usersApi.fetchAll()
    const endTime = performance.now()

    console.log(
      `✅ [UserManagement] 用戶載入完成: ${users.value.length} 位 (${Math.round(endTime - startTime)}ms)`,
    )
  } catch (error) {
    console.error('❌ [UserManagement] 載入用戶失敗:', error)
  } finally {
    isLoading.value = false
  }
}

function handleAddUser() {
  if (!isAdmin.value) return
  isEditing.value = false
  userToEdit.value = null
  isModalVisible.value = true
}

function handleEditUser(user) {
  if (!isAdmin.value) return
  isEditing.value = true
  userToEdit.value = JSON.parse(JSON.stringify(user))
  isModalVisible.value = true
}

// 🆕 優先級 2: 樂觀更新的刪除功能
async function handleDeleteUser(userId, userName) {
  if (!isAdmin.value) return
  if (!userId) {
    showAlert('錯誤', '缺少使用者 ID，無法刪除！')
    return
  }

  console.log(`🗑️ [UserManagement] 準備刪除用戶: ${userName}`)

  showConfirm('確認刪除', `您確定要刪除使用者 "${userName}" 嗎？此操作無法復原。`, async () => {
    isDeletingUser.value = userId

    // 🆕 樂觀更新：先從 UI 移除
    const userIndex = users.value.findIndex((user) => user.id === userId)
    let removedUser = null
    if (userIndex !== -1) {
      removedUser = users.value.splice(userIndex, 1)[0]
    }

    try {
      // 實際刪除
      await usersApi.delete(userId)
      console.log(`✅ [UserManagement] 用戶刪除成功: ${userName}`)
      showAlert('成功', '使用者已成功刪除。')
    } catch (error) {
      console.error(`❌ [UserManagement] 刪除用戶失敗: ${userName}`, error)

      // 🆕 回滾：重新插入用戶
      if (removedUser && userIndex !== -1) {
        users.value.splice(userIndex, 0, removedUser)
      }

      showAlert('刪除失敗', '刪除使用者時發生錯誤，請稍後再試。')
    } finally {
      isDeletingUser.value = null
    }
  })
}

// 🆕 優先級 2: 樂觀更新的儲存功能
async function handleSaveUser(userData) {
  if (!isAdmin.value) return

  console.log(`💾 [UserManagement] ${isEditing.value ? '更新' : '新增'}用戶: ${userData.name}`)
  isSubmitting.value = true

  try {
    if (isEditing.value) {
      // 🆕 樂觀更新：先更新 UI
      const { id, ...updateData } = userData
      updateData.updatedAt = new Date()

      const userIndex = users.value.findIndex((user) => user.id === id)
      let originalUser = null
      if (userIndex !== -1) {
        originalUser = { ...users.value[userIndex] }
        users.value[userIndex] = { ...users.value[userIndex], ...updateData }
      }

      try {
        // 實際更新
        await usersApi.update(id, updateData)
        console.log(`✅ [UserManagement] 用戶更新成功: ${userData.name}`)
        showAlert('成功', '使用者資料已更新。')
      } catch (error) {
        // 🆕 回滾：恢復原始數據
        if (originalUser && userIndex !== -1) {
          users.value[userIndex] = originalUser
        }
        throw error
      }
    } else {
      // 新增用戶
      const { id, ...dataToSave } = userData
      dataToSave.createdAt = new Date()
      dataToSave.updatedAt = new Date()

      // 實際新增
      const newUser = await usersApi.save(dataToSave)
      users.value.unshift(newUser)
      console.log(`✅ [UserManagement] 用戶新增成功: ${userData.name}`)
      showAlert('成功', '使用者已新增。')
    }

    isModalVisible.value = false
  } catch (error) {
    console.error(`❌ [UserManagement] 儲存用戶失敗: ${userData.name}`, error)
    showAlert('儲存失敗', '儲存使用者資料時發生錯誤。')
  } finally {
    isSubmitting.value = false
  }
}

// 複製 Email 功能
async function copyEmail(email) {
  try {
    await navigator.clipboard.writeText(email)
    showAlert('已複製', `Email 地址 "${email}" 已複製到剪貼簿`)
  } catch (err) {
    showAlert('Email 地址', `請手動複製: ${email}`)
  }
}

onMounted(() => {
  console.log('🚀 [UserManagement] 組件已掛載')
  if (isAdmin.value) {
    fetchUsers()
  } else {
    console.warn('⚠️ [UserManagement] 用戶無管理員權限')
    isLoading.value = false
  }
})
</script>

<template>
  <div class="user-management-container">
    <header class="page-header">
      <!-- 🆕 優先級 1: 標題和統計資訊 -->
      <div class="header-top">
        <h1>使用者帳號管理</h1>
        <div v-if="!isLoading && userStats.total > 0" class="user-stats">
          <!-- ✅ 修正: 改用 stats-total 類別 -->
          <span class="stats-total">總計: {{ userStats.total }}</span>
          <span v-if="userStats.filtered !== userStats.total" class="stats-filtered">
            顯示: {{ userStats.filtered }}
          </span>
        </div>
      </div>

      <!-- 🆕 優先級 1 & 2: 增強的控制區域 -->
      <div class="header-controls">
        <div class="search-filters">
          <!-- 搜尋框 -->
          <div class="search-group">
            <input
              type="text"
              v-model="searchTerm"
              placeholder="搜尋姓名/帳號/Email/職稱..."
              class="search-input"
            />
            <button
              v-if="searchTerm || selectedRole !== 'all'"
              @click="clearSearch"
              class="clear-search-btn"
              title="清除搜尋"
            >
              ×
            </button>
          </div>

          <!-- 🆕 角色篩選 -->
          <select v-model="selectedRole" class="role-filter">
            <option v-for="option in roleOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>

          <!-- 🆕 優先級 2: 排序控制 -->
          <div class="sort-group">
            <select v-model="sortBy" class="sort-select">
              <option v-for="option in sortOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button
              @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
              class="sort-order-btn"
            >
              {{ sortOrder === 'asc' ? '↑' : '↓' }}
            </button>
          </div>
        </div>

        <div class="header-actions">
          <button
            v-if="isAdmin"
            class="btn btn-primary"
            @click="handleAddUser"
            :disabled="isSubmitting"
          >
            <span v-if="isSubmitting">處理中...</span>
            <span v-else>+ 新增使用者</span>
          </button>
        </div>
      </div>
    </header>

    <!-- 🆕 優先級 2: 增強的載入動畫 -->
    <div v-if="isLoading" class="loading-container">
      <div class="loading-spinner"></div>
      <p>正在載入用戶列表...</p>
    </div>

    <div v-else-if="filteredUsers.length > 0" class="user-table-container">
      <table class="user-table">
        <thead>
          <tr>
            <th>姓名</th>
            <th>帳號</th>
            <th>職稱</th>
            <th>角色</th>
            <th>異動日期</th>
            <th v-if="isAdmin">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in filteredUsers"
            :key="user.id"
            :class="{ 'deleting-row': isDeletingUser === user.id }"
          >
            <td>
              {{ user.name }}
              <span v-if="user.role === 'admin'" class="admin-badge">管理員</span>
            </td>
            <td>{{ user.username }}</td>
            <td>{{ user.title || '-' }}</td>
            <td>
              <span class="role-badge" :class="`role-${user.role}`">{{ user.role }}</span>
            </td>
            <td>{{ formatDate(user.updatedAt || user.createdAt) }}</td>
            <td v-if="isAdmin" class="action-buttons">
              <button
                v-if="user.email"
                class="btn-icon"
                @click="copyEmail(user.email)"
                :title="`複製 Email: ${user.email}`"
                :disabled="isSubmitting || isDeletingUser === user.id"
              >
                📧
              </button>
              <button
                class="btn-icon"
                @click="handleEditUser(user)"
                title="編輯"
                :disabled="isSubmitting || isDeletingUser === user.id"
              >
                ✏️
              </button>
              <button
                class="btn-icon"
                @click="handleDeleteUser(user.id, user.name)"
                title="刪除"
                :disabled="isSubmitting || isDeletingUser === user.id"
              >
                <!-- 🆕 優先級 2: 刪除狀態指示器 -->
                <span v-if="isDeletingUser === user.id" class="deleting-spinner">⏳</span>
                <span v-else>🗑️</span>
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 🆕 優先級 1: 增強的空狀態 -->
    <div v-else class="empty-state">
      <div class="empty-icon">👥</div>
      <h3>{{ searchTerm || selectedRole !== 'all' ? '沒有符合條件的使用者' : '尚無使用者' }}</h3>
      <p v-if="searchTerm || selectedRole !== 'all'">嘗試調整搜尋條件或篩選器</p>
      <button v-else-if="isAdmin" @click="handleAddUser" class="btn btn-primary">
        新增第一個使用者
      </button>
    </div>

    <!-- 🆕 優先級 2: 增強的 Modal -->
    <UserFormModal
      :is-visible="isModalVisible"
      :is-editing="isEditing"
      :user="userToEdit"
      :is-submitting="isSubmitting"
      @close="isModalVisible = false"
      @save="handleSaveUser"
    />

    <AlertDialog
      :is-visible="alertInfo.isVisible"
      :title="alertInfo.title"
      :message="alertInfo.message"
      @confirm="handleAlertConfirm"
    />

    <ConfirmDialog
      :is-visible="confirmInfo.isVisible"
      :title="confirmInfo.title"
      :message="confirmInfo.message"
      @confirm="confirmInfo.onConfirm"
      @cancel="confirmInfo.onCancel"
    />
  </div>
</template>

<style scoped>
.user-management-container {
  padding: 1.5rem;
  min-height: 100vh;
}

/* 🆕 優先級 1: 頁面標題區域 */
.page-header {
  border-radius: 12px;
  margin-bottom: 2rem;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.page-header h1 {
  font-size: 2rem;
  color: #333;
  margin: 0;
  font-weight: 600;
}

/* 🆕 優先級 1: 統計資訊 - 特別放大總計人數 */
.user-stats {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

/* ✅ 漂亮的藍色漸變效果！ */
.stats-total {
  padding: 0.5rem 1rem;
  background: linear-gradient(135deg, #007bff, #0056b3);
  color: white;
  border-radius: 25px;
  font-size: 1.2rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 123, 255, 0.3);
  letter-spacing: 0.5px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.stats-total:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 123, 255, 0.4);
}

.stats-filtered {
  padding: 0.25rem 0.75rem;
  background-color: #cce5ff;
  color: #0056b3;
  border-radius: 20px;
  font-size: 0.9rem;
  font-weight: 500;
}

/* 🆕 優先級 1 & 2: 控制區域 */
.header-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.search-filters {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.search-group {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  padding: 0.75rem 1rem;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 1rem;
  width: 280px;
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: #007bff;
}

.clear-search-btn {
  position: absolute;
  right: 10px;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 🆕 優先級 1: 角色篩選 */
.role-filter,
.sort-select {
  padding: 0.75rem 1rem;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 1rem;
  background-color: white;
  cursor: pointer;
  transition: border-color 0.2s;
}

.role-filter:focus,
.sort-select:focus {
  outline: none;
  border-color: #007bff;
}

/* 🆕 優先級 2: 排序控制 */
.sort-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sort-order-btn {
  padding: 0.75rem;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  background-color: white;
  cursor: pointer;
  font-size: 1.2rem;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.sort-order-btn:hover {
  border-color: #007bff;
  background-color: #f8f9fa;
}

.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

/* 🆕 優先級 2: 載入動畫 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  background-color: white;
  border-radius: 12px;
  color: #6c757d;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* 表格區域 */
.user-table-container {
  background-color: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.user-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.user-table th,
.user-table td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e9ecef;
  font-size: 0.95rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  color: #495057;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 0.85rem;
}

.user-table tbody tr {
  transition: all 0.2s;
}

.user-table tbody tr:hover {
  background-color: #f8f9fa;
}

.user-table tbody tr:last-child td {
  border-bottom: none;
}

/* 🆕 優先級 2: 刪除中的行樣式 */
.deleting-row {
  opacity: 0.6;
  background-color: #fff3cd !important;
}

.deleting-spinner {
  animation: spin 1s linear infinite;
}

/* 🆕 優先級 1: 增強的空狀態 */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  background-color: white;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state h3 {
  color: #495057;
  margin: 1rem 0;
  font-size: 1.5rem;
}

.empty-state p {
  color: #6c757d;
  margin-bottom: 2rem;
}

/* 按鈕樣式 */
.btn {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.95rem;
  transition: all 0.2s ease-in-out;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.btn-primary {
  background: linear-gradient(135deg, #28a745, #20c997);
  color: white;
  border: none;
  box-shadow: 0 2px 8px rgba(40, 167, 69, 0.3);
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #218838, #1e7e34);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(40, 167, 69, 0.4);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

/* 操作按鈕 */
.action-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  font-size: 1.2rem;
  line-height: 1;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-icon:hover:not(:disabled) {
  background-color: #f0f0f0;
  transform: scale(1.1);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

/* 角色標籤 */
.role-badge {
  padding: 0.3em 0.8em;
  border-radius: 16px;
  font-size: 0.85em;
  font-weight: 600;
  text-transform: uppercase;
  color: white;
  letter-spacing: 0.5px;
}

.role-admin {
  background-color: #dc3545;
}

.role-editor {
  background-color: #007bff;
}

.role-contributor {
  background-color: #28a745;
}

.role-viewer {
  background-color: #6c757d;
}

.admin-badge {
  background-color: #dc3545;
  color: white;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 10px;
  margin-left: 0.5rem;
  font-weight: 500;
}

/* 🆕 優先級 3: 響應式設計 */
@media (max-width: 1200px) {
  .header-controls {
    flex-direction: column;
    align-items: stretch;
  }

  .search-filters {
    justify-content: center;
  }
}

@media (max-width: 768px) {
  .user-management-container {
    padding: 1rem;
  }

  .page-header {
    padding: 1.5rem;
  }

  .header-top {
    flex-direction: column;
    align-items: flex-start;
  }

  .search-filters {
    flex-direction: column;
    width: 100%;
  }

  .search-input {
    width: 100%;
  }

  .user-table th,
  .user-table td {
    padding: 0.75rem 0.5rem;
    font-size: 0.85rem;
  }

  /* 🆕 手機端隱藏不重要的欄位 */
  .user-table th:nth-child(3),
  .user-table td:nth-child(3) {
    display: none;
  }
}
</style>
