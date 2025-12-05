// 檔案路徑: src/main.ts (整合 Pinia 後的最終版本)

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import overlayCloseDirective from '@/directives/overlayClose.js'
// ✨✨✨ 在這裡加入，將 Quill 的樣式變成全域 ✨✨✨
import '@vueup/vue-quill/dist/vue-quill.snow.css'

// 檢查是否為單機模式
const isStandalone = import.meta.env.VITE_APP_ENV === 'standalone'

let app: ReturnType<typeof createApp> | undefined

function mountApp() {
  if (!app) {
    app = createApp(App)

    app.use(createPinia())
    app.directive('overlay-close', overlayCloseDirective)

    app.use(router)
    app.mount('#app')
  }
}

if (isStandalone) {
  // 單機模式：直接掛載應用
  console.log('🖥️ [Main] 單機模式啟動')
  mountApp()
} else {
  // Firebase 模式：等待 Auth 狀態確認後再掛載
  import('firebase/auth').then(({ onAuthStateChanged }) => {
    import('@/composables/useFirebase').then(({ auth }) => {
      if (auth) {
        onAuthStateChanged(auth, () => {
          mountApp()
        })
      } else {
        // 如果 auth 為 null，直接掛載
        mountApp()
      }
    })
  })
}
