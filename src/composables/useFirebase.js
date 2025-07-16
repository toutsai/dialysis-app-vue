// 檔案路徑: src/firebase.js (推薦的新檔名)
// 或者直接覆蓋 src/composables/useFirebase.js

import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth' // ✨ 引入 connectAuthEmulator
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore' // ✨ 引入 connectFirestoreEmulator
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions' // ✨ 引入 connectFunctionsEmulator

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

// 3. ✨ 集中初始化所有需要的 Firebase 服務 ✨
//    所有服務都從同一個 app 實例中衍生出來，確保它們屬於同一個專案。
const auth = getAuth(app)
const db = getFirestore(app)
const functions = getFunctions(app)

// ✨ --- 新增這段關鍵的程式碼 --- ✨
// 檢查是否處於開發模式 (Vite 預設會設定 import.meta.env.DEV 為 true)
// 並且確保模擬器的主機位址存在
if (import.meta.env.DEV) {
  console.log('🔥 Running in development mode, connecting to emulators...')

  // ✨ 同步修改成新的 Port
  connectAuthEmulator(auth, 'http://127.0.0.1:9199')
  connectFirestoreEmulator(db, '127.0.0.1', 8180)
  connectFunctionsEmulator(functions, '127.0.0.1', 5101)
}
export { app, auth, db, functions }
