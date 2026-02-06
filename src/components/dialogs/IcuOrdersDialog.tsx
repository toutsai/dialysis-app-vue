import { useState, useEffect } from 'react'
import styles from './IcuOrdersDialog.module.css'

interface IcuOrdersDialogProps {
  isVisible: boolean
  patient?: any
  onClose: () => void
  onSave: (data: any) => void
}

export default function IcuOrdersDialog({ isVisible, patient, onClose, onSave }: IcuOrdersDialogProps) {
  const [formData, setFormData] = useState({
    akType: 'HD',
    bloodFlow: '200',
    dialysisFluid: '500',
    duration: '4',
    heparinType: 'none',
    heparinDose: '',
    caConcentration: '3.0',
    dryWeight: '',
    notes: '',
  })

  useEffect(() => {
    if (!isVisible) return
    setFormData({
      akType: 'HD',
      bloodFlow: '200',
      dialysisFluid: '500',
      duration: '4',
      heparinType: 'none',
      heparinDose: '',
      caConcentration: '3.0',
      dryWeight: '',
      notes: '',
    })
  }, [isVisible])

  if (!isVisible) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({ ...formData, patientId: patient?.id })
  }

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>ICU 透析醫囑 - {patient?.name || '未知病人'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label>透析模式</label>
              <select value={formData.akType} onChange={e => updateField('akType', e.target.value)}>
                <option value="HD">HD</option>
                <option value="SLED">SLED</option>
                <option value="IHD">IHD</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>血流速 (ml/min)</label>
              <input type="number" value={formData.bloodFlow} onChange={e => updateField('bloodFlow', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>透析液流速 (ml/min)</label>
              <input type="number" value={formData.dialysisFluid} onChange={e => updateField('dialysisFluid', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>透析時間 (小時)</label>
              <input type="number" value={formData.duration} onChange={e => updateField('duration', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>抗凝劑</label>
              <select value={formData.heparinType} onChange={e => updateField('heparinType', e.target.value)}>
                <option value="none">不使用</option>
                <option value="heparin">Heparin</option>
                <option value="enoxaparin">Enoxaparin</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Ca 濃度 (mEq/L)</label>
              <select value={formData.caConcentration} onChange={e => updateField('caConcentration', e.target.value)}>
                <option value="2.5">2.5</option>
                <option value="3.0">3.0</option>
                <option value="3.5">3.5</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>乾體重 (kg)</label>
              <input type="number" step="0.1" value={formData.dryWeight} onChange={e => updateField('dryWeight', e.target.value)} />
            </div>
          </div>
          <div className={styles.field}>
            <label>備註</label>
            <textarea value={formData.notes} onChange={e => updateField('notes', e.target.value)} rows={3} />
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.btnCancel} onClick={onClose}>取消</button>
            <button type="submit" className={styles.btnSave}>儲存</button>
          </div>
        </form>
      </div>
    </div>
  )
}
