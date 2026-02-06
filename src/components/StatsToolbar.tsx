// src/components/StatsToolbar.tsx
// Statistics toolbar showing patient counts by status per shift.

import { useMemo } from 'react'
import {
  ORDERED_SHIFT_CODES,
  SHIFT_DISPLAY_NAMES,
} from '@/constants/scheduleConstants'
import styles from '@/components/StatsToolbar.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-shift status counts */
export interface ShiftStats {
  total: number
  opd: number
  ipd: number
  er: number
  biweekly?: number
  newPatient?: number
}

/** Stats data keyed by shift code, with an optional 'all' aggregate key */
export type StatsData = Record<string, ShiftStats>

interface StatsToolbarProps {
  statsData: StatsData
  weekdays?: string[]
  columnWidths?: Record<string, number>
  size?: 'sm' | 'md' | 'lg'
  showPatientNumbers?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: { key: keyof ShiftStats; label: string; colorClass: string }[] = [
  { key: 'total', label: '總計', colorClass: styles.statTotal },
  { key: 'opd', label: '門診', colorClass: styles.statOpd },
  { key: 'ipd', label: '住院', colorClass: styles.statIpd },
  { key: 'er', label: '急診', colorClass: styles.statEr },
  { key: 'biweekly', label: '兩班', colorClass: styles.statBiweekly },
  { key: 'newPatient', label: '新病人', colorClass: styles.statNew },
]

function getSizeClass(size: 'sm' | 'md' | 'lg'): string {
  switch (size) {
    case 'sm':
      return styles.sizeSm
    case 'lg':
      return styles.sizeLg
    default:
      return styles.sizeMd
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StatsToolbar({
  statsData,
  weekdays,
  columnWidths,
  size = 'md',
  showPatientNumbers = true,
}: StatsToolbarProps) {
  const shiftCodes = useMemo(() => {
    return ORDERED_SHIFT_CODES as string[]
  }, [])

  // Calculate the grand total across all shifts
  const grandTotal = useMemo(() => {
    if (statsData.all) return statsData.all
    let total = 0
    let opd = 0
    let ipd = 0
    let er = 0
    let biweekly = 0
    let newPatient = 0

    for (const code of shiftCodes) {
      const s = statsData[code]
      if (!s) continue
      total += s.total || 0
      opd += s.opd || 0
      ipd += s.ipd || 0
      er += s.er || 0
      biweekly += s.biweekly || 0
      newPatient += s.newPatient || 0
    }

    return { total, opd, ipd, er, biweekly, newPatient } as ShiftStats
  }, [statsData, shiftCodes])

  // Filter out status rows that are all zeros
  const visibleStatuses = useMemo(() => {
    return STATUS_LABELS.filter((entry) => {
      if (entry.key === 'total') return true
      // Show row if any shift has a non-zero count for this status
      return shiftCodes.some((code) => {
        const s = statsData[code]
        return s && (s[entry.key] ?? 0) > 0
      })
    })
  }, [statsData, shiftCodes])

  return (
    <div className={`${styles.toolbar} ${getSizeClass(size)}`}>
      {/* Header row with weekday labels */}
      {weekdays && weekdays.length > 0 && (
        <div className={styles.weekdayRow}>
          <div className={styles.labelCell} />
          {weekdays.map((day, i) => (
            <div
              key={day}
              className={styles.weekdayCell}
              style={columnWidths ? { width: columnWidths[day] ?? 'auto' } : undefined}
            >
              {day}
            </div>
          ))}
        </div>
      )}

      {/* Shift stats rows */}
      {shiftCodes.map((shiftCode) => {
        const shiftStats = statsData[shiftCode]
        if (!shiftStats) return null

        const displayName =
          (SHIFT_DISPLAY_NAMES as Record<string, string>)[shiftCode] ?? shiftCode

        return (
          <div key={shiftCode} className={styles.shiftRow}>
            <div className={`${styles.shiftLabel} ${styles[`shift_${shiftCode}`]}`}>
              {displayName}
            </div>
            <div className={styles.statsGroup}>
              {visibleStatuses.map((entry) => {
                const count = shiftStats[entry.key] ?? 0
                if (entry.key !== 'total' && count === 0) return null

                return (
                  <div key={entry.key} className={`${styles.statChip} ${entry.colorClass}`}>
                    <span className={styles.statLabel}>{entry.label}</span>
                    {showPatientNumbers && (
                      <span className={styles.statValue}>{count}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Grand total row */}
      <div className={`${styles.shiftRow} ${styles.grandTotalRow}`}>
        <div className={`${styles.shiftLabel} ${styles.grandTotalLabel}`}>
          合計
        </div>
        <div className={styles.statsGroup}>
          {visibleStatuses.map((entry) => {
            const count = grandTotal[entry.key] ?? 0
            return (
              <div key={entry.key} className={`${styles.statChip} ${entry.colorClass}`}>
                <span className={styles.statLabel}>{entry.label}</span>
                {showPatientNumbers && (
                  <span className={styles.statValue}>{count}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
