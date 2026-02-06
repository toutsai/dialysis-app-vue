// src/pages/PatientsPage.tsx
// Scaffold - Patient management with tabs (OPD / IPD / ER / Deleted)

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore, type Patient } from '@/stores/patientStore'
import styles from './PatientsPage.module.css'

type PatientTab = 'opd' | 'ipd' | 'er' | 'deleted'

const TABS: { key: PatientTab; label: string }[] = [
  { key: 'opd', label: '門診 (OPD)' },
  { key: 'ipd', label: '住院 (IPD)' },
  { key: 'er', label: '急診 (ER)' },
  { key: 'deleted', label: '已刪除' },
]

const PatientsPage: React.FC = () => {
  const { currentUser, canEditPatients, isAdmin } = useAuth()
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const allPatients = usePatientStore((s) => s.allPatients)
  const isLoading = usePatientStore((s) => s.isLoading)

  const [activeTab, setActiveTab] = useState<PatientTab>('opd')
  const [searchText, setSearchText] = useState('')
  const [showAddDialog, setShowAddDialog] = useState(false)

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  const filteredPatients = useMemo(() => {
    let filtered: Patient[]

    if (activeTab === 'deleted') {
      filtered = allPatients.filter((p) => p.isDeleted)
    } else {
      filtered = allPatients.filter(
        (p) => p.status === activeTab && !p.isDeleted
      )
    }

    if (searchText.trim()) {
      const query = searchText.trim().toLowerCase()
      filtered = filtered.filter(
        (p) =>
          p.name?.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [allPatients, activeTab, searchText])

  const handleTabChange = useCallback((tab: PatientTab) => {
    setActiveTab(tab)
    setSearchText('')
  }, [])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>病患管理</h1>
        {canEditPatients && (
          <button
            className={styles.addButton}
            onClick={() => setShowAddDialog(true)}
          >
            + 新增病患
          </button>
        )}
      </div>

      <div className={styles.tabBar}>
        {TABS.map((tab) => {
          // Only show "deleted" tab for admins
          if (tab.key === 'deleted' && !isAdmin) return null
          return (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => handleTabChange(tab.key)}
            >
              {tab.label}
              <span className={styles.tabCount}>
                {/* TODO: Show actual counts */}
                (-)
              </span>
            </button>
          )
        })}
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋病患姓名或 ID..."
          value={searchText}
          onChange={handleSearchChange}
        />
        <span className={styles.resultCount}>
          共 {filteredPatients.length} 筆
        </span>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.patientList}>
        {filteredPatients.length === 0 && !isLoading ? (
          <div className={styles.emptyState}>
            <p>尚無病患資料</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.patientTable}>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>姓名</th>
                  <th>狀態</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.map((patient) => (
                  <tr key={patient.id} className={styles.patientRow}>
                    <td className={styles.idCell}>{patient.id}</td>
                    <td>{patient.name || '-'}</td>
                    <td>
                      <span className={styles.statusBadge}>
                        {patient.status || '-'}
                      </span>
                    </td>
                    <td>
                      {/* TODO: Edit/View/Delete buttons */}
                      <button className={styles.actionButton}>檢視</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TODO: Add/Edit patient dialog */}
    </div>
  )
}

export default PatientsPage
