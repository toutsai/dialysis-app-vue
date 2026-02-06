// src/pages/LoginPage.tsx
// Full implementation - Login page with username/password authentication

import { useState, useCallback, type FormEvent, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import styles from './LoginPage.module.css'

const LoginPage: React.FC = () => {
  const navigate = useNavigate()
  const { login, authLoading } = useAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleUsernameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value)
    if (error) setError(null)
  }, [error])

  const handlePasswordChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
    if (error) setError(null)
  }, [error])

  const handleSubmit = useCallback(async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    const trimmedUsername = username.trim()
    if (!trimmedUsername || !password) {
      setError('請輸入帳號和密碼')
      return
    }

    setIsSubmitting(true)
    setError(null)

    try {
      await login(trimmedUsername, password)
      navigate('/', { replace: true })
    } catch (err: unknown) {
      console.error('[LoginPage] Login failed:', err)

      if (err instanceof Error) {
        // Map common Firebase/Cloud Function errors to user-friendly messages
        const message = err.message
        if (message.includes('invalid-credential') || message.includes('wrong-password')) {
          setError('帳號或密碼錯誤，請重新輸入')
        } else if (message.includes('user-not-found') || message.includes('not found')) {
          setError('找不到此帳號，請確認後重試')
        } else if (message.includes('too-many-requests')) {
          setError('登入嘗試次數過多，請稍後再試')
        } else if (message.includes('network')) {
          setError('網路連線異常，請檢查網路後重試')
        } else {
          setError('登入失敗，請稍後再試')
        }
      } else {
        setError('登入失敗，請稍後再試')
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [username, password, login, navigate])

  const isLoading = isSubmitting || authLoading

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        <div className={styles.loginHeader}>
          <h1 className={styles.loginTitle}>透析排程管理系統</h1>
          <p className={styles.loginSubtitle}>Dialysis Scheduling Management</p>
        </div>

        <form className={styles.loginForm} onSubmit={handleSubmit} noValidate>
          {error && (
            <div className={styles.errorAlert} role="alert">
              <span className={styles.errorIcon}>!</span>
              <span>{error}</span>
            </div>
          )}

          <div className={styles.formGroup}>
            <label htmlFor="username" className={styles.formLabel}>
              帳號
            </label>
            <input
              id="username"
              type="text"
              className={styles.formInput}
              value={username}
              onChange={handleUsernameChange}
              placeholder="請輸入帳號"
              autoComplete="username"
              autoFocus
              disabled={isLoading}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.formLabel}>
              密碼
            </label>
            <input
              id="password"
              type="password"
              className={styles.formInput}
              value={password}
              onChange={handlePasswordChange}
              placeholder="請輸入密碼"
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>

          <button
            type="submit"
            className={styles.submitButton}
            disabled={isLoading || !username.trim() || !password}
          >
            {isLoading ? (
              <span className={styles.loadingContent}>
                <span className={styles.spinner} />
                登入中...
              </span>
            ) : (
              '登入'
            )}
          </button>
        </form>

        <div className={styles.loginFooter}>
          <p className={styles.footerText}>
            如忘記密碼，請聯繫系統管理員
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
