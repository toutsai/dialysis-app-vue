// src/main.js

// =================================================================
// --- 1. Firebase 初始化區塊 ---
// 我們將舊專案 index.html 中的 Firebase 設定移到這裡
// =================================================================

import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

// 這是你之前提供的 Firebase 設定物件，直接使用即可
const firebaseConfig = {
  apiKey: 'AIzaSyAqO8PzTVP8ARrcSBJqMGrU0svGgRuzHCU',
  authDomain: 'dialysis-schedule-cd36c.firebaseapp.com',
  projectId: 'dialysis-schedule-cd36c',
  storageBucket: 'dialysis-schedule-cd36c.firebasestorage.app',
  messagingSenderId: '788045577134',
  appId: '1:788045577134:web:442ad7e7e59f4e3fdf263f',
}

// 初始化 Firebase 應用
const firebaseApp = initializeApp(firebaseConfig)

// 取得 Firestore 資料庫的實例
const db = getFirestore(firebaseApp)

// 匯出 db 實例，這樣在你專案的任何其他地方 (例如元件中)
// 都可以通过 `import { db } from '@/main.js'` 來取得它
export { db }

// =================================================================
// --- 2. Vue 應用初始化區塊 ---
// 這是 Vue 專案本身的核心啟動程式碼，保持不變
// =================================================================

import './assets/main.css' // 引入全域 CSS

import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)

app.mount('#app')
