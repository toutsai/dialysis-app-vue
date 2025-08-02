<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth.js'

const { changePassword, currentUser } = useAuth()
const router = useRouter()

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref('')
const messageType = ref('') // 'success' or 'error'
const isLoading = ref(false)

const isOldPasswordVisible = ref(false)
const isNewPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)

function togglePasswordVisibility(field) {
  if (field === 'old') {
    isOldPasswordVisible.value = !isOldPasswordVisible.value
  } else if (field === 'new') {
    isNewPasswordVisible.value = !isNewPasswordVisible.value
  } else if (field === 'confirm') {
    isConfirmPasswordVisible.value = !isConfirmPasswordVisible.value
  }
}

async function handleChangePassword() {
  message.value = ''
  isLoading.value = false

  if (newPassword.value !== confirmPassword.value) {
    message.value = '新密碼與確認密碼不相符。'
    messageType.value = 'error'
    isLoading.value = false
    return
  }
  if (newPassword.value.length < 6) {
    message.value = '新密碼長度至少需要 6 個字元。'
    messageType.value = 'error'
    isLoading.value = false
    return
  }

  try {
    await changePassword(oldPassword.value, newPassword.value)
    message.value = '密碼已成功更新！'
    messageType.value = 'success'
    oldPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (error) {
    message.value = error.message
    messageType.value = 'error'
  } finally {
    isLoading.value = false
  }
}

function handleCancel() {
  router.push({ name: 'Home' })
}
</script>

<template>
  <div class="page-wrapper">
    <div class="settings-card">
      <header class="card-header">
        <h1>帳號設定</h1>
        <p v-if="currentUser" class="subtitle">
          為帳號 <span class="username">{{ currentUser.username }}</span> 更改密碼
        </p>
      </header>

      <form @submit.prevent="handleChangePassword" class="password-form">
        <!-- 【核心修改 1/3】: 複製 LoginView 的 HTML 結構 -->
        <div class="form-group">
          <label for="old-password">舊密碼</label>
          <div class="password-wrapper">
            <input
              id="old-password"
              :type="isOldPasswordVisible ? 'text' : 'password'"
              v-model="oldPassword"
              required
              autocomplete="current-password"
            />
            <span class="password-toggle-icon" @click="togglePasswordVisibility('old')">
              {{ isOldPasswordVisible ? '🙈' : '👁️' }}
            </span>
          </div>
        </div>

        <div class="form-group">
          <label for="new-password">新密碼</label>
          <div class="password-wrapper">
            <input
              id="new-password"
              :type="isNewPasswordVisible ? 'text' : 'password'"
              v-model="newPassword"
              required
              autocomplete="new-password"
            />
            <span class="password-toggle-icon" @click="togglePasswordVisibility('new')">
              {{ isNewPasswordVisible ? '🙈' : '👁️' }}
            </span>
          </div>
        </div>

        <div class="form-group">
          <label for="confirm-password">確認新密碼</label>
          <div class="password-wrapper">
            <input
              id="confirm-password"
              :type="isConfirmPasswordVisible ? 'text' : 'password'"
              v-model="confirmPassword"
              required
              autocomplete="new-password"
            />
            <span class="password-toggle-icon" @click="togglePasswordVisibility('confirm')">
              {{ isConfirmPasswordVisible ? '🙈' : '👁️' }}
            </span>
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn-cancel" @click="handleCancel">取消</button>
          <button type="submit" class="submit-btn" :disabled="isLoading">
            {{ isLoading ? '處理中...' : '確認更改' }}
          </button>
        </div>

        <p v-if="message" :class="['message', messageType]">
          {{ message }}
        </p>
      </form>
    </div>
  </div>
</template>

<style scoped>
.page-wrapper {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 3rem 1.5rem;
  background-color: #f8f9fa;
  min-height: 100%;
}

.settings-card {
  width: 100%;
  max-width: 550px;
  background-color: #ffffff;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.card-header {
  padding: 2rem 2.5rem;
  background-color: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
}

.card-header h1 {
  margin: 0;
  font-size: 2rem;
  color: #1e293b;
}

.subtitle {
  margin: 0.5rem 0 0;
  color: #64748b;
  font-size: 1.1rem;
}

.username {
  font-weight: bold;
  color: var(--primary-color, #005a9c);
}

.password-form {
  padding: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #334155;
}

.form-group input {
  padding: 0.8rem 1rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 1rem;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary-color, #005a9c);
  box-shadow: 0 0 0 3px rgba(0, 90, 156, 0.2);
}

/* 【核心修改 2/3】: 複製 LoginView 的 password-wrapper 樣式 */
.password-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.password-wrapper input {
  width: 100%;
  padding-right: 3.5rem;
}

/* 【核心修改 3/3】: 複製 LoginView 的 password-toggle-icon 樣式 */
.password-toggle-icon {
  position: absolute;
  right: 1rem;
  cursor: pointer;
  user-select: none;
  font-size: 1.5rem;
  color: #a0aec0;
  display: flex;
  align-items: center;
  height: 100%;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1rem;
}

.submit-btn,
.btn-cancel {
  padding: 0.8rem 1.5rem;
  border-radius: 6px;
  border: none;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
}

.submit-btn {
  background-color: var(--primary-color, #16a3a4);
  color: white;
}

.submit-btn:hover:not(:disabled) {
  background-color: #15803d;
}

.submit-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
}

.btn-cancel {
  background-color: #f1f5f9;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.btn-cancel:hover {
  background-color: #e2e8f0;
}

.message {
  padding: 1rem;
  border-radius: 6px;
  text-align: center;
  font-weight: 500;
  margin-top: 0.5rem;
}

.message.success {
  background-color: #d1fae5;
  color: #065f46;
}

.message.error {
  background-color: #fee2e2;
  color: #991b1b;
}
/* ‼️‼️‼️ 新增的響應式樣式 ‼️‼️‼️ */
@media (max-width: 768px) {
  .page-wrapper {
    /* 在手機上減少外邊距 */
    padding: 1.5rem 1rem;
  }

  .settings-card {
    /* 移除陰影和邊框，讓它看起來更原生 */
    box-shadow: none;
    border-radius: 0;
  }

  .card-header,
  .password-form {
    /* 減少內邊距 */
    padding: 1.5rem;
  }

  .card-header h1 {
    font-size: 1.8rem;
  }

  .form-actions {
    /* 讓按鈕堆疊 */
    flex-direction: column-reverse;
    gap: 0.75rem;
  }

  .submit-btn,
  .btn-cancel {
    /* 讓按鈕佔滿全寬 */
    width: 100%;
  }
}
</style>
