// 檔案路徑: src/composables/useFirebase.js (✨ 最終修正版 ✨)

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)
let functions

// ✨✨✨ 核心修正：使用 VITE_APP_ENV 來做更精確的判斷 ✨✨✨
if (import.meta.env.VITE_APP_ENV === 'emulator') {
  // 模式為 'emulator' (npm run dev)，連接到本地模擬器
  console.log('👨‍💻 Running in EMULATOR mode, configuring emulators...')

  functions = getFunctions(app, 'asia-east1')

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
  functions = getFunctions(app, 'asia-east1')
} else {
  // 生產模式 (npm run build)，連接到雲端正式專案
  console.log(
    `🌍 Running in PRODUCTION mode, connecting to live project: ${firebaseConfig.projectId}`,
  )
  functions = getFunctions(app, 'asia-east1')
}

export { app, auth, db, functions }
