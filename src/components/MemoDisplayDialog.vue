<!-- 檔案路徑: src/components/MemoDisplayDialog.vue (最終修正版) -->
<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  patientName: String,
  memos: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['close'])

// 1. 創建一個 ref 來引用 <dialog> 元素
const dialogRef = ref(null)

// 2. 使用 watch 來監聽 isVisible prop 的變化
watch(
  () => props.isVisible,
  (newValue) => {
    // 確保 dialogRef.value (即 <dialog> 元素) 已經存在
    if (dialogRef.value) {
      if (newValue) {
        // 當 isVisible 變為 true 時，呼叫 showModal() 來顯示對話框
        dialogRef.value.showModal()
      } else {
        // 當 isVisible 變為 false 時，呼叫 close() 來關閉對話框
        dialogRef.value.close()
      }
    }
  },
)

// 當使用者按下 Esc 鍵或點擊背景關閉 dialog 時，
// <dialog> 元素會觸發一個 'close' 事件。
// 我們需要監聽這個事件，並通知父元件更新 isVisible 狀態。
function handleDialogClose() {
  emit('close')
}

// 確保在元件掛載後再操作 DOM
onMounted(() => {
  if (dialogRef.value) {
    dialogRef.value.addEventListener('close', handleDialogClose)
  }
})
</script>

<template>
  <!-- 3. 將 ref 綁定到 <dialog> 元素上，並移除 :open 綁定 -->
  <dialog ref="dialogRef" class="memo-dialog">
    <!-- 增加一個 v-if="isVisible"，確保內容只在需要時渲染 -->
    <div v-if="isVisible">
      <header class="dialog-header">
        <h3>{{ patientName }} 的待辦事項</h3>
        <button class="close-btn" @click="emit('close')" title="關閉">×</button>
      </header>
      <main class="dialog-content">
        <ul v-if="memos && memos.length > 0" class="memo-list-in-dialog">
          <li v-for="memo in memos" :key="memo.id" class="memo-item-in-dialog">
            <p class="memo-text">{{ memo.content }}</p>
            <div class="memo-meta-in-dialog">
              <span>建立於: {{ new Date(memo.createdAt).toLocaleDateString() }}</span>
              <span v-if="memo.targetDate"
                >| 目標日期: <strong>{{ memo.targetDate }}</strong></span
              >
            </div>
          </li>
        </ul>
        <div v-else class="empty-state">該病人沒有待處理的備忘事項。</div>
      </main>
      <footer class="dialog-footer">
        <button class="btn-primary" @click="emit('close')">關閉</button>
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
/* style 區塊保持不變 */
.memo-dialog {
  border: 1px solid #dee2e6;
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  width: 90%;
  max-width: 650px;
  z-index: 1001;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.memo-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e9ecef;
}
.dialog-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: #343a40;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  color: #adb5bd;
  transition: color 0.2s;
}
.close-btn:hover {
  color: #495057;
}

.dialog-content {
  padding: 16px 24px;
  max-height: 60vh;
  overflow-y: auto;
}

.memo-list-in-dialog {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.memo-item-in-dialog {
  background-color: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  border-left: 4px solid var(--primary-color, #007bff);
}
.memo-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 1rem;
  margin: 0 0 12px 0;
  color: #212529;
}
.memo-meta-in-dialog {
  font-size: 0.85rem;
  color: #6c757d;
  text-align: right;
}
.memo-meta-in-dialog strong {
  color: #495057;
}

.empty-state {
  text-align: center;
  color: #6c757d;
  font-size: 1.1rem;
  padding: 40px 20px;
}

.dialog-footer {
  padding: 16px 24px;
  border-top: 1px solid #e9ecef;
  display: flex;
  justify-content: flex-end;
}

.btn-primary {
  padding: 10px 24px;
  font-size: 1rem;
  font-weight: 500;
  background-color: var(--primary-color, #007bff);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease-in-out;
}

.btn-primary:hover {
  background-color: var(--primary-color-dark, #0056b3);
}
</style>
