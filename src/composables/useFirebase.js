// 檔案路徑: src/composables/useFirebase.js

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
const functions = getFunctions(app)

if (import.meta.env.DEV) {
  console.log('👨‍💻 Running in development mode, attempting to connect to Firebase Emulators...')

  // 連接到本地模擬器
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableAppCheck: true,
  })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  console.log(
    '✅ Firebase Emulators connection configured. Auth:9099, Firestore:8080, Functions:5001',
  )
} else {
  // 只有在生產模式下才顯示連接到線上服務的日誌
  console.log('🌍 Running in production mode, connecting to live Firebase services.')
  console.log(`🌍 Connecting to LIVE Firebase project: ${firebaseConfig.projectId}`)
}

export { app, auth, db, functions }
