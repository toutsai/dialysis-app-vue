import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/DailyRecordsSummaryDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyRecord {
  id: string
  category: string
  time: string
  description: string
  value?: string
  unit?: string
  recordedBy: string
}

interface DailySummary {
  date: string
  dialysisSession?: {
    startTime: string
    endTime: string
    duration: string
    mode: string
    dryWeight: string
    preWeight: string
    postWeight: string
    ufGoal: string
    ufActual: string
  }
  vitals: {
    time: string
    systolic: number
    diastolic: number
    heartRate: number
    temperature?: number
  }[]
  records: DailyRecord[]
}

interface DailyRecordsSummaryDialogProps {
  isVisible: boolean
  patientId?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockSummary(): DailySummary {
  const today = new Date()
  return {
    date: today.toISOString().split('T')[0],
    dialysisSession: {
      startTime: '08:00',
      endTime: '12:00',
      duration: '4小時',
      mode: 'HD',
      dryWeight: '65.0',
      preWeight: '67.5',
      postWeight: '65.2',
      ufGoal: '2.5',
      ufActual: '2.3',
    },
    vitals: [
      { time: '08:00', systolic: 140, diastolic: 85, heartRate: 78, temperature: 36.5 },
      { time: '09:00', systolic: 135, diastolic: 82, heartRate: 76 },
      { time: '10:00', systolic: 128, diastolic: 78, heartRate: 74 },
      { time: '11:00', systolic: 125, diastolic: 76, heartRate: 72 },
      { time: '12:00', systolic: 130, diastolic: 80, heartRate: 75, temperature: 36.4 },
    ],
    records: [
      {
        id: 'r1',
        category: '護理評估',
        time: '08:15',
        description: '透析前評估完成，瘻管通暢，無紅腫',
        recordedBy: '王護理師',
      },
      {
        id: 'r2',
        category: '用藥',
        time: '08:30',
        description: 'Heparin 首劑 2000 IU IV push',
        value: '2000',
        unit: 'IU',
        recordedBy: '王護理師',
      },
      {
        id: 'r3',
        category: '護理處置',
        time: '10:00',
        description: '患者主訴頭暈，調低超濾速率',
        recordedBy: '李護理師',
      },
      {
        id: 'r4',
        category: '飲食',
        time: '10:30',
        description: '進食半碗稀飯，症狀緩解',
        recordedBy: '李護理師',
      },
      {
        id: 'r5',
        category: '護理評估',
        time: '12:10',
        description: '透析結束，止血完成，生命徵象穩定',
        recordedBy: '王護理師',
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyRecordsSummaryDialog({
  isVisible,
  patientId,
  onClose,
}: DailyRecordsSummaryDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [summary, setSummary] = useState<DailySummary | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (!isVisible) return
    setIsLoading(true)
    const timer = setTimeout(() => {
      setSummary(getMockSummary())
      setIsLoading(false)
    }, 400)
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

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="daily-summary-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="daily-summary-title" className={styles.title}>
            每日記錄摘要
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

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : !summary ? (
            <div className={styles.empty}>該日無記錄資料</div>
          ) : (
            <>
              {/* Dialysis session summary */}
              {summary.dialysisSession && (
                <section className={styles.section}>
                  <h3 className={styles.sectionTitle}>透析療程</h3>
                  <div className={styles.sessionGrid}>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>模式</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.mode}</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>時間</span>
                      <span className={styles.sessionValue}>
                        {summary.dialysisSession.startTime} - {summary.dialysisSession.endTime}
                      </span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>時長</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.duration}</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>乾體重</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.dryWeight} kg</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>透前體重</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.preWeight} kg</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>透後體重</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.postWeight} kg</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>脫水目標</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.ufGoal} L</span>
                    </div>
                    <div className={styles.sessionItem}>
                      <span className={styles.sessionLabel}>實際脫水</span>
                      <span className={styles.sessionValue}>{summary.dialysisSession.ufActual} L</span>
                    </div>
                  </div>
                </section>
              )}

              {/* Vital signs table */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>生命徵象紀錄</h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>時間</th>
                        <th>收縮壓</th>
                        <th>舒張壓</th>
                        <th>心率</th>
                        <th>體溫</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.vitals.map((v, i) => (
                        <tr key={i}>
                          <td>{v.time}</td>
                          <td>{v.systolic}</td>
                          <td>{v.diastolic}</td>
                          <td>{v.heartRate}</td>
                          <td>{v.temperature ? `${v.temperature}\u00B0C` : '--'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Records timeline */}
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>護理記錄</h3>
                <div className={styles.timeline}>
                  {summary.records.map((record) => (
                    <div key={record.id} className={styles.timelineItem}>
                      <div className={styles.timelineDot} />
                      <div className={styles.timelineContent}>
                        <div className={styles.timelineHeader}>
                          <span className={styles.timelineTime}>{record.time}</span>
                          <span className={styles.timelineCategory}>{record.category}</span>
                        </div>
                        <p className={styles.timelineDescription}>{record.description}</p>
                        {record.value && (
                          <span className={styles.timelineValue}>
                            {record.value} {record.unit}
                          </span>
                        )}
                        <span className={styles.timelineAuthor}>{record.recordedBy}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
