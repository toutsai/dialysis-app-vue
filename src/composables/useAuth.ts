/**
 * 認證 Composable - 統一入口
 * 根據環境自動選擇 Firebase 或 Standalone 認證方式
 *
 * 注意：這個檔案會同時引入兩種認證實作，
 * 但只會使用其中一種（根據 VITE_APP_ENV 決定）。
 * 在單機模式打包時，Firebase 相關程式碼會因為不使用而被移除。
 */

import { isStandaloneMode } from '@/utils/appMode'
import { useAuthStandalone } from './useAuthStandalone'
import { useAuthFirebase } from './useAuthFirebase'

// 匯出型別
export interface AppUser {
  id: string
  uid: string
  name: string
  role: string
  title: string
  email: string | null
  lastLogin: string
}

// 在模組載入時就決定使用哪種認證
const _isStandalone = isStandaloneMode()

if (_isStandalone) {
  console.log('🔐 [Auth] 使用單機認證模式')
} else {
  console.log('🔐 [Auth] 使用 Firebase 認證模式')
}

/**
 * 統一的認證 Composable
 * 自動根據環境選擇 Firebase 或 Standalone 認證方式
 */
export function useAuth() {
  return _isStandalone ? useAuthStandalone() : useAuthFirebase()
}
