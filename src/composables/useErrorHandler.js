// 檔案路徑: src/composables/useErrorHandler.js (最終修正版 - 確保 error.code 被傳遞)

import { ref } from 'vue'
import { useRealtimeNotifications } from './useRealtimeNotifications.js'

export function useErrorHandler() {
  const { addLocalNotification } = useRealtimeNotifications()

  const globalErrors = ref([])
  const isLoading = ref(false)

  const handleApiCall = async (apiCall, options = {}) => {
    const {
      successMessage = null,
      errorPrefix = '操作失敗',
      showNotification = true,
      retryCount = 1,
      retryDelay = 1000,
    } = options

    isLoading.value = true

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const result = await apiCall()

        if (successMessage && showNotification) {
          addLocalNotification(successMessage, 'team')
        }

        isLoading.value = false
        return result
      } catch (error) {
        console.error(`❌ API call failed (attempt ${attempt}):`, error)

        if (attempt === retryCount) {
          isLoading.value = false
          const errorMessage = getErrorMessage(error, errorPrefix)

          if (showNotification) {
            addLocalNotification(errorMessage, 'conflict')
          }

          logError(error, { apiCall: apiCall.name, attempts: attempt })

          // =========================================================
          // 【核心修正】
          // 1. 建立一個新的錯誤物件
          const customError = new Error(errorMessage)
          // 2. 將原始 Firebase 錯誤的 .code 屬性複製過來
          customError.code = error.code
          // 3. 拋出這個帶有 .code 的新錯誤物件
          throw customError
          // =========================================================
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt))
      }
    }
  }

  const getErrorMessage = (error, prefix = '錯誤') => {
    if (typeof error === 'string') return `${prefix}: ${error}`

    // 優化：直接從 error.code 映射，更精確
    const firebaseErrors = {
      'auth/user-not-found': '找不到此使用者。',
      'auth/wrong-password': '密碼不正確。',
      'auth/invalid-email': '電子郵件格式無效。',
      'auth/email-already-in-use': '此電子郵件已被註冊。',
      'auth/requires-recent-login': '此操作需要重新登入以確保安全。',
      'permission-denied': '權限不足',
      'not-found': '找不到資料',
      'already-exists': '資料已存在',
      'invalid-argument': '輸入參數有誤',
      'deadline-exceeded': '請求逾時',
      unavailable: '服務暫時無法使用',
    }

    // 如果 error.code 能直接對應到我們的列表，就優先使用它
    if (error.code && firebaseErrors[error.code]) {
      return `${prefix}: ${firebaseErrors[error.code]}`
    }

    // 否則，使用原始的 message 或 code
    const message = error?.message || error?.code || '未知錯誤'
    return `${prefix}: ${message}`
  }

  const logError = (error, context = {}) => {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: {
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        code: error?.code,
      },
      context,
      userAgent: navigator.userAgent,
      url: window.location.href,
    }
    globalErrors.value.unshift(errorLog)
    if (globalErrors.value.length > 50) {
      globalErrors.value = globalErrors.value.slice(0, 50)
    }
    console.error('🔥 Error logged:', errorLog)
  }

  // (validateInput, validationRules, performanceMonitor 等函式保持不變)
  const validateInput = (input, rules) => {
    const errors = []
    for (const rule of rules) {
      const result = rule.validator(input)
      if (!result.isValid) {
        errors.push(result.message)
      }
    }
    return { isValid: errors.length === 0, errors }
  }

  const validationRules = {
    required: (message = '此欄位為必填') => ({
      validator: (value) => ({
        isValid: value !== null && value !== undefined && value !== '',
        message,
      }),
    }),
    patientId: (message = '病人ID格式錯誤') => ({
      validator: (value) => ({ isValid: /^[A-Z0-9]{6,12}$/.test(value), message }),
    }),
    date: (message = '日期格式錯誤') => ({
      validator: (value) => ({
        isValid: /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(new Date(value)),
        message,
      }),
    }),
    phoneNumber: (message = '電話號碼格式錯誤') => ({
      validator: (value) => ({
        isValid: /^[0-9-+\s()]+$/.test(value) && value.length >= 8,
        message,
      }),
    }),
  }

  const performanceMonitor = (name, fn) => {
    return async (...args) => {
      const startTime = performance.now()
      try {
        const result = await fn(...args)
        const endTime = performance.now()
        const duration = endTime - startTime
        console.log(`⏱️ ${name} completed in ${duration.toFixed(2)}ms`)
        if (duration > 2000) {
          console.warn(`🐌 Slow operation detected: ${name} took ${duration.toFixed(2)}ms`)
          logError(new Error(`Slow operation: ${name}`), { duration, name })
        }
        return result
      } catch (error) {
        const endTime = performance.now()
        const duration = endTime - startTime
        console.error(`❌ ${name} failed after ${duration.toFixed(2)}ms:`, error)
        logError(error, { duration, name, args })
        throw error
      }
    }
  }

  return {
    handleApiCall,
    getErrorMessage,
    logError,
    validateInput,
    validationRules,
    performanceMonitor,
    globalErrors,
    isLoading,
  }
}
