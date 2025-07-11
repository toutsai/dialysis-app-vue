// 檔案路徑: src/composables/useAuth.js (已修正)

import { ref, computed, readonly } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
// 【核心修改點 1】: 引入 useRouter
import { useRouter } from 'vue-router'

const usersApi = ApiManager('users')

// --- Global State (模組級別的狀態) ---
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// --- Initialization Logic ---
const storedUser = localStorage.getItem('currentUser')
if (storedUser) {
  try {
    currentUser.value = JSON.parse(storedUser)
  } catch (e) {
    console.error('無法解析儲存的用戶資料，將其清除:', e)
    localStorage.removeItem('currentUser')
  }
}

/**
 * useAuth 組合式函數，提供所有權限相關的狀態和函式。
 * 這是其他元件引入和使用的主要入口。
 */
export function useAuth() {
  // 【核心修改點 2】: 在 useAuth 內部獲取 router 實例
  const router = useRouter()

  // --- Auth Functions ---
  async function login(username, password) {
    try {
      const users = await usersApi.fetchAll([where('username', '==', username)])
      if (users.length === 0) {
        throw new Error('帳號不存在')
      }
      const userInDb = users[0]
      if (userInDb.password === password) {
        const userToStore = {
          id: userInDb.id,
          username: userInDb.username,
          name: userInDb.name,
          role: userInDb.role,
        }
        currentUser.value = userToStore
        localStorage.setItem('currentUser', JSON.stringify(userToStore))

        // 【核心修改點 3】: 登入成功後，主動發起導航
        // 這個動作會觸發路由守衛，守衛會驗證權限並放行
        // 使用 router.replace 避免使用者可以按“上一頁”回到登入頁
        await router.replace({ name: 'Schedule' })
      } else {
        throw new Error('密碼錯誤')
      }
    } catch (error) {
      console.error('登入失敗:', error)
      throw new Error(error.message || '登入時發生錯誤，請稍後再試。')
    }
  }

  function logout() {
    currentUser.value = null
    localStorage.removeItem('currentUser')
    // 【核心修改點 4】: 使用 router 實例進行跳轉
    router.push({ name: 'Login' })
  }

  async function changePassword(oldPassword, newPassword) {
    if (!currentUser.value || !currentUser.value.id) {
      throw new Error('使用者未登入，無法更改密碼。')
    }
    try {
      const userInDb = await usersApi.fetchById(currentUser.value.id)
      if (!userInDb) {
        throw new Error('在資料庫中找不到您的使用者資料。')
      }
      if (userInDb.password !== oldPassword) {
        throw new Error('舊密碼不正確。')
      }
      await usersApi.update(currentUser.value.id, { password: newPassword })
    } catch (error) {
      console.error('更改密碼失敗:', error)
      throw new Error('更改密碼時發生錯誤，請稍後再試。')
    }
  }

  // --- Computed Permissions ---
  const canManageUsers = computed(() => isLoggedIn.value && currentUser.value?.role === 'admin')
  const canEditSchedules = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor'
  })
  const canEditPatients = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor' || role === 'contributor'
  })
  const canEditMemos = computed(() => isLoggedIn.value)
  const canViewMemos = computed(() => isLoggedIn.value)
  const canViewReporting = computed(() => isLoggedIn.value)

  // --- Return all state and functions ---
  return {
    isLoggedIn: readonly(isLoggedIn),
    currentUser: readonly(currentUser),
    login,
    logout,
    changePassword,
    canManageUsers,
    canEditSchedules,
    canEditPatients,
    canEditMemos,
    canViewMemos,
    canViewReporting,
    isAdmin: canManageUsers,
    isReadOnly: computed(() => {
      if (!isLoggedIn.value) return true
      return currentUser.value?.role === 'viewer'
    }),
  }
}
