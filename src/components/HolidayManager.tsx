import { useState, useEffect, useCallback } from 'react'
import ApiManager from '@/services/api_manager'
import styles from '@/components/HolidayManager.module.css'

interface HolidayRecord {
  id?: string
  date: string
  name: string
  type: string
  [key: string]: unknown
}

const HOLIDAY_TYPES = [
  { value: 'national', label: '國定假日' },
  { value: 'makeup', label: '補班日' },
  { value: 'custom', label: '自訂假日' },
  { value: 'typhoon', label: '颱風假' },
]

const holidayApi = ApiManager<HolidayRecord>('holidays')

export default function HolidayManager() {
  const [holidays, setHolidays] = useState<HolidayRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Navigation
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1)

  // Form fields
  const [formDate, setFormDate] = useState('')
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('national')

  const fetchHolidays = useCallback(async () => {
    setIsLoading(true)
    try {
      const all = await holidayApi.fetchAll()
      setHolidays(all)
    } catch (err) {
      console.error('[HolidayManager] fetchHolidays error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHolidays()
  }, [fetchHolidays])

  const filteredHolidays = holidays
    .filter((h) => {
      if (!h.date) return false
      const [y, m] = h.date.split('-').map(Number)
      return y === viewYear && m === viewMonth
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  const goToPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear(viewYear - 1)
      setViewMonth(12)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const goToNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear(viewYear + 1)
      setViewMonth(1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const resetForm = () => {
    setFormDate('')
    setFormName('')
    setFormType('national')
    setEditingId(null)
  }

  const handleOpenAdd = () => {
    resetForm()
    const mm = String(viewMonth).padStart(2, '0')
    setFormDate(`${viewYear}-${mm}-01`)
    setShowForm(true)
  }

  const handleOpenEdit = (holiday: HolidayRecord) => {
    setEditingId(holiday.id ?? null)
    setFormDate(holiday.date)
    setFormName(holiday.name)
    setFormType(holiday.type || 'national')
    setShowForm(true)
  }

  const handleCloseForm = () => {
    setShowForm(false)
    resetForm()
  }

  const handleSave = async () => {
    if (!formDate || !formName.trim()) return
    setIsSaving(true)
    try {
      const record: HolidayRecord = {
        date: formDate,
        name: formName.trim(),
        type: formType,
      }

      if (editingId) {
        await holidayApi.update(editingId, record)
        setHolidays((prev) =>
          prev.map((h) =>
            h.id === editingId ? { ...h, ...record } : h
          )
        )
      } else {
        const saved = await holidayApi.create(record)
        setHolidays((prev) => [...prev, saved])
      }
      handleCloseForm()
    } catch (err) {
      console.error('[HolidayManager] save error:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (holiday: HolidayRecord) => {
    if (!holiday.id) return
    const confirmed = window.confirm(
      `確定要刪除「${holiday.name}」(${holiday.date}) 嗎？`
    )
    if (!confirmed) return
    try {
      await holidayApi.delete(holiday.id)
      setHolidays((prev) => prev.filter((h) => h.id !== holiday.id))
    } catch (err) {
      console.error('[HolidayManager] delete error:', err)
    }
  }

  const getTypeLabel = (type: string): string => {
    return HOLIDAY_TYPES.find((t) => t.value === type)?.label ?? type
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>假日管理</h2>
        <button
          type="button"
          className={styles.addBtn}
          onClick={handleOpenAdd}
        >
          + 新增假日
        </button>
      </div>

      <div className={styles.navigation}>
        <button
          type="button"
          className={styles.navBtn}
          onClick={goToPrevMonth}
        >
          {'\u2039'}
        </button>
        <span className={styles.navLabel}>
          {viewYear} 年 {viewMonth} 月
        </span>
        <button
          type="button"
          className={styles.navBtn}
          onClick={goToNextMonth}
        >
          {'\u203A'}
        </button>
      </div>

      {isLoading ? (
        <div className={styles.loadingState}>載入中...</div>
      ) : filteredHolidays.length === 0 ? (
        <div className={styles.emptyState}>
          {viewYear} 年 {viewMonth} 月目前沒有假日設定
        </div>
      ) : (
        <div className={styles.list}>
          {filteredHolidays.map((holiday) => (
            <div key={holiday.id} className={styles.holidayCard}>
              <div className={styles.holidayInfo}>
                <span className={styles.holidayDate}>{holiday.date}</span>
                <span className={styles.holidayName}>{holiday.name}</span>
                <span className={styles.holidayType}>
                  {getTypeLabel(holiday.type)}
                </span>
              </div>
              <div className={styles.holidayActions}>
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={() => handleOpenEdit(holiday)}
                >
                  編輯
                </button>
                <button
                  type="button"
                  className={styles.deleteBtn}
                  onClick={() => handleDelete(holiday)}
                >
                  刪除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className={styles.formOverlay} onClick={handleCloseForm}>
          <div
            className={styles.formModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles.formTitle}>
              {editingId ? '編輯假日' : '新增假日'}
            </h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>日期</label>
              <input
                type="date"
                className={styles.formInput}
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>假日名稱</label>
              <input
                type="text"
                className={styles.formInput}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="例: 中秋節"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>類型</label>
              <select
                className={styles.formSelect}
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
              >
                {HOLIDAY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.cancelFormBtn}
                onClick={handleCloseForm}
              >
                取消
              </button>
              <button
                type="button"
                className={styles.saveFormBtn}
                onClick={handleSave}
                disabled={isSaving || !formDate || !formName.trim()}
              >
                {isSaving ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
