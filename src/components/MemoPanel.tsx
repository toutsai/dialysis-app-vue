import { useMemo } from 'react'
import { useTaskStore, type TaskRecord } from '@/stores/taskStore'
import styles from '@/components/MemoPanel.module.css'

interface MemoPanelProps {
  patientId: string
}

function formatTimestamp(
  value: string | { toDate: () => Date } | Date | undefined | null
): string {
  if (!value) return ''
  let d: Date
  if (value instanceof Date) {
    d = value
  } else if (typeof value === 'string') {
    d = new Date(value)
  } else if (typeof (value as any).toDate === 'function') {
    d = (value as any).toDate()
  } else {
    return ''
  }
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd} ${hh}:${min}`
}

export default function MemoPanel({ patientId }: MemoPanelProps) {
  const feedMessages = useTaskStore((s) => s.feedMessages)

  const patientMemos = useMemo(() => {
    if (!patientId) return []

    const filtered = feedMessages.filter(
      (msg) =>
        msg.category === 'message' &&
        msg.patientId === patientId &&
        msg.status !== 'deleted'
    )

    // Sort: pending first, then by createdAt descending
    return [...filtered].sort((a, b) => {
      const aPending = a.status === 'pending' ? 0 : 1
      const bPending = b.status === 'pending' ? 0 : 1
      if (aPending !== bPending) return aPending - bPending

      const aTime = getTime(a.createdAt)
      const bTime = getTime(b.createdAt)
      return bTime - aTime
    })
  }, [feedMessages, patientId])

  const pendingCount = useMemo(
    () => patientMemos.filter((m) => m.status === 'pending').length,
    [patientMemos]
  )

  if (!patientId) {
    return (
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3 className={styles.headerTitle}>備忘/通知</h3>
        </div>
        <div className={styles.body}>
          <div className={styles.emptyState}>請先選擇病人</div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.headerTitle}>備忘/通知</h3>
        {pendingCount > 0 && (
          <span className={styles.badge}>{pendingCount}</span>
        )}
      </div>

      <div className={styles.body}>
        {patientMemos.length === 0 ? (
          <div className={styles.emptyState}>目前沒有待處理的備忘</div>
        ) : (
          <div className={styles.memoList}>
            {patientMemos.map((memo) => (
              <MemoCard key={memo.id} memo={memo} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MemoCard({ memo }: { memo: TaskRecord }) {
  const isPending = memo.status === 'pending'
  const memoType = (memo.type as string) ?? '通知'
  const memoContent =
    (memo as any).content ?? (memo as any).text ?? (memo as any).note ?? ''
  const creatorName =
    (memo.creator as any)?.name ??
    (memo.creator as any)?.uid ??
    ''

  return (
    <div className={styles.memoCard}>
      <div
        className={`${styles.memoIcon} ${
          isPending ? styles.memoIconPending : styles.memoIconDone
        }`}
      >
        {isPending ? '!' : '\u2713'}
      </div>
      <div className={styles.memoContent}>
        <div className={styles.memoType}>
          <span
            className={`${styles.statusDot} ${
              isPending ? styles.statusDotPending : styles.statusDotDone
            }`}
          />
          {memoType}
        </div>
        <div className={styles.memoText}>{memoContent}</div>
        <div className={styles.memoMeta}>
          <span className={styles.memoDate}>
            {formatTimestamp(memo.createdAt)}
          </span>
          {creatorName && (
            <span className={styles.memoCreator}>by {creatorName}</span>
          )}
          {memo.targetDate && (
            <span className={styles.memoDate}>
              目標: {memo.targetDate}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function getTime(
  value: string | { toDate: () => Date } | Date | undefined | null
): number {
  if (!value) return 0
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string') return new Date(value).getTime()
  if (typeof (value as any).toDate === 'function')
    return (value as any).toDate().getTime()
  return 0
}
