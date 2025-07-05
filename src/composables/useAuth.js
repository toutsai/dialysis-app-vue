// 檔案路徑: src/composables/useAuth.js (完整版)

import { ref, computed } from 'vue'

// 模擬的用戶資料庫。在真實專案中，這裡會是 API 呼叫。
const USER_DATABASE = {
  editor: { password: '1234', role: 'editor', name: '廖醫師' },
  viewer: { password: '1234', role: 'viewer', name: '訪客護理師' },
  // 可以在這裡新增更多測試帳號
  // 'testuser': { password: 'password', role: 'editor', name: '測試人員' },
}

// 這是全局、單例的狀態，意味著在整個應用程式中，currentUser 只有一份。
const currentUser = ref(null)
const isLoggedIn = computed(() => !!currentUser.value)

// --- 狀態持久化核心 ---
// 應用程式一啟動，就立刻嘗試從瀏覽器的 localStorage 恢復登入狀態。
// 這確保了用戶刷新頁面後不需要重新登入。
const storedUser = localStorage.getItem('currentUser')
if (storedUser) {
  try {
    // 解析儲存的 JSON 字串，恢復用戶物件
    currentUser.value = JSON.parse(storedUser)
  } catch (e) {
    console.error('無法解析儲存的用戶資料，將其清除:', e)
    // 如果解析失敗（例如，儲存的資料格式錯誤），則清除它
    localStorage.removeItem('currentUser')
  }
}

/**
 * 處理登入邏輯。
 * @param {string} username - 用戶名
 * @param {string} password - 密碼
 * @returns {Promise<void>} - 登入成功時 resolve，失敗時 reject。
 */
export function login(username, password) {
  return new Promise((resolve, reject) => {
    // 在模擬資料庫中查找用戶
    const userInDb = USER_DATABASE[username]

    // 驗證用戶是否存在且密碼是否正確
    if (userInDb && userInDb.password === password) {
      const userToStore = {
        username: username,
        name: userInDb.name,
        role: userInDb.role,
      }
      // 更新全局的 currentUser 狀態
      currentUser.value = userToStore

      // 登入成功，將用戶資料（轉換為 JSON 字串）存入 localStorage
      localStorage.setItem('currentUser', JSON.stringify(userToStore))

      // 解決 Promise，表示登入成功
      resolve()
    } else {
      // 驗證失敗，拒絕 Promise 並返回錯誤訊息
      reject(new Error('帳號或密碼錯誤'))
    }
  })
}

/**
 * 處理登出邏輯。
 */
export function logout() {
  // 清除全局狀態
  currentUser.value = null
  // 清除 localStorage 中的用戶資料
  localStorage.removeItem('currentUser')

  // 強制跳轉到登入頁並刷新，這是最徹底的登出方式，
  // 可以確保所有頁面的狀態都被重置。
  window.location.href = '/login'
}

/**
 * useAuth 組合式函數。
 * 任何 Vue 元件都可以呼叫它來獲取當前的用戶狀態和權限。
 */
export function useAuth() {
  // 計算屬性：判斷當前用戶是否為「僅檢視」權限。
  // 未登入或角色為 'viewer' 都視為唯讀。
  const isReadOnly = computed(() => {
    return !isLoggedIn.value || (isLoggedIn.value && currentUser.value.role === 'viewer')
  })

  // 返回所有需要被外部使用的狀態和函式
  return {
    isLoggedIn,
    currentUser,
    isReadOnly,
    login,
    logout,
  }
}
