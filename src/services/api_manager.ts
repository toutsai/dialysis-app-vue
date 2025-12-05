/**
 * 統一 API 管理器
 * 根據運行模式自動切換 Firebase ApiManager 或 Local ApiManager
 */

import { isStandaloneMode } from '@/utils/appMode'

type FirestoreRecord = { id?: string; [key: string]: unknown }

type ApiManagerReturn<T extends FirestoreRecord> = {
  fetchAll: (queryConstraints?: any[]) => Promise<T[]>
  save: (idOrData: string | T, data?: T) => Promise<T>
  update: (id: string, data: Partial<T>) => Promise<T>
  delete: (id: string) => Promise<{ id: string }>
  fetchById: (id: string) => Promise<T | null>
  create: (data: T) => Promise<T>
}

// 快取已建立的管理器
const managerCache: Record<string, ApiManagerReturn<any>> = {}

// 動態載入對應的 API Manager
let ApiManagerImpl: (<T extends FirestoreRecord>(resourceType: string) => ApiManagerReturn<T>) | null = null
let loadPromise: Promise<any> | null = null

async function loadApiManager() {
  if (ApiManagerImpl) return ApiManagerImpl

  if (!loadPromise) {
    loadPromise = (async () => {
      if (isStandaloneMode()) {
        const module = await import('./LocalApiManager')
        ApiManagerImpl = module.default
        console.log('🖥️ [ApiManager] 使用本地 API 管理器')
      } else {
        const module = await import('./FirebaseApiManager')
        ApiManagerImpl = module.default
        console.log('☁️ [ApiManager] 使用 Firebase API 管理器')
      }
      return ApiManagerImpl
    })()
  }

  return loadPromise
}

// 立即開始載入
loadApiManager()

/**
 * 統一 API 管理器
 * 提供與原始 ApiManager 相同的介面
 */
const ApiManager = <T extends FirestoreRecord>(resourceType: string): ApiManagerReturn<T> => {
  // 如果已經有快取，直接返回
  if (managerCache[resourceType]) {
    return managerCache[resourceType] as ApiManagerReturn<T>
  }

  // 建立一個代理物件，確保 API 載入完成後才執行
  const proxy: ApiManagerReturn<T> = {
    fetchAll: async (queryConstraints?: any[]) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.fetchAll(queryConstraints)
    },
    save: async (idOrData: string | T, data?: T) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.save(idOrData, data)
    },
    update: async (id: string, data: Partial<T>) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.update(id, data)
    },
    delete: async (id: string) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.delete(id)
    },
    fetchById: async (id: string) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.fetchById(id)
    },
    create: async (data: T) => {
      await loadApiManager()
      if (!ApiManagerImpl) throw new Error('ApiManager not loaded')
      const manager = ApiManagerImpl<T>(resourceType)
      return manager.create(data)
    },
  }

  managerCache[resourceType] = proxy
  return proxy
}

export default ApiManager
