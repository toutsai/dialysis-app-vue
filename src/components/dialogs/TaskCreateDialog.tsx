import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { formatDateToYYYYMMDD } from '@/utils/dateUtils'
import styles from '@/components/dialogs/TaskCreateDialog.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskPatient {
  id: string
  name?: string
  chartNo?: string
  [key: string]: unknown
}

export type TaskCategory = 'task' | 'message'
export type TaskType = 'routine' | 'education' | 'urgent' | 'follow_up'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface TaskFormData {
  category: TaskCategory
  type: TaskType
  title: string
  content: string
  patientId: string
  assigneeId: string
  assigneeName: string
  targetDate: string
  priority: TaskPriority
  tags: string[]
}

interface TaskCreateDialogProps {
  isVisible: boolean
  preselectedPatient?: TaskPatient | null
  allPatients: TaskPatient[]
  initialData?: Partial<TaskFormData>
  onClose: () => void
  onSubmit: (data: TaskFormData) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: TaskCategory; label: string; description: string }[] = [
  { value: 'task', label: '工作任務', description: '需要執行的護理或行政任務' },
  { value: 'message', label: '訊息通知', description: '傳達訊息或提醒' },
]

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'routine', label: '常規' },
  { value: 'education', label: '衛教' },
  { value: 'urgent', label: '緊急' },
  { value: 'follow_up', label: '追蹤' },
]

const PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: '低', color: '#28a745' },
  { value: 'normal', label: '一般', color: '#007bff' },
  { value: 'high', label: '高', color: '#fd7e14' },
  { value: 'urgent', label: '緊急', color: '#dc3545' },
]

const SAMPLE_ASSIGNEES = [
  { id: 'nurse_1', name: '王護理師' },
  { id: 'nurse_2', name: '李護理師' },
  { id: 'nurse_3', name: '陳護理師' },
  { id: 'nurse_4', name: '林護理師' },
  { id: 'doctor_1', name: '張醫師' },
  { id: 'doctor_2', name: '黃醫師' },
]

const COMMON_TAGS = ['透析', '抽血', '衛教', '轉介', '會診', '用藥', '飲食', '體重']

const EMPTY_FORM: TaskFormData = {
  category: 'task',
  type: 'routine',
  title: '',
  content: '',
  patientId: '',
  assigneeId: '',
  assigneeName: '',
  targetDate: '',
  priority: 'normal',
  tags: [],
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TaskCreateDialog({
  isVisible,
  preselectedPatient,
  allPatients,
  initialData,
  onClose,
  onSubmit,
}: TaskCreateDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const [form, setForm] = useState<TaskFormData>({ ...EMPTY_FORM })
  const [errors, setErrors] = useState<Partial<Record<keyof TaskFormData, string>>>({})
  const [patientSearch, setPatientSearch] = useState('')
  const [showPatientDropdown, setShowPatientDropdown] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const today = formatDateToYYYYMMDD()

  // Initialize form
  useEffect(() => {
    if (isVisible) {
      const base = { ...EMPTY_FORM, targetDate: today }
      if (initialData) Object.assign(base, initialData)
      if (preselectedPatient) base.patientId = preselectedPatient.id
      setForm(base)
      setErrors({})
      setPatientSearch(preselectedPatient?.name || '')
      setShowPatientDropdown(false)
      setTagInput('')
      setIsSubmitting(false)
    }
  }, [isVisible, preselectedPatient, initialData])

  // Keyboard
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

  // Helpers
  const updateField = <K extends keyof TaskFormData>(field: K, value: TaskFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  // Patient search
  const filteredPatients = useMemo(() => {
    const term = patientSearch.trim().toLowerCase()
    if (!term) return allPatients.slice(0, 30)
    return allPatients.filter(
      (p) =>
        p.name?.toLowerCase().includes(term) ||
        p.chartNo?.toLowerCase().includes(term) ||
        p.id.toLowerCase().includes(term)
    )
  }, [allPatients, patientSearch])

  const handleSelectPatient = (p: TaskPatient) => {
    updateField('patientId', p.id)
    setPatientSearch(p.name || p.id)
    setShowPatientDropdown(false)
  }

  // Tags
  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (trimmed && !form.tags.includes(trimmed)) {
      updateField('tags', [...form.tags, trimmed])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => {
    updateField('tags', form.tags.filter((t) => t !== tag))
  }

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  // Validation
  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof TaskFormData, string>> = {}

    if (!form.title.trim()) newErrors.title = '請輸入標題'
    if (!form.content.trim()) newErrors.content = '請輸入內容'
    if (!form.targetDate) newErrors.targetDate = '請選擇目標日期'
    if (form.category === 'task' && !form.assigneeId) {
      newErrors.assigneeId = '請選擇指派對象'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setIsSubmitting(true)
    try {
      await onSubmit(form)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isVisible) return null

  const selectedPatient = allPatients.find((p) => p.id === form.patientId)

  return (
    <div ref={overlayRef} className={styles.overlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="task-create-title">
        {/* Header */}
        <div className={styles.header}>
          <h2 id="task-create-title" className={styles.title}>
            新增{form.category === 'task' ? '工作任務' : '訊息通知'}
          </h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="關閉">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.scrollArea}>
            {/* Category Selection */}
            <div className={styles.field}>
              <label className={styles.label}>類別</label>
              <div className={styles.categorySelector}>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    className={`${styles.categoryCard} ${form.category === cat.value ? styles.categoryCardActive : ''}`}
                    onClick={() => updateField('category', cat.value)}
                  >
                    <span className={styles.categoryLabel}>{cat.label}</span>
                    <span className={styles.categoryDesc}>{cat.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Type Selection */}
            <div className={styles.field}>
              <label className={styles.label}>類型</label>
              <div className={styles.typeSelector}>
                {TASK_TYPES.map((t) => (
                  <label
                    key={t.value}
                    className={`${styles.typeOption} ${form.type === t.value ? styles.typeOptionActive : ''}`}
                  >
                    <input
                      type="radio"
                      name="taskType"
                      value={t.value}
                      checked={form.type === t.value}
                      onChange={() => updateField('type', t.value)}
                      className={styles.hiddenRadio}
                    />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Title */}
            <div className={styles.field}>
              <label className={styles.label}>
                標題 <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                className={`${styles.input} ${errors.title ? styles.inputError : ''}`}
                value={form.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="請輸入標題..."
              />
              {errors.title && <span className={styles.errorText}>{errors.title}</span>}
            </div>

            {/* Content */}
            <div className={styles.field}>
              <label className={styles.label}>
                內容 <span className={styles.required}>*</span>
              </label>
              <textarea
                className={`${styles.textarea} ${errors.content ? styles.inputError : ''}`}
                value={form.content}
                onChange={(e) => updateField('content', e.target.value)}
                placeholder="請輸入詳細內容..."
                rows={4}
              />
              {errors.content && <span className={styles.errorText}>{errors.content}</span>}
            </div>

            {/* Row: Patient + Assignee */}
            <div className={styles.twoColRow}>
              {/* Patient */}
              <div className={styles.field}>
                <label className={styles.label}>關聯病患 (選填)</label>
                <div className={styles.searchWrapper}>
                  <input
                    type="text"
                    className={styles.input}
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value)
                      setShowPatientDropdown(true)
                      if (!e.target.value.trim()) updateField('patientId', '')
                    }}
                    onFocus={() => setShowPatientDropdown(true)}
                    placeholder="搜尋病患..."
                    readOnly={Boolean(preselectedPatient)}
                  />
                  {showPatientDropdown && !preselectedPatient && filteredPatients.length > 0 && (
                    <div className={styles.dropdown}>
                      {filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className={styles.dropdownItem}
                          onClick={() => handleSelectPatient(p)}
                        >
                          <span>{p.name || p.id}</span>
                          <span className={styles.dropdownMeta}>{p.chartNo || ''}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {selectedPatient && (
                  <span className={styles.selectedHint}>{selectedPatient.name} ({selectedPatient.chartNo || selectedPatient.id})</span>
                )}
              </div>

              {/* Assignee */}
              <div className={styles.field}>
                <label className={styles.label}>
                  指派對象 {form.category === 'task' && <span className={styles.required}>*</span>}
                </label>
                <select
                  className={`${styles.select} ${errors.assigneeId ? styles.inputError : ''}`}
                  value={form.assigneeId}
                  onChange={(e) => {
                    const selected = SAMPLE_ASSIGNEES.find((a) => a.id === e.target.value)
                    updateField('assigneeId', e.target.value)
                    updateField('assigneeName', selected?.name || '')
                  }}
                >
                  <option value="">請選擇</option>
                  {SAMPLE_ASSIGNEES.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
                {errors.assigneeId && <span className={styles.errorText}>{errors.assigneeId}</span>}
              </div>
            </div>

            {/* Row: Date + Priority */}
            <div className={styles.twoColRow}>
              <div className={styles.field}>
                <label className={styles.label}>
                  目標日期 <span className={styles.required}>*</span>
                </label>
                <input
                  type="date"
                  className={`${styles.input} ${errors.targetDate ? styles.inputError : ''}`}
                  value={form.targetDate}
                  onChange={(e) => updateField('targetDate', e.target.value)}
                />
                {errors.targetDate && <span className={styles.errorText}>{errors.targetDate}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label}>優先順序</label>
                <div className={styles.prioritySelector}>
                  {PRIORITIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`${styles.priorityOption} ${form.priority === p.value ? styles.priorityOptionActive : ''}`}
                      style={
                        form.priority === p.value
                          ? { backgroundColor: p.color, borderColor: p.color, color: '#fff' }
                          : { borderColor: p.color, color: p.color }
                      }
                      onClick={() => updateField('priority', p.value)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className={styles.field}>
              <label className={styles.label}>標籤</label>
              <div className={styles.tagContainer}>
                {form.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}
                    <button
                      type="button"
                      className={styles.tagRemove}
                      onClick={() => removeTag(tag)}
                      aria-label={`移除 ${tag}`}
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
              <div className={styles.tagInputRow}>
                <input
                  type="text"
                  className={styles.input}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="輸入標籤後按 Enter..."
                />
              </div>
              <div className={styles.quickTags}>
                {COMMON_TAGS.filter((t) => !form.tags.includes(t)).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={styles.quickTag}
                    onClick={() => addTag(tag)}
                  >
                    + {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={styles.footer}>
            <button type="button" className={styles.cancelButton} onClick={onClose} disabled={isSubmitting}>
              取消
            </button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? '建立中...' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
