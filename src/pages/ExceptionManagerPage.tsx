// src/pages/ExceptionManagerPage.tsx
// Scaffold - Schedule exception / shift change management

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './ExceptionManagerPage.module.css'

interface ScheduleException {
  id: string
  patientId: string
  patientName: string
  originalDate: string
  originalShift: string
  originalBed: number
  newDate: string
  newShift: string
  newBed: number
  reason: string
  status: 'pending' | 'approved' | 'applied'
  createdBy: string
  createdAt: string
  [key: string]: unknown
}

const ExceptionManagerPage: React.FC = () => {
  const { currentUser, canEditSchedules } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)

  const [exceptions, setExceptions] = useState<ScheduleException[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchText, setSearchText] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch exceptions from Firestore
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch schedule exceptions
    setIsLoading(false)
  }, [])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }, [])

  const handleFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilterStatus(e.target.value)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>排程異動管理</h1>
        {canEditSchedules && (
          <button
            className={styles.createButton}
            onClick={() => setShowCreateDialog(true)}
          >
            + 新增異動
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋病患姓名..."
          value={searchText}
          onChange={handleSearchChange}
        />
        <select
          className={styles.filterSelect}
          value={filterStatus}
          onChange={handleFilterChange}
        >
          <option value="all">全部狀態</option>
          <option value="pending">待處理</option>
          <option value="approved">已核准</option>
          <option value="applied">已套用</option>
        </select>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.exceptionTable}>
          <thead>
            <tr>
              <th>病患姓名</th>
              <th>原日期</th>
              <th>原班別/床號</th>
              <th>新日期</th>
              <th>新班別/床號</th>
              <th>原因</th>
              <th>狀態</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  尚無異動記錄
                </td>
              </tr>
            ) : (
              /* TODO: Render exception rows */
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  資料載入中...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* TODO: Create/Edit exception dialog */}
    </div>
  )
}

export default ExceptionManagerPage
