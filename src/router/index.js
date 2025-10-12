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
      {
        path: 'physician-schedule',
        component: PhysicianScheduleView,
        redirect: '/physician-schedule/rounding',
        meta: { title: '醫師排班', roles: ['admin', 'contributor'] },
        children: [
          {
            path: 'rounding',
            name: 'PhysicianRoundingSchedule',
            component: PhysicianScheduleView,
            meta: { title: '查房班表' },
          },
        ],
      },
      {
        path: 'exception-manager',
        name: 'ExceptionManager',
        component: () => import('../views/ExceptionManagerView.vue'),
        meta: { title: '調班管理', requiresAuth: true },
      },
      {
        path: 'update-scheduler', // 頁面網址
        name: 'UpdateScheduler', // 路由名稱
        component: () => import('../views/UpdateSchedulerView.vue'), // 指向新檔案
        meta: {
          title: '預約變更總覽',
          requiresAuth: true,
          // 根據您的需求，可以限制只有特定角色能看
          // roles: ['admin', 'editor'],
        },
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
      // ==========================================================
      // ✨✨✨ 核心修正 ✨✨✨
      // 移除 roles 屬性，這樣路由守衛就不會進行角色檢查，
      // 只會檢查 requiresAuth，確保用戶已登入即可。
      // ==========================================================
      {
        path: 'lab-reports',
        name: 'LabReports',
        component: () => import('../views/LabReportView.vue'),
        meta: { title: '檢驗報告管理', requiresAuth: true }, // <-- 移除 roles: ['admin', 'editor']
      },
      {
        path: 'consumables', // 頁面網址
        name: 'Consumables', // 路由名稱
        component: () => import('../views/ConsumablesView.vue'), // 指向您剛才建立的檔案
        meta: { title: '每月耗材總表', requiresAuth: true }, // 設定頁面標題和權限
      },
      {
        path: 'account-settings',
        name: 'AccountSettings',
        component: () => import('../views/AccountSettingsView.vue'),
        meta: { title: '帳號設定' },
      },
      {
        path: 'daily-log',
        name: 'DailyLog',
        component: () => import('../views/DailyLogView.vue'),
        meta: { title: '工作日誌', requiresAuth: true },
      },
      {
        path: 'collaboration',
        name: 'Collaboration',
        component: () => import('../views/CollaborationView.vue'),
        meta: { title: '協作訊息中心', requiresAuth: true },
      },
      {
        path: '/orders',
        name: 'Orders',
        component: () => import('../views/OrdersView.vue'),
        meta: { title: '藥囑管理', requiredAuth: true, roles: ['contributor', 'editor', 'admin'] }, // 根據您的權限需求設定
      },
      // ✨ 2. 在這裡新增一個頂層的「護理班表與職責」路由 ✨
      {
        path: 'nursing-schedule',
        name: 'NursingSchedule',
        component: () => import('../views/NursingScheduleView.vue'), // <-- ✨ 修改為新的檔案路徑 ✨
        meta: {
          title: '護理班表與職責',
          requiresAuth: true,
        },
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
    next({ name: 'Schedule' })
  } else {
    next()
  }
})

export default router
