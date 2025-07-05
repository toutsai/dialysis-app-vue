<!-- 檔案路徑: src/views/LoginView.vue (完整版) -->
<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="login-title">部北透析管理平台</h1>
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="form-group">
          <label for="username">帳號</label>
          <input
            type="text"
            id="username"
            v-model="username"
            required
            autocomplete="username"
            placeholder="請輸入帳號"
          />
        </div>
        <div class="form-group">
          <label for="password">密碼</label>
          <input
            type="password"
            id="password"
            v-model="password"
            required
            autocomplete="current-password"
            placeholder="請輸入密碼"
          />
        </div>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <button type="submit" class="login-button" :disabled="isLoading">
          {{ isLoading ? '登入中...' : '登入' }}
        </button>
      </form>
      <div class="test-accounts">
        <p><strong>開發測試帳號:</strong></p>
        <ul>
          <li>編輯者 (可修改): 帳號 `editor` / 密碼 `1234`</li>
          <li>檢視者 (僅檢視): 帳號 `viewer` / 密碼 `1234`</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'

const username = ref('editor') // 為了開發方便，可以預填帳號
const password = ref('1234') // 為了開發方便，可以預填密碼
const errorMessage = ref('')
const isLoading = ref(false)

const router = useRouter()
// 從 useAuth 中獲取我們需要的 login 函式
const { login } = useAuth()

async function handleLogin() {
  if (isLoading.value) return // 防止重複提交

  isLoading.value = true
  errorMessage.value = ''

  try {
    // 呼叫 useAuth 中的 login 函式，並等待其完成
    await login(username.value, password.value)

    // 登入成功後，使用 vue-router 跳轉到首頁
    // replace: true 表示這次導航不會留下歷史紀錄，
    // 這樣用戶登入後按「返回」不會回到登入頁。
    router.replace({ name: 'Home' })
  } catch (error) {
    // 如果 login 函式 reject，表示登入失敗，顯示錯誤訊息
    errorMessage.value = error.message
  } finally {
    // 無論成功或失敗，都將加載狀態設回 false
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f0f2f5;
  background-image: linear-gradient(120deg, #3498db, #8e44ad);
}

.login-box {
  background: white;
  padding: 40px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  width: 100%;
  max-width: 420px;
  text-align: center;
  animation: fadeIn 0.5s ease-in-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-title {
  margin-top: 0;
  margin-bottom: 32px;
  color: #333;
  font-weight: 600;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  text-align: left;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #555;
}

.form-group input {
  width: 100%;
  padding: 12px 15px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 16px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #1abc9c);
  box-shadow: 0 0 0 3px rgba(26, 188, 156, 0.2);
}

.error-message {
  color: #e74c3c;
  margin: -10px 0 0 0;
  font-weight: 500;
}

.login-button {
  padding: 12px;
  background-color: var(--primary-color, #1abc9c);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
  transition: background-color 0.2s;
  margin-top: 8px;
}

.login-button:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #16a085);
}

.login-button:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.test-accounts {
  margin-top: 24px;
  font-size: 0.9em;
  color: #666;
  text-align: left;
  background: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.test-accounts ul {
  padding-left: 20px;
  margin: 5px 0 0 0;
}
</style>
