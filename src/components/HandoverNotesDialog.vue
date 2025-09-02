<!-- 檔案路徑: src/components/HandoverNotesDialog.vue -->
<template>
  <div v-if="isVisible" class="dialog-overlay" @click.self="closeDialog">
    <div class="dialog-content">
      <header class="dialog-header">
        <h3>組長交班事項 ({{ targetDate }})</h3>
        <button class="close-btn" @click="closeDialog">&times;</button>
      </header>
      <main class="dialog-body">
        <textarea
          v-model="editableNotes"
          placeholder="請在此輸入今日的交班事項，例如：&#10;1. XXX 病人今日有狀況...&#10;2. 明日需注意..."
          rows="15"
          class="notes-textarea"
        ></textarea>
        <p class="dialog-description">此處的內容將會同步顯示在明日「訊息中心」的每日公告中。</p>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="closeDialog">取消</button>
        <button class="btn btn-primary" @click="saveNotes">儲存交班事項</button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  isVisible: {
    type: Boolean,
    required: true,
  },
  initialNotes: {
    type: String,
    default: '',
  },
  targetDate: {
    type: String,
    required: true,
  },
})

const emit = defineEmits(['close', 'save'])

const editableNotes = ref('')

// 當 props.initialNotes 變化時 (例如，父元件載入新資料)，更新本地的 ref
watch(
  () => props.initialNotes,
  (newVal) => {
    editableNotes.value = newVal
  },
  { immediate: true },
)

function closeDialog() {
  emit('close')
}

function saveNotes() {
  emit('save', editableNotes.value)
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog-content {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  width: 90%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
}

.dialog-header h3 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}

.dialog-body {
  padding: 1.5rem;
}

.notes-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  line-height: 1.6;
  resize: vertical;
}

.dialog-description {
  font-size: 0.875rem;
  color: #6c757d;
  margin-top: 0.75rem;
  text-align: center;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #dee2e6;
  background-color: #f8f9fa;
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 500;
  font-size: 1rem;
}

.btn-secondary {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}

.btn-primary {
  background-color: #007bff;
  color: white;
  border-color: #007bff;
}
</style>
