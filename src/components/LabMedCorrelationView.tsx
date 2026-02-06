import { useMemo } from 'react'
import {
  CORRELATION_GROUPS,
  ALL_MEDS_MASTER,
} from '@/constants/medicationConstants'
import styles from '@/components/LabMedCorrelationView.module.css'

interface LabMedCorrelationViewProps {
  patient: any
  slotList?: any[]
}

interface MedInfo {
  code: string
  tradeName: string
  type: string
  unit: string
}

interface CorrelationGroup {
  title: string
  meds: MedInfo[]
}

interface PatientMedRecord {
  orderCode?: string
  code?: string
  dose?: number | string
  frequency?: string
  [key: string]: unknown
}

const ANEMIA_LAB_KEYS = [
  { key: 'Hb', label: 'Hb', unit: 'g/dL', low: 10, high: 12 },
  { key: 'Hct', label: 'Hct', unit: '%', low: 30, high: 36 },
  { key: 'Iron', label: 'Fe', unit: 'ug/dL', low: 60, high: 170 },
  { key: 'Ferritin', label: 'Ferritin', unit: 'ng/mL', low: 200, high: 500 },
  { key: 'TSAT', label: 'TSAT', unit: '%', low: 20, high: 50 },
]

const MINERAL_LAB_KEYS = [
  { key: 'Ca', label: 'Ca', unit: 'mg/dL', low: 8.5, high: 10.5 },
  { key: 'P', label: 'P', unit: 'mg/dL', low: 2.5, high: 4.5 },
  { key: 'CaXP', label: 'Ca x P', unit: '', low: null, high: 55 },
  { key: 'iPTH', label: 'iPTH', unit: 'pg/mL', low: 150, high: 300 },
  { key: 'Albumin', label: 'Alb', unit: 'g/dL', low: 3.5, high: 5.5 },
]

function getLabChipClass(
  value: number | null,
  low: number | null,
  high: number | null
): string {
  if (value === null || isNaN(value)) return styles.labChip
  if (high !== null && value > high)
    return `${styles.labChip} ${styles.labChipHigh}`
  if (low !== null && value < low)
    return `${styles.labChip} ${styles.labChipLow}`
  return `${styles.labChip} ${styles.labChipNormal}`
}

export default function LabMedCorrelationView({
  patient,
  slotList,
}: LabMedCorrelationViewProps) {
  const patientMeds: PatientMedRecord[] = useMemo(() => {
    if (!patient) return []
    return (
      patient.medications ??
      patient.injections ??
      patient.orders ??
      []
    )
  }, [patient])

  const labData: Record<string, number | null> = useMemo(() => {
    if (!patient) return {}
    const raw = patient.labData ?? patient.labs ?? {}
    const result: Record<string, number | null> = {}
    for (const key of Object.keys(raw)) {
      const v = raw[key]
      result[key] =
        v !== null && v !== undefined
          ? typeof v === 'number'
            ? v
            : parseFloat(v)
          : null
    }
    return result
  }, [patient])

  const getMedDose = (medCode: string): { dose: string; found: boolean } => {
    const record = patientMeds.find(
      (m) => (m.orderCode ?? m.code) === medCode
    )
    if (!record) return { dose: '', found: false }
    const d = record.dose ?? ''
    return { dose: String(d), found: true }
  }

  const getGroupLabKeys = (groupTitle: string) => {
    if (groupTitle.includes('Anemia') || groupTitle.includes('貧血'))
      return ANEMIA_LAB_KEYS
    if (groupTitle.includes('Mineral') || groupTitle.includes('鈣磷'))
      return MINERAL_LAB_KEYS
    return []
  }

  const slotSummary = useMemo(() => {
    if (!slotList || slotList.length === 0) return null
    const patientSlot = slotList.find(
      (s: any) => s.patientId === patient?.id
    )
    return patientSlot ?? null
  }, [slotList, patient])

  if (!patient) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>檢驗-用藥關聯分析</h3>
        </div>
        <div className={styles.body}>
          <div className={styles.emptyState}>
            請選擇病人以檢視檢驗與用藥關聯
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>
          檢驗-用藥關聯 - {patient.name ?? patient.id}
        </h3>
      </div>

      <div className={styles.body}>
        {(CORRELATION_GROUPS as CorrelationGroup[]).length === 0 ? (
          <div className={styles.emptyState}>無關聯資料</div>
        ) : (
          <div className={styles.groupList}>
            {(CORRELATION_GROUPS as CorrelationGroup[]).map(
              (group, groupIdx) => {
                const relatedLabKeys = getGroupLabKeys(group.title)
                const medsWithData = group.meds.map((med) => {
                  const { dose, found } = getMedDose(med.code)
                  return { ...med, dose, found }
                })
                const activeMedCount = medsWithData.filter(
                  (m) => m.found
                ).length

                return (
                  <div key={groupIdx} className={styles.group}>
                    <div className={styles.groupHeader}>
                      <h4 className={styles.groupTitle}>{group.title}</h4>
                      <span className={styles.groupBadge}>
                        {activeMedCount}/{group.meds.length} 使用中
                      </span>
                    </div>
                    <div className={styles.groupBody}>
                      <table className={styles.medTable}>
                        <thead>
                          <tr>
                            <th>藥品名稱</th>
                            <th>代碼</th>
                            <th>途徑</th>
                            <th>劑量</th>
                            <th>狀態</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medsWithData.map((med) => (
                            <tr key={med.code}>
                              <td>
                                <span className={styles.medName}>
                                  {med.tradeName}
                                </span>
                              </td>
                              <td>
                                <span className={styles.medCode}>
                                  {med.code}
                                </span>
                              </td>
                              <td>
                                <span
                                  className={`${styles.medType} ${
                                    med.type === 'injection'
                                      ? styles.medTypeInjection
                                      : styles.medTypeOral
                                  }`}
                                >
                                  {med.type === 'injection'
                                    ? '針劑'
                                    : '口服'}
                                </span>
                              </td>
                              <td>
                                {med.found ? (
                                  <>
                                    <span className={styles.medDose}>
                                      {med.dose || '--'}
                                    </span>
                                    <span className={styles.medUnit}>
                                      {med.unit}
                                    </span>
                                  </>
                                ) : (
                                  <span className={styles.noData}>--</span>
                                )}
                              </td>
                              <td>
                                {med.found ? (
                                  <span
                                    className={`${styles.medType} ${styles.medTypeInjection}`}
                                  >
                                    使用中
                                  </span>
                                ) : (
                                  <span className={styles.noData}>
                                    未使用
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {relatedLabKeys.length > 0 && (
                        <div className={styles.labSection}>
                          <div className={styles.labSectionTitle}>
                            相關檢驗值
                          </div>
                          <div className={styles.labChips}>
                            {relatedLabKeys.map((lk) => {
                              const val = labData[lk.key] ?? null
                              return (
                                <span
                                  key={lk.key}
                                  className={getLabChipClass(
                                    val,
                                    lk.low,
                                    lk.high
                                  )}
                                >
                                  <span className={styles.labChipLabel}>
                                    {lk.label}:
                                  </span>
                                  <span className={styles.labChipValue}>
                                    {val !== null && !isNaN(val)
                                      ? val % 1 === 0
                                        ? val
                                        : val.toFixed(1)
                                      : '--'}
                                  </span>
                                  {lk.unit && (
                                    <span>{lk.unit}</span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
            )}

            {slotSummary && (
              <div className={styles.slotInfo}>
                <span className={styles.slotInfoLabel}>透析處方:</span>
                {slotSummary.ak && <span>AK: {slotSummary.ak} </span>}
                {slotSummary.bf && <span>BF: {slotSummary.bf} </span>}
                {slotSummary.dialyzer && (
                  <span>Dialyzer: {slotSummary.dialyzer} </span>
                )}
                {slotSummary.heparin && (
                  <span>Heparin: {slotSummary.heparin}</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
