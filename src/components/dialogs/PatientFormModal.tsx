import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/PatientFormModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PatientType = 'opd' | 'ipd' | 'er'

export interface PatientFormData {
  id?: string
  name: string
  chartNo: string
  idNumber: string
  birthDate: string
  gender: 'male' | 'female' | ''
  bloodType: 'A' | 'B' | 'AB' | 'O' | ''
  phone: string
  address: string
  frequency: string
  shift: string
  bed: string
  status: string
  diseases: string[]
  hepatitisB: 'positive' | 'negative' | 'unknown'
  hepatitisC: 'positive' | 'negative' | 'unknown'
  notes: string
  patientType: PatientType
}

interface PatientFormModalProps {
  isVisible: boolean
  patientData?: Partial<PatientFormData>
  patientType?: PatientType
  onClose: () => void
  onSave: (data: PatientFormData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_FORM: PatientFormData = {
  name: '',
  chartNo: '',
  idNumber: '',
  birthDate: '',
  gender: '',
  bloodType: '',
  phone: '',
  address: '',
  frequency: '',
  shift: '',
  bed: '',
  status: 'active',
  diseases: [],
  hepatitisB: 'unknown',
  hepatitisC: 'unknown',
  notes: '',
  patientType: 'opd',
}

const BLOOD_TYPES = ['A', 'B', 'AB', 'O'] as const
const SHIFTS = [
  { value: 'early', label: '早班' },
  { value: 'noon', label: '午班' },
  { value: 'late', label: '晚班' },
]
const FREQUENCIES = [
  { value: '2/week', label: '每週2次' },
  { value: '3/week', label: '每週3次' },
  { value: '135', label: '一三五' },
  { value: '246', label: '二四六' },
  { value: 'daily', label: '每日' },
]
const STATUSES = [
  { value: 'active', label: '在透析' },
  { value: 'inactive', label: '暫停' },
  { value: 'transferred', label: '轉院' },
  { value: 'discharged', label: '出院' },
  { value: 'deceased', label: '死亡' },
]
const COMMON_DISEASES = [
  '糖尿病',
  '高血壓',
  '心臟病',
  '慢性腎臟病',
  '貧血',
  '痛風',
  '肝硬化',
  '中風',
  '冠狀動脈疾病',
  '周邊血管疾病',
  '慢性阻塞性肺疾病',
  '甲狀腺功能異常',
]
const PATIENT_TYPE_LABELS: Record<PatientType, string> = {
  opd: '門診 (OPD)',
  ipd: '住院 (IPD)',
  er: '急診 (ER)',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientFormModal({
  isVisible,
  patientData,
  patientType = 'opd',
  onClose,
  onSave,
}: PatientFormModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<PatientFormData>({ ...EMPTY_FORM, patientType })
  const [errors, setErrors] = useState<Partial<Record<keyof PatientFormData, string>>>({})
  const [diseaseInput, setDiseaseInput] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const isEditing = Boolean(patientData?.id)

  // Reset form when modal opens or patientData changes
  useEffect(() => {
    if (isVisible) {
      if (patientData) {
        setForm({ ...EMPTY_FORM, patientType, ...patientData })
      } else {
        setForm({ ...EMPTY_FORM, patientType })
      }
      setErrors({})
      setDiseaseInput('')
      setIsSaving(false)
    }
  }, [isVisible, patientData, patientType])

  // Keyboard handling
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

  // Form helpers
  const updateField = <K extends keyof PatientFormData>(field: K, value: PatientFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const addDisease = (disease: string) => {
    const trimmed = disease.trim()
    if (trimmed && !form.diseases.includes(trimmed)) {
      updateField('diseases', [...form.diseases, trimmed])
    }
    setDiseaseInput('')
  }

  const removeDisease = (disease: string) => {
    updateField(
      'diseases',
      form.diseases.filter((d) => d !== disease)
    )
  }

  const handleDiseaseKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addDisease(diseaseInput)
    }
  }

  // Validation
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof PatientFormData, string>> = {}

    if (!form.name.trim()) newErrors.name = '請輸入姓名'
    if (!form.chartNo.trim()) newErrors.chartNo = '請輸入病歷號'
    if (!form.idNumber.trim()) {
      newErrors.idNumber = '請輸入身分證號'
    } else if (!/^[A-Z][12]\d{8}$/.test(form.idNumber)) {
      newErrors.idNumber = '身分證號格式不正確'
    }
    if (!form.birthDate) newErrors.birthDate = '請選擇出生日期'
    if (!form.gender) newErrors.gender = '請選擇性別'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSaving(true)
    try {
      await onSave(form)
    } finally {
      setIsSaving(false)
    }
  }

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) onClose()
  }

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="patient-form-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="patient-form-title" className={styles.title}>
            {isEditing ? '編輯病患資料' : '新增病患'}
          </h2>
          <div className={styles.headerRight}>
            <span className={styles.typeBadge} data-type={form.patientType}>
              {PATIENT_TYPE_LABELS[form.patientType]}
            </span>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
              &times;
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollArea}>
            {/* Patient Type Selector */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>病患類型</legend>
              <div className={styles.typeSelector}>
                {(['opd', 'ipd', 'er'] as PatientType[]).map((type) => (
                  <label
                    key={type}
                    className={`${styles.typeOption} ${form.patientType === type ? styles.typeOptionActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="patientType"
                      value={type}
                      checked={form.patientType === type}
                      onChange={() => updateField('patientType', type)}
                      className={styles.hiddenRadio}
                    />
                    {PATIENT_TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Basic Info Section */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>基本資料</legend>
              <div className={styles.grid}>
                {/* Name */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    姓名 <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="請輸入姓名"
                  />
                  {errors.name && <span className={styles.errorText}>{errors.name}</span>}
                </div>

                {/* Chart No */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    病歷號 <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    className={`${styles.input} ${errors.chartNo ? styles.inputError : ''}`}
                    value={form.chartNo}
                    onChange={(e) => updateField('chartNo', e.target.value)}
                    placeholder="請輸入病歷號"
                  />
                  {errors.chartNo && <span className={styles.errorText}>{errors.chartNo}</span>}
                </div>

                {/* ID Number */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    身分證號 <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="text"
                    className={`${styles.input} ${errors.idNumber ? styles.inputError : ''}`}
                    value={form.idNumber}
                    onChange={(e) => updateField('idNumber', e.target.value.toUpperCase())}
                    placeholder="例: A123456789"
                    maxLength={10}
                  />
                  {errors.idNumber && <span className={styles.errorText}>{errors.idNumber}</span>}
                </div>

                {/* Birth Date */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    出生日期 <span className={styles.required}>*</span>
                  </label>
                  <input
                    type="date"
                    className={`${styles.input} ${errors.birthDate ? styles.inputError : ''}`}
                    value={form.birthDate}
                    onChange={(e) => updateField('birthDate', e.target.value)}
                  />
                  {errors.birthDate && <span className={styles.errorText}>{errors.birthDate}</span>}
                </div>

                {/* Gender */}
                <div className={styles.field}>
                  <label className={styles.label}>
                    性別 <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.radioGroup}>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="gender"
                        value="male"
                        checked={form.gender === 'male'}
                        onChange={() => updateField('gender', 'male')}
                      />
                      男
                    </label>
                    <label className={styles.radioLabel}>
                      <input
                        type="radio"
                        name="gender"
                        value="female"
                        checked={form.gender === 'female'}
                        onChange={() => updateField('gender', 'female')}
                      />
                      女
                    </label>
                  </div>
                  {errors.gender && <span className={styles.errorText}>{errors.gender}</span>}
                </div>

                {/* Blood Type */}
                <div className={styles.field}>
                  <label className={styles.label}>血型</label>
                  <select
                    className={styles.select}
                    value={form.bloodType}
                    onChange={(e) => updateField('bloodType', e.target.value as PatientFormData['bloodType'])}
                  >
                    <option value="">請選擇</option>
                    {BLOOD_TYPES.map((bt) => (
                      <option key={bt} value={bt}>
                        {bt} 型
                      </option>
                    ))}
                  </select>
                </div>

                {/* Phone */}
                <div className={styles.field}>
                  <label className={styles.label}>電話</label>
                  <input
                    type="tel"
                    className={styles.input}
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="請輸入聯絡電話"
                  />
                </div>

                {/* Address */}
                <div className={`${styles.field} ${styles.fieldFull}`}>
                  <label className={styles.label}>地址</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    placeholder="請輸入地址"
                  />
                </div>
              </div>
            </fieldset>

            {/* Dialysis Info Section */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>透析資訊</legend>
              <div className={styles.grid}>
                {/* Frequency */}
                <div className={styles.field}>
                  <label className={styles.label}>透析頻率</label>
                  <select
                    className={styles.select}
                    value={form.frequency}
                    onChange={(e) => updateField('frequency', e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {FREQUENCIES.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shift */}
                <div className={styles.field}>
                  <label className={styles.label}>班別</label>
                  <select
                    className={styles.select}
                    value={form.shift}
                    onChange={(e) => updateField('shift', e.target.value)}
                  >
                    <option value="">請選擇</option>
                    {SHIFTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Bed */}
                <div className={styles.field}>
                  <label className={styles.label}>床號</label>
                  <input
                    type="text"
                    className={styles.input}
                    value={form.bed}
                    onChange={(e) => updateField('bed', e.target.value)}
                    placeholder="例: A-01"
                  />
                </div>

                {/* Status */}
                <div className={styles.field}>
                  <label className={styles.label}>狀態</label>
                  <select
                    className={styles.select}
                    value={form.status}
                    onChange={(e) => updateField('status', e.target.value)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Medical Info Section */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>醫療資訊</legend>

              {/* Diseases multi-select tags */}
              <div className={styles.field}>
                <label className={styles.label}>疾病史 (多選)</label>
                <div className={styles.tagContainer}>
                  {form.diseases.map((disease) => (
                    <span key={disease} className={styles.tag}>
                      {disease}
                      <button
                        type="button"
                        className={styles.tagRemove}
                        onClick={() => removeDisease(disease)}
                        aria-label={`移除 ${disease}`}
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
                <div className={styles.tagInputRow}>
                  <input
                    type="text"
                    className={styles.input}
                    value={diseaseInput}
                    onChange={(e) => setDiseaseInput(e.target.value)}
                    onKeyDown={handleDiseaseKeyDown}
                    placeholder="輸入疾病名稱後按 Enter 或點擊新增"
                  />
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={() => addDisease(diseaseInput)}
                    disabled={!diseaseInput.trim()}
                  >
                    新增
                  </button>
                </div>
                <div className={styles.quickTags}>
                  {COMMON_DISEASES.filter((d) => !form.diseases.includes(d)).map((disease) => (
                    <button
                      key={disease}
                      type="button"
                      className={styles.quickTag}
                      onClick={() => addDisease(disease)}
                    >
                      + {disease}
                    </button>
                  ))}
                </div>
              </div>

              {/* Hepatitis Markers */}
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>B型肝炎</label>
                  <div className={styles.radioGroup}>
                    {([
                      { value: 'positive', label: '陽性 (+)' },
                      { value: 'negative', label: '陰性 (-)' },
                      { value: 'unknown', label: '未知' },
                    ] as const).map((opt) => (
                      <label key={opt.value} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="hepatitisB"
                          value={opt.value}
                          checked={form.hepatitisB === opt.value}
                          onChange={() => updateField('hepatitisB', opt.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>C型肝炎</label>
                  <div className={styles.radioGroup}>
                    {([
                      { value: 'positive', label: '陽性 (+)' },
                      { value: 'negative', label: '陰性 (-)' },
                      { value: 'unknown', label: '未知' },
                    ] as const).map((opt) => (
                      <label key={opt.value} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="hepatitisC"
                          value={opt.value}
                          checked={form.hepatitisC === opt.value}
                          onChange={() => updateField('hepatitisC', opt.value)}
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Notes */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>備註</legend>
              <div className={styles.field}>
                <textarea
                  className={styles.textarea}
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  placeholder="其他備註事項..."
                  rows={4}
                />
              </div>
            </fieldset>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSaving}>
              取消
            </button>
            <button type="submit" className={styles.saveButton} disabled={isSaving}>
              {isSaving ? '儲存中...' : isEditing ? '更新' : '新增'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
