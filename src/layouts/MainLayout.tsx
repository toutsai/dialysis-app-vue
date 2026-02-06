// src/layouts/MainLayout.tsx
// Main dashboard layout with sidebar navigation + content area.
// Ported from Vue MainLayout.vue to React + TypeScript.

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type ReactNode,
} from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth, db } from '@/firebase'
import { useAuthStore } from '@/hooks/useAuth'
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  limit,
  type Unsubscribe,
  Timestamp,
} from 'firebase/firestore'
import styles from '@/layouts/MainLayout.module.css'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RealtimeNotification {
  id: string
  message: string
  icon: string
  timestamp: Date
  route?: string
}

interface MainLayoutContextValue {
  patientWithMemoIds: string[]
  showPatientMemos: (patientId: string) => void
}

// ---------------------------------------------------------------------------
// Context for child pages to access memo-related data
// ---------------------------------------------------------------------------
const MainLayoutContext = createContext<MainLayoutContextValue>({
  patientWithMemoIds: [],
  showPatientMemos: () => {},
})

export function useMainLayoutContext() {
  return useContext(MainLayoutContext)
}

// ---------------------------------------------------------------------------
// Role / permission helpers
// ---------------------------------------------------------------------------
type UserRole = 'admin' | 'editor' | 'contributor' | 'viewer'

function hasRole(userRole: string | undefined, allowed: UserRole[]): boolean {
  if (!userRole) return false
  return allowed.includes(userRole as UserRole)
}

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------
function getEnvironment(): string {
  const env = import.meta.env.VITE_APP_ENV || 'development'
  return env
}

function getEnvironmentLabel(env: string): string {
  switch (env) {
    case 'production':
      return '正式環境'
    case 'development':
      return '開發環境'
    case 'emulator':
      return '模擬器'
    default:
      return env
  }
}

// ---------------------------------------------------------------------------
// Role display label
// ---------------------------------------------------------------------------
function getRoleLabel(role: string | undefined): string {
  switch (role) {
    case 'admin':
      return '管理員'
    case 'editor':
      return '編輯者'
    case 'contributor':
      return '貢獻者'
    case 'viewer':
      return '檢視者'
    default:
      return role || '未知'
  }
}

// ---------------------------------------------------------------------------
// Custom hook: useRealtimeNotifications
// ---------------------------------------------------------------------------
function useRealtimeNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([])

  useEffect(() => {
    if (!userId) {
      setNotifications([])
      return
    }

    let unsubscribe: Unsubscribe | undefined

    try {
      const notifRef = collection(db, 'notifications')
      const q = query(
        notifRef,
        where('targetUserId', '==', userId),
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(10),
      )

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const items: RealtimeNotification[] = snapshot.docs.map((docSnap) => {
            const data = docSnap.data()
            const createdAt = data.createdAt instanceof Timestamp
              ? data.createdAt.toDate()
              : new Date()
            return {
              id: docSnap.id,
              message: data.message || '',
              icon: data.icon || '\u{1F514}',
              timestamp: createdAt,
              route: data.route,
            }
          })
          setNotifications(items)
        },
        (error) => {
          console.warn('[MainLayout] Notifications listener error:', error)
          setNotifications([])
        },
      )
    } catch (err) {
      console.warn('[MainLayout] Failed to set up notifications listener:', err)
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [userId])

  return notifications
}

// ---------------------------------------------------------------------------
// Custom hook: useConflictCount
// ---------------------------------------------------------------------------
function useConflictCount() {
  const [conflictCount, setConflictCount] = useState(0)

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined

    try {
      const conflictsRef = collection(db, 'schedule_conflicts')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const q = query(
        conflictsRef,
        where('resolved', '==', false),
        where('date', '>=', today.toISOString().slice(0, 10)),
      )

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setConflictCount(snapshot.size)
        },
        (error) => {
          console.warn('[MainLayout] Conflict count listener error:', error)
          setConflictCount(0)
        },
      )
    } catch (err) {
      console.warn('[MainLayout] Failed to set up conflict listener:', err)
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return conflictCount
}

// ---------------------------------------------------------------------------
// Custom hook: useActiveMemos
// ---------------------------------------------------------------------------
function useActiveMemos() {
  const [activeMemoCount, setActiveMemoCount] = useState(0)
  const [patientWithMemoIds, setPatientWithMemoIds] = useState<string[]>([])

  useEffect(() => {
    let unsubscribe: Unsubscribe | undefined

    try {
      const memosRef = collection(db, 'memos')
      const q = query(memosRef, where('isActive', '==', true))

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          setActiveMemoCount(snapshot.size)
          const patientIds = new Set<string>()
          snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data()
            if (data.patientId) {
              patientIds.add(data.patientId as string)
            }
          })
          setPatientWithMemoIds(Array.from(patientIds))
        },
        (error) => {
          console.warn('[MainLayout] Active memos listener error:', error)
          setActiveMemoCount(0)
          setPatientWithMemoIds([])
        },
      )
    } catch (err) {
      console.warn('[MainLayout] Failed to set up memos listener:', err)
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [])

  return { activeMemoCount, patientWithMemoIds }
}

// ---------------------------------------------------------------------------
// Custom hook: useUnreadCollaborationCount
// ---------------------------------------------------------------------------
function useUnreadCollaborationCount(userId: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0)
      return
    }

    let unsubscribe: Unsubscribe | undefined

    try {
      const messagesRef = collection(db, 'collaboration_messages')
      const q = query(
        messagesRef,
        where('read', '==', false),
        orderBy('createdAt', 'desc'),
        limit(100),
      )

      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const count = snapshot.docs.filter((docSnap) => {
            const data = docSnap.data()
            return data.authorId !== userId
          }).length
          setUnreadCount(count)
        },
        (error) => {
          console.warn('[MainLayout] Collaboration count listener error:', error)
          setUnreadCount(0)
        },
      )
    } catch (err) {
      console.warn('[MainLayout] Failed to set up collaboration listener:', err)
    }

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [userId])

  return unreadCount
}

// ---------------------------------------------------------------------------
// Time formatter for notifications
// ---------------------------------------------------------------------------
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60) return '剛剛'
  if (diff < 3600) return `${Math.floor(diff / 60)} 分鐘前`
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小時前`
  return `${Math.floor(diff / 86400)} 天前`
}

// ---------------------------------------------------------------------------
// MainLayout Component
// ---------------------------------------------------------------------------
export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const currentUser = useAuthStore((s) => s.currentUser)
  const userRole = currentUser?.role

  // Mobile sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Management section collapsed state
  const [managementExpanded, setManagementExpanded] = useState(false)

  // Real-time data hooks
  const notifications = useRealtimeNotifications(currentUser?.uid)
  const conflictCount = useConflictCount()
  const { activeMemoCount, patientWithMemoIds } = useActiveMemos()
  const unreadCollaborationCount = useUnreadCollaborationCount(currentUser?.uid)

  const environment = useMemo(() => getEnvironment(), [])
  const environmentLabel = useMemo(() => getEnvironmentLabel(environment), [environment])

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Close sidebar on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && sidebarOpen) {
        setSidebarOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sidebarOpen])

  // Logout handler
  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth)
      navigate('/login', { replace: true })
    } catch (error) {
      console.error('[MainLayout] Logout error:', error)
    }
  }, [navigate])

  // Navigate to a page from notification click
  const handleNotificationClick = useCallback(
    (notification: RealtimeNotification) => {
      if (notification.route) {
        navigate(notification.route)
      }
    },
    [navigate],
  )

  // Toggle management section
  const toggleManagement = useCallback(() => {
    setManagementExpanded((prev) => !prev)
  }, [])

  // Toggle mobile sidebar
  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
  }, [])

  // Close overlay
  const closeSidebar = useCallback(() => {
    setSidebarOpen(false)
  }, [])

  // Show patient memos (context method for child pages)
  const showPatientMemos = useCallback(
    (patientId: string) => {
      navigate(`/memo?patientId=${patientId}`)
    },
    [navigate],
  )

  // NavLink class builder
  const buildNavLinkClass = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      `${styles.navLink}${isActive ? ` ${styles.active}` : ''}`,
    [],
  )

  // Permission checks
  const isAdmin = userRole === 'admin'
  const isAdminOrEditor = hasRole(userRole, ['admin', 'editor'])
  const canViewPatients = hasRole(userRole, ['admin', 'editor', 'contributor'])
  const canViewInventory = hasRole(userRole, ['admin', 'editor'])
  const canViewOrders = hasRole(userRole, ['admin', 'editor'])
  const canViewLabReports = hasRole(userRole, ['admin', 'editor', 'contributor'])
  const canViewReporting = hasRole(userRole, ['admin', 'editor'])
  const canViewKidit = hasRole(userRole, ['admin', 'editor'])
  const canViewNursingSchedule = hasRole(userRole, ['admin', 'editor', 'contributor'])

  // Context value
  const contextValue = useMemo<MainLayoutContextValue>(
    () => ({
      patientWithMemoIds,
      showPatientMemos,
    }),
    [patientWithMemoIds, showPatientMemos],
  )

  return (
    <MainLayoutContext.Provider value={contextValue}>
      <div className={styles.dashboardContainer}>
        {/* ----- Mobile overlay ----- */}
        <div
          className={`${styles.sidebarOverlay}${sidebarOpen ? ` ${styles.visible}` : ''}`}
          onClick={closeSidebar}
          aria-hidden="true"
        />

        {/* ----- Sidebar ----- */}
        <aside
          className={`${styles.sidebar}${sidebarOpen ? ` ${styles.open}` : ''}`}
          id="app-sidebar"
        >
          {/* Sidebar header */}
          <div className={styles.sidebarHeader}>
            <h1 className={styles.platformTitle}>部北透析管理平台</h1>
            <div className={`${styles.environmentTag} ${styles[environment] || ''}`}>
              {environmentLabel}
            </div>
          </div>

          {/* Main navigation */}
          <nav className={styles.mainNavSection}>
            <ul className={styles.sidebarNav}>
              {/* -- Core navigation links -- */}
              <li>
                <NavLink to="/schedule" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128197;</span>
                  <span className={styles.navLinkText}>每日排程</span>
                </NavLink>
              </li>

              <li>
                <NavLink to="/stats" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128101;</span>
                  <span className={styles.navLinkText}>護理分組</span>
                </NavLink>
              </li>

              <li>
                <NavLink to="/my-patients" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128203;</span>
                  <span className={styles.navLinkText}>我的今日病人</span>
                </NavLink>
              </li>

              {/* -- Admin/Editor conditional links -- */}
              {isAdminOrEditor && (
                <>
                  <li className={styles.navSeparator} />
                  <li>
                    <NavLink to="/weekly" className={buildNavLinkClass}>
                      <span className={styles.navLinkIcon}>&#128467;</span>
                      <span className={styles.navLinkText}>週排班</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/base-schedule" className={buildNavLinkClass}>
                      <span className={styles.navLinkIcon}>&#127959;</span>
                      <span className={styles.navLinkText}>床位總表</span>
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/exception-manager" className={buildNavLinkClass}>
                      <span className={styles.navLinkIcon}>&#128260;</span>
                      <span className={styles.navLinkText}>調班換床</span>
                      {conflictCount > 0 && (
                        <span className={`${styles.alertBadge} ${styles.badgeAnimated}`}>
                          {conflictCount}
                        </span>
                      )}
                    </NavLink>
                  </li>
                  <li>
                    <NavLink to="/update-scheduler" className={buildNavLinkClass}>
                      <span className={styles.navLinkIcon}>&#128338;</span>
                      <span className={styles.navLinkText}>預約變更</span>
                    </NavLink>
                  </li>
                </>
              )}

              {/* -- Patient list (admin/editor/contributor) -- */}
              {canViewPatients && (
                <>
                  <li className={styles.navSeparator} />
                  <li>
                    <NavLink to="/patients" className={buildNavLinkClass}>
                      <span className={styles.navLinkIcon}>&#128100;</span>
                      <span className={styles.navLinkText}>病人清單</span>
                    </NavLink>
                  </li>
                </>
              )}

              {/* -- Collaboration with notification badge -- */}
              <li className={styles.navSeparator} />
              <li>
                <NavLink to="/collaboration" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128172;</span>
                  <span className={styles.navLinkText}>訊息中心</span>
                  {unreadCollaborationCount > 0 && (
                    <span className={`${styles.notificationBadge} ${styles.badgeAnimated}`}>
                      {unreadCollaborationCount > 99 ? '99+' : unreadCollaborationCount}
                    </span>
                  )}
                </NavLink>
              </li>

              {/* -- Memo link with active memo count -- */}
              <li>
                <NavLink to="/memo" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128221;</span>
                  <span className={styles.navLinkText}>交班備忘錄</span>
                  {activeMemoCount > 0 && (
                    <span className={`${styles.alertBadge} ${styles.badgeAnimated}`}>
                      {activeMemoCount}
                    </span>
                  )}
                </NavLink>
              </li>
            </ul>
          </nav>

          {/* Real-time notification area */}
          <div className={styles.notificationArea}>
            <div className={styles.notificationAreaTitle}>即時通知</div>
            {notifications.length === 0 ? (
              <div className={styles.notificationEmpty}>目前沒有新通知</div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  className={styles.notificationItem}
                  onClick={() => handleNotificationClick(notif)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleNotificationClick(notif)
                    }
                  }}
                >
                  <span className={styles.notificationItemIcon}>{notif.icon}</span>
                  <div className={styles.notificationContent}>
                    <div className={styles.notificationMessage}>{notif.message}</div>
                    <div className={styles.notificationTime}>
                      {formatRelativeTime(notif.timestamp)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Management section (collapsible) */}
          <div className={styles.managementSection}>
            <div
              className={styles.sectionTitle}
              onClick={toggleManagement}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') toggleManagement()
              }}
            >
              <span>管理功能</span>
              <span
                className={`${styles.sectionToggleIcon}${managementExpanded ? ` ${styles.expanded}` : ''}`}
              >
                &#9660;
              </span>
            </div>
            <ul
              className={`${styles.managementLinks}${managementExpanded ? ` ${styles.expanded}` : ` ${styles.collapsed}`}`}
            >
              {/* Daily log - all roles */}
              <li>
                <NavLink to="/daily-log" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#128214;</span>
                  <span className={styles.navLinkText}>工作日誌</span>
                </NavLink>
              </li>

              {/* Nursing schedule - admin/editor/contributor */}
              {canViewNursingSchedule && (
                <li>
                  <NavLink to="/nursing-schedule" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128467;</span>
                    <span className={styles.navLinkText}>護理班表與職責</span>
                  </NavLink>
                </li>
              )}

              {/* KiDit report - admin/editor */}
              {canViewKidit && (
                <li>
                  <NavLink to="/kidit-report" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128200;</span>
                    <span className={styles.navLinkText}>KiDit申報</span>
                  </NavLink>
                </li>
              )}

              {/* Physician schedule - admin/editor */}
              {isAdminOrEditor && (
                <li>
                  <NavLink to="/physician-schedule" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#129658;</span>
                    <span className={styles.navLinkText}>醫師班表</span>
                  </NavLink>
                </li>
              )}

              {/* Lab reports - admin/editor/contributor */}
              {canViewLabReports && (
                <li>
                  <NavLink to="/lab-reports" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128300;</span>
                    <span className={styles.navLinkText}>檢驗報告</span>
                  </NavLink>
                </li>
              )}

              {/* Inventory - admin/editor */}
              {canViewInventory && (
                <li>
                  <NavLink to="/inventory" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128230;</span>
                    <span className={styles.navLinkText}>庫存管理</span>
                  </NavLink>
                </li>
              )}

              {/* Orders - admin/editor */}
              {canViewOrders && (
                <li>
                  <NavLink to="/orders" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128138;</span>
                    <span className={styles.navLinkText}>藥囑管理</span>
                  </NavLink>
                </li>
              )}

              {/* Reporting - admin/editor */}
              {canViewReporting && (
                <li>
                  <NavLink to="/reporting" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#128202;</span>
                    <span className={styles.navLinkText}>統計報表</span>
                  </NavLink>
                </li>
              )}

              {/* User management - admin only */}
              {isAdmin && (
                <li>
                  <NavLink to="/user-management" className={buildNavLinkClass}>
                    <span className={styles.navLinkIcon}>&#9881;</span>
                    <span className={styles.navLinkText}>使用者管理</span>
                  </NavLink>
                </li>
              )}

              {/* Usage guide - all roles */}
              <li>
                <NavLink to="/usage-guide" className={buildNavLinkClass}>
                  <span className={styles.navLinkIcon}>&#10067;</span>
                  <span className={styles.navLinkText}>使用說明</span>
                </NavLink>
              </li>
            </ul>
          </div>

          {/* Footer: user info + buttons */}
          <div className={styles.navFooter}>
            <div className={styles.userInfo}>
              <p className={styles.userName}>
                <span className={styles.onlineStatusDot} />
                {currentUser?.name || '使用者'}
              </p>
              <p className={styles.userRole}>{getRoleLabel(userRole)}</p>
            </div>
            <div className={styles.buttonGroup}>
              <NavLink to="/account-settings" className={styles.changePasswordBtn}>
                帳號設定
              </NavLink>
              <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
                登出
              </button>
            </div>
          </div>
        </aside>

        {/* ----- Main content area ----- */}
        <div className={styles.contentArea}>
          {/* Mobile header */}
          <header className={styles.mainHeader}>
            <button
              type="button"
              className={styles.sidebarToggle}
              onClick={toggleSidebar}
              aria-label="切換選單"
            >
              &#9776;
            </button>
            <h2 className={styles.mainHeaderTitle}>部北透析管理平台</h2>
            <div style={{ width: 36 }} /> {/* spacer for centering */}
          </header>

          {/* Page content rendered via Outlet */}
          <div className={styles.contentWrapper}>
            <Outlet />
          </div>
        </div>
      </div>
    </MainLayoutContext.Provider>
  )
}
