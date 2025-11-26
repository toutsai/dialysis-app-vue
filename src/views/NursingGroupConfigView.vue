<!-- 檔案路徑: src/views/NursingGroupConfigView.vue -->
<template>
  <div class="config-container">
    <header class="page-header">
      <div class="header-main-content">
        <h1 class="page-title">護理組別配置</h1>
        <p class="page-description">設定護理師組別分配規則，調整後將影響班表自動分組的結果。</p>
      </div>
    </header>

    <!-- 載入中 -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner"></div>
      <span>正在載入配置...</span>
    </div>

    <!-- 主要內容 -->
    <main v-else class="config-content">
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
          <h2 class="section-title">班別組別對應設定</h2>

          <!-- 75班組別 (先選，因為會影響74班可選的) -->
          <div class="config-card">
            <h3 class="card-title">75班組別</h3>
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
            <h3 class="card-title">74班組別</h3>
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
                  (75班使用)
                </span>
              </label>
            </div>
            <div class="selected-info">
              已選擇：{{ config.shift74Groups.length }} 組
              <span v-if="config.shift74Groups.length > 0">
                ({{ config.shift74Groups.join(', ') }})
              </span>
            </div>
          </div>

          <!-- 固定分配 -->
          <div class="config-card">
            <h3 class="card-title">固定分配規則</h3>
            <p class="card-description">以下班別固定分配到指定組別（無法修改）</p>
            <div class="fixed-rules">
              <div class="fixed-rule-item">
                <span class="shift-badge">74/L</span>
                <span class="arrow">→</span>
                <span class="group-badge">A 組</span>
                <span class="rule-note">（組長班）</span>
              </div>
              <div class="fixed-rule-item">
                <span class="shift-badge">816</span>
                <span class="arrow">→</span>
                <span class="group-badge">外圍</span>
                <span class="rule-note">（固定）</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 右側：星期別設定 + 人員限制 -->
        <section class="config-section">
          <!-- 星期別設定 - 早班 -->
          <div class="config-card">
            <h2 class="section-title">星期別設定 - 早班</h2>

            <div class="weekday-rule">
              <h4 class="rule-title">一、三、五</h4>
              <div class="rule-inputs">
                <div class="input-group">
                  <label>74班組數：</label>
                  <input
                    type="number"
                    v-model.number="config.dayShiftRules['135'].shift74Count"
                    min="0"
                    :max="config.shift74Groups.length"
                  />
                  <span class="max-hint">/ 最多 {{ config.shift74Groups.length }}</span>
                </div>
                <div class="input-group">
                  <label>75班組數：</label>
                  <input
                    type="number"
                    v-model.number="config.dayShiftRules['135'].shift75Count"
                    min="0"
                    :max="config.shift75Groups.length"
                  />
                  <span class="max-hint">/ 最多 {{ config.shift75Groups.length }}</span>
                </div>
              </div>
            </div>

            <div class="weekday-rule">
              <h4 class="rule-title">二、四、六</h4>
              <div class="rule-inputs">
                <div class="input-group">
                  <label>74班組數：</label>
                  <input
                    type="number"
                    v-model.number="config.dayShiftRules['246'].shift74Count"
                    min="0"
                    :max="config.shift74Groups.length"
                  />
                  <span class="max-hint">/ 最多 {{ config.shift74Groups.length }}</span>
                </div>
                <div class="input-group">
                  <label>75班組數：</label>
                  <input
                    type="number"
                    v-model.number="config.dayShiftRules['246'].shift75Count"
                    min="0"
                    :max="config.shift75Groups.length"
                  />
                  <span class="max-hint">/ 最多 {{ config.shift75Groups.length }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 星期別設定 - 晚班 -->
          <div class="config-card">
            <h2 class="section-title">星期別設定 - 晚班 (311)</h2>

            <div class="weekday-rule">
              <h4 class="rule-title">一、三、五</h4>
              <div class="night-group-select">
                <label>晚班組別：</label>
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
                <label>晚班組別：</label>
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
            <h2 class="section-title">人員限制設定</h2>
            <p class="card-description">勾選的護理師將不可擔任晚班組長（A組）</p>

            <div v-if="nurses.length === 0" class="no-nurses">
              <p>尚無護理師資料，請先在使用者管理中新增護理師。</p>
            </div>

            <div v-else class="nurse-restriction-list">
              <div class="search-box">
                <input
                  type="text"
                  v-model="nurseSearchQuery"
                  placeholder="搜尋護理師姓名..."
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
                已限制 {{ config.cannotBeNightLeader.length }} 位護理師不可擔任晚班組長
              </div>
            </div>
          </div>
        </section>
      </div>

      <!-- 儲存按鈕 -->
      <div class="action-buttons">
        <button
          @click="resetToDefault"
          class="btn-secondary"
          :disabled="isSaving"
        >
          重設為預設值
        </button>
        <button
          @click="saveConfig"
          class="btn-primary"
          :disabled="isSaving || validationErrors.length > 0"
        >
          {{ isSaving ? '儲存中...' : '儲存配置' }}
        </button>
      </div>

      <!-- 最後修改資訊 -->
      <div v-if="config.lastModified?.date" class="last-modified">
        最後修改：{{ formatLastModified(config.lastModified) }}
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '@/composables/useAuth'
import { useUserDirectory } from '@/composables/useUserDirectory'
import {
  fetchNursingGroupConfig,
  saveNursingGroupConfig,
  getDefaultConfig,
  validateConfig,
} from '@/services/nursingGroupConfigService'

// Composables
const auth = useAuth()
const { ensureUsersLoaded, users } = useUserDirectory()

// 所有可選組別 (B-J)
const allGroups = ['B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']

// 晚班可選組別
const nightGroupOptions = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']

// 狀態
const isLoading = ref(true)
const isSaving = ref(false)
const statusMessage = ref(null)
const nurseSearchQuery = ref('')

// 配置資料
const config = ref(getDefaultConfig())

// 護理師列表（只取護理師和護理師組長）
const nurses = computed(() => {
  return users.value.filter(
    (user) => user.title === '護理師' || user.title === '護理師組長'
  ).sort((a, b) => {
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

// 載入配置
const loadConfig = async () => {
  isLoading.value = true
  try {
    await ensureUsersLoaded()
    const data = await fetchNursingGroupConfig()
    // 合併預設值，確保所有欄位都存在
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
    statusMessage.value = {
      type: 'error',
      text: '請先修正驗證錯誤',
    }
    return
  }

  isSaving.value = true
  statusMessage.value = null

  try {
    await saveNursingGroupConfig(config.value, auth.currentUser.value)
    statusMessage.value = {
      type: 'success',
      text: '配置已成功儲存！',
    }
    // 重新載入以取得最新的 lastModified
    await loadConfig()
  } catch (error) {
    console.error('儲存配置失敗:', error)
    statusMessage.value = {
      type: 'error',
      text: '儲存失敗：' + error.message,
    }
  } finally {
    isSaving.value = false
  }
}

// 重設為預設值
const resetToDefault = () => {
  if (!confirm('確定要重設為預設值嗎？所有自訂設定將會被覆蓋。')) {
    return
  }
  config.value = getDefaultConfig()
  statusMessage.value = {
    type: 'success',
    text: '已重設為預設值，請點擊「儲存配置」以保存變更。',
  }
}

// 格式化最後修改時間
const formatLastModified = (lastModified) => {
  if (!lastModified) return ''

  let dateStr = ''
  if (lastModified.date) {
    if (lastModified.date.toDate) {
      // Firestore Timestamp
      const date = lastModified.date.toDate()
      dateStr = date.toLocaleString('zh-TW')
    } else if (typeof lastModified.date === 'string') {
      dateStr = lastModified.date
    }
  }

  const userName = lastModified.userName || '未知'
  return `${dateStr} by ${userName}`
}

// 初始化
onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
/* ===== 基礎容器樣式 ===== */
.config-container {
  padding: 10px;
  background-color: #f8f9fa;
  min-height: calc(100vh - 100px);
}

.page-title {
  font-size: 32px;
  font-weight: bold;
  color: #2c3e50;
  margin: 0 0 0.5rem 0;
}

.page-description {
  font-size: 1rem;
  color: #6c757d;
  margin: 0;
}

/* ===== Loading ===== */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  color: #6c757d;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ===== 主要內容 ===== */
.config-content {
  margin-top: 1.5rem;
}

.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
}

@media (max-width: 1200px) {
  .config-grid {
    grid-template-columns: 1fr;
  }
}

/* ===== 區塊樣式 ===== */
.config-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 0.5rem 0;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #1abc9c;
}

.config-card {
  background: white;
  border-radius: 8px;
  padding: 1.25rem;
  border: 1px solid #dee2e6;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: #495057;
  margin: 0 0 0.25rem 0;
}

.card-description {
  font-size: 0.85rem;
  color: #6c757d;
  margin: 0 0 1rem 0;
}

/* ===== Checkbox 群組 ===== */
.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.checkbox-group.compact {
  gap: 0.5rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.checkbox-label:hover:not(.disabled) {
  background: #e9ecef;
  border-color: #adb5bd;
}

.checkbox-label.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  background: #e9ecef;
}

.checkbox-label.small {
  padding: 0.25rem 0.5rem;
  font-size: 0.85rem;
}

.checkbox-label input[type="checkbox"] {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.checkbox-text {
  font-weight: 500;
  color: #495057;
}

.excluded-tag {
  font-size: 0.75rem;
  color: #dc3545;
  margin-left: 0.25rem;
}

.selected-info {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  color: #6c757d;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
}

/* ===== 固定規則 ===== */
.fixed-rules {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.fixed-rule-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: #f8f9fa;
  border-radius: 4px;
}

.shift-badge {
  padding: 0.25rem 0.75rem;
  background: #007bff;
  color: white;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
}

.arrow {
  color: #6c757d;
  font-size: 1.2rem;
}

.group-badge {
  padding: 0.25rem 0.75rem;
  background: #28a745;
  color: white;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.9rem;
}

.rule-note {
  font-size: 0.85rem;
  color: #6c757d;
}

/* ===== 星期別設定 ===== */
.weekday-rule {
  margin-bottom: 1.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid #e9ecef;
}

.weekday-rule:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.rule-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #495057;
  margin: 0 0 0.75rem 0;
  padding: 0.25rem 0.5rem;
  background: #e9ecef;
  border-radius: 4px;
  display: inline-block;
}

.rule-inputs {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.input-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.input-group label {
  font-size: 0.9rem;
  color: #495057;
  font-weight: 500;
}

.input-group input[type="number"] {
  width: 60px;
  padding: 0.4rem 0.5rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 0.9rem;
  text-align: center;
}

.max-hint {
  font-size: 0.8rem;
  color: #6c757d;
}

.night-group-select label {
  font-size: 0.9rem;
  color: #495057;
  font-weight: 500;
  display: block;
  margin-bottom: 0.5rem;
}

/* ===== 人員限制 ===== */
.nurse-restriction-list {
  max-height: 300px;
  overflow-y: auto;
}

.search-box {
  margin-bottom: 0.75rem;
}

.search-input {
  width: 100%;
  padding: 0.5rem 0.75rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 0.9rem;
}

.search-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.nurse-checkbox-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
  max-height: 200px;
  overflow-y: auto;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 4px;
}

.nurse-item {
  font-size: 0.85rem;
}

.no-nurses {
  padding: 1rem;
  text-align: center;
  color: #6c757d;
  background: #f8f9fa;
  border-radius: 4px;
}

/* ===== 狀態訊息 ===== */
.status-message {
  padding: 0.75rem 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
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
  padding: 0.75rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.validation-errors ul {
  margin: 0.5rem 0 0 0;
  padding-left: 1.25rem;
}

.validation-errors li {
  margin: 0.25rem 0;
}

/* ===== 按鈕 ===== */
.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #dee2e6;
}

.btn-primary,
.btn-secondary {
  padding: 0.6rem 1.5rem;
  border: none;
  border-radius: 4px;
  font-size: 0.95rem;
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
  border-color: #adb5bd;
}

.btn-secondary:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

/* ===== 最後修改資訊 ===== */
.last-modified {
  text-align: right;
  font-size: 0.85rem;
  color: #6c757d;
  margin-top: 1rem;
}
</style>
