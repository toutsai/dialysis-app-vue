// 檔案路徑: src/composables/useAuth.js (最終正確版)

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

  // 1. 是否為最高管理員 (只有 admin)
  const isAdmin = computed(() => {
    return isLoggedIn.value && currentUser.value?.role === 'admin'
  })

  // 2. 是否為核心排班編輯者 (admin 或 editor)
  const isEditor = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor'
  })

  // 3. 是否能編輯「病人/備忘錄」 (admin, editor, 或 contributor)
  const canEditPatientsAndMemos = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor' || role === 'contributor'
  })

  // 4. 是否為「僅檢視」角色
  const isReadOnly = computed(() => {
    return isLoggedIn.value && currentUser.value?.role === 'viewer'
  })

  // 5. 是否能編輯備忘錄 (基本上除了 guest 都可以)
  const canEditMemos = computed(() => {
    return isLoggedIn.value && currentUser.value?.role !== 'guest'
  })

  // ====================== 【問題修正點】: 新增這個權限！ ======================
  // 6. 是否能編輯「排班表」
  //    這個權限通常比較嚴格，我們假設只有 admin 和 editor 可以。
  const canEditSchedules = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    // 直接重用 isEditor 的邏輯也可以，但為了清晰，我們獨立定義
    return role === 'admin' || role === 'editor'
  })
  // ========================================================================

  // --- Return all state and functions ---
  // 將所有狀態和函式打包回傳，供元件使用
  return {
    isLoggedIn,
    currentUser,
    login,
    logout,
    changePassword,
    // 返回所有權限屬性
    isAdmin,
    isEditor,
    canEditPatientsAndMemos,
    isReadOnly,
    canEditMemos,
    // 【問題修正點】: 記得也要在這裡返回
    canEditSchedules,
  }
}
