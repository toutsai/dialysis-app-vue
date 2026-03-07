import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    chunkSizeWarningLimit: 1000, // 調整為1000kb
    rollupOptions: {
      output: {
        manualChunks: {
          // 將所有 node_modules 中的程式碼分割成一個 chunk
          vendor: [
            'vue',
            'firebase/app',
            'firebase/auth',
            'firebase/firestore',
            'firebase/functions',
          ],
          // xlsx相關的包單獨打包
          excel: ['xlsx'],
          // 將共用組件打包在一起
          common: [
            './src/components/AlertDialog.vue',
            './src/components/ConfirmDialog.vue',
            './src/components/SelectionDialog.vue',
          ],
          // 將路由相關的組件按功能分組
          schedule: [
            './src/views/ScheduleView.vue',
            './src/views/WeeklyView.vue',
            './src/views/BaseScheduleView.vue',
          ],
          patient: ['./src/views/PatientsView.vue', './src/views/LabReportView.vue'],
          admin: ['./src/views/UserManagementView.vue', './src/views/AccountSettingsView.vue'],
        },
      },
    },
  },
})
