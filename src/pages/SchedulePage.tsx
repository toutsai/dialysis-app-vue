// src/pages/SchedulePage.tsx
// Scaffold - Daily schedule management (beds x shifts table)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './SchedulePage.module.css'

/** Shift identifiers used in the schedule grid */
type Shift = 'morning' | 'afternoon' | 'evening'

interface ScheduleEntry {
  bedNumber: number
  shift: Shift
  patientId: string | null
  patientName: string | null
  [key: string]: unknown
}

const SHIFTS: { key: Shift; label: string }[] = [
  { key: 'morning', label: '早班' },
  { key: 'afternoon', label: '午班' },
  { key: 'evening', label: '晚班' },
]

const SchedulePage: React.FC = () => {
  const { currentUser, canEditSchedules } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const allPatients = usePatientStore((s) => s.allPatients)
  const isLoading = usePatientStore((s) => s.isLoading)

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })
  const [scheduleData, setScheduleData] = useState<ScheduleEntry[]>([])
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false)

  // Fetch patients on mount
  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch schedule data when selectedDate changes
  useEffect(() => {
    setIsLoadingSchedule(true)
    // Placeholder: fetch schedule from Firestore for selectedDate
    // fetchScheduleForDate(selectedDate).then(setScheduleData)
    setIsLoadingSchedule(false)
  }, [selectedDate])

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value)
  }, [])

  // Placeholder bed numbers
  const bedNumbers = useMemo(() => Array.from({ length: 20 }, (_, i) => i + 1), [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>每日排程</h1>
        <div className={styles.dateSelector}>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className={styles.dateInput}
          />
        </div>
      </div>

      {(isLoading || isLoadingSchedule) && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.scheduleTableWrapper}>
        <table className={styles.scheduleTable}>
          <thead>
            <tr>
              <th className={styles.bedHeader}>床號</th>
              {SHIFTS.map((shift) => (
                <th key={shift.key} className={styles.shiftHeader}>
                  {shift.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bedNumbers.map((bed) => (
              <tr key={bed} className={styles.scheduleRow}>
                <td className={styles.bedCell}>{bed}</td>
                {SHIFTS.map((shift) => (
                  <td key={shift.key} className={styles.slotCell}>
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

export default SchedulePage
