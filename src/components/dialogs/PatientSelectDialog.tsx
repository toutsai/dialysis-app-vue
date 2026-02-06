import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { Patient } from '@/stores/patientStore'
import styles from '@/components/dialogs/PatientSelectDialog.module.css'

type PatientStatusFilter = 'all' | 'regular' | 'opd'

interface PatientSelectDialogProps {
  isVisible: boolean
  title?: string
  patients: Patient[]
  showFillOptions?: boolean
  patientStatusFilter?: PatientStatusFilter
  onConfirm: (patient: Patient) => void
  onCancel: () => void
}

const STATUS_TABS: { label: string; value: PatientStatusFilter }[] = [
  { label: '全部', value: 'all' },
  { label: '常規', value: 'regular' },
  { label: '門診', value: 'opd' },
]

export default function PatientSelectDialog({
  isVisible,
  title = '選擇病患',
  patients,
  showFillOptions = false,
  patientStatusFilter: initialFilter = 'all',
  onConfirm,
  onCancel,
}: PatientSelectDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<PatientStatusFilter>(initialFilter)

  // Reset state when dialog opens
  useEffect(() => {
    if (isVisible) {
      setSearchQuery('')
      setStatusFilter(initialFilter)
      // Focus search input after animation
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isVisible, initialFilter])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
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
    if (e.target === overlayRef.current) {
      onCancel()
    }
  }

  // Filter patients based on search query and status filter
  const filteredPatients = useMemo(() => {
    let result = patients.filter((p) => !p.isDeleted)

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter)
    }

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter((p) => {
        const name = (p.name || '').toLowerCase()
        const id = (p.id || '').toLowerCase()
        return name.includes(query) || id.includes(query)
      })
    }

    return result
  }, [patients, statusFilter, searchQuery])

  const handlePatientSelect = (patient: Patient) => {
    onConfirm(patient)
  }

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="patient-select-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="patient-select-title" className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onCancel}
            aria-label="關閉"
          >
            &times;
          </button>
        </div>

        {/* Search input */}
        <div className={styles.searchContainer}>
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜尋病患姓名或 ID..."
            autoComplete="off"
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setSearchQuery('')}
              aria-label="清除搜尋"
            >
              &times;
            </button>
          )}
        </div>

        {/* Status filter tabs */}
        <div className={styles.filterTabs}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`${styles.filterTab} ${statusFilter === tab.value ? styles.filterTabActive : ''}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Fill options hint */}
        {showFillOptions && (
          <div className={styles.fillOptionsHint}>
            點選病患以填入排程
          </div>
        )}

        {/* Patient list */}
        <div className={styles.patientList}>
          {filteredPatients.length === 0 ? (
            <div className={styles.emptyState}>
              {searchQuery ? '查無符合條件的病患' : '目前沒有病患資料'}
            </div>
          ) : (
            filteredPatients.map((patient) => (
              <button
                key={patient.id}
                type="button"
                className={styles.patientItem}
                onClick={() => handlePatientSelect(patient)}
              >
                <div className={styles.patientInfo}>
                  <span className={styles.patientName}>
                    {patient.name || '(未命名)'}
                  </span>
                  <span className={styles.patientId}>{patient.id}</span>
                </div>
                <span
                  className={`${styles.statusBadge} ${
                    patient.status === 'regular'
                      ? styles.statusRegular
                      : patient.status === 'opd'
                        ? styles.statusOpd
                        : styles.statusOther
                  }`}
                >
                  {patient.status === 'regular'
                    ? '常規'
                    : patient.status === 'opd'
                      ? '門診'
                      : patient.status || '-'}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer with count and cancel */}
        <div className={styles.footer}>
          <span className={styles.countLabel}>
            共 {filteredPatients.length} 位病患
          </span>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
