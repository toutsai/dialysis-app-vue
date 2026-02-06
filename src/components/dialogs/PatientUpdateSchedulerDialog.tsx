import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/PatientUpdateSchedulerDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientInfo {
  id: string
  name?: string
  status?: string
  [key: string]: unknown
}

interface ScheduleFormData {
  effectiveDate: string
  newStatus?: string
  newMode?: string
  newFrequency?: string
  scheduleDays?: string[]
  reason: string
  notes: string
}

interface PatientUpdateSchedulerDialogProps {
  isVisible: boolean
  patient?: PatientInfo
  changeType?: string
  allPatients?: PatientInfo[]
  isEditing?: boolean
  initialData?: Partial<ScheduleFormData>
  onClose: () => void
  onSubmit: (data: ScheduleFormData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { value: 'opd', label: '門診' },
  { value: 'inpatient', label: '住院' },
  { value: 'icu', label: '加護病房' },
  { value: 'transferred', label: '轉院' },
  { value: 'discharged', label: '出院' },
  { value: 'deceased', label: '往生' },
]

const MODE_OPTIONS = [
  { value: 'HD', label: 'HD (血液透析)' },
  { value: 'HDF', label: 'HDF (血液透析過濾)' },
  { value: 'CAPD', label: 'CAPD (連續性腹膜透析)' },
  { value: 'APD', label: 'APD (自動腹膜透析)' },
]

const FREQUENCY_OPTIONS = [
  { value: '2x', label: '每週 2 次' },
  { value: '3x', label: '每週 3 次' },
  { value: '4x', label: '每週 4 次' },
  { value: 'daily', label: '每日' },
]

const WEEKDAYS = [
  { value: 'mon', label: '一' },
  { value: 'tue', label: '二' },
  { value: 'wed', label: '三' },
  { value: 'thu', label: '四' },
  { value: 'fri', label: '五' },
  { value: 'sat', label: '六' },
  { value: 'sun', label: '日' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientUpdateSchedulerDialog({
  isVisible,
  patient,
  changeType,
  isEditing = false,
  initialData,
  onClose,
  onSubmit,
}: PatientUpdateSchedulerDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const [formData, setFormData] = useState<ScheduleFormData>({
    effectiveDate: new Date().toISOString().split('T')[0],
    newStatus: '',
    newMode: '',
    newFrequency: '',
    scheduleDays: [],
    reason: '',
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Initialize form when opening
  useEffect(() => {
    if (!isVisible) return
    if (initialData) {
      setFormData((prev) => ({ ...prev, ...initialData }))
    } else {
      setFormData({
        effectiveDate: new Date().toISOString().split('T')[0],
        newStatus: '',
        newMode: '',
        newFrequency: '',
        scheduleDays: [],
        reason: '',
        notes: '',
      })
    }
    setErrors({})
  }, [isVisible, initialData])

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

  const updateField = <K extends keyof ScheduleFormData>(
    field: K,
    value: ScheduleFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const toggleDay = (day: string) => {
    setFormData((prev) => {
      const days = prev.scheduleDays || []
      return {
        ...prev,
        scheduleDays: days.includes(day)
          ? days.filter((d) => d !== day)
          : [...days, day],
      }
    })
  }

  // Validate
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.effectiveDate) {
      newErrors.effectiveDate = '請選擇生效日期'
    }

    if (changeType === 'status_change' && !formData.newStatus) {
      newErrors.newStatus = '請選擇新狀態'
    }

    if (changeType === 'mode_change' && !formData.newMode) {
      newErrors.newMode = '請選擇新透析模式'
    }

    if (changeType === 'frequency_change') {
      if (!formData.newFrequency) {
        newErrors.newFrequency = '請選擇新頻率'
      }
      if (!formData.scheduleDays || formData.scheduleDays.length === 0) {
        newErrors.scheduleDays = '請選擇透析日'
      }
    }

    if (!formData.reason.trim()) {
      newErrors.reason = '請填寫變更原因'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Submit
  const handleSubmit = async () => {
    if (!validate()) return
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 500))
    onSubmit(formData)
    setIsSaving(false)
  }

  const getChangeTypeLabel = () => {
    switch (changeType) {
      case 'status_change':
        return '狀態變更'
      case 'mode_change':
        return '透析模式變更'
      case 'frequency_change':
        return '透析頻率變更'
      case 'delete_restore':
        return '刪除/復原'
      default:
        return '排程變更'
    }
  }

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="scheduler-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 id="scheduler-title" className={styles.title}>
              {isEditing ? '編輯' : '新增'}{getChangeTypeLabel()}
            </h2>
            <span className={styles.typeBadge}>{getChangeTypeLabel()}</span>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Patient info */}
          {patient && (
            <div className={styles.patientBar}>
              <span className={styles.patientLabel}>患者：</span>
              <span className={styles.patientValue}>
                {patient.name || patient.id}
              </span>
              {patient.status && (
                <span className={styles.statusBadge}>{patient.status}</span>
              )}
            </div>
          )}

          <div className={styles.form}>
            {/* Effective date */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="effective-date">
                生效日期 <span className={styles.required}>*</span>
              </label>
              <input
                id="effective-date"
                type="date"
                className={`${styles.formInput} ${errors.effectiveDate ? styles.inputError : ''}`}
                value={formData.effectiveDate}
                onChange={(e) => updateField('effectiveDate', e.target.value)}
              />
              {errors.effectiveDate && (
                <span className={styles.errorText}>{errors.effectiveDate}</span>
              )}
            </div>

            {/* Status change */}
            {changeType === 'status_change' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-status">
                  新狀態 <span className={styles.required}>*</span>
                </label>
                <select
                  id="new-status"
                  className={`${styles.formSelect} ${errors.newStatus ? styles.inputError : ''}`}
                  value={formData.newStatus}
                  onChange={(e) => updateField('newStatus', e.target.value)}
                >
                  <option value="">-- 請選擇 --</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.newStatus && (
                  <span className={styles.errorText}>{errors.newStatus}</span>
                )}
              </div>
            )}

            {/* Mode change */}
            {changeType === 'mode_change' && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel} htmlFor="new-mode">
                  新透析模式 <span className={styles.required}>*</span>
                </label>
                <select
                  id="new-mode"
                  className={`${styles.formSelect} ${errors.newMode ? styles.inputError : ''}`}
                  value={formData.newMode}
                  onChange={(e) => updateField('newMode', e.target.value)}
                >
                  <option value="">-- 請選擇 --</option>
                  {MODE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {errors.newMode && (
                  <span className={styles.errorText}>{errors.newMode}</span>
                )}
              </div>
            )}

            {/* Frequency change */}
            {changeType === 'frequency_change' && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel} htmlFor="new-frequency">
                    新頻率 <span className={styles.required}>*</span>
                  </label>
                  <select
                    id="new-frequency"
                    className={`${styles.formSelect} ${errors.newFrequency ? styles.inputError : ''}`}
                    value={formData.newFrequency}
                    onChange={(e) => updateField('newFrequency', e.target.value)}
                  >
                    <option value="">-- 請選擇 --</option>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {errors.newFrequency && (
                    <span className={styles.errorText}>{errors.newFrequency}</span>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>
                    透析日 <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.dayPicker}>
                    {WEEKDAYS.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        className={`${styles.dayButton} ${formData.scheduleDays?.includes(day.value) ? styles.dayActive : ''}`}
                        onClick={() => toggleDay(day.value)}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                  {errors.scheduleDays && (
                    <span className={styles.errorText}>{errors.scheduleDays}</span>
                  )}
                </div>
              </>
            )}

            {/* Delete / Restore */}
            {changeType === 'delete_restore' && (
              <div className={styles.warningBox}>
                <strong>注意：</strong>此操作將刪除或復原患者的透析排程。請確認生效日期及原因後送出。
              </div>
            )}

            {/* Reason */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="change-reason">
                變更原因 <span className={styles.required}>*</span>
              </label>
              <input
                id="change-reason"
                type="text"
                className={`${styles.formInput} ${errors.reason ? styles.inputError : ''}`}
                value={formData.reason}
                onChange={(e) => updateField('reason', e.target.value)}
                placeholder="請輸入變更原因"
              />
              {errors.reason && (
                <span className={styles.errorText}>{errors.reason}</span>
              )}
            </div>

            {/* Notes */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="change-notes">
                備註
              </label>
              <textarea
                id="change-notes"
                className={styles.formTextarea}
                value={formData.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="選填備註資訊..."
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSubmit}
            disabled={isSaving}
          >
            {isSaving ? '儲存中...' : isEditing ? '更新' : '送出'}
          </button>
        </div>
      </div>
    </div>
  )
}
