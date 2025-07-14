// 檔案路徑: src/router/index.js (最終正確版)

import { createRouter, createWebHistory } from 'vue-router'
// 我們不再需要從 firebase/auth 單獨引入 getAuth
import { onAuthStateChanged } from 'firebase/auth'
// ✅ 只從這裡拿 auth 實例，這是唯一的真實來源
import { auth } from '@/composables/useFirebase.js'
import { useAuth } from '@/composables/useAuth.js'
import MainLayout from '@/layouts/MainLayout.vue'

// --- 路由定義 (保持不變) ---
const routes = [
  // ... 您的路由設定保持不變 ...
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

// ✨ --- 關鍵修正點 --- ✨
const getCurrentUser = () => {
  return new Promise((resolve, reject) => {
    const removeListener = onAuthStateChanged(
      // ✅ 將 getAuth() 修改為我們從 useFirebase.js 引入的、唯一的 auth 實例
      auth,
      (user) => {
        removeListener()
        resolve(user)
      },
      reject,
    )
  })
}

// ... router.beforeEach 的部分保持不變 ...
router.beforeEach(async (to, from, next) => {
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)
  const requiresAdmin = to.matched.some((record) => record.meta.requiresAdmin)
  const currentUser = await getCurrentUser() // 現在這個函式會使用正確的 auth 實例

  if (requiresAuth && !currentUser) {
    next({ name: 'Login', query: { redirect: to.fullPath } })
  } else if (to.name === 'Login' && currentUser) {
    next({ name: 'Schedule' })
  } else if (requiresAdmin) {
    if (currentUser) {
      const { isAdmin } = useAuth()
      if (isAdmin.value) {
        next()
      } else {
        console.warn('權限不足：嘗試訪問管理員頁面。將導向首頁。')
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
