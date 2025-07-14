// 檔案路徑: src/router/index.js (最終推薦版本)

import { createRouter, createWebHistory } from 'vue-router'
import { getAuth, onAuthStateChanged } from 'firebase/auth' // ✨ 1. 引入 Firebase Auth 的核心函式
import { auth } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth.js' // 引入 useAuth 才能在下面使用
import MainLayout from '@/layouts/MainLayout.vue'

// --- 路由定義 (保持不變) ---
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
      {
        path: '',
        name: 'Home',
        redirect: '/schedule',
      },
      {
        path: 'schedule',
        name: 'Schedule',
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
        meta: { requiresAdmin: true },
      },
      {
        path: 'account-settings',
        name: 'AccountSettings',
        component: () => import('../views/AccountSettingsView.vue'),
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// ✨ 2. 建立一個輔助函式，用於獲取當前的認證狀態
const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    // onAuthStateChanged 會在狀態確定後立即解除監聽，確保只執行一次
    const removeListener = onAuthStateChanged(
      getAuth(),
      (user) => {
        removeListener()
        resolve(user)
      },
      reject,
    )
  })
}

// ✨ 3. 全新的、基於非同步檢查的路由守衛
router.beforeEach(async (to, from, next) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)
  const currentUser = await getCurrentUser() // 等待 Firebase 確認使用者狀態

  if (requiresAuth && !currentUser) {
    // 情況 1: 訪問需要登入的頁面，但 Firebase 確認用戶未登入
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && currentUser) {
    // 情況 2: 已登入用戶試圖訪問登入頁，導向首頁
    next({ name: 'Schedule' })
  } else if (requiresAdmin) {
    // 情況 3: 訪問需要管理員權限的頁面
    if (currentUser) {
      // 此時 useAuth() 內部狀態已經被 useAuth.js 中的 onAuthStateChanged 更新
      const { isAdmin } = useAuth()
      if (isAdmin.value) {
        next() // 是管理員，放行
      } else {
        console.warn('權限不足：嘗試訪問管理員頁面。將導向首頁。')
        next({ name: 'Schedule' }) // 不是管理員，導向首頁
      }
    } else {
      // 理論上不會執行到這裡，因為會被情況1攔截，但作為保險
      next({ name: 'Login' })
    }
  } else {
    // 情況 4: 所有檢查通過，正常放行
    next()
  }
})

export default router
