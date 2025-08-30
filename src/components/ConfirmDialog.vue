<!-- src/components/ConfirmDialog.vue (增強版) -->
<template>
  <dialog :open="isVisible" class="confirm-dialog" @close="onCancel">
    <header class="dialog-header" v-if="title">
      <h3>{{ title }}</h3>
    </header>
    <main class="dialog-content">
      <pre>{{ message }}</pre>
    </main>

    <footer class="dialog-footer">
      <!-- ✨ 按鈕文字和樣式現在是動態的 -->
      <button :class="cancelClass" @click="onCancel">{{ cancelText }}</button>
      <button :class="confirmClass" @click="onConfirm">{{ confirmText }}</button>
    </footer>
  </dialog>
</template>

<script setup>
defineProps({
  isVisible: Boolean,
  title: String,
  message: String,
  // ✨ 新增 props 來客製化按鈕
  confirmText: {
    type: String,
    default: '確認',
  },
  cancelText: {
    type: String,
    default: '取消',
  },
  confirmClass: {
    type: String,
    default: 'btn-primary',
  },
  cancelClass: {
    type: String,
    default: 'btn-secondary',
  },
})
const emit = defineEmits(['confirm', 'cancel'])

function onConfirm() {
  emit('confirm')
}
function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
/* ✨ 新增一個 btn-danger 樣式 */
.btn-danger {
  background-color: #dc3545;
  border-color: #dc3545;
  color: white;
}
.btn-danger:hover {
  background-color: #c82333;
  border-color: #c82333;
}
.confirm-dialog {
  border: 1px solid #dee2e6;
  border-radius: 12px;
  padding: 5px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 500px;
  z-index: 1001;
  animation: fadeIn 0.3s ease-out;
  /* 【新增】以下是置中的關鍵 */
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.confirm-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}
.dialog-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e9ecef;
  font-size: 1.25rem;
  font-weight: 600;
  color: #343a40;
}
.dialog-header h3 {
  margin: 0;
}
.dialog-content {
  padding: 24px;
  line-height: 1.6;
  color: #495057;
}
.dialog-content pre {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-family: inherit;
  font-size: 1rem;
  margin: 0;
}
.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* 統一按鈕樣式 */
.dialog-footer button {
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}
.btn-secondary {
  background-color: #fff;
  border-color: #ced4da;
  color: #495057;
}
.btn-secondary:hover {
  background-color: #f8f9fa;
  border-color: #adb5bd;
}
.btn-primary {
  background-color: var(--primary-color, #007bff);
  border-color: var(--primary-color, #007bff);
  color: white;
}
.btn-primary:hover {
  background-color: var(--primary-color-dark, #0056b3);
  border-color: var(--primary-color-dark, #0056b3);
}
</style>
