import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils'
import styles from '@/components/dialogs/ExceptionCreateDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExceptionPatient {
  id: string
  name?: string
  chartNo?: string
  shift?: string
  bed?: string
  frequency?: string
  [key: string]: unknown
}

export type ExceptionType =
  | 'shift_change'
  | 'bed_change'
  | 'skip'
  | 'extra'
  | 'temporary_transfer'
  | 'other'

export interface ExceptionFormData {
  patientId: string
  exceptionType: ExceptionType
  startDate: string
  endDate: string
  targetShift: string
  targetBed: string
  reason: string
  notes: string
}

interface ExceptionCreateDialogProps {
  isVisible: boolean
  patient?: ExceptionPatient | null
  allPatients: ExceptionPatient[]
  onClose: () => void
  onSubmit: (data: ExceptionFormData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EXCEPTION_TYPES: { value: ExceptionType; label: string; description: string }[] = [
  { value: 'shift_change', label: '班次變更', description: '暫時更換透析班次' },
  { value: 'bed_change', label: '床位變更', description: '暫時更換透析床位' },
  { value: 'skip', label: '請假/停透', description: '暫停一次或多次透析' },
  { value: 'extra', label: '加透', description: '額外增加一次透析' },
  { value: 'temporary_transfer', label: '暫時轉入', description: '從其他院所暫時轉入' },
  { value: 'other', label: '其他', description: '其他排程異動' },
]

const SHIFTS = [
  { value: 'early', label: '早班' },
  { value: 'noon', label: '午班' },
  { value: 'late', label: '晚班' },
]

const EMPTY_FORM: ExceptionFormData = {
  patientId: '',
  exceptionType: 'shift_change',
  startDate: '',
  endDate: '',
  targetShift: '',
  targetBed: '',
  reason: '',
  notes: '',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ExceptionCreateDialog({
  isVisible,
  patient,
  allPatients,
  onClose,
  onSubmit,
}: ExceptionCreateDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<ExceptionFormData>({ ...EMPTY_FORM })
  const [errors, setErrors] = useState<Partial<Record<keyof ExceptionFormData, string>>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = formatDateToYYYYMMDD()

  // Initialize form
  useEffect(() => {
    if (isVisible) {
      const initial = { ...EMPTY_FORM, startDate: today, endDate: today }
      if (patient) {
        initial.patientId = patient.id
      }
      setForm(initial)
      setErrors({})
      setSearchTerm(patient?.name || '')
      setShowPatientDropdown(false)
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

  // Field update
  const updateField = <K extends keyof ExceptionFormData>(field: K, value: ExceptionFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Patient search
  const filteredPatientOptions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return allPatients.slice(0, 50)
    return allPatients.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.chartNo?.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term)
    )
  }, [allPatients, searchTerm])

  const handleSelectPatient = (p: ExceptionPatient) => {
    updateField('patientId', p.id)
    setSearchTerm(p.name || p.id)
    setShowPatientDropdown(false)
  }

  const selectedPatient = allPatients.find((p) => p.id === form.patientId)

  // Determine which fields are needed based on exception type
  const needsTargetShift = form.exceptionType === 'shift_change' || form.exceptionType === 'extra'
  const needsTargetBed =
    form.exceptionType === 'bed_change' ||
    form.exceptionType === 'extra' ||
    form.exceptionType === 'temporary_transfer'

  // Validation
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ExceptionFormData, string>> = {}

    if (!form.patientId) newErrors.patientId = '請選擇病患'
    if (!form.startDate) newErrors.startDate = '請選擇開始日期'
    if (!form.endDate) newErrors.endDate = '請選擇結束日期'
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      newErrors.endDate = '結束日期不可早於開始日期'
    }
    if (needsTargetShift && !form.targetShift) {
      newErrors.targetShift = '請選擇目標班次'
    }
    if (needsTargetBed && !form.targetBed) {
      newErrors.targetBed = '請輸入目標床位'
    }
    if (!form.reason.trim()) {
      newErrors.reason = '請輸入異動原因'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onSubmit(form)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="exception-create-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="exception-create-title" className={styles.title}>
            新增排程異動
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollArea}>
            {/* Patient Selection */}
            <div className={styles.field}>
              <label className={styles.label}>
                病患 <span className={styles.required}>*</span>
              </label>
              <div className={styles.patientSearchWrapper}>
                <input
                  type="text"
                  className={`${styles.input} ${errors.patientId ? styles.inputError : ''}`}
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setShowPatientDropdown(true)
                    if (!e.target.value.trim()) updateField('patientId', '')
                  }}
                  onFocus={() => setShowPatientDropdown(true)}
                  placeholder="搜尋病患姓名或病歷號..."
                  readOnly={Boolean(patient)}
                />
                {showPatientDropdown && !patient && filteredPatientOptions.length > 0 && (
                  <div className={styles.dropdown}>
                    {filteredPatientOptions.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={styles.dropdownItem}
                        onClick={() => handleSelectPatient(p)}
                      >
                        <span className={styles.dropdownName}>{p.name || p.id}</span>
                        <span className={styles.dropdownMeta}>{p.chartNo || ''}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {errors.patientId && <span className={styles.errorText}>{errors.patientId}</span>}
              {selectedPatient && (
                <div className={styles.selectedPatientInfo}>
                  目前: {selectedPatient.shift ? SHIFTS.find((s) => s.value === selectedPatient.shift)?.label || selectedPatient.shift : '—'}
                  {selectedPatient.bed ? ` / 床位 ${selectedPatient.bed}` : ''}
                  {selectedPatient.frequency ? ` / ${selectedPatient.frequency}` : ''}
                </div>
              )}
            </div>

            {/* Exception Type */}
            <div className={styles.field}>
              <label className={styles.label}>
                異動類型 <span className={styles.required}>*</span>
              </label>
              <div className={styles.typeGrid}>
                {EXCEPTION_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`${styles.typeCard} ${form.exceptionType === t.value ? styles.typeCardActive : ''}`}
                    onClick={() => updateField('exceptionType', t.value)}
                  >
                    <span className={styles.typeCardLabel}>{t.label}</span>
                    <span className={styles.typeCardDesc}>{t.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className={styles.dateRow}>
              <div className={styles.field}>
                <label className={styles.label}>
                  開始日期 <span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={`${styles.input} ${errors.startDate ? styles.inputError : ''}`}
                  value={form.startDate}
                  onChange={(e) => {
                    updateField('startDate', e.target.value)
                    if (e.target.value > form.endDate) {
                      updateField('endDate', e.target.value)
                    }
                  }}
                />
                {errors.startDate && <span className={styles.errorText}>{errors.startDate}</span>}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>
                  結束日期 <span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={`${styles.input} ${errors.endDate ? styles.inputError : ''}`}
                  value={form.endDate}
                  min={form.startDate}
                  onChange={(e) => updateField('endDate', e.target.value)}
                />
                {errors.endDate && <span className={styles.errorText}>{errors.endDate}</span>}
              </div>
            </div>

            {/* Target Shift */}
            {needsTargetShift && (
              <div className={styles.field}>
                <label className={styles.label}>
                  目標班次 <span className={styles.required}>*</span>
                </label>
                <div className={styles.shiftOptions}>
                  {SHIFTS.map((s) => (
                    <label
                      key={s.value}
                      className={`${styles.shiftOption} ${form.targetShift === s.value ? styles.shiftOptionActive : ''}`}
                    >
                      <input
                        type="radio"
                        name="targetShift"
                        value={s.value}
                        checked={form.targetShift === s.value}
                        onChange={() => updateField('targetShift', s.value)}
                        className={styles.hiddenRadio}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
                {errors.targetShift && <span className={styles.errorText}>{errors.targetShift}</span>}
              </div>
            )}

            {/* Target Bed */}
            {needsTargetBed && (
              <div className={styles.field}>
                <label className={styles.label}>
                  目標床位 <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  className={`${styles.input} ${errors.targetBed ? styles.inputError : ''}`}
                  value={form.targetBed}
                  onChange={(e) => updateField('targetBed', e.target.value)}
                  placeholder="例: A-05"
                />
                {errors.targetBed && <span className={styles.errorText}>{errors.targetBed}</span>}
              </div>
            )}

            {/* Reason */}
            <div className={styles.field}>
              <label className={styles.label}>
                異動原因 <span className={styles.required}>*</span>
              </label>
              <textarea
                className={`${styles.textarea} ${errors.reason ? styles.inputError : ''}`}
                value={form.reason}
                onChange={(e) => updateField('reason', e.target.value)}
                placeholder="請輸入異動原因..."
                rows={2}
              />
              {errors.reason && <span className={styles.errorText}>{errors.reason}</span>}
            </div>

            {/* Notes */}
            <div className={styles.field}>
              <label className={styles.label}>備註 (選填)</label>
              <textarea
                className={styles.textarea}
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                placeholder="其他備註..."
                rows={2}
              />
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
              取消
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? '建立中...' : '建立異動'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
