// src/pages/BaseSchedulePage.tsx
// Scaffold - Master bed allocation table

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './BaseSchedulePage.module.css'

type Shift = 'morning' | 'afternoon' | 'evening'
type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

interface BaseScheduleRule {
  patientId: string
  patientName: string
  bed: number
  shift: Shift
  days: DayOfWeek[]
  [key: string]: unknown
}

const SHIFT_OPTIONS: { key: Shift; label: string }[] = [
  { key: 'morning', label: '早班' },
  { key: 'afternoon', label: '午班' },
  { key: 'evening', label: '晚班' },
]

const DAY_OPTIONS: { key: DayOfWeek; label: string }[] = [
  { key: 'mon', label: '一' },
  { key: 'tue', label: '二' },
  { key: 'wed', label: '三' },
  { key: 'thu', label: '四' },
  { key: 'fri', label: '五' },
  { key: 'sat', label: '六' },
]

const BaseSchedulePage: React.FC = () => {
  const { canEditSchedules } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const allPatients = usePatientStore((s) => s.allPatients)
  const isLoading = usePatientStore((s) => s.isLoading)

  const [selectedShift, setSelectedShift] = useState<Shift>('morning')
  const [scheduleRules, setScheduleRules] = useState<BaseScheduleRule[]>([])
  const [isLoadingRules, setIsLoadingRules] = useState(false)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch MASTER_SCHEDULE from Firestore
  useEffect(() => {
    setIsLoadingRules(true)
    // Placeholder: load master schedule
    setIsLoadingRules(false)
  }, [])

  const handleShiftChange = useCallback((shift: Shift) => {
    setSelectedShift(shift)
  }, [])

  const bedNumbers = Array.from({ length: 20 }, (_, i) => i + 1)

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>固定排程管理</h1>
        <div className={styles.shiftTabs}>
          {SHIFT_OPTIONS.map((shift) => (
            <button
              key={shift.key}
              className={`${styles.shiftTab} ${selectedShift === shift.key ? styles.shiftTabActive : ''}`}
              onClick={() => handleShiftChange(shift.key)}
            >
              {shift.label}
            </button>
          ))}
        </div>
      </div>

      {(isLoading || isLoadingRules) && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.baseTable}>
          <thead>
            <tr>
              <th className={styles.headerCell}>床號</th>
              {DAY_OPTIONS.map((day) => (
                <th key={day.key} className={styles.headerCell}>
                  週{day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bedNumbers.map((bed) => (
              <tr key={bed} className={styles.tableRow}>
                <td className={styles.bedCell}>{bed}</td>
                {DAY_OPTIONS.map((day) => (
                  <td key={day.key} className={styles.assignmentCell}>
                    {/* TODO: Render patient assignment or empty slot */}
                    <div className={styles.emptySlot}>-</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default BaseSchedulePage
