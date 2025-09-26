<template>
  <div class="nursing-schedule-container">
    <h1 class="page-title">護理班表與職責</h1>

    <!-- 頁籤導覽列 -->
    <nav class="tabs-nav">
      <button :class="{ active: activeTab === 'master' }" @click="activeTab = 'master'">
        當月總班表
      </button>
      <button :class="{ active: activeTab === 'weekly' }" @click="activeTab = 'weekly'">
        當月週班表
      </button>
      <button
        :class="{ active: activeTab === 'responsibilities' }"
        @click="activeTab = 'responsibilities'"
      >
        護理當班分組工作職責
      </button>
    </nav>

    <!-- 頁籤內容區域 -->
    <main class="tab-content">
      <!-- ... (其他頁籤保持不變) ... -->

      <!-- 3. 護理當班分組工作職責 -->
      <div v-if="activeTab === 'responsibilities'" class="tab-pane">
        <header class="pane-header">
          <h2 class="table-title">洗腎中心當班分組工作職責</h2>
          <div class="header-actions">
            <span
              v-if="lastModifiedInfo.date"
              class="revision-date"
              :title="`最後修改者: ${lastModifiedInfo.user}`"
            >
              {{ lastModifiedInfo.date }} 修訂
            </span>
            <button
              @click="saveData"
              :disabled="!hasChanges || !auth.isAdmin.value"
              class="save-button"
              title="儲存所有修改"
            >
              <i class="fas fa-save"></i> 儲存
            </button>
          </div>
        </header>

        <!-- 大文字框 -->
        <section class="info-section">
          <div @click="enterEditMode('announcement', 0, 'content')">
            <!-- ✨ 使用 div 和 white-space: pre-wrap 來顯示，v-html 保持不變 ✨ -->
            <div
              v-if="!isEditing('announcement', 0, 'content')"
              class="editable-text announcement-text"
              v-html="formatText(announcementText)"
            ></div>
            <textarea
              v-else
              :ref="(el) => setInputRef(el)"
              v-model="announcementText"
              @blur="exitEditMode"
              class="edit-input announcement-input"
            ></textarea>
          </div>
        </section>

        <!-- 第一個表格：班別職責 -->
        <section class="duties-section">
          <table class="duties-table">
            <thead>
              <tr>
                <th class="shift-type-col">班別</th>
                <th class="shift-code-col">班次代碼</th>
                <th class="tasks-col">各組負責項目</th>
              </tr>
            </thead>
            <tbody>
              <!-- 白班 (合併後) -->
              <tr>
                <td class="shift-type-cell"><strong>白班</strong></td>
                <td @click="enterEditMode('dayShift', 0, 'codes')">
                  <div
                    v-if="!isEditing('dayShift', 0, 'codes')"
                    class="editable-text"
                    v-html="formatText(dayShiftData.codes)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="dayShiftData.codes"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
                <td @click="enterEditMode('dayShift', 0, 'tasks')">
                  <div
                    v-if="!isEditing('dayShift', 0, 'tasks')"
                    class="editable-text task-text"
                    v-html="formatText(dayShiftData.tasks)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="dayShiftData.tasks"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
              </tr>
              <!-- 夜班 -->
              <tr v-for="(duty, index) in nightShiftDuties" :key="`night-${index}`">
                <td v-if="index === 0" :rowspan="nightShiftDuties.length" class="shift-type-cell">
                  <strong>夜班</strong>
                </td>
                <td @click="enterEditMode('nightShift', index, 'code')">
                  <span v-if="!isEditing('nightShift', index, 'code')" class="editable-text">{{
                    duty.code
                  }}</span>
                  <input
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="duty.code"
                    @blur="exitEditMode"
                    class="edit-input-inline"
                  />
                </td>
                <td @click="enterEditMode('nightShift', index, 'tasks')">
                  <div
                    v-if="!isEditing('nightShift', index, 'tasks')"
                    class="editable-text task-text"
                    v-html="formatText(duty.tasks)"
                  ></div>
                  <textarea
                    v-else
                    :ref="(el) => setInputRef(el)"
                    v-model="duty.tasks"
                    @blur="exitEditMode"
                    class="edit-input"
                  ></textarea>
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- 第二個表格：關門檢查 & 互助合作 -->
        <div class="closing-section">
          <div class="closing-column">
            <h3 class="table-title">關門前結束檢查</h3>
            <div class="checklist">
              <div
                v-for="(item, index) in checklistItems"
                :key="index"
                @click="enterEditMode('checklist', index, 'item')"
                class="check-item"
              >
                <span class="checkbox"></span>
                <span v-if="!isEditing('checklist', index, 'item')" class="editable-text">{{
                  item
                }}</span>
                <input
                  v-else
                  :ref="(el) => setInputRef(el)"
                  v-model="checklistItems[index]"
                  @blur="exitEditMode"
                  class="edit-input-inline"
                />
              </div>
            </div>
          </div>
          <div class="closing-column">
            <h3 class="table-title">互助合作組</h3>
            <div class="teamwork-list">
              <div
                v-for="(item, index) in teamworkItems"
                :key="index"
                @click="enterEditMode('teamwork', index, 'item')"
              >
                <div
                  v-if="!isEditing('teamwork', index, 'item')"
                  class="editable-text"
                  v-html="formatText(item)"
                ></div>
                <textarea
                  v-else
                  :ref="(el) => setInputRef(el)"
                  v-model="teamworkItems[index]"
                  @blur="exitEditMode"
                  class="edit-input"
                ></textarea>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted } from 'vue'
import { useAuth } from '@/composables/useAuth.js'

// ... (模擬的 useGlobalNotifier 保持不變) ...

const { createGlobalNotification } = {
  createGlobalNotification: (msg, type) => {
    alert(`[${type.toUpperCase()}] ${msg}`)
  },
}

// ... (所有 ref 和狀態管理保持不變) ...
const activeTab = ref('responsibilities')
const auth = useAuth()
const announcementText = ref('')
const dayShiftData = ref({ codes: '', tasks: '' })
const nightShiftDuties = ref([])
const checklistItems = ref([])
const teamworkItems = ref([])
const lastModifiedInfo = ref({ date: '', user: '' })
const hasChanges = ref(false)
const editingCell = ref(null)
let inputRef = null

// ✨ 核心修正 1: 這是最終的、能正確處理標籤和換行的版本 ✨
const formatText = (text) => {
  if (!text) return ''

  // 1. 先對 HTML 特殊字元進行轉義
  const escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 2. 使用正規表示式，為所有符合條件的標籤包裹上 <strong>
  //    這次，我們不再處理換行符號，讓 CSS 來負責
  const html = escapedText.replace(
    /^([A-Z]{1,3}\s?組[:：]|QW\d\s?|※||組長:|互助小組長:|(?:\d\.\s))(.*)/gm,
    (match, p1, p2) => {
      const tagText = p1.trim()
      let tagClass = 'group-tag'
      let groupLetter = tagText.replace(/[^A-Z0-9]/g, '')

      if (tagText.startsWith('※') || tagText.startsWith('')) {
        tagClass += ' is-note'
      } else if (tagText.startsWith('組長') || tagText.startsWith('互助')) {
        tagClass += ' is-leader'
      } else if (/^\d\./.test(tagText)) {
        tagClass += ' is-numeric'
      } else {
        tagClass += ` group-${groupLetter}`
      }

      return `<strong class="${tagClass}">${p1}</strong>${p2}`
    },
  )

  return html
}
// ... (所有其他 script 內容，例如 enterEditMode, loadData, saveData 等，都保持不變) ...
const setInputRef = (el) => {
  if (el) inputRef = el
}
watch(
  [announcementText, dayShiftData, nightShiftDuties, checklistItems, teamworkItems],
  () => {
    hasChanges.value = true
  },
  { deep: true, immediate: false },
)
const enterEditMode = async (type, rowIndex, field) => {
  if (!auth.isAdmin.value) return
  editingCell.value = { type, rowIndex, field }
  await nextTick()
  if (inputRef) {
    inputRef.focus()
    inputRef.select()
  }
}
const exitEditMode = () => {
  editingCell.value = null
}
const isEditing = (type, rowIndex, field) => {
  return (
    editingCell.value?.type === type &&
    editingCell.value?.rowIndex === rowIndex &&
    editingCell.value?.field === field
  )
}
const loadData = async () => {
  announcementText.value =
    '一、班別規則：護病比為1:4為原則，採團隊分工方式執行，無法執行時主動告知與協助。\n二、休息時間：實際狀況依各組協調調整，給予30分鐘。務必配合以免影響他人，白班為11:00-11:30；11:30-12:00；13:20-13:50，晚班為18:00-18:30；18:30-19:00；19:00-19:30。\n三、各班組別工作內容'
  dayShiftData.value = {
    codes: '7-3*9\n8-4*1\n7-5*2',
    tasks:
      'A 組：預備機化消及測餘氯。\nB 組：點班(急救車、電擊器測試)。備 12-8，午班用物。\nQW3 血糖機測試並上傳測試數值。 (試劑沒有向檢驗科拿，試紙沒了請書記備)\nC 組：支援 ICU 組(含備機)，如 ICU 組被 P，接 ICU 組， ICU 機台化消及餘氯檢測，需 cover ICU 組吃飯時間 30 分鐘(要自行電話與 ICU 組約時間但要避開 OPD 上下針時間 11:30-13:00)。\nD 組：送消、點班(衛材、庫房溫溼度)、整理供應室衛材歸位， NO.1。\nE 組：點班(氧療、冰箱溫度、補充冰箱常備藥)。 NO.2。每月最後一周 W1 須執行氧氣桶鋼瓶 查核表(114.07.17)\nF 組：電訪關心病患， NO.3。\nG 組：協助準備醫師拔 D/L 備物及病人觀察。\nH 組： 住院組。\nI 組： 住院組。\nJ 組： W3 泡製 3 桶消毒液。 W6 幫忙協助收行動 RO 機(若 ICU 組無法收機時)\nK 組：擔任 Leader。\nICU 組：接 ICU 組， ICU 機台化消及餘氯檢測， W6 協助收行動 RO 機。\n※若放 P 一整天，則該組工作由 G 組負責。\n※若當日僅有十組組別，組長則併入 A 組， A 組負責工作由 G 組協助完成。\n※白班 12-8 組別由 Leader 安排。',
  }
  nightShiftDuties.value = [
    {
      code: '3-11*8or9',
      tasks:
        'A 組: 擔任 Leader，核對當日人數， 將當日護理日誌、排程，隔天分組匯出轉 PDF 黨並存檔 (114.09.01 更新) ， 下班前須到 PD 衛教室電腦開啟隔日診間叫號系統(114.09.22 更新)。\nB 組: 10PM 後核對隔日娃娃頭與電腦排程是否一致，並須製作隔日早班洗腎住院床 病人移動方式，排主護(排到中班收針列)及 Leader 牌。備隔日 B 組 AK。\nC 組: 接 ICU 組，協同 B 組核對隔日娃娃頭、 W4 補充 ICU 消毒液，備隔日 C+D 組 AK。若 G 組 放 P 時，備 K 組 AK。\nD 組: 點班(衛材)，備隔日 E+F 組 AK， NO.1。\nE 組: 點班(氧療、冰箱)、備隔日 I+J 組 AK， NO.2，若 H 組放 P，協助點班(急 救車)。\nF 組: 接 12-8，備隔日 G+H 組 AK。 (每月 1 號點消防箱物資，遇假日順延。 )， NO.3。\nG 組: 住院組、 備隔日 K 組 AK。\nH 組: 住院組、 點班(急救車) 。\nI 組: 備隔日 A 組 AK。關門前結束檢查(項目見背面)若 C 組去洗 ICU，則協同 B 組核對隔日 娃娃頭。\n※若當日僅有 8 組組別， I 組負責工作由 A 組協助完成。\nQW4 夜班倒酸。\n 若放 P3-8 班，放 P 人員須自行完成該組工作職責。\n 每個月雙週的 W5 需刷機器。\n 每週星期一夜班汙水管需倒漂白水(A 組倒 1-7 床； B 組倒 8-15； C 組倒 16-22 床； D 組 倒 23-29 床； E 組倒 35-41 床； F 組倒 42-48 床； G 組倒 49-55 床； H 組倒 31-33 床)(若 H 組放 P 則由 G 組協助倒漂白水)',
    },
  ]
  checklistItems.value = [
    '電視儀器電源，遙控器收回。',
    '周圍設備歸位，空桶補好，管路放好。',
    '1234 門及庫房門上鎖。',
    '護理車關機，物品確認補充否。',
    '儀器及病床周邊消毒無血漬。',
    '護理站餐桌維持整齊，無標示者丟棄。',
    '護理站關電腦及燈光。',
    '檢體送檢。',
  ]
  teamworkItems.value = [
    '組長: C. A. B. C. 一組。',
    '組長: F. D. E. F. 一組（夜班加 I 組）。',
    '組長: H. G. H. I. 一組。',
    '互助小組長: (現場至少要有三位巡視)',
    '1. 關懷分配同仁用餐。',
    '2. 用餐前確認工作並告知病人誰 COVER。',
    '3. COVER 者主動巡視病人或協助查房。',
  ]
  lastModifiedInfo.value = { date: '114.09.22', user: '系統預設' }
  await nextTick()
  hasChanges.value = false
}
const saveData = async () => {
  if (!hasChanges.value || !auth.isAdmin.value) return
  try {
    const now = new Date()
    const formattedDate = `${now.getFullYear() - 1911}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')}`
    const currentUserFullName = auth.currentUser.value?.name || '未知使用者'
    const payload = {
      announcement: announcementText.value,
      dayShift: dayShiftData.value,
      nightShift: nightShiftDuties.value,
      checklist: checklistItems.value,
      teamwork: teamworkItems.value,
      lastModified: { date: formattedDate, user: currentUserFullName },
    }
    console.log('正在儲存:', payload)
    lastModifiedInfo.value = payload.lastModified
    hasChanges.value = false
    exitEditMode()
    createGlobalNotification('工作職責已成功儲存！', 'success')
  } catch (error) {
    createGlobalNotification('儲存失敗，請稍後再試', 'error')
  }
}
onMounted(() => {
  loadData()
})
</script>

<style scoped>
/* ✨ 核心修改：在 editable-text 中加入 white-space: pre-wrap ✨ */
.editable-text {
  display: block;
  width: 100%;
  min-height: 24px;
  cursor: text;
  padding: 5px;
  border-radius: 4px;
  transition: background-color 0.2s;
  white-space: pre-wrap; /* 確保顯示時也能換行 */
}
/* ... (其餘所有 CSS 樣式保持不變) ... */
.nursing-schedule-container {
  padding: 1.5rem;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.page-title {
  font-size: 2rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 1.5rem;
}
.tabs-nav {
  display: flex;
  border-bottom: 2px solid #dee2e6;
  margin-bottom: 1.5rem;
}
.tabs-nav button {
  padding: 0.8rem 1.5rem;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  background-color: transparent;
  cursor: pointer;
  color: #495057;
  position: relative;
  transition: color 0.2s;
}
.tabs-nav button::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--primary-color, #1abc9c);
  transform: scaleX(0);
  transition: transform 0.3s ease;
}
.tabs-nav button.active {
  color: var(--primary-color, #1abc9c);
}
.tabs-nav button.active::after {
  transform: scaleX(1);
}
.tab-content .placeholder {
  padding: 3rem;
  text-align: center;
  background-color: #f8f9fa;
  border-radius: 6px;
}
.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.table-title,
.info-section h3 {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.revision-date {
  font-size: 0.9rem;
  color: #6c757d;
  font-style: italic;
  cursor: help;
}
.save-button {
  background-color: var(--primary-color, #1abc9c);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  font-weight: bold;
  transition: background-color 0.2s;
}
.save-button:hover:not(:disabled) {
  background-color: #16a085;
}
.save-button:disabled {
  background-color: #bdc3c7;
  cursor: not-allowed;
}

.info-section {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 1.5rem;
  margin-bottom: 2rem;
}
.announcement-text {
  white-space: pre-wrap;
  line-height: 1.7;
}

.duties-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 2rem;
}
.duties-table th,
.duties-table td {
  border: 1px solid #dee2e6;
  padding: 0.8rem;
  text-align: left;
  vertical-align: top;
}
.duties-table th {
  background-color: #f8f9fa;
}
.shift-type-col {
  width: 10%;
  text-align: center;
}
.shift-code-col {
  width: 15%;
}
.tasks-col {
  width: 75%;
}
.shift-type-cell {
  font-weight: bold;
  text-align: center;
  vertical-align: middle;
  background-color: #f8f9fa;
}

.editable-text:hover {
  background-color: #ecf0f1;
}

/* ✨ 核心修正 2: 讓 CSS 來處理換行 ✨ */
.task-text {
  /* display: flex; <- 移除這行 */
  /* flex-direction: column; <- 移除這行 */
  /* gap: 0.5rem; <- 移除這行 */
  white-space: pre-wrap; /* 關鍵！讓換行符 \n 生效 */
  line-height: 1.7; /* 調整行高以提升易讀性 */
}

.edit-input,
.edit-input-inline {
  width: 100%;
  padding: 5px;
  border: 2px solid var(--primary-color, #1abc9c);
  border-radius: 4px;
  font-family: inherit;
  font-size: inherit;
  box-sizing: border-box;
}
.edit-input {
  resize: vertical;
  min-height: 100px;
}
.announcement-input {
  min-height: 120px;
}

.closing-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  border-top: 2px solid #dee2e6;
  padding-top: 1.5rem;
}
.closing-column .table-title {
  border-bottom: 2px solid #dee2e6;
  padding-bottom: 0.5rem;
}
.checklist {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.check-item {
  display: flex;
  align-items: center;
}
.checkbox {
  display: inline-block;
  width: 20px;
  height: 20px;
  border: 2px solid #adb5bd;
  border-radius: 4px;
  margin-right: 0.8rem;
  flex-shrink: 0;
}
.teamwork-list .editable-text {
  margin: 0 0 0.8rem 0;
}

:deep(.task-line) {
  line-height: 1.6;
}
:deep(.group-tag) {
  display: inline-block;
  color: white;

  /* ✨ 核心修正：減少上下的 padding，讓膠囊變瘦 ✨ */
  padding: 1px 8px; /* 上下1px, 左右8px */

  border-radius: 12px;
  margin-right: 0.7em;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.9em;
  font-weight: bold;

  /* ✨ 新增：讓文字在瘦膠囊中垂直居中 ✨ */
  line-height: 1.5;
}

:deep(.group-A) {
  background-color: #3498db;
}
:deep(.group-B) {
  background-color: #2ecc71;
}
:deep(.group-C) {
  background-color: #1abc9c;
}
:deep(.group-D) {
  background-color: #9b59b6;
}
:deep(.group-E) {
  background-color: #f1c40f;
}
:deep(.group-F) {
  background-color: #e67e22;
}
:deep(.group-G) {
  background-color: #e74c3c;
}
:deep(.group-H) {
  background-color: #d35400;
}
:deep(.group-I) {
  background-color: #34495e;
}
:deep(.group-J) {
  background-color: #7f8c8d;
}
:deep(.group-K) {
  background-color: #2c3e50;
  color: #f1c40f;
}
:deep(.group-ICU) {
  background-color: #c0392b;
}
:deep(.group-QW3),
:deep(.group-QW4) {
  background-color: #5d6d7e;
}

:deep(.group-tag.is-note) {
  background-color: #f8f9fa;
  color: #495057;
  border: 1px solid #dee2e6;
  padding: 2px 6px;
  border-radius: 4px;
}
:deep(.group-tag.is-leader),
:deep(.group-tag.is-numeric) {
  background-color: transparent;
  color: #2c3e50;
  padding: 0;
  margin: 0;
  border-radius: 0;
  font-weight: bold;
}
</style>
