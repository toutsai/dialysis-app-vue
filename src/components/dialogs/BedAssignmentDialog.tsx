import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import styles from '@/components/dialogs/BedAssignmentDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedPatient {
  id: string
  name?: string
  chartNo?: string
  frequency?: string
  shift?: string
  status?: string
  hepatitisB?: string
  hepatitisC?: string
  [key: string]: unknown
}

export interface BedCell {
  bedId: string
  label: string
  row: number
  col: number
  zone?: string
  isAvailable?: boolean
}

export interface BedLayout {
  rows: number
  cols: number
  beds: BedCell[]
  zones?: string[]
}

export interface ScheduleEntry {
  patientId: string
  bedId: string
  shift: string
  date: string
  [key: string]: unknown
}

export interface ShiftConfig {
  value: string
  label: string
}

interface BedAssignmentDialogProps {
  isVisible: boolean
  allPatients: BedPatient[]
  bedLayout: BedLayout
  scheduleData: ScheduleEntry[]
  shifts: ShiftConfig[]
  freqMap?: Record<string, string>
  context?: { date?: string; shift?: string }
  isPageLocked?: boolean
  onClose: () => void
  onAssignBed: (patientId: string, bedId: string, shift: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BedAssignmentDialog({
  isVisible,
  allPatients,
  bedLayout,
  scheduleData,
  shifts,
  freqMap,
  context,
  isPageLocked,
  onClose,
  onAssignBed,
}: BedAssignmentDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [selectedBedId, setSelectedBedId] = useState<string | null>(null)
  const [selectedShift, setSelectedShift] = useState(context?.shift || shifts[0]?.value || 'early')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Build occupied beds map for the selected shift
  const occupiedBeds = useMemo(() => {
    const map = new Map<string, ScheduleEntry>()
    for (const entry of scheduleData) {
      if (entry.shift === selectedShift) {
        map.set(entry.bedId, entry)
      }
    }
    return map
  }, [scheduleData, selectedShift])

  // Already-assigned patient IDs for selected shift
  const assignedPatientIds = useMemo(() => {
    const set = new Set<string>()
    for (const entry of scheduleData) {
      if (entry.shift === selectedShift) {
        set.add(entry.patientId)
      }
    }
    return set
  }, [scheduleData, selectedShift])

  // Filter patients by search
  const filteredPatients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return allPatients
      .filter((p) => p.status !== 'deceased' && p.status !== 'discharged')
      .filter((p) => {
        if (!term) return true
        return (
          (p.name?.toLowerCase().includes(term)) ||
          (p.chartNo?.toLowerCase().includes(term)) ||
          (p.id.toLowerCase().includes(term))
        )
      })
      .sort((a, b) => {
        // Unassigned patients first
        const aAssigned = assignedPatientIds.has(a.id)
        const bAssigned = assignedPatientIds.has(b.id)
        if (aAssigned !== bAssigned) return aAssigned ? 1 : -1
        return (a.name || '').localeCompare(b.name || '', 'zh-TW')
      })
  }, [allPatients, searchTerm, assignedPatientIds])

  // Reset on open
  useEffect(() => {
    if (isVisible) {
      setSearchTerm('')
      setSelectedPatientId(null)
      setSelectedBedId(null)
      setSelectedShift(context?.shift || shifts[0]?.value || 'early')
      setValidationError(null)
    }
  }, [isVisible])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
  )

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [isVisible, handleKeyDown])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }

  // Validate and assign
  const handleConfirmAssignment = () => {
    if (!selectedPatientId) {
      setValidationError('請先選擇一位病患')
      return
    }
    if (!selectedBedId) {
      setValidationError('請先選擇一張床位')
      return
    }
    if (isPageLocked) {
      setValidationError('頁面已鎖定，無法進行排床操作')
      return
    }

    // Check if bed is already occupied
    const occupant = occupiedBeds.get(selectedBedId)
    if (occupant && occupant.patientId !== selectedPatientId) {
      setValidationError(`此床位已被指派給其他病患`)
      return
    }

    // Check if patient already assigned in this shift
    if (assignedPatientIds.has(selectedPatientId)) {
      const existingEntry = scheduleData.find(
        (e) => e.patientId === selectedPatientId && e.shift === selectedShift
      )
      if (existingEntry && existingEntry.bedId !== selectedBedId) {
        setValidationError('此病患在本班次已有床位，請先取消原床位')
        return
      }
    }

    // Hepatitis isolation check
    const patient = allPatients.find((p) => p.id === selectedPatientId)
    if (patient) {
      const isHepPositive =
        patient.hepatitisB === 'positive' || patient.hepatitisC === 'positive'
      if (isHepPositive) {
        const bedZone = bedLayout.beds.find((b) => b.bedId === selectedBedId)?.zone
        if (bedZone && bedZone !== 'isolation') {
          // Warn but allow
          const proceed = window.confirm(
            '注意：此病患有肝炎陽性標記，建議安排至隔離區域床位。是否繼續？'
          )
          if (!proceed) return
        }
      }
    }

    setValidationError(null)
    onAssignBed(selectedPatientId, selectedBedId, selectedShift)
  }

  const handleBedClick = (bed: BedCell) => {
    if (!bed.isAvailable && !occupiedBeds.has(bed.bedId)) {
      // Bed physically unavailable
      return
    }
    setSelectedBedId(bed.bedId)
    setValidationError(null)
  }

  if (!isVisible) return null

  const selectedPatient = allPatients.find((p) => p.id === selectedPatientId)

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bed-assign-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="bed-assign-title" className={styles.title}>
            排床作業
          </h2>
          <div className={styles.headerRight}>
            {context?.date && <span className={styles.dateDisplay}>{context.date}</span>}
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
              &times;
            </button>
          </div>
        </div>

        <div className={styles.body}>
          {/* Left: Patient search */}
          <div className={styles.leftPanel}>
            <h3 className={styles.panelTitle}>選擇病患</h3>

            <input
              type="text"
              className={styles.searchInput}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋姓名或病歷號..."
            />

            <div className={styles.patientList}>
              {filteredPatients.length === 0 ? (
                <div className={styles.emptyList}>無符合的病患</div>
              ) : (
                filteredPatients.map((p) => {
                  const isAssigned = assignedPatientIds.has(p.id)
                  const isSelected = selectedPatientId === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`${styles.patientItem} ${isSelected ? styles.patientItemSelected : ''} ${isAssigned ? styles.patientItemAssigned : ''}`}
                      onClick={() => {
                        setSelectedPatientId(p.id)
                        setValidationError(null)
                      }}
                    >
                      <div className={styles.patientItemName}>
                        {p.name || p.id}
                        {isAssigned && <span className={styles.assignedBadge}>已排</span>}
                      </div>
                      <div className={styles.patientItemMeta}>
                        {p.chartNo && <span>{p.chartNo}</span>}
                        {freqMap && freqMap[p.id] && <span>{freqMap[p.id]}</span>}
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Right: Bed grid + shift selector */}
          <div className={styles.rightPanel}>
            <div className={styles.shiftSelector}>
              <h3 className={styles.panelTitle}>選擇班次</h3>
              <div className={styles.shiftButtons}>
                {shifts.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className={`${styles.shiftButton} ${selectedShift === s.value ? styles.shiftButtonActive : ''}`}
                    onClick={() => {
                      setSelectedShift(s.value)
                      setSelectedBedId(null)
                      setValidationError(null)
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <h3 className={styles.panelTitle}>選擇床位</h3>
            <div className={styles.bedGrid}>
              {bedLayout.beds.map((bed) => {
                const occupant = occupiedBeds.get(bed.bedId)
                const isOccupied = Boolean(occupant)
                const isSelected = selectedBedId === bed.bedId
                const isUnavailable = bed.isAvailable === false
                const occupantName = occupant
                  ? allPatients.find((p) => p.id === occupant.patientId)?.name || '已佔用'
                  : ''

                return (
                  <button
                    key={bed.bedId}
                    type="button"
                    className={`${styles.bedCell} ${isSelected ? styles.bedCellSelected : ''} ${isOccupied ? styles.bedCellOccupied : ''} ${isUnavailable ? styles.bedCellUnavailable : ''}`}
                    onClick={() => handleBedClick(bed)}
                    disabled={isUnavailable}
                    title={isOccupied ? `${bed.label}: ${occupantName}` : bed.label}
                  >
                    <span className={styles.bedLabel}>{bed.label}</span>
                    {isOccupied && (
                      <span className={styles.bedOccupant}>{occupantName}</span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Legend */}
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendAvailable}`} /> 可用
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendOccupied}`} /> 已佔用
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendUnavailable}`} /> 不可用
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendSelected}`} /> 已選取
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {/* Selection summary */}
          <div className={styles.summary}>
            <span className={styles.summaryItem}>
              病患: <strong>{selectedPatient?.name || '尚未選擇'}</strong>
            </span>
            <span className={styles.summaryItem}>
              床位: <strong>{selectedBedId || '尚未選擇'}</strong>
            </span>
            <span className={styles.summaryItem}>
              班次: <strong>{shifts.find((s) => s.value === selectedShift)?.label || selectedShift}</strong>
            </span>
          </div>

          {validationError && <div className={styles.validationError}>{validationError}</div>}

          <div className={styles.footerButtons}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={handleConfirmAssignment}
              disabled={!selectedPatientId || !selectedBedId || isPageLocked}
            >
              確認排床
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
