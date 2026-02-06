import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/DialysisOrderModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DialysisOrderPatient {
  id: string
  name?: string
  chartNo?: string
  [key: string]: unknown
}

export interface DialysisOrderData {
  akType: string
  bloodFlow: number | ''
  dialysisFluid: string
  dialysisFluidFlow: number | ''
  heparinType: string
  heparinInitial: number | ''
  heparinMaintenance: number | ''
  caConcentration: string
  dryWeight: number | ''
  treatmentDuration: number | ''
  targetUF: number | ''
  naProfile: string
  ufProfile: string
  dialyzerType: string
  accessType: string
  notes: string
}

interface DialysisOrderModalProps {
  isVisible: boolean
  patient: DialysisOrderPatient | null
  initialData?: Partial<DialysisOrderData>
  isEditing?: boolean
  onClose: () => void
  onSave: (data: DialysisOrderData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AK_TYPES = [
  { value: 'AK-200S', label: 'AK-200S' },
  { value: 'AK-200Ultra', label: 'AK-200 Ultra' },
  { value: '4008S', label: '4008S' },
  { value: '5008', label: '5008' },
  { value: '5008S', label: '5008S' },
  { value: '6008', label: '6008 CAREsystem' },
  { value: 'other', label: '其他' },
]

const DIALYSIS_FLUIDS = [
  { value: 'bicarbonate', label: '碳酸氫鈉透析液' },
  { value: 'acetate', label: '醋酸鹽透析液' },
  { value: 'citrate', label: '枸櫞酸透析液' },
]

const HEPARIN_TYPES = [
  { value: 'standard', label: '標準肝素 (Heparin)' },
  { value: 'low_molecular', label: '低分子肝素 (LMWH)' },
  { value: 'citrate', label: '枸櫞酸抗凝' },
  { value: 'none', label: '無抗凝 (Free Heparin)' },
]

const CA_CONCENTRATIONS = [
  { value: '1.25', label: '1.25 mmol/L' },
  { value: '1.5', label: '1.5 mmol/L' },
  { value: '1.75', label: '1.75 mmol/L' },
]

const NA_PROFILES = [
  { value: 'none', label: '無' },
  { value: 'linear', label: '線性 (Linear)' },
  { value: 'step', label: '階梯 (Step)' },
  { value: 'exponential', label: '指數 (Exponential)' },
]

const UF_PROFILES = [
  { value: 'constant', label: '恆定' },
  { value: 'linear_decrease', label: '線性遞減' },
  { value: 'step_decrease', label: '階梯遞減' },
]

const DIALYZER_TYPES = [
  { value: 'FX60', label: 'FX60' },
  { value: 'FX80', label: 'FX80' },
  { value: 'FX100', label: 'FX100' },
  { value: 'Polyflux_170H', label: 'Polyflux 170H' },
  { value: 'Polyflux_210H', label: 'Polyflux 210H' },
  { value: 'other', label: '其他' },
]

const ACCESS_TYPES = [
  { value: 'avf', label: '動靜脈瘻管 (AVF)' },
  { value: 'avg', label: '人工血管 (AVG)' },
  { value: 'perm_cath', label: '永久性導管' },
  { value: 'temp_cath', label: '暫時性導管' },
  { value: 'other', label: '其他' },
]

const EMPTY_ORDER: DialysisOrderData = {
  akType: 'AK-200S',
  bloodFlow: 250,
  dialysisFluid: 'bicarbonate',
  dialysisFluidFlow: 500,
  heparinType: 'standard',
  heparinInitial: 1000,
  heparinMaintenance: 500,
  caConcentration: '1.5',
  dryWeight: '',
  treatmentDuration: 4,
  targetUF: '',
  naProfile: 'none',
  ufProfile: 'constant',
  dialyzerType: 'FX80',
  accessType: 'avf',
  notes: '',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DialysisOrderModal({
  isVisible,
  patient,
  initialData,
  isEditing = false,
  onClose,
  onSave,
}: DialysisOrderModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<DialysisOrderData>({ ...EMPTY_ORDER })
  const [errors, setErrors] = useState<Partial<Record<keyof DialysisOrderData, string>>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Initialize form
  useEffect(() => {
    if (isVisible) {
      const base = { ...EMPTY_ORDER }
      if (initialData) {
        Object.assign(base, initialData)
      }
      setForm(base)
      setErrors({})
      setIsSaving(false)
    }
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

  // Helpers
  const updateField = <K extends keyof DialysisOrderData>(field: K, value: DialysisOrderData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const updateNumericField = (field: keyof DialysisOrderData, raw: string) => {
    if (raw === '') {
      updateField(field, '' as never)
      return
    }
    const num = parseFloat(raw)
    if (!isNaN(num)) {
      updateField(field, num as never)
    }
  }

  // Validation
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof DialysisOrderData, string>> = {}

    if (!form.akType) newErrors.akType = '請選擇透析機型'
    if (form.bloodFlow === '' || (typeof form.bloodFlow === 'number' && (form.bloodFlow < 100 || form.bloodFlow > 500))) {
      newErrors.bloodFlow = '血流速需在 100-500 mL/min 之間'
    }
    if (form.treatmentDuration === '' || (typeof form.treatmentDuration === 'number' && (form.treatmentDuration < 1 || form.treatmentDuration > 8))) {
      newErrors.treatmentDuration = '治療時間需在 1-8 小時之間'
    }
    if (!form.dialyzerType) newErrors.dialyzerType = '請選擇透析器型號'
    if (!form.accessType) newErrors.accessType = '請選擇血管通路'

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

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

  if (!isVisible || !patient) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="dialysis-order-title">
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 id="dialysis-order-title" className={styles.title}>
              {isEditing ? '編輯透析醫囑' : '新增透析醫囑'}
            </h2>
            <span className={styles.subtitle}>
              {patient.name || '—'} {patient.chartNo ? `(${patient.chartNo})` : ''}
            </span>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollArea}>
            {/* Machine & Dialyzer */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>透析設備</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    透析機型 (AK) <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={`${styles.select} ${errors.akType ? styles.inputError : ''}`}
                    value={form.akType}
                    onChange={(e) => updateField('akType', e.target.value)}
                  >
                    {AK_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {errors.akType && <span className={styles.errorText}>{errors.akType}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    透析器型號 <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={`${styles.select} ${errors.dialyzerType ? styles.inputError : ''}`}
                    value={form.dialyzerType}
                    onChange={(e) => updateField('dialyzerType', e.target.value)}
                  >
                    {DIALYZER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {errors.dialyzerType && <span className={styles.errorText}>{errors.dialyzerType}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    血管通路 <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={`${styles.select} ${errors.accessType ? styles.inputError : ''}`}
                    value={form.accessType}
                    onChange={(e) => updateField('accessType', e.target.value)}
                  >
                    {ACCESS_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {errors.accessType && <span className={styles.errorText}>{errors.accessType}</span>}
                </div>
              </div>
            </fieldset>

            {/* Flow Parameters */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>流量參數</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    血流速 (BF) <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={`${styles.input} ${errors.bloodFlow ? styles.inputError : ''}`}
                      value={form.bloodFlow}
                      onChange={(e) => updateNumericField('bloodFlow', e.target.value)}
                      min={100}
                      max={500}
                      step={10}
                    />
                    <span className={styles.unit}>mL/min</span>
                  </div>
                  {errors.bloodFlow && <span className={styles.errorText}>{errors.bloodFlow}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>透析液 (DF)</label>
                  <select
                    className={styles.select}
                    value={form.dialysisFluid}
                    onChange={(e) => updateField('dialysisFluid', e.target.value)}
                  >
                    {DIALYSIS_FLUIDS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>透析液流速</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.input}
                      value={form.dialysisFluidFlow}
                      onChange={(e) => updateNumericField('dialysisFluidFlow', e.target.value)}
                      min={300}
                      max={800}
                      step={50}
                    />
                    <span className={styles.unit}>mL/min</span>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>鈣離子濃度</label>
                  <select
                    className={styles.select}
                    value={form.caConcentration}
                    onChange={(e) => updateField('caConcentration', e.target.value)}
                  >
                    {CA_CONCENTRATIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* Anticoagulation */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>抗凝血</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>抗凝方式</label>
                  <select
                    className={styles.select}
                    value={form.heparinType}
                    onChange={(e) => updateField('heparinType', e.target.value)}
                  >
                    {HEPARIN_TYPES.map((h) => (
                      <option key={h.value} value={h.value}>
                        {h.label}
                      </option>
                    ))}
                  </select>
                </div>

                {form.heparinType !== 'none' && form.heparinType !== 'citrate' && (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>初始劑量</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.heparinInitial}
                          onChange={(e) => updateNumericField('heparinInitial', e.target.value)}
                          min={0}
                          step={100}
                        />
                        <span className={styles.unit}>U</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>維持劑量</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.heparinMaintenance}
                          onChange={(e) => updateNumericField('heparinMaintenance', e.target.value)}
                          min={0}
                          step={100}
                        />
                        <span className={styles.unit}>U/hr</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </fieldset>

            {/* Treatment Parameters */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>治療參數</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>乾體重</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.input}
                      value={form.dryWeight}
                      onChange={(e) => updateNumericField('dryWeight', e.target.value)}
                      min={20}
                      max={200}
                      step={0.1}
                    />
                    <span className={styles.unit}>kg</span>
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    治療時間 <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={`${styles.input} ${errors.treatmentDuration ? styles.inputError : ''}`}
                      value={form.treatmentDuration}
                      onChange={(e) => updateNumericField('treatmentDuration', e.target.value)}
                      min={1}
                      max={8}
                      step={0.5}
                    />
                    <span className={styles.unit}>小時</span>
                  </div>
                  {errors.treatmentDuration && <span className={styles.errorText}>{errors.treatmentDuration}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>目標脫水量 (UF)</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.input}
                      value={form.targetUF}
                      onChange={(e) => updateNumericField('targetUF', e.target.value)}
                      min={0}
                      max={6}
                      step={0.1}
                    />
                    <span className={styles.unit}>L</span>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Profiles */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>模式設定</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>鈉離子模式 (Na Profile)</label>
                  <select
                    className={styles.select}
                    value={form.naProfile}
                    onChange={(e) => updateField('naProfile', e.target.value)}
                  >
                    {NA_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>脫水模式 (UF Profile)</label>
                  <select
                    className={styles.select}
                    value={form.ufProfile}
                    onChange={(e) => updateField('ufProfile', e.target.value)}
                  >
                    {UF_PROFILES.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
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
                  placeholder="其他醫囑備註..."
                  rows={3}
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
              {isSaving ? '儲存中...' : isEditing ? '更新醫囑' : '建立醫囑'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
