import { useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/ConfirmDialog.module.css'

interface ConfirmDialogProps {
  isVisible: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmClass?: string
  cancelClass?: string
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  isVisible,
  title,
  message,
  confirmText = '確認',
  cancelText = '取消',
  confirmClass,
  cancelClass,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    },
    [onCancel]
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
    if (e.target === overlayRef.current) {
      onCancel()
    }
  }

  if (!isVisible) return null

  const confirmBtnClass = confirmClass
    ? `${styles.button} ${confirmClass}`
    : `${styles.button} ${styles.confirmButton}`

  const cancelBtnClass = cancelClass
    ? `${styles.button} ${cancelClass}`
    : `${styles.button} ${styles.cancelButton}`

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className={styles.header}>
          <h2 id="confirm-title" className={styles.title}>{title}</h2>
        </div>
        <div className={styles.body}>
          <p id="confirm-message" className={styles.message}>{message}</p>
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={cancelBtnClass}
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={confirmBtnClass}
            onClick={onConfirm}
            autoFocus
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
