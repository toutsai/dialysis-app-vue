import { useCallback, useRef } from 'react'

// ============================================================
// Types
// ============================================================

interface ValidationRule {
  validate: (value: unknown) => boolean
  message: string
}

interface HandleApiCallOptions {
  operationName?: string
  showNotification?: boolean
  retryCount?: number
  retryDelay?: number
  onSuccess?: (data: unknown) => void
  onError?: (error: Error) => void
  silentError?: boolean
}

interface ApiCallResult<T> {
  data: T | null
  error: Error | null
  success: boolean
  duration: number
}

// ============================================================
// Firebase Error Message Mapping
// ============================================================

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  'auth/user-not-found': '找不到此使用者',
  'auth/wrong-password': '密碼錯誤',
  'auth/email-already-in-use': '此電子郵件已被使用',
  'auth/weak-password': '密碼強度不足，請使用至少 6 個字元',
  'auth/invalid-email': '電子郵件格式不正確',
  'auth/user-disabled': '此帳號已被停用',
  'auth/too-many-requests': '登入嘗試次數過多，請稍後再試',
  'auth/network-request-failed': '網路連線失敗，請檢查網路',
  'auth/invalid-credential': '登入憑證無效或已過期',
  'auth/operation-not-allowed': '此操作不被允許',
  'auth/requires-recent-login': '此操作需要重新登入',
  'auth/invalid-custom-token': '自訂令牌無效',
  'auth/custom-token-mismatch': '自訂令牌與專案不符',
  'permission-denied': '您沒有權限執行此操作',
  'not-found': '找不到請求的資源',
  'already-exists': '資源已存在',
  'resource-exhausted': '已超過配額限制，請稍後再試',
  unavailable: '服務暫時無法使用，請稍後再試',
  'deadline-exceeded': '操作逾時，請稍後再試',
  cancelled: '操作已被取消',
  'data-loss': '資料遺失或損毀',
  internal: '內部錯誤，請聯絡管理員',
  unauthenticated: '請先登入',
}

const PERFORMANCE_WARNING_THRESHOLD_MS = 2000

// ============================================================
// Validation Rules Factory
// ============================================================

export const validationRules = {
  required: (message = '此欄位為必填'): ValidationRule => ({
    validate: (value: unknown) => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string') return value.trim().length > 0
      if (Array.isArray(value)) return value.length > 0
      return true
    },
    message,
  }),

  minLength: (min: number, message?: string): ValidationRule => ({
    validate: (value: unknown) => {
      if (typeof value !== 'string') return false
      return value.length >= min
    },
    message: message || `長度不得少於 ${min} 個字元`,
  }),

  maxLength: (max: number, message?: string): ValidationRule => ({
    validate: (value: unknown) => {
      if (typeof value !== 'string') return false
      return value.length <= max
    },
    message: message || `長度不得超過 ${max} 個字元`,
  }),

  pattern: (regex: RegExp, message = '格式不正確'): ValidationRule => ({
    validate: (value: unknown) => {
      if (typeof value !== 'string') return false
      return regex.test(value)
    },
    message,
  }),

  email: (message = '請輸入有效的電子郵件'): ValidationRule => ({
    validate: (value: unknown) => {
      if (typeof value !== 'string') return false
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    },
    message,
  }),

  numeric: (message = '請輸入數字'): ValidationRule => ({
    validate: (value: unknown) => {
      if (value === null || value === undefined || value === '') return false
      return !isNaN(Number(value))
    },
    message,
  }),
}

// ============================================================
// Error message extraction
// ============================================================

function getFirebaseErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const err = error as { code?: string; message?: string; details?: { message?: string } }

    if (err.code && FIREBASE_ERROR_MESSAGES[err.code]) {
      return FIREBASE_ERROR_MESSAGES[err.code]
    }

    if (err.details?.message) {
      return err.details.message
    }

    if (err.message) {
      const codeMatch = err.message.match(/\(([^)]+)\)/)
      if (codeMatch && FIREBASE_ERROR_MESSAGES[codeMatch[1]]) {
        return FIREBASE_ERROR_MESSAGES[codeMatch[1]]
      }
      return err.message
    }
  }

  if (typeof error === 'string') {
    return error
  }

  return '發生未知錯誤，請稍後再試'
}

// ============================================================
// Validate input
// ============================================================

export function validateInput(value: unknown, rules: ValidationRule[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const rule of rules) {
    if (!rule.validate(value)) {
      errors.push(rule.message)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ============================================================
// Hook
// ============================================================

export function useErrorHandler() {
  const activeCallsRef = useRef<Set<string>>(new Set())

  const handleApiCall = useCallback(
    async <T>(
      apiCallFn: () => Promise<T>,
      options: HandleApiCallOptions = {},
    ): Promise<ApiCallResult<T>> => {
      const {
        operationName = 'API Call',
        retryCount = 0,
        retryDelay = 1000,
        onSuccess,
        onError,
        silentError = false,
      } = options

      const callId = `${operationName}-${Date.now()}`
      activeCallsRef.current.add(callId)

      const startTime = performance.now()
      let lastError: Error | null = null

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[ErrorHandler] Retrying "${operationName}" (attempt ${attempt + 1}/${retryCount + 1})...`)
            await new Promise<void>((resolve) => setTimeout(resolve, retryDelay * attempt))
          }

          const data = await apiCallFn()
          const duration = performance.now() - startTime

          if (duration > PERFORMANCE_WARNING_THRESHOLD_MS) {
            console.warn(
              `[Performance] "${operationName}" took ${duration.toFixed(0)}ms (threshold: ${PERFORMANCE_WARNING_THRESHOLD_MS}ms)`,
            )
          }

          activeCallsRef.current.delete(callId)

          if (onSuccess) {
            onSuccess(data)
          }

          return {
            data,
            error: null,
            success: true,
            duration,
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error))

          if (attempt === retryCount) {
            const duration = performance.now() - startTime
            const friendlyMessage = getFirebaseErrorMessage(error)

            if (!silentError) {
              console.error(`[ErrorHandler] "${operationName}" failed after ${attempt + 1} attempt(s):`, friendlyMessage)
            }

            activeCallsRef.current.delete(callId)

            if (onError) {
              onError(new Error(friendlyMessage))
            }

            return {
              data: null,
              error: new Error(friendlyMessage),
              success: false,
              duration,
            }
          }
        }
      }

      activeCallsRef.current.delete(callId)
      return {
        data: null,
        error: lastError,
        success: false,
        duration: performance.now() - startTime,
      }
    },
    [],
  )

  return {
    handleApiCall,
    validateInput,
    validationRules,
    getFirebaseErrorMessage,
  }
}

export { getFirebaseErrorMessage }
