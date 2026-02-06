import { useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/PatientActionModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientActionPatient {
  id: string
  name?: string
  chartNo?: string
  bed?: string
  shift?: string
  status?: string
  [key: string]: unknown
}

interface PatientActionModalProps {
  isVisible: boolean
  patient: PatientActionPatient | null
  hasMemo?: boolean
  onSelect: (action: string) => void
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Action definitions
// ---------------------------------------------------------------------------

interface ActionItem {
  key: string
  label: string
  icon: string
  description: string
  color: string
}

const ACTIONS: ActionItem[] = [
  {
    key: 'view_condition',
    label: '查看病況',
    icon: '\u{1F4CB}',
    description: '查看病患詳細資料及透析紀錄',
    color: '#007bff',
  },
  {
    key: 'memos',
    label: '備忘錄',
    icon: '\u{1F4DD}',
    description: '查看或新增病患備忘錄',
    color: '#28a745',
  },
  {
    key: 'lab_reports',
    label: '檢驗報告',
    icon: '\u{1F9EA}',
    description: '查看最新的檢驗報告結果',
    color: '#6f42c1',
  },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientActionModal({
  isVisible,
  patient,
  hasMemo,
  onSelect,
  onClose,
}: PatientActionModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

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

  const handleActionClick = (actionKey: string) => {
    onSelect(actionKey)
  }

  if (!isVisible || !patient) return null

  const shiftMap: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' }

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="action-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.patientInfo}>
            <h2 id="action-title" className={styles.patientName}>
              {patient.name || '未知病患'}
            </h2>
            <div className={styles.patientMeta}>
              {patient.chartNo && <span>病歷號: {patient.chartNo}</span>}
              {patient.bed && <span>床號: {patient.bed}</span>}
              {patient.shift && <span>{shiftMap[patient.shift] || patient.shift}</span>}
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Action List */}
        <div className={styles.actionList}>
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              type="button"
              className={styles.actionItem}
              onClick={() => handleActionClick(action.key)}
            >
              <div className={styles.actionIcon} style={{ backgroundColor: action.color }}>
                <span>{action.icon}</span>
              </div>
              <div className={styles.actionText}>
                <span className={styles.actionLabel}>
                  {action.label}
                  {action.key === 'memos' && hasMemo && (
                    <span className={styles.memoBadge}>有備忘</span>
                  )}
                </span>
                <span className={styles.actionDescription}>{action.description}</span>
              </div>
              <div className={styles.actionArrow}>&#8250;</div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className={styles.footer}>
          <span className={styles.footerHint}>按 Esc 關閉</span>
        </div>
      </div>
    </div>
  )
}
