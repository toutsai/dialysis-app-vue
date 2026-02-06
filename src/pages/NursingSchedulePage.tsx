// src/pages/NursingSchedulePage.tsx
// 護理班表與職責 - Three tabs: monthly master, weekly, responsibilities

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './NursingSchedulePage.module.css'

type ScheduleTab = 'monthly' | 'weekly' | 'responsibilities'

interface ShiftEntry {
  id: string
  nurseName: string
  nurseId: string
  date: string
  shift: 'morning' | 'afternoon' | 'evening' | 'off'
  [key: string]: unknown
}

interface Responsibility {
  id: string
  title: string
  assignee: string
  category: string
  description: string
  [key: string]: unknown
}

const TABS: { key: ScheduleTab; label: string }[] = [
  { key: 'monthly', label: '月班表' },
  { key: 'weekly', label: '週班表' },
  { key: 'responsibilities', label: '職責分工' },
]

const NursingSchedulePage: React.FC = () => {
  const { currentUser, isEditor } = useAuth()

  const [activeTab, setActiveTab] = useState<ScheduleTab>('monthly')
  const [shifts, setShifts] = useState<ShiftEntry[]>([])
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // TODO: Fetch schedule data based on tab and filters
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch schedule data
    setIsLoading(false)
  }, [activeTab, selectedMonth])

  const handleTabChange = useCallback((tab: ScheduleTab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">護理班表與職責</h1>
        {isEditor && activeTab !== 'responsibilities' && (
          <button className={styles.editButton}>編輯班表</button>
        )}
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

      {/* Monthly Tab */}
      {activeTab === 'monthly' && (
        <div className={styles.tabContent}>
          <div className={styles.filterBar}>
            <input
              type="month"
              className={styles.monthInput}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            />
          </div>
          <div className={styles.calendarGrid}>
            {shifts.length === 0 && !isLoading ? (
              <div className={styles.emptyState}>
                <p>尚無月班表資料</p>
              </div>
            ) : (
              <div className={styles.scheduleTable}>
                {/* TODO: Render monthly calendar grid with shift assignments */}
                <p className={styles.placeholderText}>月班表將於此處顯示</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weekly Tab */}
      {activeTab === 'weekly' && (
        <div className={styles.tabContent}>
          <div className={styles.weeklyView}>
            {shifts.length === 0 && !isLoading ? (
              <div className={styles.emptyState}>
                <p>尚無週班表資料</p>
              </div>
            ) : (
              <div className={styles.weekGrid}>
                {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
                  <div key={day} className={styles.weekDay}>
                    <div className={styles.weekDayHeader}>週{day}</div>
                    <div className={styles.weekDayBody}>
                      {/* TODO: Render shift entries for each day */}
                      <span className={styles.placeholderText}>-</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Responsibilities Tab */}
      {activeTab === 'responsibilities' && (
        <div className={styles.tabContent}>
          {responsibilities.length === 0 && !isLoading ? (
            <div className={styles.emptyState}>
              <p>尚無職責分工資料</p>
            </div>
          ) : (
            <div className={styles.responsibilityList}>
              {responsibilities.map((resp) => (
                <div key={resp.id} className={styles.responsibilityCard}>
                  <div className={styles.respHeader}>
                    <span className={styles.respTitle}>{resp.title}</span>
                    <span className={styles.respCategory}>{resp.category}</span>
                  </div>
                  <div className={styles.respBody}>
                    <span className={styles.respAssignee}>{resp.assignee}</span>
                    <p className={styles.respDescription}>{resp.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default NursingSchedulePage
