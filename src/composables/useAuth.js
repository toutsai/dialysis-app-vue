// src/composables/useAuth.js (階段一升級版)

import { ref, computed, readonly } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase.js'
import { signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'

// ✨ 新增：引入錯誤處理系統
import { useErrorHandler } from '@/composables/useErrorHandler.js'

// 初始化錯誤處理
const { handleApiCall, validateInput, validationRules } = useErrorHandler()

// Global State
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// ✨ 新增：認證載入狀態
const authLoading = ref(true)

// ✨ 改善：安全的 localStorage 操作
const safeLocalStorage = {
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch (error) {
      console.warn('localStorage.getItem failed:', error)
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch (error) {
      console.warn('localStorage.setItem failed:', error)
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key)
    } catch (error) {
      console.warn('localStorage.removeItem failed:', error)
    }
  },
}

// ✨ 改善：認證狀態監聽
onAuthStateChanged(auth, async (user) => {
  authLoading.value = true

  try {
    if (user) {
      const idTokenResult = await user.getIdTokenResult()
      const userData = {
        id: user.uid,
        uid: user.uid,
        name: idTokenResult.claims.name || '未命名',
        role: idTokenResult.claims.role || 'viewer',
        email: user.email,
        lastLogin: new Date().toISOString(),
      }

      currentUser.value = userData
      safeLocalStorage.setItem('currentUser', JSON.stringify(userData))

      console.log('✅ User authenticated:', userData.name)
    } else {
      currentUser.value = null
      safeLocalStorage.removeItem('currentUser')
      console.log('🚪 User signed out')
    }
  } catch (error) {
    console.error('❌ Auth state change error:', error)
    currentUser.value = null
    safeLocalStorage.removeItem('currentUser')
  } finally {
    authLoading.value = false
  }
})

export function useAuth() {
  const router = useRouter()

  // ✨ 改善：登入函式加入基本錯誤處理
  async function login(username, password) {
    // 基本輸入驗證
    if (!username?.trim()) {
      throw new Error('使用者名稱為必填')
    }

    if (!password?.trim()) {
      throw new Error('密碼為必填')
    }

    const customLoginFunction = httpsCallable(functions, 'customLogin')

    try {
      console.log('🔄 開始登入流程...')

      // 呼叫後端 Cloud Function
      const result = await customLoginFunction({ username, password })
      const token = result.data.token

      if (!token) {
        throw new Error('從伺服器獲取登入憑證失敗')
      }

      // 使用自訂令牌登入 Firebase
      await signInWithCustomToken(auth, token)

      // 導航到預設頁面
      const redirectPath = router.currentRoute.value.query.redirect || '/schedule'
      await router.replace(redirectPath)

      console.log('✅ 登入成功！')
    } catch (error) {
      console.error('❌ 登入失敗:', error)

      // 改善錯誤訊息
      let message = error.message || '登入時發生錯誤，請稍後再試。'

      if (message.includes('not-found')) {
        message = '帳號不存在'
      } else if (message.includes('unauthenticated')) {
        message = '密碼錯誤'
      } else if (message.includes('network')) {
        message = '網路連線問題，請檢查網路設定'
      } else if (message.includes('timeout')) {
        message = '連線逾時，請稍後再試'
      }

      throw new Error(message)
    }
  }

  // ✨ 改善：登出函式加入錯誤處理
  async function logout() {
    try {
      console.log('🚪 開始登出流程...')
      await signOut(auth)
      await router.push({ name: 'Login' })
      console.log('✅ 登出成功！')
    } catch (error) {
      console.error('❌ 登出失敗:', error)
      // 即使登出失敗，仍然導向登入頁
      await router.push({ name: 'Login' })
      throw new Error('登出時發生錯誤，但已安全導向登入頁')
    }
  }

  // 暫時保持原本的 changePassword (之後再處理)
  async function changePassword(oldPassword, newPassword) {
    console.warn('changePassword 功能需要重構以配合新的認證系統。')
    throw new Error('此功能暫時停用，請聯繫管理員重設密碼。')
  }

  // ✨ 新增：檢查認證狀態的輔助函式
  const checkAuthState = () => {
    return new Promise((resolve) => {
      if (!authLoading.value) {
        resolve(currentUser.value)
        return
      }

      // 等待認證狀態確定
      const unsubscribe = auth.onAuthStateChanged(() => {
        if (!authLoading.value) {
          unsubscribe()
          resolve(currentUser.value)
        }
      })
    })
  }

  // ✨ 新增：權限檢查函式
  const hasPermission = (requiredRole) => {
    if (!currentUser.value) return false

    const roleHierarchy = {
      viewer: 1,
      contributor: 2,
      editor: 3,
      admin: 4,
    }

    const userLevel = roleHierarchy[currentUser.value.role] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 999

    return userLevel >= requiredLevel
  }

  // 權限計算 (保持原有邏輯，但改用新的 hasPermission)
  const canManageUsers = computed(() => hasPermission('admin'))
  const canEditSchedules = computed(() => hasPermission('editor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const canEditMemos = computed(() => isLoggedIn.value)
  const canViewMemos = computed(() => isLoggedIn.value)
  const canViewReporting = computed(() => isLoggedIn.value)
  const isAdmin = computed(() => hasPermission('admin'))
  const isReadOnly = computed(() => !hasPermission('contributor'))

  return {
    // 狀態
    isLoggedIn: readonly(isLoggedIn),
    currentUser: readonly(currentUser),
    authLoading: readonly(authLoading), // ✨ 新增

    // 方法
    login,
    logout,
    changePassword,
    checkAuthState, // ✨ 新增
    hasPermission, // ✨ 新增

    // 權限
    canManageUsers,
    canEditSchedules,
    canEditPatients,
    canEditMemos,
    canViewMemos,
    canViewReporting,
    isAdmin,
    isReadOnly,
  }
}
