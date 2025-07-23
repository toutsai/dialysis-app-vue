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
        // ✨ --- 權限修改 --- ✨
        // 移除 roles 元數據，讓所有已登入的使用者都能訪問
        meta: { requiresAuth: true },
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
        path: 'account-settings',
        name: 'AccountSettings',
        component: () => import('../views/AccountSettingsView.vue'),
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 路由守衛保持不變，它會正確處理這個修改
router.beforeEach(async (to, from, next) => {
  const { isLoggedIn, isAdmin, userRole, checkAuthState } = useAuth()

  await checkAuthState()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiredRoles = to.matched.flatMap((record) => record.meta.roles || [])
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)

  if (requiresAuth && !isLoggedIn.value) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && isLoggedIn.value) {
    next({ name: 'Schedule' })
  } else if (requiresAdmin || requiredRoles.length > 0) {
    if (isLoggedIn.value) {
      const hasRequiredRole = requiresAdmin ? isAdmin.value : requiredRoles.includes(userRole.value)

      if (hasRequiredRole) {
        next()
      } else {
        console.warn(`權限不足：用戶角色 (${userRole.value}) 無法訪問。`)
        next({ name: 'Schedule' })
      }
    } else {
      next({ name: 'Login' })
    }
  } else {
    next()
  }
})

export default router
