import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/NewUpdateTypeDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientInfo {
  id: string
  name?: string
  status?: string
  [key: string]: unknown
}

interface ChangeTypeOption {
  id: string
  label: string
  description: string
  icon: string
}

interface NewUpdateTypeDialogProps {
  isVisible: boolean
  allPatients?: PatientInfo[]
  onClose: () => void
  onContinue: (type: string, patient: PatientInfo) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHANGE_TYPES: ChangeTypeOption[] = [
  {
    id: 'status_change',
    label: '狀態變更',
    description: '變更患者狀態（如：門診轉住院、住院轉門診等）',
    icon: '\u21C4',
  },
  {
    id: 'mode_change',
    label: '透析模式變更',
    description: '變更透析模式（如：HD 轉 HDF、CAPD 轉 APD 等）',
    icon: '\u2699',
  },
  {
    id: 'frequency_change',
    label: '透析頻率變更',
    description: '變更透析頻率（如：每週二次轉三次、調整透析日等）',
    icon: '\u23F0',
  },
  {
    id: 'delete_restore',
    label: '刪除/復原',
    description: '刪除患者排程或復原已刪除的排程',
    icon: '\u2702',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NewUpdateTypeDialog({
  isVisible,
  allPatients,
  onClose,
  onContinue,
}: NewUpdateTypeDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [step, setStep] = useState<'type' | 'patient'>('type')
  const [selectedType, setSelectedType] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPatient, setSelectedPatient] = useState<PatientInfo | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Reset on open/close
  useEffect(() => {
    if (isVisible) {
      setStep('type')
      setSelectedType('')
      setSearchQuery('')
      setSelectedPatient(null)
    }
  }, [isVisible])

  // Focus search input when step changes to patient
  useEffect(() => {
    if (step === 'patient' && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [step])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (step === 'patient') {
          setStep('type')
        } else {
          onClose()
        }
      }
    },
    [onClose, step]
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

  const handleSelectType = (typeId: string) => {
    setSelectedType(typeId)
    setStep('patient')
  }

  const handleSelectPatient = (patient: PatientInfo) => {
    setSelectedPatient(patient)
  }

  const handleContinue = () => {
    if (selectedType && selectedPatient) {
      onContinue(selectedType, selectedPatient)
    }
  }

  // Filter patients
  const filteredPatients = (allPatients || []).filter((p) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      (p.name && p.name.toLowerCase().includes(query)) ||
      p.id.toLowerCase().includes(query)
    )
  })

  const selectedTypeInfo = CHANGE_TYPES.find((t) => t.id === selectedType)

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="update-type-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {step === 'patient' && (
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setStep('type')}
              >
                &larr;
              </button>
            )}
            <h2 id="update-type-title" className={styles.title}>
              {step === 'type' ? '選擇變更類型' : '選擇患者'}
            </h2>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={`${styles.stepDot} ${step === 'type' ? styles.stepActive : styles.stepDone}`}>
            1
          </div>
          <div className={styles.stepLine} />
          <div className={`${styles.stepDot} ${step === 'patient' ? styles.stepActive : ''}`}>
            2
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {step === 'type' ? (
            <div className={styles.typeGrid}>
              {CHANGE_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  className={`${styles.typeCard} ${selectedType === ct.id ? styles.typeCardSelected : ''}`}
                  onClick={() => handleSelectType(ct.id)}
                >
                  <span className={styles.typeIcon}>{ct.icon}</span>
                  <span className={styles.typeLabel}>{ct.label}</span>
                  <span className={styles.typeDescription}>{ct.description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.patientSelect}>
              {selectedTypeInfo && (
                <div className={styles.selectedTypeInfo}>
                  <span className={styles.selectedTypeIcon}>{selectedTypeInfo.icon}</span>
                  <span className={styles.selectedTypeLabel}>{selectedTypeInfo.label}</span>
                </div>
              )}

              <div className={styles.searchBox}>
                <input
                  ref={searchInputRef}
                  type="text"
                  className={styles.searchInput}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜尋患者姓名或 ID..."
                />
              </div>

              <div className={styles.patientListContainer}>
                {filteredPatients.length === 0 ? (
                  <div className={styles.empty}>
                    {allPatients && allPatients.length > 0
                      ? '無符合搜尋條件的患者'
                      : '尚無患者資料'}
                  </div>
                ) : (
                  <div className={styles.patientList}>
                    {filteredPatients.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        className={`${styles.patientItem} ${selectedPatient?.id === patient.id ? styles.patientItemSelected : ''}`}
                        onClick={() => handleSelectPatient(patient)}
                      >
                        <span className={styles.patientId}>{patient.id}</span>
                        <span className={styles.patientName}>{patient.name || '未命名'}</span>
                        {patient.status && (
                          <span className={styles.patientStatus}>{patient.status}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            取消
          </button>
          {step === 'patient' && (
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleContinue}
              disabled={!selectedPatient}
            >
              繼續
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
