import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/InpatientRoundsDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientRound {
  id: string
  name: string
  bedNumber: string
  diagnosis?: string
}

interface VitalSigns {
  systolic: string
  diastolic: string
  heartRate: string
  temperature: string
  spo2: string
  respiratoryRate: string
}

interface RoundEntry {
  patientId: string
  vitals: VitalSigns
  notes: string
  assessedAt: string
  assessedBy: string
}

interface InpatientRoundsDialogProps {
  isVisible: boolean
  patients?: PatientRound[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const EMPTY_VITALS: VitalSigns = {
  systolic: '',
  diastolic: '',
  heartRate: '',
  temperature: '',
  spo2: '',
  respiratoryRate: '',
}

const DEFAULT_PATIENTS: PatientRound[] = [
  { id: 'p1', name: '王大明', bedNumber: '301-A', diagnosis: '慢性腎病第五期' },
  { id: 'p2', name: '林小芳', bedNumber: '301-B', diagnosis: '糖尿病腎病變' },
  { id: 'p3', name: '張志偉', bedNumber: '302-A', diagnosis: '高血壓腎病變' },
  { id: 'p4', name: '陳美珠', bedNumber: '302-B', diagnosis: '多囊性腎病變' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InpatientRoundsDialog({
  isVisible,
  patients,
  onClose,
}: InpatientRoundsDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const patientList = patients && patients.length > 0 ? patients : DEFAULT_PATIENTS

  const [selectedPatientId, setSelectedPatientId] = useState<string>('')
  const [vitalsMap, setVitalsMap] = useState<Record<string, VitalSigns>>({})
  const [notesMap, setNotesMap] = useState<Record<string, string>>({})
  const [savedEntries, setSavedEntries] = useState<RoundEntry[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // Select first patient on open
  useEffect(() => {
    if (isVisible && patientList.length > 0 && !selectedPatientId) {
      setSelectedPatientId(patientList[0].id)
    }
  }, [isVisible, patientList, selectedPatientId])

  // Reset on close
  useEffect(() => {
    if (!isVisible) {
      setSelectedPatientId('')
      setVitalsMap({})
      setNotesMap({})
      setSavedEntries([])
      setSaveMessage('')
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

  // Vitals management
  const currentVitals = vitalsMap[selectedPatientId] || EMPTY_VITALS
  const currentNotes = notesMap[selectedPatientId] || ''

  const updateVital = (field: keyof VitalSigns, value: string) => {
    setVitalsMap((prev) => ({
      ...prev,
      [selectedPatientId]: {
        ...(prev[selectedPatientId] || EMPTY_VITALS),
        [field]: value,
      },
    }))
  }

  const updateNotes = (value: string) => {
    setNotesMap((prev) => ({
      ...prev,
      [selectedPatientId]: value,
    }))
  }

  // Check if patient has been saved
  const isPatientSaved = (pid: string) => savedEntries.some((e) => e.patientId === pid)

  // Save single patient round
  const handleSaveRound = async () => {
    if (!selectedPatientId) return
    setIsSaving(true)
    setSaveMessage('')
    await new Promise((resolve) => setTimeout(resolve, 400))

    const entry: RoundEntry = {
      patientId: selectedPatientId,
      vitals: currentVitals,
      notes: currentNotes,
      assessedAt: new Date().toISOString(),
      assessedBy: '目前使用者',
    }

    setSavedEntries((prev) => {
      const filtered = prev.filter((e) => e.patientId !== selectedPatientId)
      return [...filtered, entry]
    })
    setIsSaving(false)
    setSaveMessage('已儲存')
    setTimeout(() => setSaveMessage(''), 2000)
  }

  // Save all rounds
  const handleSaveAll = async () => {
    setIsSaving(true)
    setSaveMessage('')
    await new Promise((resolve) => setTimeout(resolve, 600))

    const entries: RoundEntry[] = patientList.map((p) => ({
      patientId: p.id,
      vitals: vitalsMap[p.id] || EMPTY_VITALS,
      notes: notesMap[p.id] || '',
      assessedAt: new Date().toISOString(),
      assessedBy: '目前使用者',
    }))

    setSavedEntries(entries)
    setIsSaving(false)
    setSaveMessage('全部已儲存')
    setTimeout(() => setSaveMessage(''), 2000)
  }

  const selectedPatient = patientList.find((p) => p.id === selectedPatientId)

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="rounds-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="rounds-title" className={styles.title}>住院巡房記錄</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <div className={styles.content}>
          {/* Patient sidebar */}
          <div className={styles.sidebar}>
            <div className={styles.sidebarHeader}>患者列表</div>
            <ul className={styles.patientList}>
              {patientList.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`${styles.patientItem} ${selectedPatientId === p.id ? styles.patientItemActive : ''}`}
                    onClick={() => setSelectedPatientId(p.id)}
                  >
                    <span className={styles.bedNumber}>{p.bedNumber}</span>
                    <span className={styles.patientName}>{p.name}</span>
                    {isPatientSaved(p.id) && (
                      <span className={styles.savedIndicator} title="已記錄">&#10003;</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.sidebarFooter}>
              <span className={styles.progressText}>
                已記錄 {savedEntries.length}/{patientList.length}
              </span>
            </div>
          </div>

          {/* Main form area */}
          <div className={styles.formArea}>
            {selectedPatient ? (
              <>
                <div className={styles.patientInfo}>
                  <h3 className={styles.patientTitle}>
                    {selectedPatient.bedNumber} - {selectedPatient.name}
                  </h3>
                  {selectedPatient.diagnosis && (
                    <span className={styles.diagnosisBadge}>{selectedPatient.diagnosis}</span>
                  )}
                </div>

                {/* Vital signs grid */}
                <div className={styles.vitalsSection}>
                  <h4 className={styles.sectionLabel}>生命徵象</h4>
                  <div className={styles.vitalsGrid}>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-systolic">收縮壓</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-systolic"
                          type="number"
                          className={styles.vitalInput}
                          value={currentVitals.systolic}
                          onChange={(e) => updateVital('systolic', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>mmHg</span>
                      </div>
                    </div>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-diastolic">舒張壓</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-diastolic"
                          type="number"
                          className={styles.vitalInput}
                          value={currentVitals.diastolic}
                          onChange={(e) => updateVital('diastolic', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>mmHg</span>
                      </div>
                    </div>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-hr">心率</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-hr"
                          type="number"
                          className={styles.vitalInput}
                          value={currentVitals.heartRate}
                          onChange={(e) => updateVital('heartRate', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>bpm</span>
                      </div>
                    </div>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-temp">體溫</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-temp"
                          type="number"
                          step="0.1"
                          className={styles.vitalInput}
                          value={currentVitals.temperature}
                          onChange={(e) => updateVital('temperature', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>&deg;C</span>
                      </div>
                    </div>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-spo2">SpO2</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-spo2"
                          type="number"
                          className={styles.vitalInput}
                          value={currentVitals.spo2}
                          onChange={(e) => updateVital('spo2', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>%</span>
                      </div>
                    </div>
                    <div className={styles.vitalField}>
                      <label className={styles.vitalLabel} htmlFor="vs-rr">呼吸</label>
                      <div className={styles.vitalInputGroup}>
                        <input
                          id="vs-rr"
                          type="number"
                          className={styles.vitalInput}
                          value={currentVitals.respiratoryRate}
                          onChange={(e) => updateVital('respiratoryRate', e.target.value)}
                          placeholder="--"
                        />
                        <span className={styles.vitalUnit}>次/分</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Notes */}
                <div className={styles.notesSection}>
                  <h4 className={styles.sectionLabel}>巡房備註</h4>
                  <textarea
                    className={styles.notesTextarea}
                    value={currentNotes}
                    onChange={(e) => updateNotes(e.target.value)}
                    placeholder="請輸入巡房觀察記錄..."
                    rows={4}
                  />
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>請從左側選擇患者</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {saveMessage && <span className={styles.saveMessage}>{saveMessage}</span>}
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleSaveRound}
            disabled={isSaving || !selectedPatientId}
          >
            儲存此患者
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSaveAll}
            disabled={isSaving}
          >
            {isSaving ? '儲存中...' : '全部儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
