// src/components/PatientMessagesIcon.tsx
// Small icon indicators for patient messages/notes.
// Uses taskStore to check for pending messages for a specific patient.

import { useMemo } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import styles from '@/components/PatientMessagesIcon.module.css'

interface PatientMessagesIconProps {
  patientId: string
  context?: string
  typesMap?: Map<string, string[]>
}

/** Mapping from message type to display icon/emoji character */
const TYPE_ICON_MAP: Record<string, string> = {
  '抽血': '💉',
  '衛教': '📋',
  '通知': '🔔',
  '留言': '💬',
  '醫囑': '📝',
  '檢查': '🔬',
}

/** Mapping from message type to tooltip label */
const TYPE_LABEL_MAP: Record<string, string> = {
  '抽血': '抽血',
  '衛教': '衛教',
  '通知': '通知',
  '留言': '留言',
  '醫囑': '醫囑',
  '檢查': '檢查',
}

function getTypeColorClass(type: string): string {
  switch (type) {
    case '抽血':
      return styles.typeBlood
    case '衛教':
      return styles.typeEducation
    case '通知':
      return styles.typeNotice
    case '醫囑':
      return styles.typeOrder
    case '檢查':
      return styles.typeExam
    default:
      return styles.typeDefault
  }
}

export default function PatientMessagesIcon({
  patientId,
  context,
  typesMap: externalTypesMap,
}: PatientMessagesIconProps) {
  // If an external typesMap is provided (pre-computed by the parent), use it.
  // Otherwise, fall back to computing from the task store.
  const storeTypesMap = useTaskStore((state) => state.getAllPendingPatientMessageTypesMap)

  const messageTypes = useMemo(() => {
    const map = externalTypesMap ?? storeTypesMap()
    return map.get(patientId) ?? []
  }, [patientId, externalTypesMap, storeTypesMap])

  if (messageTypes.length === 0) {
    return null
  }

  const tooltipText = messageTypes
    .map((t) => TYPE_LABEL_MAP[t] ?? t)
    .join('、')

  return (
    <span
      className={styles.iconContainer}
      title={`${context ? context + ' - ' : ''}待處理: ${tooltipText}`}
      aria-label={`${messageTypes.length} 則待處理訊息`}
    >
      {messageTypes.map((type) => (
        <span
          key={type}
          className={`${styles.iconDot} ${getTypeColorClass(type)}`}
          aria-hidden="true"
        >
          {TYPE_ICON_MAP[type] ?? '📌'}
        </span>
      ))}
      {messageTypes.length > 0 && (
        <span className={styles.countBadge}>{messageTypes.length}</span>
      )}
    </span>
  )
}
