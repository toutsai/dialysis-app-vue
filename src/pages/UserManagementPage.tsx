// src/pages/UserManagementPage.tsx
// Scaffold - Admin user management

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import styles from './UserManagementPage.module.css'

interface ManagedUser {
  id: string
  uid: string
  username: string
  name: string
  role: string
  title: string
  email: string
  isActive: boolean
  lastLogin: string
  [key: string]: unknown
}

const ROLE_OPTIONS = [
  { value: 'viewer', label: '檢視者' },
  { value: 'contributor', label: '編輯者' },
  { value: 'editor', label: '管理者' },
  { value: 'admin', label: '系統管理員' },
]

const UserManagementPage: React.FC = () => {
  const { currentUser, isAdmin } = useAuth()

  const [users, setUsers] = useState<ManagedUser[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [selectedUser, setSelectedUser] = useState<ManagedUser | null>(null)

  // TODO: Fetch users list from Cloud Function
  useEffect(() => {
    setIsLoading(true)
    // Placeholder: fetch all users
    setIsLoading(false)
  }, [])

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value)
  }, [])

  const handleEditUser = useCallback((user: ManagedUser) => {
    setSelectedUser(user)
  }, [])

  if (!isAdmin) {
    return (
      <div className={styles.pageContainer}>
        <h1 className={styles.pageTitle}>使用者管理</h1>
        <div className={styles.accessDenied}>
          <p>您沒有權限存取此頁面</p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.pageContainer}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>使用者管理</h1>
        <button
          className={styles.createButton}
          onClick={() => setShowCreateDialog(true)}
        >
          + 新增使用者
        </button>
      </div>

      <div className={styles.toolbar}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="搜尋姓名或帳號..."
          value={searchText}
          onChange={handleSearchChange}
        />
        <span className={styles.userCount}>
          共 {users.length} 位使用者
        </span>
      </div>

      {isLoading && (
        <div className={styles.loadingOverlay}>載入中...</div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.userTable}>
          <thead>
            <tr>
              <th>帳號</th>
              <th>姓名</th>
              <th>職稱</th>
              <th>角色</th>
              <th>Email</th>
              <th>狀態</th>
              <th>最後登入</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>
                  尚無使用者資料
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className={styles.userRow}>
                  <td className={styles.usernameCell}>{user.username}</td>
                  <td>{user.name}</td>
                  <td>{user.title || '-'}</td>
                  <td>
                    <span className={styles.roleBadge}>{user.role}</span>
                  </td>
                  <td>{user.email || '-'}</td>
                  <td>
                    <span className={`${styles.statusDot} ${user.isActive ? styles.active : styles.inactive}`} />
                    {user.isActive ? '啟用' : '停用'}
                  </td>
                  <td>{user.lastLogin || '-'}</td>
                  <td>
                    <button
                      className={styles.editButton}
                      onClick={() => handleEditUser(user)}
                    >
                      編輯
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* TODO: Create/Edit user dialog */}
    </div>
  )
}

export default UserManagementPage
