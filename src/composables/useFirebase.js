// 檔案路徑: src/composables/useFirebase.js

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions'

// 1. Firebase 設定
//    從 Vite 的環境變數動態讀取，完美支援多專案部署 (develop/production)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// 2. 初始化 Firebase App
//    這是整個應用的 Firebase 核心實例
const app = initializeApp(firebaseConfig)

// 3. 集中初始化所有需要的 Firebase 服務
//    所有服務都從同一個 app 實例中衍生出來，確保它們屬於同一個專案。
const auth = getAuth(app)
const db = getFirestore(app)
// 如果您的真實 Cloud Functions 部署在特定區域，建議在此指定，這不會影響模擬器
// 例如: const functions = getFunctions(app, 'asia-east1');
const functions = getFunctions(app)

// 檢查是否處於開發模式 (Vite 預設會設定 import.meta.env.DEV 為 true)
/*
if (import.meta.env.DEV) {
  console.log('👨‍💻 Running in development mode, attempting to connect to Firebase Emulators...')

  // --- 核心修正：將所有端口號與您的 firebase.json 檔案同步 ---

  // 修正 Auth 端口：從 9199 -> 9099
  // 參考 firebase.json: "auth": { "port": 9099 }
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {
    disableAppCheck: true,
  })

  // 修正 Firestore 端口：從 8180 -> 8080
  // 參考 firebase.json: "firestore": { "port": 8080 }
  connectFirestoreEmulator(db, '127.0.0.1', 8080)

  // 修正 Functions 端口：從 5101 -> 5001 (這是您登入失敗的直接原因)
  // 參考 firebase.json: "functions": { "port": 5001 }
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  console.log(
    '✅ Firebase Emulators connection configured. Auth:9099, Firestore:8080, Functions:5001',
  )
} else {
  console.log('🌍 Running in production mode, connecting to live Firebase services.')
}
*/

export { app, auth, db, functions }
