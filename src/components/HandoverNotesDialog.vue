<!-- 檔案路徑: src/components/HandoverNotesDialog.vue (可獨立儲存版) -->
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
          :disabled="isSaving"
        ></textarea>
        <p class="dialog-description">此處僅記錄組長交班事項，不會顯示於公開公告。</p>
      </main>
      <footer class="dialog-footer">
        <button class="btn btn-secondary" @click="closeDialog" :disabled="isSaving">取消</button>
        <button class="btn btn-primary" @click="saveNotes" :disabled="isSaving">
          {{ isSaving ? '儲存中...' : '儲存交班事項' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
// ✨ 1. 引入 ApiManager 和 Firestore 的 setDoc, doc ✨
import ApiManager from '@/services/api_manager.js'
import { db } from '@/composables/useFirebase.js'
import { doc, setDoc } from 'firebase/firestore'

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

// ✨ 2. 修改 emit 事件 ✨
const emit = defineEmits(['close', 'notes-updated'])

const editableNotes = ref('')
const isSaving = ref(false) // 新增一個狀態來表示是否正在儲存

// 監聽 props 的 watch 保持不變
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

// ✨ 3. 改造 saveNotes 函式，使其可以直接寫入後端 ✨
async function saveNotes() {
  if (isSaving.value) return // 防止重複點擊
  isSaving.value = true

  try {
    // 取得 daily_logs 集合的引用
    const dailyLogsApi = ApiManager('daily_logs')
    // 文件的 ID 就是日期字串 (YYYY-MM-DD)
    const logDocRef = doc(db, 'daily_logs', props.targetDate)

    // 使用 setDoc 搭配 { merge: true }
    // 這會更新 handoverNotes 欄位，如果文件或欄位不存在，則會建立它，
    // 同時不會影響文件中的其他欄位（如營運統計等）。
    await setDoc(logDocRef, { handoverNotes: editableNotes.value }, { merge: true })

    // 儲存成功後，通知父元件資料已更新
    emit('notes-updated')
    // 關閉對話框
    closeDialog()
  } catch (error) {
    console.error('儲存交班事項失敗:', error)
    // 在這裡可以加入一個錯誤提示給使用者
    alert(`儲存失敗：${error.message}`)
  } finally {
    isSaving.value = false // 無論成功或失敗，都結束儲存狀態
  }
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

.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
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
