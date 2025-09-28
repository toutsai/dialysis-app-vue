<!-- 檔案路徑: src/views/NursingScheduleView.vue (完整重構版) -->
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
      <!-- 1. 當月總班表 -->
      <div v-if="activeTab === 'master'" class="tab-pane">
        <!-- 合併的控制區域 -->
        <section class="controls-section">
          <div class="controls-left">
            <label for="schedule-month">月份：</label>
            <input
              type="month"
              id="schedule-month"
              v-model="selectedMonth"
              @change="loadMonthlySchedule"
            />
            <button @click="loadMonthlySchedule" :disabled="isLoadingSchedule" class="btn-primary">
              {{ isLoadingSchedule ? '載入中...' : '重新載入' }}
            </button>
          </div>

          <div class="controls-right">
            <label class="file-upload-label">
              <input
                type="file"
                @change="handleFileUpload"
                accept=".xlsx, .xls"
                :disabled="isUploading"
                class="file-input-hidden"
              />
              <span class="btn-secondary">
                <i class="fas fa-file-excel"></i>
                {{ selectedFile ? selectedFile.name : '選擇檔案' }}
              </span>
            </label>
            <button
              @click="processAndUpload"
              :disabled="!selectedFile || isUploading"
              class="btn-primary"
            >
              {{ isUploading ? '上傳中...' : '上傳班表' }}
            </button>
          </div>
        </section>

        <!-- 上傳狀態訊息 -->
        <div
          v-if="uploadStatus"
          :class="['status-message', uploadStatus.includes('成功') ? 'success' : 'error']"
        >
          {{ uploadStatus }}
        </div>

        <!-- 班表顯示區域 -->
        <section class="schedule-display-section">
          <div v-if="isLoadingSchedule" class="loading-schedule">
            <div class="spinner"></div>
            <span>正在載入班表資料...</span>
          </div>

          <div v-else-if="!monthlySchedule || !monthlySchedule.scheduleByNurse" class="no-schedule">
            <i class="fas fa-calendar-times"></i>
            <p>本月尚無班表資料</p>
            <p class="hint">請點擊右上方「選擇檔案」上傳 Excel 班表</p>
          </div>

          <div v-else class="schedule-table-wrapper">
            <h3>{{ monthlySchedule.title || `${selectedMonth} 護理班表` }}</h3>

            <table class="schedule-table">
              <thead>
                <tr>
                  <th class="nurse-name-col">護理師</th>
                  <th
                    v-for="dayInfo in monthDays"
                    :key="dayInfo.day"
                    :class="['date-col', { weekend: dayInfo.isWeekend }]"
                  >
                    <div class="date-num">{{ dayInfo.day }}</div>
                    <div class="weekday">{{ dayInfo.weekday }}</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(nurseData, nurseId) in sortedSchedule" :key="nurseId">
                  <td class="nurse-name">
                    {{ nurseData.nurseName }}
                    <span v-if="showUsername && nurseData.nurseUsername" class="nurse-username">
                      ({{ nurseData.nurseUsername }})
                    </span>
                  </td>
                  <td
                    v-for="(dayInfo, index) in monthDays"
                    :key="`${nurseId}-${index}`"
                    :class="['shift-cell', { weekend: dayInfo.isWeekend }]"
                  >
                    <span
                      v-if="nurseData.shifts && nurseData.shifts[index]"
                      :class="getShiftClass(nurseData.shifts[index])"
                    >
                      {{ nurseData.shifts[index] }}
                    </span>
                    <span v-else class="empty-cell">-</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- 2. 當月週班表 -->
      <div v-if="activeTab === 'weekly'" class="tab-pane">
        <div class="placeholder">
          <i class="fas fa-calendar-week"></i>
          <h2>當月週班表</h2>
          <p>功能開發中...</p>
        </div>
      </div>

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
              {{ lastModifiedInfo.date }} 修改
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
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import * as XLSX from 'xlsx'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import { fetchDuties, saveDuties } from '@/services/optimizedApiService.js'

const { createGlobalNotification } = {
  createGlobalNotification: (msg, type) => {
    alert(`[${type.toUpperCase()}] ${msg}`)
  },
}

// --- 狀態管理 ---
const activeTab = ref('master')
const auth = useAuth()
const hasChanges = ref(false)
const editingCell = ref(null)
let inputRef = null

// "當月總班表" 頁籤的狀態
const selectedFile = ref(null)
const isUploading = ref(false)
const isLoadingSchedule = ref(true)
const uploadStatus = ref('')
const monthlySchedule = ref(null)
const selectedMonth = ref(new Date().toISOString().slice(0, 7))
const showUsername = ref(false) // 是否顯示員工編號

// "工作職責" 頁籤的狀態
const announcementText = ref('')
const dayShiftData = ref({ codes: '', tasks: '' })
const nightShiftDuties = ref([])
const checklistItems = ref([])
const teamworkItems = ref([])
const lastModifiedInfo = ref({ date: '', user: '' })

// --- API 實例 ---
const usersApi = ApiManager('users')
const nursingSchedulesApi = ApiManager('nursing_schedules')

// --- 計算屬性：根據 yearMonth 自動計算該月的日期和星期 ---
const monthDays = computed(() => {
  if (!monthlySchedule.value?.yearMonth && !selectedMonth.value) return []

  const yearMonth = monthlySchedule.value?.yearMonth || selectedMonth.value
  const [year, month] = yearMonth.split('-').map(Number)

  // 取得該月天數
  const daysInMonth = monthlySchedule.value?.maxDaysInMonth || new Date(year, month, 0).getDate()
  const weekdays = ['日', '一', '二', '三', '四', '五', '六']

  const days = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    days.push({
      day: day,
      weekday: weekdays[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    })
  }

  return days
})

// --- 新增計算屬性：排序後的護理師班表 ---
const sortedSchedule = computed(() => {
  if (!monthlySchedule.value?.scheduleByNurse) return {}

  // 取得所有護理師資料並轉為陣列
  const nurses = Object.entries(monthlySchedule.value.scheduleByNurse)

  // 排序邏輯
  nurses.sort((a, b) => {
    const nurseA = a[1]
    const nurseB = b[1]

    // 優先使用 orderIndex（Excel 原始順序）
    if (nurseA.orderIndex !== undefined && nurseB.orderIndex !== undefined) {
      return nurseA.orderIndex - nurseB.orderIndex
    }

    // 其次使用員工編號排序
    if (nurseA.nurseUsername && nurseB.nurseUsername) {
      // 假設員工編號是數字格式
      const numA = parseInt(nurseA.nurseUsername, 10)
      const numB = parseInt(nurseB.nurseUsername, 10)
      if (!isNaN(numA) && !isNaN(numB)) {
        return numA - numB
      }
      // 否則按字串排序
      return nurseA.nurseUsername.localeCompare(nurseB.nurseUsername, 'zh-TW')
    }

    // 最後按姓名排序
    return nurseA.nurseName.localeCompare(nurseB.nurseName, 'zh-TW')
  })

  // 轉回物件格式
  const sortedObj = {}
  nurses.forEach(([id, data]) => {
    sortedObj[id] = data
  })

  return sortedObj
})

// --- 生命週期 ---
onMounted(() => {
  loadMonthlySchedule()
  loadData() // 工作職責資料
})

// --- 方法 ---

// 取得班別的樣式類別
const getShiftClass = (shift) => {
  if (!shift) return ''

  const shiftStr = String(shift).trim()
  const EARLY_SHIFTS = ['74', '75', '84', '74/L', '816', '815']
  const LATE_SHIFTS = ['3-11', '311']

  // 檢查班別類型
  if (EARLY_SHIFTS.some((s) => shiftStr.includes(s))) {
    return 'shift-badge shift-早班'
  }
  if (LATE_SHIFTS.some((s) => shiftStr.includes(s))) {
    return 'shift-badge shift-晚班'
  }
  if (shiftStr === '休' || shiftStr.includes('休息')) {
    return 'shift-badge shift-休息'
  }
  if (shiftStr === '例' || shiftStr.includes('例假')) {
    return 'shift-badge shift-例假'
  }
  if (shiftStr.includes('國定')) {
    return 'shift-badge shift-國定'
  }
  if (shiftStr === '例假') {
    return 'shift-badge shift-例假'
  }

  // 其他班別
  return 'shift-badge shift-其他'
}

// 處理檔案選擇
function handleFileUpload(event) {
  selectedFile.value = event.target.files[0]
  uploadStatus.value = ''
}

// 載入月班表
async function loadMonthlySchedule() {
  isLoadingSchedule.value = true
  uploadStatus.value = '' // 清除上傳狀態

  try {
    const documentId = selectedMonth.value
    console.log('🔍 正在載入班表:', documentId)

    const schedule = await nursingSchedulesApi.fetchById(documentId)

    if (schedule) {
      console.log('✅ 載入成功:', {
        title: schedule.title,
        yearMonth: schedule.yearMonth,
        nurseCount: Object.keys(schedule.scheduleByNurse || {}).length,
        maxDaysInMonth: schedule.maxDaysInMonth,
      })
      monthlySchedule.value = schedule
    } else {
      console.log('❌ 找不到班表資料')
      monthlySchedule.value = null
    }
  } catch (error) {
    console.error('❌ 載入月班表失敗:', error)
    monthlySchedule.value = null
  } finally {
    isLoadingSchedule.value = false
  }
}

// 轉換檔案為 Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64String = reader.result.split(',')[1]
      resolve(base64String)
    }
    reader.onerror = (error) => reject(error)
  })
}

// 上傳班表
async function processAndUpload() {
  if (!selectedFile.value) {
    uploadStatus.value = '請先選擇一個 Excel 檔案'
    return
  }

  isUploading.value = true
  uploadStatus.value = '正在上傳檔案...'

  try {
    const fileContentBase64 = await fileToBase64(selectedFile.value)
    const payload = {
      fileName: selectedFile.value.name,
      fileContentBase64: fileContentBase64,
    }

    uploadStatus.value = '伺服器正在解析班表...'
    const saveScheduleFunction = httpsCallable(functions, 'saveNursingSchedule')
    const result = await saveScheduleFunction(payload)

    if (!result.data.success) {
      throw new Error(result.data.message || '處理失敗')
    }

    uploadStatus.value = `成功！${result.data.message}`
    selectedFile.value = null

    // 更新選擇的月份並重新載入
    if (result.data.stats?.month) {
      selectedMonth.value = result.data.stats.month
    }

    await loadMonthlySchedule()
  } catch (error) {
    console.error('上傳失敗:', error)
    uploadStatus.value = `失敗：${error.message || '發生未知錯誤'}`
  } finally {
    isUploading.value = false
  }
}

// 工作職責相關函式
// 修改 formatText 函式 - 更智能的組別識別
const formatText = (text) => {
  if (!text) return ''

  // 先進行 HTML 轉義
  let escapedText = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  // 定義所有需要識別的組別
  const groups = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'ICU']
  const qwGroups = ['QW1', 'QW2', 'QW3', 'QW4', 'QW5', 'QW6', 'QW7']

  // 組合所有組別
  const allGroups = [...groups, ...qwGroups]

  // 為每個組別創建彩色膠囊
  allGroups.forEach((group) => {
    // 創建正則表達式，匹配組別的各種形式
    // 例如：A組、A 組、A組：、A組:、單獨的A（在特定上下文中）
    const patterns = [
      new RegExp(`\\b${group}\\s*組[:：]?`, 'g'), // A組、A組：等
      new RegExp(`^${group}\\s*[:：]`, 'gm'), // 行首的 A:、A：
      new RegExp(`(?<=[，,、]\\s*)${group}\\s*組`, 'g'), // 逗號後的A組
    ]

    patterns.forEach((pattern) => {
      escapedText = escapedText.replace(pattern, (match) => {
        return `<span class="group-tag group-${group}">${match}</span>`
      })
    })
  })

  // 處理特殊標記（※、組長等）
  escapedText = escapedText.replace(/^(※[^\n]*)/gm, '<span class="group-tag is-note">$1</span>')

  escapedText = escapedText.replace(
    /^(組長[:：][^\n]*)/gm,
    '<span class="group-tag is-leader">$1</span>',
  )

  escapedText = escapedText.replace(
    /^(互助小組長[:：][^\n]*)/gm,
    '<span class="group-tag is-leader">$1</span>',
  )

  // 處理編號列表（1. 2. 3. 等）
  escapedText = escapedText.replace(/^(\d+\.\s)/gm, '<span class="group-tag is-numeric">$1</span>')

  return escapedText
}

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
  // 模擬從後端載入資料
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
        'A 組: 擔任 Leader，核對當日人數， 將當日護理日誌、排程，隔天分組匯出轉 PDF 黨並存檔 (114.09.01 更新) ， 下班前須到 PD 衛教室電腦開啟隔日診間叫號系統(114.09.22 更新)。\nB 組: 10PM 後核對隔日娃娃頭與電腦排程是否一致，並須製作隔日早班洗腎住院床 病人移動方式，排主護(排到中班收針列)及 Leader 牌。備隔日 B 組 AK。\nC 組: 接 ICU 組，協同 B 組核對隔日娃娃頭、 W4 補充 ICU 消毒液，備隔日 C+D 組 AK。若 G 組 放 P 時，備 K 組 AK。\nD 組: 點班(衛材)，備隔日 E+F 組 AK， NO.1。\nE 組: 點班(氧療、冰箱)、備隔日 I+J 組 AK， NO.2，若 H 組放 P，協助點班(急 救車)。\nF 組: 接 12-8，備隔日 G+H 組 AK。 (每月 1 號點消防箱物資，遇假日順延。 )， NO.3。\nG 組: 住院組、 備隔日 K 組 AK。\nH 組: 住院組、 點班(急救車) 。\nI 組: 備隔日 A 組 AK。關門前結束檢查(項目見背面)若 C 組去洗 ICU，則協同 B 組核對隔日 娃娃頭。\n※若當日僅有 8 組組別， I 組負責工作由 A 組協助完成。\nQW4 夜班倒酸。\n 若放 P3-8 班，放 P 人員須自行完成該組工作職責。\n 每個月雙週的 W5 需刷機器。\n 每週星期一夜班汙水管需倒漂白水(A 組倒 1-7 床； B 組倒 8-15； C 組倒 16-22 床； D 組 倒 23-29 床； E 組倒 35-41 床； F 組倒 42-48 床； G 組倒 49-55 床； H 組倒 31-33 床)(若 H 組放 P 則由 G 組協助倒漂白水)',
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
    const formattedDate = `${now.getFullYear() - 1911}.${String(now.getMonth() + 1).padStart(
      2,
      '0',
    )}.${String(now.getDate()).padStart(2, '0')}`
    const currentUserFullName = auth.currentUser.value?.name || '未知使用者'

    const rawPayload = {
      announcement: announcementText.value,
      dayShift: dayShiftData.value,
      nightShift: nightShiftDuties.value,
      checklist: checklistItems.value,
      teamwork: teamworkItems.value,
      lastModified: { date: formattedDate, user: currentUserFullName },
    }
    const payload = JSON.parse(JSON.stringify(rawPayload))
    console.log('正在儲存 (純物件):', payload)

    lastModifiedInfo.value = payload.lastModified
    hasChanges.value = false
    exitEditMode()
    createGlobalNotification('工作職責已成功儲存！', 'success')
  } catch (error) {
    createGlobalNotification(error.message || '儲存失敗，請稍後再試', 'error')
  }
}
</script>

<style scoped>
/* ===== 基礎容器樣式 ===== */
.nursing-schedule-container {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.page-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin-bottom: 1.2rem;
}

/* ===== 頁籤導覽 ===== */
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
  background-color: #1abc9c;
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.tabs-nav button.active {
  color: #1abc9c;
}

.tabs-nav button.active::after {
  transform: scaleX(1);
}

/* ===== 合併的控制區域 ===== */
.controls-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1rem;
  background-color: #f8f9fa;
  border-radius: 6px;
  margin-bottom: 1rem;
  gap: 1rem;
}

.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.controls-section label {
  font-weight: 500;
  color: #495057;
  font-size: 0.9rem;
}

.controls-section input[type='month'] {
  padding: 0.4rem 0.8rem;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 0.9rem;
}

/* 按鈕樣式 */
.btn-primary,
.btn-secondary {
  padding: 0.4rem 1rem;
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

.btn-secondary:hover {
  background-color: #f8f9fa;
  border-color: #adb5bd;
}

/* 檔案上傳樣式 */
.file-upload-label {
  display: inline-block;
  cursor: pointer;
}

.file-input-hidden {
  display: none;
}

/* 狀態訊息 */
.status-message {
  padding: 0.5rem 1rem;
  margin-bottom: 1rem;
  border-radius: 4px;
  font-size: 0.9rem;
  animation: slideDown 0.3s ease;
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

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* ===== Loading 和 Spinner ===== */
.loading-schedule,
.no-schedule {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  color: #6c757d;
}

.no-schedule i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.no-schedule .hint {
  font-size: 0.9rem;
  color: #868e96;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem auto;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem;
  text-align: center;
  background-color: #f8f9fa;
  border-radius: 6px;
  color: #6c757d;
}

.placeholder i {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

/* ===== 班表表格樣式 ===== */
.schedule-table-wrapper {
  overflow-x: auto;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background: white;
}

.schedule-table-wrapper h3 {
  text-align: center;
  padding: 1rem;
  margin: 0;
  background-color: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  font-size: 1.2rem;
  font-weight: 600;
  color: #2c3e50;
}

.schedule-table {
  width: 100%;
  min-width: 1200px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.schedule-table th,
.schedule-table td {
  border: 1px solid #dee2e6;
  padding: 0.4rem;
  text-align: center;
  vertical-align: middle;
}

.schedule-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
}

.nurse-name-col {
  width: 100px;
  position: sticky;
  left: 0;
  z-index: 11;
  background-color: #f8f9fa !important;
}

.nurse-name {
  position: sticky;
  left: 0;
  z-index: 5;
  background-color: #fff;
  font-weight: 500;
  width: 100px;
  min-width: 100px;
}

.nurse-username {
  font-size: 0.7rem;
  color: #6c757d;
  font-style: italic;
  margin-left: 0.25rem;
}

.schedule-table tbody tr:nth-child(even) td:first-child {
  background-color: #f8f9fa;
}

.date-col {
  width: 60px;
  min-width: 60px;
}

.date-col.weekend {
  background-color: #fff5f5;
}

.date-num {
  font-weight: 600;
}

.weekday {
  font-size: 0.75rem;
  color: #6c757d;
  margin-top: 2px;
}

.shift-cell {
  padding: 0.2rem;
}

.shift-cell.weekend {
  background-color: #fffafa;
}

/* 班別樣式 */
.shift-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.8rem;
  min-width: 35px;
}

.shift-早班 {
  background-color: #fff3cd;
  color: #856404;
}

.shift-晚班 {
  background-color: #cce5ff;
  color: #004085;
}

.shift-休息 {
  background-color: #f8d7da;
  color: #721c24;
}

.shift-例假 {
  background-color: #e2e3e5;
  color: #383d41;
}

.shift-國定 {
  background-color: #d4edda;
  color: #155724;
}

.shift-其他 {
  background-color: #e7e7e7;
  color: #495057;
}

.empty-cell {
  color: #dee2e6;
}

/* ===== 工作職責頁籤樣式 ===== */
.pane-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.table-title,
.info-section h3 {
  font-size: 1.3rem;
  font-weight: 600;
  margin-bottom: 1rem;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.revision-date {
  font-size: 0.9rem;
  color: #6c757d;
  font-style: italic;
  cursor: help;
}

.save-button {
  background-color: #1abc9c;
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

.editable-text {
  display: block;
  width: 100%;
  min-height: 24px;
  cursor: text;
  padding: 5px;
  border-radius: 4px;
  transition: background-color 0.2s;
  white-space: pre-wrap;
}

.announcement-text {
  line-height: 1.7;
}

.editable-text:hover {
  background-color: #ecf0f1;
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

.task-text {
  white-space: pre-wrap;
  line-height: 1.7;
}

.edit-input,
.edit-input-inline {
  width: 100%;
  padding: 5px;
  border: 2px solid #1abc9c;
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

/* ===== 工作職責的組別彩色膠囊樣式 - 使用深度選擇器 ===== */
/* 組別標籤基礎樣式 */
:deep(.group-tag) {
  display: inline-block;
  color: white;
  padding: 1px 8px;
  border-radius: 12px;
  margin-right: 0.7em;
  font-family: 'Segoe UI', sans-serif;
  font-size: 0.9em;
  font-weight: bold;
  line-height: 1.5;
}

/* 各組別顏色 - 使用深度選擇器 */
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

/* QW 組別樣式 */
:deep(.group-QW1),
:deep(.group-QW2),
:deep(.group-QW3),
:deep(.group-QW4),
:deep(.group-QW5),
:deep(.group-QW6),
:deep(.group-QW7) {
  background-color: #5d6d7e;
}

/* 特殊標記樣式 */
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

/* 響應式處理 */
@media (max-width: 768px) {
  .controls-section {
    flex-direction: column;
    gap: 1rem;
  }

  .controls-left,
  .controls-right {
    width: 100%;
    justify-content: space-between;
  }

  .schedule-table {
    font-size: 0.75rem;
  }

  .date-col {
    width: 50px;
    min-width: 50px;
  }

  .shift-badge {
    font-size: 0.7rem;
    padding: 1px 4px;
  }
}
</style>
