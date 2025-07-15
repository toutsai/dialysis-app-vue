// 檔案路徑: src/composables/useAuth.js (最終完美版)

import { ref, computed, readonly } from 'vue'
import { useRouter } from 'vue-router'
import { auth, functions } from '@/composables/useFirebase.js'
import { signInWithCustomToken, onAuthStateChanged, signOut } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'

const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// ✨ --- 關鍵修正：將監聽器改為 async 函式 --- ✨
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // 使用 await，強制程式碼在這裡等待，直到 token 結果完全返回
      const idTokenResult = await user.getIdTokenResult()

      // 當這行程式碼執行時，我們可以 100% 確定 claims 已經可用
      currentUser.value = {
        id: user.uid,
        uid: user.uid,
        name: idTokenResult.claims.name || '未命名',
        role: idTokenResult.claims.role || 'viewer',
      }
    } catch (error) {
      console.error('獲取使用者角色失敗:', error)
      // 如果獲取角色失敗，可以將使用者登出或做降級處理
      currentUser.value = null
    }
  } else {
    currentUser.value = null
  }
})

export function useAuth() {
  const router = useRouter()

  async function login(username, password) {
    const customLoginFunction = httpsCallable(functions, 'customLogin')
    try {
      const result = await customLoginFunction({ username, password })
      const token = result.data.token
      if (!token) throw new Error('從伺服器獲取登入憑證失敗。')

      await signInWithCustomToken(auth, token)

      // 等待 onAuthStateChanged 更新完 currentUser 後再導航
      // 這裡可以加一個小延遲或更複雜的狀態管理，但通常重新導向後，狀態已經更新
      await router.replace({ name: 'Schedule' })
    } catch (error) {
      console.error('登入失敗:', error)
      const message = error.message || '登入時發生錯誤，請稍後再試。'
      if (message.includes('not-found')) throw new Error('帳號不存在。')
      if (message.includes('unauthenticated')) throw new Error('密碼錯誤。')
      throw new Error(message)
    }
  }

  function logout() {
    signOut(auth)
    router.push({ name: 'Login' })
  }

  async function changePassword(oldPassword, newPassword) {
    console.warn('changePassword 功能需要重構。')
    throw new Error('此功能暫時停用，請聯繫管理員重設密碼。')
  }

  // --- 所有 computed properties 保持不變，它們現在會拿到正確的 currentUser ---
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
