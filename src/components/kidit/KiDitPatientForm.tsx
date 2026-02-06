// src/components/kidit/KiDitPatientForm.tsx
// Patient profile form for KiDit declaration with fields from KIDIT_OPTIONS

import { useState, useCallback } from 'react'
import { KIDIT_OPTIONS } from '@/utils/kiditHelpers'
import styles from './KiDitPatientForm.module.css'

export interface KiDitPatientData {
  name: string
  patientCategory: string
  birthDate: string
  idNumber: string
  gender: string
  maritalStatus: string
  phone: string
  medicalRecordNumber: string
  dialysisCode: string
  address: string
  education: string
  occupation: string
  contactPerson: string
  relationship: string
  bloodType: string
  catastrophicCardNo: string
  isIndigenous: string
  isWelfare: string
  status: string
  firstDialysisDate: string
  hospitalStartDate: string
  diagnosisCategory: string
  diagnosisSubcategory: string
}

const EMPTY_FORM: KiDitPatientData = {
  name: '',
  patientCategory: '',
  birthDate: '',
  idNumber: '',
  gender: '',
  maritalStatus: '',
  phone: '',
  medicalRecordNumber: '',
  dialysisCode: '',
  address: '',
  education: '',
  occupation: '',
  contactPerson: '',
  relationship: '',
  bloodType: '',
  catastrophicCardNo: '',
  isIndigenous: '',
  isWelfare: '',
  status: '',
  firstDialysisDate: '',
  hospitalStartDate: '',
  diagnosisCategory: '',
  diagnosisSubcategory: '',
}

interface KiDitPatientFormProps {
  initialData?: Partial<KiDitPatientData>
  onSave?: (data: KiDitPatientData) => void
  onCancel?: () => void
  readOnly?: boolean
}

export default function KiDitPatientForm({
  initialData,
  onSave,
  onCancel,
  readOnly = false,
}: KiDitPatientFormProps) {
  const [form, setForm] = useState<KiDitPatientData>({
    ...EMPTY_FORM,
    ...initialData,
  })

  const handleChange = useCallback(
    (field: keyof KiDitPatientData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }))
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
    field: keyof KiDitPatientData,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <select
        className={styles.select}
        value={form[field]}
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
    field: keyof KiDitPatientData,
    label: string,
    type: string = 'text',
    placeholder?: string,
  ) => (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        className={styles.input}
        type={type}
        value={form[field]}
        onChange={handleChange(field)}
        placeholder={placeholder}
        disabled={readOnly}
      />
    </div>
  )

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.sectionTitle}>病患基本資料</h3>

      <div className={styles.grid}>
        {renderInput('name', '01 姓名')}
        {renderSelect('patientCategory', '02 病患類別', KIDIT_OPTIONS.patientCategory)}
        {renderInput('birthDate', '03 生日', 'date')}
        {renderInput('idNumber', '04 身分證號')}
        {renderSelect('gender', '05 性別', KIDIT_OPTIONS.gender)}
        {renderSelect('maritalStatus', '06 婚姻', KIDIT_OPTIONS.maritalStatus)}
        {renderInput('phone', '07 電話')}
        {renderInput('medicalRecordNumber', '08 病歷號')}
        {renderInput('dialysisCode', '09 透析代號')}
        {renderInput('address', '10 地址')}
        {renderSelect('education', '11 教育程度', KIDIT_OPTIONS.education)}
        {renderSelect('occupation', '12 職業', KIDIT_OPTIONS.occupation)}
        {renderInput('contactPerson', '13 連絡人')}
        {renderSelect('relationship', '14 關係', KIDIT_OPTIONS.relation)}
        {renderSelect('bloodType', '15 血型', KIDIT_OPTIONS.bloodType)}
        {renderInput('catastrophicCardNo', '16 重大傷病卡號')}
        {renderSelect('isIndigenous', '17 是否為原住民', KIDIT_OPTIONS.yesNo)}
        {renderSelect('isWelfare', '18 是否具福保身分', KIDIT_OPTIONS.yesNo)}
        {renderSelect('status', '19 狀態', KIDIT_OPTIONS.status)}
        {renderInput('firstDialysisDate', '20 首次治療日期', 'date')}
        {renderInput('hospitalStartDate', '21 本院開始治療日期', 'date')}
        {renderSelect('diagnosisCategory', '22 原發病大類', KIDIT_OPTIONS.diagnosisCategory)}
        {renderSelect('diagnosisSubcategory', '23 原發病細類', KIDIT_OPTIONS.diagnosisSubcategory)}
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
