// 檔案路徑: src/composables/useAuth.js (最終正確版)

import { ref, computed } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'

const usersApi = ApiManager('users')

const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

const storedUser = localStorage.getItem('currentUser')
if (storedUser) {
  try {
    currentUser.value = JSON.parse(storedUser)
  } catch (e) {
    console.error('無法解析儲存的用戶資料，將其清除:', e)
    localStorage.removeItem('currentUser')
  }
}

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
 */
export function useAuth() {
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

  // 4. 【單一且正確的 isReadOnly】: 是否為「僅檢視」角色
  //    這主要用於區分 viewer 和其他所有可操作的角色
  const isReadOnly = computed(() => {
    return isLoggedIn.value && currentUser.value?.role === 'viewer'
  })

  // 5. 是否能編輯備忘錄 (基本上所有人都可以)
  const canEditMemos = computed(() => {
    // 假設未來可能會有 'guest' 等不能編輯的角色
    return isLoggedIn.value && currentUser.value?.role !== 'guest'
  })

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
  }
}
