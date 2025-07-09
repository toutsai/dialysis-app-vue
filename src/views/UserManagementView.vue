<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import UserFormModal from '@/components/UserFormModal.vue'

// --- API and State ---
const usersApi = ApiManager('users')
const users = ref([])
const isLoading = ref(true)
const searchTerm = ref('')

const isModalVisible = ref(false)
const isEditing = ref(false)
const userToEdit = ref(null)

// --- 權限控制 ---
const { isAdmin } = useAuth()

// --- Helper Function for Date Formatting ---
function formatDate(timestamp) {
  if (!timestamp) return 'N/A'
  // 處理 Firestore timestamp 物件或 ISO 字串
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

  // 排序：admin 在最前，其餘按創建時間倒序
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

async function handleDeleteUser(user) {
  if (!isAdmin.value) return
  if (confirm(`確定要刪除使用者 "${user.name}" 嗎？此操作無法復原。`)) {
    try {
      await usersApi.delete(user.id)
      await fetchUsers()
      alert('使用者已刪除。')
    } catch (error) {
      console.error('Failed to delete user:', error)
      alert('刪除使用者失敗。')
    }
  }
}

async function handleSaveUser(userData) {
  if (!isAdmin.value) return
  try {
    const dataToSave = { ...userData }
    if (isEditing.value) {
      const { id, ...updateData } = dataToSave
      updateData.updatedAt = new Date()
      await usersApi.update(id, updateData)
      alert('使用者資料已更新。')
    } else {
      dataToSave.createdAt = new Date()
      dataToSave.updatedAt = new Date()
      await usersApi.save(dataToSave)
      alert('使用者已新增。')
    }
    isModalVisible.value = false
    await fetchUsers()
  } catch (error) {
    console.error('Failed to save user:', error)
    alert('儲存使用者失敗。')
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
            <button class="btn btn-delete" @click="handleDeleteUser(user)">刪除</button>
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
  </div>
</template>

<style scoped>
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
  table-layout: fixed; /* 關鍵：讓寬度設定生效 */
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
