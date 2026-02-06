import { useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import styles from '@/components/PreparationPopover.module.css'

interface PreparationPopoverProps {
  isVisible: boolean
  patients: any[]
  targetElement?: HTMLElement
  onClose: () => void
  onOpenOrderModal?: (patient: any) => void
}

interface PrepField {
  key: string
  label: string
}

const PREP_FIELDS: PrepField[] = [
  { key: 'ak', label: 'AK' },
  { key: 'ca', label: 'Ca' },
  { key: 'heparin', label: 'Heparin' },
  { key: 'bf', label: 'BF' },
  { key: 'vascularAccess', label: '血管通路' },
]

function getFieldValue(patient: any, fieldKey: string): string {
  // Check multiple possible data paths
  const order = patient?.currentOrder ?? patient?.order ?? {}
  const prep = patient?.preparation ?? {}

  switch (fieldKey) {
    case 'ak':
      return (
        order.ak ??
        prep.ak ??
        patient?.ak ??
        ''
      )
    case 'ca':
      return (
        order.ca ??
        prep.ca ??
        order.caBath ??
        patient?.ca ??
        ''
      )
    case 'heparin':
      return (
        order.heparin ??
        prep.heparin ??
        patient?.heparin ??
        ''
      )
    case 'bf':
      return (
        order.bf ??
        prep.bf ??
        order.bloodFlow ??
        patient?.bf ??
        ''
      )
    case 'vascularAccess':
      return (
        patient?.vascularAccess ??
        patient?.access ??
        patient?.accessType ??
        prep.vascularAccess ??
        ''
      )
    default:
      return ''
  }
}

function formatFieldValue(value: string, fieldKey: string): string {
  if (!value) return ''
  if (fieldKey === 'bf') return `${value} mL/min`
  if (fieldKey === 'heparin') return `${value}`
  return value
}

export default function PreparationPopover({
  isVisible,
  patients,
  targetElement,
  onClose,
  onOpenOrderModal,
}: PreparationPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  const position = useMemo(() => {
    if (!targetElement) return { top: 100, left: 100 }
    const rect = targetElement.getBoundingClientRect()
    return {
      top: rect.bottom + 8,
      left: Math.max(10, rect.left),
    }
  }, [targetElement])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    if (isVisible) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isVisible, handleKeyDown])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    },
    [onClose]
  )

  const handleOrderClick = useCallback(
    (patient: any) => {
      onOpenOrderModal?.(patient)
    },
    [onOpenOrderModal]
  )

  if (!isVisible) return null

  const popoverContent = (
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={popoverRef}
        className={styles.popover}
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.popoverArrow} />
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>
            準備確認 ({patients.length} 位病人)
          </h3>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="關閉"
          >
            {'\u00D7'}
          </button>
        </div>

        {patients.length === 0 ? (
          <div className={styles.body}>
            <div className={styles.emptyState}>目前無需準備的病人</div>
          </div>
        ) : (
          <div className={styles.body}>
            {/* Column Headers */}
            <div className={styles.columnHeaders}>
              <div className={styles.colHeaderInfo}>病人</div>
              <div className={styles.colHeaderFields}>
                {PREP_FIELDS.map((field) => (
                  <div key={field.key} className={styles.colHeaderField}>
                    {field.label}
                  </div>
                ))}
              </div>
              {onOpenOrderModal && (
                <div className={styles.colHeaderAction}>操作</div>
              )}
            </div>

            {/* Patient Rows */}
            <div className={styles.patientList}>
              {patients.map((patient) => {
                const patientId = patient?.id ?? ''
                return (
                  <div key={patientId} className={styles.patientRow}>
                    <div className={styles.patientInfo}>
                      <div className={styles.patientName}>
                        {patient?.name ?? '--'}
                      </div>
                      {(patient?.bedNo ?? patient?.bed) && (
                        <div className={styles.bedNo}>
                          床號: {patient.bedNo ?? patient.bed}
                        </div>
                      )}
                    </div>

                    <div className={styles.prepFields}>
                      {PREP_FIELDS.map((field) => {
                        const rawValue = getFieldValue(patient, field.key)
                        const hasMissing = !rawValue
                        const displayValue = rawValue
                          ? formatFieldValue(rawValue, field.key)
                          : '未設定'

                        return (
                          <div key={field.key} className={styles.prepField}>
                            <span className={styles.prepLabel}>
                              {field.label}
                            </span>
                            <span
                              className={
                                hasMissing
                                  ? styles.prepValueMissing
                                  : styles.prepValue
                              }
                            >
                              {displayValue}
                            </span>
                          </div>
                        )
                      })}
                    </div>

                    {onOpenOrderModal && (
                      <div className={styles.actionCol}>
                        <button
                          type="button"
                          className={styles.orderBtn}
                          onClick={() => handleOrderClick(patient)}
                        >
                          醫囑
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(popoverContent, document.body)
}
