import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/WardNumberDialog.module.css'

interface WardNumberDialogProps {
  isVisible: boolean
  title?: string
  message?: string
  currentValue?: string
  onConfirm: (value: string) => void
  onCancel: () => void
}

export default function WardNumberDialog({
  isVisible,
  title = '輸入病床號',
  message,
  currentValue = '',
  onConfirm,
  onCancel,
}: WardNumberDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(currentValue)

  // Sync value when dialog opens or currentValue changes
  useEffect(() => {
    if (isVisible) {
      setValue(currentValue)
    }
  }, [isVisible, currentValue])

  // Manage the native <dialog> open/close
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isVisible) {
      if (!dialog.open) {
        dialog.showModal()
      }
      // Focus the input after opening
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 50)
    } else {
      if (dialog.open) {
        dialog.close()
      }
    }
  }, [isVisible])

  // Handle native dialog cancel event (Escape key)
  const handleDialogCancel = useCallback(
    (e: Event) => {
      e.preventDefault()
      onCancel()
    },
    [onCancel]
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.addEventListener('cancel', handleDialogCancel)
    return () => {
      dialog.removeEventListener('cancel', handleDialogCancel)
    }
  }, [handleDialogCancel])

  // Click on backdrop (the ::backdrop pseudo-element)
  const handleDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current
    if (!dialog) return
    const rect = dialog.getBoundingClientRect()
    const isInDialog =
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    if (!isInDialog) {
      onCancel()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onConfirm(value.trim())
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(value.trim())
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClick={handleDialogClick}
    >
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>

        {message && (
          <p className={styles.message}>{message}</p>
        )}

        <div className={styles.inputGroup}>
          <label htmlFor="ward-number-input" className={styles.label}>
            病床號碼
          </label>
          <input
            ref={inputRef}
            id="ward-number-input"
            type="text"
            className={styles.input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="請輸入病床號碼"
            autoComplete="off"
          />
        </div>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            取消
          </button>
          <button
            type="submit"
            className={styles.confirmButton}
          >
            確認
          </button>
        </div>
      </form>
    </dialog>
  )
}
