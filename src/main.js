// 檔案路徑: src/main.js (最終、最穩健的架構)

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 1. 只從這裡引入我們需要的 Firebase 核心服務
import { auth } from '@/composables/useFirebase.js'
import { onAuthStateChanged } from 'firebase/auth'

let app // 我們先宣告一個 app 變數

// 2. 監聽 Firebase Auth 的狀態變化
// onAuthStateChanged 會在 Firebase 初始化完成後，立即回報當前使用者狀態
onAuthStateChanged(auth, (user) => {
  // 3. 只有在 Firebase 準備好之後，我們才建立並掛載 Vue 應用
  // 這樣可以確保應用程式內的任何部分在存取 Firebase 時，它都已經是可用的。
  if (!app) {
    app = createApp(App)
    app.use(router)
    app.mount('#app')
  }
})
