<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import UserFormModal from '@/components/UserFormModal.vue'
// 【步驟 1】導入您的新元件
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

// --- Dialog State ---
// 狀態管理 AlertDialog
const alertInfo = ref({
  isVisible: false,
  title: '',
  message: '',
})

// 狀態管理 ConfirmDialog
const confirmInfo = ref({
  isVisible: false,
  title: '',
  message: '',
  onConfirm: () => {}, // 儲存確認後要執行的動作
  onCancel: () => {}, // 儲存取消後要執行的動作
})

// --- 權限控制 ---
const { isAdmin } = useAuth()

// --- Helper Function for Date Formatting ---
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

// --- Computed Properties ---
const filteredUsers = computed(() => {
  let result = []

  if (!searchTerm.value) {
    result = users.value
  } else {
    result = users.value.filter(
      (user) =>
        user.name.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        user.username.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
        (user.email && user.email.toLowerCase().includes(searchTerm.value.toLowerCase())),
    )
  }

  return [...result].sort((a, b) => {
    if (a.role === 'admin') return -1
    if (b.role === 'admin') return 1
    if (a.createdAt && b.createdAt) {
      const dateA = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)
      const dateB = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)
      return dateB - dateA
    }
    return a.name.localeCompare(b.name, 'zh-Hant')
  })
})

// --- 【步驟 2】建立觸發對話框的輔助函式 ---
// 顯示通知對話框
function showAlert(title, message) {
  alertInfo.value = { isVisible: true, title, message }
}

// 關閉通知對話框
function handleAlertConfirm() {
  alertInfo.value.isVisible = false
}

// 顯示確認對話框
function showConfirm(title, message, confirmAction) {
  confirmInfo.value = {
    isVisible: true,
    title,
    message,
    onConfirm: () => {
      confirmInfo.value.isVisible = false
      confirmAction() // 執行真正要做的動作
    },
    onCancel: () => {
      confirmInfo.value.isVisible = false
    },
  }
}

// --- Functions ---
async function fetchUsers() {
  isLoading.value = true
  try {
    users.value = await usersApi.fetchAll()
  } catch (error) {
    console.error('Failed to fetch users:', error)
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

// 【步驟 3】將 handleDeleteUser 中的 confirm 和 alert 替換掉
async function handleDeleteUser(userId, userName) {
  if (!isAdmin.value) return
  if (!userId) {
    showAlert('錯誤', '缺少使用者 ID，無法刪除！')
    return
  }

  // 使用新的 showConfirm 函式
  showConfirm('確認刪除', `您確定要刪除使用者 "${userName}" 嗎？\n此操作無法復原。`, async () => {
    // 這是使用者點擊「確認」後才會執行的程式碼
    try {
      await usersApi.delete(userId)
      users.value = users.value.filter((user) => user.id !== userId)
      showAlert('成功', '使用者已成功刪除。')
    } catch (error) {
      console.error(`Failed to delete user with ID: ${userId}`, error)
      showAlert('刪除失敗', '刪除使用者時發生錯誤，請稍後再試。')
    }
  })
}

// 【步驟 4】將 handleSaveUser 中的 alert 替換掉
async function handleSaveUser(userData) {
  if (!isAdmin.value) return
  try {
    if (isEditing.value) {
      const { id, ...updateData } = userData
      updateData.updatedAt = new Date()
      await usersApi.update(id, updateData)
      const index = users.value.findIndex((user) => user.id === id)
      if (index !== -1) {
        users.value[index] = { ...users.value[index], ...updateData }
      }
      showAlert('成功', '使用者資料已更新。')
    } else {
      const { id, ...dataToSave } = userData
      dataToSave.createdAt = new Date()
      dataToSave.updatedAt = new Date()
      const newUser = await usersApi.save(dataToSave)
      users.value.unshift(newUser)
      showAlert('成功', '使用者已新增。')
    }
    isModalVisible.value = false
  } catch (error) {
    console.error('Failed to save user:', error)
    showAlert('儲存失敗', '儲存使用者資料時發生錯誤。')
  }
}

onMounted(() => {
  if (isAdmin.value) {
    fetchUsers()
  }
})
</script>

<template>
  <div class="user-management-container">
    <header class="page-header">
      <h1>使用者帳號管理</h1>
      <div class="header-actions">
        <input
          type="text"
          v-model="searchTerm"
          placeholder="搜尋姓名/帳號/Email..."
          class="search-input"
        />
        <button v-if="isAdmin" class="btn btn-primary" @click="handleAddUser">新增使用者</button>
      </div>
    </header>

    <div v-if="isLoading" class="loading-state">載入中...</div>

    <table v-else-if="filteredUsers.length > 0" class="user-table">
      <thead>
        <tr>
          <th class="col-name">姓名</th>
          <th class="col-username">帳號</th>
          <th class="col-title">職稱</th>
          <th class="col-role">角色</th>
          <th class="col-email">Email</th>
          <th class="col-date">異動日期</th>
          <th v-if="isAdmin" class="col-actions">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="user in filteredUsers" :key="user.id">
          <td>{{ user.name }}</td>
          <td>{{ user.username }}</td>
          <td>{{ user.title }}</td>
          <td :class="['role-cell', `role-${user.role}`]">
            <span class="role-badge">{{ user.role }}</span>
          </td>
          <td>{{ user.email }}</td>
          <td>{{ formatDate(user.updatedAt || user.createdAt) }}</td>
          <td v-if="isAdmin">
            <button class="btn btn-edit" @click="handleEditUser(user)">編輯</button>
            <button class="btn btn-delete" @click="handleDeleteUser(user.id, user.name)">
              刪除
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-else class="empty-state">沒有符合條件的使用者</div>

    <UserFormModal
      :is-visible="isModalVisible"
      :is-editing="isEditing"
      :user="userToEdit"
      @close="isModalVisible = false"
      @save="handleSaveUser"
    />

    <!-- 【步驟 5】在模板的根部加上這兩個新元件 -->
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
/* 您的 style 內容保持不變 */
.user-management-container {
  padding: 2rem;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}
.page-header h1 {
  font-size: 2.2rem;
  color: #333;
  margin: 0;
}
.header-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.search-input {
  padding: 0.7rem 1rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  font-size: 1rem;
  width: 250px;
}
.user-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #fff;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border-radius: 8px;
  overflow: hidden;
  table-layout: fixed;
}
.user-table th,
.user-table td {
  padding: 1rem 1.5rem;
  text-align: left;
  border-bottom: 1px solid #e0e0e0;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.user-table th {
  background-color: #f7f9fc;
  font-weight: 600;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.user-table .col-name {
  width: 12%;
}
.user-table .col-username {
  width: 10%;
}
.user-table .col-title {
  width: 12%;
}
.user-table .col-role {
  width: 12%;
}
.user-table .col-email {
  width: auto;
}
.user-table .col-date {
  width: 12%;
}
.user-table .col-actions {
  width: 14%;
}
.user-table td.col-email {
  white-space: normal;
}
.user-table tbody tr:last-child td {
  border-bottom: none;
}
.user-table tbody tr:hover {
  background-color: #f5faff;
}
.loading-state,
.empty-state {
  text-align: center;
  padding: 3rem;
  font-size: 1.2rem;
  color: #666;
}
.btn {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
  font-size: 0.95rem;
  transition: all 0.2s ease-in-out;
}
.btn-primary {
  background-color: #28a745;
  color: white;
}
.btn-primary:hover {
  background-color: #218838;
}
.btn-edit {
  background-color: #007bff;
  color: white;
  margin-right: 0.5rem;
}
.btn-edit:hover {
  background-color: #0056b3;
}
.btn-delete {
  background-color: #e74c3c;
  color: white;
}
.btn-delete:hover {
  background-color: #c0392b;
}
.role-badge {
  padding: 0.3em 0.8em;
  border-radius: 12px;
  font-size: 0.9em;
  font-weight: 500;
  text-transform: capitalize;
  color: white;
}
.role-admin .role-badge {
  background-color: #c82333;
}
.role-editor .role-badge {
  background-color: #007bff;
}
.role-contributor .role-badge {
  background-color: #28a745;
}
.role-viewer .role-badge {
  background-color: #6c757d;
}
</style>
