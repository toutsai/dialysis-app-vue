<template>
  <dialog :open="isVisible" class="confirm-dialog" @close="onCancel">
    <header class="dialog-header" v-if="title">
      <h3>{{ title }}</h3>
    </header>
    <main class="dialog-content">
      <pre>{{ message }}</pre>
    </main>
    <footer class="dialog-footer">
      <button class="btn-secondary" @click="onCancel">取消</button>
      <button class="btn-primary" @click="onConfirm">確認</button>
    </footer>
  </dialog>
</template>

<script setup>
defineProps({
  isVisible: Boolean,
  title: String,
  message: String,
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
/* 樣式可以從 AlertDialog.vue 複製過來 */
.confirm-dialog {
  border: 1px solid #ccc;
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 600px;
  z-index: 1001; /* 比其他 dialog 更高一層 */
}
.confirm-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.4);
}
.dialog-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e9ecef;
  font-size: 1.2rem;
}
.dialog-header h3 {
  margin: 0;
}
.dialog-content {
  padding: 24px;
  line-height: 1.6;
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
/* ======================= 【按鈕樣式】 ======================= */

/* 通用按鈕基礎樣式 */
.dialog-footer button {
  padding: 8px 20px;
  font-size: 0.95rem;
  font-weight: 500;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

/* 次要按鈕 (取消) */
.btn-secondary {
  background-color: #f8f9fa;
  border-color: #ced4da;
  color: #495057;
}
.btn-secondary:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
}

/* 主要按鈕 (確認) */
.btn-primary {
  background-color: #007bff;
  border-color: #007bff;
  color: white;
}
.btn-primary:hover {
  background-color: #0069d9;
  border-color: #0062cc;
}
/* ======================= 樣式結束 ======================= */
</style>
