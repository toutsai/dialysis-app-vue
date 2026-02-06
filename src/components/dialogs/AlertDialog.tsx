import { useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/AlertDialog.module.css'

interface AlertDialogProps {
  isVisible: boolean
  title: string
  message: string
  onConfirm: () => void
}

export default function AlertDialog({
  isVisible,
  title,
  message,
  onConfirm,
}: AlertDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onConfirm()
      }
    },
    [onConfirm]
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
      onConfirm()
    }
  }

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div ref={modalRef} className={styles.modal} role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-message">
        <div className={styles.header}>
          <h2 id="alert-title" className={styles.title}>{title}</h2>
        </div>
        <div className={styles.body}>
          <p id="alert-message" className={styles.message}>{message}</p>
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={onConfirm}
            autoFocus
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
