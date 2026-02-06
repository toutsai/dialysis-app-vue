import { useState, useEffect, useCallback, useRef } from 'react'
import styles from '@/components/dialogs/UserFormModal.module.css'

type UserRole = 'admin' | 'editor' | 'contributor' | 'viewer'

export interface UserData {
  id?: string
  username: string
  name: string
  role: UserRole
  title: string
}

interface UserFormModalProps {
  isVisible: boolean
  isEditing?: boolean
  user?: UserData
  onClose: () => void
  onSave: (data: UserData) => void
}

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: '管理員 (Admin)', value: 'admin' },
  { label: '編輯者 (Editor)', value: 'editor' },
  { label: '貢獻者 (Contributor)', value: 'contributor' },
  { label: '檢視者 (Viewer)', value: 'viewer' },
]

const INITIAL_FORM: UserData = {
  username: '',
  name: '',
  role: 'viewer',
  title: '',
}

export default function UserFormModal({
  isVisible,
  isEditing = false,
  user,
  onClose,
  onSave,
}: UserFormModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<UserData>(INITIAL_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof UserData, string>>>({})

  // Reset form when dialog opens
  useEffect(() => {
    if (isVisible) {
      if (isEditing && user) {
        setFormData({
          id: user.id,
          username: user.username || '',
          name: user.name || '',
          role: user.role || 'viewer',
          title: user.title || '',
        })
      } else {
        setFormData({ ...INITIAL_FORM })
      }
      setErrors({})
      // Focus first input after animation
      setTimeout(() => {
        firstInputRef.current?.focus()
      }, 100)
    }
  }, [isVisible, isEditing, user])

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error for the changed field
    if (errors[name as keyof UserData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }))
    }
  }

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof UserData, string>> = {}

    if (!formData.username.trim()) {
      newErrors.username = '請輸入使用者帳號'
    }
    if (!formData.name.trim()) {
      newErrors.name = '請輸入姓名'
    }
    if (!formData.role) {
      newErrors.role = '請選擇角色'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (validate()) {
      onSave({
        ...formData,
        username: formData.username.trim(),
        name: formData.name.trim(),
        title: formData.title.trim(),
      })
    }
  }

  if (!isVisible) return null

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleOverlayClick}
    >
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="userform-title">
        <div className={styles.header}>
          <h2 id="userform-title" className={styles.title}>
            {isEditing ? '編輯使用者' : '新增使用者'}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="關閉"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* Username */}
          <div className={styles.formGroup}>
            <label htmlFor="user-username" className={styles.label}>
              使用者帳號 <span className={styles.required}>*</span>
            </label>
            <input
              ref={firstInputRef}
              id="user-username"
              name="username"
              type="text"
              className={`${styles.input} ${errors.username ? styles.inputError : ''}`}
              value={formData.username}
              onChange={handleChange}
              placeholder="請輸入使用者帳號"
              autoComplete="off"
              disabled={isEditing}
            />
            {errors.username && (
              <span className={styles.errorText}>{errors.username}</span>
            )}
          </div>

          {/* Name */}
          <div className={styles.formGroup}>
            <label htmlFor="user-name" className={styles.label}>
              姓名 <span className={styles.required}>*</span>
            </label>
            <input
              id="user-name"
              name="name"
              type="text"
              className={`${styles.input} ${errors.name ? styles.inputError : ''}`}
              value={formData.name}
              onChange={handleChange}
              placeholder="請輸入姓名"
              autoComplete="off"
            />
            {errors.name && (
              <span className={styles.errorText}>{errors.name}</span>
            )}
          </div>

          {/* Role */}
          <div className={styles.formGroup}>
            <label htmlFor="user-role" className={styles.label}>
              角色 <span className={styles.required}>*</span>
            </label>
            <select
              id="user-role"
              name="role"
              className={`${styles.select} ${errors.role ? styles.inputError : ''}`}
              value={formData.role}
              onChange={handleChange}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {errors.role && (
              <span className={styles.errorText}>{errors.role}</span>
            )}
          </div>

          {/* Title (職稱) */}
          <div className={styles.formGroup}>
            <label htmlFor="user-title" className={styles.label}>
              職稱
            </label>
            <input
              id="user-title"
              name="title"
              type="text"
              className={styles.input}
              value={formData.title}
              onChange={handleChange}
              placeholder="請輸入職稱 (選填)"
              autoComplete="off"
            />
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
              type="submit"
              className={styles.saveButton}
            >
              {isEditing ? '儲存變更' : '新增使用者'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
