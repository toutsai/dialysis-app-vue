<script setup>
import { ref, watch, reactive } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  isEditing: Boolean,
  user: Object,
})

const emit = defineEmits(['close', 'save'])

const form = reactive({
  id: '',
  name: '',
  username: '',
  password: '',
  title: '護理師',
  role: 'viewer',
  email: '',
})

// 職稱選項
const titles = ['主治醫師', '護理長', '護理師', '專科護理師', '管理員']

// 角色選項
const roles = [
  { value: 'admin', text: 'Admin (主任/護理長/管理員)' },
  { value: 'contributor', text: 'Contributor (醫師/專師)' },
  { value: 'editor', text: 'Editor (護理師組長)' },
  { value: 'viewer', text: 'Viewer (護理師)' },
]

watch(
  () => props.isVisible,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      if (props.isEditing && props.user) {
        // 編輯模式
        Object.assign(form, props.user)
        form.password = ''
      } else {
        // 新增模式
        Object.assign(form, {
          id: '',
          name: '',
          username: '',
          password: '123456',
          title: '護理師',
          role: 'viewer',
          email: '',
        })
      }
    }
  },
)

function handleSubmit() {
  const dataToSave = { ...form }
  if (props.isEditing && !dataToSave.password) {
    delete dataToSave.password
  }
  emit('save', dataToSave)
}
</script>

<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <header class="modal-header">
        <h2>{{ isEditing ? '編輯使用者' : '新增使用者' }}</h2>
        <button class="close-btn" @click="emit('close')">×</button>
      </header>
      <main class="modal-body">
        <form @submit.prevent="handleSubmit" class="user-form">
          <!-- 第一列：姓名、職稱 -->
          <div class="form-row">
            <div class="form-group">
              <label for="name">姓名</label>
              <input id="name" type="text" v-model="form.name" required />
            </div>
            <div class="form-group">
              <label for="title">職稱</label>
              <select id="title" v-model="form.title">
                <option v-for="titleOption in titles" :key="titleOption" :value="titleOption">
                  {{ titleOption }}
                </option>
              </select>
            </div>
          </div>

          <!-- 第二列：帳號、密碼 -->
          <div class="form-row">
            <div class="form-group">
              <label for="username">帳號 (Username)</label>
              <input
                id="username"
                type="text"
                v-model="form.username"
                required
                :disabled="isEditing"
              />
            </div>
            <div class="form-group">
              <label for="password">密碼</label>
              <input
                id="password"
                type="password"
                v-model="form.password"
                :placeholder="isEditing ? '留白表示不更改密碼' : ''"
                :required="!isEditing"
              />
            </div>
          </div>

          <!-- 第三列：角色、Email -->
          <div class="form-row">
            <div class="form-group">
              <label for="role">角色 (Role)</label>
              <select id="role" v-model="form.role">
                <option
                  v-for="roleOption in roles"
                  :key="roleOption.value"
                  :value="roleOption.value"
                >
                  {{ roleOption.text }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input id="email" type="email" v-model="form.email" />
            </div>
          </div>
        </form>
      </main>
      <footer class="modal-footer">
        <button class="btn btn-save" @click="handleSubmit">儲存</button>
        <button class="btn btn-cancel" @click="emit('close')">取消</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 90%;
  max-width: 650px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #eee;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #888;
}
.close-btn:hover {
  color: #000;
}

.user-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #333;
}

.form-group input,
.form-group select {
  padding: 0.75rem;
  border: 1px solid #ccc;
  border-radius: 4px;
  font-size: 1rem;
}

.modal-footer {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}

.btn {
  padding: 0.6rem 1.5rem;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  font-weight: bold;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.btn-cancel {
  background-color: #f0f0f0;
  border: 1px solid #ccc;
}
.btn-cancel:hover {
  background-color: #e0e0e0;
}

.btn-save {
  background-color: #007bff;
  color: white;
}
.btn-save:hover {
  background-color: #0056b3;
}
</style>
