<!-- src/components/AlertDialog.vue -->
<template>
  <dialog :open="isVisible" class="alert-dialog" @close="handleConfirm">
    <header class="dialog-header" v-if="title">
      <h3>{{ title }}</h3>
    </header>
    <main class="dialog-content">
      <!--
        使用 <pre> 標籤可以保留文字中的換行和空格，
        非常適合顯示格式化的警告訊息。
      -->
      <pre>{{ message }}</pre>
    </main>
    <footer class="dialog-footer">
      <button class="btn-primary" @click="handleConfirm">確定</button>
    </footer>
  </dialog>
</template>

<script setup>
defineProps({
  isVisible: Boolean,
  title: String,
  message: String,
})
const emit = defineEmits(['confirm'])

function handleConfirm() {
  emit('confirm')
}
</script>

<style scoped>
.alert-dialog {
  border: 1px solid #ccc;
  border-radius: 12px;
  padding: 0; /* 移除預設 padding，由內部控制 */
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 600px; /* 【關鍵】設定一個較大的寬度 */
  z-index: 1000;
}
.alert-dialog::backdrop {
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

/* <pre> 標籤可以完美顯示換行符 */
.dialog-content pre {
  white-space: pre-wrap; /* 自動換行長文本 */
  word-wrap: break-word;
  font-family: inherit; /* 繼承父元素的字體 */
  font-size: 1rem;
  margin: 0;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end; /* 按鈕靠右 */
}

.btn-primary {
  /* 按鈕樣式 */
  padding: 10px 20px;
}
</style>
