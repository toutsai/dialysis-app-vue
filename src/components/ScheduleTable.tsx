// src/components/ScheduleTable.tsx
// Main table displaying dialysis schedule with a bed-shift-day grid.
// Each row = one bed. Columns = shifts x weekdays.

import { useCallback, useMemo, type DragEvent, type MouseEvent } from 'react'
import { SHIFT_DISPLAY_NAMES } from '@/constants/scheduleConstants'
import { sanitizeHtml } from '@/utils/sanitize'
import type { Patient } from '@/stores/patientStore'
import PatientMessagesIcon from '@/components/PatientMessagesIcon'
import WardNumberBadge from '@/components/WardNumberBadge'
import styles from '@/components/ScheduleTable.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlotData {
  shiftId: string
  patientId: string | null
  autoNote?: string
  manualNote?: string
  nurseTeam?: string | null
  nurseTeamIn?: string | null
  nurseTeamOut?: string | null
  wardNumber?: string | null
}

export interface BedLayout {
  bedId: string
  bedLabel: string
  isHepatitis?: boolean
}

export interface ScheduleLayout {
  beds: BedLayout[]
}

/** scheduleData[dateStr][shiftCode][bedId] = SlotData */
export type ScheduleDataMap = Record<string, Record<string, Record<string, SlotData>>>

interface ScheduleTableProps {
  layout: ScheduleLayout
  scheduleData: ScheduleDataMap
  patientMap: Map<string, Patient>
  shifts: string[]
  weekdays: string[]
  weekDates: string[]
  hepatitisBeds: Set<string>
  getStyleFunc: (
    slotData: SlotData | null,
    patient: Patient | undefined,
    freq?: string | null,
    messageTypes?: string[]
  ) => Record<string, boolean>
  isDateInPast: (dateStr: string) => boolean
  typesMap: Map<string, string[]>
  isPageLocked: boolean
  onGridClick: (bedId: string, shiftCode: string, dateStr: string) => void
  onDrop: (e: DragEvent, bedId: string, shiftCode: string, dateStr: string) => void
  onDragStart: (e: DragEvent, slotData: SlotData, bedId: string, shiftCode: string, dateStr: string) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onShowMemos: (patientId: string, patientName: string) => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCellClassNames(
  styleObj: Record<string, boolean>,
  extra: string[]
): string {
  const classes = [...extra]
  for (const [key, active] of Object.entries(styleObj)) {
    if (active) classes.push(key)
  }
  return classes.join(' ')
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScheduleTable({
  layout,
  scheduleData,
  patientMap,
  shifts,
  weekdays,
  weekDates,
  hepatitisBeds,
  getStyleFunc,
  isDateInPast,
  typesMap,
  isPageLocked,
  onGridClick,
  onDrop,
  onDragStart,
  onDragOver,
  onDragLeave,
  onShowMemos,
}: ScheduleTableProps) {
  // Build column headers: for each weekday we have N shifts
  const columnHeaders = useMemo(() => {
    const headers: { dateStr: string; dayLabel: string; shiftCode: string; shiftLabel: string }[] = []
    weekDates.forEach((dateStr, dayIdx) => {
      const dayLabel = weekdays[dayIdx] ?? dateStr
      for (const shiftCode of shifts) {
        const shiftLabel =
          (SHIFT_DISPLAY_NAMES as Record<string, string>)[shiftCode] ?? shiftCode
        headers.push({ dateStr, dayLabel, shiftCode, shiftLabel })
      }
    })
    return headers
  }, [weekDates, weekdays, shifts])

  // Group column headers by day for the top-level header row
  const dayGroups = useMemo(() => {
    const groups: { dayLabel: string; dateStr: string; colspan: number }[] = []
    let current: (typeof groups)[0] | null = null
    for (const h of columnHeaders) {
      if (!current || current.dateStr !== h.dateStr) {
        current = { dayLabel: h.dayLabel, dateStr: h.dateStr, colspan: 1 }
        groups.push(current)
      } else {
        current.colspan++
      }
    }
    return groups
  }, [columnHeaders])

  const handleCellClick = useCallback(
    (bedId: string, shiftCode: string, dateStr: string) => {
      if (!isPageLocked) {
        onGridClick(bedId, shiftCode, dateStr)
      }
    },
    [isPageLocked, onGridClick]
  )

  const handleCellDrop = useCallback(
    (e: DragEvent, bedId: string, shiftCode: string, dateStr: string) => {
      e.preventDefault()
      if (!isPageLocked) {
        onDrop(e, bedId, shiftCode, dateStr)
      }
    },
    [isPageLocked, onDrop]
  )

  const handleCellDragStart = useCallback(
    (e: DragEvent, slot: SlotData, bedId: string, shiftCode: string, dateStr: string) => {
      if (!isPageLocked && slot.patientId) {
        onDragStart(e, slot, bedId, shiftCode, dateStr)
      }
    },
    [isPageLocked, onDragStart]
  )

  const handleMemoClick = useCallback(
    (e: MouseEvent, patientId: string, patientName: string) => {
      e.stopPropagation()
      onShowMemos(patientId, patientName)
    },
    [onShowMemos]
  )

  return (
    <div className={styles.tableWrapper}>
      <table className={styles.scheduleTable}>
        {/* ---- Header ---- */}
        <thead>
          {/* Top row: day labels */}
          <tr>
            <th className={styles.bedHeader} rowSpan={2}>
              床號
            </th>
            {dayGroups.map((group) => (
              <th
                key={group.dateStr}
                colSpan={group.colspan}
                className={`${styles.dayHeader} ${isDateInPast(group.dateStr) ? styles.pastDay : ''}`}
              >
                <div className={styles.dayLabel}>{group.dayLabel}</div>
                <div className={styles.dateSubLabel}>{group.dateStr}</div>
              </th>
            ))}
          </tr>
          {/* Second row: shift labels within each day */}
          <tr>
            {columnHeaders.map((col) => (
              <th
                key={`${col.dateStr}-${col.shiftCode}`}
                className={`${styles.shiftHeader} ${styles[`shift_${col.shiftCode}`]}`}
              >
                {col.shiftLabel}
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- Body ---- */}
        <tbody>
          {layout.beds.map((bed) => {
            const isHep = hepatitisBeds.has(bed.bedId)

            return (
              <tr
                key={bed.bedId}
                className={`${styles.bedRow} ${isHep ? styles.hepatitisRow : ''}`}
              >
                {/* Bed label cell */}
                <td className={`${styles.bedLabelCell} ${isHep ? styles.hepatitisBedLabel : ''}`}>
                  <span className={styles.bedNumber}>{bed.bedLabel}</span>
                  {isHep && <span className={styles.hepBadge}>肝</span>}
                </td>

                {/* Shift cells */}
                {columnHeaders.map((col) => {
                  const dateData = scheduleData[col.dateStr]
                  const shiftData = dateData?.[col.shiftCode]
                  const slot: SlotData | null = shiftData?.[bed.bedId] ?? null
                  const patient = slot?.patientId
                    ? patientMap.get(slot.patientId)
                    : undefined
                  const patientMessageTypes = slot?.patientId
                    ? typesMap.get(slot.patientId) ?? []
                    : []

                  const cellStyle = getStyleFunc(
                    slot,
                    patient,
                    patient?.freq as string | null ?? null,
                    patientMessageTypes
                  )

                  const cellKey = `${bed.bedId}-${col.shiftCode}-${col.dateStr}`
                  const isPast = isDateInPast(col.dateStr)
                  const isEmpty = !slot || !slot.patientId
                  const isDraggable = !isPageLocked && !isEmpty && !isPast

                  const autoNote = slot?.autoNote ?? ''
                  const manualNote = slot?.manualNote ?? ''
                  const combinedNote = [autoNote, manualNote].filter(Boolean).join(' ')

                  return (
                    <td
                      key={cellKey}
                      className={buildCellClassNames(cellStyle, [
                        styles.slotCell,
                        isEmpty ? styles.emptySlot : styles.filledSlot,
                        isPast ? styles.pastCell : '',
                        isPageLocked ? styles.lockedCell : '',
                      ])}
                      onClick={() => handleCellClick(bed.bedId, col.shiftCode, col.dateStr)}
                      onDrop={(e) => handleCellDrop(e, bed.bedId, col.shiftCode, col.dateStr)}
                      onDragOver={onDragOver}
                      onDragLeave={onDragLeave}
                      draggable={isDraggable}
                      onDragStart={(e) => {
                        if (slot) {
                          handleCellDragStart(e, slot, bed.bedId, col.shiftCode, col.dateStr)
                        }
                      }}
                      data-bed={bed.bedId}
                      data-shift={col.shiftCode}
                      data-date={col.dateStr}
                    >
                      {patient ? (
                        <div className={styles.cellContent}>
                          {/* Patient name */}
                          <div className={styles.patientNameRow}>
                            <span
                              className={styles.patientName}
                              onClick={(e) =>
                                handleMemoClick(e, patient.id, patient.name ?? '')
                              }
                              title={patient.name ?? ''}
                            >
                              {patient.name ?? patient.id}
                            </span>
                            <PatientMessagesIcon
                              patientId={patient.id}
                              typesMap={typesMap}
                            />
                          </div>

                          {/* Notes */}
                          {combinedNote && (
                            <div
                              className={styles.noteRow}
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(combinedNote),
                              }}
                            />
                          )}

                          {/* Ward number badge (for peripheral beds) */}
                          {slot?.wardNumber !== undefined && slot.wardNumber !== null && (
                            <WardNumberBadge
                              value={slot.wardNumber}
                              onUpdate={() => {
                                /* ward update handled by parent via onGridClick */
                              }}
                            />
                          )}

                          {/* Nurse team */}
                          {slot?.nurseTeam && (
                            <div className={styles.nurseTeam}>{slot.nurseTeam}</div>
                          )}
                        </div>
                      ) : (
                        <div className={styles.emptyCellContent} />
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
