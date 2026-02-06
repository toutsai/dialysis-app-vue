// src/pages/DailyLogPage.tsx
// Scaffold - Daily work log

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './DailyLogPage.module.css'

export default function DailyLogPage() {
  const { currentUser } = useAuth()
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().slice(0, 10),
  )

  return (
    <div className="page-container">
      <div className={styles.pageHeader}>
        <h1 className="page-title">工作日誌</h1>
        <div className={styles.dateSelector}>
          <input
            type="date"
            className={styles.dateInput}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.toolbar}>
        <span className={styles.userLabel}>
          記錄者：{currentUser?.name || '-'}
        </span>
      </div>

      <div className={styles.content}>
        {/* Main content area */}
        <div className={styles.emptyState}>
          <p>尚無工作日誌紀錄</p>
          <p className={styles.hint}>此頁面正在建構中...</p>
        </div>
      </div>
    </div>
  )
}
