// src/components/kidit/MovementDetailModal.tsx
// Modal for patient movements with tabbed interface (Profile / History / Vascular Access)

import { useState, useCallback } from 'react'
import KiDitPatientForm, { type KiDitPatientData } from '@/components/kidit/KiDitPatientForm'
import KiDitHistoryForm, { type KiDitHistoryData } from '@/components/kidit/KiDitHistoryForm'
import VascularAccessForm, { type VascularAccessData } from '@/components/kidit/VascularAccessForm'
import styles from './MovementDetailModal.module.css'

type ModalTab = 'profile' | 'history' | 'vascular'

const TABS: { key: ModalTab; label: string }[] = [
  { key: 'profile', label: '病患資料' },
  { key: 'history', label: '病史原發病' },
  { key: 'vascular', label: 'HD 造管' },
]

export interface MovementEvent {
  id: string
  patientId: string
  patientName: string
  timestamp: string
  type: string
  kidit_profile?: Partial<KiDitPatientData>
  kidit_history?: Partial<KiDitHistoryData>
  kidit_vascular?: Partial<VascularAccessData>
  [key: string]: unknown
}

interface MovementDetailModalProps {
  event: MovementEvent | null
  dateStr: string
  open: boolean
  onClose: () => void
  onSaveProfile?: (eventId: string, data: KiDitPatientData) => void
  onSaveHistory?: (eventId: string, data: KiDitHistoryData) => void
  onSaveVascular?: (eventId: string, data: VascularAccessData) => void
  readOnly?: boolean
}

export default function MovementDetailModal({
  event,
  dateStr,
  open,
  onClose,
  onSaveProfile,
  onSaveHistory,
  onSaveVascular,
  readOnly = false,
}: MovementDetailModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('profile')

  const handleSaveProfile = useCallback(
    (data: KiDitPatientData) => {
      if (event) onSaveProfile?.(event.id, data)
    },
    [event, onSaveProfile],
  )

  const handleSaveHistory = useCallback(
    (data: KiDitHistoryData) => {
      if (event) onSaveHistory?.(event.id, data)
    },
    [event, onSaveHistory],
  )

  const handleSaveVascular = useCallback(
    (data: VascularAccessData) => {
      if (event) onSaveVascular?.(event.id, data)
    },
    [event, onSaveVascular],
  )

  if (!open || !event) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerInfo}>
            <h2 className={styles.title}>KiDit 異動資料</h2>
            <span className={styles.subtitle}>
              {event.patientName} ({event.patientId}) - {dateStr}
            </span>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`${styles.tab} ${activeTab === tab.key ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={styles.body}>
          {activeTab === 'profile' && (
            <KiDitPatientForm
              initialData={event.kidit_profile}
              onSave={handleSaveProfile}
              onCancel={onClose}
              readOnly={readOnly}
            />
          )}

          {activeTab === 'history' && (
            <KiDitHistoryForm
              initialData={event.kidit_history}
              onSave={handleSaveHistory}
              onCancel={onClose}
              readOnly={readOnly}
            />
          )}

          {activeTab === 'vascular' && (
            <VascularAccessForm
              initialData={event.kidit_vascular}
              onSave={handleSaveVascular}
              onCancel={onClose}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </div>
  )
}
