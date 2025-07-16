// src/composables/useErrorHandler.js
import { ref } from 'vue'
import { useNotification } from './useNotification.js'

const { addNotification } = useNotification()

// 全局錯誤狀態
const globalErrors = ref([])
const isLoading = ref(false)

export function useErrorHandler() {
  /**
   * 統一的 API 錯誤處理函式
   * @param {Function} apiCall - API 呼叫函式
   * @param {Object} options - 選項
   */
  const handleApiCall = async (apiCall, options = {}) => {
    const {
      loadingMessage = '處理中...',
      successMessage = null,
      errorPrefix = '操作失敗',
      showNotification = true,
      retryCount = 3,
      retryDelay = 1000,
    } = options

    isLoading.value = true

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`🔄 API call attempt ${attempt}/${retryCount}`)

        const result = await apiCall()

        if (successMessage && showNotification) {
          addNotification(successMessage, 'success')
        }

        isLoading.value = false
        return result
      } catch (error) {
        console.error(`❌ API call failed (attempt ${attempt}):`, error)

        // 最後一次嘗試失敗
        if (attempt === retryCount) {
          isLoading.value = false

          const errorMessage = getErrorMessage(error, errorPrefix)

          if (showNotification) {
            addNotification(errorMessage, 'error')
          }

          // 記錄到全局錯誤日誌
          logError(error, { apiCall: apiCall.name, attempts: attempt })

          throw new Error(errorMessage)
        }

        // 等待後重試
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt))
      }
    }
  }

  /**
   * 輸入驗證函式
   */
  const validateInput = (input, rules) => {
    const errors = []

    for (const rule of rules) {
      const result = rule.validator(input)
      if (!result.isValid) {
        errors.push(result.message)
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * 常用驗證規則
   */
  const validationRules = {
    required: (message = '此欄位為必填') => ({
      validator: (value) => ({
        isValid: value !== null && value !== undefined && value !== '',
        message,
      }),
    }),

    patientId: (message = '病人ID格式錯誤') => ({
      validator: (value) => ({
        isValid: /^[A-Z0-9]{6,12}$/.test(value),
        message,
      }),
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

  /**
   * Firebase 錯誤訊息轉換
   */
  const getErrorMessage = (error, prefix = '錯誤') => {
    if (typeof error === 'string') return `${prefix}: ${error}`

    const message = error?.message || error?.code || '未知錯誤'

    // Firebase 特定錯誤
    const firebaseErrors = {
      'permission-denied': '權限不足，請檢查登入狀態',
      'not-found': '找不到請求的資料',
      'already-exists': '資料已存在',
      'invalid-argument': '輸入參數有誤',
      'deadline-exceeded': '請求逾時，請檢查網路連線',
      unavailable: '服務暫時無法使用，請稍後再試',
    }

    for (const [code, msg] of Object.entries(firebaseErrors)) {
      if (message.includes(code)) {
        return `${prefix}: ${msg}`
      }
    }

    return `${prefix}: ${message}`
  }

  /**
   * 錯誤日誌記錄
   */
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

    // 保留最近 50 個錯誤
    if (globalErrors.value.length > 50) {
      globalErrors.value = globalErrors.value.slice(0, 50)
    }

    console.error('🔥 Error logged:', errorLog)
  }

  /**
   * 效能監控函式
   */
  const performanceMonitor = (name, fn) => {
    return async (...args) => {
      const startTime = performance.now()

      try {
        const result = await fn(...args)
        const endTime = performance.now()
        const duration = endTime - startTime

        console.log(`⏱️ ${name} completed in ${duration.toFixed(2)}ms`)

        // 如果執行時間超過 2 秒，記錄警告
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
    validateInput,
    validationRules,
    getErrorMessage,
    logError,
    performanceMonitor,
    globalErrors,
    isLoading,
  }
}
