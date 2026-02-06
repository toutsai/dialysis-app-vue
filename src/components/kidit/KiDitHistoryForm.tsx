// src/components/kidit/KiDitHistoryForm.tsx
// History / primary disease form for KiDit declaration

import { useState, useCallback } from 'react'
import { KIDIT_HISTORY_OPTIONS } from '@/utils/kiditHelpers'
import styles from './KiDitHistoryForm.module.css'

export interface KiDitHistoryData {
  transferFromName: string
  transferFromCode: string
  startHDDate: string
  isStartHDHere: string
  startHDHospital: string
  startPDDate: string
  isStartPDHere: string
  startPDHospital: string
  transplantDate: string
  isTransplantHere: string
  transplantHospital: string
  isKnownCKD: string
  isBUNCreatAbnormal: string
  abnormalLabDate: string
  initialBUN: string
  initialCr: string
  selectedSystemicDiseases: number[]
  otherSystemicDescription: string
  dmType: string
  initialLabDate: string
  initialHct: string
  initialHb: string
  initialK: string
  initialAlb: string
  initialWeight: string
  initialHeight: string
  initialEGFR: string
  hbsag: string
  antihcv: string
  indicationType: string
  selectedSymptoms: number[]
  selectedEmergencyReasons: number[]
  emergencyLabDate: string
  isFirstCatastrophic: string
}

const EMPTY_FORM: KiDitHistoryData = {
  transferFromName: '',
  transferFromCode: '',
  startHDDate: '',
  isStartHDHere: '',
  startHDHospital: '',
  startPDDate: '',
  isStartPDHere: '',
  startPDHospital: '',
  transplantDate: '',
  isTransplantHere: '',
  transplantHospital: '',
  isKnownCKD: '',
  isBUNCreatAbnormal: '',
  abnormalLabDate: '',
  initialBUN: '',
  initialCr: '',
  selectedSystemicDiseases: [],
  otherSystemicDescription: '',
  dmType: '',
  initialLabDate: '',
  initialHct: '',
  initialHb: '',
  initialK: '',
  initialAlb: '',
  initialWeight: '',
  initialHeight: '',
  initialEGFR: '',
  hbsag: '',
  antihcv: '',
  indicationType: '',
  selectedSymptoms: [],
  selectedEmergencyReasons: [],
  emergencyLabDate: '',
  isFirstCatastrophic: '',
}

interface KiDitHistoryFormProps {
  initialData?: Partial<KiDitHistoryData>
  onSave?: (data: KiDitHistoryData) => void
  onCancel?: () => void
  readOnly?: boolean
}

export default function KiDitHistoryForm({
  initialData,
  onSave,
  onCancel,
  readOnly = false,
}: KiDitHistoryFormProps) {
  const [form, setForm] = useState<KiDitHistoryData>({
    ...EMPTY_FORM,
    ...initialData,
  })

  const handleChange = useCallback(
    (field: keyof KiDitHistoryData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }))
      },
    [],
  )

  const toggleCheckbox = useCallback(
    (field: 'selectedSystemicDiseases' | 'selectedSymptoms' | 'selectedEmergencyReasons', index: number) => {
      setForm((prev) => {
        const current = prev[field] as number[]
        const next = current.includes(index)
          ? current.filter((i) => i !== index)
          : [...current, index]
        return { ...prev, [field]: next }
      })
    },
    [],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      onSave?.(form)
    },
    [form, onSave],
  )

  const renderSelect = (
    field: keyof KiDitHistoryData,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <select
        className={styles.select}
        value={form[field] as string}
        onChange={handleChange(field)}
        disabled={readOnly}
      >
        <option value="">-- 請選擇 --</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )

  const renderInput = (
    field: keyof KiDitHistoryData,
    label: string,
    type: string = 'text',
    placeholder?: string,
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        type={type}
        value={form[field] as string}
        onChange={handleChange(field)}
        placeholder={placeholder}
        disabled={readOnly}
      />
    </div>
  )

  const renderCheckboxGroup = (
    field: 'selectedSystemicDiseases' | 'selectedSymptoms' | 'selectedEmergencyReasons',
    label: string,
    options: { index: number; label: string }[],
  ) => (
    <div className={styles.checkboxGroup}>
      <label className={styles.groupLabel}>{label}</label>
      <div className={styles.checkboxGrid}>
        {options.map((opt) => (
          <label key={opt.index} className={styles.checkboxItem}>
            <input
              type="checkbox"
              checked={(form[field] as number[]).includes(opt.index)}
              onChange={() => toggleCheckbox(field, opt.index)}
              disabled={readOnly}
            />
            <span className={styles.checkboxLabel}>{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {/* Transfer information */}
      <h3 className={styles.sectionTitle}>轉入資訊</h3>
      <div className={styles.grid}>
        {renderInput('transferFromName', '03 轉入院所名稱')}
        {renderInput('transferFromCode', '04 轉入院所醫事代號')}
      </div>

      {/* Dialysis history */}
      <h3 className={styles.sectionTitle}>透析病史</h3>
      <div className={styles.grid}>
        {renderInput('startHDDate', '05 開始血液透析日期', 'date')}
        {renderSelect('isStartHDHere', '06 是否本院開始血液透析', KIDIT_HISTORY_OPTIONS.yesNo)}
        {renderInput('startHDHospital', '07 開始血液透析院所')}
        {renderInput('startPDDate', '08 腹膜透析開始日期', 'date')}
        {renderSelect('isStartPDHere', '09 是否本院開始腹膜透析', KIDIT_HISTORY_OPTIONS.yesNo)}
        {renderInput('startPDHospital', '10 腹膜透析開始院所')}
        {renderInput('transplantDate', '11 腎移植日期', 'date')}
        {renderSelect('isTransplantHere', '12 是否本院腎移植', KIDIT_HISTORY_OPTIONS.yesNo)}
        {renderInput('transplantHospital', '13 腎移植院所')}
      </div>

      {/* CKD and lab data */}
      <h3 className={styles.sectionTitle}>慢性腎衰竭與檢驗</h3>
      <div className={styles.grid}>
        {renderSelect('isKnownCKD', '14 是否知為慢性腎衰竭', KIDIT_HISTORY_OPTIONS.yesNo)}
        {renderSelect('isBUNCreatAbnormal', '15 BUN或Creatinine異常', KIDIT_HISTORY_OPTIONS.yesNo)}
        {renderInput('abnormalLabDate', '16 BUN/Creatinine 檢驗日期', 'date')}
        {renderInput('initialBUN', '17 BUN (mg/dl)')}
        {renderInput('initialCr', '18 Creatinine (mg/dl)')}
      </div>

      {/* Systemic diseases */}
      {renderCheckboxGroup(
        'selectedSystemicDiseases',
        '22 其他系統性疾病',
        KIDIT_HISTORY_OPTIONS.systemicDiseases,
      )}

      <div className={styles.grid}>
        {renderInput('otherSystemicDescription', '23 其他說明')}
        {renderSelect('dmType', '24 DM型式', KIDIT_HISTORY_OPTIONS.dmType)}
      </div>

      {/* Initial lab values */}
      <h3 className={styles.sectionTitle}>初始檢驗數值</h3>
      <div className={styles.grid}>
        {renderInput('initialLabDate', '25 檢驗日期', 'date')}
        {renderInput('initialHct', '26 Hct (%)')}
        {renderInput('initialHb', '27 Hb (g/dl)')}
        {renderInput('initialK', '30 K (meq/l)')}
        {renderInput('initialAlb', '32 Albumin (gm/dl)')}
        {renderInput('initialWeight', '體重 (kg)')}
        {renderInput('initialHeight', '身高 (cm)')}
        {renderInput('initialEGFR', 'eGFR (ml/min)')}
      </div>

      {/* Hepatitis markers */}
      <h3 className={styles.sectionTitle}>肝炎標記</h3>
      <div className={styles.grid}>
        {renderSelect('hbsag', '33 HBsAg', KIDIT_HISTORY_OPTIONS.hepatitis)}
        {renderSelect('antihcv', '34 Anti-HCV', KIDIT_HISTORY_OPTIONS.hepatitis)}
      </div>

      {/* Indications */}
      <h3 className={styles.sectionTitle}>適應症</h3>
      <div className={styles.grid}>
        {renderSelect('indicationType', '35 適應症種類', KIDIT_HISTORY_OPTIONS.indicationType)}
      </div>

      {renderCheckboxGroup(
        'selectedSymptoms',
        '36 其他症狀',
        KIDIT_HISTORY_OPTIONS.otherSymptoms,
      )}

      {renderCheckboxGroup(
        'selectedEmergencyReasons',
        '38 緊急透析原因',
        KIDIT_HISTORY_OPTIONS.emergencyReasons,
      )}

      <div className={styles.grid}>
        {renderInput('emergencyLabDate', '40 檢驗日期', 'date')}
        {renderSelect('isFirstCatastrophic', '50 是否初次申請重大傷病', KIDIT_HISTORY_OPTIONS.yesNo)}
      </div>

      {!readOnly && (
        <div className={styles.actions}>
          {onCancel && (
            <button type="button" className={styles.cancelButton} onClick={onCancel}>
              取消
            </button>
          )}
          <button type="submit" className={styles.saveButton}>
            儲存
          </button>
        </div>
      )}
    </form>
  )
}
