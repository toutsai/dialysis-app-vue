// 檔案路徑: src/main.ts (整合 Pinia 後的最終版本)

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { auth } from '@/composables/useFirebase'
import { onAuthStateChanged } from 'firebase/auth'
import overlayCloseDirective from '@/directives/overlayClose.js'
// ✨✨✨ 在這裡加入，將 Quill 的樣式變成全域 ✨✨✨
import '@vueup/vue-quill/dist/vue-quill.snow.css'

let app: ReturnType<typeof createApp> | undefined

onAuthStateChanged(auth, () => {
  if (!app) {
    app = createApp(App)

    app.use(createPinia())
    app.directive('overlay-close', overlayCloseDirective)

    app.use(router)
    app.mount('#app')
  }
})
