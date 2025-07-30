<!-- 檔案路徑: src/views/LoginView.vue (已修正) -->
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
          <div class="password-wrapper">
            <input
              :type="isPasswordVisible ? 'text' : 'password'"
              id="password"
              v-model="password"
              required
              autocomplete="current-password"
              placeholder="請輸入密碼"
            />
            <span class="password-toggle-icon" @click="togglePasswordVisibility">
              {{ isPasswordVisible ? '🙈' : '👁️' }}
            </span>
          </div>
        </div>
        <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
        <button type="submit" class="login-button" :disabled="isLoading">
          {{ isLoading ? '登入中...' : '登入' }}
        </button>
      </form>
      <div class="user-notice">
        <p><strong>使用者須知：</strong></p>
        <ul>
          <li>帳號：預設為您的 <strong>HIS 帳號</strong>。</li>
          <li>密碼：預設為 <strong>123456</strong>。</li>
          <li>首次登入後，建議立即至「帳號設定」頁面變更密碼。</li>
        </ul>
        <p class="forgot-password">若忘記密碼，請聯繫系統管理員或護理長重設。</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const isPasswordVisible = ref(false)

const router = useRouter()
const { login } = useAuth() // 從 useAuth 獲取 login 函式

const togglePasswordVisibility = () => {
  isPasswordVisible.value = !isPasswordVisible.value
}

// ✨ 保持這個版本，它已經是正確的了
async function handleLogin() {
  if (isLoading.value) return

  isLoading.value = true
  errorMessage.value = ''

  try {
    // login 函式現在內部會處理路由跳轉
    await login(username.value, password.value)

    // 登入成功後，useAuth 內部會自動導航，這裡不需要再做 router.push
  } catch (error) {
    errorMessage.value = error.message
  } finally {
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
  max-width: 450px;
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
  font-size: 1.8rem;
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

.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper input {
  width: 100%;
  padding-right: 3.5rem;
}

.password-toggle-icon {
  position: absolute;
  right: 18px;
  cursor: pointer;
  user-select: none;
  font-size: 1.5rem;
  color: #a0aec0;
  display: flex;
  align-items: center;
  height: 100%;
}

.form-group input {
  width: 100%;
  padding: 14px 18px;
  border: 1px solid #ccc;
  border-radius: 8px;
  font-size: 1.1rem;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #3498db);
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.2);
}

.error-message {
  color: #e74c3c;
  margin: -10px 0 0 0;
  font-weight: 500;
}

.login-button {
  padding: 14px;
  background-color: var(--primary-color, #3498db);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.1rem;
  font-weight: bold;
  transition: background-color 0.2s;
  margin-top: 8px;
}

.login-button:hover:not(:disabled) {
  background-color: var(--primary-color-dark, #2980b9);
}

.login-button:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.user-notice {
  margin-top: 24px;
  font-size: 0.95em;
  color: #666;
  text-align: left;
  background: #f8f9fa;
  padding: 15px 20px;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.user-notice p {
  margin: 0 0 10px 0;
}

.user-notice ul {
  padding-left: 20px;
  margin: 5px 0 15px 0;
  line-height: 1.6;
}

.forgot-password {
  margin-top: 15px;
  text-align: center;
  font-size: 0.9em;
  color: #888;
}

/* ‼️‼️‼️ 以下是新增的響應式樣式 ‼️‼️‼️ */
/* 當螢幕寬度小於或等於 768px 時 (適用於大多數手機) */
@media (max-width: 768px) {
  /* 讓背景容器在手機上從頂部對齊，而不是置中 */
  .login-container {
    align-items: flex-start;
  }

  /* 核心修改：讓登入框佔滿整個螢幕 */
  .login-box {
    max-width: none; /* 移除最大寬度限制 */
    width: 100%; /* 確保寬度為 100% */
    min-height: 100vh; /* 讓它至少和螢幕一樣高 */
    border-radius: 0; /* 移除圓角，使其邊緣與螢幕對齊 */
    box-shadow: none; /* 移除陰影，因為它已經是全螢幕了 */

    /* 減少邊距，避免內容太擠 */
    padding: 40px 25px;

    /* 使用 flex 讓內容在垂直方向上更居中，體驗更好 */
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  /* 適當縮小標題字體，使其在手機上更和諧 */
  .login-title {
    font-size: 1.6rem;
    margin-bottom: 24px;
  }

  /* 縮小表單元素之間的間距 */
  .login-form {
    gap: 15px;
  }
}
</style>
