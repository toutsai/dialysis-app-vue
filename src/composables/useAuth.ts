// 檔案路徑: src/composables/useAuth.ts (已修正)

import { ref, computed, readonly, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase'

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

interface AuthClaims {
  role?: string
  title?: string
  name?: string
  [key: string]: unknown
}

export interface AppUser {
  id: string
  uid: string
  name: string
  role: string
  title: string
  email: string | null
  lastLogin: string
}

interface LoginResult {
  success: boolean
  redirectPath: string
}

// --- 全局狀態 ---
const currentUser: Ref<AppUser | null> = ref(null)
const authLoading = ref(true)
// ✨ 1. 【新增】在這裡定義一個全域的 claims ref
const claims: Ref<AuthClaims | null> = ref(null)

// --- 建立一個只 resolve 一次的 Promise ---
let authReadyResolve: () => void
const authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolve = resolve
})

// --- 認證狀態監聽 ---
onAuthStateChanged(auth, async (user) => {
  authLoading.value = true
  if (user) {
    try {
      const idTokenResult = await user.getIdTokenResult()
      // ✨ 2. 【新增】為 claims ref 賦值
      claims.value = idTokenResult.claims

      const userData: AppUser = {
        id: user.uid,
        uid: user.uid,
        name: (idTokenResult.claims as AuthClaims).name || '未命名',
        role: (idTokenResult.claims as AuthClaims).role || 'viewer',
        title: (idTokenResult.claims as AuthClaims).title || '未知職稱',
        email: user.email,
        lastLogin: new Date().toISOString(),
      }
      currentUser.value = userData
      console.log('✅ Auth state changed: User is logged in.', currentUser.value)
    } catch (error) {
      console.error('❌ Error getting user token result:', error)
      currentUser.value = null
      claims.value = null // ✨ 登出或錯誤時也要清空 claims
      await signOut(auth) // 發生錯誤時強制登出
    }
  } else {
    currentUser.value = null
    claims.value = null // ✨ 登出時也要清空 claims
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
  const login = async (username: string, password: string): Promise<LoginResult> => {
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
      const result = await handleApiCall<LoginResult>(
        async () => {
          // 設定身份驗證的持久性為 SESSION
          await setPersistence(auth, browserSessionPersistence)

          // 呼叫後端 Cloud Function
          const customLoginFunction = httpsCallable<{ username: string; password: string }, { token: string }>(
            functions,
            'customLogin',
          )
          const response = await customLoginFunction({ username, password })

          const token = response?.data?.token
          if (!token) {
            throw new Error('從伺服器獲取登入憑證(token)失敗。')
          }

          // 使用 custom token 登入 Firebase Auth
          await signInWithCustomToken(auth, token)

          // 導航到目標頁面
          const redirectPath = (router.currentRoute.value.query.redirect as string) || '/schedule'
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

  // --- 修改密碼函式 ---
  const updatePassword = async (oldPassword: string, newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error('使用者未登入，無法更改密碼。')
    }

    return handleApiCall(
      async () => {
        const changeUserPasswordFunction = httpsCallable<
          { oldPassword: string; newPassword: string },
          { success: boolean }
        >(functions, 'changeUserPassword')
        const result = await changeUserPasswordFunction({ oldPassword, newPassword })
        return result.data
      },
      {
        loadingMessage: '正在更新密碼...',
        successMessage: '密碼已成功更新！',
        errorPrefix: '密碼更新失敗',
        showNotification: true,
      },
    )
  }

  // --- 等待認證初始化 ---
  const waitForAuthInit = () => {
    return authReadyPromise
  }

  // --- 權限判斷 ---
  const hasPermission = (requiredRole: string) => {
    if (!currentUser.value) return false
    const roleHierarchy: Record<string, number> = {
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
  const isEditor = computed(() => hasPermission('editor')) // ✅ 修正：這應該是 computed 而不是 ref
  const canEditSchedules = computed(() => hasPermission('editor'))
  const isContributor = computed(() => hasPermission('contributor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const isReadOnly = computed(() => !hasPermission('contributor'))
  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )
  const canManagePhysicianSchedule = computed(() => {
    if (!currentUser.value) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })
  const canUploadLabReport = computed(() => isLoggedIn.value)
  const canManageOrders = computed(() => {
    if (!currentUser.value) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })
  const canViewConsumables = computed(() => {
    if (!currentUser.value) return false
    return !!currentUser.value
  })

  const canEditClinicalNotesAndOrders = computed(() => {
    if (!currentUser.value?.role) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })

  // ❌ 移除這兩行重複定義！它們覆蓋了上面正確的定義
  // const isEditor = ref(false)
  // const currentUser = ref(null)

  return {
    // 狀態
    currentUser: readonly(currentUser),
    claims: readonly(claims),
    isLoggedIn: readonly(isLoggedIn),
    authLoading: readonly(authLoading),
    loginLoading: readonly(loginLoading),
    logoutLoading: readonly(logoutLoading),
    isAnyLoading: readonly(isAnyLoading),
    canManagePhysicianSchedule,
    canUploadLabReport,

    // 方法
    login,
    logout,
    updatePassword,
    waitForAuthInit,
    hasPermission,

    // 權限計算屬性
    isAdmin,
    isEditor, // ✅ 現在這個正確地指向 computed 屬性
    isContributor,
    canEditSchedules,
    canEditPatients,
    isReadOnly,
    canManageOrders,
    canViewConsumables,
    canEditClinicalNotesAndOrders,
  }
}
