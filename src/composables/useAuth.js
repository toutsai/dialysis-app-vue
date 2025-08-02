// 檔案路徑: src/composables/useAuth.js (最終修正版 - 實現 Session-Only 登入)

import { ref, computed, readonly } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase.js'

// 從 firebase/auth 引入必要的函式
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
const authLoading = ref(true)

// --- ✨ 核心修正：建立一個只 resolve 一次的 Promise ---
let authReadyResolve
const authReadyPromise = new Promise((resolve) => {
  authReadyResolve = resolve
})

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
      console.log('✅ Auth state changed: User is logged in.', currentUser.value)
    } catch (error) {
      console.error('❌ Error getting user token result:', error)
      currentUser.value = null
      await signOut(auth) // 發生錯誤時強制登出
    }
  } else {
    currentUser.value = null
    console.log('🚪 Auth state changed: User is logged out.')
  }
  authLoading.value = false
  // 當第一次狀態確認後，resolve a Promise
  authReadyResolve()
})

// --- 主要的 Composable 函式 ---
export function useAuth() {
  const router = useRouter()
  const { handleApiCall, validateInput, validationRules } = useErrorHandler()

  // 局部加載狀態
  const loginLoading = ref(false)
  const logoutLoading = ref(false)

  // --- 登入函式 ---
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
          // 設定身份驗證的持久性為 SESSION
          await setPersistence(auth, browserSessionPersistence)

          // 呼叫後端 Cloud Function
          const customLoginFunction = httpsCallable(functions, 'customLogin')
          const response = await customLoginFunction({ username, password })

          const token = response?.data?.token
          if (!token) {
            throw new Error('從伺服器獲取登入憑證(token)失敗。')
          }

          // 使用 custom token 登入 Firebase Auth
          await signInWithCustomToken(auth, token)

          // 導航到目標頁面
          const redirectPath = router.currentRoute.value.query.redirect || '/schedule'
          await router.replace(redirectPath)

          return { success: true, redirectPath }
        },
        {
          loadingMessage: '登入中...',
          successMessage: '登入成功！',
          errorPrefix: '登入失敗',
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

  // --- 登出函式 ---
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
          showNotification: false,
        },
      )
    } finally {
      logoutLoading.value = false
    }
  }

  // ✨ 核心修正：新增 waitForAuthInit 函式
  const waitForAuthInit = () => {
    return authReadyPromise
  }

  // --- 權限判斷 ---
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

  // --- 計算屬性 ---
  const isLoggedIn = computed(() => !!currentUser.value)
  const isAdmin = computed(() => hasPermission('admin'))
  const canEditSchedules = computed(() => hasPermission('editor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const isReadOnly = computed(() => !hasPermission('contributor'))
  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )

  return {
    // 狀態
    currentUser: readonly(currentUser),
    isLoggedIn: readonly(isLoggedIn),
    authLoading: readonly(authLoading),
    loginLoading: readonly(loginLoading),
    logoutLoading: readonly(logoutLoading),
    isAnyLoading: readonly(isAnyLoading),

    // 方法
    login,
    logout,
    waitForAuthInit, // ✨ 核心修正：匯出函式
    hasPermission,

    // 權限計算屬性
    isAdmin,
    canEditSchedules,
    canEditPatients,
    isReadOnly,
  }
}
