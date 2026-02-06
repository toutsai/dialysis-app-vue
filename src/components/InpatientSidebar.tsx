// src/components/InpatientSidebar.tsx
// Sidebar showing inpatient / ER patient lists with drag-and-drop capability
// for assigning them onto the schedule grid.

import { useMemo, useState, useCallback, type DragEvent } from 'react'
import type { Patient } from '@/stores/patientStore'
import styles from '@/components/InpatientSidebar.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InpatientSidebarProps {
  patients: Patient[]
  scheduledIds: Set<string>
  useDailyFilter?: boolean
  dayOfWeek?: number
}

type FilterTab = 'all' | 'ipd' | 'er' | 'unscheduled'

const TAB_LABELS: Record<FilterTab, string> = {
  all: '全部',
  ipd: '住院',
  er: '急診',
  unscheduled: '未排',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStatusBadgeClass(status: string | undefined): string {
  switch (status) {
    case 'ipd':
      return styles.badgeIpd
    case 'er':
      return styles.badgeEr
    default:
      return styles.badgeOther
  }
}

function getStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'ipd':
      return '住'
    case 'er':
      return '急'
    default:
      return status ?? ''
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function InpatientSidebar({
  patients,
  scheduledIds,
  useDailyFilter = false,
  dayOfWeek,
}: InpatientSidebarProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter patients based on active tab and search query
  const filteredPatients = useMemo(() => {
    let result = patients.filter((p) => !p.isDeleted)

    // Tab filter
    switch (activeTab) {
      case 'ipd':
        result = result.filter((p) => p.status === 'ipd')
        break
      case 'er':
        result = result.filter((p) => p.status === 'er')
        break
      case 'unscheduled':
        result = result.filter((p) => !scheduledIds.has(p.id))
        break
      default:
        break
    }

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          p.id.toLowerCase().includes(q)
      )
    }

    // Sort: unscheduled first, then by name
    result.sort((a, b) => {
      const aScheduled = scheduledIds.has(a.id) ? 1 : 0
      const bScheduled = scheduledIds.has(b.id) ? 1 : 0
      if (aScheduled !== bScheduled) return aScheduled - bScheduled
      return (a.name ?? '').localeCompare(b.name ?? '', 'zh-TW')
    })

    return result
  }, [patients, activeTab, searchQuery, scheduledIds])

  const counts = useMemo(() => {
    const nonDeleted = patients.filter((p) => !p.isDeleted)
    return {
      all: nonDeleted.length,
      ipd: nonDeleted.filter((p) => p.status === 'ipd').length,
      er: nonDeleted.filter((p) => p.status === 'er').length,
      unscheduled: nonDeleted.filter((p) => !scheduledIds.has(p.id)).length,
    }
  }, [patients, scheduledIds])

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, patient: Patient) => {
      e.dataTransfer.setData('application/json', JSON.stringify({
        patientId: patient.id,
        patientName: patient.name ?? '',
        status: patient.status ?? '',
        source: 'inpatient-sidebar',
      }))
      e.dataTransfer.effectAllowed = 'move'
    },
    []
  )

  return (
    <aside className={styles.sidebar}>
      {/* Header */}
      <div className={styles.header}>
        <h3 className={styles.title}>住院 / 急診病人</h3>
        <span className={styles.totalBadge}>{counts.all}</span>
      </div>

      {/* Search */}
      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋姓名或ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="搜尋病人"
        />
        {searchQuery && (
          <button
            className={styles.clearBtn}
            onClick={() => setSearchQuery('')}
            aria-label="清除搜尋"
          >
            &times;
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className={styles.tabRow}>
        {(Object.keys(TAB_LABELS) as FilterTab[]).map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
            <span className={styles.tabCount}>
              {counts[tab]}
            </span>
          </button>
        ))}
      </div>

      {/* Patient list */}
      <div className={styles.listContainer}>
        {filteredPatients.length === 0 ? (
          <div className={styles.emptyState}>
            {searchQuery ? '查無符合條件的病人' : '目前無病人'}
          </div>
        ) : (
          filteredPatients.map((patient) => {
            const isScheduled = scheduledIds.has(patient.id)

            return (
              <div
                key={patient.id}
                className={`${styles.patientCard} ${isScheduled ? styles.scheduled : styles.unscheduled}`}
                draggable={!isScheduled}
                onDragStart={(e) => handleDragStart(e, patient)}
                title={isScheduled ? '已排班' : '拖曳至排班表以排班'}
              >
                <span className={`${styles.statusBadge} ${getStatusBadgeClass(patient.status)}`}>
                  {getStatusLabel(patient.status)}
                </span>

                <div className={styles.patientInfo}>
                  <span className={styles.patientName}>{patient.name ?? patient.id}</span>
                  <span className={styles.patientId}>{patient.id}</span>
                </div>

                {isScheduled ? (
                  <span className={styles.scheduledIcon} title="已排班">&#10003;</span>
                ) : (
                  <span className={styles.dragHandle} title="拖曳排班">&#8942;&#8942;</span>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Footer summary */}
      {useDailyFilter && dayOfWeek !== undefined && (
        <div className={styles.footer}>
          星期{['日', '一', '二', '三', '四', '五', '六'][dayOfWeek] ?? dayOfWeek}
          &nbsp;|&nbsp;
          未排: {counts.unscheduled} 人
        </div>
      )}
    </aside>
  )
}
