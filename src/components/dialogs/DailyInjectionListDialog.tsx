import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/DailyInjectionListDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InjectionRecord {
  id: string
  medicationName: string
  dose: string
  unit: string
  route: string
  scheduledTime: string
  administeredTime?: string
  administeredBy?: string
  status: 'pending' | 'administered' | 'skipped' | 'refused'
  notes?: string
}

interface DailyInjectionListDialogProps {
  isVisible: boolean
  patientId?: string
  date?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockInjections(): InjectionRecord[] {
  return [
    {
      id: 'inj1',
      medicationName: 'Heparin',
      dose: '2000',
      unit: 'IU',
      route: 'IV push',
      scheduledTime: '08:00',
      administeredTime: '08:05',
      administeredBy: '王護理師',
      status: 'administered',
      notes: '透析開始時給予首劑',
    },
    {
      id: 'inj2',
      medicationName: 'Heparin',
      dose: '500',
      unit: 'IU/hr',
      route: 'IV drip',
      scheduledTime: '08:00',
      administeredTime: '08:05',
      administeredBy: '王護理師',
      status: 'administered',
      notes: '持續輸注至透析結束前30分鐘',
    },
    {
      id: 'inj3',
      medicationName: 'EPO (Epoetin alfa)',
      dose: '4000',
      unit: 'IU',
      route: 'SC',
      scheduledTime: '10:00',
      administeredTime: '10:10',
      administeredBy: '李護理師',
      status: 'administered',
    },
    {
      id: 'inj4',
      medicationName: 'Iron Sucrose',
      dose: '100',
      unit: 'mg',
      route: 'IV',
      scheduledTime: '10:30',
      status: 'pending',
    },
    {
      id: 'inj5',
      medicationName: 'Vitamin D (Calcitriol)',
      dose: '0.5',
      unit: 'mcg',
      route: 'IV',
      scheduledTime: '11:00',
      status: 'pending',
    },
    {
      id: 'inj6',
      medicationName: 'Insulin Regular',
      dose: '6',
      unit: 'units',
      route: 'SC',
      scheduledTime: '07:30',
      status: 'skipped',
      notes: '血糖 < 150，依醫囑暫不注射',
    },
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyInjectionListDialog({
  isVisible,
  patientId,
  date,
  onClose,
}: DailyInjectionListDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [injections, setInjections] = useState<InjectionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selectedDate, setSelectedDate] = useState(
    () => date || new Date().toISOString().split('T')[0]
  )

  useEffect(() => {
    if (!isVisible) return
    setIsLoading(true)
    const timer = setTimeout(() => {
      setInjections(getMockInjections())
      setIsLoading(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [isVisible, patientId, selectedDate])

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

  // Mark as administered
  const handleAdminister = (injId: string) => {
    setInjections((prev) =>
      prev.map((inj) =>
        inj.id === injId
          ? {
              ...inj,
              status: 'administered' as const,
              administeredTime: new Date().toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }),
              administeredBy: '目前使用者',
            }
          : inj
      )
    )
  }

  // Filter
  const filteredInjections =
    filterStatus === 'all'
      ? injections
      : injections.filter((inj) => inj.status === filterStatus)

  const statusLabel = (status: InjectionRecord['status']) => {
    switch (status) {
      case 'administered':
        return '已給藥'
      case 'pending':
        return '待給藥'
      case 'skipped':
        return '略過'
      case 'refused':
        return '拒絕'
      default:
        return status
    }
  }

  const statusCounts = {
    all: injections.length,
    pending: injections.filter((i) => i.status === 'pending').length,
    administered: injections.filter((i) => i.status === 'administered').length,
    skipped: injections.filter((i) => i.status === 'skipped').length,
    refused: injections.filter((i) => i.status === 'refused').length,
  }

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="injection-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="injection-title" className={styles.title}>
            每日注射/給藥記錄
            {patientId && <span className={styles.badge}>患者 #{patientId}</span>}
          </h2>
          <div className={styles.headerActions}>
            <input
              type="date"
              className={styles.dateInput}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
              &times;
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          {(['all', 'pending', 'administered', 'skipped', 'refused'] as const).map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.filterChip} ${filterStatus === status ? styles.filterChipActive : ''}`}
              onClick={() => setFilterStatus(status)}
            >
              {status === 'all' ? '全部' : statusLabel(status)}
              <span className={styles.filterCount}>
                {statusCounts[status]}
              </span>
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : filteredInjections.length === 0 ? (
            <div className={styles.empty}>無符合條件的記錄</div>
          ) : (
            <div className={styles.injectionList}>
              {filteredInjections.map((inj) => (
                <div
                  key={inj.id}
                  className={`${styles.injectionCard} ${styles[`status_${inj.status}`]}`}
                >
                  <div className={styles.cardLeft}>
                    <div className={styles.cardTime}>{inj.scheduledTime}</div>
                    <div className={`${styles.statusDot} ${styles[`dot_${inj.status}`]}`} />
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.cardHeader}>
                      <span className={styles.medName}>{inj.medicationName}</span>
                      <span className={`${styles.statusBadge} ${styles[`badge_${inj.status}`]}`}>
                        {statusLabel(inj.status)}
                      </span>
                    </div>
                    <div className={styles.cardDetails}>
                      <span className={styles.doseInfo}>
                        {inj.dose} {inj.unit}
                      </span>
                      <span className={styles.routeInfo}>{inj.route}</span>
                    </div>
                    {inj.administeredTime && (
                      <div className={styles.administeredInfo}>
                        給藥時間：{inj.administeredTime}
                        {inj.administeredBy && ` (${inj.administeredBy})`}
                      </div>
                    )}
                    {inj.notes && <div className={styles.cardNotes}>{inj.notes}</div>}
                  </div>
                  <div className={styles.cardActions}>
                    {inj.status === 'pending' && (
                      <button
                        type="button"
                        className={styles.administerButton}
                        onClick={() => handleAdminister(inj.id)}
                      >
                        給藥
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerSummary}>
            待給藥：<strong>{statusCounts.pending}</strong> 項
          </div>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
