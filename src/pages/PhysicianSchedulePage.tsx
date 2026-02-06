// src/pages/PhysicianSchedulePage.tsx
// Scaffold - Physician scheduling with tabs (rounds/consultation/emergency)

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './PhysicianSchedulePage.module.css'

type PhysicianTab = 'rounds' | 'consultation' | 'emergency'

interface PhysicianAssignment {
  id: string
  physicianName: string
  date: string
  shift: string
  type: PhysicianTab
  [key: string]: unknown
}

const TABS: { key: PhysicianTab; label: string }[] = [
  { key: 'rounds', label: '巡診排班' },
  { key: 'consultation', label: '會診排班' },
  { key: 'emergency', label: '緊急排班' },
]

const PhysicianSchedulePage: React.FC = () => {
  const { currentUser, canManagePhysicianSchedule } = useAuth()

  const [activeTab, setActiveTab] = useState<PhysicianTab>('rounds')
  const [assignments, setAssignments] = useState<PhysicianAssignment[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // TODO: Fetch physician schedule data
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch physician assignments for selectedMonth and activeTab
    setIsLoading(false)
  }, [selectedMonth, activeTab])

  const handleTabChange = useCallback((tab: PhysicianTab) => {
    setActiveTab(tab)
  }, [])

  const handleMonthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedMonth(e.target.value)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>醫師排班</h1>
        <div className={styles.controls}>
          <input
            type="month"
            value={selectedMonth}
            onChange={handleMonthChange}
            className={styles.monthInput}
          />
          {canManagePhysicianSchedule && (
            <button className={styles.addButton}>
              + 新增排班
            </button>
          )}
        </div>
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

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.content}>
        {assignments.length === 0 && !isLoading ? (
          <div className={styles.emptyState}>
            <p>尚無排班資料</p>
          </div>
        ) : (
          <div className={styles.scheduleList}>
            {/* TODO: Render physician assignment cards/table */}
            <div className={styles.placeholderCard}>
              <span className={styles.placeholderText}>
                排班資料將顯示在此處
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default PhysicianSchedulePage
