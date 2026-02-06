// src/components/WardNumberBadge.tsx
// Inline editable badge for ward numbers. Clicking activates an input field.

import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from 'react'
import styles from '@/components/WardNumberBadge.module.css'

interface WardNumberBadgeProps {
  value: string
  placeholder?: string
  onUpdate: (value: string) => void
}

export default function WardNumberBadge({
  value,
  placeholder = '床號',
  onUpdate,
}: WardNumberBadgeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync draft when value changes externally
  useEffect(() => {
    if (!isEditing) {
      setDraft(value)
    }
  }, [value, isEditing])

  // Auto-focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  const commitEdit = useCallback(() => {
    const trimmed = draft.trim()
    setIsEditing(false)
    if (trimmed !== value) {
      onUpdate(trimmed)
    }
  }, [draft, value, onUpdate])

  const cancelEdit = useCallback(() => {
    setDraft(value)
    setIsEditing(false)
  }, [value])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        cancelEdit()
      }
    },
    [commitEdit, cancelEdit]
  )

  const handleBadgeClick = useCallback(() => {
    setIsEditing(true)
  }, [])

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        maxLength={10}
        aria-label="病床號碼"
      />
    )
  }

  return (
    <span
      className={`${styles.badge} ${value ? styles.badgeFilled : styles.badgeEmpty}`}
      onClick={handleBadgeClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleBadgeClick()
        }
      }}
      title="點擊編輯床號"
      aria-label={value ? `床號: ${value}` : placeholder}
    >
      {value || placeholder}
    </span>
  )
}
