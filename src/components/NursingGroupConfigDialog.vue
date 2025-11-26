<!-- 檔案路徑: src/components/NursingGroupConfigDialog.vue -->
<template>
  <Teleport to="body">
    <div v-if="modelValue" class="dialog-overlay" @click.self="closeDialog">
      <div class="dialog-container">
        <!-- Header -->
        <header class="dialog-header">
          <h2>護理組別配置</h2>
          <button class="close-btn" @click="closeDialog" title="關閉">
            &times;
          </button>
        </header>

        <!-- Content -->
        <main class="dialog-content">
          <!-- 載入中 -->
          <div v-if="isLoading" class="loading-container">
            <div class="spinner"></div>
            <span>正在載入配置...</span>
          </div>

          <template v-else>
            <!-- 狀態訊息 -->
            <div
              v-if="statusMessage"
              :class="['status-message', statusMessage.type]"
            >
              {{ statusMessage.text }}
            </div>

            <!-- 驗證錯誤訊息 -->
            <div v-if="validationErrors.length > 0" class="validation-errors">
              <strong>配置驗證錯誤：</strong>
              <ul>
                <li v-for="(error, index) in validationErrors" :key="index">{{ error }}</li>
              </ul>
            </div>

            <div class="config-grid">
              <!-- 左側：班別組別設定 -->
              <section class="config-section">
                <h3 class="section-title">班別組別對應設定</h3>

                <!-- 75班組別 -->
                <div class="config-card">
                  <h4 class="card-title">75班組別</h4>
                  <p class="card-description">選擇75班可用的組別（74班將自動排除這些組別）</p>
                  <div class="checkbox-group">
                    <label
                      v-for="group in allGroups"
                      :key="`75-${group}`"
                      class="checkbox-label"
                    >
                      <input
                        type="checkbox"
                        :value="group"
                        v-model="config.shift75Groups"
                        @change="on75GroupChange"
                      />
                      <span class="checkbox-text">{{ group }}</span>
                    </label>
                  </div>
                  <div class="selected-info">
                    已選擇：{{ config.shift75Groups.length }} 組
                    <span v-if="config.shift75Groups.length > 0">
                      ({{ config.shift75Groups.join(', ') }})
                    </span>
                  </div>
                </div>

                <!-- 74班組別 -->
                <div class="config-card">
                  <h4 class="card-title">74班組別</h4>
                  <p class="card-description">選擇74班可用的組別（已排除75班選擇的組別）</p>
                  <div class="checkbox-group">
                    <label
                      v-for="group in allGroups"
                      :key="`74-${group}`"
                      class="checkbox-label"
                      :class="{ disabled: config.shift75Groups.includes(group) }"
                    >
                      <input
                        type="checkbox"
                        :value="group"
                        v-model="config.shift74Groups"
                        :disabled="config.shift75Groups.includes(group)"
                      />
                      <span class="checkbox-text">{{ group }}</span>
                      <span v-if="config.shift75Groups.includes(group)" class="excluded-tag">
                        (75班)
                      </span>
                    </label>
                  </div>
                  <div class="selected-info">
                    已選擇：{{ config.shift74Groups.length }} 組
                  </div>
                </div>

                <!-- 固定分配 -->
                <div class="config-card">
                  <h4 class="card-title">固定分配規則</h4>
                  <div class="fixed-rules">
                    <div class="fixed-rule-item">
                      <span class="shift-badge">74/L</span>
                      <span class="arrow">→</span>
                      <span class="group-badge">A 組</span>
                    </div>
                    <div class="fixed-rule-item">
                      <span class="shift-badge">816</span>
                      <span class="arrow">→</span>
                      <span class="group-badge">外圍</span>
                    </div>
                  </div>
                </div>
              </section>

              <!-- 右側：星期別設定 + 人員限制 -->
              <section class="config-section">
                <!-- 星期別設定 - 晚班 -->
                <div class="config-card">
                  <h3 class="section-title">星期別設定 - 晚班 (311)</h3>

                  <div class="weekday-rule">
                    <h4 class="rule-title">一、三、五</h4>
                    <div class="night-group-select">
                      <div class="checkbox-group compact">
                        <label
                          v-for="group in nightGroupOptions"
                          :key="`night135-${group}`"
                          class="checkbox-label small"
                        >
                          <input
                            type="checkbox"
                            :value="group"
                            v-model="config.nightShiftRules['135'].groups"
                          />
                          <span class="checkbox-text">{{ group }}</span>
                        </label>
                      </div>
                      <div class="selected-info">
                        已選 {{ config.nightShiftRules['135'].groups.length }} 組
                      </div>
                    </div>
                  </div>

                  <div class="weekday-rule">
                    <h4 class="rule-title">二、四、六</h4>
                    <div class="night-group-select">
                      <div class="checkbox-group compact">
                        <label
                          v-for="group in nightGroupOptions"
                          :key="`night246-${group}`"
                          class="checkbox-label small"
                        >
                          <input
                            type="checkbox"
                            :value="group"
                            v-model="config.nightShiftRules['246'].groups"
                          />
                          <span class="checkbox-text">{{ group }}</span>
                        </label>
                      </div>
                      <div class="selected-info">
                        已選 {{ config.nightShiftRules['246'].groups.length }} 組
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 人員限制設定 -->
                <div class="config-card">
                  <h3 class="section-title">不可擔任晚班組長</h3>
                  <p class="card-description">勾選的護理師將不可分配到 A 組</p>

                  <div v-if="nurses.length === 0" class="no-nurses">
                    <p>尚無護理師資料</p>
                  </div>

                  <div v-else class="nurse-restriction-list">
                    <div class="search-box">
                      <input
                        type="text"
                        v-model="nurseSearchQuery"
                        placeholder="搜尋護理師..."
                        class="search-input"
                      />
                    </div>
                    <div class="nurse-checkbox-grid">
                      <label
                        v-for="nurse in filteredNurses"
                        :key="nurse.uid"
                        class="checkbox-label nurse-item"
                      >
                        <input
                          type="checkbox"
                          :value="nurse.uid"
                          v-model="config.cannotBeNightLeader"
                        />
                        <span class="checkbox-text">{{ nurse.name || nurse.displayName }}</span>
                      </label>
                    </div>
                    <div class="selected-info">
                      已限制 {{ config.cannotBeNightLeader.length }} 位
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </template>
        </main>

        <!-- Footer -->
        <footer class="dialog-footer">
          <button @click="resetToDefault" class="btn-secondary" :disabled="isSaving">
            重設預設值
          </button>
          <div class="footer-right">
            <button @click="closeDialog" class="btn-secondary">
              取消
            </button>
            <button
              @click="saveConfig"
              class="btn-primary"
              :disabled="isSaving || validationErrors.length > 0"
            >
              {{ isSaving ? '儲存中...' : '儲存配置' }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useUserDirectory } from '@/composables/useUserDirectory'
import {
  fetchNursingGroupConfig,
  saveNursingGroupConfig,
  getDefaultConfig,
  validateConfig,
} from '@/services/nursingGroupConfigService'

// Props & Emits
const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'saved'])

// Composables
const auth = useAuth()
const { ensureUsersLoaded, users } = useUserDirectory()

// 常數
const allGroups = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
const nightGroupOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

// 狀態
const isLoading = ref(true)
const isSaving = ref(false)
const statusMessage = ref(null)
const nurseSearchQuery = ref('')
const config = ref(getDefaultConfig())

// 護理師列表
const nurses = computed(() => {
  return users.value
    .filter((user) => user.title === '護理師' || user.title === '護理師組長')
    .sort((a, b) => {
      const nameA = a.name || a.displayName || ''
      const nameB = b.name || b.displayName || ''
      return nameA.localeCompare(nameB, 'zh-TW')
    })
})

// 篩選後的護理師列表
const filteredNurses = computed(() => {
  if (!nurseSearchQuery.value) return nurses.value
  const query = nurseSearchQuery.value.toLowerCase()
  return nurses.value.filter((nurse) => {
    const name = (nurse.name || nurse.displayName || '').toLowerCase()
    return name.includes(query)
  })
})

// 驗證錯誤
const validationErrors = computed(() => {
  const result = validateConfig(config.value)
  return result.errors
})

// 當75班組別變更時，自動移除74班中重複的組別
const on75GroupChange = () => {
  config.value.shift74Groups = config.value.shift74Groups.filter(
    (group) => !config.value.shift75Groups.includes(group)
  )
}

// 同步晚班組數
watch(
  () => config.value.nightShiftRules['135'].groups,
  (groups) => {
    config.value.nightShiftRules['135'].count = groups.length
  },
  { deep: true }
)

watch(
  () => config.value.nightShiftRules['246'].groups,
  (groups) => {
    config.value.nightShiftRules['246'].count = groups.length
  },
  { deep: true }
)

// 當 Dialog 開啟時載入配置
watch(
  () => props.modelValue,
  async (isOpen) => {
    if (isOpen) {
      await loadConfig()
    }
  }
)

// 載入配置
const loadConfig = async () => {
  isLoading.value = true
  statusMessage.value = null
  try {
    await ensureUsersLoaded()
    const data = await fetchNursingGroupConfig()
    config.value = {
      ...getDefaultConfig(),
      ...data,
      dayShiftRules: {
        ...getDefaultConfig().dayShiftRules,
        ...(data.dayShiftRules || {}),
      },
      nightShiftRules: {
        ...getDefaultConfig().nightShiftRules,
        ...(data.nightShiftRules || {}),
      },
    }
  } catch (error) {
    console.error('載入配置失敗:', error)
    statusMessage.value = {
      type: 'error',
      text: '載入配置失敗：' + error.message,
    }
  } finally {
    isLoading.value = false
  }
}

// 儲存配置
const saveConfig = async () => {
  if (validationErrors.value.length > 0) {
    statusMessage.value = { type: 'error', text: '請先修正驗證錯誤' }
    return
  }

  isSaving.value = true
  statusMessage.value = null

  try {
    await saveNursingGroupConfig(config.value, auth.currentUser.value)
    statusMessage.value = { type: 'success', text: '配置已成功儲存！' }
    // 通知父元件配置已更新
    emit('saved', config.value)
    // 延遲關閉
    setTimeout(() => {
      closeDialog()
    }, 800)
  } catch (error) {
    console.error('儲存配置失敗:', error)
    statusMessage.value = { type: 'error', text: '儲存失敗：' + error.message }
  } finally {
    isSaving.value = false
  }
}

// 重設為預設值
const resetToDefault = () => {
  if (!confirm('確定要重設為預設值嗎？')) return
  config.value = getDefaultConfig()
  statusMessage.value = { type: 'success', text: '已重設為預設值' }
}

// 關閉 Dialog
const closeDialog = () => {
  emit('update:modelValue', false)
}
</script>

<style scoped>
/* ===== Dialog Overlay ===== */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog-container {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

/* ===== Header ===== */
.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: #2c3e50;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: #333;
}

/* ===== Content ===== */
.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #6c757d;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ===== Config Grid ===== */
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 768px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #1abc9c;
}

.config-card {
  background: #f8f9fa;
  border-radius: 6px;
  padding: 1rem;
}

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #495057;
  margin: 0 0 0.25rem 0;
}

.card-description {
  font-size: 0.8rem;
  color: #6c757d;
  margin: 0 0 0.75rem 0;
}

/* ===== Checkbox Group ===== */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.checkbox-group.compact {
  gap: 0.4rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.6rem;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.checkbox-label:hover:not(.disabled) {
  background: #e9ecef;
}

.checkbox-label.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.checkbox-label.small {
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
}

.checkbox-label input[type="checkbox"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.checkbox-text {
  font-weight: 500;
  color: #495057;
}

.excluded-tag {
  font-size: 0.7rem;
  color: #dc3545;
}

.selected-info {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #6c757d;
}

/* ===== Fixed Rules ===== */
.fixed-rules {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.fixed-rule-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
}

.shift-badge {
  padding: 0.2rem 0.5rem;
  background: #007bff;
  color: white;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}

.arrow {
  color: #6c757d;
}

.group-badge {
  padding: 0.2rem 0.5rem;
  background: #28a745;
  color: white;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
}

/* ===== Weekday Rules ===== */
.weekday-rule {
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e9ecef;
}

.weekday-rule:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.rule-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #495057;
  margin: 0 0 0.5rem 0;
  padding: 0.2rem 0.4rem;
  background: #e9ecef;
  border-radius: 4px;
  display: inline-block;
}

/* ===== Nurse List ===== */
.nurse-restriction-list {
  max-height: 180px;
  overflow-y: auto;
}

.search-box {
  margin-bottom: 0.5rem;
}

.search-input {
  width: 100%;
  padding: 0.4rem 0.6rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 0.85rem;
}

.nurse-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 0.4rem;
  max-height: 120px;
  overflow-y: auto;
  padding: 0.4rem;
  background: white;
  border-radius: 4px;
}

.nurse-item {
  font-size: 0.8rem;
}

.no-nurses {
  padding: 0.75rem;
  text-align: center;
  color: #6c757d;
  background: white;
  border-radius: 4px;
}

/* ===== Status Messages ===== */
.status-message {
  padding: 0.6rem 1rem;
  border-radius: 4px;
  font-size: 0.85rem;
  margin-bottom: 1rem;
}

.status-message.success {
  background-color: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.status-message.error {
  background-color: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.validation-errors {
  background-color: #fff3cd;
  color: #856404;
  border: 1px solid #ffeeba;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.validation-errors ul {
  margin: 0.4rem 0 0 0;
  padding-left: 1.2rem;
}

/* ===== Footer ===== */
.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-top: 1px solid #dee2e6;
  flex-shrink: 0;
}

.footer-right {
  display: flex;
  gap: 0.75rem;
}

.btn-primary,
.btn-secondary {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.9rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-primary {
  background-color: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-primary:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.65;
}

.btn-secondary {
  background-color: #fff;
  color: #495057;
  border: 1px solid #dee2e6;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #f8f9fa;
}
</style>
