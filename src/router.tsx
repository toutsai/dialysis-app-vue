// src/router.tsx
import React, { Suspense } from 'react'
import {
  createBrowserRouter,
  Navigate,
  Outlet,
  useLocation,
  type RouteObject,
} from 'react-router-dom'
import { useAuthStore } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Lazy-loaded page components
// ---------------------------------------------------------------------------
const LoginPage = React.lazy(() => import('@/pages/LoginPage'))
const MainLayout = React.lazy(() => import('@/layouts/MainLayout'))

const SchedulePage = React.lazy(() => import('@/pages/SchedulePage'))
const WeeklyPage = React.lazy(() => import('@/pages/WeeklyPage'))
const BaseSchedulePage = React.lazy(() => import('@/pages/BaseSchedulePage'))
const PhysicianSchedulePage = React.lazy(() => import('@/pages/PhysicianSchedulePage'))
const ExceptionManagerPage = React.lazy(() => import('@/pages/ExceptionManagerPage'))
const UpdateSchedulerPage = React.lazy(() => import('@/pages/UpdateSchedulerPage'))
const PatientsPage = React.lazy(() => import('@/pages/PatientsPage'))
const StatsPage = React.lazy(() => import('@/pages/StatsPage'))
const MemoPage = React.lazy(() => import('@/pages/MemoPage'))
const ReportingPage = React.lazy(() => import('@/pages/ReportingPage'))
const UserManagementPage = React.lazy(() => import('@/pages/UserManagementPage'))
const LabReportPage = React.lazy(() => import('@/pages/LabReportPage'))
const InventoryPage = React.lazy(() => import('@/pages/InventoryPage'))
const AccountSettingsPage = React.lazy(() => import('@/pages/AccountSettingsPage'))
const DailyLogPage = React.lazy(() => import('@/pages/DailyLogPage'))
const CollaborationPage = React.lazy(() => import('@/pages/CollaborationPage'))
const OrdersPage = React.lazy(() => import('@/pages/OrdersPage'))
const MyPatientsPage = React.lazy(() => import('@/pages/MyPatientsPage'))
const NursingSchedulePage = React.lazy(() => import('@/pages/NursingSchedulePage'))
const PatientMovementReportPage = React.lazy(
  () => import('@/pages/PatientMovementReportPage'),
)
const UsageGuidePage = React.lazy(() => import('@/pages/UsageGuidePage'))

// ---------------------------------------------------------------------------
// Route handle metadata type
// ---------------------------------------------------------------------------
export interface RouteHandleMeta {
  title?: string
  requiresAuth?: boolean
  requiresAdmin?: boolean
  roles?: string[]
}

// ---------------------------------------------------------------------------
// Loading fallback used inside Suspense boundaries
// ---------------------------------------------------------------------------
function PageLoadingFallback() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100%',
        minHeight: '200px',
        fontSize: '1rem',
        color: '#888',
      }}
    >
      頁面載入中...
    </div>
  )
}

// ---------------------------------------------------------------------------
// ProtectedRoute – guards authenticated / role-gated routes
// ---------------------------------------------------------------------------
function ProtectedRoute() {
  const currentUser = useAuthStore((s) => s.currentUser)
  const authLoading = useAuthStore((s) => s.authLoading)
  const location = useLocation()

  // While Firebase auth state is still being resolved, show a loader
  if (authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '1.1rem',
          color: '#666',
        }}
      >
        驗證身分中...
      </div>
    )
  }

  // Not logged in -> redirect to /login and remember where they were going
  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Render the child routes inside a Suspense boundary
  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// AdminRoute – additionally requires admin role
// ---------------------------------------------------------------------------
function AdminRoute() {
  const currentUser = useAuthStore((s) => s.currentUser)

  if (!currentUser || currentUser.role !== 'admin') {
    return <Navigate to="/collaboration" replace />
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// RoleRoute – requires one of the allowed roles
// ---------------------------------------------------------------------------
function RoleRoute({ roles }: { roles: string[] }) {
  const currentUser = useAuthStore((s) => s.currentUser)

  if (!currentUser || !roles.includes(currentUser.role)) {
    return <Navigate to="/collaboration" replace />
  }

  return (
    <Suspense fallback={<PageLoadingFallback />}>
      <Outlet />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// Route definitions
// ---------------------------------------------------------------------------
const routes: RouteObject[] = [
  // Public route – login
  {
    path: '/login',
    element: (
      <Suspense fallback={<PageLoadingFallback />}>
        <LoginPage />
      </Suspense>
    ),
    handle: {
      title: '登入',
      requiresAuth: false,
    } satisfies RouteHandleMeta,
  },

  // Authenticated routes wrapped by ProtectedRoute -> MainLayout
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: (
          <Suspense fallback={<PageLoadingFallback />}>
            <MainLayout />
          </Suspense>
        ),
        children: [
          // Index redirect
          {
            index: true,
            element: <Navigate to="/collaboration" replace />,
          },

          // --- Core schedule routes ---
          {
            path: 'schedule',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <SchedulePage />
              </Suspense>
            ),
            handle: {
              title: '每日排程表',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
          {
            path: 'weekly',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <WeeklyPage />
              </Suspense>
            ),
            handle: {
              title: '週排班表',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
          {
            path: 'base-schedule',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <BaseSchedulePage />
              </Suspense>
            ),
            handle: {
              title: '門急住床位總表',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
          {
            path: 'physician-schedule',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <PhysicianSchedulePage />
              </Suspense>
            ),
            handle: {
              title: '醫師排班',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
          {
            path: 'exception-manager',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <ExceptionManagerPage />
              </Suspense>
            ),
            handle: {
              title: '調班管理',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
          {
            path: 'update-scheduler',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <UpdateSchedulerPage />
              </Suspense>
            ),
            handle: {
              title: '預約變更總覽',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Patient management ---
          {
            path: 'patients',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <PatientsPage />
              </Suspense>
            ),
            handle: {
              title: '病人管理',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Stats / nursing ---
          {
            path: 'stats',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <StatsPage />
              </Suspense>
            ),
            handle: {
              title: '護理分組檢視',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Memo ---
          {
            path: 'memo',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <MemoPage />
              </Suspense>
            ),
            handle: {
              title: '交班備忘錄',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Reporting ---
          {
            path: 'reporting',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <ReportingPage />
              </Suspense>
            ),
            handle: {
              title: '統計報表',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Admin only: user management ---
          {
            path: 'user-management',
            element: <AdminRoute />,
            handle: {
              title: '使用者管理',
              requiresAuth: true,
              requiresAdmin: true,
              roles: ['admin'],
            } satisfies RouteHandleMeta,
            children: [
              {
                index: true,
                element: (
                  <Suspense fallback={<PageLoadingFallback />}>
                    <UserManagementPage />
                  </Suspense>
                ),
              },
            ],
          },

          // --- Lab reports ---
          {
            path: 'lab-reports',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <LabReportPage />
              </Suspense>
            ),
            handle: {
              title: '檢驗報告管理',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Inventory ---
          {
            path: 'inventory',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <InventoryPage />
              </Suspense>
            ),
            handle: {
              title: '庫存管理',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Account settings ---
          {
            path: 'account-settings',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <AccountSettingsPage />
              </Suspense>
            ),
            handle: {
              title: '帳號設定',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Daily log ---
          {
            path: 'daily-log',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <DailyLogPage />
              </Suspense>
            ),
            handle: {
              title: '工作日誌',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Collaboration ---
          {
            path: 'collaboration',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <CollaborationPage />
              </Suspense>
            ),
            handle: {
              title: '協作訊息中心',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Orders ---
          {
            path: 'orders',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <OrdersPage />
              </Suspense>
            ),
            handle: {
              title: '藥囑管理',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- My patients ---
          {
            path: 'my-patients',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <MyPatientsPage />
              </Suspense>
            ),
            handle: {
              title: '我的今日病人',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Nursing schedule ---
          {
            path: 'nursing-schedule',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <NursingSchedulePage />
              </Suspense>
            ),
            handle: {
              title: '護理班表與職責',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- KiDit report ---
          {
            path: 'kidit-report',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <PatientMovementReportPage />
              </Suspense>
            ),
            handle: {
              title: 'KiDit 申報工作站',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },

          // --- Usage guide ---
          {
            path: 'usage-guide',
            element: (
              <Suspense fallback={<PageLoadingFallback />}>
                <UsageGuidePage />
              </Suspense>
            ),
            handle: {
              title: '平台使用說明',
              requiresAuth: true,
            } satisfies RouteHandleMeta,
          },
        ],
      },
    ],
  },

  // Catch-all: redirect unknown paths to root
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
]

// ---------------------------------------------------------------------------
// Create and export the browser router
// ---------------------------------------------------------------------------
const router = createBrowserRouter(routes)

export default router
