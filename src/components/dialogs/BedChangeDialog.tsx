import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import styles from '@/components/dialogs/BedChangeDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BedChangePatient {
  id: string
  name?: string
  chartNo?: string
  shift?: string
  bed?: string
  frequency?: string
  hepatitisB?: string
  hepatitisC?: string
  [key: string]: unknown
}

export interface BedChangeCell {
  bedId: string
  label: string
  zone?: string
  isAvailable?: boolean
}

export interface BedChangeLayout {
  beds: BedChangeCell[]
}

export interface BedChangeScheduleEntry {
  patientId: string
  bedId: string
  shift: string
  date: string
  [key: string]: unknown
}

export interface BedChangeShift {
  value: string
  label: string
}

interface BedChangeDialogProps {
  isVisible: boolean
  patient: BedChangePatient | null
  allPatients: BedChangePatient[]
  bedLayout: BedChangeLayout
  scheduleData: BedChangeScheduleEntry[]
  shifts: BedChangeShift[]
  onClose: () => void
  onBedChanged: (patientId: string, fromBedId: string, toBedId: string, shift: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BedChangeDialog({
  isVisible,
  patient,
  allPatients,
  bedLayout,
  scheduleData,
  shifts,
  onClose,
  onBedChanged,
}: BedChangeDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [targetBedId, setTargetBedId] = useState<string | null>(null)
  const [targetShift, setTargetShift] = useState<string>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const currentBedId = patient?.bed || ''
  const currentShift = patient?.shift || ''

  // Build occupied map for target shift
  const occupiedBeds = useMemo(() => {
    const map = new Map<string, BedChangeScheduleEntry>()
    const shift = targetShift || currentShift
    for (const entry of scheduleData) {
      if (entry.shift === shift) {
        map.set(entry.bedId, entry)
      }
    }
    return map
  }, [scheduleData, targetShift, currentShift])

  // Available beds (not occupied and isAvailable !== false)
  const availableBeds = useMemo(() => {
    return bedLayout.beds.filter((bed) => {
      if (bed.isAvailable === false) return false
      if (bed.bedId === currentBedId) return false // Exclude current bed
      const occupant = occupiedBeds.get(bed.bedId)
      return !occupant
    })
  }, [bedLayout.beds, occupiedBeds, currentBedId])

  // Reset on open
  useEffect(() => {
    if (isVisible && patient) {
      setTargetBedId(null)
      setTargetShift(patient.shift || shifts[0]?.value || '')
      setReason('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [isVisible, patient])

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

  // Validate compatibility
  const validateChange = (): boolean => {
    if (!patient) {
      setError('未選擇病患')
      return false
    }
    if (!targetBedId) {
      setError('請選擇目標床位')
      return false
    }
    if (targetBedId === currentBedId && (targetShift || currentShift) === currentShift) {
      setError('目標床位與目前床位相同')
      return false
    }

    // Check isolation constraint
    const isHepPositive =
      patient.hepatitisB === 'positive' || patient.hepatitisC === 'positive'
    const targetBed = bedLayout.beds.find((b) => b.bedId === targetBedId)
    if (isHepPositive && targetBed?.zone && targetBed.zone !== 'isolation') {
      const proceed = window.confirm(
        '注意：此病患有肝炎陽性標記，建議安排至隔離區域。是否繼續？'
      )
      if (!proceed) return false
    }

    return true
  }

  const handleSubmit = async () => {
    if (!validateChange()) return
    setIsSubmitting(true)
    try {
      onBedChanged(patient!.id, currentBedId, targetBedId!, targetShift || currentShift)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isVisible || !patient) return null

  const shiftMap: Record<string, string> = {}
  for (const s of shifts) shiftMap[s.value] = s.label

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="bed-change-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="bed-change-title" className={styles.title}>
            換床作業
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {/* Current info */}
          <div className={styles.currentInfo}>
            <h3 className={styles.sectionTitle}>目前資訊</h3>
            <div className={styles.infoRow}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>病患</span>
                <span className={styles.infoValue}>{patient.name || patient.id}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>病歷號</span>
                <span className={styles.infoValue}>{patient.chartNo || '—'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>目前床位</span>
                <span className={styles.infoValueHighlight}>{currentBedId || '—'}</span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>目前班次</span>
                <span className={styles.infoValue}>{shiftMap[currentShift] || currentShift || '—'}</span>
              </div>
            </div>
          </div>

          {/* Target shift */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>目標班次</h3>
            <div className={styles.shiftSelector}>
              {shifts.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`${styles.shiftButton} ${(targetShift || currentShift) === s.value ? styles.shiftButtonActive : ''}`}
                  onClick={() => {
                    setTargetShift(s.value)
                    setTargetBedId(null)
                    setError(null)
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Available beds */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>
              可用床位 ({availableBeds.length})
            </h3>
            {availableBeds.length === 0 ? (
              <div className={styles.emptyBeds}>該班次無可用床位</div>
            ) : (
              <div className={styles.bedGrid}>
                {availableBeds.map((bed) => {
                  const isSelected = targetBedId === bed.bedId
                  return (
                    <button
                      key={bed.bedId}
                      type="button"
                      className={`${styles.bedCell} ${isSelected ? styles.bedCellSelected : ''}`}
                      onClick={() => {
                        setTargetBedId(bed.bedId)
                        setError(null)
                      }}
                    >
                      <span className={styles.bedLabel}>{bed.label}</span>
                      {bed.zone && <span className={styles.bedZone}>{bed.zone}</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Reason */}
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>換床原因 (選填)</h3>
            <textarea
              className={styles.reasonInput}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="請輸入換床原因..."
              rows={2}
            />
          </div>

          {/* Transfer summary */}
          {targetBedId && (
            <div className={styles.transferSummary}>
              <span className={styles.fromBed}>{currentBedId || '—'}</span>
              <span className={styles.arrow}>&#8594;</span>
              <span className={styles.toBed}>{targetBedId}</span>
              {targetShift && targetShift !== currentShift && (
                <>
                  <span className={styles.shiftChange}>
                    ({shiftMap[currentShift] || currentShift} &#8594; {shiftMap[targetShift] || targetShift})
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {error && <div className={styles.errorMessage}>{error}</div>}
          <div className={styles.footerButtons}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
              取消
            </button>
            <button
              type="button"
              className={styles.confirmButton}
              onClick={handleSubmit}
              disabled={!targetBedId || isSubmitting}
            >
              {isSubmitting ? '處理中...' : '確認換床'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
