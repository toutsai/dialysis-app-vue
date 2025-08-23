// src/composables/useAuth.js (修改為標準 Firebase Auth 模式 ✅)

import { ref, computed, readonly, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
// ✨ 我們不再需要 functions，但需要從 Firestore 讀取使用者資料 ✨
import { auth, db } from '@/composables/useFirebase.js'
import { doc, getDoc, onSnapshot } from 'firebase/firestore'

// ✨ 引入標準的 Firebase Auth 函式 ✨
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updatePassword as firebaseUpdatePassword, // 重新命名以避免衝突
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth'

import { useErrorHandler } from '@/composables/useErrorHandler.js'

// --- 全局狀態 ---
// currentUser 現在只儲存 Auth 提供的基本資訊
const currentUser = ref(null)
// userProfile 專門用來儲存從 Firestore 讀取的詳細資料 (role, title 等)
const userProfile = ref(null)
const authLoading = ref(true)

// --- 認證狀態監聽 (這是新架構的核心) ---
// onAuthStateChanged 會在登入、登出、頁面重載時自動執行
const unsubscribe = onAuthStateChanged(auth, async (user) => {
  authLoading.value = true
  if (user) {
    // 使用者已登入，儲存 Auth 基本資料
    currentUser.value = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
    }

    // ✨ 從 Firestore 讀取並即時監聽使用者的詳細設定檔 ✨
    const userDocRef = doc(db, 'users', user.uid)
    // 使用 onSnapshot 可以讓使用者資料 (例如角色) 在被管理員修改後即時更新
    onSnapshot(
      userDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          userProfile.value = { id: docSnap.id, ...docSnap.data() }
          console.log('✅ Auth state changed: User is logged in with profile.', userProfile.value)
        } else {
          // 這是一個異常情況：Auth 有使用者，但 Firestore 沒有對應資料
          console.error(`❌ Firestore 中找不到 UID 為 ${user.uid} 的使用者資料！`)
          userProfile.value = null
          signOut(auth) // 強制登出
        }
      },
      (error) => {
        console.error('❌ 監聽使用者資料時發生錯誤:', error)
        userProfile.value = null
        signOut(auth) // 強制登出
      },
    )
  } else {
    // 使用者已登出
    currentUser.value = null
    userProfile.value = null
    console.log('🚪 Auth state changed: User is logged out.')
  }
  authLoading.value = false
})

// --- 主要的 Composable 函式 ---
export function useAuth() {
  const router = useRouter()
  const { handleApiCall } = useErrorHandler()

  // 局部加載狀態
  const loginLoading = ref(false)
  const logoutLoading = ref(false)

  // --- 登入函式 (大幅簡化) ---
  const login = async (username, password) => {
    loginLoading.value = true
    const email = `${username}@example.com`

    try {
      await signInWithEmailAndPassword(auth, email, password)
      // 登入成功後，上面的 onAuthStateChanged 會自動處理使用者資料的載入
      const redirectPath = router.currentRoute.value.query.redirect || '/schedule'
      await router.replace(redirectPath)
    } catch (error) {
      console.error('[Auth] Login failed:', error)
      if (
        error.code === 'auth/user-not-found' ||
        error.code === 'auth/wrong-password' ||
        error.code === 'auth/invalid-credential'
      ) {
        throw new Error('使用者名稱或密碼錯誤。')
      }
      throw new Error('登入失敗，請稍後再試。')
    } finally {
      loginLoading.value = false
    }
  }

  // --- 登出函式 (小幅修改) ---
  const logout = async () => {
    logoutLoading.value = true
    try {
      await signOut(auth)
      // 登出後，onAuthStateChanged 會自動清理狀態
      await router.push({ name: 'Login' })
    } catch (error) {
      console.error('[Auth] Logout failed:', error)
    } finally {
      logoutLoading.value = false
    }
  }

  // --- 修改密碼函式 (使用標準 Firebase Auth 流程) ---
  const updatePassword = async (oldPassword, newPassword) => {
    if (!auth.currentUser) {
      throw new Error('使用者未登入，無法更改密碼。')
    }
    // 標準流程需要使用者先「重新驗證」自己，以策安全
    const user = auth.currentUser
    const credential = EmailAuthProvider.credential(user.email, oldPassword)

    return handleApiCall(
      async () => {
        await reauthenticateWithCredential(user, credential)
        await firebaseUpdatePassword(user, newPassword)
      },
      {
        loadingMessage: '正在更新密碼...',
        successMessage: '密碼已成功更新！',
        errorPrefix: '密碼更新失敗',
        showNotification: true,
      },
    )
  }

  // --- 權限判斷 (現在從 userProfile 讀取 role) ---
  const hasPermission = (requiredRole) => {
    if (!userProfile.value) return false
    const roleHierarchy = {
      viewer: 1,
      contributor: 2,
      editor: 3,
      admin: 4,
    }
    const userLevel = roleHierarchy[userProfile.value.role] || 0
    const requiredLevel = roleHierarchy[requiredRole] || 999
    return userLevel >= requiredLevel
  }

  // --- 計算屬性 (從 currentUser 和 userProfile 組合) ---
  const isLoggedIn = computed(() => !!currentUser.value && !!userProfile.value)
  const combinedUser = computed(() => {
    if (!isLoggedIn.value) return null
    return { ...currentUser.value, ...userProfile.value }
  })

  const isAnyLoading = computed(
    () => authLoading.value || loginLoading.value || logoutLoading.value,
  )
  const canManagePhysicianSchedule = computed(
    () => hasPermission('contributor') || hasPermission('admin'),
  )

  // 當 Vue 元件卸載時，停止監聽，避免記憶體洩漏
  onUnmounted(() => {
    if (unsubscribe) unsubscribe()
  })

  return {
    // 狀態
    currentUser: readonly(combinedUser), // 回傳組合後的使用者資訊
    isLoggedIn: readonly(isLoggedIn),
    authLoading: readonly(authLoading),

    // 方法
    login,
    logout,
    updatePassword,

    // 權限判斷
    hasPermission,
    canManagePhysicianSchedule,
  }
}
