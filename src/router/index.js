// 檔案路徑: src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'schedule',
      // 我們將建立一個 ScheduleView.vue 來對應舊的 schedule.html
      component: () => import('../views/ScheduleView.vue'),
    },
    {
      path: '/stats',
      name: 'stats',
      component: () => import('../views/StatsView.vue'),
    },
    {
      path: '/patients',
      name: 'patients',
      component: () => import('../views/PatientsView.vue'),
    },
    {
      path: '/weekly',
      name: 'weekly',
      component: () => import('../views/WeeklyView.vue'),
    },
    {
      path: '/base-schedule',
      name: 'base-schedule',
      component: () => import('../views/BaseScheduleView.vue'),
    },
    {
      path: '/memo',
      name: 'memo',
      component: () => import('../views/MemoView.vue'),
    },
  ],
})

export default router
