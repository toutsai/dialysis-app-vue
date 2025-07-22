// 檔案路徑: src/services/optimizedApiService.js
import ApiManager from '@/services/api_manager.js'

// ============================================
// 快取系統
// ============================================
const cache = new Map()
const CACHE_TTL = 30000 // 30秒快取過期時間

function getCacheKey(operation, collection, id = null) {
  return `${operation}:${collection}${id ? `:${id}` : ''}`
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now(),
  })
}

function getCache(key) {
  const cached = cache.get(key)
  if (!cached) return null

  const isExpired = Date.now() - cached.timestamp > CACHE_TTL
  if (isExpired) {
    cache.delete(key)
    return null
  }

  return cached.data
}

function clearCacheByPattern(pattern) {
  const keysToDelete = []
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      keysToDelete.push(key)
    }
  }
  keysToDelete.forEach((key) => cache.delete(key))
}

// ============================================
// 批次處理系統
// ============================================
const batchQueue = new Map()
const BATCH_DELAY = 50 // 50ms 批次延遲

function addToBatch(operation, collection, id, data) {
  const batchKey = `${operation}:${collection}`

  if (!batchQueue.has(batchKey)) {
    batchQueue.set(batchKey, {
      items: [],
      timeout: null,
    })
  }

  const batch = batchQueue.get(batchKey)
  batch.items.push({ id, data })

  if (batch.timeout) {
    clearTimeout(batch.timeout)
  }

  batch.timeout = setTimeout(() => {
    processBatch(operation, collection, batch.items)
    batchQueue.delete(batchKey)
  }, BATCH_DELAY)
}

async function processBatch(operation, collection, items) {
  const api = ApiManager(collection)
  const startTime = performance.now()

  try {
    console.log(`🚀 [Batch] 開始處理 ${operation} 批次操作 (${items.length} 項目)`)

    if (operation === 'update') {
      await Promise.all(items.map((item) => api.update(item.id, item.data)))
    } else if (operation === 'save') {
      await Promise.all(items.map((item) => api.save(item.data)))
    } else if (operation === 'delete') {
      await Promise.all(items.map((item) => api.delete(item.id)))
    }

    const endTime = performance.now()
    console.log(`✅ [Batch] ${operation} 批次操作完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    // 清除相關快取
    clearCacheByPattern(collection)
  } catch (error) {
    console.error(`❌ [Batch] ${operation} 批次操作失敗:`, error)
    throw error
  }
}

// ============================================
// 🔧 資料驗證輔助函數（移除所有格式驗證）
// ============================================

/**
 * 基礎資料清理 - 只做必要的清理，不做格式驗證
 */
function sanitizePatientData(patientData) {
  const cleaned = { ...patientData }

  if (cleaned.medicalRecordNumber) {
    cleaned.medicalRecordNumber = cleaned.medicalRecordNumber.toString().trim()
  }

  if (cleaned.name) {
    cleaned.name = cleaned.name.toString().trim()
  }

  console.log('🧹 [API] 資料清理完成，無格式驗證')
  return cleaned
}

/**
 * 基礎資料驗證 - 只檢查必填欄位，不檢查格式
 */
function validatePatientData(patientData) {
  const errors = []

  if (!patientData.medicalRecordNumber || !patientData.medicalRecordNumber.trim()) {
    errors.push('病歷號不能為空')
  }

  if (!patientData.name || !patientData.name.trim()) {
    errors.push('病人姓名不能為空')
  }

  if (errors.length > 0) {
    console.log('❌ [API] 基礎驗證失敗:', errors)
    throw new Error(errors.join(', '))
  }

  console.log('✅ [API] 基礎驗證通過，無格式限制')
}

// ============================================
// 排程相關優化函式 (從 ScheduleView.vue 遷移過來)
// ============================================

/**
 * 優化的排程資料載入 - [核心修改] 移除快取，並支援查詢條件
 */
export async function fetchAllSchedules(queries = []) {
  const startTime = performance.now()
  console.log('🔄 [API] 直接從 Firestore 載入排程資料...')

  try {
    const api = ApiManager('schedules')
    // 直接傳遞查詢條件給底層 API
    const data = await api.fetchAll(queries)

    const endTime = performance.now()
    console.log(
      `✅ [API] 排程載入完成，共 ${data.length} 筆，耗時 ${(endTime - startTime).toFixed(2)}ms`,
    )

    // 不再設定快取
    return data
  } catch (error) {
    console.error('❌ [API] 排程載入失敗:', error)
    throw error
  }
}

/**
 * 優化的排程資料儲存
 */
export async function saveSchedule(scheduleData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存排程資料...', scheduleData.id || '新建')

  try {
    const api = ApiManager('schedules')
    const result = await api.save(scheduleData)

    const endTime = performance.now()
    console.log(`✅ [API] 排程儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    // 清除排程相關快取 (保留以防萬一有其他地方使用)
    clearCacheByPattern('schedules')

    return result
  } catch (error) {
    console.error('❌ [API] 排程儲存失敗:', error)
    throw error
  }
}

/**
 * 優化的排程資料更新
 */
export async function updateSchedule(scheduleId, updateData) {
  const startTime = performance.now()
  console.log('🔄 [API] 更新排程資料...', scheduleId)

  try {
    const api = ApiManager('schedules')
    await api.update(scheduleId, updateData)

    const endTime = performance.now()
    console.log(`✅ [API] 排程更新完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    // 清除排程相關快取 (保留以防萬一有其他地方使用)
    clearCacheByPattern('schedules')
  } catch (error) {
    console.error('❌ [API] 排程更新失敗:', error)
    throw error
  }
}

// ============================================
// 患者相關優化函式 - 🔧 移除所有ID格式驗證
// ============================================

/**
 * 優化的患者資料載入
 */
export async function fetchAllPatients() {
  const cacheKey = getCacheKey('fetchAll', 'patients')
  const cached = getCache(cacheKey)

  if (cached) {
    console.log('📦 [Cache Hit] 使用快取的患者資料')
    return cached
  }

  const startTime = performance.now()
  console.log('🔄 [API] 開始載入患者資料...')

  try {
    const api = ApiManager('patients')
    const data = await api.fetchAll()

    const endTime = performance.now()
    console.log(
      `✅ [API] 患者載入完成，共 ${data.length} 位，耗時 ${(endTime - startTime).toFixed(2)}ms`,
    )

    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.error('❌ [API] 患者載入失敗:', error)
    throw error
  }
}

/**
 * 優化的患者資料儲存 - 🔧 移除ID格式驗證
 */
export async function savePatient(patientData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存患者資料...', patientData.name || '未命名')
  console.log('🔧 [API] 病歷號:', patientData.medicalRecordNumber, '(無格式限制)')

  try {
    const cleanedData = sanitizePatientData(patientData)
    validatePatientData(cleanedData)

    const api = ApiManager('patients')
    const result = await api.save(cleanedData)

    const endTime = performance.now()
    console.log(`✅ [API] 患者儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    clearCacheByPattern('patients')

    return result
  } catch (error) {
    console.error('❌ [API] 患者儲存失敗:', error)
    throw error
  }
}

/**
 * 優化的患者資料更新 - 🔧 移除ID格式驗證
 */
export async function updatePatient(patientId, updateData) {
  const startTime = performance.now()
  console.log('🔄 [API] 更新患者資料...', patientId)
  console.log('🔧 [API] 更新資料:', updateData)

  try {
    const cleanedData = { ...updateData }

    if (cleanedData.medicalRecordNumber) {
      cleanedData.medicalRecordNumber = cleanedData.medicalRecordNumber.toString().trim()
      console.log('🔧 [API] 病歷號已清理:', cleanedData.medicalRecordNumber, '(無格式限制)')
    }

    const api = ApiManager('patients')
    await api.update(patientId, cleanedData)

    const endTime = performance.now()
    console.log(`✅ [API] 患者更新完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    clearCacheByPattern('patients')
  } catch (error) {
    console.error('❌ [API] 患者更新失敗:', error)
    throw error
  }
}

// ============================================
// 備忘錄相關優化函式
// ============================================

/**
 * 優化的備忘錄資料載入
 */
export async function fetchAllMemos(queryConstraints = null) {
  const cacheKey = getCacheKey('fetchAll', 'memos')
  const cached = getCache(cacheKey)

  if (cached && !queryConstraints) {
    console.log('📦 [Cache Hit] 使用快取的備忘錄資料')
    return cached
  }

  const startTime = performance.now()
  console.log('🔄 [API] 開始載入備忘錄資料...')

  try {
    const api = ApiManager('memos')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()

    const endTime = performance.now()
    console.log(
      `✅ [API] 備忘錄載入完成，共 ${data.length} 筆，耗時 ${(endTime - startTime).toFixed(2)}ms`,
    )

    if (!queryConstraints) {
      setCache(cacheKey, data)
    }
    return data
  } catch (error) {
    console.error('❌ [API] 備忘錄載入失敗:', error)
    throw error
  }
}

/**
 * 優化的備忘錄儲存
 */
export async function saveMemo(memoData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存備忘錄...', memoData.title)

  try {
    const api = ApiManager('memos')
    const result = await api.save(memoData)

    const endTime = performance.now()
    console.log(`✅ [API] 備忘錄儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    clearCacheByPattern('memos')

    return result
  } catch (error) {
    console.error('❌ [API] 備忘錄儲存失敗:', error)
    throw error
  }
}

/**
 * 優化的備忘錄更新
 */
export async function updateMemo(memoId, updateData) {
  const startTime = performance.now()
  console.log('🔄 [API] 更新備忘錄...', memoId)

  try {
    const api = ApiManager('memos')
    await api.update(memoId, updateData)

    const endTime = performance.now()
    console.log(`✅ [API] 備忘錄更新完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    clearCacheByPattern('memos')
  } catch (error) {
    console.error('❌ [API] 備忘錄更新失敗:', error)
    throw error
  }
}

/**
 * 優化的備忘錄刪除
 */
export async function deleteMemo(memoId) {
  const startTime = performance.now()
  console.log('🗑️ [API] 刪除備忘錄...', memoId)

  try {
    const api = ApiManager('memos')
    await api.delete(memoId)

    const endTime = performance.now()
    console.log(`✅ [API] 備忘錄刪除完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    clearCacheByPattern('memos')
  } catch (error) {
    console.error('❌ [API] 備忘錄刪除失敗:', error)
    throw error
  }
}

// ============================================
// 透析醫囑歷史相關優化函式 (修正權限問題)
// ============================================

/**
 * 優化的透析醫囑歷史載入
 */
export async function fetchDialysisOrderHistory(queryConstraints = null) {
  const startTime = performance.now()
  console.log('🔄 [API] 開始載入透析醫囑歷史...')

  try {
    const api = ApiManager('dialysis_orders_history')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()

    const endTime = performance.now()
    console.log(
      `✅ [API] 透析醫囑歷史載入完成，共 ${data.length} 筆，耗時 ${(endTime - startTime).toFixed(2)}ms`,
    )

    return data
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史載入失敗:', error)
    throw error
  }
}

/**
 * 優化的透析醫囑歷史儲存
 */
export async function saveDialysisOrderHistory(historyData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存透析醫囑歷史...', historyData.patientName)

  try {
    const api = ApiManager('dialysis_orders_history')

    const completeData = {
      ...historyData,
      createdAt: historyData.createdAt || new Date().toISOString(),
      updatedAt: historyData.updatedAt || new Date().toISOString(),
      operationType: historyData.operationType || 'CREATE',
    }

    const result = await api.save(completeData)

    const endTime = performance.now()
    console.log(`✅ [API] 透析醫囑歷史儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    return result
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史儲存失敗:', error)
    throw error
  }
}

/**
 * 優化的透析醫囑歷史刪除 (修正權限問題)
 */
export async function deleteDialysisOrderHistory(historyId) {
  const startTime = performance.now()
  console.log('🗑️ [API] 刪除透析醫囑歷史...', historyId)

  try {
    const api = ApiManager('dialysis_orders_history')

    console.log('🔍 [API] 檢查刪除權限...')

    await api.delete(historyId)

    const endTime = performance.now()
    console.log(`✅ [API] 透析醫囑歷史刪除完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史刪除失敗:', error)

    if (error.code === 'permission-denied') {
      throw new Error('權限不足：無法刪除此透析醫囑歷史記錄')
    } else if (error.code === 'not-found') {
      throw new Error('記錄不存在：此透析醫囑歷史記錄可能已被刪除')
    } else {
      throw new Error(`刪除失敗：${error.message}`)
    }
  }
}

// ============================================
// 患者歷史相關優化函式
// ============================================

/**
 * 優化的患者歷史載入
 */
export async function fetchPatientHistory(queryConstraints = null) {
  const startTime = performance.now()
  console.log('🔄 [API] 開始載入患者歷史...')

  try {
    const api = ApiManager('patient_history')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()

    const endTime = performance.now()
    console.log(
      `✅ [API] 患者歷史載入完成，共 ${data.length} 筆，耗時 ${(endTime - startTime).toFixed(2)}ms`,
    )

    return data
  } catch (error) {
    console.error('❌ [API] 患者歷史載入失敗:', error)
    throw error
  }
}

/**
 * 優化的患者歷史儲存
 */
export async function savePatientHistory(historyData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存患者歷史...', historyData.patientName)

  try {
    const api = ApiManager('patient_history')
    const result = await api.save(historyData)

    const endTime = performance.now()
    console.log(`✅ [API] 患者歷史儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)

    return result
  } catch (error) {
    console.error('❌ [API] 患者歷史儲存失敗:', error)
    throw error
  }
}

// ============================================
// 快取管理功能
// ============================================

/**
 * 清除所有快取
 */
export function clearAllCache() {
  const size = cache.size
  cache.clear()
  console.log(`🧹 [Cache] 已清除所有快取 (${size} 項目)`)
}

/**
 * 清除特定集合的快取
 */
export function clearCacheByCollection(collection) {
  clearCacheByPattern(collection)
  console.log(`🧹 [Cache] 已清除 ${collection} 相關快取`)
}

/**
 * 獲取快取統計
 */
export function getCacheStats() {
  const stats = {
    totalItems: cache.size,
    collections: {},
  }

  for (const key of cache.keys()) {
    const collection = key.split(':')[1]
    if (!stats.collections[collection]) {
      stats.collections[collection] = 0
    }
    stats.collections[collection]++
  }

  return stats
}

// ============================================
// 批次操作功能
// ============================================

/**
 * 批次更新患者
 */
export function batchUpdatePatients(updates) {
  updates.forEach(({ id, data }) => {
    addToBatch('update', 'patients', id, data)
  })
}

/**
 * 批次更新排程
 */
export function batchUpdateSchedules(updates) {
  updates.forEach(({ id, data }) => {
    addToBatch('update', 'schedules', id, data)
  })
}

/**
 * 批次儲存備忘錄
 */
export function batchSaveMemos(memos) {
  memos.forEach((data) => {
    addToBatch('save', 'memos', null, data)
  })
}

export default {
  // 排程相關
  fetchAllSchedules,
  saveSchedule,
  updateSchedule,

  // 患者相關
  fetchAllPatients,
  savePatient,
  updatePatient,

  // 備忘錄相關
  fetchAllMemos,
  saveMemo,
  updateMemo,
  deleteMemo,

  // 透析醫囑歷史相關
  fetchDialysisOrderHistory,
  saveDialysisOrderHistory,
  deleteDialysisOrderHistory,

  // 患者歷史相關
  fetchPatientHistory,
  savePatientHistory,

  // 快取管理
  clearAllCache,
  clearCacheByCollection,
  getCacheStats,

  // 批次操作
  batchUpdatePatients,
  batchUpdateSchedules,
  batchSaveMemos,
}
