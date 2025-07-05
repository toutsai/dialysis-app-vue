// 檔案路徑: src/router/index.js (修正後完整版)

import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js' // 引入 useAuth 以便在守衛中使用
import MainLayout from '@/layouts/MainLayout.vue' // 引入主佈局

const routes = [
  // 公共路由，不需要佈局
  {
    path: '/login',
    name: 'Login', // 已是 PascalCase，保持不變
    component: () => import('../views/LoginView.vue'),
  },

  // 受保護的路由，全部使用 MainLayout 作為佈局
  {
    path: '/',
    component: MainLayout, // 所有子路由都會在這個元件的 <router-view> 中顯示
    meta: { requiresAuth: true },
    children: [
      {
        path: '', // 預設子路由 (訪問 '/' 時)
        name: 'Home', // 已是 PascalCase，保持不變
        redirect: '/schedule',
      },
      {
        path: 'schedule', // 注意：這裡沒有開頭的 '/'
        name: 'Schedule', // 【修改】'schedule' -> 'Schedule'
        component: () => import('../views/ScheduleView.vue'),
      },
      {
        path: 'weekly',
        name: 'Weekly', // 【修改】'weekly' -> 'Weekly'
        component: () => import('../views/WeeklyView.vue'),
      },
      {
        path: 'base-schedule',
        name: 'BaseSchedule', // 【修改】'base-schedule' -> 'BaseSchedule'
        component: () => import('../views/BaseScheduleView.vue'),
      },
      {
        path: 'patients',
        // 【注意】您的原始碼是 PatientsView.vue，如果檔名確實是這樣，請保持。如果是 PatientView.vue，請修改 component 路徑
        name: 'Patients', // 【修改】'patients' -> 'Patients'
        component: () => import('../views/PatientsView.vue'),
      },
      {
        path: 'stats',
        name: 'Stats', // 【修改】'stats' -> 'Stats'
        component: () => import('../views/StatsView.vue'),
      },
      {
        path: 'memo',
        name: 'Memo', // <-- 【核心修正】將 'memo' 改為 'Memo'
        component: () => import('../views/MemoView.vue'),
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

// 全局路由守衛 (核心保護邏輯) - 保持不變
router.beforeEach((to, from, next) => {
  const { isLoggedIn } = useAuth()

  // 檢查目標路由或其任何父路由是否需要身份驗證
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth)

  if (requiresAuth && !isLoggedIn.value) {
    // 如果目標路由需要登入，但用戶未登入，則跳轉到登入頁
    // 為了防止無限重定向，可以添加一個檢查
    if (to.name !== 'Login') {
      next({ name: 'Login' })
    } else {
      next()
    }
  } else if (to.name === 'Login' && isLoggedIn.value) {
    // 如果用戶已登入，但試圖訪問登入頁，則將他們導向首頁
    next({ name: 'Home' })
  } else {
    // 其他情況，正常放行
    next()
  }
})

export default router
