// 檔案路徑: src/composables/useAuth.ts

import { ref, computed, readonly, type Ref, watch } from 'vue' // ✨ 加引入 watch
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase'
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
    } catch (error) {
      console.error('❌ Error getting user token result:', error)
      currentUser.value = null
      claims.value = null
      await signOut(auth)
    }
  } else {
    currentUser.value = null
    claims.value = null
  }
  authLoading.value = false
  authReadyResolve()
})

export function useAuth() {
  const router = useRouter()
  const { handleApiCall, validateInput, validationRules } = useErrorHandler()
  const loginLoading = ref(false)
  const logoutLoading = ref(false)

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
          await setPersistence(auth, browserSessionPersistence)

          const customLoginFunction = httpsCallable<
            { username: string; password: string },
            { token: string }
          >(functions, 'customLogin')
          const response = await customLoginFunction({ username, password })

          const token = response?.data?.token
          if (!token) {
            throw new Error('從伺服器獲取登入憑證(token)失敗。')
          }

          // 1. 執行登入
          await signInWithCustomToken(auth, token)

          // ✨✨✨【關鍵修正】✨✨✨
          // signInWithCustomToken 結束不代表 onAuthStateChanged 已經跑完
          // 我們必須手動等待 currentUser 被賦值，避免跳轉後狀態仍為 null
          if (!currentUser.value) {
            await new Promise<void>((resolve) => {
              const unwatch = watch(currentUser, (val) => {
                if (val) {
                  unwatch() // 停止監聽
                  resolve() // 繼續執行
                }
              })
            })
          }

          // 2. 確保 currentUser 有值後，再導航
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

  const updatePassword = async (oldPassword: string, newPassword: string) => {
    if (!auth.currentUser) throw new Error('使用者未登入，無法更改密碼。')
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

  const waitForAuthInit = () => authReadyPromise

  // 層級判斷 (用於功能操作權限)
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

  const isLoggedIn = computed(() => !!currentUser.value)

  // 計算屬性
  const isAdmin = computed(() => hasPermission('admin'))
  const isEditor = computed(() => hasPermission('editor')) // 包含 Admin, Editor
  const isContributor = computed(() => hasPermission('contributor')) // 包含 Admin, Editor, Contributor
  // ✨ 新增：嚴格的 Viewer 判斷 (不使用 hasPermission，避免邏輯混淆)
  const isViewer = computed(() => currentUser.value?.role === 'viewer')

  const isReadOnly = computed(() => !hasPermission('contributor'))
  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )

  // 其他功能性權限判斷
  const canManagePhysicianSchedule = computed(() => {
    if (!currentUser.value) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })
  const canUploadLabReport = computed(() => isLoggedIn.value)
  const canManageOrders = computed(() => {
    if (!currentUser.value) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })
  const canViewConsumables = computed(() => !!currentUser.value)
  const canEditSchedules = computed(() => hasPermission('editor'))
  const canEditPatients = computed(() => hasPermission('contributor'))
  const canEditClinicalNotesAndOrders = computed(() => {
    if (!currentUser.value?.role) return false
    return ['admin', 'contributor'].includes(currentUser.value.role)
  })

  return {
    currentUser: readonly(currentUser),
    claims: readonly(claims),
    isLoggedIn: readonly(isLoggedIn),
    authLoading: readonly(authLoading),
    loginLoading: readonly(loginLoading),
    logoutLoading: readonly(logoutLoading),
    isAnyLoading: readonly(isAnyLoading),

    login,
    logout,
    updatePassword,
    waitForAuthInit,
    hasPermission,

    isAdmin,
    isEditor,
    isContributor,
    isViewer, // ✨ 導出 isViewer

    canEditSchedules,
    canEditPatients,
    isReadOnly,
    canManageOrders,
    canViewConsumables,
    canManagePhysicianSchedule,
    canUploadLabReport,
    canEditClinicalNotesAndOrders,
  }
}
