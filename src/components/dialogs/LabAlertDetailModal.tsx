import styles from './LabAlertDetailModal.module.css'
import { ALERT_CAUSES, ALERT_SUGGESTIONS } from '@/constants/labAlertConstants'

interface LabAlertDetailModalProps {
  isVisible: boolean
  alert?: {
    id?: string
    type?: string
    patientName?: string
    patientId?: string
    value?: number
    unit?: string
    referenceRange?: string
    date?: string
    [key: string]: unknown
  }
  onClose: () => void
}

export default function LabAlertDetailModal({ isVisible, alert, onClose }: LabAlertDetailModalProps) {
  if (!isVisible || !alert) return null

  const alertType = alert.type || ''
  const causes = (ALERT_CAUSES as Record<string, any[]>)[alertType] || []
  const suggestions = (ALERT_SUGGESTIONS as Record<string, any[]>)[alertType] || []

  const groupByCategory = (items: { category: string; text: string }[]) => {
    const grouped: Record<string, string[]> = {}
    items.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = []
      grouped[item.category].push(item.text)
    })
    return grouped
  }

  const groupedCauses = groupByCategory(causes)
  const groupedSuggestions = groupByCategory(suggestions)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>檢驗異常警示詳情</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <div className={styles.alertInfo}>
          <div className={styles.infoRow}>
            <span className={styles.label}>病人：</span>
            <span>{alert.patientName || '未知'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>項目：</span>
            <span className={styles.alertType}>{alertType}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>數值：</span>
            <span className={styles.alertValue}>{alert.value} {alert.unit || ''}</span>
          </div>
          {alert.referenceRange && (
            <div className={styles.infoRow}>
              <span className={styles.label}>參考範圍：</span>
              <span>{alert.referenceRange}</span>
            </div>
          )}
          {alert.date && (
            <div className={styles.infoRow}>
              <span className={styles.label}>日期：</span>
              <span>{alert.date}</span>
            </div>
          )}
        </div>

        {Object.keys(groupedCauses).length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>可能原因</h3>
            {Object.entries(groupedCauses).map(([category, texts]) => (
              <div key={category} className={styles.categoryGroup}>
                <h4 className={styles.categoryTitle}>{category}</h4>
                <ul className={styles.itemList}>
                  {texts.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        {Object.keys(groupedSuggestions).length > 0 && (
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>建議處置</h3>
            {Object.entries(groupedSuggestions).map(([category, texts]) => (
              <div key={category} className={styles.categoryGroup}>
                <h4 className={styles.categoryTitle}>{category}</h4>
                <ul className={styles.itemList}>
                  {texts.map((text, i) => <li key={i}>{text}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <button className={styles.btnClose} onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>
  )
}
