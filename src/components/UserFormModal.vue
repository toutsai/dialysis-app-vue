<script setup>
// 【修正】: 從 'vue' 中同時引入 computed
import { ref, watch, computed } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  userData: {
    type: Object,
    default: null, // null 表示新增，物件表示編輯
  },
})

const emit = defineEmits(['close', 'save'])

const form = ref({})
const isEditing = computed(() => !!props.userData) // 現在 computed 是已定義的

// 初始化或監聽 props 變化來更新表單
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      form.value = props.userData
        ? { ...props.userData } // 編輯模式，複製資料
        : { role: 'viewer', password: '' } // 新增時給 password 一個空字串
    }
  },
  { immediate: true },
)

function handleSubmit() {
  if (!form.value.username || !form.value.name) {
    alert('姓名和帳號為必填項！')
    return
  }
  // 在新增模式下，密碼為必填
  if (!isEditing.value && !form.value.password) {
    alert('新增使用者時，密碼為必填項！')
    return
  }
  emit('save', form.value)
}
</script>

<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="emit('close')">
    <div class="dialog-content">
      <div class="dialog-header">
        <h2>{{ isEditing ? '編輯使用者' : '新增使用者' }}</h2>
        <button @click="emit('close')" class="close-btn">×</button>
      </div>
      <form @submit.prevent="handleSubmit" class="dialog-body">
        <div class="form-grid">
          <div class="form-group">
            <label for="name">姓名</label>
            <input id="name" type="text" v-model="form.name" required />
          </div>
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
              :placeholder="isEditing ? '如不變更請留空' : ''"
              :required="!isEditing"
              autocomplete="new-password"
            />
          </div>
          <div class="form-group">
            <label for="title">職稱</label>
            <input id="title" type="text" v-model="form.title" />
          </div>
          <div class="form-group">
            <label for="role">角色 (Role)</label>
            <select id="role" v-model="form.role" required>
              <option value="admin">Admin (主任/護理長)</option>
              <option value="editor">Editor (護理師組長)</option>
              <option value="contributor">Contributor (醫師)</option>
              <option value="viewer">Viewer (護理師/其他)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="email">Email</label>
            <input id="email" type="email" v-model="form.email" />
          </div>
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn-cancel" @click="emit('close')">取消</button>
          <button type="submit" class="btn-save">儲存</button>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.dialog-overlay {
  /* ... (可以從其他 Dialog 複製樣式) ... */
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
.dialog-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
}
.dialog-header h2 {
  margin: 0;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #6c757d;
}
.form-grid {
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
  font-weight: bold;
}
.form-group input,
.form-group select {
  padding: 0.6rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1em;
}
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 2rem;
  padding-top: 1.5rem;
  border-top: 1px solid #dee2e6;
}
.btn-cancel,
.btn-save {
  padding: 0.6rem 1.2rem;
  border-radius: 5px;
  border: 1px solid #ccc;
  cursor: pointer;
}
.btn-save {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
</style>
