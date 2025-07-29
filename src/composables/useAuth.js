// 檔案路徑: src/composables/useAuth.js (最終修正版 - 實現 Session-Only 登入)

import { ref, computed, readonly, watch } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase.js'

// ✨ 1. 從 firebase/auth 引入必要的函式
import {
  signInWithCustomToken,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserSessionPersistence,
} from 'firebase/auth'

import { httpsCallable } from 'firebase/functions'
import { useErrorHandler } from '@/composables/useErrorHandler.js'

// --- 全局狀態 ---
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)
const authLoading = ref(true)
const loginLoading = ref(false)
const logoutLoading = ref(false)

// --- 安全的 localStorage 操作 ---
// 注意：即使我們改用 sessionStorage，這裡的 currentUser 備份機制可以保留，
// 作為一種輔助手段，但登入的權威來源將是 Firebase 的 session 狀態。
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

// --- 認證狀態監聽 ---
onAuthStateChanged(auth, async (user) => {
  authLoading.value = true
  if (user) {
    try {
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
      console.log('✅ Auth state changed: User is logged in.', currentUser.value)
    } catch (error) {
      console.error('❌ Error getting user token result:', error)
      currentUser.value = null
      await signOut(auth)
    }
  } else {
    currentUser.value = null
    safeLocalStorage.removeItem('currentUser')
    console.log('🚪 Auth state changed: User is logged out.')
  }
  authLoading.value = false
})

// --- 主要的 Composable 函式 ---
export function useAuth() {
  const router = useRouter()
  const { handleApiCall, validateInput, validationRules } = useErrorHandler()

  // ✨ --- 登入函式 (核心修改處) --- ✨
  const login = async (username, password) => {
    loginLoading.value = true

    const usernameValidation = validateInput(username, [
      validationRules.required('使用者名稱為必填'),
    ])
    const passwordValidation = validateInput(password, [validationRules.required('密碼為必填')])
    if (!usernameValidation.isValid) {
      loginLoading.value = false
      throw new Error(usernameValidation.errors[0])
    }
    if (!passwordValidation.isValid) {
      loginLoading.value = false
      throw new Error(passwordValidation.errors[0])
    }

    try {
      const result = await handleApiCall(
        async () => {
          // ✨ 2. 在所有登入操作之前，設定身份驗證的持久性為 SESSION
          // 這會告訴 Firebase 將登入狀態儲存在 sessionStorage 中。
          console.log("[Auth] Setting persistence to 'session'...")
          await setPersistence(auth, browserSessionPersistence)
          console.log('[Auth] Persistence set successfully.')

          // 步驟 1: 呼叫後端 Cloud Function
          console.log(`[Auth] Step 1: Calling 'customLogin' function for user: ${username}`)
          const customLoginFunction = httpsCallable(functions, 'customLogin')
          const response = await customLoginFunction({ username, password })

          const token = response?.data?.token
          if (!token) {
            throw new Error('從伺服器獲取登入憑證(token)失敗。')
          }
          console.log('[Auth] Step 1: Successfully received custom token.')

          // 步驟 2: 使用 custom token 登入 Firebase Auth
          console.log('[Auth] Step 2: Signing in with custom token...')
          await signInWithCustomToken(auth, token)
          console.log('[Auth] Step 2: Successfully signed in with custom token.')

          // 步驟 3: 導航到目標頁面
          console.log('[Auth] Step 3: Navigating to the destination page...')
          const redirectPath = router.currentRoute.value.query.redirect || '/schedule'
          await router.replace(redirectPath)

          return { success: true, redirectPath }
        },
        {
          loadingMessage: '登入中...',
          successMessage: '登入成功！',
          errorPrefix: '登入失敗',
          retryCount: 2,
          retryDelay: 1000,
          showNotification: false,
        },
      )
      return result
    } catch (error) {
      console.error('[Auth] Login process failed:', error)
      throw error
    } finally {
      loginLoading.value = false
    }
  }

  // --- 登出函式 (保持不變) ---
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
          retryCount: 1,
          showNotification: false,
        },
      )
    } finally {
      logoutLoading.value = false
    }
  }

  // --- 其他所有輔助函式 (保持不變) ---

  const refreshUser = async () => {
    if (!auth.currentUser) return null
    return handleApiCall(
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
      },
    )
  }

  const checkAuthState = () => {
    return new Promise((resolve) => {
      if (!authLoading.value) {
        resolve(currentUser.value)
        return
      }
      const stopWatcher = watch(authLoading, (loading) => {
        if (!loading) {
          stopWatcher()
          resolve(currentUser.value)
        }
      })
    })
  }

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

  const checkPermissions = (permissions) => {
    const results = {}
    for (const [key, role] of Object.entries(permissions)) {
      results[key] = hasPermission(role)
    }
    return results
  }

  async function changePassword(oldPassword, newPassword) {
    console.warn('changePassword 功能需要重構以配合新的認證系統。')
    throw new Error('此功能暫時停用，請聯繫管理員重設密碼。')
  }

  const canManageUsers = computed(() => hasPermission('admin'))
  const canEditSchedules = computed(() => hasPermission('editor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const canEditMemos = computed(() => isLoggedIn.value)
  const canViewMemos = computed(() => isLoggedIn.value)
  const canViewReporting = computed(() => isLoggedIn.value)
  const isAdmin = computed(() => hasPermission('admin'))
  const isReadOnly = computed(() => !hasPermission('contributor'))

  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )

  return {
    isLoggedIn: readonly(isLoggedIn),
    currentUser: readonly(currentUser),
    authLoading: readonly(authLoading),
    loginLoading: readonly(loginLoading),
    logoutLoading: readonly(logoutLoading),
    isAnyLoading: readonly(isAnyLoading),
    login,
    logout,
    changePassword,
    checkAuthState,
    hasPermission,
    checkPermissions,
    refreshUser,
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
