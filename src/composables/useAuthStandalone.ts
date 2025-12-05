/**
 * 單機模式認證 Composable
 * 使用本地 API 進行認證，取代 Firebase Auth
 */

import { ref, computed, readonly, type Ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { authApi, getAuthToken, clearAuthToken } from '@/services/localApiClient'
import { useErrorHandler } from '@/composables/useErrorHandler.js'

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
const claims: Ref<Record<string, unknown> | null> = ref(null)

// --- Promise for auth ready ---
let authReadyResolve: () => void
const authReadyPromise = new Promise<void>((resolve) => {
  authReadyResolve = resolve
})

// --- 初始化：檢查是否有已儲存的 Token ---
async function initAuth() {
  authLoading.value = true

  const token = getAuthToken()
  if (token) {
    try {
      // 驗證 Token 並取得使用者資料
      const user = await authApi.getCurrentUser()
      currentUser.value = {
        id: user.id,
        uid: user.uid,
        name: user.name,
        role: user.role,
        title: user.title,
        email: user.email,
        lastLogin: user.lastLogin || new Date().toISOString(),
      }
      claims.value = {
        role: user.role,
        title: user.title,
        name: user.name,
      }
      console.log('✅ [Standalone Auth] 已恢復登入狀態:', user.name)
    } catch (error) {
      console.warn('⚠️ [Standalone Auth] Token 無效或已過期，清除登入狀態')
      clearAuthToken()
      currentUser.value = null
      claims.value = null
    }
  } else {
    currentUser.value = null
    claims.value = null
  }

  authLoading.value = false
  authReadyResolve()
}

// 啟動初始化
initAuth()

export function useAuthStandalone() {
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
          // 呼叫本地 API 登入
          const response = await authApi.login(username, password)

          if (!response.success || !response.token) {
            throw new Error('登入失敗，請檢查使用者名稱和密碼')
          }

          // 設定使用者狀態
          const user = response.user
          currentUser.value = {
            id: user.id,
            uid: user.uid,
            name: user.name,
            role: user.role,
            title: user.title,
            email: user.email,
            lastLogin: new Date().toISOString(),
          }
          claims.value = {
            role: user.role,
            title: user.title,
            name: user.name,
          }

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
      console.error('[Standalone Auth] Login failed:', error)
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
          await authApi.logout()
          currentUser.value = null
          claims.value = null
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
    if (!currentUser.value) throw new Error('使用者未登入，無法更改密碼。')
    return handleApiCall(
      async () => {
        const result = await authApi.changePassword(oldPassword, newPassword)
        return result
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
  const isEditor = computed(() => hasPermission('editor'))
  const isContributor = computed(() => hasPermission('contributor'))
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
    isViewer,

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
