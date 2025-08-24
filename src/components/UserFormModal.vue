<!-- src/components/UserFormModal.vue (已整合預設班表設定) -->
<script setup>
import { watch, reactive, computed } from 'vue' // ✨ 1. 引入 computed

const props = defineProps({
  isVisible: Boolean,
  isEditing: Boolean,
  user: Object,
})

const emit = defineEmits(['close', 'save'])

// ✨ 2. 在預設表單結構中，加入 defaultSchedules 陣列
const defaultFormState = {
  id: '',
  name: '',
  username: '',
  password: '123456',
  title: '護理師',
  role: 'viewer',
  email: '',
  staffId: '',
  phone: '',
  clinicHours: [],
  defaultSchedules: [],
}

const form = reactive({ ...defaultFormState })

const titles = ['主治醫師', '護理長', '護理師', '專科護理師', '管理員', '書記']
const roles = [
  { value: 'admin', text: 'Admin (主任/護理長/管理員)' },
  { value: 'contributor', text: 'Contributor (醫師/專師)' },
  { value: 'editor', text: 'Editor (護理師組長)' },
  { value: 'viewer', text: 'Viewer (護理師/書記)' },
]

// ✨ 3. 定義預設班表的選項資料，供 template 使用
const scheduleOptions = computed(() => {
  const days = ['週一', '週二', '週三', '週四', '週五', '週六', '週日']
  const shifts = { early: '早', noon: '午', late: '夜' }
  const options = []
  // dayOfWeek: 0=週日, 1=週一, ..., 6=週六 (符合 JS Date.getDay() 的回傳值)
  for (let i = 0; i < days.length; i++) {
    const dayOfWeek = (i + 1) % 7
    for (const shiftCode in shifts) {
      options.push({
        value: `${dayOfWeek}-${shiftCode}`, // e.g., "1-early"
        label: `${days[i]}${shifts[shiftCode]}`, // e.g., "週一早"
      })
    }
  }
  return options
})

watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      if (props.isEditing && props.user) {
        // ✨ 4. 在編輯模式下，確保能正確載入已儲存的 defaultSchedules
        Object.assign(form, defaultFormState, {
          ...props.user,
          staffId: props.user.staffId || '',
          phone: props.user.phone || '',
          clinicHours: props.user.clinicHours || [],
          defaultSchedules: props.user.defaultSchedules || [], // 確保有預設空陣列
        })
        form.password = ''
      } else {
        // 新增模式，重置為預設狀態
        Object.assign(form, defaultFormState)
      }
    }
  },
)

watch(
  () => form.title,
  (newTitle) => {
    // ✨ 5. 當職稱不是主治醫師時，清空所有醫師相關欄位
    if (newTitle !== '主治醫師') {
      form.staffId = ''
      form.phone = ''
      form.clinicHours = []
      form.defaultSchedules = [] // 清空預設班表
    }
  },
)

function handleSubmit() {
  const dataToSave = { ...form }
  if (props.isEditing && !dataToSave.password) {
    delete dataToSave.password
  }

  // ✨ 6. 在儲存時，如果不是主治醫師，移除所有醫師相關欄位
  if (dataToSave.title !== '主治醫師') {
    delete dataToSave.staffId
    delete dataToSave.phone
    delete dataToSave.clinicHours
    delete dataToSave.defaultSchedules // 移除預設班表
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

          <div v-if="form.title === '主治醫師'" class="physician-fields">
            <hr class="field-separator" />
            <div class="form-row">
              <div class="form-group">
                <label for="staffId">員工編號</label>
                <input id="staffId" type="text" v-model="form.staffId" />
              </div>
              <div class="form-group">
                <label for="phone">電話</label>
                <input id="phone" type="tel" v-model="form.phone" />
              </div>
            </div>

            <!-- ✨ 7. 新增：預設班表設定 UI ✨ -->
            <div class="form-group">
              <label>預設班表</label>
              <div class="schedule-checkbox-group">
                <div v-for="option in scheduleOptions" :key="option.value" class="checkbox-wrapper">
                  <input
                    type="checkbox"
                    :id="`sched-${option.value}`"
                    :value="option.value"
                    v-model="form.defaultSchedules"
                  />
                  <label :for="`sched-${option.value}`">{{ option.label }}</label>
                </div>
              </div>
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
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */
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
  padding: 1rem;
}

.modal-content {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 100%;
  max-width: 650px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  max-height: 90vh;
  overflow-y: auto;
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
  width: 100%;
  box-sizing: border-box;
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

.physician-fields {
  margin-top: 1rem;
}
.field-separator {
  border: none;
  border-top: 1px solid #eee;
  margin: 1rem 0;
}

/* ✨ 8. 新增：預設班表 checkboxes 的樣式 ✨ */
.schedule-checkbox-group {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
  padding: 10px;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.checkbox-wrapper {
  display: flex;
  align-items: center;
}
.checkbox-wrapper input[type='checkbox'] {
  width: auto; /* 覆蓋 .form-group input 的 width: 100% */
  margin-right: 8px;
}
.checkbox-wrapper label {
  font-weight: normal; /* 取消 label 的粗體 */
  margin-bottom: 0; /* 覆蓋掉 .form-group label 的 margin */
  cursor: pointer; /* 增加點擊區域 */
}

/* ================================== */
/* ‼️        新增的響應式樣式        ‼️ */
/* ================================== */
@media (max-width: 768px) {
  .modal-overlay {
    align-items: flex-start;
  }

  .modal-content {
    padding: 1.5rem;
    margin-top: 5vh;
  }

  .form-row {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .modal-footer {
    flex-direction: column-reverse;
    gap: 0.75rem;
  }

  .modal-footer .btn {
    width: 100%;
  }

  .modal-header h2 {
    font-size: 1.25rem;
  }
}
</style>
