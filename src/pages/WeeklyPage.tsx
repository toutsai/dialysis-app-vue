// src/pages/WeeklyPage.tsx
// Scaffold - Weekly schedule overview (7 days)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './WeeklyPage.module.css'

/** Day column labels */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日']

function getWeekStartDate(dateStr: string): Date {
  const d = new Date(dateStr)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  return new Date(d.setDate(diff))
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

const WeeklyPage: React.FC = () => {
  const { currentUser } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const isLoading = usePatientStore((s) => s.isLoading)

  const [currentWeekStart, setCurrentWeekStart] = useState<string>(() => {
    return formatDate(getWeekStartDate(new Date().toISOString().slice(0, 10)))
  })

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  const weekDates = useMemo(() => {
    const start = new Date(currentWeekStart)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return formatDate(d)
    })
  }, [currentWeekStart])

  const handlePrevWeek = useCallback(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() - 7)
    setCurrentWeekStart(formatDate(d))
  }, [currentWeekStart])

  const handleNextWeek = useCallback(() => {
    const d = new Date(currentWeekStart)
    d.setDate(d.getDate() + 7)
    setCurrentWeekStart(formatDate(d))
  }, [currentWeekStart])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>週排程總覽</h1>
        <div className={styles.weekNav}>
          <button className={styles.navButton} onClick={handlePrevWeek}>
            &larr; 上一週
          </button>
          <span className={styles.weekLabel}>
            {weekDates[0]} ~ {weekDates[6]}
          </span>
          <button className={styles.navButton} onClick={handleNextWeek}>
            下一週 &rarr;
          </button>
        </div>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.weekGrid}>
        {weekDates.map((date, index) => (
          <div key={date} className={styles.dayColumn}>
            <div className={styles.dayHeader}>
              <span className={styles.dayLabel}>週{WEEKDAY_LABELS[index]}</span>
              <span className={styles.dayDate}>{date.slice(5)}</span>
            </div>
            <div className={styles.dayContent}>
              {/* TODO: Render daily schedule summary for each day */}
              <div className={styles.shiftBlock}>
                <div className={styles.shiftLabel}>早班</div>
                <div className={styles.placeholder}>--</div>
              </div>
              <div className={styles.shiftBlock}>
                <div className={styles.shiftLabel}>午班</div>
                <div className={styles.placeholder}>--</div>
              </div>
              <div className={styles.shiftBlock}>
                <div className={styles.shiftLabel}>晚班</div>
                <div className={styles.placeholder}>--</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default WeeklyPage
