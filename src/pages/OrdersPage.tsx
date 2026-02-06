// src/pages/OrdersPage.tsx
// 藥囑管理 - Medication order management with query and upload tabs

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { useMedicationStore } from '@/stores/medicationStore'
import styles from './OrdersPage.module.css'

type OrderTab = 'query' | 'upload' | 'history'

interface MedicationOrder {
  id: string
  patientId: string
  patientName: string
  orderCode: string
  drugName: string
  dosage: string
  frequency: string
  route: string
  status: 'active' | 'discontinued' | 'pending'
  prescribedDate: string
  prescribedBy: string
  [key: string]: unknown
}

const TABS: { key: OrderTab; label: string }[] = [
  { key: 'query', label: '藥囑查詢' },
  { key: 'upload', label: '藥囑上傳' },
  { key: 'history', label: '歷史紀錄' },
]

const STATUS_LABELS: Record<string, string> = {
  active: '執行中',
  discontinued: '已停止',
  pending: '待確認',
}

const OrdersPage: React.FC = () => {
  const { currentUser, canManageOrders } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const medicationIsLoading = useMedicationStore((s) => s.isLoading)

  const [activeTab, setActiveTab] = useState<OrderTab>('query')
  const [orders, setOrders] = useState<MedicationOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchPatient, setSearchPatient] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch orders based on active tab and filters
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch medication orders
    setIsLoading(false)
  }, [activeTab, statusFilter, dateRange])

  const handleTabChange = useCallback((tab: OrderTab) => {
    setActiveTab(tab)
    setOrders([])
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">藥囑管理</h1>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Query Tab */}
      {activeTab === 'query' && (
        <div className={styles.tabContent}>
          <div className={styles.filterBar}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="搜尋病患或藥品..."
              value={searchPatient}
              onChange={(e) => setSearchPatient(e.target.value)}
            />
            <select
              className={styles.filterSelect}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部狀態</option>
              <option value="active">執行中</option>
              <option value="pending">待確認</option>
              <option value="discontinued">已停止</option>
            </select>
            <input
              type="date"
              className={styles.dateInput}
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
            />
            <span className={styles.dateSep}>~</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
            />
            <button className={styles.queryButton}>查詢</button>
          </div>

          {(isLoading || medicationIsLoading) && (
            <div className={styles.loadingOverlay}>載入中...</div>
          )}

          <div className={styles.tableWrapper}>
            <table className={styles.orderTable}>
              <thead>
                <tr>
                  <th>病患姓名</th>
                  <th>藥品名稱</th>
                  <th>劑量</th>
                  <th>頻率</th>
                  <th>給藥途徑</th>
                  <th>狀態</th>
                  <th>開立日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={8} className={styles.emptyRow}>
                      尚無藥囑資料
                    </td>
                  </tr>
                ) : (
                  orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.patientName}</td>
                      <td className={styles.drugName}>{order.drugName}</td>
                      <td>{order.dosage}</td>
                      <td>{order.frequency}</td>
                      <td>{order.route}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`status_${order.status}`]}`}>
                          {STATUS_LABELS[order.status] || order.status}
                        </span>
                      </td>
                      <td>{order.prescribedDate}</td>
                      <td>
                        <button className={styles.viewButton}>詳情</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Tab */}
      {activeTab === 'upload' && (
        <div className={styles.tabContent}>
          {canManageOrders ? (
            <div className={styles.uploadArea}>
              <div className={styles.uploadDropzone}>
                <p className={styles.uploadText}>拖曳藥囑檔案至此或點擊上傳</p>
                <p className={styles.uploadHint}>支援 CSV、Excel 格式</p>
                <button className={styles.uploadButton}>選擇檔案</button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>您沒有上傳藥囑的權限</p>
            </div>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <div className={styles.tabContent}>
          <div className={styles.emptyState}>
            {/* TODO: Render order change history */}
            <p>藥囑歷史紀錄將顯示在此處</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default OrdersPage
