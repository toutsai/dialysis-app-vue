/**
 * 本地 API 管理器
 * 提供與 ApiManager 相同的介面，但使用本地 REST API
 */

import { patientsApi, schedulesApi, memosApi, ordersApi, nursingApi, systemApi } from './localApiClient'

type FirestoreRecord = { id?: string; [key: string]: unknown }

type ApiManagerReturn<T extends FirestoreRecord> = {
  fetchAll: (queryConstraints?: any[]) => Promise<T[]>
  save: (idOrData: string | T, data?: T) => Promise<T>
  update: (id: string, data: Partial<T>) => Promise<T>
  delete: (id: string) => Promise<{ id: string }>
  fetchById: (id: string) => Promise<T | null>
  create: (data: T) => Promise<T>
}

// 資源類型到 API 的映射
const resourceApiMap: Record<string, any> = {
  // 病人相關
  patients: patientsApi,
  patient_history: {
    fetchAll: async () => {
      try {
        return await patientsApi.fetchHistory()
      } catch {
        console.log('[LocalApiManager] patient_history: 返回空陣列')
        return []
      }
    },
  },

  // 排程相關
  schedules: schedulesApi,
  base_schedules: {
    fetchAll: () => schedulesApi.fetchMasterSchedule().then(s => s ? [s] : []),
    save: (_id: string, data: any) => schedulesApi.updateMasterSchedule(data),
  },
  schedule_exceptions: {
    fetchAll: () => schedulesApi.fetchExceptions(),
    create: (data: any) => schedulesApi.createException(data),
    update: (id: string, data: any) => schedulesApi.updateException(id, data),
    delete: (id: string) => schedulesApi.deleteException(id),
  },
  nurse_assignments: {
    fetchAll: () => Promise.resolve([]),
    fetchById: (date: string) => schedulesApi.fetchNurseAssignments(date),
    save: (date: string, data: any) => schedulesApi.updateNurseAssignments(date, data),
  },
  // 已歸檔排程（歷史排程）
  expired_schedules: {
    fetchAll: async () => {
      console.log('[LocalApiManager] expired_schedules: 返回空陣列（歷史排程功能待實現）')
      return []
    },
  },
  // 排程病人更新
  scheduled_patient_updates: {
    fetchAll: async () => {
      console.log('[LocalApiManager] scheduled_patient_updates: 返回空陣列')
      return []
    },
  },

  // 備忘錄
  memos: memosApi,

  // 醫囑相關
  dialysis_orders_history: {
    fetchAll: (patientId?: string) => ordersApi.fetchHistory(patientId),
    create: (data: any) => ordersApi.createHistory(data),
    delete: (id: string) => ordersApi.deleteHistory(id),
  },
  lab_reports: {
    fetchAll: (params?: any) => ordersApi.fetchLabReports(params),
    create: (data: any) => ordersApi.createLabReport(data),
  },
  condition_records: {
    fetchAll: (patientId?: string) => ordersApi.fetchConditionRecords(patientId),
    create: (data: any) => ordersApi.createConditionRecord(data),
  },

  // 護理相關
  nursing_duties: {
    fetchAll: () => nursingApi.fetchDuties().then(d => d ? [d] : []),
    save: (_id: string, data: any) => nursingApi.saveDuties(data),
  },
  handover_logs: {
    fetchAll: (params?: any) => nursingApi.fetchHandoverLogs(params),
    create: (data: any) => nursingApi.createHandoverLog(data),
    update: (id: string, data: any) => nursingApi.updateHandoverLog(id, data),
  },
  daily_logs: {
    fetchById: (date: string) => nursingApi.fetchDailyLog(date),
    save: (date: string, data: any) => nursingApi.updateDailyLog(date, data),
  },
  nursing_group_config: {
    fetchAll: () => nursingApi.fetchGroupConfig(),
    update: (id: string, data: any) => nursingApi.updateGroupConfig(id, data),
  },

  // 系統相關
  tasks: {
    fetchAll: (params?: any) => systemApi.fetchTasks(params),
    create: (data: any) => systemApi.createTask(data),
    update: (id: string, data: any) => systemApi.updateTask(id, data),
  },
  notifications: {
    fetchAll: () => systemApi.fetchNotifications(),
    update: (id: string) => systemApi.markNotificationRead(id),
  },
  inventory_items: {
    fetchAll: () => systemApi.fetchInventory(),
    create: (data: any) => systemApi.createInventoryItem(data),
    update: (id: string, data: any) => systemApi.updateInventoryItem(id, data),
  },
  site_config: {
    fetchById: (id: string) => systemApi.fetchSiteConfig(id),
    save: (id: string, data: any) => systemApi.updateSiteConfig(id, data),
  },
  audit_logs: {
    fetchAll: (params?: any) => systemApi.fetchAuditLogs(params),
  },
  physicians: {
    fetchAll: () => systemApi.fetchPhysicians(),
    create: (data: any) => systemApi.createPhysician(data),
  },
}

/**
 * 創建本地 API 管理器
 * @param resourceType - 資源類型 (集合名稱)
 */
const LocalApiManager = <T extends FirestoreRecord>(resourceType: string): ApiManagerReturn<T> => {
  const api = resourceApiMap[resourceType]

  if (!api) {
    console.warn(`[LocalApiManager] 未知的資源類型: ${resourceType}，使用預設空實作`)
  }

  const fetchAll = async (_queryConstraints: any[] = []): Promise<T[]> => {
    try {
      if (api?.fetchAll) {
        const result = await api.fetchAll()
        return Array.isArray(result) ? result : []
      }
      console.warn(`[LocalApiManager] ${resourceType} 不支援 fetchAll`)
      return []
    } catch (error) {
      console.error(`[LocalApiManager] Error fetching ${resourceType}:`, error)
      throw error
    }
  }

  const fetchById = async (id: string): Promise<T | null> => {
    try {
      if (api?.fetchById) {
        return await api.fetchById(id)
      }
      // 如果沒有 fetchById，嘗試用 fetchAll 後篩選
      if (api?.fetchAll) {
        const all = await api.fetchAll()
        return all.find((item: any) => item.id === id) || null
      }
      console.warn(`[LocalApiManager] ${resourceType} 不支援 fetchById`)
      return null
    } catch (error) {
      console.error(`[LocalApiManager] Error fetching ${resourceType} by ID:`, error)
      throw error
    }
  }

  const create = async (data: T): Promise<T> => {
    try {
      if (api?.create) {
        return await api.create(data)
      }
      console.warn(`[LocalApiManager] ${resourceType} 不支援 create`)
      return data
    } catch (error) {
      console.error(`[LocalApiManager] Error creating ${resourceType}:`, error)
      throw error
    }
  }

  const save = async (idOrData: string | T, data?: T): Promise<T> => {
    try {
      // 情況一：新增 (addDoc)
      if (typeof idOrData === 'object' && data === undefined) {
        return create(idOrData)
      }
      // 情況二：指定 ID 更新/建立
      if (typeof idOrData === 'string' && typeof data === 'object') {
        if (api?.save) {
          return await api.save(idOrData, data)
        }
        if (api?.update) {
          return await api.update(idOrData, data)
        }
        console.warn(`[LocalApiManager] ${resourceType} 不支援 save`)
        return { id: idOrData, ...data }
      }
      throw new Error('Invalid arguments for save function')
    } catch (error) {
      console.error(`[LocalApiManager] Error saving ${resourceType}:`, error)
      throw error
    }
  }

  const update = async (id: string, data: Partial<T>): Promise<T> => {
    try {
      if (api?.update) {
        return await api.update(id, data)
      }
      console.warn(`[LocalApiManager] ${resourceType} 不支援 update`)
      return { id, ...(data as T) }
    } catch (error) {
      console.error(`[LocalApiManager] Error updating ${resourceType}:`, error)
      throw error
    }
  }

  const deleteDocument = async (id: string): Promise<{ id: string }> => {
    try {
      if (api?.delete) {
        await api.delete(id)
        return { id }
      }
      console.warn(`[LocalApiManager] ${resourceType} 不支援 delete`)
      return { id }
    } catch (error) {
      console.error(`[LocalApiManager] Error deleting ${resourceType}:`, error)
      throw error
    }
  }

  return {
    fetchAll,
    save,
    update,
    delete: deleteDocument,
    fetchById,
    create,
  }
}

export default LocalApiManager
