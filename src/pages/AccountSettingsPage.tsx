// src/pages/AccountSettingsPage.tsx
// Full implementation - Password change form

import { useState, useCallback, type FormEvent, type ChangeEvent } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './AccountSettingsPage.module.css'

const AccountSettingsPage: React.FC = () => {
  const { currentUser, updatePassword } = useAuth()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  const handleOldPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setOldPassword(e.target.value)
    clearMessages()
  }, [clearMessages])

  const handleNewPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setNewPassword(e.target.value)
    clearMessages()
  }, [clearMessages])

  const handleConfirmPasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value)
    clearMessages()
  }, [clearMessages])

  const resetForm = useCallback(() => {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }, [])

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    clearMessages()

    // Validation
    if (!oldPassword || !newPassword || !confirmPassword) {
      setError('請填寫所有欄位')
      return
    }

    if (newPassword.length < 6) {
      setError('新密碼長度至少需要 6 個字元')
      return
    }

    if (newPassword !== confirmPassword) {
      setError('新密碼與確認密碼不一致')
      return
    }

    if (oldPassword === newPassword) {
      setError('新密碼不能與舊密碼相同')
      return
    }

    setIsSubmitting(true)

    try {
      const result = await updatePassword(oldPassword, newPassword)
      if (result.success) {
        setSuccess(result.message || '密碼已成功更新')
        resetForm()
      } else {
        setError(result.message || '密碼更新失敗')
      }
    } catch (err: unknown) {
      console.error('[AccountSettingsPage] Password update failed:', err)
      if (err instanceof Error) {
        if (err.message.includes('wrong-password') || err.message.includes('invalid')) {
          setError('舊密碼不正確')
        } else {
          setError('密碼更新失敗，請稍後再試')
        }
      } else {
        setError('密碼更新失敗，請稍後再試')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [oldPassword, newPassword, confirmPassword, updatePassword, clearMessages, resetForm])

  return (
    <div className={styles.pageContainer}>
      <h1 className={styles.pageTitle}>帳號設定</h1>

      <div className={styles.settingsContent}>
        {/* User Info Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>個人資訊</h2>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>姓名</span>
              <span className={styles.infoValue}>{currentUser?.name || '-'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>角色</span>
              <span className={styles.infoValue}>{currentUser?.role || '-'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>職稱</span>
              <span className={styles.infoValue}>{currentUser?.title || '-'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Email</span>
              <span className={styles.infoValue}>{currentUser?.email || '-'}</span>
            </div>
          </div>
        </div>

        {/* Password Change Section */}
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>變更密碼</h2>

          <form className={styles.passwordForm} onSubmit={handleSubmit} noValidate>
            {error && (
              <div className={styles.errorAlert} role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className={styles.successAlert} role="status">
                {success}
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="oldPassword" className={styles.formLabel}>
                目前密碼
              </label>
              <input
                id="oldPassword"
                type="password"
                className={styles.formInput}
                value={oldPassword}
                onChange={handleOldPasswordChange}
                placeholder="請輸入目前密碼"
                autoComplete="current-password"
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="newPassword" className={styles.formLabel}>
                新密碼
              </label>
              <input
                id="newPassword"
                type="password"
                className={styles.formInput}
                value={newPassword}
                onChange={handleNewPasswordChange}
                placeholder="請輸入新密碼（至少6個字元）"
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="confirmPassword" className={styles.formLabel}>
                確認新密碼
              </label>
              <input
                id="confirmPassword"
                type="password"
                className={styles.formInput}
                value={confirmPassword}
                onChange={handleConfirmPasswordChange}
                placeholder="請再次輸入新密碼"
                autoComplete="new-password"
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.formActions}>
              <button
                type="submit"
                className={styles.submitButton}
                disabled={isSubmitting || !oldPassword || !newPassword || !confirmPassword}
              >
                {isSubmitting ? '更新中...' : '確認變更'}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={resetForm}
                disabled={isSubmitting}
              >
                重設
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AccountSettingsPage
