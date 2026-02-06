import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/ConditionRecordDisplayDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientInfo {
  id: string
  name?: string
  bedNumber?: string
  [key: string]: unknown
}

interface ConditionRecord {
  id: string
  date: string
  time: string
  type: string
  description: string
  severity: 'mild' | 'moderate' | 'severe'
  vitalSigns?: {
    bp?: string
    hr?: string
    temp?: string
    spo2?: string
  }
  interventions?: string[]
  outcome?: string
  recordedBy: string
}

interface ConditionRecordDisplayDialogProps {
  isVisible: boolean
  patient?: PatientInfo
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockRecords(): ConditionRecord[] {
  return [
    {
      id: 'cr1',
      date: '2025-01-15',
      time: '09:30',
      type: '低血壓',
      description: '透析中血壓下降，收縮壓降至 88 mmHg，患者主訴頭暈、冒冷汗。',
      severity: 'severe',
      vitalSigns: { bp: '88/56', hr: '98', spo2: '94%' },
      interventions: ['暫停超濾', '頭低腳高姿勢', '靜脈注射 0.9% NS 100mL'],
      outcome: '血壓回升至 115/72，症狀緩解。',
      recordedBy: '王護理師',
    },
    {
      id: 'cr2',
      date: '2025-01-12',
      time: '14:15',
      type: '肌肉痙攣',
      description: '透析後期雙下肢肌肉痙攣，疼痛程度 NRS 6/10。',
      severity: 'moderate',
      vitalSigns: { bp: '130/82', hr: '84' },
      interventions: ['降低超濾速率', '肌肉按摩', '靜脈注射 0.9% NS 50mL'],
      outcome: '痙攣緩解，可繼續完成透析療程。',
      recordedBy: '李護理師',
    },
    {
      id: 'cr3',
      date: '2025-01-10',
      time: '10:00',
      type: '穿刺困難',
      description: '動靜脈瘻管穿刺困難，嘗試兩次後成功。血管震顫感較弱。',
      severity: 'mild',
      vitalSigns: { bp: '142/88', hr: '76' },
      interventions: ['更換穿刺部位', '熱敷促進血管擴張'],
      outcome: '穿刺成功，血流量 250 mL/min。建議安排血管超音波檢查。',
      recordedBy: '張護理師',
    },
    {
      id: 'cr4',
      date: '2025-01-08',
      time: '11:45',
      type: '噁心嘔吐',
      description: '透析中段出現噁心感，隨後嘔吐一次，量約 50mL。',
      severity: 'moderate',
      vitalSigns: { bp: '118/74', hr: '88', temp: '36.8°C' },
      interventions: ['調整透析液鈉濃度', '給予止吐藥 Metoclopramide 10mg IV'],
      outcome: '症狀改善，順利完成透析。',
      recordedBy: '王護理師',
    },
    {
      id: 'cr5',
      date: '2025-01-05',
      time: '08:20',
      type: '體溫偏高',
      description: '透析前體溫 38.2°C，無明顯感染症狀。',
      severity: 'mild',
      vitalSigns: { bp: '135/80', hr: '90', temp: '38.2°C', spo2: '97%' },
      interventions: ['通知主治醫師', '抽取血液培養', '監測體溫變化'],
      outcome: '透析後體溫降至 37.4°C，等待培養報告。',
      recordedBy: '陳護理師',
    },
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConditionRecordDisplayDialog({
  isVisible,
  patient,
  onClose,
}: ConditionRecordDisplayDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [records, setRecords] = useState<ConditionRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterSeverity, setFilterSeverity] = useState<string>('all')

  useEffect(() => {
    if (!isVisible) return
    setIsLoading(true)
    const timer = setTimeout(() => {
      setRecords(getMockRecords())
      setIsLoading(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [isVisible, patient])

  useEffect(() => {
    if (!isVisible) {
      setExpandedId(null)
      setFilterSeverity('all')
    }
  }, [isVisible])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose]
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

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  const severityLabel = (s: ConditionRecord['severity']) => {
    switch (s) {
      case 'severe':
        return '嚴重'
      case 'moderate':
        return '中度'
      case 'mild':
        return '輕微'
    }
  }

  const filteredRecords =
    filterSeverity === 'all'
      ? records
      : records.filter((r) => r.severity === filterSeverity)

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="condition-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 id="condition-title" className={styles.title}>病情紀錄</h2>
            {patient && (
              <span className={styles.patientName}>
                {patient.name || `患者 #${patient.id}`}
                {patient.bedNumber && ` (${patient.bedNumber})`}
              </span>
            )}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Filter */}
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>嚴重程度：</span>
          {(['all', 'severe', 'moderate', 'mild'] as const).map((sev) => (
            <button
              key={sev}
              type="button"
              className={`${styles.filterChip} ${filterSeverity === sev ? styles.filterChipActive : ''}`}
              onClick={() => setFilterSeverity(sev)}
            >
              {sev === 'all' ? '全部' : severityLabel(sev)}
            </button>
          ))}
          <span className={styles.recordCount}>{filteredRecords.length} 筆記錄</span>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : filteredRecords.length === 0 ? (
            <div className={styles.empty}>無符合條件的病情紀錄</div>
          ) : (
            <div className={styles.recordList}>
              {filteredRecords.map((record) => {
                const isExpanded = expandedId === record.id
                return (
                  <div
                    key={record.id}
                    className={`${styles.recordCard} ${styles[`severity_${record.severity}`]}`}
                  >
                    <div
                      className={styles.recordHeader}
                      onClick={() => toggleExpand(record.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') toggleExpand(record.id)
                      }}
                    >
                      <div className={styles.recordMeta}>
                        <span className={styles.recordDate}>{record.date}</span>
                        <span className={styles.recordTime}>{record.time}</span>
                        <span className={`${styles.severityBadge} ${styles[`sev_${record.severity}`]}`}>
                          {severityLabel(record.severity)}
                        </span>
                        <span className={styles.recordType}>{record.type}</span>
                      </div>
                      <span className={`${styles.expandIcon} ${isExpanded ? styles.expandIconOpen : ''}`}>
                        &#9660;
                      </span>
                    </div>

                    <p className={styles.recordDescription}>{record.description}</p>

                    {isExpanded && (
                      <div className={styles.recordDetails}>
                        {/* Vital signs */}
                        {record.vitalSigns && (
                          <div className={styles.detailSection}>
                            <h5 className={styles.detailLabel}>生命徵象</h5>
                            <div className={styles.vitalChips}>
                              {record.vitalSigns.bp && (
                                <span className={styles.vitalChip}>BP: {record.vitalSigns.bp}</span>
                              )}
                              {record.vitalSigns.hr && (
                                <span className={styles.vitalChip}>HR: {record.vitalSigns.hr}</span>
                              )}
                              {record.vitalSigns.temp && (
                                <span className={styles.vitalChip}>T: {record.vitalSigns.temp}</span>
                              )}
                              {record.vitalSigns.spo2 && (
                                <span className={styles.vitalChip}>SpO2: {record.vitalSigns.spo2}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Interventions */}
                        {record.interventions && record.interventions.length > 0 && (
                          <div className={styles.detailSection}>
                            <h5 className={styles.detailLabel}>處置措施</h5>
                            <ul className={styles.interventionList}>
                              {record.interventions.map((item, idx) => (
                                <li key={idx} className={styles.interventionItem}>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Outcome */}
                        {record.outcome && (
                          <div className={styles.detailSection}>
                            <h5 className={styles.detailLabel}>處置結果</h5>
                            <p className={styles.outcomeText}>{record.outcome}</p>
                          </div>
                        )}

                        <div className={styles.recordAuthor}>記錄者：{record.recordedBy}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
