// 檔案路徑: src/composables/useAuth.js (最終權限整合版)

import { ref, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

const usersApi = ApiManager('users')

// --- Global State (模組級別的狀態) ---
// 這些狀態在整個應用程式中是單例的，只會存在一份
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// --- Initialization Logic ---
// 應用程式啟動時，嘗試從 localStorage 恢復使用者狀態
const storedUser = localStorage.getItem('currentUser')
if (storedUser) {
  try {
    currentUser.value = JSON.parse(storedUser)
  } catch (e) {
    console.error('無法解析儲存的用戶資料，將其清除:', e)
    localStorage.removeItem('currentUser')
  }
}

// --- Auth Functions (模組級別的函式) ---
// 這些函式直接操作模組級別的狀態
export function login(username, password) {
  return new Promise(async (resolve, reject) => {
    try {
      const users = await usersApi.fetchAll([where('username', '==', username)])
      if (users.length === 0) {
        return reject(new Error('帳號不存在'))
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
        resolve()
      } else {
        reject(new Error('密碼錯誤'))
      }
    } catch (error) {
      console.error('登入失敗:', error)
      reject(new Error('登入時發生錯誤，請稍後再試。'))
    }
  })
}

export function logout() {
  currentUser.value = null
  localStorage.removeItem('currentUser')
  // 為了確保所有元件的狀態都重置，重新導向是個好方法
  window.location.href = '/login'
}

export function changePassword(oldPassword, newPassword) {
  return new Promise(async (resolve, reject) => {
    if (!currentUser.value || !currentUser.value.id) {
      return reject(new Error('使用者未登入，無法更改密碼。'))
    }
    try {
      const userInDb = await usersApi.fetchById(currentUser.value.id)
      if (!userInDb) {
        return reject(new Error('在資料庫中找不到您的使用者資料。'))
      }
      if (userInDb.password !== oldPassword) {
        return reject(new Error('舊密碼不正確。'))
      }
      await usersApi.update(currentUser.value.id, { password: newPassword })
      resolve()
    } catch (error) {
      console.error('更改密碼失敗:', error)
      reject(new Error('更改密碼時發生錯誤，請稍後再試。'))
    }
  })
}

/**
 * useAuth 組合式函數，提供所有權限相關的狀態和函式。
 * 這是其他元件引入和使用的主要入口。
 */
export function useAuth() {
  // --- Computed Permissions ---
  // 所有權限都基於模組級別的 currentUser 和 isLoggedIn 狀態

  // 1. 【使用者管理權限】: 只有 admin 能管理使用者
  const canManageUsers = computed(() => {
    return isLoggedIn.value && currentUser.value?.role === 'admin'
  })

  // 2. 【排班表編輯權限】: 只有 admin 和 editor 能編輯四個排班表
  const canEditSchedules = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor'
  })

  // 3. 【病人資料編輯權限】: admin, editor, contributor 能編輯病人資料
  const canEditPatients = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor' || role === 'contributor'
  })

  // ====================== 【權限邏輯修正點】 ======================
  // 4. 【備忘錄編輯權限】: 所有登入的角色都可以編輯備忘錄
  const canEditMemos = computed(() => {
    // 只要登入了，就可以編輯備忘錄
    return isLoggedIn.value
  })

  // 5. 【查看備忘錄權限】: 所有登入者都可以查看備忘錄圖示 (邏輯與編輯相同)
  const canViewMemos = computed(() => {
    return isLoggedIn.value
  })
  // =============================================================

  // 6. 【報表查看權限】: 假設所有登入者都能看報表
  const canViewReporting = computed(() => {
    return isLoggedIn.value
  })

  // --- Return all state and functions ---
  // 將所有狀態和語意化的權限打包回傳，供元件使用
  return {
    // 核心狀態和方法
    isLoggedIn,
    currentUser,
    login,
    logout,
    changePassword,

    // 語意化的權限 (建議未來都使用這些)
    canManageUsers,
    canEditSchedules,
    canEditPatients,
    canEditMemos,
    canViewMemos,
    canViewReporting,

    // 保留舊的別名以供過渡，但建議逐步淘汰
    isAdmin: canManageUsers,
    isEditor: canEditSchedules,
    canEditPatientsAndMemos: canEditPatients,
    isReadOnly: computed(() => {
      if (!isLoggedIn.value) return true // 未登入是只讀
      // 根據您的表格，只有 viewer 在排班表上是嚴格的只讀
      // 但在其他頁面不是，所以這個 isReadOnly 的語意有點模糊
      // 建議直接使用更精確的 canEditSchedules, canEditPatients 等
      return currentUser.value?.role === 'viewer'
    }),
  }
}
