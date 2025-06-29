<!-- 檔案路徑: src/components/SelectionDialog.vue -->
<script setup>
// 1. 定義 props 和 emits
const props = defineProps({
  isVisible: Boolean,
  title: String,
  // 【修改點】明確 props 的結構，讓它接收物件陣列
  // 每個物件應該有 { value: 'some_value', text: '顯示的文字' }
  options: {
    type: Array,
    required: true,
    // 添加一個 validator 來確保傳入的 options 格式正確
    validator: (options) => {
      return options.every((opt) => typeof opt === 'object' && 'value' in opt && 'text' in opt)
    },
  },
})
const emit = defineEmits(['select', 'cancel'])

// 2. 定義方法
function handleSelect(selectedValue) {
  // 【修改點】發送 'select' 事件時，回傳的是選項的 'value'，而不是整個物件或文字
  emit('select', selectedValue)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <dialog :open="isVisible" class="selection-dialog" @close="handleCancel">
    <h3>{{ title }}</h3>
    <div class="button-group">
      <!--
        ======================= 【修改點】 =======================
        - v-for 遍歷物件陣列，key 使用 option.value
        - @click 傳遞 option.value
        - 按鈕顯示的文字是 option.text
        ==========================================================
      -->
      <button v-for="option in options" :key="option.value" @click="handleSelect(option.value)">
        {{ option.text }}
      </button>
    </div>
    <div class="button-group">
      <button @click="handleCancel" class="cancel-btn">取消</button>
    </div>
  </dialog>
</template>

<style scoped>
/* 樣式保持不變，因為它只關心按鈕的渲染，不關心內容 */
.selection-dialog {
  border: 1px solid #ccc;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
  width: 90%;
  max-width: 400px;
  z-index: 100;
}

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
