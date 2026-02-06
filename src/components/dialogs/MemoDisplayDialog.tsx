import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/MemoDisplayDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Memo {
  id: string
  title: string
  content: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  createdAt: string
  createdBy: string
  isRead: boolean
  category?: string
  expiresAt?: string
}

interface MemoDisplayDialogProps {
  isVisible: boolean
  patientId?: string
  patientName?: string
  memos?: Memo[]
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

function getMockMemos(): Memo[] {
  return [
    {
      id: 'm1',
      title: '用藥提醒',
      content: '患者 Heparin 劑量已調整為 1500 IU 首劑，下次透析開始時請注意。持續輸注維持 400 IU/hr。',
      priority: 'urgent',
      createdAt: new Date(Date.now() - 900000).toISOString(),
      createdBy: '陳醫師',
      isRead: false,
      category: '醫囑',
    },
    {
      id: 'm2',
      title: '家屬聯繫',
      content: '患者家屬（女兒）來電詢問下次門診時間，請護理站回覆。電話：0912-345-678',
      priority: 'normal',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      createdBy: '櫃台人員',
      isRead: false,
      category: '行政',
    },
    {
      id: 'm3',
      title: '飲食控制提醒',
      content: '上次抽血報告鉀離子偏高 (5.8 mEq/L)，請加強衛教低鉀飲食。',
      priority: 'high',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      createdBy: '營養師',
      isRead: true,
      category: '衛教',
    },
    {
      id: 'm4',
      title: '轉介通知',
      content: '已安排 1/20 心臟科門診，請提醒患者攜帶健保卡及近三個月透析記錄。',
      priority: 'normal',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      createdBy: '王護理師',
      isRead: true,
      category: '轉介',
      expiresAt: new Date(Date.now() + 86400000 * 5).toISOString(),
    },
    {
      id: 'm5',
      title: '體重控制',
      content: '連續三次透析間體重增加超過 3kg，請加強衛教水分控制。',
      priority: 'low',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      createdBy: '李護理師',
      isRead: true,
      category: '衛教',
    },
  ]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MemoDisplayDialog({
  isVisible,
  patientId,
  patientName,
  memos: externalMemos,
  onClose,
}: MemoDisplayDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [memos, setMemos] = useState<Memo[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!isVisible) return
    if (externalMemos && externalMemos.length > 0) {
      setMemos(externalMemos)
      return
    }
    setIsLoading(true)
    const timer = setTimeout(() => {
      setMemos(getMockMemos())
      setIsLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [isVisible, patientId, externalMemos])

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

  const handleMarkRead = (memoId: string) => {
    setMemos((prev) =>
      prev.map((m) => (m.id === memoId ? { ...m, isRead: true } : m))
    )
  }

  const handleMarkAllRead = () => {
    setMemos((prev) => prev.map((m) => ({ ...m, isRead: true })))
  }

  const formatTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMs / 3600000)
    const diffDay = Math.floor(diffMs / 86400000)

    if (diffMin < 60) return `${diffMin} 分鐘前`
    if (diffHr < 24) return `${diffHr} 小時前`
    if (diffDay < 7) return `${diffDay} 天前`
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  const priorityLabel = (p: Memo['priority']) => {
    switch (p) {
      case 'urgent':
        return '緊急'
      case 'high':
        return '重要'
      case 'normal':
        return '一般'
      case 'low':
        return '低'
    }
  }

  const unreadCount = memos.filter((m) => !m.isRead).length
  const displayName = patientName || (patientId ? `患者 #${patientId}` : '')

  if (!isVisible) return null

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="memo-title">
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 id="memo-title" className={styles.title}>
              待辦訊息
            </h2>
            {displayName && <span className={styles.patientBadge}>{displayName}</span>}
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount} 未讀</span>
            )}
          </div>
          <div className={styles.headerRight}>
            {unreadCount > 0 && (
              <button
                type="button"
                className={styles.markAllButton}
                onClick={handleMarkAllRead}
              >
                全部標為已讀
              </button>
            )}
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {isLoading ? (
            <div className={styles.loading}>載入中...</div>
          ) : memos.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>&#9993;</div>
              <p>目前沒有待辦訊息</p>
            </div>
          ) : (
            <div className={styles.memoList}>
              {memos.map((memo) => (
                <div
                  key={memo.id}
                  className={`${styles.memoCard} ${!memo.isRead ? styles.unread : ''} ${styles[`priority_${memo.priority}`]}`}
                >
                  <div className={styles.memoHeader}>
                    <div className={styles.memoHeaderLeft}>
                      <span className={`${styles.priorityDot} ${styles[`dot_${memo.priority}`]}`} />
                      <span className={styles.memoTitle}>{memo.title}</span>
                      <span className={`${styles.priorityTag} ${styles[`tag_${memo.priority}`]}`}>
                        {priorityLabel(memo.priority)}
                      </span>
                    </div>
                    <span className={styles.memoTime}>{formatTime(memo.createdAt)}</span>
                  </div>
                  <p className={styles.memoContent}>{memo.content}</p>
                  <div className={styles.memoFooter}>
                    <div className={styles.memoMeta}>
                      {memo.category && (
                        <span className={styles.categoryBadge}>{memo.category}</span>
                      )}
                      <span className={styles.authorText}>{memo.createdBy}</span>
                      {memo.expiresAt && (
                        <span className={styles.expiresText}>
                          有效至 {new Date(memo.expiresAt).toLocaleDateString('zh-TW')}
                        </span>
                      )}
                    </div>
                    {!memo.isRead && (
                      <button
                        type="button"
                        className={styles.markReadButton}
                        onClick={() => handleMarkRead(memo.id)}
                      >
                        標為已讀
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            共 {memos.length} 則訊息
          </span>
          <button type="button" className={styles.cancelButton} onClick={onClose}>
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
