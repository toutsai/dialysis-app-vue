// 檔案路徑: src/router/index.js

import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'
import MainLayout from '@/layouts/MainLayout.vue'

// ✨ 1. 在頂部引入醫師排班相關的元件
import PhysicianScheduleView from '../views/PhysicianScheduleView.vue'

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
      { path: '', name: 'Home', redirect: '/collaboration' },
      {
        path: 'schedule',
        name: 'Schedule',
        component: () => import('../views/ScheduleView.vue'),
        meta: { title: '每日排程表' },
      },
      {
        path: 'weekly',
        name: 'Weekly',
        component: () => import('../views/WeeklyView.vue'),
        meta: { title: '週排班表' },
      },
      {
        path: 'base-schedule',
        name: 'BaseSchedule',
        component: () => import('../views/BaseScheduleView.vue'),
        meta: { title: '門急住床位總表' },
      },
      // ==========================================================
      // ✨ 2. 在這裡新增醫師排班的路由規則 ✨
      // ==========================================================
      {
        path: 'physician-schedule', // 注意：子路由的路徑不需要開頭的 '/'
        component: PhysicianScheduleView,
        redirect: '/physician-schedule/rounding', // 預設打開查房頁籤
        meta: { title: '醫師排班', roles: ['admin', 'contributor'] },
        children: [
          {
            // 當 URL 是 /physician-schedule/rounding 時，
            // RoundingSchedule 元件會被渲染到 PhysicianScheduleView 的 <router-view> 中
            path: 'rounding',
            name: 'PhysicianRoundingSchedule',
            // 我們可以直接在這裡建立一個空的元件，未來再把查房班表的邏輯放進去
            // 為了讓它現在就能運作，我們先指向父元件本身
            component: PhysicianScheduleView,
            meta: { title: '查房班表' },
          },
          {
            // 預留未來會診班表的路由
            path: 'consultation',
            name: 'PhysicianConsultationSchedule',
            component: () => import('../views/PlaceholderView.vue'), // 建議建立一個預留位置元件
            meta: { title: '會診班表' },
          },
        ],
      },
      // ==========================================================
      {
        path: 'exception-manager',
        name: 'ExceptionManager',
        component: () => import('../views/ExceptionManagerView.vue'),
        meta: { title: '調班管理', requiresAuth: true },
      },
      {
        path: 'patients',
        name: 'Patients',
        component: () => import('../views/PatientsView.vue'),
        meta: { title: '病人管理' },
      },
      {
        path: 'stats',
        name: 'Stats',
        component: () => import('../views/StatsView.vue'),
        meta: { title: '護理分組檢視' },
      },
      {
        path: 'memo',
        name: 'Memo',
        component: () => import('../views/MemoView.vue'),
        meta: { title: '交班備忘錄' },
      },
      {
        path: 'reporting',
        name: 'Reporting',
        component: () => import('../views/ReportingView.vue'),
        meta: { title: '統計報表' },
      },
      {
        path: 'user-management',
        name: 'UserManagement',
        component: () => import('../views/UserManagementView.vue'),
        meta: { title: '使用者管理', requiresAdmin: true },
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
        meta: { title: '帳號設定' },
      },
      {
        path: 'daily-log', // ✨ 修正：子路由的路徑應該是相對路徑
        name: 'DailyLog',
        component: () => import('../views/DailyLogView.vue'),
        meta: { title: '工作日誌', requiresAuth: true },
      },
      {
        path: 'collaboration', // ✨ 修正：子路由的路徑應該是相對路徑
        name: 'Collaboration',
        component: () => import('../views/CollaborationView.vue'),
        meta: { title: '協作訊息中心', requiresAuth: true },
      },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 路由守衛保持不變
router.beforeEach(async (to, from, next) => {
  const { isLoggedIn, isAdmin, waitForAuthInit, currentUser } = useAuth()
  await waitForAuthInit()

  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)

  // 檢查特定角色權限
  const requiredRoles = to.matched.flatMap((record) => record.meta.roles || [])

  if (requiresAuth && !isLoggedIn.value) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && isLoggedIn.value) {
    next({ name: 'Collaboration' })
  } else if (requiresAdmin && !isAdmin.value) {
    console.warn(`權限不足：用戶角色 (${currentUser.value?.role}) 無法訪問管理員頁面。`)
    next({ name: 'Schedule' })
  } else if (requiredRoles.length > 0 && !requiredRoles.includes(currentUser.value?.role)) {
    console.warn(`權限不足：用戶角色 (${currentUser.value?.role}) 無法訪問此頁面。`)
    next({ name: 'Schedule' }) // 或導向一個 '權限不足' 的頁面
  } else {
    next()
  }
})

export default router
