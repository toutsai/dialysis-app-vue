// 檔案路徑: src/composables/useFirebase.ts (✨ 最終修正版 ✨)

import { initializeApp, type FirebaseOptions } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions'

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

// ✨ 1. 先宣告變數，但不立即賦值
const auth: Auth = getAuth(app)
const db: Firestore = getFirestore(app)
const functions: Functions = getFunctions(app, 'asia-east1') // 確保指定您的 Cloud Function 區域

// ✨ 2. 核心修改：將模擬器連接的邏輯移到最前面，並在賦值之前執行
if (import.meta.env.VITE_APP_ENV === 'emulator') {
  // 模式為 'emulator' (npm run dev)，連接到本地模擬器
  console.log('👨‍💻 Running in EMULATOR mode, configuring emulators...')

  // ✨ 在這裡立即連接，確保後續所有對 service 的引用都已經是連接到模擬器的版本
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
  // 在雲端模式下，不需要呼叫 connect...Emulator
} else {
  // 生產模式 (npm run build)，連接到雲端正式專案
  console.log(
    `🌍 Running in PRODUCTION mode, connecting to live project: ${firebaseConfig.projectId}`,
  )
  // 在雲端模式下，不需要呼叫 connect...Emulator
}

// ✨ 3. 最後才導出已經配置好的服務實例
export { app, auth, db, functions }
