// src/pages/LabReportPage.tsx
// Scaffold - Lab report management with query/alert/upload tabs

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './LabReportPage.module.css'

type LabTab = 'query' | 'alert' | 'upload'

interface LabReport {
  id: string
  patientId: string
  patientName: string
  reportDate: string
  reportType: string
  values: Record<string, unknown>
  isAbnormal: boolean
  [key: string]: unknown
}

const TABS: { key: LabTab; label: string }[] = [
  { key: 'query', label: '檢驗查詢' },
  { key: 'alert', label: '異常警示' },
  { key: 'upload', label: '上傳報告' },
]

const LabReportPage: React.FC = () => {
  const { currentUser, isContributor } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)

  const [activeTab, setActiveTab] = useState<LabTab>('query')
  const [reports, setReports] = useState<LabReport[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchPatient, setSearchPatient] = useState('')
  const [dateRange, setDateRange] = useState({
    start: new Date().toISOString().slice(0, 10),
    end: new Date().toISOString().slice(0, 10),
  })

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch lab reports based on active tab and filters
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch lab reports
    setIsLoading(false)
  }, [activeTab, dateRange])

  const handleTabChange = useCallback((tab: LabTab) => {
    setActiveTab(tab)
    setReports([])
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>檢驗報告</h1>
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

      {/* Query Tab Content */}
      {activeTab === 'query' && (
        <div className={styles.tabContent}>
          <div className={styles.filterBar}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="搜尋病患..."
              value={searchPatient}
              onChange={(e) => setSearchPatient(e.target.value)}
            />
            <input
              type="date"
              className={styles.dateInput}
              value={dateRange.start}
              onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
            />
            <span className={styles.dateSep}>~</span>
            <input
              type="date"
              className={styles.dateInput}
              value={dateRange.end}
              onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
            />
            <button className={styles.queryButton}>查詢</button>
          </div>

          {isLoading && <div className={styles.loadingOverlay}>載入中...</div>}

          <div className={styles.tableWrapper}>
            <table className={styles.reportTable}>
              <thead>
                <tr>
                  <th>病患姓名</th>
                  <th>檢驗日期</th>
                  <th>報告類型</th>
                  <th>異常</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={styles.emptyRow}>
                      尚無檢驗資料
                    </td>
                  </tr>
                ) : (
                  reports.map((report) => (
                    <tr key={report.id}>
                      <td>{report.patientName}</td>
                      <td>{report.reportDate}</td>
                      <td>{report.reportType}</td>
                      <td>
                        {report.isAbnormal && (
                          <span className={styles.abnormalBadge}>異常</span>
                        )}
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

      {/* Alert Tab Content */}
      {activeTab === 'alert' && (
        <div className={styles.tabContent}>
          <div className={styles.emptyState}>
            {/* TODO: Render abnormal lab alerts */}
            <p>異常警示列表將顯示在此處</p>
          </div>
        </div>
      )}

      {/* Upload Tab Content */}
      {activeTab === 'upload' && (
        <div className={styles.tabContent}>
          <div className={styles.uploadArea}>
            {/* TODO: File upload dropzone */}
            <div className={styles.uploadDropzone}>
              <p className={styles.uploadText}>拖曳檔案至此或點擊上傳</p>
              <button className={styles.uploadButton}>選擇檔案</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LabReportPage
