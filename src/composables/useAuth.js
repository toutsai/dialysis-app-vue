// 檔案路徑: src/composables/useAuth.js (最終正確版本)

import { ref, computed, readonly } from 'vue'
import { useRouter } from 'vue-router'

// ✨ 1. 從我們統一的 Firebase 設定檔中引入 auth 和 functions 實例
import { auth, functions } from '@/composables/useFirebase.js'

// ✨ 2. 只引入我們需要用到的 Firebase "操作" 函式
import { signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'

// --- Global State & Initialization Logic ---
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// 監聽 Auth 狀態，這是標準做法
// 它的作用是：無論使用者是剛登入、剛登出、還是重新整理頁面，
// 它都能確保 currentUser 的狀態與 Firebase 後端的真實狀態同步。
onAuthStateChanged(auth, async (user) => {
  if (user) {
    // 當 Firebase 使用者存在時 (表示已登入)
    // 我們從 token 中獲取角色等資訊
    const idTokenResult = await user.getIdTokenResult()
    currentUser.value = {
      id: user.uid, // 使用 Firebase UID 作為主鍵
      uid: user.uid,
      name: idTokenResult.claims.name || '未命名', // 從 token 拿取 name
      role: idTokenResult.claims.role || 'viewer', // 從 token 拿取 role
    }
    localStorage.setItem('currentUser', JSON.stringify(currentUser.value))
  } else {
    // 當使用者登出時，user 會是 null
    currentUser.value = null
    localStorage.removeItem('currentUser')
  }
})

// 啟動時檢查 localStorage (可選，但 onAuthStateChanged 會更可靠地處理)
const storedUser = localStorage.getItem('currentUser')
if (storedUser && !auth.currentUser) {
  // 這種情況很少見，但作為保險，如果本地有但 auth 沒登入，清空本地
  localStorage.removeItem('currentUser')
}

export function useAuth() {
  const router = useRouter()

  // ✨ 全新的 login 函式，呼叫 Cloud Function
  async function login(username, password) {
    const customLoginFunction = httpsCallable(functions, 'customLogin')
    try {
      // 呼叫後端 Cloud Function
      const result = await customLoginFunction({ username, password })
      const token = result.data.token

      if (!token) {
        throw new Error('從伺服器獲取登入憑證失敗。')
      }

      // 使用收到的自訂令牌登入 Firebase
      await signInWithCustomToken(auth, token)

      // onAuthStateChanged 會自動更新 currentUser，登入成功後我們只需導航
      await router.replace({ name: 'Schedule' })
    } catch (error) {
      console.error('登入失敗:', error)
      const message = error.message || '登入時發生錯誤，請稍後再試。'

      // 提取更友好的錯誤訊息給使用者看
      if (message.includes('not-found')) {
        throw new Error('帳號不存在。')
      }
      if (message.includes('unauthenticated')) {
        throw new Error('密碼錯誤。')
      }
      throw new Error(message)
    }
  }

  function logout() {
    signOut(auth) // 標準登出方法
    // onAuthStateChanged 會自動清理 currentUser，我們只需導航
    router.push({ name: 'Login' })
  }

  // changePassword 功能需要重構才能在新系統下運作
  // 這裡先放著，之後再處理
  async function changePassword(oldPassword, newPassword) {
    console.warn('changePassword 功能需要重構以配合新的認證系統。')
    throw new Error('此功能暫時停用，請聯繫管理員重設密碼。')
  }

  // --- Computed Permissions (保持不變) ---
  const canManageUsers = computed(() => isLoggedIn.value && currentUser.value?.role === 'admin')
  const canEditSchedules = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor'
  })
  const canEditPatients = computed(() => {
    if (!isLoggedIn.value) return false
    const role = currentUser.value?.role
    return role === 'admin' || role === 'editor' || role === 'contributor'
  })
  const canEditMemos = computed(() => isLoggedIn.value)
  const canViewMemos = computed(() => isLoggedIn.value)
  const canViewReporting = computed(() => isLoggedIn.value)

  // --- Return all state and functions (保持不變) ---
  return {
    isLoggedIn: readonly(isLoggedIn),
    currentUser: readonly(currentUser),
    login,
    logout,
    changePassword,
    canManageUsers,
    canEditSchedules,
    canEditPatients,
    canEditMemos,
    canViewMemos,
    canViewReporting,
    isAdmin: canManageUsers,
    isReadOnly: computed(() => {
      if (!isLoggedIn.value) return true
      return currentUser.value?.role === 'viewer'
    }),
  }
}
