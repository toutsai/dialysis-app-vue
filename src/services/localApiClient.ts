/**
 * 本地 API 客戶端
 * 用於單機離線模式，取代 Firebase SDK
 */

const API_BASE_URL = import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3000/api'

// Token 儲存
let authToken: string | null = null

/**
 * 設定認證 Token
 */
export function setAuthToken(token: string | null) {
  authToken = token
  if (token) {
    localStorage.setItem('auth_token', token)
  } else {
    localStorage.removeItem('auth_token')
  }
}

/**
 * 取得認證 Token
 */
export function getAuthToken(): string | null {
  if (!authToken) {
    authToken = localStorage.getItem('auth_token')
  }
  return authToken
}

/**
 * 清除認證 Token
 */
export function clearAuthToken() {
  authToken = null
  localStorage.removeItem('auth_token')
}

/**
 * 通用 API 請求函式
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  const token = getAuthToken()

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  if (token) {
    ;(headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    const error = new Error(errorData.message || `API 錯誤: ${response.status}`)
    ;(error as any).status = response.status
    ;(error as any).data = errorData
    throw error
  }

  return response.json()
}

// ========================================
// 認證 API
// ========================================

export const authApi = {
  /**
   * 登入
   */
  async login(username: string, password: string) {
    const result = await apiRequest<{
      success: boolean
      token: string
      user: {
        id: string
        uid: string
        username: string
        name: string
        title: string
        role: string
        email: string | null
      }
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })

    if (result.token) {
      setAuthToken(result.token)
    }

    return result
  },

  /**
   * 登出
   */
  async logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' })
    } finally {
      clearAuthToken()
    }
  },

  /**
   * 取得當前使用者
   */
  async getCurrentUser() {
    return apiRequest<{
      id: string
      uid: string
      username: string
      name: string
      title: string
      role: string
      email: string | null
      lastLogin: string
    }>('/auth/me')
  },

  /**
   * 修改密碼
   */
  async changePassword(oldPassword: string, newPassword: string) {
    return apiRequest<{ success: boolean }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    })
  },

  /**
   * 取得使用者列表 (管理員)
   */
  async getUsers() {
    return apiRequest<any[]>('/auth/users')
  },

  /**
   * 建立使用者 (管理員)
   */
  async createUser(userData: {
    username: string
    password: string
    name: string
    title?: string
    role: string
    email?: string
  }) {
    return apiRequest<{ success: boolean; id: string }>('/auth/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    })
  },

  /**
   * 更新使用者 (管理員)
   */
  async updateUser(id: string, userData: Partial<{
    name: string
    title: string
    role: string
    email: string
    is_active: boolean
    password: string
  }>) {
    return apiRequest<{ success: boolean }>(`/auth/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    })
  },

  /**
   * 刪除使用者 (管理員)
   */
  async deleteUser(id: string) {
    return apiRequest<{ success: boolean }>(`/auth/users/${id}`, {
      method: 'DELETE',
    })
  },
}

// ========================================
// 病人 API
// ========================================

export const patientsApi = {
  /**
   * 取得所有病人
   */
  async fetchAll(includeDeleted = false) {
    const query = includeDeleted ? '?includeDeleted=true' : ''
    return apiRequest<any[]>(`/patients${query}`)
  },

  /**
   * 取得病人（含排班規則）
   */
  async fetchAllWithRules() {
    return apiRequest<any[]>('/patients/with-rules')
  },

  /**
   * 取得單一病人
   */
  async fetchById(id: string) {
    return apiRequest<any>(`/patients/${id}`)
  },

  /**
   * 新增病人
   */
  async create(data: any) {
    return apiRequest<any>('/patients', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 更新病人
   */
  async update(id: string, data: any) {
    return apiRequest<any>(`/patients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 刪除病人
   */
  async delete(id: string, reason?: string) {
    return apiRequest<{ success: boolean }>(`/patients/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    })
  },

  /**
   * 復原病人
   */
  async restore(id: string, status?: string) {
    return apiRequest<any>(`/patients/${id}/restore`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    })
  },

  /**
   * 取得病人歷史
   */
  async fetchHistory(patientId?: string) {
    if (patientId) {
      return apiRequest<any[]>(`/patients/history/${patientId}`)
    }
    // 如果沒有指定 patientId，返回所有病人的歷史（或空陣列）
    return apiRequest<any[]>(`/patients/history`)
  },
}

// ========================================
// 排程 API
// ========================================

export const schedulesApi = {
  /**
   * 取得排程列表
   */
  async fetchAll(params?: { startDate?: string; endDate?: string; date?: string }) {
    const query = new URLSearchParams()
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    if (params?.date) query.set('date', params.date)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/schedules${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 取得特定日期排程
   */
  async fetchByDate(date: string) {
    return apiRequest<any>(`/schedules/${date}`)
  },

  /**
   * 更新排程
   */
  async updateByDate(date: string, schedule: any) {
    return apiRequest<any>(`/schedules/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    })
  },

  /**
   * 取得排班總表
   */
  async fetchMasterSchedule() {
    return apiRequest<any>('/schedules/base/master')
  },

  /**
   * 更新排班總表
   */
  async updateMasterSchedule(schedule: any) {
    return apiRequest<any>('/schedules/base/master', {
      method: 'PUT',
      body: JSON.stringify({ schedule }),
    })
  },

  /**
   * 更新單一病人的排班規則
   */
  async updatePatientRule(patientId: string, rule: any) {
    return apiRequest<any>(`/schedules/base/master/patient/${patientId}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
    })
  },

  /**
   * 取得調班申請列表
   */
  async fetchExceptions(params?: { status?: string; patientId?: string }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.patientId) query.set('patientId', params.patientId)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/schedules/exceptions/list${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 建立調班申請
   */
  async createException(data: any) {
    return apiRequest<any>('/schedules/exceptions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 更新調班申請狀態
   */
  async updateException(id: string, data: { status?: string; cancelReason?: string }) {
    return apiRequest<any>(`/schedules/exceptions/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  /**
   * 刪除調班申請
   */
  async deleteException(id: string) {
    return apiRequest<{ success: boolean }>(`/schedules/exceptions/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 取得護理分配
   */
  async fetchNurseAssignments(date: string) {
    return apiRequest<any>(`/schedules/nurse-assignments/${date}`)
  },

  /**
   * 更新護理分配
   */
  async updateNurseAssignments(date: string, teams: any) {
    return apiRequest<any>(`/schedules/nurse-assignments/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ teams }),
    })
  },
}

// ========================================
// 備忘錄 API
// ========================================

export const memosApi = {
  async fetchAll(params?: { date?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams()
    if (params?.date) query.set('date', params.date)
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/memos${queryStr ? `?${queryStr}` : ''}`)
  },

  async create(data: { date: string; content: string }) {
    return apiRequest<any>('/memos', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async update(id: string, data: { content: string }) {
    return apiRequest<any>(`/memos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  async delete(id: string) {
    return apiRequest<{ success: boolean }>(`/memos/${id}`, {
      method: 'DELETE',
    })
  },
}

// ========================================
// 醫囑 API
// ========================================

export const ordersApi = {
  /**
   * 取得透析醫囑歷史
   */
  async fetchHistory(patientId?: string) {
    const query = patientId ? `?patientId=${patientId}` : ''
    return apiRequest<any[]>(`/orders/history${query}`)
  },

  /**
   * 新增透析醫囑
   */
  async createHistory(data: {
    patientId: string
    patientName?: string
    operationType?: string
    orders: any
  }) {
    return apiRequest<any>('/orders/history', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 刪除透析醫囑歷史
   */
  async deleteHistory(id: string) {
    return apiRequest<{ success: boolean }>(`/orders/history/${id}`, {
      method: 'DELETE',
    })
  },

  /**
   * 取得檢驗報告
   */
  async fetchLabReports(params?: { patientId?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams()
    if (params?.patientId) query.set('patientId', params.patientId)
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/orders/lab-reports${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 新增檢驗報告
   */
  async createLabReport(data: any) {
    return apiRequest<any>('/orders/lab-reports', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得病情記錄
   */
  async fetchConditionRecords(patientId?: string) {
    const query = patientId ? `?patientId=${patientId}` : ''
    return apiRequest<any[]>(`/orders/condition-records${query}`)
  },

  /**
   * 新增病情記錄
   */
  async createConditionRecord(data: { patientId: string; recordDate?: string; content: string }) {
    return apiRequest<any>('/orders/condition-records', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// ========================================
// 護理 API
// ========================================

export const nursingApi = {
  /**
   * 取得護理職責
   */
  async fetchDuties() {
    return apiRequest<any>('/nursing/duties')
  },

  /**
   * 更新護理職責
   */
  async saveDuties(data: any) {
    return apiRequest<any>('/nursing/duties', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得交班日誌
   */
  async fetchHandoverLogs(params?: { date?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams()
    if (params?.date) query.set('date', params.date)
    if (params?.startDate) query.set('startDate', params.startDate)
    if (params?.endDate) query.set('endDate', params.endDate)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/nursing/handover-logs${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 新增交班日誌
   */
  async createHandoverLog(data: any) {
    return apiRequest<any>('/nursing/handover-logs', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 更新交班日誌
   */
  async updateHandoverLog(id: string, data: any) {
    return apiRequest<any>(`/nursing/handover-logs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得每日工作日誌
   */
  async fetchDailyLog(date: string) {
    return apiRequest<any>(`/nursing/daily-logs/${date}`)
  },

  /**
   * 更新每日工作日誌
   */
  async updateDailyLog(date: string, data: any) {
    return apiRequest<any>(`/nursing/daily-logs/${date}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得護理組別配置
   */
  async fetchGroupConfig() {
    return apiRequest<any[]>('/nursing/group-config')
  },

  /**
   * 更新護理組別配置
   */
  async updateGroupConfig(id: string, config: any) {
    return apiRequest<any>(`/nursing/group-config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    })
  },
}

// ========================================
// 系統 API
// ========================================

export const systemApi = {
  /**
   * 健康檢查
   */
  async healthCheck() {
    return apiRequest<{ status: string; timestamp: string; version: string }>('/health')
  },

  /**
   * 取得任務列表
   */
  async fetchTasks(params?: { status?: string; assignedTo?: string }) {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.assignedTo) query.set('assignedTo', params.assignedTo)
    const queryStr = query.toString()
    return apiRequest<any[]>(`/system/tasks${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 建立任務
   */
  async createTask(data: any) {
    return apiRequest<any>('/system/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 更新任務
   */
  async updateTask(id: string, data: any) {
    return apiRequest<any>(`/system/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得通知列表
   */
  async fetchNotifications() {
    return apiRequest<any[]>('/system/notifications')
  },

  /**
   * 標記通知已讀
   */
  async markNotificationRead(id: string) {
    return apiRequest<any>(`/system/notifications/${id}/read`, {
      method: 'PATCH',
    })
  },

  /**
   * 取得庫存
   */
  async fetchInventory() {
    return apiRequest<any[]>('/system/inventory')
  },

  /**
   * 新增庫存項目
   */
  async createInventoryItem(data: any) {
    return apiRequest<any>('/system/inventory', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  /**
   * 更新庫存項目
   */
  async updateInventoryItem(id: string, data: any) {
    return apiRequest<any>(`/system/inventory/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得站點配置
   */
  async fetchSiteConfig(id: string) {
    return apiRequest<any>(`/system/site-config/${id}`)
  },

  /**
   * 更新站點配置
   */
  async updateSiteConfig(id: string, data: any) {
    return apiRequest<any>(`/system/site-config/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  },

  /**
   * 取得稽核日誌 (管理員)
   */
  async fetchAuditLogs(params?: { action?: string; userId?: string; limit?: number }) {
    const query = new URLSearchParams()
    if (params?.action) query.set('action', params.action)
    if (params?.userId) query.set('userId', params.userId)
    if (params?.limit) query.set('limit', params.limit.toString())
    const queryStr = query.toString()
    return apiRequest<any[]>(`/system/audit-logs${queryStr ? `?${queryStr}` : ''}`)
  },

  /**
   * 手動備份資料庫 (管理員)
   */
  async createBackup() {
    return apiRequest<{ success: boolean; backupFile: string }>('/system/backup', {
      method: 'POST',
    })
  },

  /**
   * 取得備份列表 (管理員)
   */
  async fetchBackups() {
    return apiRequest<any[]>('/system/backups')
  },

  /**
   * 取得醫師列表
   */
  async fetchPhysicians() {
    return apiRequest<any[]>('/system/physicians')
  },

  /**
   * 新增醫師
   */
  async createPhysician(data: { name: string; specialty?: string }) {
    return apiRequest<any>('/system/physicians', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// ========================================
// 匯出統一介面
// ========================================

export const localApi = {
  auth: authApi,
  patients: patientsApi,
  schedules: schedulesApi,
  memos: memosApi,
  orders: ordersApi,
  nursing: nursingApi,
  system: systemApi,
}

export default localApi
