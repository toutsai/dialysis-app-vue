// 檔案路徑: src/services/optimizedApiService.js (最終完整修正版)
import ApiManager from '@/services/api_manager.js'
import { serverTimestamp } from 'firebase/firestore' // ✨ 1. 新增此行引入

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

    clearCacheByPattern(collection)
  } catch (error) {
    console.error(`❌ [Batch] ${operation} 批次操作失敗:`, error)
    throw error
  }
}

// ============================================
// 資料驗證輔助函數
// ============================================
function sanitizePatientData(patientData) {
  const cleaned = { ...patientData }
  if (cleaned.medicalRecordNumber) {
    cleaned.medicalRecordNumber = cleaned.medicalRecordNumber.toString().trim()
  }
  if (cleaned.name) {
    cleaned.name = cleaned.name.toString().trim()
  }
  return cleaned
}

function validatePatientData(patientData) {
  const errors = []
  if (!patientData.medicalRecordNumber || !patientData.medicalRecordNumber.trim()) {
    errors.push('病歷號不能為空')
  }
  if (!patientData.name || !patientData.name.trim()) {
    errors.push('病人姓名不能為空')
  }
  if (errors.length > 0) {
    throw new Error(errors.join(', '))
  }
}

// ============================================
// 排程相關優化函式
// ============================================
export async function fetchAllSchedules(queries = []) {
  try {
    const api = ApiManager('schedules')
    const data = await api.fetchAll(queries)
    return data
  } catch (error) {
    console.error('❌ [API] 排程載入失敗:', error)
    throw error
  }
}

export async function saveSchedule(scheduleData) {
  try {
    const api = ApiManager('schedules')
    const result = await api.save(scheduleData)
    clearCacheByPattern('schedules')
    return result
  } catch (error) {
    console.error('❌ [API] 排程儲存失敗:', error)
    throw error
  }
}

export async function updateSchedule(scheduleId, updateData) {
  try {
    const api = ApiManager('schedules')
    await api.update(scheduleId, updateData)
    clearCacheByPattern('schedules')
  } catch (error) {
    console.error('❌ [API] 排程更新失敗:', error)
    throw error
  }
}

// ============================================
// 患者相關優化函式
// ============================================
export async function fetchAllPatients() {
  const cacheKey = getCacheKey('fetchAll', 'patients')
  const cached = getCache(cacheKey)
  if (cached) {
    return cached
  }
  try {
    const api = ApiManager('patients')
    const data = await api.fetchAll()
    setCache(cacheKey, data)
    return data
  } catch (error) {
    console.error('❌ [API] 患者載入失敗:', error)
    throw error
  }
}

export async function savePatient(patientData) {
  try {
    const cleanedData = sanitizePatientData(patientData)
    validatePatientData(cleanedData)
    const api = ApiManager('patients')
    const result = await api.save(cleanedData)
    clearCacheByPattern('patients')
    return result
  } catch (error) {
    console.error('❌ [API] 患者儲存失敗:', error)
    throw error
  }
}

export async function updatePatient(patientId, updateData) {
  try {
    const api = ApiManager('patients')
    await api.update(patientId, updateData)
    clearCacheByPattern('patients')
  } catch (error) {
    console.error('❌ [API] 患者更新失敗:', error)
    throw error
  }
}

// ============================================
// 備忘錄相關優化函式
// ============================================
export async function fetchAllMemos(queryConstraints = null) {
  const cacheKey = getCacheKey('fetchAll', 'memos')
  const cached = getCache(cacheKey)
  if (cached && !queryConstraints) {
    return cached
  }
  try {
    const api = ApiManager('memos')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()
    if (!queryConstraints) {
      setCache(cacheKey, data)
    }
    return data
  } catch (error) {
    console.error('❌ [API] 備忘錄載入失敗:', error)
    throw error
  }
}

export async function saveMemo(memoData) {
  try {
    const api = ApiManager('memos')

    // [核心修正] 建立一個要寫入的最終物件
    // 直接在前端產生一個 ISO 標準格式的日期字串
    const dataToSave = {
      ...memoData,
      createdAt: new Date().toISOString(),
    }

    // 將包含 ISO 字串日期的物件存入資料庫
    const result = await api.save(dataToSave)

    clearCacheByPattern('memos')
    return result
  } catch (error) {
    console.error('❌ [API] 備忘錄儲存失敗:', error)
    throw error
  }
}

export async function updateMemo(memoId, updateData) {
  try {
    const api = ApiManager('memos')
    await api.update(memoId, updateData)
    clearCacheByPattern('memos')
  } catch (error) {
    console.error('❌ [API] 備忘錄更新失敗:', error)
    throw error
  }
}

export async function deleteMemo(memoId) {
  try {
    const api = ApiManager('memos')
    await api.delete(memoId)
    clearCacheByPattern('memos')
  } catch (error) {
    console.error('❌ [API] 備忘錄刪除失敗:', error)
    throw error
  }
}

// ============================================
// 例外規則相關優化函式 (Exception Rules)
// ============================================
export async function fetchAllExceptions(queryConstraints = []) {
  try {
    const api = ApiManager('schedule_exceptions')
    const data = await api.fetchAll(queryConstraints)
    return data
  } catch (error) {
    console.error('❌ [API] 例外規則載入失敗:', error)
    throw error
  }
}

/**
 * [*** 核心修正：新增此函式 ***]
 * 優化的例外規則儲存
 * @param {object} exceptionData - 要保存的例外規則物件。
 * @returns {Promise<object>} - 返回包含 id 和已保存資料的物件。
 */
export async function saveException(exceptionData) {
  const startTime = performance.now()
  console.log('💾 [API] 儲存例外規則...')
  try {
    const api = ApiManager('schedule_exceptions')
    const result = await api.save(exceptionData)
    const endTime = performance.now()
    console.log(`✅ [API] 例外規則儲存完成，耗時 ${(endTime - startTime).toFixed(2)}ms`)
    return result
  } catch (error) {
    console.error('❌ [API] 例外規則儲存失敗:', error)
    throw error
  }
}

export async function updateException(exceptionId, updateData) {
  try {
    const api = ApiManager('schedule_exceptions')
    await api.update(exceptionId, updateData)
  } catch (error) {
    console.error(`❌ [API] 例外規則更新失敗:`, error)
    throw error
  }
}

// ============================================
// 透析醫囑歷史相關優化函式
// ============================================
export async function fetchDialysisOrderHistory(queryConstraints = null) {
  try {
    const api = ApiManager('dialysis_orders_history')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()
    return data
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史載入失敗:', error)
    throw error
  }
}

export async function saveDialysisOrderHistory(historyData) {
  try {
    const api = ApiManager('dialysis_orders_history')
    const result = await api.save(historyData)
    return result
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史儲存失敗:', error)
    throw error
  }
}

export async function deleteDialysisOrderHistory(historyId) {
  try {
    const api = ApiManager('dialysis_orders_history')
    await api.delete(historyId)
  } catch (error) {
    console.error('❌ [API] 透析醫囑歷史刪除失敗:', error)
    throw error
  }
}

// ============================================
// 患者歷史相關優化函式
// ============================================
export async function fetchPatientHistory(queryConstraints = null) {
  try {
    const api = ApiManager('patient_history')
    const data = queryConstraints ? await api.fetchAll(queryConstraints) : await api.fetchAll()
    return data
  } catch (error) {
    console.error('❌ [API] 患者歷史載入失敗:', error)
    throw error
  }
}

export async function savePatientHistory(historyData) {
  try {
    const api = ApiManager('patient_history')
    const result = await api.save(historyData)
    return result
  } catch (error) {
    console.error('❌ [API] 患者歷史儲存失敗:', error)
    throw error
  }
}

// ============================================
// 快取管理功能
// ============================================
export function clearAllCache() {
  cache.clear()
}

export function clearCacheByCollection(collection) {
  clearCacheByPattern(collection)
}

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
export function batchUpdatePatients(updates) {
  updates.forEach(({ id, data }) => {
    addToBatch('update', 'patients', id, data)
  })
}

export function batchUpdateSchedules(updates) {
  updates.forEach(({ id, data }) => {
    addToBatch('update', 'schedules', id, data)
  })
}

export function batchSaveMemos(memos) {
  memos.forEach((data) => {
    addToBatch('save', 'memos', null, data)
  })
}

// ============================================
// [核心修正] 最終匯出的物件
// ============================================
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

  // 例外規則相關
  fetchAllExceptions,
  saveException,
  updateException,

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
