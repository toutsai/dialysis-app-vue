import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/NursingGroupConfigDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PatientInfo {
  id: string
  name?: string
  [key: string]: unknown
}

interface ShiftInfo {
  id: string
  label: string
}

interface GroupConfig {
  groupId: string
  groupLabel: string
  shiftType: string
  dayPattern: string
  nurseLeader: string
  members: string[]
  patientIds: string[]
  maxCapacity: number
}

interface NursingGroupConfigDialogProps {
  isVisible: boolean
  modelValue?: boolean
  groupId?: string
  allPatients?: PatientInfo[]
  shifts?: ShiftInfo[]
  onClose: () => void
  onUpdate?: (value: boolean) => void
  onSaved?: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_SHIFTS: ShiftInfo[] = [
  { id: 'day', label: '白班' },
  { id: 'evening', label: '小夜' },
  { id: 'night', label: '大夜' },
]

const DAY_PATTERNS = [
  { id: '135', label: '一三五' },
  { id: '246', label: '二四六' },
]

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

const MOCK_NURSES = [
  '王小明', '李小華', '張美玲', '陳大文', '林志偉',
  '黃麗芬', '吳淑惠', '劉怡君', '周雅婷', '蔡佳蓉',
  '鄭淑芬', '謝宜蓁',
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NursingGroupConfigDialog({
  isVisible,
  modelValue,
  groupId,
  allPatients,
  shifts,
  onClose,
  onUpdate,
  onSaved,
}: NursingGroupConfigDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const visible = isVisible ?? modelValue ?? false
  const shiftOptions = shifts && shifts.length > 0 ? shifts : DEFAULT_SHIFTS

  // Group config state
  const [groups, setGroups] = useState<GroupConfig[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // Filters
  const [filterShift, setFilterShift] = useState('day')
  const [filterDayPattern, setFilterDayPattern] = useState('135')

  // Form state for selected group
  const [editLeader, setEditLeader] = useState('')
  const [editMembers, setEditMembers] = useState<string[]>([])
  const [editMaxCapacity, setEditMaxCapacity] = useState(8)
  const [editPatientIds, setEditPatientIds] = useState<string[]>([])

  // Generate mock groups
  useEffect(() => {
    if (!visible) return
    setIsLoading(true)
    const timer = setTimeout(() => {
      const generated: GroupConfig[] = []
      for (const shift of shiftOptions) {
        for (const dp of DAY_PATTERNS) {
          const count = shift.id === 'day' ? 8 : shift.id === 'evening' ? 6 : 4
          for (let i = 0; i < count; i++) {
            generated.push({
              groupId: `${shift.id}-${dp.id}-${GROUP_LETTERS[i]}`,
              groupLabel: GROUP_LETTERS[i],
              shiftType: shift.id,
              dayPattern: dp.id,
              nurseLeader: MOCK_NURSES[i % MOCK_NURSES.length],
              members: [
                MOCK_NURSES[i % MOCK_NURSES.length],
                MOCK_NURSES[(i + 1) % MOCK_NURSES.length],
              ],
              patientIds: [],
              maxCapacity: 8,
            })
          }
        }
      }
      setGroups(generated)
      setIsLoading(false)

      // Auto-select target group if groupId provided
      if (groupId) {
        const target = generated.find((g) => g.groupId === groupId)
        if (target) {
          setSelectedGroupId(target.groupId)
          setFilterShift(target.shiftType)
          setFilterDayPattern(target.dayPattern)
          setEditLeader(target.nurseLeader)
          setEditMembers([...target.members])
          setEditMaxCapacity(target.maxCapacity)
          setEditPatientIds([...target.patientIds])
        }
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [visible, groupId, shiftOptions])

  // Reset on close
  useEffect(() => {
    if (!visible) {
      setSelectedGroupId('')
      setSaveMessage('')
    }
  }, [visible])

  // Keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        onUpdate?.(false)
      }
    },
    [onClose, onUpdate]
  )

  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [visible, handleKeyDown])

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === overlayRef.current) {
      onClose()
      onUpdate?.(false)
    }
  }

  const handleClose = () => {
    onClose()
    onUpdate?.(false)
  }

  // Select a group
  const handleSelectGroup = (group: GroupConfig) => {
    setSelectedGroupId(group.groupId)
    setEditLeader(group.nurseLeader)
    setEditMembers([...group.members])
    setEditMaxCapacity(group.maxCapacity)
    setEditPatientIds([...group.patientIds])
  }

  // Toggle member
  const toggleMember = (nurse: string) => {
    setEditMembers((prev) =>
      prev.includes(nurse) ? prev.filter((n) => n !== nurse) : [...prev, nurse]
    )
  }

  // Save group config
  const handleSave = async () => {
    if (!selectedGroupId) return
    setIsSaving(true)
    setSaveMessage('')
    await new Promise((resolve) => setTimeout(resolve, 500))

    setGroups((prev) =>
      prev.map((g) =>
        g.groupId === selectedGroupId
          ? {
              ...g,
              nurseLeader: editLeader,
              members: editMembers,
              maxCapacity: editMaxCapacity,
              patientIds: editPatientIds,
            }
          : g
      )
    )
    setIsSaving(false)
    setSaveMessage('已儲存')
    onSaved?.()
    setTimeout(() => setSaveMessage(''), 2000)
  }

  // Filtered groups
  const filteredGroups = groups.filter(
    (g) => g.shiftType === filterShift && g.dayPattern === filterDayPattern
  )

  const selectedGroup = groups.find((g) => g.groupId === selectedGroupId)

  if (!visible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="nursing-config-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="nursing-config-title" className={styles.title}>
            護理組別設定
          </h2>
          <button type="button" className={styles.closeButton} onClick={handleClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Filters */}
        <div className={styles.filterBar}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>班別：</span>
            {shiftOptions.map((shift) => (
              <button
                key={shift.id}
                type="button"
                className={`${styles.filterChip} ${filterShift === shift.id ? styles.filterActive : ''}`}
                onClick={() => setFilterShift(shift.id)}
              >
                {shift.label}
              </button>
            ))}
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>星期別：</span>
            {DAY_PATTERNS.map((dp) => (
              <button
                key={dp.id}
                type="button"
                className={`${styles.filterChip} ${filterDayPattern === dp.id ? styles.filterActive : ''}`}
                onClick={() => setFilterDayPattern(dp.id)}
              >
                {dp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : (
            <>
              {/* Group list */}
              <div className={styles.groupListPanel}>
                <div className={styles.panelHeader}>
                  組別列表 ({filteredGroups.length} 組)
                </div>
                <div className={styles.groupList}>
                  {filteredGroups.map((group) => (
                    <button
                      key={group.groupId}
                      type="button"
                      className={`${styles.groupItem} ${selectedGroupId === group.groupId ? styles.groupItemActive : ''}`}
                      onClick={() => handleSelectGroup(group)}
                    >
                      <span className={styles.groupLetter}>{group.groupLabel}</span>
                      <div className={styles.groupInfo}>
                        <span className={styles.groupLeader}>{group.nurseLeader}</span>
                        <span className={styles.groupMemberCount}>
                          {group.members.length} 人
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Edit panel */}
              <div className={styles.editPanel}>
                {selectedGroup ? (
                  <>
                    <div className={styles.panelHeader}>
                      {selectedGroup.groupLabel} 組 設定
                    </div>
                    <div className={styles.editForm}>
                      {/* Leader */}
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="nurse-leader">
                          組長
                        </label>
                        <select
                          id="nurse-leader"
                          className={styles.formSelect}
                          value={editLeader}
                          onChange={(e) => setEditLeader(e.target.value)}
                        >
                          <option value="">-- 選擇組長 --</option>
                          {MOCK_NURSES.map((nurse) => (
                            <option key={nurse} value={nurse}>
                              {nurse}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Max capacity */}
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel} htmlFor="max-capacity">
                          最大收容人數
                        </label>
                        <input
                          id="max-capacity"
                          type="number"
                          min={1}
                          max={20}
                          className={styles.formInput}
                          value={editMaxCapacity}
                          onChange={(e) => setEditMaxCapacity(Number(e.target.value))}
                        />
                      </div>

                      {/* Members */}
                      <div className={styles.formGroup}>
                        <label className={styles.formLabel}>
                          組員 ({editMembers.length} 人)
                        </label>
                        <div className={styles.memberGrid}>
                          {MOCK_NURSES.map((nurse) => (
                            <label key={nurse} className={styles.memberCheckbox}>
                              <input
                                type="checkbox"
                                checked={editMembers.includes(nurse)}
                                onChange={() => toggleMember(nurse)}
                              />
                              <span className={styles.memberName}>{nurse}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Patient assignment */}
                      {allPatients && allPatients.length > 0 && (
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>
                            分配患者 ({editPatientIds.length} 人)
                          </label>
                          <div className={styles.patientGrid}>
                            {allPatients.slice(0, 20).map((p) => (
                              <label key={p.id} className={styles.memberCheckbox}>
                                <input
                                  type="checkbox"
                                  checked={editPatientIds.includes(p.id)}
                                  onChange={() => {
                                    setEditPatientIds((prev) =>
                                      prev.includes(p.id)
                                        ? prev.filter((id) => id !== p.id)
                                        : [...prev, p.id]
                                    )
                                  }}
                                />
                                <span className={styles.memberName}>{p.name || p.id}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className={styles.emptyPanel}>
                    請從左側選擇一個組別進行編輯
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          {saveMessage && <span className={styles.saveMessage}>{saveMessage}</span>}
          <button type="button" className={styles.cancelButton} onClick={handleClose}>
            關閉
          </button>
          <button
            type="button"
            className={styles.submitButton}
            onClick={handleSave}
            disabled={isSaving || !selectedGroupId}
          >
            {isSaving ? '儲存中...' : '儲存設定'}
          </button>
        </div>
      </div>
    </div>
  )
}
