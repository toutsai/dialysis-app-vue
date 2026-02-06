import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/MonthYearPicker.module.css'

interface MonthYearPickerProps {
  isVisible: boolean
  initialDate?: Date
  onClose: () => void
  onDateSelected: (year: number, month: number) => void
}

const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]

export default function MonthYearPicker({
  isVisible,
  initialDate,
  onClose,
  onDateSelected,
}: MonthYearPickerProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  const baseDate = initialDate ?? new Date()
  const [selectedYear, setSelectedYear] = useState(baseDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(baseDate.getMonth() + 1)

  // Reset when the dialog opens with a new initialDate
  useEffect(() => {
    if (isVisible) {
      const d = initialDate ?? new Date()
      setSelectedYear(d.getFullYear())
      setSelectedMonth(d.getMonth() + 1)
    }
  }, [isVisible, initialDate])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
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
    if (e.target === overlayRef.current) {
      onClose()
    }
  }

  const decrementYear = () => setSelectedYear((prev) => prev - 1)
  const incrementYear = () => setSelectedYear((prev) => prev + 1)

  const handleMonthClick = (month: number) => {
    setSelectedMonth(month)
  }

  const handleConfirm = () => {
    onDateSelected(selectedYear, selectedMonth)
  }

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="monthyear-title">
        <div className={styles.header}>
          <h2 id="monthyear-title" className={styles.title}>選擇年月</h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="關閉"
          >
            &times;
          </button>
        </div>

        {/* Year selector */}
        <div className={styles.yearSelector}>
          <button
            type="button"
            className={styles.yearArrow}
            onClick={decrementYear}
            aria-label="上一年"
          >
            &#9664;
          </button>
          <span className={styles.yearLabel}>{selectedYear} 年</span>
          <button
            type="button"
            className={styles.yearArrow}
            onClick={incrementYear}
            aria-label="下一年"
          >
            &#9654;
          </button>
        </div>

        {/* Month grid */}
        <div className={styles.monthGrid}>
          {MONTH_LABELS.map((label, index) => {
            const month = index + 1
            const isActive = month === selectedMonth
            return (
              <button
                key={month}
                type="button"
                className={`${styles.monthButton} ${isActive ? styles.monthButtonActive : ''}`}
                onClick={() => handleMonthClick(month)}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.confirmButton}
            onClick={handleConfirm}
          >
            確認
          </button>
        </div>
      </div>
    </div>
  )
}
