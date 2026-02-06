import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/DailyDraftListDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftRecord {
  id: string
  type: string
  title: string
  content: string
  createdAt: string
  updatedAt: string
  createdBy: string
  status: 'draft' | 'review'
}

interface DailyDraftListDialogProps {
  isVisible: boolean
  patientId?: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockDrafts(): DraftRecord[] {
  return [
    {
      id: 'd1',
      type: '護理記錄',
      title: '透析護理記錄 - 未完成',
      content: '患者今日透析過程中出現血壓下降，收縮壓最低至 95 mmHg。已暫停超濾並...',
      createdAt: new Date(Date.now() - 1800000).toISOString(),
      updatedAt: new Date(Date.now() - 600000).toISOString(),
      createdBy: '王護理師',
      status: 'draft',
    },
    {
      id: 'd2',
      type: '醫囑紀錄',
      title: '用藥調整紀錄',
      content: 'Heparin 劑量調整：首劑由 2000 IU 減為 1500 IU，持續輸注維持 500 IU/hr',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3000000).toISOString(),
      createdBy: '李護理師',
      status: 'review',
    },
    {
      id: 'd3',
      type: '護理評估',
      title: '透析通路評估',
      content: '動靜脈瘻管右上肢：震顫感(+)，血管雜音(+)，無紅腫熱痛。穿刺處止血良好。',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      createdBy: '張護理師',
      status: 'draft',
    },
    {
      id: 'd4',
      type: '衛教紀錄',
      title: '飲食衛教草稿',
      content: '向患者說明低鉀飲食原則，避免食用楊桃、香蕉等高鉀水果。已提供衛教單張。',
      createdAt: new Date(Date.now() - 10800000).toISOString(),
      updatedAt: new Date(Date.now() - 9000000).toISOString(),
      createdBy: '王護理師',
      status: 'draft',
    },
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DailyDraftListDialog({
  isVisible,
  patientId,
  onClose,
}: DailyDraftListDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [drafts, setDrafts] = useState<DraftRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDraft, setSelectedDraft] = useState<DraftRecord | null>(null)
  const [editContent, setEditContent] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  useEffect(() => {
    if (!isVisible) return
    setIsLoading(true)
    const timer = setTimeout(() => {
      setDrafts(getMockDrafts())
      setIsLoading(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [isVisible, patientId])

  useEffect(() => {
    if (!isVisible) {
      setSelectedDraft(null)
      setEditContent('')
      setConfirmDeleteId(null)
    }
  }, [isVisible])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDraft) {
          setSelectedDraft(null)
        } else {
          onClose()
        }
      }
    },
    [onClose, selectedDraft]
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

  const handleSelectDraft = (draft: DraftRecord) => {
    setSelectedDraft(draft)
    setEditContent(draft.content)
  }

  const handleSaveDraft = async () => {
    if (!selectedDraft) return
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    setDrafts((prev) =>
      prev.map((d) =>
        d.id === selectedDraft.id
          ? { ...d, content: editContent, updatedAt: new Date().toISOString() }
          : d
      )
    )
    setSelectedDraft(null)
    setIsSaving(false)
  }

  const handleFinalize = async (draftId: string) => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 400))
    setDrafts((prev) => prev.filter((d) => d.id !== draftId))
    setSelectedDraft(null)
    setIsSaving(false)
  }

  const handleDelete = async (draftId: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== draftId))
    setConfirmDeleteId(null)
    if (selectedDraft?.id === draftId) {
      setSelectedDraft(null)
    }
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
  }

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="draft-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="draft-title" className={styles.title}>
            未定稿記錄
            {patientId && <span className={styles.badge}>患者 #{patientId}</span>}
            <span className={styles.countBadge}>{drafts.length} 筆草稿</span>
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : selectedDraft ? (
            /* Edit view */
            <div className={styles.editView}>
              <button
                type="button"
                className={styles.backButton}
                onClick={() => setSelectedDraft(null)}
              >
                &larr; 返回列表
              </button>
              <div className={styles.editHeader}>
                <h3 className={styles.editTitle}>{selectedDraft.title}</h3>
                <span className={`${styles.typeBadge} ${styles[`type_${selectedDraft.status}`]}`}>
                  {selectedDraft.status === 'review' ? '待審核' : '草稿'}
                </span>
              </div>
              <div className={styles.editMeta}>
                <span>類型：{selectedDraft.type}</span>
                <span>建立者：{selectedDraft.createdBy}</span>
                <span>最後更新：{formatTime(selectedDraft.updatedAt)}</span>
              </div>
              <textarea
                className={styles.editTextarea}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={10}
              />
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={() => setSelectedDraft(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className={styles.saveDraftButton}
                  onClick={handleSaveDraft}
                  disabled={isSaving}
                >
                  {isSaving ? '儲存中...' : '儲存草稿'}
                </button>
                <button
                  type="button"
                  className={styles.finalizeButton}
                  onClick={() => handleFinalize(selectedDraft.id)}
                  disabled={isSaving}
                >
                  定稿送出
                </button>
              </div>
            </div>
          ) : drafts.length === 0 ? (
            <div className={styles.empty}>目前沒有未定稿的記錄</div>
          ) : (
            /* List view */
            <div className={styles.draftList}>
              {drafts.map((draft) => (
                <div key={draft.id} className={styles.draftCard}>
                  <div className={styles.draftCardBody} onClick={() => handleSelectDraft(draft)}>
                    <div className={styles.draftCardHeader}>
                      <span className={`${styles.typeBadge} ${styles[`type_${draft.status}`]}`}>
                        {draft.status === 'review' ? '待審核' : '草稿'}
                      </span>
                      <span className={styles.draftType}>{draft.type}</span>
                      <span className={styles.draftTime}>{formatTime(draft.updatedAt)}</span>
                    </div>
                    <h4 className={styles.draftTitle}>{draft.title}</h4>
                    <p className={styles.draftPreview}>{draft.content}</p>
                    <span className={styles.draftAuthor}>{draft.createdBy}</span>
                  </div>
                  <div className={styles.draftCardActions}>
                    <button
                      type="button"
                      className={styles.editButton}
                      onClick={() => handleSelectDraft(draft)}
                    >
                      編輯
                    </button>
                    {confirmDeleteId === draft.id ? (
                      <div className={styles.confirmDelete}>
                        <span className={styles.confirmText}>確定刪除？</span>
                        <button
                          type="button"
                          className={styles.confirmYes}
                          onClick={() => handleDelete(draft.id)}
                        >
                          是
                        </button>
                        <button
                          type="button"
                          className={styles.confirmNo}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          否
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => setConfirmDeleteId(draft.id)}
                      >
                        刪除
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer (only in list view) */}
        {!selectedDraft && (
          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              關閉
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
