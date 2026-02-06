import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import ApiManager from '@/services/api_manager'
import { formatDateToYYYYMMDD, formatDateTimeToLocal } from '@/utils/dateUtils'
import styles from '@/components/dialogs/PatientDetailModal.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientRecord {
  id: string
  name?: string
  chartNo?: string
  idNumber?: string
  birthDate?: string
  gender?: string
  bloodType?: string
  phone?: string
  address?: string
  frequency?: string
  shift?: string
  bed?: string
  status?: string
  diseases?: string[]
  hepatitisB?: string
  hepatitisC?: string
  notes?: string
  patientType?: string
  [key: string]: unknown
}

interface DialysisRecord {
  id: string
  date: string
  shift?: string
  bed?: string
  preWeight?: number
  postWeight?: number
  uf?: number
  bloodFlow?: number
  duration?: number
  nurse?: string
  notes?: string
  [key: string]: unknown
}

interface MemoRecord {
  id: string
  content: string
  createdAt: string
  author?: string
  category?: string
  [key: string]: unknown
}

interface LabReport {
  id: string
  date: string
  items: Record<string, string | number>
  [key: string]: unknown
}

interface SlotItem {
  patientId: string
  patientName?: string
  [key: string]: unknown
}

interface PatientDetailModalProps {
  isVisible: boolean
  patient: PatientRecord | null
  currentDate?: string
  slotList?: SlotItem[]
  currentIndex?: number
  onClose: () => void
  onRecordUpdated?: () => void
  onSwitchPatient?: (patientId: string, index: number) => void
}

type TabKey = 'basic' | 'dialysis' | 'memos' | 'labs'

const TAB_ITEMS: { key: TabKey; label: string }[] = [
  { key: 'basic', label: '基本資料' },
  { key: 'dialysis', label: '透析紀錄' },
  { key: 'memos', label: '備忘錄' },
  { key: 'labs', label: '檢驗報告' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const genderLabel = (g?: string) => (g === 'male' ? '男' : g === 'female' ? '女' : '—')
const hepatitisLabel = (v?: string) =>
  v === 'positive' ? '陽性 (+)' : v === 'negative' ? '陰性 (-)' : '未知'

const shiftLabel = (s?: string) => {
  const map: Record<string, string> = { early: '早班', noon: '午班', late: '晚班' }
  return map[s ?? ''] ?? s ?? '—'
}

const statusLabel = (s?: string) => {
  const map: Record<string, string> = {
    active: '在透析',
    inactive: '暫停',
    transferred: '轉院',
    discharged: '出院',
    deceased: '死亡',
    opd: '門診',
  }
  return map[s ?? ''] ?? s ?? '—'
}

function calcAge(birthDate?: string): string {
  if (!birthDate) return '—'
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return `${age} 歲`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PatientDetailModal({
  isVisible,
  patient,
  currentDate,
  slotList,
  currentIndex,
  onClose,
  onRecordUpdated,
  onSwitchPatient,
}: PatientDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('basic')

  // Data states
  const [dialysisRecords, setDialysisRecords] = useState<DialysisRecord[]>([])
  const [memos, setMemos] = useState<MemoRecord[]>([])
  const [labReports, setLabReports] = useState<LabReport[]>([])
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isLoadingMemos, setIsLoadingMemos] = useState(false)
  const [isLoadingLabs, setIsLoadingLabs] = useState(false)

  // Memo creation
  const [newMemo, setNewMemo] = useState('')
  const [isSavingMemo, setIsSavingMemo] = useState(false)

  const patientId = patient?.id

  // Navigation
  const canGoPrev = useMemo(
    () => slotList && typeof currentIndex === 'number' && currentIndex > 0,
    [slotList, currentIndex]
  )
  const canGoNext = useMemo(
    () =>
      slotList &&
      typeof currentIndex === 'number' &&
      currentIndex < slotList.length - 1,
    [slotList, currentIndex]
  )

  const handlePrev = () => {
    if (!canGoPrev || !slotList || typeof currentIndex !== 'number') return
    const prevIdx = currentIndex - 1
    const prevSlot = slotList[prevIdx]
    onSwitchPatient?.(prevSlot.patientId, prevIdx)
  }

  const handleNext = () => {
    if (!canGoNext || !slotList || typeof currentIndex !== 'number') return
    const nextIdx = currentIndex + 1
    const nextSlot = slotList[nextIdx]
    onSwitchPatient?.(nextSlot.patientId, nextIdx)
  }

  // Fetch data based on active tab
  useEffect(() => {
    if (!isVisible || !patientId) return

    if (activeTab === 'dialysis') {
      setIsLoadingRecords(true)
      const api = ApiManager<DialysisRecord>('dialysis_records')
      api
        .fetchAll()
        .then((records) => {
          const filtered = records
            .filter((r) => (r as Record<string, unknown>).patientId === patientId)
            .sort((a, b) => (b.date > a.date ? 1 : -1))
          setDialysisRecords(filtered)
        })
        .catch((err) => console.error('[PatientDetailModal] dialysis fetch error:', err))
        .finally(() => setIsLoadingRecords(false))
    }

    if (activeTab === 'memos') {
      setIsLoadingMemos(true)
      const api = ApiManager<MemoRecord>('memos')
      api
        .fetchAll()
        .then((records) => {
          const filtered = records
            .filter((r) => (r as Record<string, unknown>).patientId === patientId)
            .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
          setMemos(filtered)
        })
        .catch((err) => console.error('[PatientDetailModal] memos fetch error:', err))
        .finally(() => setIsLoadingMemos(false))
    }

    if (activeTab === 'labs') {
      setIsLoadingLabs(true)
      const api = ApiManager<LabReport>('lab_reports')
      api
        .fetchAll()
        .then((records) => {
          const filtered = records
            .filter((r) => (r as Record<string, unknown>).patientId === patientId)
            .sort((a, b) => (b.date > a.date ? 1 : -1))
          setLabReports(filtered)
        })
        .catch((err) => console.error('[PatientDetailModal] labs fetch error:', err))
        .finally(() => setIsLoadingLabs(false))
    }
  }, [isVisible, patientId, activeTab])

  // Reset on open
  useEffect(() => {
    if (isVisible) {
      setActiveTab('basic')
      setDialysisRecords([])
      setMemos([])
      setLabReports([])
      setNewMemo('')
    }
  }, [isVisible, patientId])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') handlePrev()
      if (e.key === 'ArrowRight') handleNext()
    },
    [onClose, canGoPrev, canGoNext]
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

  // Save memo
  const handleSaveMemo = async () => {
    if (!newMemo.trim() || !patientId) return
    setIsSavingMemo(true)
    try {
      const api = ApiManager<MemoRecord>('memos')
      const saved = await api.create({
        id: '',
        content: newMemo.trim(),
        createdAt: new Date().toISOString(),
        patientId,
      } as MemoRecord)
      setMemos((prev) => [saved, ...prev])
      setNewMemo('')
      onRecordUpdated?.()
    } catch (err) {
      console.error('[PatientDetailModal] save memo error:', err)
    } finally {
      setIsSavingMemo(false)
    }
  }

  if (!isVisible || !patient) return null

  const dateDisplay = currentDate || formatDateToYYYYMMDD()

  // ---- Tab content renderers ----

  const renderBasicInfo = () => (
    <div className={styles.basicInfo}>
      <div className={styles.infoSection}>
        <h4 className={styles.sectionTitle}>個人資料</h4>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>姓名</span>
            <span className={styles.infoValue}>{patient.name || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>病歷號</span>
            <span className={styles.infoValue}>{patient.chartNo || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>身分證號</span>
            <span className={styles.infoValue}>{patient.idNumber || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>出生日期</span>
            <span className={styles.infoValue}>
              {patient.birthDate || '—'} ({calcAge(patient.birthDate)})
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>性別</span>
            <span className={styles.infoValue}>{genderLabel(patient.gender)}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>血型</span>
            <span className={styles.infoValue}>{patient.bloodType ? `${patient.bloodType} 型` : '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>電話</span>
            <span className={styles.infoValue}>{patient.phone || '—'}</span>
          </div>
          <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
            <span className={styles.infoLabel}>地址</span>
            <span className={styles.infoValue}>{patient.address || '—'}</span>
          </div>
        </div>
      </div>

      <div className={styles.infoSection}>
        <h4 className={styles.sectionTitle}>透析資訊</h4>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>狀態</span>
            <span className={styles.infoValue}>
              <span
                className={styles.statusBadge}
                data-status={patient.status}
              >
                {statusLabel(patient.status)}
              </span>
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>透析頻率</span>
            <span className={styles.infoValue}>{patient.frequency || '—'}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>班別</span>
            <span className={styles.infoValue}>{shiftLabel(patient.shift)}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>床號</span>
            <span className={styles.infoValue}>{patient.bed || '—'}</span>
          </div>
        </div>
      </div>

      <div className={styles.infoSection}>
        <h4 className={styles.sectionTitle}>醫療資訊</h4>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>B型肝炎</span>
            <span className={styles.infoValue}>{hepatitisLabel(patient.hepatitisB)}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>C型肝炎</span>
            <span className={styles.infoValue}>{hepatitisLabel(patient.hepatitisC)}</span>
          </div>
          <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
            <span className={styles.infoLabel}>疾病史</span>
            <span className={styles.infoValue}>
              {patient.diseases && patient.diseases.length > 0 ? (
                <span className={styles.diseaseTags}>
                  {patient.diseases.map((d) => (
                    <span key={d} className={styles.diseaseTag}>
                      {d}
                    </span>
                  ))}
                </span>
              ) : (
                '—'
              )}
            </span>
          </div>
          <div className={`${styles.infoItem} ${styles.infoItemFull}`}>
            <span className={styles.infoLabel}>備註</span>
            <span className={styles.infoValue}>{patient.notes || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const renderDialysisRecords = () => (
    <div className={styles.recordsTab}>
      {isLoadingRecords ? (
        <div className={styles.loadingState}>載入透析紀錄中...</div>
      ) : dialysisRecords.length === 0 ? (
        <div className={styles.emptyState}>尚無透析紀錄</div>
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>日期</th>
                <th>班別</th>
                <th>床號</th>
                <th>透前體重</th>
                <th>透後體重</th>
                <th>脫水量</th>
                <th>血流速</th>
                <th>時間(hr)</th>
                <th>護理師</th>
              </tr>
            </thead>
            <tbody>
              {dialysisRecords.map((r) => (
                <tr key={r.id}>
                  <td>{r.date}</td>
                  <td>{shiftLabel(r.shift)}</td>
                  <td>{r.bed ?? '—'}</td>
                  <td>{r.preWeight != null ? `${r.preWeight} kg` : '—'}</td>
                  <td>{r.postWeight != null ? `${r.postWeight} kg` : '—'}</td>
                  <td>{r.uf != null ? `${r.uf} L` : '—'}</td>
                  <td>{r.bloodFlow != null ? `${r.bloodFlow} mL/min` : '—'}</td>
                  <td>{r.duration != null ? r.duration : '—'}</td>
                  <td>{r.nurse ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  const renderMemos = () => (
    <div className={styles.memosTab}>
      <div className={styles.memoCreate}>
        <textarea
          className={styles.memoInput}
          placeholder="新增備忘錄..."
          value={newMemo}
          onChange={(e) => setNewMemo(e.target.value)}
          rows={3}
        />
        <button
          type="button"
          className={styles.memoSaveBtn}
          onClick={handleSaveMemo}
          disabled={isSavingMemo || !newMemo.trim()}
        >
          {isSavingMemo ? '儲存中...' : '新增備忘錄'}
        </button>
      </div>
      <div className={styles.memoList}>
        {isLoadingMemos ? (
          <div className={styles.loadingState}>載入備忘錄中...</div>
        ) : memos.length === 0 ? (
          <div className={styles.emptyState}>尚無備忘錄</div>
        ) : (
          memos.map((m) => (
            <div key={m.id} className={styles.memoCard}>
              <div className={styles.memoMeta}>
                <span className={styles.memoAuthor}>{m.author || '系統'}</span>
                <span className={styles.memoDate}>
                  {m.createdAt
                    ? formatDateTimeToLocal(new Date(m.createdAt))
                    : '—'}
                </span>
              </div>
              <div className={styles.memoContent}>{m.content}</div>
              {m.category && <span className={styles.memoCategoryBadge}>{m.category}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  )

  const renderLabReports = () => (
    <div className={styles.labsTab}>
      {isLoadingLabs ? (
        <div className={styles.loadingState}>載入檢驗報告中...</div>
      ) : labReports.length === 0 ? (
        <div className={styles.emptyState}>尚無檢驗報告</div>
      ) : (
        labReports.map((report) => (
          <div key={report.id} className={styles.labCard}>
            <div className={styles.labHeader}>
              <span className={styles.labDate}>{report.date}</span>
            </div>
            <div className={styles.labItems}>
              {Object.entries(report.items || {}).map(([key, val]) => (
                <div key={key} className={styles.labItem}>
                  <span className={styles.labItemName}>{key}</span>
                  <span className={styles.labItemValue}>{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )

  const tabContent: Record<TabKey, () => JSX.Element> = {
    basic: renderBasicInfo,
    dialysis: renderDialysisRecords,
    memos: renderMemos,
    labs: renderLabReports,
  }

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="patient-detail-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            {slotList && slotList.length > 0 && (
              <div className={styles.navButtons}>
                <button
                  type="button"
                  className={styles.navButton}
                  onClick={handlePrev}
                  disabled={!canGoPrev}
                  aria-label="上一位病患"
                  title="上一位病患"
                >
                  &#8249;
                </button>
                <span className={styles.navIndex}>
                  {typeof currentIndex === 'number' ? currentIndex + 1 : '—'} / {slotList.length}
                </span>
                <button
                  type="button"
                  className={styles.navButton}
                  onClick={handleNext}
                  disabled={!canGoNext}
                  aria-label="下一位病患"
                  title="下一位病患"
                >
                  &#8250;
                </button>
              </div>
            )}
            <div>
              <h2 id="patient-detail-title" className={styles.title}>
                {patient.name || '未知病患'}
              </h2>
              <span className={styles.subtitle}>
                {patient.chartNo && `病歷號: ${patient.chartNo}`}
                {patient.chartNo && patient.bed && ' | '}
                {patient.bed && `床號: ${patient.bed}`}
                {' | '}
                {dateDisplay}
              </span>
            </div>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabBar}>
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={`${styles.tabButton} ${activeTab === tab.key ? styles.tabButtonActive : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className={styles.tabContent}>{tabContent[activeTab]()}</div>
      </div>
    </div>
  )
}
