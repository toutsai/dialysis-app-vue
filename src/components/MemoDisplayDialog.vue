<!-- 檔案路徑: src/components/MemoDisplayDialog.vue (按鈕樣式修正版) -->
<template>
  <dialog :open="isVisible" class="memo-dialog" @close="emit('close')">
    <div v-if="isVisible">
      <header class="dialog-header">
        <h3>{{ patientName }} 的待辦事項</h3>
        <button class="close-btn" @click="emit('close')" title="關閉">×</button>
      </header>
      <main class="dialog-content">
        <ul v-if="memos.length > 0" class="memo-list-in-dialog">
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
        <!-- 【修改】給按鈕加上 class，以便應用新樣式 -->
        <button class="btn-primary" @click="emit('close')">關閉</button>
      </footer>
    </div>
  </dialog>
</template>

<script setup>
defineProps({
  isVisible: Boolean,
  patientName: String,
  memos: {
    type: Array,
    default: () => [],
  },
})
const emit = defineEmits(['close'])
</script>

<style scoped>
.memo-dialog {
  border: 1px solid #ccc;
  border-radius: 12px;
  padding: 0;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 650px;
  z-index: 1001;
}
.memo-dialog::backdrop {
  background-color: rgba(0, 0, 0, 0.4);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid #e9ecef;
  font-size: 1.2rem;
}
.dialog-header h3 {
  margin: 0;
  color: #343a40;
}
.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  padding: 0;
  color: #6c757d;
  transition: color 0.2s;
}
.close-btn:hover {
  color: #000;
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
  padding: 15px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}
.memo-text {
  white-space: pre-wrap;
  word-wrap: break-word;
  font-size: 1.1rem;
  margin: 0 0 10px 0;
  color: #212529;
}
.memo-meta-in-dialog {
  font-size: 0.9rem;
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

/* 【修改】用更完整的按鈕樣式替換原來的 button 樣式 */
.btn-primary {
  padding: 10px 24px; /* 增加上下和左右的內邊距 */
  font-size: 1rem; /* 設定一個標準的字體大小 */
  font-weight: 500; /* 適中的字體粗細 */
  background-color: var(--primary-color, #007bff); /* 使用應用程式的主題色 */
  color: white; /* 文字顏色改為白色以形成對比 */
  border: none; /* 移除邊框 */
  border-radius: 6px; /* 保持圓角 */
  cursor: pointer;
  transition: background-color 0.2s ease; /* 平滑的過渡效果 */
}

.btn-primary:hover {
  background-color: var(--primary-color-dark, #0056b3); /* 滑鼠懸浮時變暗 */
}
</style>
