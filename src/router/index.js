import { createRouter, createWebHistory } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js' // 引入 useAuth 以便在守衛中使用
import MainLayout from '@/layouts/MainLayout.vue' // 引入主佈局

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
    component: MainLayout, // 所有子路由都會在這個元件的 <router-view> 中顯示
    meta: { requiresAuth: true },
    children: [
      {
        path: '', // 預設子路由 (訪問 '/' 時)
        name: 'Home',
        redirect: '/schedule',
      },
      {
        path: 'schedule', // 注意：這裡沒有開頭的 '/'
        name: 'schedule',
        component: () => import('../views/ScheduleView.vue'),
      },
      {
        path: 'weekly',
        name: 'weekly',
        component: () => import('../views/WeeklyView.vue'),
      },
      {
        path: 'base-schedule',
        name: 'base-schedule',
        component: () => import('../views/BaseScheduleView.vue'),
      },
      {
        path: 'patients',
        name: 'patients',
        component: () => import('../views/PatientsView.vue'),
      },
      {
        path: 'stats',
        name: 'stats',
        component: () => import('../views/StatsView.vue'),
      },
      {
        path: 'memo',
        name: 'memo',
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

// 全局路由守衛 (核心保護邏輯)
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
