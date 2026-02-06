// src/pages/ReportingPage.tsx
// Scaffold - Statistical reports generation

import { useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './ReportingPage.module.css'

type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom'

interface ReportConfig {
  type: ReportType
  startDate: string
  endDate: string
  includeOPD: boolean
  includeIPD: boolean
  includeER: boolean
}

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: 'daily', label: '日報' },
  { key: 'weekly', label: '週報' },
  { key: 'monthly', label: '月報' },
  { key: 'custom', label: '自訂區間' },
]

const ReportingPage: React.FC = () => {
  const { currentUser, isEditor } = useAuth()

  const [reportType, setReportType] = useState<ReportType>('daily')
  const [startDate, setStartDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })
  const [isGenerating, setIsGenerating] = useState(false)
  const [reportData, setReportData] = useState<Record<string, unknown> | null>(null)

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setReportData(null)

    try {
      // TODO: Call Cloud Function or compute report locally
      // Placeholder: simulate report generation
      await new Promise((r) => setTimeout(r, 500))
      setReportData({}) // Will be populated with actual data
    } catch (err) {
      console.error('[ReportingPage] Failed to generate report:', err)
    } finally {
      setIsGenerating(false)
    }
  }, [reportType, startDate, endDate])

  const handleExport = useCallback(() => {
    // TODO: Export report as PDF or Excel
    console.log('[ReportingPage] Export report')
  }, [reportData])

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>統計報表</h1>

      {/* Report Configuration */}
      <div className={styles.configSection}>
        <div className={styles.configRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>報表類型</label>
            <div className={styles.reportTypeTabs}>
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt.key}
                  className={`${styles.typeTab} ${reportType === rt.key ? styles.typeTabActive : ''}`}
                  onClick={() => setReportType(rt.key)}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.configRow}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>起始日期</label>
            <input
              type="date"
              className={styles.dateInput}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          {reportType === 'custom' && (
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>結束日期</label>
              <input
                type="date"
                className={styles.dateInput}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>&nbsp;</label>
            <button
              className={styles.generateButton}
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? '產生中...' : '產生報表'}
            </button>
          </div>
        </div>
      </div>

      {/* Report Output */}
      <div className={styles.reportSection}>
        {isGenerating && (
          <div className={styles.loadingOverlay}>報表產生中...</div>
        )}

        {!isGenerating && reportData === null && (
          <div className={styles.emptyState}>
            <p>請選擇報表參數後點擊「產生報表」</p>
          </div>
        )}

        {!isGenerating && reportData !== null && (
          <div className={styles.reportOutput}>
            <div className={styles.reportHeader}>
              <h2 className={styles.reportTitle}>報表結果</h2>
              <button className={styles.exportButton} onClick={handleExport}>
                匯出
              </button>
            </div>
            <div className={styles.reportContent}>
              {/* TODO: Render report tables and charts */}
              <div className={styles.placeholderChart}>
                <span className={styles.placeholderText}>報表內容將顯示在此處</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ReportingPage
