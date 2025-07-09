<script setup>
import { ref, onMounted, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'

// 子元件 (可複用或自行建立簡化版)
import UserFormModal from '@/components/UserFormModal.vue' // 假設您會建立這個元件
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

// API 實例
const usersApi = ApiManager('users')
const { currentUser } = useAuth() // 用於防止管理員刪除自己

// 響應式狀態
const allUsers = ref([])
const isLoading = ref(true)
const searchTerm = ref('')

// Dialog 相關狀態
const isModalVisible = ref(false)
const editingUser = ref(null) // null 表示新增，有物件表示編輯
const isConfirmDialogVisible = ref(false)
const confirmAction = ref(null)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

// 計算屬性：過濾和顯示使用者
const filteredUsers = computed(() => {
  if (!allUsers.value) return []
  let users = [...allUsers.value]

  if (searchTerm.value) {
    const lowerCaseSearch = searchTerm.value.toLowerCase()
    users = users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(lowerCaseSearch)) ||
        (u.username && u.username.toLowerCase().includes(lowerCaseSearch)) ||
        (u.email && u.email.toLowerCase().includes(lowerCaseSearch)),
    )
  }
  return users
})

// === CRUD 函式 ===

// 讀取所有使用者
async function fetchUsers() {
  isLoading.value = true
  try {
    allUsers.value = await usersApi.fetchAll()
  } catch (error) {
    console.error('讀取使用者資料失敗:', error)
    showAlertDialog('錯誤', '讀取使用者資料失敗，請稍後再試。')
  } finally {
    isLoading.value = false
  }
}

// 開啟新增使用者的彈窗
function handleOpenAddModal() {
  editingUser.value = null // 清空表示是新增模式
  isModalVisible.value = true
}

// 開啟編輯使用者的彈窗
function handleOpenEditModal(user) {
  // 深拷貝一個物件來編輯，避免直接修改列表中的資料
  editingUser.value = JSON.parse(JSON.stringify(user))
  isModalVisible.value = true
}

// 儲存使用者 (新增或更新)
async function handleSaveUser(userData) {
  try {
    if (userData.id) {
      // 更新
      const userId = userData.id
      delete userData.id // 從資料中移除 id，避免寫入 Firestore
      await usersApi.update(userId, userData)
    } else {
      // 新增
      await usersApi.save(userData)
    }
    isModalVisible.value = false
    await fetchUsers() // 重新載入列表
  } catch (error) {
    console.error('儲存使用者失敗:', error)
    showAlertDialog('儲存失敗', '儲存使用者資料時發生錯誤。')
  }
}

// 刪除使用者
function handleDeleteUser(user) {
  // 防止管理員刪除自己 (這段邏輯正確)
  if (user.id === currentUser.value?.id) {
    showAlertDialog('操作無效', '無法刪除您自己的帳號。')
    return
  }

  // 設定確認對話框 (這段邏輯正確)
  confirmDialogTitle.value = `確認刪除使用者`
  confirmDialogMessage.value = `您確定要永久刪除使用者「${user.name} (${user.username})」嗎？\n此操作無法復原。`

  // 設定確認後執行的動作
  confirmAction.value = async () => {
    try {
      // 【核心操作】調用 API 刪除
      await usersApi.delete(user.id)
      // 成功後，重新載入列表
      await fetchUsers()
    } catch (error) {
      console.error('刪除使用者失敗:', error)
      showAlertDialog('刪除失敗', '刪除使用者時發生錯誤。')
    }
  }

  // 顯示對話框 (這段邏輯正確)
  isConfirmDialogVisible.value = true
}

// Helper: 顯示提示對話框
function showAlertDialog(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}

// === 生命週期鉤子 ===
onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="page-container">
    <h1 class="page-title">使用者帳號管理</h1>

    <div class="toolbar">
      <button @click="handleOpenAddModal" class="btn-add">新增使用者</button>
      <div class="search-group">
        <input type="text" v-model="searchTerm" placeholder="搜尋姓名/帳號/Email..." />
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">載入中...</div>

    <div v-else class="table-wrapper">
      <table class="data-table">
        <thead>
          <tr>
            <th>姓名</th>
            <th>帳號 (Username)</th>
            <!-- 密碼通常不在列表顯示，保持安全 -->
            <th>職稱</th>
            <th>角色 (Role)</th>
            <th>Email</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="filteredUsers.length === 0">
            <td colspan="6" class="empty-row">沒有符合條件的使用者</td>
          </tr>
          <tr v-for="user in filteredUsers" :key="user.id">
            <!-- 1. 姓名 -->
            <td>{{ user.name }}</td>

            <!-- 2. 帳號 -->
            <td>{{ user.username }}</td>

            <!-- 3. 職稱 (修正) -->
            <td>{{ user.title }}</td>

            <!-- 4. 角色 (修正) -->
            <td>
              <span :class="`role-tag role-${user.role}`">{{ user.role }}</span>
            </td>

            <!-- 5. Email (修正) -->
            <td>{{ user.email }}</td>
            <td class="action-buttons">
              <button class="btn-edit" @click="handleOpenEditModal(user)">編輯</button>
              <button
                class="btn-delete"
                @click="handleDeleteUser(user)"
                :disabled="user.id === currentUser?.id"
                title="無法刪除自己的帳號"
              >
                刪除
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modals and Dialogs -->
    <UserFormModal
      v-if="isModalVisible"
      :is-visible="isModalVisible"
      :user-data="editingUser"
      @save="handleSaveUser"
      @close="isModalVisible = false"
    />

    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="confirmAction"
      @cancel="isConfirmDialogVisible = false"
    />

    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
  </div>
</template>

<style scoped>
.page-title {
  margin-bottom: 1.5rem;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}
.btn-add {
  padding: 0.6rem 1.2rem;
  font-size: 1em;
  background-color: #16a34a;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
.btn-add:hover {
  background-color: #15803d;
}
.search-group input {
  padding: 0.6rem;
  border: 1px solid #ccc;
  border-radius: 5px;
  min-width: 300px;
}
.table-wrapper {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  border: 1px solid #ddd;
  padding: 0.8rem 1rem;
  text-align: left;
}
.data-table th {
  background-color: #f8f9fa;
}
.empty-row {
  text-align: center;
  color: #6c757d;
  font-style: italic;
  padding: 2rem;
}
.action-buttons button {
  margin-right: 0.5rem;
  padding: 0.4rem 0.8rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: white;
}
.btn-edit {
  background-color: #007bff;
}
.btn-delete {
  background-color: #dc3545;
}
.btn-delete:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}
.role-tag {
  padding: 0.2em 0.6em;
  border-radius: 10px;
  color: white;
  font-size: 0.9em;
  font-weight: bold;
}
.role-admin {
  background-color: #dc3545;
}
.role-editor {
  background-color: #ffc107;
  color: #212529;
}
.role-viewer {
  background-color: #28a745;
}
.loading-state {
  text-align: center;
  padding: 3rem;
  font-size: 1.2rem;
  color: #6c757d;
}
</style>
