import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import styles from '@/components/dialogs/HandoverNotesDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HandoverNote {
  id: string
  content: string
  nurseFrom: string
  nurseTo: string
  createdAt: string
  priority: 'normal' | 'urgent' | 'critical'
  isRead: boolean
}

interface HandoverNotesDialogProps {
  isVisible: boolean
  patientId?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data helper
// ---------------------------------------------------------------------------

const SHIFT_LABELS: Record<string, string> = {
  day: '白班',
  evening: '小夜',
  night: '大夜',
}

function getCurrentShift(): string {
  const hour = new Date().getHours()
  if (hour >= 8 && hour < 16) return 'day'
  if (hour >= 16 && hour < 24) return 'evening'
  return 'night'
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HandoverNotesDialog({
  isVisible,
  patientId,
  onClose,
}: HandoverNotesDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'view' | 'create'>('view')
  const [notes, setNotes] = useState<HandoverNote[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // New note form state
  const [newContent, setNewContent] = useState('')
  const [nurseTo, setNurseTo] = useState('')
  const [priority, setPriority] = useState<HandoverNote['priority']>('normal')
  const [isSaving, setIsSaving] = useState(false)

  const currentShift = useMemo(() => getCurrentShift(), [])

  // Fetch existing notes
  useEffect(() => {
    if (!isVisible) return
    setIsLoading(true)
    // Simulate fetching handover notes from Firestore
    const timer = setTimeout(() => {
      setNotes([
        {
          id: '1',
          content: '患者血壓偏高，需持續監測，每30分鐘量測一次。',
          nurseFrom: '王小明',
          nurseTo: '李小華',
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          priority: 'urgent',
          isRead: false,
        },
        {
          id: '2',
          content: '透析管路已更換，下次透析前需確認接頭是否正常。',
          nurseFrom: '張美玲',
          nurseTo: '王小明',
          createdAt: new Date(Date.now() - 7200000).toISOString(),
          priority: 'normal',
          isRead: true,
        },
        {
          id: '3',
          content: '家屬要求明日會診腎臟科醫師，已通知住院醫師。',
          nurseFrom: '陳大文',
          nurseTo: '張美玲',
          createdAt: new Date(Date.now() - 10800000).toISOString(),
          priority: 'normal',
          isRead: true,
        },
      ])
      setIsLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [isVisible, patientId])

  // Keyboard handling
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

  // Create new note
  const handleCreateNote = async () => {
    if (!newContent.trim()) return
    setIsSaving(true)
    // Simulate saving
    await new Promise((resolve) => setTimeout(resolve, 500))
    const newNote: HandoverNote = {
      id: Date.now().toString(),
      content: newContent.trim(),
      nurseFrom: '目前使用者',
      nurseTo: nurseTo || '未指定',
      createdAt: new Date().toISOString(),
      priority,
      isRead: false,
    }
    setNotes((prev) => [newNote, ...prev])
    setNewContent('')
    setNurseTo('')
    setPriority('normal')
    setIsSaving(false)
    setActiveTab('view')
  }

  // Mark note as read
  const handleMarkRead = (noteId: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, isRead: true } : n))
    )
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  const getPriorityLabel = (p: HandoverNote['priority']) => {
    switch (p) {
      case 'critical':
        return '危急'
      case 'urgent':
        return '緊急'
      default:
        return '一般'
    }
  }

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="handover-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="handover-title" className={styles.title}>
            交班備註
            {patientId && <span className={styles.patientBadge}>患者 #{patientId}</span>}
          </h2>
          <div className={styles.shiftBadge}>
            目前班別：{SHIFT_LABELS[currentShift] || currentShift}
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'view' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('view')}
          >
            檢視備註 ({notes.filter((n) => !n.isRead).length} 未讀)
          </button>
          <button
            type="button"
            className={`${styles.tab} ${activeTab === 'create' ? styles.tabActive : ''}`}
            onClick={() => setActiveTab('create')}
          >
            新增備註
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {activeTab === 'view' && (
            <>
              {isLoading ? (
                <div className={styles.loading}>載入中...</div>
              ) : notes.length === 0 ? (
                <div className={styles.empty}>目前沒有交班備註</div>
              ) : (
                <div className={styles.notesList}>
                  {notes.map((note) => (
                    <div
                      key={note.id}
                      className={`${styles.noteCard} ${!note.isRead ? styles.unread : ''} ${styles[`priority_${note.priority}`]}`}
                    >
                      <div className={styles.noteHeader}>
                        <span className={styles.priorityTag}>
                          {getPriorityLabel(note.priority)}
                        </span>
                        <span className={styles.noteTime}>{formatTime(note.createdAt)}</span>
                      </div>
                      <p className={styles.noteContent}>{note.content}</p>
                      <div className={styles.noteFooter}>
                        <span className={styles.nurseInfo}>
                          {note.nurseFrom} &rarr; {note.nurseTo}
                        </span>
                        {!note.isRead && (
                          <button
                            type="button"
                            className={styles.markReadButton}
                            onClick={() => handleMarkRead(note.id)}
                          >
                            標記已讀
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'create' && (
            <div className={styles.createForm}>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="handover-nurse-to">
                  交接護理師
                </label>
                <input
                  id="handover-nurse-to"
                  type="text"
                  className={styles.input}
                  value={nurseTo}
                  onChange={(e) => setNurseTo(e.target.value)}
                  placeholder="請輸入交接護理師姓名"
                />
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="handover-priority">
                  優先程度
                </label>
                <select
                  id="handover-priority"
                  className={styles.select}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as HandoverNote['priority'])}
                >
                  <option value="normal">一般</option>
                  <option value="urgent">緊急</option>
                  <option value="critical">危急</option>
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.label} htmlFor="handover-content">
                  備註內容
                </label>
                <textarea
                  id="handover-content"
                  className={styles.textarea}
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="請輸入交班備註內容..."
                  rows={5}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
          {activeTab === 'create' && (
            <button
              type="button"
              className={styles.submitButton}
              onClick={handleCreateNote}
              disabled={isSaving || !newContent.trim()}
            >
              {isSaving ? '儲存中...' : '新增備註'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
