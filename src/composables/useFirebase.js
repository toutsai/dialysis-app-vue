// 檔案路徑: src/composables/useFirebase.js

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// 1. Firebase 設定
//    【修改重點】不再寫死金鑰，而是從 Vite 的環境變數 (import.meta.env) 動態讀取。
//    - 在本地開發 (npm run dev)，Vite 會讀取 .env.local 檔案。
//    - 在建置部署 (npm run build)，Vite 會讀取 .env.production 檔案。
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// 2. 初始化 Firebase，並確保只執行一次
const firebaseApp = initializeApp(firebaseConfig)
const db = getFirestore(firebaseApp)

// 3. 匯出 db 實例，讓任何地方都可以 import 它
export { db }
