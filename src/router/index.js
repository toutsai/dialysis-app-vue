import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import MainLayout from '@/layouts/MainLayout.vue'

const routes = [
  // 公共路由，不需要佈局
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
  },

  // 受保護的路由，全部使用 MainLayout 作為佈局
  {
    path: '/',
    component: MainLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '', // 預設子路由 (訪問 '/' 時)
        name: 'Home',
        redirect: '/schedule', // <-- 已確保訪問根路徑時跳轉到每日排程
      },
      {
        path: 'schedule',
        name: 'Schedule', // <-- 這是我們的目標首頁
        component: () => import('../views/ScheduleView.vue'),
      },
      {
        path: 'weekly',
        name: 'Weekly',
        component: () => import('../views/WeeklyView.vue'),
      },
      {
        path: 'base-schedule',
        name: 'BaseSchedule',
        component: () => import('../views/BaseScheduleView.vue'),
      },
      {
        path: 'patients',
        name: 'Patients',
        component: () => import('../views/PatientsView.vue'),
      },
      {
        path: 'stats',
        name: 'Stats',
        component: () => import('../views/StatsView.vue'),
      },
      {
        path: 'memo',
        name: 'Memo',
        component: () => import('../views/MemoView.vue'),
      },
      {
        path: 'reporting',
        name: 'Reporting',
        component: () => import('../views/ReportingView.vue'),
      },
      {
        path: 'user-management',
        name: 'UserManagement',
        component: () => import('../views/UserManagementView.vue'),
        meta: { requiresAuth: true, requiresAdmin: true },
      },
      {
        path: 'account-settings',
        name: 'AccountSettings',
        component: () => import('../views/AccountSettingsView.vue'),
      },
    ],
  },
  // 如果有其他路由匹配不到，可以加一個 404 頁面
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 【核心修改】: 將所有路由守衛邏輯合併到一個 beforeEach 中，並統一跳轉目標
router.beforeEach((to, from, next) => {
  const { isLoggedIn, isAdmin } = useAuth()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)

  // 情況 1: 訪問需要登入的頁面，但用戶未登入
  if (requiresAuth && !isLoggedIn.value) {
    next({ name: 'Login' })
  }
  // 情況 2: 已登入，但試圖訪問登入頁面
  else if (to.name === 'Login' && isLoggedIn.value) {
    // 【修改點】將已登入的用戶從登入頁導向每日排程表
    next({ name: 'Schedule' })
  }
  // 情況 3: 訪問需要管理員權限的頁面，但用戶不是管理員
  else if (requiresAdmin && !isAdmin.value) {
    // 【修改點】將非管理員用戶從管理頁面導向每日排程表
    console.warn('權限不足：嘗試訪問管理員頁面。')
    next({ name: 'Schedule' })
  }
  // 情況 4: 所有權限檢查通過，正常放行
  else {
    next()
  }
})

export default router
