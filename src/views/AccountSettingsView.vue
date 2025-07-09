<script setup>
import { ref } from 'vue'
import { useAuth } from '@/composables/useAuth.js'

const { changePassword, currentUser } = useAuth() // 也取得 currentUser 來顯示

const oldPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const message = ref('')
const messageType = ref('') // 'success' or 'error'
const isLoading = ref(false)

async function handleChangePassword() {
  message.value = ''
  isLoading.value = true

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
    // 清空表單
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
        <div class="form-group">
          <label for="old-password">舊密碼</label>
          <input
            id="old-password"
            type="password"
            v-model="oldPassword"
            required
            autocomplete="current-password"
          />
        </div>

        <div class="form-group">
          <label for="new-password">新密碼</label>
          <input
            id="new-password"
            type="password"
            v-model="newPassword"
            required
            autocomplete="new-password"
          />
        </div>

        <div class="form-group">
          <label for="confirm-password">確認新密碼</label>
          <input
            id="confirm-password"
            type="password"
            v-model="confirmPassword"
            required
            autocomplete="new-password"
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          {{ isLoading ? '處理中...' : '確認更改' }}
        </button>

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

.submit-btn {
  padding: 1rem;
  margin-top: 1rem;
  border-radius: 6px;
  border: none;
  background-color: var(--primary-color, #005a9c);
  color: white;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submit-btn:hover:not(:disabled) {
  background-color: #004475;
}

.submit-btn:disabled {
  background-color: #94a3b8;
  cursor: not-allowed;
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
</style>
