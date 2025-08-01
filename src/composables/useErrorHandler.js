// 檔案路徑: src/composables/useErrorHandler.js (最終統一版)
import { ref } from 'vue'
// ✨ 1. 引入【唯一的】、合併後的即時通知系統
import { useRealtimeNotifications } from './useRealtimeNotifications.js'

export function useErrorHandler() {
  // ✨ 2. 從唯一的系統中獲取【本地通知】函式
  // 我們用它來顯示成功或失敗的訊息
  const { addLocalNotification } = useRealtimeNotifications()

  const globalErrors = ref([])
  const isLoading = ref(false)

  const handleApiCall = async (apiCall, options = {}) => {
    const {
      successMessage = null,
      errorPrefix = '操作失敗',
      showNotification = true,
      retryCount = 1, // API 通常不需要重試太多次，設為 1 表示不重試
      retryDelay = 1000,
    } = options

    isLoading.value = true

    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        const result = await apiCall()

        if (successMessage && showNotification) {
          // ✨ 3. 呼叫 addLocalNotification 來顯示【成功】訊息
          // 成功訊息我們使用 'team' (綠色) 類型
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
            // ✨ 4. 呼叫 addLocalNotification 來顯示【錯誤】訊息
            // 我們使用 'conflict' (紅色) 類型來表示錯誤
            addLocalNotification(errorMessage, 'conflict')
          }

          logError(error, { apiCall: apiCall.name, attempts: attempt })
          throw new Error(errorMessage)
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay * attempt))
      }
    }
  }

  const getErrorMessage = (error, prefix = '錯誤') => {
    if (typeof error === 'string') return `${prefix}: ${error}`
    const message = error?.message || error?.code || '未知錯誤'
    const firebaseErrors = {
      'permission-denied': '權限不足',
      'not-found': '找不到資料',
      'already-exists': '資料已存在',
      'invalid-argument': '輸入參數有誤',
      'deadline-exceeded': '請求逾時',
      unavailable: '服務暫時無法使用',
    }
    for (const [code, msg] of Object.entries(firebaseErrors)) {
      if (message.includes(code)) {
        return `${prefix}: ${msg}`
      }
    }
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
