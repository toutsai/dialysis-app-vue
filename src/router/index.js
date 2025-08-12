// 檔案路徑: src/router/index.js (放寬例外管理頁面訪問權限)

import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { requiresAuth: false },
  },
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', name: 'Home', redirect: '/schedule' },
      { path: 'schedule', name: 'Schedule', component: () => import('../views/ScheduleView.vue') },
      { path: 'weekly', name: 'Weekly', component: () => import('../views/WeeklyView.vue') },
      {
        path: 'base-schedule',
        name: 'BaseSchedule',
        component: () => import('../views/BaseScheduleView.vue'),
      },
      {
        path: 'exception-manager',
        name: 'ExceptionManager',
        component: () => import('../views/ExceptionManagerView.vue'),
        meta: { requiresAuth: true }, // 所有已登入的使用者都能訪問
      },
      { path: 'patients', name: 'Patients', component: () => import('../views/PatientsView.vue') },
      { path: 'stats', name: 'Stats', component: () => import('../views/StatsView.vue') },
      { path: 'memo', name: 'Memo', component: () => import('../views/MemoView.vue') },
      {
        path: 'reporting',
        name: 'Reporting',
        component: () => import('../views/ReportingView.vue'),
      },
      {
        path: 'user-management',
        name: 'UserManagement',
        component: () => import('../views/UserManagementView.vue'),
        meta: { requiresAdmin: true },
      },
      {
        path: 'lab-reports',
        name: 'LabReports',
        component: () => import('../views/LabReportView.vue'),
        meta: { title: '檢驗報告管理', requiresAuth: true, roles: ['admin', 'editor'] },
      },
      {
        path: 'account-settings',
        name: 'AccountSettings',
        component: () => import('../views/AccountSettingsView.vue'),
      },
      {
        path: '/daily-log',
        name: 'DailyLog',
        component: () => import('../views/DailyLogView.vue'), // 假設您將下面的檔案命名為 DailyLogView.vue
        meta: { requiresAuth: true },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// ✨ --- 核心修正：更新路由守衛 --- ✨
router.beforeEach(async (to, from, next) => {
  // 從最新的 useAuth 中解構出需要的函式和計算屬性
  const { isLoggedIn, isAdmin, waitForAuthInit, currentUser } = useAuth()

  // 等待 Firebase Auth 狀態初始化完成
  await waitForAuthInit()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)

  // 1. 如果路由需要認證，但使用者未登入
  if (requiresAuth && !isLoggedIn.value) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
    // 2. 如果使用者已登入，但試圖訪問登入頁
  } else if (to.name === 'Login' && isLoggedIn.value) {
    next({ name: 'Schedule' }) // 直接導向首頁
    // 3. 如果路由需要管理員權限
  } else if (requiresAdmin) {
    if (isAdmin.value) {
      next() // 有權限，放行
    } else {
      console.warn(`權限不足：用戶角色 (${currentUser.value?.role}) 無法訪問管理員頁面。`)
      next({ name: 'Schedule' }) // 無權限，導向首頁
    }
    // 4. 其他所有情況
  } else {
    next() // 不需要特殊權限，直接放行
  }
})

export default router
