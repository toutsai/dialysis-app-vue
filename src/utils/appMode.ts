/**
 * 應用程式模式工具
 * 用於檢測當前運行模式 (Firebase 或 Standalone)
 */

export type AppMode = 'firebase' | 'standalone'

/**
 * 取得當前應用程式模式
 */
export function getAppMode(): AppMode {
  const env = import.meta.env.VITE_APP_ENV
  return env === 'standalone' ? 'standalone' : 'firebase'
}

/**
 * 是否為單機模式
 */
export function isStandaloneMode(): boolean {
  return getAppMode() === 'standalone'
}

/**
 * 是否為 Firebase 模式
 */
export function isFirebaseMode(): boolean {
  return getAppMode() === 'firebase'
}

/**
 * 取得 API 基礎 URL (僅單機模式)
 */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3000/api'
}

/**
 * 記錄當前模式
 */
export function logAppMode(): void {
  const mode = getAppMode()
  if (mode === 'standalone') {
    console.log('🖥️ 運行模式: 單機離線模式 (Standalone)')
    console.log(`📍 API 位址: ${getApiBaseUrl()}`)
  } else {
    console.log(`🌐 運行模式: Firebase 雲端模式`)
    console.log(`📍 專案: ${import.meta.env.VITE_FIREBASE_PROJECT_ID}`)
  }
}
