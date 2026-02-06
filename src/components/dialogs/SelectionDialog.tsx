import { useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/SelectionDialog.module.css'

interface SelectionOption {
  label: string
  value: string
  className?: string
}

interface SelectionDialogProps {
  isVisible: boolean
  title: string
  options: SelectionOption[]
  onSelect: (value: string) => void
  onCancel: () => void
}

export default function SelectionDialog({
  isVisible,
  title,
  options,
  onSelect,
  onCancel,
}: SelectionDialogProps) {
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

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="selection-title">
        <div className={styles.header}>
          <h2 id="selection-title" className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onCancel}
            aria-label="關閉"
          >
            &times;
          </button>
        </div>
        <div className={styles.optionsList}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                option.className
                  ? `${styles.optionButton} ${option.className}`
                  : styles.optionButton
              }
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
