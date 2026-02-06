import { lazy, Suspense } from 'react'
import styles from './PatientLabSummaryModal.module.css'

const PatientLabSummaryPanel = lazy(() => import('@/components/PatientLabSummaryPanel'))

interface PatientLabSummaryModalProps {
  isVisible: boolean
  patient?: any
  onClose: () => void
  onSaveRecord?: (record: any) => void
}

export default function PatientLabSummaryModal({ isVisible, patient, onClose, onSaveRecord }: PatientLabSummaryModalProps) {
  if (!isVisible || !patient) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>檢驗報告摘要 - {patient.name || '未知病人'}</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div className={styles.content}>
          <Suspense fallback={<div className={styles.loading}>載入中...</div>}>
            <PatientLabSummaryPanel patient={patient} onSaveRecord={onSaveRecord} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
