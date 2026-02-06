import { useState, useMemo, useCallback } from 'react'
import { useAuthStore } from '@/hooks/useAuth'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils'
import { useTaskStore } from '@/stores/taskStore'
import ApiManager from '@/services/api_manager'
import styles from '@/components/ConditionRecordPanel.module.css'

interface ConditionRecordPanelProps {
  patient: any
  currentDate?: string
  onSaveRecord?: (record: any) => void
}

interface ConditionRecord {
  id?: string
  patientId: string
  patientName: string
  date: string
  type: string
  status: string
  note: string
  createdBy: string
  createdByName: string
  createdAt: string
  updatedAt?: string
  [key: string]: unknown
}

const RECORD_TYPES = [
  { value: 'symptom', label: '症狀紀錄' },
  { value: 'vital_sign', label: '生命徵象異常' },
  { value: 'medication', label: '用藥反應' },
  { value: 'dialysis_event', label: '透析事件' },
  { value: 'nursing_note', label: '護理記錄' },
  { value: 'other', label: '其他' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: '進行中' },
  { value: 'pending', label: '待處理' },
  { value: 'resolved', label: '已解決' },
]

const conditionApi = ApiManager<ConditionRecord>('condition_records')

export default function ConditionRecordPanel({
  patient,
  currentDate,
  onSaveRecord,
}: ConditionRecordPanelProps) {
  const currentUser = useAuthStore((s) => s.currentUser)
  const feedMessages = useTaskStore((s) => s.feedMessages)

  const dateStr = currentDate ?? formatDateToYYYYMMDD(new Date())

  const [records, setRecords] = useState<ConditionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [hasFetched, setHasFetched] = useState(false)

  const [formType, setFormType] = useState('symptom')
  const [formStatus, setFormStatus] = useState('active')
  const [formNote, setFormNote] = useState('')

  const patientId = patient?.id ?? ''
  const patientName = patient?.name ?? ''

  const fetchRecords = useCallback(async () => {
    if (!patientId) return
    setIsLoading(true)
    try {
      const all = await conditionApi.fetchAll()
      const filtered = all.filter(
        (r) => r.patientId === patientId && r.date === dateStr
      )
      filtered.sort((a, b) => {
        const ta = new Date(a.createdAt).getTime()
        const tb = new Date(b.createdAt).getTime()
        return tb - ta
      })
      setRecords(filtered)
      setHasFetched(true)
    } catch (err) {
      console.error('[ConditionRecordPanel] fetchRecords error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [patientId, dateStr])

  // Fetch on first render
  useMemo(() => {
    if (!hasFetched && patientId) {
      fetchRecords()
    }
  }, [hasFetched, patientId, fetchRecords])

  const relatedMessages = useMemo(() => {
    if (!patientId) return []
    return feedMessages.filter(
      (m) =>
        m.patientId === patientId &&
        m.category === 'message' &&
        m.status === 'pending'
    )
  }, [feedMessages, patientId])

  const resetForm = () => {
    setFormType('symptom')
    setFormStatus('active')
    setFormNote('')
  }

  const handleOpenForm = () => {
    resetForm()
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleSave = async () => {
    if (!formNote.trim()) return
    setIsSaving(true)
    try {
      const newRecord: ConditionRecord = {
        patientId,
        patientName,
        date: dateStr,
        type: formType,
        status: formStatus,
        note: formNote.trim(),
        createdBy: currentUser?.uid ?? '',
        createdByName: currentUser?.name ?? '',
        createdAt: new Date().toISOString(),
      }
      const saved = await conditionApi.create(newRecord)
      setRecords((prev) => [saved, ...prev])
      onSaveRecord?.(saved)
      handleCloseForm()
    } catch (err) {
      console.error('[ConditionRecordPanel] save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'pending':
        return styles.statusPending
      case 'resolved':
        return styles.statusResolved
      case 'active':
        return styles.statusActive
      default:
        return styles.statusPending
    }
  }

  const getStatusLabel = (status: string) => {
    return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  }

  const getTypeLabel = (type: string) => {
    return RECORD_TYPES.find((t) => t.value === type)?.label ?? type
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>
          病況紀錄 - {patientName || '未選擇病人'}
        </h3>
        <button
          type="button"
          className={styles.addButton}
          onClick={handleOpenForm}
          disabled={!patientId}
        >
          + 新增紀錄
        </button>
      </div>

      <div className={styles.body}>
        {isLoading ? (
          <div className={styles.emptyState}>載入中...</div>
        ) : records.length === 0 && relatedMessages.length === 0 ? (
          <div className={styles.emptyState}>
            {dateStr} 尚無病況紀錄
          </div>
        ) : (
          <div className={styles.recordList}>
            {relatedMessages.map((msg) => (
              <div key={msg.id} className={styles.recordCard}>
                <div className={styles.recordHeader}>
                  <span className={styles.recordDate}>
                    {msg.targetDate ?? ''}
                  </span>
                  <span
                    className={`${styles.statusBadge} ${styles.statusPending}`}
                  >
                    待處理通知
                  </span>
                </div>
                <div className={styles.recordType}>
                  {(msg.type as string) ?? '通知'}
                </div>
                <div className={styles.recordNote}>
                  {(msg as any).content ?? (msg as any).text ?? ''}
                </div>
              </div>
            ))}
            {records.map((record) => (
              <div key={record.id} className={styles.recordCard}>
                <div className={styles.recordHeader}>
                  <span className={styles.recordDate}>{record.date}</span>
                  <span
                    className={`${styles.statusBadge} ${getStatusClass(
                      record.status
                    )}`}
                  >
                    {getStatusLabel(record.status)}
                  </span>
                </div>
                <div className={styles.recordType}>
                  {getTypeLabel(record.type)}
                </div>
                <div className={styles.recordNote}>{record.note}</div>
                <div className={styles.recordCreator}>
                  建立者: {record.createdByName || record.createdBy}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className={styles.formOverlay} onClick={handleCloseForm}>
          <div
            className={styles.formModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.formTitle}>新增病況紀錄</h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>紀錄類型</label>
              <select
                className={styles.formSelect}
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>狀態</label>
              <select
                className={styles.formSelect}
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>紀錄內容</label>
              <textarea
                className={styles.formTextarea}
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="請輸入病況紀錄..."
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCloseForm}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.saveBtn}
                onClick={handleSave}
                disabled={isSaving || !formNote.trim()}
              >
                {isSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
