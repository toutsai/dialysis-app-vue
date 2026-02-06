// src/components/DailyStaffDisplay.tsx
// Displays current nursing staff on duty with roles and shifts.

import { useMemo } from 'react'
import styles from '@/components/DailyStaffDisplay.module.css'

export interface StaffMember {
  id: string
  name: string
  role: string
  shift: string
  team?: string
  isLeader?: boolean
}

interface DailyStaffDisplayProps {
  staff: StaffMember[]
  date: string
}

const SHIFT_LABEL_MAP: Record<string, string> = {
  early: '早班',
  noon: '午班',
  late: '晚班',
}

const ROLE_LABEL_MAP: Record<string, string> = {
  leader: '組長',
  nurse: '護理師',
  aide: '助理',
  trainee: '實習',
  physician: '醫師',
}

function getRoleBadgeClass(role: string): string {
  switch (role) {
    case 'leader':
      return styles.roleLeader
    case 'physician':
      return styles.rolePhysician
    case 'aide':
      return styles.roleAide
    case 'trainee':
      return styles.roleTrainee
    default:
      return styles.roleNurse
  }
}

export default function DailyStaffDisplay({ staff, date }: DailyStaffDisplayProps) {
  const groupedByShift = useMemo(() => {
    const groups: Record<string, StaffMember[]> = {}
    for (const member of staff) {
      const shift = member.shift || 'early'
      if (!groups[shift]) {
        groups[shift] = []
      }
      groups[shift].push(member)
    }
    // Sort each group: leaders first, then by name
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => {
        if (a.isLeader && !b.isLeader) return -1
        if (!a.isLeader && b.isLeader) return 1
        return (a.name || '').localeCompare(b.name || '', 'zh-TW')
      })
    }
    return groups
  }, [staff])

  const shiftOrder = ['early', 'noon', 'late']

  if (staff.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.dateLabel}>{date}</span>
          <span className={styles.title}>今日值班人員</span>
        </div>
        <div className={styles.emptyState}>尚無排班資料</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.dateLabel}>{date}</span>
        <span className={styles.title}>今日值班人員</span>
        <span className={styles.totalCount}>共 {staff.length} 人</span>
      </div>

      <div className={styles.shiftGrid}>
        {shiftOrder.map((shiftCode) => {
          const members = groupedByShift[shiftCode]
          if (!members || members.length === 0) return null

          return (
            <div key={shiftCode} className={styles.shiftColumn}>
              <div className={`${styles.shiftLabel} ${styles[`shift_${shiftCode}`]}`}>
                {SHIFT_LABEL_MAP[shiftCode] ?? shiftCode}
                <span className={styles.shiftCount}>({members.length})</span>
              </div>
              <ul className={styles.staffList}>
                {members.map((member) => (
                  <li key={member.id} className={styles.staffItem}>
                    <span className={`${styles.roleBadge} ${getRoleBadgeClass(member.role)}`}>
                      {ROLE_LABEL_MAP[member.role] ?? member.role}
                    </span>
                    <span className={styles.staffName}>
                      {member.name}
                    </span>
                    {member.team && (
                      <span className={styles.teamTag}>{member.team}</span>
                    )}
                    {member.isLeader && (
                      <span className={styles.leaderIcon} title="組長">&#9733;</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
