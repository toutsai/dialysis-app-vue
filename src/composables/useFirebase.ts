// 檔案路徑: src/composables/useFirebase.ts (✨ 支援單機模式 ✨)

import { initializeApp, type FirebaseOptions, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions'

// 檢查是否為單機模式
const isStandalone = import.meta.env.VITE_APP_ENV === 'standalone'

// 宣告變數
let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let functions: Functions | null = null

// 只在非單機模式下初始化 Firebase
if (!isStandalone) {
  const firebaseConfig: FirebaseOptions = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }

  app = initializeApp(firebaseConfig)

  // 初始化 Firebase 服務
  auth = getAuth(app)
  db = getFirestore(app)
  functions = getFunctions(app, 'asia-east1') // 確保指定您的 Cloud Function 區域

  // 根據環境配置模擬器
  if (import.meta.env.VITE_APP_ENV === 'emulator') {
    // 模式為 'emulator' (npm run dev)，連接到本地模擬器
    console.log('👨‍💻 Running in EMULATOR mode, configuring emulators...')

    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableAppCheck: true })
    connectFirestoreEmulator(db, '127.0.0.1', 8080)
    connectFunctionsEmulator(functions, '127.0.0.1', 5001)

    console.log(
      '✅ Firebase Emulators connection configured. Auth:9099, Firestore:8080, Functions:5001',
    )
  } else if (import.meta.env.DEV) {
    // 模式為 'development' (npm run build:dev)，連接到雲端開發專案
    console.log(
      `🏗️ Running in CLOUD DEVELOPMENT mode, connecting to live project: ${firebaseConfig.projectId}`,
    )
  } else {
    // 生產模式 (npm run build)，連接到雲端正式專案
    console.log(
      `🌍 Running in PRODUCTION mode, connecting to live project: ${firebaseConfig.projectId}`,
    )
  }
} else {
  // 單機模式 - 不使用 Firebase
  console.log('🖥️ Running in STANDALONE mode, Firebase is disabled.')
}

// 導出服務實例 (在單機模式下為 null)
export { app, auth, db, functions }
