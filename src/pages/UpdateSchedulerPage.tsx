// src/pages/UpdateSchedulerPage.tsx
// Scaffold - Scheduled patient attribute changes (future-dated updates)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './UpdateSchedulerPage.module.css'

interface ScheduledUpdate {
  id: string
  patientId: string
  patientName: string
  fieldToUpdate: string
  currentValue: string
  newValue: string
  effectiveDate: string
  status: 'pending' | 'applied' | 'cancelled'
  createdBy: string
  createdAt: string
  [key: string]: unknown
}

const UpdateSchedulerPage: React.FC = () => {
  const { currentUser, canEditSchedules } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)

  const [updates, setUpdates] = useState<ScheduledUpdate[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('pending')

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch scheduled updates from Firestore
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch scheduled updates
    setIsLoading(false)
  }, [filterStatus])

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>預約變更排程</h1>
        <div className={styles.controls}>
          <select
            className={styles.filterSelect}
            value={filterStatus}
            onChange={handleFilterChange}
          >
            <option value="all">全部</option>
            <option value="pending">待執行</option>
            <option value="applied">已套用</option>
            <option value="cancelled">已取消</option>
          </select>
          {canEditSchedules && (
            <button className={styles.addButton}>
              + 新增預約變更
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.updateTable}>
          <thead>
            <tr>
              <th>病患姓名</th>
              <th>變更欄位</th>
              <th>原值</th>
              <th>新值</th>
              <th>生效日期</th>
              <th>狀態</th>
              <th>建立者</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {updates.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  尚無預約變更記錄
                </td>
              </tr>
            ) : (
              /* TODO: Render scheduled update rows */
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  資料載入中...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default UpdateSchedulerPage
