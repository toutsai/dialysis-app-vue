// 檔案路徑: src/composables/useFirebase.js

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// 1. Firebase 設定 (我們把它從 main.js 和 index.html 移到這裡集中管理)
const firebaseConfig = {
  apiKey: 'AIzaSyAqO8PzTVP8ARrcSBJqMGrU0svGgRuzHCU',
  authDomain: 'dialysis-schedule-cd36c.firebaseapp.com',
  projectId: 'dialysis-schedule-cd36c',
  storageBucket: 'dialysis-schedule-cd36c.firebasestorage.app',
  messagingSenderId: '788045577134',
  appId: '1:788045577134:web:442ad7e7e59f4e3fdf263f',
}

// 2. 初始化 Firebase，並確保只執行一次
const firebaseApp = initializeApp(firebaseConfig)
const db = getFirestore(firebaseApp)

// 3. 匯出 db 實例，讓任何地方都可以 import 它
export { db }
