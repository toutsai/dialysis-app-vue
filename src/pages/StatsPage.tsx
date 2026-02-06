// src/pages/StatsPage.tsx
// Scaffold - Nursing team grouping statistics

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import styles from './StatsPage.module.css'

interface TeamStats {
  teamName: string
  nurseCount: number
  patientCount: number
  avgPatientsPerNurse: number
  [key: string]: unknown
}

interface ShiftSummary {
  shift: string
  totalPatients: number
  totalBeds: number
  occupancyRate: number
}

const StatsPage: React.FC = () => {
  const { currentUser } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const allPatients = usePatientStore((s) => s.allPatients)
  const isLoading = usePatientStore((s) => s.isLoading)

  const [teamStats, setTeamStats] = useState<TeamStats[]>([])
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })
  const [isLoadingStats, setIsLoadingStats] = useState(false)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // TODO: Fetch team/shift statistics
  useEffect(() => {
    setIsLoadingStats(true)
    // Placeholder: compute or fetch stats
    setIsLoadingStats(false)
  }, [selectedDate])

  const patientSummary = useMemo(() => {
    const opd = allPatients.filter((p) => p.status === 'opd' && !p.isDeleted).length
    const ipd = allPatients.filter((p) => p.status === 'ipd' && !p.isDeleted).length
    const er = allPatients.filter((p) => p.status === 'er' && !p.isDeleted).length
    const total = opd + ipd + er
    return { opd, ipd, er, total }
  }, [allPatients])

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>護理組別統計</h1>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>總病患數</div>
          <div className={styles.cardValue}>{patientSummary.total}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>門診 (OPD)</div>
          <div className={styles.cardValue}>{patientSummary.opd}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>住院 (IPD)</div>
          <div className={styles.cardValue}>{patientSummary.ipd}</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.cardLabel}>急診 (ER)</div>
          <div className={styles.cardValue}>{patientSummary.er}</div>
        </div>
      </div>

      {(isLoading || isLoadingStats) && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      {/* Team Statistics */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>組別分配</h2>
        <div className={styles.tableWrapper}>
          <table className={styles.statsTable}>
            <thead>
              <tr>
                <th>組別名稱</th>
                <th>護理人數</th>
                <th>負責病患數</th>
                <th>平均每人病患</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.length === 0 ? (
                <tr>
                  <td colSpan={4} className={styles.emptyRow}>
                    尚無統計資料
                  </td>
                </tr>
              ) : (
                teamStats.map((team) => (
                  <tr key={team.teamName}>
                    <td>{team.teamName}</td>
                    <td>{team.nurseCount}</td>
                    <td>{team.patientCount}</td>
                    <td>{team.avgPatientsPerNurse.toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Shift Occupancy */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>班別佔床率</h2>
        <div className={styles.placeholderChart}>
          {/* TODO: Render chart or detailed shift breakdown */}
          <span className={styles.placeholderText}>圖表區域</span>
        </div>
      </div>
    </div>
  )
}

export default StatsPage
