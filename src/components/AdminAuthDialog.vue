<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="handleCancel">
    <div class="dialog-container">
      <div class="dialog-header">
        <h3>管理員身份驗證</h3>
        <button class="close-btn" @click="handleCancel">✕</button>
      </div>

      <div class="dialog-body">
        <p class="auth-message">{{ message }}</p>

        <div class="form-group">
          <label for="admin-username">管理員帳號</label>
          <input
            id="admin-username"
            v-model="username"
            type="text"
            placeholder="請輸入管理員帳號"
            @keyup.enter="focusPassword"
            ref="usernameInput"
          />
        </div>

        <div class="form-group">
          <label for="admin-password">管理員密碼</label>
          <input
            id="admin-password"
            v-model="password"
            type="password"
            placeholder="請輸入管理員密碼"
            @keyup.enter="handleConfirm"
            ref="passwordInput"
          />
        </div>

        <div v-if="errorMessage" class="error-message">
          {{ errorMessage }}
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn-cancel" @click="handleCancel">取消</button>
        <button
          class="btn-confirm"
          @click="handleConfirm"
          :disabled="isVerifying || !username || !password"
        >
          {{ isVerifying ? '驗證中...' : '確認' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, watch } from 'vue'
import { signInWithEmailAndPassword } from 'firebase/auth'
import { auth as firebaseAuth, db } from '@/composables/useFirebase'
import { doc, getDoc } from 'firebase/firestore'

const props = defineProps({
  isVisible: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: '此操作需要管理員權限，請輸入管理員帳號密碼進行驗證。',
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const isVerifying = ref(false)
const usernameInput = ref(null)
const passwordInput = ref(null)

// 當對話框開啟時，聚焦到帳號輸入框
watch(
  () => props.isVisible,
  async (newVal) => {
    if (newVal) {
      errorMessage.value = ''
      username.value = ''
      password.value = ''
      await nextTick()
      usernameInput.value?.focus()
    }
  },
)

const focusPassword = () => {
  passwordInput.value?.focus()
}

const handleConfirm = async () => {
  if (!username.value || !password.value) {
    errorMessage.value = '請輸入帳號和密碼'
    return
  }

  isVerifying.value = true
  errorMessage.value = ''

  try {
    // 嘗試使用提供的帳號密碼登入
    const userCredential = await signInWithEmailAndPassword(
      firebaseAuth,
      username.value,
      password.value,
    )

    // 檢查該使用者是否為管理員
    const userDoc = await getDoc(doc(db, 'users', userCredential.user.uid))
    const userData = userDoc.data()

    if (userData && userData.isAdmin === true) {
      // 驗證成功
      emit('confirm', {
        adminId: userCredential.user.uid,
        adminName: userData.name || username.value,
      })

      // 清空表單
      username.value = ''
      password.value = ''
      errorMessage.value = ''
    } else {
      errorMessage.value = '此帳號沒有管理員權限'
    }
  } catch (error) {
    console.error('管理員驗證失敗:', error)

    // 根據錯誤類型顯示不同訊息
    if (error.code === 'auth/invalid-credential') {
      errorMessage.value = '帳號或密碼錯誤'
    } else if (error.code === 'auth/user-not-found') {
      errorMessage.value = '找不到此帳號'
    } else if (error.code === 'auth/wrong-password') {
      errorMessage.value = '密碼錯誤'
    } else if (error.code === 'auth/too-many-requests') {
      errorMessage.value = '嘗試次數過多，請稍後再試'
    } else {
      errorMessage.value = '驗證失敗，請確認帳號密碼是否正確'
    }
  } finally {
    isVerifying.value = false
  }
}

const handleCancel = () => {
  username.value = ''
  password.value = ''
  errorMessage.value = ''
  emit('cancel')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.dialog-container {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  width: 90%;
  max-width: 400px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem;
  border-bottom: 1px solid #e9ecef;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.25rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-body {
  padding: 1.25rem;
}

.auth-message {
  margin: 0 0 1.5rem 0;
  color: #495057;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #495057;
}

.form-group input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
}

.form-group input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.error-message {
  color: #dc3545;
  font-size: 0.875rem;
  margin-top: 1rem;
  padding: 0.5rem;
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 4px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1.25rem;
  border-top: 1px solid #e9ecef;
}

.btn-cancel,
.btn-confirm {
  padding: 0.5rem 1.25rem;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background-color: #6c757d;
  color: white;
  border: none;
}

.btn-cancel:hover {
  background-color: #5a6268;
}

.btn-confirm {
  background-color: #007bff;
  color: white;
  border: none;
}

.btn-confirm:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-confirm:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
</style>
