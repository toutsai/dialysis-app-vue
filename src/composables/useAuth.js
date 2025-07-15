// src/composables/useAuth.js (修正版)

import { ref, computed, readonly, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase.js'
import { signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'

// ✅ 只導入，不在此處調用
import { useErrorHandler } from '@/composables/useErrorHandler.js'

// Global State
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)
const authLoading = ref(true)

// ✨ 新增：操作載入狀態
const loginLoading = ref(false)
const logoutLoading = ref(false)

// 安全的 localStorage 操作
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

// 認證狀態監聽
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

      console.log('✅ User authenticated:', userData.name, `(${userData.role})`)
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

  // ✅ 修正：在函數內部調用 useErrorHandler
  const { handleApiCall, validateInput, validationRules } = useErrorHandler()

  // ✨ 完全重構：使用 handleApiCall 的登入函式
  const login = async (username, password) => {
    // 🔍 嚴格輸入驗證
    const usernameValidation = validateInput(username, [
      validationRules.required('使用者名稱為必填'),
    ])

    const passwordValidation = validateInput(password, [validationRules.required('密碼為必填')])

    if (!usernameValidation.isValid) {
      throw new Error(usernameValidation.errors[0])
    }

    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.errors[0])
    }

    loginLoading.value = true

    try {
      const customLoginFunction = httpsCallable(functions, 'customLogin')

      const result = await handleApiCall(
        async () => {
          // 🔥 呼叫後端認證
          const response = await customLoginFunction({ username, password })
          const token = response.data.token

          if (!token) {
            throw new Error('從伺服器獲取登入憑證失敗')
          }

          // 🔐 使用自訂令牌登入
          await signInWithCustomToken(auth, token)

          // 🎯 導航到目標頁面
          const redirectPath = router.currentRoute.value.query.redirect || '/schedule'
          await router.replace(redirectPath)

          return { success: true, redirectPath }
        },
        {
          loadingMessage: '登入中...',
          successMessage: '',
          errorPrefix: '登入失敗',
          retryCount: 2, // 重試2次
          retryDelay: 1000,
          showNotification: true,
        },
      )

      return result
    } finally {
      loginLoading.value = false
    }
  }

  // ✨ 完全重構：使用 handleApiCall 的登出函式
  const logout = async () => {
    logoutLoading.value = true

    try {
      return await handleApiCall(
        async () => {
          await signOut(auth)
          await router.push({ name: 'Login' })
          return { success: true }
        },
        {
          loadingMessage: '登出中...',
          successMessage: '已安全登出',
          errorPrefix: '登出失敗',
          retryCount: 1, // 登出只重試1次
          showNotification: false, // 登出成功不需要通知
        },
      )
    } finally {
      logoutLoading.value = false
    }
  }

  // ✨ 新增：重新整理使用者資訊
  const refreshUser = async () => {
    if (!auth.currentUser) return null

    return await handleApiCall(
      async () => {
        const idTokenResult = await auth.currentUser.getIdTokenResult(true) // 強制刷新
        const userData = {
          id: auth.currentUser.uid,
          uid: auth.currentUser.uid,
          name: idTokenResult.claims.name || '未命名',
          role: idTokenResult.claims.role || 'viewer',
          email: auth.currentUser.email,
          lastRefresh: new Date().toISOString(),
        }

        currentUser.value = userData
        safeLocalStorage.setItem('currentUser', JSON.stringify(userData))

        return userData
      },
      {
        errorPrefix: '重新整理使用者資訊失敗',
        showNotification: false,
        retryCount: 2,
      },
    )
  }

  // 檢查認證狀態
  const checkAuthState = () => {
    return new Promise((resolve) => {
      if (!authLoading.value) {
        resolve(currentUser.value)
        return
      }

      // 等待認證狀態確定
      const stopWatcher = watch(authLoading, (loading) => {
        if (!loading) {
          stopWatcher()
          resolve(currentUser.value)
        }
      })
    })
  }

  // 權限檢查函式
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

  // ✨ 新增：批量權限檢查
  const checkPermissions = (permissions) => {
    const results = {}
    for (const [key, role] of Object.entries(permissions)) {
      results[key] = hasPermission(role)
    }
    return results
  }

  // 暫時保持的 changePassword
  async function changePassword(oldPassword, newPassword) {
    console.warn('changePassword 功能需要重構以配合新的認證系統。')
    throw new Error('此功能暫時停用，請聯繫管理員重設密碼。')
  }

  // 權限計算
  const canManageUsers = computed(() => hasPermission('admin'))
  const canEditSchedules = computed(() => hasPermission('editor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const canEditMemos = computed(() => isLoggedIn.value)
  const canViewMemos = computed(() => isLoggedIn.value)
  const canViewReporting = computed(() => isLoggedIn.value)
  const isAdmin = computed(() => hasPermission('admin'))
  const isReadOnly = computed(() => !hasPermission('contributor'))

  // ✨ 新增：載入狀態計算
  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )

  return {
    // 狀態
    isLoggedIn: readonly(isLoggedIn),
    currentUser: readonly(currentUser),
    authLoading: readonly(authLoading),
    loginLoading: readonly(loginLoading), // ✨ 新增
    logoutLoading: readonly(logoutLoading), // ✨ 新增
    isAnyLoading: readonly(isAnyLoading), // ✨ 新增

    // 方法
    login,
    logout,
    changePassword,
    checkAuthState,
    hasPermission,
    checkPermissions, // ✨ 新增
    refreshUser, // ✨ 新增

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
