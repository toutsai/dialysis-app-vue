import { useState, useEffect, useCallback, useRef } from 'react'
import ApiManager from '@/services/api_manager'
import { formatDateTimeToLocal } from '@/utils/dateUtils'
import styles from '@/components/dialogs/PatientHistoryModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HistoryEvent {
  id: string
  patientId?: string
  type: string
  title: string
  description?: string
  date: string
  status?: string
  author?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

interface PatientHistoryModalProps {
  isVisible: boolean
  patientId: string
  patientName?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EVENT_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  admission: { label: '入院', color: '#155724', bgColor: '#d4edda' },
  discharge: { label: '出院', color: '#856404', bgColor: '#fff3cd' },
  transfer: { label: '轉院', color: '#004085', bgColor: '#cce5ff' },
  dialysis_start: { label: '開始透析', color: '#155724', bgColor: '#d4edda' },
  dialysis_stop: { label: '暫停透析', color: '#856404', bgColor: '#fff3cd' },
  bed_change: { label: '換床', color: '#383d41', bgColor: '#e2e3e5' },
  shift_change: { label: '換班', color: '#383d41', bgColor: '#e2e3e5' },
  status_change: { label: '狀態變更', color: '#0c5460', bgColor: '#d1ecf1' },
  lab_report: { label: '檢驗報告', color: '#004085', bgColor: '#cce5ff' },
  memo: { label: '備忘錄', color: '#495057', bgColor: '#f8f9fa' },
  order_change: { label: '醫囑變更', color: '#721c24', bgColor: '#f8d7da' },
  exception: { label: '排程異動', color: '#856404', bgColor: '#fff3cd' },
  note: { label: '紀錄', color: '#495057', bgColor: '#f8f9fa' },
}

function getEventConfig(type: string) {
  return EVENT_TYPE_CONFIG[type] || { label: type, color: '#495057', bgColor: '#e9ecef' }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientHistoryModal({
  isVisible,
  patientId,
  patientName,
  onClose,
}: PatientHistoryModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [events, setEvents] = useState<HistoryEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string>('all')

  // Fetch history
  useEffect(() => {
    if (!isVisible || !patientId) return

    setIsLoading(true)
    setError(null)

    const api = ApiManager<HistoryEvent>('patient_history')
    api
      .fetchAll()
      .then((records) => {
        const filtered = records
          .filter((r) => r.patientId === patientId)
          .sort((a, b) => {
            if (b.date > a.date) return 1
            if (b.date < a.date) return -1
            return 0
          })
        setEvents(filtered)
      })
      .catch((err) => {
        console.error('[PatientHistoryModal] fetch error:', err)
        setError('無法載入病患歷史紀錄')
      })
      .finally(() => setIsLoading(false))
  }, [isVisible, patientId])

  // Reset on open
  useEffect(() => {
    if (isVisible) {
      setFilterType('all')
    }
  }, [isVisible])

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

  // Derive unique event types for filter
  const eventTypes = Array.from(new Set(events.map((e) => e.type)))
  const filteredEvents = filterType === 'all' ? events : events.filter((e) => e.type === filterType)

  // Group events by date
  const groupedByDate = filteredEvents.reduce<Record<string, HistoryEvent[]>>((acc, ev) => {
    const dateKey = ev.date.slice(0, 10) // YYYY-MM-DD
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(ev)
    return acc
  }, {})
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => (b > a ? 1 : -1))

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="history-title">
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 id="history-title" className={styles.title}>
              病患歷史紀錄
            </h2>
            {patientName && <span className={styles.subtitle}>{patientName}</span>}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Filter Bar */}
        <div className={styles.filterBar}>
          <button
            type="button"
            className={`${styles.filterChip} ${filterType === 'all' ? styles.filterChipActive : ''}`}
            onClick={() => setFilterType('all')}
          >
            全部 ({events.length})
          </button>
          {eventTypes.map((type) => {
            const config = getEventConfig(type)
            const count = events.filter((e) => e.type === type).length
            return (
              <button
                key={type}
                type="button"
                className={`${styles.filterChip} ${filterType === type ? styles.filterChipActive : ''}`}
                onClick={() => setFilterType(type)}
              >
                {config.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loadingState}>載入歷史紀錄中...</div>
          ) : error ? (
            <div className={styles.errorState}>{error}</div>
          ) : filteredEvents.length === 0 ? (
            <div className={styles.emptyState}>尚無歷史紀錄</div>
          ) : (
            <div className={styles.timeline}>
              {sortedDates.map((date) => (
                <div key={date} className={styles.dateGroup}>
                  <div className={styles.dateLabel}>{date}</div>
                  <div className={styles.dateEvents}>
                    {groupedByDate[date].map((ev) => {
                      const config = getEventConfig(ev.type)
                      return (
                        <div key={ev.id} className={styles.eventCard}>
                          <div className={styles.eventDot} style={{ backgroundColor: config.color }} />
                          <div className={styles.eventLine} />
                          <div className={styles.eventBody}>
                            <div className={styles.eventHeader}>
                              <span
                                className={styles.eventTypeBadge}
                                style={{ backgroundColor: config.bgColor, color: config.color }}
                              >
                                {config.label}
                              </span>
                              <span className={styles.eventTime}>
                                {ev.date.length > 10
                                  ? formatDateTimeToLocal(new Date(ev.date))
                                  : ev.date}
                              </span>
                            </div>
                            <div className={styles.eventTitle}>{ev.title}</div>
                            {ev.description && (
                              <div className={styles.eventDescription}>{ev.description}</div>
                            )}
                            {ev.author && (
                              <div className={styles.eventAuthor}>操作者: {ev.author}</div>
                            )}
                            {ev.status && (
                              <div className={styles.eventStatus}>
                                狀態: <strong>{ev.status}</strong>
                              </div>
                            )}
                            {ev.details && Object.keys(ev.details).length > 0 && (
                              <div className={styles.eventDetails}>
                                {Object.entries(ev.details).map(([key, val]) => (
                                  <span key={key} className={styles.detailItem}>
                                    {key}: {String(val)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
