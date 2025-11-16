// 檔案路徑: src/main.js (整合 Pinia 後的最終版本)

import { createApp } from 'vue'
import { createPinia } from 'pinia' // 👈 引入 createPinia
import App from './App.vue'
import router from './router'
import { auth } from '@/composables/useFirebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import overlayCloseDirective from '@/directives/overlayClose.js'
// ✨✨✨ 在這裡加入，將 Quill 的樣式變成全域 ✨✨✨
import '@vueup/vue-quill/dist/vue-quill.snow.css'

let app

onAuthStateChanged(auth, (user) => {
  if (!app) {
    app = createApp(App)

    // ✨ 核心修改：在這裡註冊 Pinia ✨
    // 必須在 app.use(router) 之前，
    // 以確保路由守衛或路由組件可以存取 Store。
    app.use(createPinia())
    app.directive('overlay-close', overlayCloseDirective)

    app.use(router)
    app.mount('#app')
  }
})
