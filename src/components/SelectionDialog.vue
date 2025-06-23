<!-- 檔案路徑: src/components/SelectionDialog.vue -->
<script setup>
// 1. 定義 props 和 emits
const props = defineProps({
  isVisible: Boolean,
  title: String,
  options: Array, // 接收一個選項陣列，例如 ['出院', '死亡', ...]
})
const emit = defineEmits(['select', 'cancel'])

// 2. 定義方法
function handleSelect(option) {
  emit('select', option) // 發送 'select' 事件，並回傳被點選的選項
}

function handleCancel() {
  emit('cancel') // 發送 'cancel' 事件
}
</script>

<template>
  <!-- 我們用 <dialog> 元素，這是 HTML5 內建的對話框，非常方便 -->
  <!-- :open 屬性控制 dialog 的顯示與否 -->
  <dialog :open="isVisible" class="selection-dialog">
    <h3>{{ title }}</h3>
    <div class="button-group">
      <!-- 使用 v-for 遍歷傳入的 options，為每個選項建立一個按鈕 -->
      <button v-for="option in options" :key="option" @click="handleSelect(option)">
        {{ option }}
      </button>
    </div>
    <div class="button-group">
      <button @click="handleCancel" class="cancel-btn">取消</button>
    </div>
  </dialog>
</template>

<style scoped>
/* 這是從舊專案 delete-reason-dialog 借來的樣式，並稍作修改 */
.selection-dialog {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 400px; /* 調整寬度以適應按鈕列表 */
}

/* ::backdrop 是 dialog 元素的背景遮罩 */
.selection-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
}

.selection-dialog h3 {
  margin-top: 0;
  text-align: center;
}

.button-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 15px;
}

.button-group button {
  width: 100%;
  padding: 10px;
  font-size: 1em;
  cursor: pointer;
  border-radius: 5px;
  border: 1px solid #ccc;
  background-color: #f0f0f0;
}

.button-group button:hover {
  background-color: #e0e0e0;
}

.button-group button.cancel-btn {
  background-color: transparent;
  margin-top: 10px;
}
</style>
