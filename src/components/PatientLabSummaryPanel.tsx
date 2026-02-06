import { useState, useMemo, useCallback } from 'react'
import { LAB_ITEM_DISPLAY_NAMES } from '@/constants/labAlertConstants'
import styles from '@/components/PatientLabSummaryPanel.module.css'

interface PatientLabSummaryPanelProps {
  patient: any
  onSaveRecord?: (record: any) => void
}

interface LabValue {
  value: number | null
  date: string
}

interface LabItem {
  key: string
  displayName: string
  unit: string
  refLow: number | null
  refHigh: number | null
  values: LabValue[]
}

const REFERENCE_RANGES: Record<
  string,
  { unit: string; low: number | null; high: number | null }
> = {
  BUN: { unit: 'mg/dL', low: 7, high: 20 },
  Creatinine: { unit: 'mg/dL', low: 0.6, high: 1.2 },
  Albumin: { unit: 'g/dL', low: 3.5, high: 5.5 },
  P: { unit: 'mg/dL', low: 2.5, high: 4.5 },
  Ca: { unit: 'mg/dL', low: 8.5, high: 10.5 },
  Hb: { unit: 'g/dL', low: 10, high: 12 },
  Hct: { unit: '%', low: 30, high: 36 },
  Platelet: { unit: '10^3/uL', low: 150, high: 400 },
  WBC: { unit: '10^3/uL', low: 4, high: 11 },
  Na: { unit: 'mEq/L', low: 136, high: 145 },
  K: { unit: 'mEq/L', low: 3.5, high: 5.0 },
  eGFR: { unit: 'mL/min', low: 60, high: null },
  GlucoseAC: { unit: 'mg/dL', low: 70, high: 110 },
  Iron: { unit: 'ug/dL', low: 60, high: 170 },
  TIBC: { unit: 'ug/dL', low: 250, high: 370 },
  Ferritin: { unit: 'ng/mL', low: 200, high: 500 },
  iPTH: { unit: 'pg/mL', low: 150, high: 300 },
  PostBUN: { unit: 'mg/dL', low: null, high: null },
  CaXP: { unit: '', low: null, high: 55 },
  'Kt/V': { unit: '', low: 1.2, high: null },
  URR: { unit: '%', low: 65, high: null },
  'TSAT': { unit: '%', low: 20, high: 50 },
  Triglyceride: { unit: 'mg/dL', low: null, high: 150 },
  LDL: { unit: 'mg/dL', low: null, high: 100 },
  ALT: { unit: 'U/L', low: null, high: 40 },
}

const LAB_KEYS = Object.keys(LAB_ITEM_DISPLAY_NAMES)

type FilterMode = 'all' | 'abnormal'

function extractLabData(patient: any): LabItem[] {
  const labData = patient?.labData ?? patient?.labs ?? {}
  const labHistory: any[] = patient?.labHistory ?? []

  return LAB_KEYS.map((key) => {
    const displayName =
      (LAB_ITEM_DISPLAY_NAMES as Record<string, string>)[key] ?? key
    const ref = REFERENCE_RANGES[key] ?? { unit: '', low: null, high: null }

    const values: LabValue[] = []

    // Current value
    const current = labData[key]
    if (current !== undefined && current !== null) {
      values.push({
        value: typeof current === 'number' ? current : parseFloat(current),
        date: patient?.labDate ?? '',
      })
    }

    // Historical values
    for (const entry of labHistory) {
      const v = entry?.[key]
      if (v !== undefined && v !== null) {
        values.push({
          value: typeof v === 'number' ? v : parseFloat(v),
          date: entry?.date ?? '',
        })
      }
    }

    return {
      key,
      displayName,
      unit: ref.unit,
      refLow: ref.low,
      refHigh: ref.high,
      values,
    }
  })
}

function getValueStatus(
  value: number | null,
  low: number | null,
  high: number | null
): 'normal' | 'high' | 'low' | 'critical' {
  if (value === null || isNaN(value)) return 'normal'
  if (high !== null && value > high * 1.5) return 'critical'
  if (low !== null && value < low * 0.5) return 'critical'
  if (high !== null && value > high) return 'high'
  if (low !== null && value < low) return 'low'
  return 'normal'
}

function getTrend(values: LabValue[]): 'up' | 'down' | 'stable' | 'none' {
  if (values.length < 2) return 'none'
  const latest = values[0]?.value
  const previous = values[1]?.value
  if (latest === null || previous === null) return 'none'
  if (isNaN(latest!) || isNaN(previous!)) return 'none'
  const diff = latest! - previous!
  const threshold = Math.abs(previous!) * 0.05
  if (diff > threshold) return 'up'
  if (diff < -threshold) return 'down'
  return 'stable'
}

function getTrendSymbol(trend: string): string {
  switch (trend) {
    case 'up':
      return '\u2191'
    case 'down':
      return '\u2193'
    case 'stable':
      return '\u2192'
    default:
      return ''
  }
}

export default function PatientLabSummaryPanel({
  patient,
  onSaveRecord,
}: PatientLabSummaryPanelProps) {
  const [filterMode, setFilterMode] = useState<FilterMode>('all')
  const [showNotes, setShowNotes] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const labItems = useMemo(() => extractLabData(patient), [patient])

  const displayedItems = useMemo(() => {
    if (filterMode === 'abnormal') {
      return labItems.filter((item) => {
        const latest = item.values[0]?.value ?? null
        const status = getValueStatus(latest, item.refLow, item.refHigh)
        return status !== 'normal'
      })
    }
    return labItems
  }, [labItems, filterMode])

  const abnormalCount = useMemo(() => {
    return labItems.filter((item) => {
      const latest = item.values[0]?.value ?? null
      return getValueStatus(latest, item.refLow, item.refHigh) !== 'normal'
    }).length
  }, [labItems])

  const summaryData = useMemo(() => {
    const getLatest = (key: string): number | null => {
      const item = labItems.find((i) => i.key === key)
      return item?.values[0]?.value ?? null
    }
    return {
      albumin: getLatest('Albumin'),
      hb: getLatest('Hb'),
      urr: getLatest('URR'),
      caxp: getLatest('CaXP'),
      ktv: getLatest('Kt/V'),
      ferritin: getLatest('Ferritin'),
    }
  }, [labItems])

  const handleSaveNote = useCallback(async () => {
    if (!noteText.trim() || !patient?.id) return
    setIsSaving(true)
    try {
      const record = {
        patientId: patient.id,
        type: 'lab_note',
        note: noteText.trim(),
        createdAt: new Date().toISOString(),
      }
      onSaveRecord?.(record)
      setNoteText('')
      setShowNotes(false)
    } catch (err) {
      console.error('[PatientLabSummaryPanel] saveNote error:', err)
    } finally {
      setIsSaving(false)
    }
  }, [noteText, patient, onSaveRecord])

  const getValueClassName = (status: string): string => {
    switch (status) {
      case 'high':
        return styles.valueHigh
      case 'low':
        return styles.valueLow
      case 'critical':
        return styles.valueCritical
      default:
        return styles.valueNormal
    }
  }

  const getTrendClassName = (trend: string): string => {
    switch (trend) {
      case 'up':
        return styles.trendUp
      case 'down':
        return styles.trendDown
      default:
        return styles.trendStable
    }
  }

  const getSummaryClass = (
    value: number | null,
    low: number | null,
    high: number | null
  ): string => {
    if (value === null) return ''
    const status = getValueStatus(value, low, high)
    if (status === 'critical' || status === 'high') return styles.summaryValueDanger
    if (status === 'low') return styles.summaryValueWarning
    return styles.summaryValueSuccess
  }

  if (!patient) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>檢驗數據總覽</h3>
        </div>
        <div className={styles.body}>
          <div className={styles.emptyState}>請選擇病人以檢視檢驗數據</div>
        </div>
      </div>
    )
  }

  const dateColumns: string[] = []
  for (const item of labItems) {
    for (const v of item.values) {
      if (v.date && !dateColumns.includes(v.date)) {
        dateColumns.push(v.date)
      }
    }
  }
  dateColumns.sort((a, b) => b.localeCompare(a))
  const visibleDates = dateColumns.slice(0, 6)

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h3 className={styles.headerTitle}>
            檢驗數據 - {patient.name ?? patient.id}
          </h3>
          {abnormalCount > 0 && (
            <span className={styles.dateLabel}>
              {abnormalCount} 項異常
            </span>
          )}
        </div>
        <div className={styles.headerActions}>
          <select
            className={styles.filterSelect}
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          >
            <option value="all">全部項目</option>
            <option value="abnormal">僅異常項目</option>
          </select>
          <button
            type="button"
            className={`${styles.toggleButton} ${
              showNotes ? styles.toggleButtonActive : ''
            }`}
            onClick={() => setShowNotes(!showNotes)}
          >
            備註
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className={styles.summarySection}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Albumin</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.albumin,
              3.5,
              5.5
            )}`}
          >
            {summaryData.albumin !== null ? summaryData.albumin.toFixed(1) : '--'}
          </div>
          <div className={styles.summarySubtext}>g/dL (3.5-5.5)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Hb</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.hb,
              10,
              12
            )}`}
          >
            {summaryData.hb !== null ? summaryData.hb.toFixed(1) : '--'}
          </div>
          <div className={styles.summarySubtext}>g/dL (10-12)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>URR</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.urr,
              65,
              null
            )}`}
          >
            {summaryData.urr !== null ? summaryData.urr.toFixed(0) : '--'}
          </div>
          <div className={styles.summarySubtext}>% (&ge;65)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Kt/V</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.ktv,
              1.2,
              null
            )}`}
          >
            {summaryData.ktv !== null ? summaryData.ktv.toFixed(2) : '--'}
          </div>
          <div className={styles.summarySubtext}>(&ge;1.2)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Ca x P</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.caxp,
              null,
              55
            )}`}
          >
            {summaryData.caxp !== null ? summaryData.caxp.toFixed(1) : '--'}
          </div>
          <div className={styles.summarySubtext}>(&le;55)</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Ferritin</div>
          <div
            className={`${styles.summaryValue} ${getSummaryClass(
              summaryData.ferritin,
              200,
              500
            )}`}
          >
            {summaryData.ferritin !== null
              ? summaryData.ferritin.toFixed(0)
              : '--'}
          </div>
          <div className={styles.summarySubtext}>ng/mL (200-500)</div>
        </div>
      </div>

      {/* Lab Data Table */}
      <div className={styles.body}>
        {displayedItems.length === 0 ? (
          <div className={styles.emptyState}>
            {filterMode === 'abnormal'
              ? '沒有異常檢驗項目'
              : '尚無檢驗數據'}
          </div>
        ) : (
          <table className={styles.labTable}>
            <thead>
              <tr>
                <th>項目</th>
                <th>參考值</th>
                {visibleDates.map((date) => (
                  <th key={date}>{date}</th>
                ))}
                <th>趨勢</th>
              </tr>
            </thead>
            <tbody>
              {displayedItems.map((item) => {
                const latest = item.values[0]?.value ?? null
                const status = getValueStatus(latest, item.refLow, item.refHigh)
                const trend = getTrend(item.values)
                const isAbnormal = status !== 'normal'

                return (
                  <tr
                    key={item.key}
                    className={isAbnormal ? styles.abnormalRow : undefined}
                  >
                    <td>
                      <div className={styles.labItemName}>
                        {item.displayName}
                      </div>
                      {item.unit && (
                        <div className={styles.referenceRange}>
                          {item.unit}
                        </div>
                      )}
                    </td>
                    <td className={styles.referenceRange}>
                      {item.refLow !== null && item.refHigh !== null
                        ? `${item.refLow}-${item.refHigh}`
                        : item.refLow !== null
                        ? `\u2265${item.refLow}`
                        : item.refHigh !== null
                        ? `\u2264${item.refHigh}`
                        : '--'}
                    </td>
                    {visibleDates.map((date) => {
                      const entry = item.values.find((v) => v.date === date)
                      const val = entry?.value ?? null
                      const valStatus = getValueStatus(
                        val,
                        item.refLow,
                        item.refHigh
                      )
                      return (
                        <td key={date}>
                          {val !== null && !isNaN(val) ? (
                            <span className={getValueClassName(valStatus)}>
                              {val % 1 === 0 ? val : val.toFixed(1)}
                            </span>
                          ) : (
                            <span className={styles.valueNormal}>--</span>
                          )}
                        </td>
                      )
                    })}
                    <td>
                      {trend !== 'none' && (
                        <span className={getTrendClassName(trend)}>
                          {getTrendSymbol(trend)}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Notes Section */}
      {showNotes && (
        <div className={styles.notesSection}>
          <div className={styles.notesTitle}>檢驗備註</div>
          <textarea
            className={styles.noteTextarea}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="輸入檢驗相關備註..."
          />
          <button
            type="button"
            className={styles.saveNoteBtn}
            onClick={handleSaveNote}
            disabled={isSaving || !noteText.trim()}
          >
            {isSaving ? '儲存中...' : '儲存備註'}
          </button>
        </div>
      )}
    </div>
  )
}
