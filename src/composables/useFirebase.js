// 檔案路徑: src/composables/useFirebase.js (✨ 最終修正版 ✨)

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

// --- Firebase 設定 (不變) ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// --- 初始化 App (不變) ---
const app = initializeApp(firebaseConfig)

// --- 初始化 Auth 和 Firestore (不變) ---
const auth = getAuth(app)
const db = getFirestore(app)

// --- ✨✨✨ 核心修正：根據環境模式，創建不同的 Functions 實例 ✨✨✨ ---
let functions

if (import.meta.env.DEV) {
  // 開發模式：創建一個普通的 Functions 實例，然後連接到本地模擬器
  console.log('👨‍💻 Running in development mode, configuring emulators...')

  functions = getFunctions(app) // 先創建

  // 連接到本地模擬器
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableAppCheck: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001) // 再連接

  console.log(
    '✅ Firebase Emulators connection configured. Auth:9099, Firestore:8080, Functions:5001',
  )
} else {
  // 生產模式：創建一個【明確指定了區域】的 Functions 實例
  console.log('🌍 Running in production mode, connecting to live Firebase services.')
  console.log(`🌍 Connecting to LIVE Firebase project: ${firebaseConfig.projectId}`)

  // 在 getFunctions 中，第二個參數明確指定我們的後端函式所在的區域
  functions = getFunctions(app, 'asia-east1')
}

// --- 最終匯出所有服務 ---
export { app, auth, db, functions }
