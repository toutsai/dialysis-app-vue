import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/CRRTOrderModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CRRTPatient {
  id: string
  name?: string
  chartNo?: string
  [key: string]: unknown
}

export type CRRTMode = 'CVVH' | 'CVVHD' | 'CVVHDF' | 'SCUF'
export type AnticoagulationType = 'heparin' | 'citrate' | 'none' | 'nafamostat'
export type ReplacementFluidPosition = 'pre' | 'post' | 'mixed'

export interface CRRTOrderData {
  mode: CRRTMode
  bloodFlowRate: number | ''
  replacementFluidRate: number | ''
  replacementFluidPosition: ReplacementFluidPosition
  dialysateFlowRate: number | ''
  netUFTarget: number | ''
  anticoagulationType: AnticoagulationType
  heparinBolus: number | ''
  heparinRate: number | ''
  citrateRate: number | ''
  calciumReplacementRate: number | ''
  nafamostatRate: number | ''
  filterType: string
  replacementFluidType: string
  dialysateType: string
  targetAPTT: string
  ionizedCalciumTarget: string
  treatmentDuration: number | ''
  accessType: string
  bloodWarmer: boolean
  priming: string
  notes: string
}

interface CRRTOrderModalProps {
  isVisible: boolean
  patient: CRRTPatient | null
  initialData?: Partial<CRRTOrderData>
  onClose: () => void
  onSave: (data: CRRTOrderData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CRRT_MODES: { value: CRRTMode; label: string; description: string }[] = [
  { value: 'CVVH', label: 'CVVH', description: '持續性靜脈-靜脈血液過濾' },
  { value: 'CVVHD', label: 'CVVHD', description: '持續性靜脈-靜脈血液透析' },
  { value: 'CVVHDF', label: 'CVVHDF', description: '持續性靜脈-靜脈血液透析過濾' },
  { value: 'SCUF', label: 'SCUF', description: '緩慢持續性超濾' },
]

const ANTICOAG_TYPES: { value: AnticoagulationType; label: string }[] = [
  { value: 'heparin', label: '肝素 (Heparin)' },
  { value: 'citrate', label: '枸櫞酸 (Citrate)' },
  { value: 'nafamostat', label: 'Nafamostat' },
  { value: 'none', label: '無抗凝' },
]

const REPLACEMENT_POSITIONS: { value: ReplacementFluidPosition; label: string }[] = [
  { value: 'pre', label: '前稀釋 (Pre-dilution)' },
  { value: 'post', label: '後稀釋 (Post-dilution)' },
  { value: 'mixed', label: '混合稀釋 (Mixed)' },
]

const FILTER_TYPES = [
  { value: 'AN69', label: 'AN69' },
  { value: 'M100', label: 'M100' },
  { value: 'M150', label: 'M150' },
  { value: 'HF1200', label: 'HF1200' },
  { value: 'ST100', label: 'ST100' },
  { value: 'ST150', label: 'ST150' },
  { value: 'oXiris', label: 'oXiris' },
  { value: 'other', label: '其他' },
]

const REPLACEMENT_FLUIDS = [
  { value: 'hemosol_B0', label: 'Hemosol B0' },
  { value: 'hemosol_BO_K4', label: 'Hemosol B0 + K4' },
  { value: 'phoxillium', label: 'Phoxillium' },
  { value: 'prismasol_2', label: 'Prismasol 2' },
  { value: 'prismasol_4', label: 'Prismasol 4' },
  { value: 'custom', label: '自配液' },
]

const DIALYSATE_TYPES = [
  { value: 'prismasol_2', label: 'Prismasol 2' },
  { value: 'prismasol_4', label: 'Prismasol 4' },
  { value: 'hemosol_B0', label: 'Hemosol B0' },
  { value: 'custom', label: '自配液' },
]

const ACCESS_TYPES = [
  { value: 'femoral', label: '股靜脈導管' },
  { value: 'jugular', label: '頸內靜脈導管' },
  { value: 'subclavian', label: '鎖骨下靜脈導管' },
  { value: 'other', label: '其他' },
]

const PRIMING_OPTIONS = [
  { value: 'saline', label: '生理食鹽水' },
  { value: 'heparin_saline', label: '肝素生理食鹽水' },
  { value: 'albumin', label: '白蛋白' },
  { value: 'blood', label: '血液' },
]

const EMPTY_ORDER: CRRTOrderData = {
  mode: 'CVVHDF',
  bloodFlowRate: 150,
  replacementFluidRate: 1000,
  replacementFluidPosition: 'pre',
  dialysateFlowRate: 1000,
  netUFTarget: 0,
  anticoagulationType: 'citrate',
  heparinBolus: '',
  heparinRate: '',
  citrateRate: '',
  calciumReplacementRate: '',
  nafamostatRate: '',
  filterType: 'ST150',
  replacementFluidType: 'hemosol_B0',
  dialysateType: 'prismasol_4',
  targetAPTT: '',
  ionizedCalciumTarget: '1.0-1.2',
  treatmentDuration: 24,
  accessType: 'jugular',
  bloodWarmer: false,
  priming: 'saline',
  notes: '',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CRRTOrderModal({
  isVisible,
  patient,
  initialData,
  onClose,
  onSave,
}: CRRTOrderModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<CRRTOrderData>({ ...EMPTY_ORDER })
  const [errors, setErrors] = useState<Partial<Record<keyof CRRTOrderData, string>>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Initialize form
  useEffect(() => {
    if (isVisible) {
      const base = { ...EMPTY_ORDER }
      if (initialData) Object.assign(base, initialData)
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
  const updateField = <K extends keyof CRRTOrderData>(field: K, value: CRRTOrderData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const updateNumericField = (field: keyof CRRTOrderData, raw: string) => {
    if (raw === '') {
      updateField(field, '' as never)
      return
    }
    const num = parseFloat(raw)
    if (!isNaN(num)) {
      updateField(field, num as never)
    }
  }

  // Mode-dependent visibility
  const showReplacementFluid = form.mode === 'CVVH' || form.mode === 'CVVHDF'
  const showDialysate = form.mode === 'CVVHD' || form.mode === 'CVVHDF'
  const showHeparinFields = form.anticoagulationType === 'heparin'
  const showCitrateFields = form.anticoagulationType === 'citrate'
  const showNafamostatFields = form.anticoagulationType === 'nafamostat'

  // Validation
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof CRRTOrderData, string>> = {}

    if (form.bloodFlowRate === '' || (typeof form.bloodFlowRate === 'number' && (form.bloodFlowRate < 50 || form.bloodFlowRate > 300))) {
      newErrors.bloodFlowRate = '血流速需在 50-300 mL/min 之間'
    }
    if (showReplacementFluid && form.replacementFluidRate === '') {
      newErrors.replacementFluidRate = '請輸入置換液流速'
    }
    if (showDialysate && form.dialysateFlowRate === '') {
      newErrors.dialysateFlowRate = '請輸入透析液流速'
    }
    if (!form.filterType) newErrors.filterType = '請選擇濾器型號'
    if (!form.accessType) newErrors.accessType = '請選擇血管通路'
    if (form.treatmentDuration === '' || (typeof form.treatmentDuration === 'number' && form.treatmentDuration < 1)) {
      newErrors.treatmentDuration = '請輸入治療時間'
    }

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

  // Compute estimated dose
  const computeEstimatedDose = (): string => {
    const bf = typeof form.bloodFlowRate === 'number' ? form.bloodFlowRate : 0
    const rf = typeof form.replacementFluidRate === 'number' ? form.replacementFluidRate : 0
    const df = typeof form.dialysateFlowRate === 'number' ? form.dialysateFlowRate : 0
    const totalEffluent = rf + df
    if (totalEffluent <= 0) return '—'
    // Dose = total effluent (mL/hr) / estimated body weight (assume 70 kg for display)
    const dosePerKg = totalEffluent / 70
    return `${dosePerKg.toFixed(1)} mL/kg/hr (以70kg估算)`
  }

  if (!isVisible || !patient) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="crrt-order-title">
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 id="crrt-order-title" className={styles.title}>
              CRRT 治療醫囑
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
            {/* CRRT Mode */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>治療模式</legend>
              <div className={styles.modeGrid}>
                {CRRT_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={`${styles.modeCard} ${form.mode === m.value ? styles.modeCardActive : ''}`}
                    onClick={() => updateField('mode', m.value)}
                  >
                    <span className={styles.modeLabel}>{m.label}</span>
                    <span className={styles.modeDesc}>{m.description}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {/* Vascular Access & Filter */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>通路與濾器</legend>
              <div className={styles.grid}>
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
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {errors.accessType && <span className={styles.errorText}>{errors.accessType}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>
                    濾器型號 <span className={styles.required}>*</span>
                  </label>
                  <select
                    className={`${styles.select} ${errors.filterType ? styles.inputError : ''}`}
                    value={form.filterType}
                    onChange={(e) => updateField('filterType', e.target.value)}
                  >
                    {FILTER_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  {errors.filterType && <span className={styles.errorText}>{errors.filterType}</span>}
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Priming 方式</label>
                  <select
                    className={styles.select}
                    value={form.priming}
                    onChange={(e) => updateField('priming', e.target.value)}
                  >
                    {PRIMING_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div className={styles.field}>
                  <label className={styles.label}>Blood Warmer</label>
                  <div className={styles.toggleWrapper}>
                    <button
                      type="button"
                      className={`${styles.toggleButton} ${form.bloodWarmer ? styles.toggleButtonActive : ''}`}
                      onClick={() => updateField('bloodWarmer', !form.bloodWarmer)}
                    >
                      {form.bloodWarmer ? '啟用' : '關閉'}
                    </button>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* Flow Parameters */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>流量參數</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>
                    血流速 (Qb) <span className={styles.required}>*</span>
                  </label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={`${styles.input} ${errors.bloodFlowRate ? styles.inputError : ''}`}
                      value={form.bloodFlowRate}
                      onChange={(e) => updateNumericField('bloodFlowRate', e.target.value)}
                      min={50}
                      max={300}
                      step={10}
                    />
                    <span className={styles.unit}>mL/min</span>
                  </div>
                  {errors.bloodFlowRate && <span className={styles.errorText}>{errors.bloodFlowRate}</span>}
                </div>

                {showReplacementFluid && (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>
                        置換液流速 (Qr) <span className={styles.required}>*</span>
                      </label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={`${styles.input} ${errors.replacementFluidRate ? styles.inputError : ''}`}
                          value={form.replacementFluidRate}
                          onChange={(e) => updateNumericField('replacementFluidRate', e.target.value)}
                          min={0}
                          max={6000}
                          step={100}
                        />
                        <span className={styles.unit}>mL/hr</span>
                      </div>
                      {errors.replacementFluidRate && <span className={styles.errorText}>{errors.replacementFluidRate}</span>}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>稀釋位置</label>
                      <select
                        className={styles.select}
                        value={form.replacementFluidPosition}
                        onChange={(e) => updateField('replacementFluidPosition', e.target.value as ReplacementFluidPosition)}
                      >
                        {REPLACEMENT_POSITIONS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>置換液種類</label>
                      <select
                        className={styles.select}
                        value={form.replacementFluidType}
                        onChange={(e) => updateField('replacementFluidType', e.target.value)}
                      >
                        {REPLACEMENT_FLUIDS.map((f) => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                {showDialysate && (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>
                        透析液流速 (Qd) <span className={styles.required}>*</span>
                      </label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={`${styles.input} ${errors.dialysateFlowRate ? styles.inputError : ''}`}
                          value={form.dialysateFlowRate}
                          onChange={(e) => updateNumericField('dialysateFlowRate', e.target.value)}
                          min={0}
                          max={4000}
                          step={100}
                        />
                        <span className={styles.unit}>mL/hr</span>
                      </div>
                      {errors.dialysateFlowRate && <span className={styles.errorText}>{errors.dialysateFlowRate}</span>}
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>透析液種類</label>
                      <select
                        className={styles.select}
                        value={form.dialysateType}
                        onChange={(e) => updateField('dialysateType', e.target.value)}
                      >
                        {DIALYSATE_TYPES.map((d) => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div className={styles.field}>
                  <label className={styles.label}>淨脫水目標</label>
                  <div className={styles.inputWithUnit}>
                    <input
                      type="number"
                      className={styles.input}
                      value={form.netUFTarget}
                      onChange={(e) => updateNumericField('netUFTarget', e.target.value)}
                      min={-500}
                      max={500}
                      step={10}
                    />
                    <span className={styles.unit}>mL/hr</span>
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
                      max={72}
                      step={1}
                    />
                    <span className={styles.unit}>小時</span>
                  </div>
                  {errors.treatmentDuration && <span className={styles.errorText}>{errors.treatmentDuration}</span>}
                </div>
              </div>

              {/* Estimated dose */}
              <div className={styles.doseInfo}>
                預估劑量: <strong>{computeEstimatedDose()}</strong>
              </div>
            </fieldset>

            {/* Anticoagulation */}
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>抗凝血治療</legend>
              <div className={styles.grid}>
                <div className={styles.field}>
                  <label className={styles.label}>抗凝方式</label>
                  <select
                    className={styles.select}
                    value={form.anticoagulationType}
                    onChange={(e) => updateField('anticoagulationType', e.target.value as AnticoagulationType)}
                  >
                    {ANTICOAG_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                {showHeparinFields && (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Heparin Bolus</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.heparinBolus}
                          onChange={(e) => updateNumericField('heparinBolus', e.target.value)}
                          min={0}
                          step={500}
                        />
                        <span className={styles.unit}>U</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>Heparin 維持速率</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.heparinRate}
                          onChange={(e) => updateNumericField('heparinRate', e.target.value)}
                          min={0}
                          step={100}
                        />
                        <span className={styles.unit}>U/hr</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>目標 APTT</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={form.targetAPTT}
                        onChange={(e) => updateField('targetAPTT', e.target.value)}
                        placeholder="例: 40-60 sec"
                      />
                    </div>
                  </>
                )}

                {showCitrateFields && (
                  <>
                    <div className={styles.field}>
                      <label className={styles.label}>Citrate 輸注速率</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.citrateRate}
                          onChange={(e) => updateNumericField('citrateRate', e.target.value)}
                          min={0}
                          step={10}
                        />
                        <span className={styles.unit}>mL/hr</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>鈣離子補充速率</label>
                      <div className={styles.inputWithUnit}>
                        <input
                          type="number"
                          className={styles.input}
                          value={form.calciumReplacementRate}
                          onChange={(e) => updateNumericField('calciumReplacementRate', e.target.value)}
                          min={0}
                          step={5}
                        />
                        <span className={styles.unit}>mL/hr</span>
                      </div>
                    </div>

                    <div className={styles.field}>
                      <label className={styles.label}>目標 iCa</label>
                      <input
                        type="text"
                        className={styles.input}
                        value={form.ionizedCalciumTarget}
                        onChange={(e) => updateField('ionizedCalciumTarget', e.target.value)}
                        placeholder="例: 1.0-1.2 mmol/L"
                      />
                    </div>
                  </>
                )}

                {showNafamostatFields && (
                  <div className={styles.field}>
                    <label className={styles.label}>Nafamostat 輸注速率</label>
                    <div className={styles.inputWithUnit}>
                      <input
                        type="number"
                        className={styles.input}
                        value={form.nafamostatRate}
                        onChange={(e) => updateNumericField('nafamostatRate', e.target.value)}
                        min={0}
                        step={5}
                      />
                      <span className={styles.unit}>mg/hr</span>
                    </div>
                  </div>
                )}
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
                  placeholder="其他 CRRT 醫囑備註..."
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
              {isSaving ? '儲存中...' : '建立 CRRT 醫囑'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
