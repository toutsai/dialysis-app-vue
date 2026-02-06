// src/components/kidit/VascularAccessForm.tsx
// Vascular access form for KiDit HD access declaration

import { useState, useCallback } from 'react'
import styles from './VascularAccessForm.module.css'

interface AccessEntry {
  isAutoCap: boolean
  autoCapSide: string
  autoCapSite: string
  isManuCap: boolean
  manuCapSide: string
  manuCapSite: string
  isPermCath: boolean
  permCathSide: string
  permCathSite: string
  isDoubleLumen: boolean
  dlSide: string
  dlSite: string
}

const EMPTY_ACCESS: AccessEntry = {
  isAutoCap: false,
  autoCapSide: '',
  autoCapSite: '',
  isManuCap: false,
  manuCapSide: '',
  manuCapSite: '',
  isPermCath: false,
  permCathSide: '',
  permCathSite: '',
  isDoubleLumen: false,
  dlSide: '',
  dlSite: '',
}

export interface VascularAccessData {
  current: AccessEntry
  unused: AccessEntry
}

const EMPTY_FORM: VascularAccessData = {
  current: { ...EMPTY_ACCESS },
  unused: { ...EMPTY_ACCESS },
}

const SIDE_OPTIONS = [
  { value: 'L', label: '左' },
  { value: 'R', label: '右' },
]

interface VascularAccessFormProps {
  initialData?: Partial<VascularAccessData>
  onSave?: (data: VascularAccessData) => void
  onCancel?: () => void
  readOnly?: boolean
}

export default function VascularAccessForm({
  initialData,
  onSave,
  onCancel,
  readOnly = false,
}: VascularAccessFormProps) {
  const [form, setForm] = useState<VascularAccessData>({
    current: { ...EMPTY_ACCESS, ...initialData?.current },
    unused: { ...EMPTY_ACCESS, ...initialData?.unused },
  })

  const handleToggle = useCallback(
    (section: 'current' | 'unused', field: keyof AccessEntry) => {
      setForm((prev) => ({
        ...prev,
        [section]: {
          ...prev[section],
          [field]: !prev[section][field],
        },
      }))
    },
    [],
  )

  const handleFieldChange = useCallback(
    (section: 'current' | 'unused', field: keyof AccessEntry) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm((prev) => ({
          ...prev,
          [section]: {
            ...prev[section],
            [field]: e.target.value,
          },
        }))
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

  const renderAccessBlock = (
    section: 'current' | 'unused',
    title: string,
  ) => {
    const data = form[section]

    return (
      <div className={styles.accessBlock}>
        <h4 className={styles.blockTitle}>{title}</h4>

        {/* Auto AV Fistula */}
        <div className={styles.accessRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.isAutoCap}
              onChange={() => handleToggle(section, 'isAutoCap')}
              disabled={readOnly}
            />
            <span>自體動靜脈瘻管</span>
          </label>
          {data.isAutoCap && (
            <div className={styles.accessDetails}>
              <select
                className={styles.select}
                value={data.autoCapSide}
                onChange={handleFieldChange(section, 'autoCapSide')}
                disabled={readOnly}
              >
                <option value="">左右</option>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className={styles.input}
                type="text"
                placeholder="位置"
                value={data.autoCapSite}
                onChange={handleFieldChange(section, 'autoCapSite')}
                disabled={readOnly}
              />
            </div>
          )}
        </div>

        {/* Manual AV Graft */}
        <div className={styles.accessRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.isManuCap}
              onChange={() => handleToggle(section, 'isManuCap')}
              disabled={readOnly}
            />
            <span>人工動靜脈瘻管</span>
          </label>
          {data.isManuCap && (
            <div className={styles.accessDetails}>
              <select
                className={styles.select}
                value={data.manuCapSide}
                onChange={handleFieldChange(section, 'manuCapSide')}
                disabled={readOnly}
              >
                <option value="">左右</option>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className={styles.input}
                type="text"
                placeholder="位置"
                value={data.manuCapSite}
                onChange={handleFieldChange(section, 'manuCapSite')}
                disabled={readOnly}
              />
            </div>
          )}
        </div>

        {/* PermCath */}
        <div className={styles.accessRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.isPermCath}
              onChange={() => handleToggle(section, 'isPermCath')}
              disabled={readOnly}
            />
            <span>PermCath 或其他長期導管</span>
          </label>
          {data.isPermCath && (
            <div className={styles.accessDetails}>
              <select
                className={styles.select}
                value={data.permCathSide}
                onChange={handleFieldChange(section, 'permCathSide')}
                disabled={readOnly}
              >
                <option value="">左右</option>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className={styles.input}
                type="text"
                placeholder="位置"
                value={data.permCathSite}
                onChange={handleFieldChange(section, 'permCathSite')}
                disabled={readOnly}
              />
            </div>
          )}
        </div>

        {/* Double Lumen / Short-term catheter */}
        <div className={styles.accessRow}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={data.isDoubleLumen}
              onChange={() => handleToggle(section, 'isDoubleLumen')}
              disabled={readOnly}
            />
            <span>其他短期導管</span>
          </label>
          {data.isDoubleLumen && (
            <div className={styles.accessDetails}>
              <select
                className={styles.select}
                value={data.dlSide}
                onChange={handleFieldChange(section, 'dlSide')}
                disabled={readOnly}
              >
                <option value="">左右</option>
                {SIDE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input
                className={styles.input}
                type="text"
                placeholder="位置"
                value={data.dlSite}
                onChange={handleFieldChange(section, 'dlSite')}
                disabled={readOnly}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h3 className={styles.sectionTitle}>HD 造管紀錄</h3>

      {renderAccessBlock('current', '目前使用的血管通路')}
      {renderAccessBlock('unused', '並存 / 其他未使用之血管通路')}

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
