// src/pages/MyPatientsPage.tsx
// 我的今日病人 - Shows today's assigned patients for current nurse

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePatientStore } from '@/stores/patientStore'
import { useTaskStore } from '@/stores/taskStore'
import { useMyPatientList } from '@/hooks/useMyPatientList'
import styles from './MyPatientsPage.module.css'

type ViewMode = 'card' | 'table'

const MyPatientsPage: React.FC = () => {
  const { currentUser } = useAuth()
  const allPatients = usePatientStore((s) => s.allPatients)
  const fetchPatientsIfNeeded = usePatientStore((s) => s.fetchPatientsIfNeeded)
  const getPatientMessageTypesMapForDate = useTaskStore(
    (s) => s.getPatientMessageTypesMapForDate
  )
  const { todayMyPatientIds, isLoading: isLoadingAssignment, refresh } = useMyPatientList()

  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    fetchPatientsIfNeeded()
  }, [fetchPatientsIfNeeded])

  // Build a map of patientId -> Patient for quick lookup
  const patientMap = useMemo(() => {
    const map = new Map<string, (typeof allPatients)[0]>()
    for (const p of allPatients) {
      map.set(p.id, p)
    }
    return map
  }, [allPatients])

  // Resolve today's patients from IDs
  const myPatients = useMemo(() => {
    return todayMyPatientIds
      .map((id) => patientMap.get(id))
      .filter(Boolean) as (typeof allPatients)[0][]
  }, [todayMyPatientIds, patientMap])

  // Filter by search text
  const filteredPatients = useMemo(() => {
    if (!searchText.trim()) return myPatients
    const q = searchText.trim().toLowerCase()
    return myPatients.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        p.id.toLowerCase().includes(q)
    )
  }, [myPatients, searchText])

  // Get message types for today
  const messageTypesMap = getPatientMessageTypesMapForDate()

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className="page-title">我的今日病人</h1>
        <div className={styles.headerActions}>
          <span className={styles.nurseName}>
            {currentUser?.name || ''}
          </span>
          <span className={styles.patientCount}>
            共 {myPatients.length} 位病人
          </span>
          <button className={styles.refreshButton} onClick={refresh}>
            重新整理
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋病患姓名或ID..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
        <div className={styles.viewToggle}>
          <button
            className={`${styles.toggleButton} ${viewMode === 'card' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('card')}
          >
            卡片
          </button>
          <button
            className={`${styles.toggleButton} ${viewMode === 'table' ? styles.toggleActive : ''}`}
            onClick={() => setViewMode('table')}
          >
            表格
          </button>
        </div>
      </div>

      {isLoadingAssignment && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      {/* Card view */}
      {viewMode === 'card' && (
        <div className={styles.cardGrid}>
          {filteredPatients.length === 0 && !isLoadingAssignment ? (
            <div className={styles.emptyState}>
              <p>今日尚無指派病人</p>
            </div>
          ) : (
            filteredPatients.map((patient) => {
              const msgTypes = messageTypesMap.get(patient.id) || []
              return (
                <div key={patient.id} className={styles.patientCard}>
                  <div className={styles.cardHeader}>
                    <span className={styles.cardName}>{patient.name || patient.id}</span>
                    <span className={styles.cardStatus}>{patient.status || ''}</span>
                  </div>
                  <div className={styles.cardBody}>
                    <span className={styles.cardId}>ID: {patient.id}</span>
                    {msgTypes.length > 0 && (
                      <div className={styles.cardTags}>
                        {msgTypes.map((t) => (
                          <span key={t} className={styles.messageTag}>{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Table view */}
      {viewMode === 'table' && (
        <div className={styles.tableWrapper}>
          <table className={styles.patientTable}>
            <thead>
              <tr>
                <th>病患ID</th>
                <th>姓名</th>
                <th>狀態</th>
                <th>待處理訊息</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan={5} className={styles.emptyRow}>
                    今日尚無指派病人
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient) => {
                  const msgTypes = messageTypesMap.get(patient.id) || []
                  return (
                    <tr key={patient.id}>
                      <td>{patient.id}</td>
                      <td className={styles.nameCell}>{patient.name || '-'}</td>
                      <td>{patient.status || '-'}</td>
                      <td>
                        {msgTypes.length > 0 ? (
                          <div className={styles.inlineTags}>
                            {msgTypes.map((t) => (
                              <span key={t} className={styles.messageTag}>{t}</span>
                            ))}
                          </div>
                        ) : (
                          <span className={styles.noMessages}>-</span>
                        )}
                      </td>
                      <td>
                        <button className={styles.viewButton}>檢視</button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default MyPatientsPage
