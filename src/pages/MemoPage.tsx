// src/pages/MemoPage.tsx
// Scaffold - Handover memo management

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './MemoPage.module.css'

interface Memo {
  id: string
  title: string
  content: string
  author: string
  authorName: string
  shift: string
  createdAt: string
  updatedAt: string
  isRead: boolean
  priority: 'normal' | 'important' | 'urgent'
  [key: string]: unknown
}

const MemoPage: React.FC = () => {
  const { currentUser, isContributor } = useAuth()

  const [memos, setMemos] = useState<Memo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().slice(0, 10)
  })
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null)

  // TODO: Fetch memos from Firestore
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch memos for selectedDate
    setIsLoading(false)
  }, [selectedDate])

  const handleDateChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedDate(e.target.value)
  }, [])

  const handleMemoClick = useCallback((memo: Memo) => {
    setSelectedMemo(memo)
  }, [])

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>交班備忘錄</h1>
        <div className={styles.controls}>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className={styles.dateInput}
          />
          {isContributor && (
            <button
              className={styles.createButton}
              onClick={() => setShowCreateDialog(true)}
            >
              + 新增備忘錄
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.memoLayout}>
        {/* Memo list */}
        <div className={styles.memoList}>
          {memos.length === 0 && !isLoading ? (
            <div className={styles.emptyState}>
              <p>今日尚無備忘錄</p>
            </div>
          ) : (
            memos.map((memo) => (
              <div
                key={memo.id}
                className={`${styles.memoCard} ${selectedMemo?.id === memo.id ? styles.memoCardActive : ''} ${memo.priority === 'urgent' ? styles.memoUrgent : ''}`}
                onClick={() => handleMemoClick(memo)}
              >
                <div className={styles.memoCardHeader}>
                  <span className={styles.memoTitle}>{memo.title}</span>
                  {memo.priority !== 'normal' && (
                    <span className={`${styles.priorityBadge} ${styles[`priority_${memo.priority}`]}`}>
                      {memo.priority === 'urgent' ? '緊急' : '重要'}
                    </span>
                  )}
                </div>
                <div className={styles.memoMeta}>
                  <span>{memo.authorName}</span>
                  <span>{memo.shift}</span>
                  <span>{memo.createdAt}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Memo detail */}
        <div className={styles.memoDetail}>
          {selectedMemo ? (
            <>
              <h2 className={styles.detailTitle}>{selectedMemo.title}</h2>
              <div className={styles.detailMeta}>
                <span>作者: {selectedMemo.authorName}</span>
                <span>班別: {selectedMemo.shift}</span>
                <span>時間: {selectedMemo.createdAt}</span>
              </div>
              <div className={styles.detailContent}>
                {selectedMemo.content}
              </div>
            </>
          ) : (
            <div className={styles.detailPlaceholder}>
              <p>請選擇一則備忘錄查看詳情</p>
            </div>
          )}
        </div>
      </div>

      {/* TODO: Create/Edit memo dialog */}
    </div>
  )
}

export default MemoPage
