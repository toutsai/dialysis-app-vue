// src/pages/PatientMovementReportPage.tsx
// KiDit 申報工作站 - Calendar view with patient movement events

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './PatientMovementReportPage.module.css'

type ReportTab = 'calendar' | 'list' | 'export'

interface MovementEvent {
  id: string
  patientId: string
  patientName: string
  eventType: 'admission' | 'discharge' | 'transfer_in' | 'transfer_out' | 'death' | 'other'
  eventDate: string
  description: string
  reportedBy: string
  status: 'pending' | 'reported' | 'confirmed'
  [key: string]: unknown
}

const TABS: { key: ReportTab; label: string }[] = [
  { key: 'calendar', label: '月曆檢視' },
  { key: 'list', label: '異動列表' },
  { key: 'export', label: '匯出申報' },
]

const EVENT_TYPE_LABELS: Record<string, string> = {
  admission: '新收',
  discharge: '結案',
  transfer_in: '轉入',
  transfer_out: '轉出',
  death: '死亡',
  other: '其他',
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  admission: 'eventAdmission',
  discharge: 'eventDischarge',
  transfer_in: 'eventTransferIn',
  transfer_out: 'eventTransferOut',
  death: 'eventDeath',
  other: 'eventOther',
}

const PatientMovementReportPage: React.FC = () => {
  const { currentUser, isContributor } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)

  const [activeTab, setActiveTab] = useState<ReportTab>('calendar')
  const [events, setEvents] = useState<MovementEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch movement events based on selected period
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch patient movement events
    setIsLoading(false)
  }, [selectedYear, selectedMonth, activeTab])

  const handleTabChange = useCallback((tab: ReportTab) => {
    setActiveTab(tab)
  }, [])

  // Generate calendar days for the selected month
  const calendarDays = useMemo(() => {
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1)
    const lastDay = new Date(selectedYear, selectedMonth, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay() // 0=Sun

    const days: (number | null)[] = []
    // Pad leading empty cells
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null)
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(d)
    }
    return days
  }, [selectedYear, selectedMonth])

  // Group events by day
  const eventsByDay = useMemo(() => {
    const map = new Map<number, MovementEvent[]>()
    for (const evt of events) {
      const date = new Date(evt.eventDate)
      if (date.getFullYear() === selectedYear && date.getMonth() + 1 === selectedMonth) {
        const day = date.getDate()
        const existing = map.get(day) || []
        existing.push(evt)
        map.set(day, existing)
      }
    }
    return map
  }, [events, selectedYear, selectedMonth])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">KiDit 申報工作站</h1>
        <div className={styles.periodSelector}>
          <select
            className={styles.selectInput}
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y} 年</option>
            ))}
          </select>
          <select
            className={styles.selectInput}
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{m} 月</option>
            ))}
          </select>
          {isContributor && (
            <button className={styles.addButton}>+ 新增異動</button>
          )}
        </div>
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div className={styles.tabContent}>
          <div className={styles.calendarContainer}>
            <div className={styles.calendarHeader}>
              {['日', '一', '二', '三', '四', '五', '六'].map((d) => (
                <div key={d} className={styles.calendarHeaderCell}>{d}</div>
              ))}
            </div>
            <div className={styles.calendarBody}>
              {calendarDays.map((day, idx) => (
                <div
                  key={idx}
                  className={`${styles.calendarCell} ${day === null ? styles.calendarCellEmpty : ''}`}
                >
                  {day !== null && (
                    <>
                      <span className={styles.dayNumber}>{day}</span>
                      <div className={styles.dayEvents}>
                        {(eventsByDay.get(day) || []).map((evt) => (
                          <span
                            key={evt.id}
                            className={`${styles.eventDot} ${styles[EVENT_TYPE_COLORS[evt.eventType] || 'eventOther']}`}
                            title={`${EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}: ${evt.patientName}`}
                          >
                            {EVENT_TYPE_LABELS[evt.eventType]?.charAt(0) || '?'}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className={styles.legend}>
            {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
              <span key={key} className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles[EVENT_TYPE_COLORS[key] || 'eventOther']}`} />
                {label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* List Tab */}
      {activeTab === 'list' && (
        <div className={styles.tabContent}>
          <div className={styles.tableWrapper}>
            <table className={styles.eventTable}>
              <thead>
                <tr>
                  <th>日期</th>
                  <th>病患姓名</th>
                  <th>異動類型</th>
                  <th>說明</th>
                  <th>申報狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyRow}>
                      本月尚無異動紀錄
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt.id}>
                      <td>{evt.eventDate}</td>
                      <td className={styles.patientNameCell}>{evt.patientName}</td>
                      <td>
                        <span className={`${styles.typeBadge} ${styles[EVENT_TYPE_COLORS[evt.eventType] || 'eventOther']}`}>
                          {EVENT_TYPE_LABELS[evt.eventType] || evt.eventType}
                        </span>
                      </td>
                      <td>{evt.description}</td>
                      <td>
                        <span className={`${styles.statusBadge} ${styles[`status_${evt.status}`]}`}>
                          {evt.status === 'pending' ? '待申報' : evt.status === 'reported' ? '已申報' : '已確認'}
                        </span>
                      </td>
                      <td>
                        <button className={styles.viewButton}>檢視</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export Tab */}
      {activeTab === 'export' && (
        <div className={styles.tabContent}>
          <div className={styles.exportPanel}>
            <h2 className={styles.exportTitle}>匯出 {selectedYear} 年 {selectedMonth} 月申報資料</h2>
            <p className={styles.exportDescription}>
              將當月異動紀錄匯出為 Excel 格式，供 KiDit 系統申報使用。
            </p>
            <div className={styles.exportActions}>
              <button className={styles.exportButton} disabled={events.length === 0}>
                匯出 Excel
              </button>
              <button className={styles.exportButtonSecondary} disabled={events.length === 0}>
                匯出 CSV
              </button>
            </div>
            {events.length === 0 && (
              <p className={styles.exportHint}>本月尚無異動紀錄可供匯出</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PatientMovementReportPage
