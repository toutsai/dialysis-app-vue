<!-- 檔案路徑: src/views/ScheduleView.vue (最終完整重構版) -->
<script setup>
import { ref, onMounted, computed, reactive } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import InpatientSidebar from '@/components/InpatientSidebar.vue'
import StatsToolbar from '@/components/StatsToolbar.vue'
import PatientSelectDialog from '@/components/PatientSelectDialog.vue'
import {
  createEmptySlotData,
  generateStandardNote,
  generateAutoNote,
} from '@/utils/scheduleUtils.js'

// --- API 實例 ---
const patientsApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const baseSchedulesApi = ApiManager('base_schedules') // 載入常規需要

// --- 常量 ---
const SHIFTS = ['早', '午', '晚']
const layoutData = {
  leftWingRows: [
    ['空', 32, 31],
    [33, 35, 36],
    [39, 38, 37],
    [51, 52, 53],
    [57, 56, 55],
    [58, 59, 61],
    [65, 63, 62],
  ],
  rightWingRows: [
    [29, 28, 27],
    [23, 25, 26],
    [22, 21, 19],
    [16, 17, 18],
    [15, 13, 12],
    [8, 9, 11],
    [7, 6, 5],
    [1, 2, 3],
  ],
}
const hepatitisBeds = ['空', 31, 32, 33, 35, 36]
const aisleSideBeds = [1, 7, 8, 15, 16, 22, 23, 29, 31, 36, 37, 53, 55, 61, 62, 65]
const peripheralBedCount = 6
const baseTeams = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', '外圍']
const earlyTeams = baseTeams.map((t) => `早${t}`)
const lateTeams = baseTeams.map((t) => `晚${t}`)
const allTeams = [...earlyTeams, ...lateTeams]
// 定義樣式優先級
const STYLE_PRIORITY = {
  抽: { class: 'tag-chou', color: 'blue' },
  新: { class: 'tag-new', color: 'yellow' },
  住: { class: 'tag-ip', color: 'red' },
  換: { class: 'tag-huan', color: 'lightblue' },
  兩: { class: 'tag-liang', color: 'orange' },
  B: { class: 'tag-b', color: 'ivory' },
}

// --- 核心狀態 ---
const currentDate = ref(new Date())
const allPatients = ref([])
const hasUnsavedChanges = ref(false)
const statusIndicator = ref('')
const searchInput = ref('')
const currentRecord = reactive({ id: null, date: '', schedule: {}, names: {} })
const isDialogVisible = ref(false)
const currentEditingShiftId = ref(null)

function formatDate(date) {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}
const copySourceDate = ref(formatDate(new Date()))

// --- 計算屬性 ---
const patientMap = computed(() => new Map(allPatients.value.map((p) => [p.id, p])))
const currentDateDisplay = computed(() => formatDate(currentDate.value))
const weekdayDisplay = computed(
  () => ['日', '一', '二', '三', '四', '五', '六'][currentDate.value.getDay()],
)
const shiftPatientCount = computed(() => {
  // 1. 初始化時使用 '早班', '午班', '晚班' 作為 key，以匹配 StatsToolbar 的期望
  const counts = { 早班: 0, 午班: 0, 晚班: 0 }

  // 2. 直接存取 reactive 物件，不要用 .value
  if (currentRecord.schedule) {
    // 3. 遍歷 schedule 物件的所有值
    for (const slotData of Object.values(currentRecord.schedule)) {
      // 確保 slotData 和 patientId 存在
      if (slotData && slotData.patientId) {
        // 4. 從 slotData 中獲取 shiftId
        const shiftId = slotData.shiftId || ''

        // 5. 根據 shiftId 判斷班別並計數
        if (shiftId.endsWith('早班')) {
          counts['早班']++
        } else if (shiftId.endsWith('午班')) {
          counts['午班']++
        } else if (shiftId.endsWith('晚班')) {
          counts['晚班']++
        }
      }
    }
  }

  // **偵錯日誌**
  console.log('[Debug] 計算出的人數 (shiftPatientCount):', JSON.parse(JSON.stringify(counts)))

  return counts
})

// **用來傳遞資料的 computed，它直接依賴 shiftPatientCount**
const statsToolbarData = computed(() => {
  // 格式化成 StatsToolbar 期望的 [{ counts: {...} }] 結構
  return [{ counts: shiftPatientCount.value }]
})
const statsToolbarWeekdays = computed(() => ['本日'])
const scheduledPatientIds = computed(() => {
  if (!currentRecord.schedule) {
    return new Set()
  }
  // 從 currentRecord.schedule 中提取所有有效的 patientId
  return new Set(
    Object.values(currentRecord.schedule)
      .filter((slot) => slot && slot.patientId)
      .map((slot) => slot.patientId),
  )
})

// --- 方法 ---
async function loadAllPatients() {
  try {
    console.log('正在獲取所有病人資料...')
    const patientsData = await patientsApi.fetchAll()
    allPatients.value = patientsData
    console.log('病人資料獲取成功:', allPatients.value.length, '人')
  } catch (error) {
    console.error('獲取病人資料失敗:', error)
    // 可以在這裡給使用者一些提示
  }
}

function setChange() {
  hasUnsavedChanges.value = true
  statusIndicator.value = '有未儲存的變更'
}

async function loadDataForDay(date) {
  hasUnsavedChanges.value = false
  statusIndicator.value = '讀取中...'
  const dateStr = formatDate(date)

  try {
    const dailyRecords = await schedulesApi.fetchAll([where('date', '==', dateStr)])
    const record = dailyRecords.length > 0 ? dailyRecords[0] : { date: dateStr, schedule: {} }

    const loadedSchedule = record.schedule || {}
    const finalSchedule = {}

    // 遍歷從資料庫載入的每一個 slot
    for (const shiftId in loadedSchedule) {
      const dbSlotData = loadedSchedule[shiftId]
      if (dbSlotData && dbSlotData.patientId) {
        // 使用工廠函式創建一個標準的空白 slot 作為基礎
        const standardSlot = createEmptySlotData(shiftId)

        // 從 patientMap 中找到完整的病人資料
        const patient = patientMap.value.get(dbSlotData.patientId)

        // 將從資料庫讀取的資料與標準 slot 合併
        const mergedSlot = {
          ...standardSlot,
          ...dbSlotData, // 這會載入 patientId, manualNote 等
        }

        // 如果找到了病人，就為他生成 autoNote
        if (patient) {
          mergedSlot.autoNote = generateAutoNote(patient)
        }

        finalSchedule[shiftId] = mergedSlot
      }
    }
    // **↑↑↑ 關鍵修改結束 ↑↑↑**

    currentRecord.id = record.id || null
    currentRecord.date = record.date
    currentRecord.schedule = finalSchedule

    statusIndicator.value = '資料已載入'
  } catch (error) {
    console.error('載入資料失敗:', error)
    statusIndicator.value = '讀取失敗'
  }
}

function handleSlotClick(shiftId) {
  const slotData = currentRecord.schedule[shiftId]

  // 檢查此欄位是否已經有病人
  if (slotData && slotData.patientId) {
    // 有病人 -> 執行刪除邏輯

    // **↓↓↓ 關鍵修正處 ↓↓↓**
    // 1. 直接從 slotData 取得 patientId
    // 2. 使用 patientMap 查詢完整的病人物件
    const patient = patientMap.value.get(slotData.patientId)

    // 3. 從病人物件中取得姓名，如果找不到病人則給一個空字串
    const patientName = patient ? patient.name : ''

    // 4. 在確認對話框中使用正確的姓名
    if (confirm(`確定要將「${patientName}」從此班次中移除嗎？`)) {
      // 若使用者確認，則呼叫 handleSlotUpdate 並傳入 null 來清空此欄位
      handleSlotUpdate(shiftId, null)
    }
    // **↑↑↑ 修正結束 ↑↑↑**
  } else {
    // 沒有病人 -> 開啟選擇對話框
    openPatientDialog(shiftId)
  }
}

function changeDate(days) {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  const newDate = new Date(currentDate.value)
  newDate.setDate(newDate.getDate() + days)
  currentDate.value = newDate
  loadDataForDay(newDate)
}

function goToToday() {
  if (hasUnsavedChanges.value && !confirm('您有未儲存的變更，確定要切換日期嗎？')) return
  currentDate.value = new Date()
  loadDataForDay(currentDate.value)
}

function getPatientName(bedIdentifier, shift) {
  // 1. 根據傳入的參數，組合出唯一的 shiftId
  const shiftId = `${bedIdentifier}-${shift}班`
  const patientId = currentRecord.schedule[shiftId]?.patientId

  if (!patientId) {
    return ''
  }

  const patient = patientMap.value.get(patientId)
  return patient ? patient.name : ''
}

function getCombinedNote(slotData) {
  if (!slotData) return ''

  // 將兩個備註都用空格分割成單詞陣列
  const autoNotes = (slotData.autoNote || '').split(' ').filter(Boolean)
  const manualNotes = (slotData.manualNote || '').split(' ').filter(Boolean)

  // **使用 Set 來合併並自動去重**
  const allNotes = new Set([...autoNotes, ...manualNotes])

  // 將去重後的結果重新組合為字串
  return Array.from(allNotes).join(' ')
}

/**
 * 根據 slotData 計算並返回對應的 CSS class 物件，用於整行變色。
 * @param {string} shiftId - 該床位班次的唯一標識符。
 * @returns {object} - 一個 class 物件，例如 { 'tag-ip': true }。
 */
function getPatientCellStyle(shiftId) {
  const slotData = currentRecord.schedule[shiftId]
  if (!slotData || !slotData.patientId) {
    return {} // 如果沒有病人，不添加任何特殊 class
  }

  // 使用 getCombinedNote 獲取完整的備註來進行判斷
  const combinedNote = getCombinedNote(slotData)

  // 根據我們定義的優先級來遍歷
  for (const key in STYLE_PRIORITY) {
    if (combinedNote.includes(key)) {
      // 找到第一個匹配的最高優先級狀態，並返回對應的 class
      return { [STYLE_PRIORITY[key].class]: true }
    }
  }

  // 如果備註中沒有匹配的關鍵字，再檢查病人身份
  const patient = patientMap.value.get(slotData.patientId)
  if (patient && patient.status === 'ip') {
    // 請確認您的住院狀態值是 'ip' 還是 'ipd'
    return { [STYLE_PRIORITY['住'].class]: true }
  }

  // 如果以上都不匹配，返回空物件
  return {}
}

async function saveDataToCloud() {
  statusIndicator.value = '儲存中...'
  try {
    const cleanSchedule = {}
    for (const shiftId in currentRecord.schedule) {
      const slotData = currentRecord.schedule[shiftId]
      if (slotData && slotData.patientId) {
        // 只儲存有病人的格子
        cleanSchedule[shiftId] = {
          patientId: slotData.patientId,
          shiftId: slotData.shiftId || shiftId,
          // **分別儲存 autoNote 和 manualNote**
          autoNote: slotData.autoNote || '',
          manualNote: slotData.manualNote || '',
          nurseTeam: slotData.nurseTeam || null,
          nurseTeamIn: slotData.nurseTeamIn || null,
          nurseTeamOut: slotData.nurseTeamOut || null,
        }
      }
    }
    const dataToSave = { date: currentRecord.date, schedule: cleanSchedule }

    console.log('準備儲存到雲端的資料:', JSON.parse(JSON.stringify(dataToSave)))

    if (currentRecord.id) {
      await schedulesApi.update(currentRecord.id, dataToSave)
    } else {
      const savedRecord = await schedulesApi.save(dataToSave)
      currentRecord.id = savedRecord.id
    }

    hasUnsavedChanges.value = false
    statusIndicator.value = '儲存成功！'
    alert('排程已成功儲存！')
  } catch (error) {
    console.error('儲存失敗:', error)
    statusIndicator.value = '儲存失敗'
    alert(`儲存失敗: ${error.message}`)
  }
}

// **實現 clearBoard (解決問題 2)**
function clearBoard() {
  if (confirm('確定要清除畫面上的所有資料嗎？(此操作需儲存後才會生效)')) {
    // 清空 schedule 物件的所有屬性
    Object.keys(currentRecord.schedule).forEach((key) => {
      delete currentRecord.schedule[key]
    })
    setChange()
  }
}

// **實現 copySchedule (解決問題 2)**
async function copySchedule() {
  if (!copySourceDate.value) {
    alert('請選擇一個來源日期！')
    return
  }
  if (copySourceDate.value === formatDate(currentDate.value)) {
    alert('來源日期與目前日期相同，無需複製。')
    return
  }
  if (
    !confirm(`確定要將 ${copySourceDate.value} 的排程複製到本日嗎？\n這會覆蓋當前畫面的所有內容！`)
  )
    return

  statusIndicator.value = `從 ${copySourceDate.value} 複製中...`
  try {
    const sourceRecords = await schedulesApi.fetchAll([where('date', '==', copySourceDate.value)])
    if (sourceRecords.length > 0) {
      // **↓↓↓ 關鍵修改處 ↓↓↓**
      const sourceSchedule = sourceRecords[0].schedule || {}
      const processedSchedule = {} // 建立一個新的物件來存放處理後的排程

      // 遍歷從來源日期讀取到的每一個 slot
      for (const shiftId in sourceSchedule) {
        const dbSlotData = sourceSchedule[shiftId]
        if (dbSlotData && dbSlotData.patientId) {
          // 找到完整的病人物件
          const patient = patientMap.value.get(dbSlotData.patientId)

          // 建立一個標準的 slot 作為基礎
          const standardSlot = createEmptySlotData(shiftId)

          // 合併從資料庫讀取的資料
          const mergedSlot = {
            ...standardSlot,
            ...dbSlotData,
          }

          // 如果找到了病人，就為他重新生成 autoNote
          if (patient) {
            mergedSlot.autoNote = generateAutoNote(patient)
          }

          // 將這個處理完畢的 slot 存入我們的新排程物件
          processedSchedule[shiftId] = mergedSlot
        }
      }

      // 用處理過後的排程，來覆蓋當前的排程
      // 為了乾淨，先清空再賦值
      Object.keys(currentRecord.schedule).forEach((key) => delete currentRecord.schedule[key])
      Object.assign(currentRecord.schedule, processedSchedule)
      // **↑↑↑ 修改結束 ↑↑↑**

      setChange()
      statusIndicator.value = '複製成功，請記得儲存'
    } else {
      alert(`在雲端找不到 ${copySourceDate.value} 的排程資料。`)
      statusIndicator.value = '複製失敗'
    }
  } catch (error) {
    alert(`複製失敗: ${error.message}`)
    statusIndicator.value = '複製失敗'
  }
}

function onDragStart(event, source) {
  let patientId
  let sourceShiftId = null

  // 1. 判斷來源
  if (
    typeof source === 'string' &&
    (source.startsWith('bed-') || source.startsWith('peripheral-'))
  ) {
    // 來源是床位
    const slotData = currentRecord.schedule[source]
    if (!slotData || !slotData.patientId) {
      event.preventDefault()
      return
    }
    patientId = slotData.patientId
    sourceShiftId = source
  } else {
    // 來源是側邊欄，source 就是 patientId
    patientId = source
  }

  // 如果無論如何都沒拿到 patientId，則中止拖曳
  if (!patientId) {
    event.preventDefault()
    return
  }

  // 2. **在這裡統一設定 dataTransfer**
  event.dataTransfer.setData('patientId', patientId)
  if (sourceShiftId) {
    event.dataTransfer.setData('sourceShiftId', sourceShiftId)
    event.dataTransfer.effectAllowed = 'move' // 從床位拖曳是「移動」
  } else {
    event.dataTransfer.effectAllowed = 'copy' // 從側邊欄拖曳是「複製」
  }
}

/**
 * 處理拖放事件的最終函式。
 * @param {DragEvent} event - 拖放事件物件。
 * @param {string} targetShiftId - 放置目標格子的唯一 ID。
 */
function onDrop(event, targetShiftId) {
  event.preventDefault()
  event.target.closest('.patient-name, .patient-tag, .schedule-slot')?.classList.remove('drag-over')
  const patientId = event.dataTransfer.getData('patientId')
  if (!patientId) return
  const sourceShiftId = event.dataTransfer.getData('sourceShiftId')
  const patient = patientMap.value.get(patientId)
  if (!patient) return

  const sourceSlotData = sourceShiftId ? currentRecord.schedule[sourceShiftId] : null
  const targetSlotData = currentRecord.schedule[targetShiftId]

  // **分離處理 note**
  const manualNoteToSet = sourceSlotData?.manualNote || '' // 移動時只繼承手動備註
  const autoNoteToSet = generateAutoNote(patient) // 無論如何都重新生成自動備註

  const newSlotData = {
    ...createEmptySlotData(targetShiftId),
    ...targetSlotData,
    ...sourceSlotData,
    patientId: patientId,
    autoNote: autoNoteToSet,
    manualNote: manualNoteToSet,
    shiftId: targetShiftId,
  }

  currentRecord.schedule[targetShiftId] = newSlotData

  // 6. 處理來源格子 (如果是從床位移動過來的)
  if (sourceShiftId && sourceShiftId !== targetShiftId) {
    // 判斷是否為「換床」操作
    if (targetSlotData && targetSlotData.patientId) {
      // 目標格子原本有病人，執行交換邏輯
      const swappedPatient = patientMap.value.get(targetSlotData.patientId)
      const swappedNote = generateStandardNote(swappedPatient, targetSlotData.note || '')

      const swappedSlotData = { ...newSlotData } // 複製一份結構
      swappedSlotData.patientId = targetSlotData.patientId
      swappedSlotData.note = swappedNote
      swappedSlotData.shiftId = sourceShiftId

      currentRecord.schedule[sourceShiftId] = swappedSlotData
    } else {
      // 目標格子是空的，清空來源格子
      currentRecord.schedule[sourceShiftId] = createEmptySlotData(sourceShiftId)
    }
  }

  // 7. 觸發未儲存狀態
  setChange()
}

function onDragOver(event) {
  event.preventDefault()
  const targetCell = event.target.closest('.patient-name')
  if (targetCell && !targetCell.textContent.trim()) {
    targetCell.classList.add('drag-over')
  }
}
function onDragLeave(event) {
  event.target.closest('.patient-name')?.classList.remove('drag-over')
}

function handlePatientSelectedFromDialog(patientId) {
  if (currentEditingShiftId.value && patientId) {
    // 直接呼叫 handleSlotUpdate 來處理
    handleSlotUpdate(currentEditingShiftId.value, patientId)
  }
  isDialogVisible.value = false
}

function handleSlotUpdate(shiftId, patientId) {
  if (patientId) {
    const patient = patientMap.value.get(patientId)
    const newSlotData = createEmptySlotData(shiftId)
    newSlotData.patientId = patientId
    newSlotData.autoNote = generateAutoNote(patient) // 只生成 autoNote
    // manualNote 保持為空 ''
    currentRecord.schedule[shiftId] = newSlotData
  } else {
    delete currentRecord.schedule[shiftId]
  }
  setChange()
}

function openPatientDialog(shiftId) {
  // 如果該格子已經有病人，也許您想提供一個清除選項，或者直接打開編輯
  // 這裡我們先做簡單的：點擊就打開選擇器
  currentEditingShiftId.value = shiftId
  isDialogVisible.value = true
}

function updateNurseTeam(event, shiftId, type) {
  const value = event.target.value

  if (!currentRecord.schedule[shiftId]) {
    // 使用工廠函式創建標準物件
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }

  const slot = currentRecord.schedule[shiftId]
  if (type === 'single') {
    slot.nurseTeam = value || null // 如果選擇空值，則設為 null
  } else if (type === 'in') {
    slot.nurseTeamIn = value || null
  } else if (type === 'out') {
    slot.nurseTeamOut = value || null
  }

  // **觸發未儲存狀態，啟用儲存按鈕**
  setChange()
}

function updateNote(event, shiftId) {
  const value = event.target.textContent
  if (!currentRecord.schedule[shiftId]) {
    currentRecord.schedule[shiftId] = createEmptySlotData(shiftId)
  }
  // **只更新 manualNote**
  currentRecord.schedule[shiftId].manualNote = value
  setChange()
}

// --- 生命週期鉤子 ---
onMounted(async () => {
  await Promise.all([loadAllPatients(), loadDataForDay(currentDate.value)])
})
</script>

<template>
  <div class="page-container">
    <header class="page-header">
      <div class="header-toolbar">
        <div class="toolbar-left">
          <h1 class="page-title">每日排程表</h1>
          <div class="date-navigator">
            <button @click="changeDate(-1)">< 上一天</button>
            <span class="current-date-text">{{ currentDateDisplay }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
            <button @click="changeDate(1)">下一天 ></button>
            <button @click="goToToday">回到今日</button>
          </div>
        </div>
        <div class="toolbar-right">
          <span class="status-indicator">{{ statusIndicator }}</span>
        </div>
      </div>
      <div class="controls-panel">
        <div class="controls-left">
          <button id="save-btn" @click="saveDataToCloud" :disabled="!hasUnsavedChanges">
            儲存資料至雲端
          </button>
          <button id="print-btn" @click="window.print()">列印排程</button>
          <button id="clear-all-btn" @click="clearBoard">清除本日畫面</button>
          <input type="date" v-model="copySourceDate" />
          <button id="copy-schedule-btn" @click="copySchedule">從他日複製排程</button>
          <div class="search-group">
            <input type="text" v-model="searchInput" placeholder="搜尋..." class="search-input" />
            <button id="search-btn">搜尋</button>
          </div>
        </div>
        <div class="controls-right">
          <StatsToolbar :stats-data="statsToolbarData" :weekdays="statsToolbarWeekdays" />
        </div>
      </div>
    </header>

    <main class="page-main-content">
      <div class="schedule-content">
        <div class="dialysis-unit">
          <!-- ====================================================== -->
          <!-- ==           動態生成左右翼床位區 (最終版)           == -->
          <!-- ====================================================== -->
          <template
            v-for="(wing, wingName) in {
              left: layoutData.leftWingRows,
              right: layoutData.rightWingRows,
            }"
            :key="wingName"
          >
            <div :class="`${wingName}-wing`">
              <div v-for="(row, rowIndex) in wing" :key="`${wingName}-${rowIndex}`" class="bed-row">
                <div
                  v-for="bedNum in row"
                  :key="`bed-${wingName}-${bedNum}`"
                  class="bed"
                  :class="{
                    unassigned: bedNum === '空',
                    hepatitis: hepatitisBeds.includes(bedNum),
                    'aisle-side': aisleSideBeds.includes(bedNum),
                    [`${wingName}-wing-bed`]: true,
                  }"
                >
                  <div class="bed-header">
                    {{ bedNum === '空' ? '未排床' : `床號 ${bedNum}` }}
                    <span v-if="hepatitisBeds.includes(bedNum) && bedNum !== '空'">(BC肝炎)</span>
                  </div>
                  <template v-if="bedNum !== '空'">
                    <div
                      v-for="shift in SHIFTS"
                      :key="shift"
                      class="shift-row"
                      :class="[
                        getPatientCellStyle(`bed-${bedNum}-${shift}班`),
                        { 'split-shift': shift === '午' },
                      ]"
                    >
                      <div class="shift-label">{{ shift }}</div>

                      <!-- 護理師組別欄位 -->
                      <div v-if="shift === '午'" class="nurse-split-column">
                        <select
                          class="nurse-team-select nurse-in"
                          title="上針"
                          :value="currentRecord.schedule[`bed-${bedNum}-${shift}班`]?.nurseTeamIn"
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shift}班`, 'in')"
                        >
                          <option value="">上針</option>
                          <option v-for="team in earlyTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                        <select
                          class="nurse-team-select nurse-out"
                          title="收針"
                          :value="currentRecord.schedule[`bed-${bedNum}-${shift}班`]?.nurseTeamOut"
                          @change="updateNurseTeam($event, `bed-${bedNum}-${shift}班`, 'out')"
                        >
                          <option value="">收針</option>
                          <option v-for="team in allTeams" :key="team" :value="team">
                            {{ team }}組
                          </option>
                        </select>
                      </div>
                      <select
                        v-else
                        class="nurse-team-select"
                        :value="currentRecord.schedule[`bed-${bedNum}-${shift}班`]?.nurseTeam"
                        @change="updateNurseTeam($event, `bed-${bedNum}-${shift}班`, 'single')"
                      >
                        <option value="">-</option>
                        <option
                          v-for="team in shift === '早' ? earlyTeams : lateTeams"
                          :key="team"
                          :value="team"
                        >
                          {{ team }}組
                        </option>
                      </select>

                      <!-- 病人姓名欄位 -->
                      <div
                        class="patient-name"
                        draggable="true"
                        @click="handleSlotClick(`bed-${bedNum}-${shift}班`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shift}班`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                        @dragstart="onDragStart($event, `bed-${bedNum}-${shift}班`)"
                      >
                        {{ getPatientName(`bed-${bedNum}`, shift) }}
                      </div>

                      <!-- 備註欄位 -->
                      <div
                        class="patient-tag"
                        contenteditable="true"
                        @blur="updateNote($event, `bed-${bedNum}-${shift}班`)"
                        @drop="onDrop($event, `bed-${bedNum}-${shift}班`)"
                        @dragover="onDragOver"
                        @dragleave="onDragLeave"
                      >
                        <!-- **關鍵修正**: 顯示組合後的完整備註 -->
                        {{ getCombinedNote(currentRecord.schedule[`bed-${bedNum}-${shift}班`]) }}
                      </div>
                    </div>
                  </template>
                </div>
              </div>
              <div v-if="wingName === 'left'" class="bed-row">
                <div class="nursing-station">護理站</div>
              </div>
            </div>
            <div v-if="wingName === 'left'" class="aisle">中 央 走 道</div>
          </template>
        </div>

        <!-- 外圍床位區 -->
        <div class="extra-sections">
          <div class="peripheral-section">
            <div class="peripheral-bed-container">
              <div v-for="i in peripheralBedCount" :key="`p-bed-${i}`" class="peripheral-bed">
                <div class="peripheral-header">外圍床位 {{ i }}</div>
                <div
                  v-for="shift in SHIFTS"
                  :key="shift"
                  class="peripheral-shift-row"
                  :class="getPatientCellStyle(`peripheral-${i}-${shift}班`)"
                >
                  <div class="shift-label">{{ shift }}</div>
                  <select
                    class="nurse-team-select"
                    :value="currentRecord.schedule[`peripheral-${i}-${shift}班`]?.nurseTeam"
                    @change="updateNurseTeam($event, `peripheral-${i}-${shift}班`, 'single')"
                  >
                    <option value="">-</option>
                    <option
                      v-for="team in shift === '早'
                        ? earlyTeams
                        : shift === '晚'
                          ? lateTeams
                          : allTeams"
                      :key="team"
                      :value="team"
                    >
                      {{ team }}組
                    </option>
                  </select>
                  <div class="peripheral-bed-number" contenteditable="true"></div>
                  <div
                    class="peripheral-patient-name"
                    draggable="true"
                    @click="handleSlotClick(`peripheral-${i}-${shift}班`)"
                    @drop="onDrop($event, `peripheral-${i}-${shift}班`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                    @dragstart="onDragStart($event, `peripheral-${i}-${shift}班`)"
                  >
                    {{ getPatientName(`peripheral-${i}`, shift) }}
                  </div>
                  <div
                    class="patient-tag"
                    contenteditable="true"
                    @blur="updateNote($event, `peripheral-${i}-${shift}班`)"
                    @drop="onDrop($event, `peripheral-${i}-${shift}班`)"
                    @dragover="onDragOver"
                    @dragleave="onDragLeave"
                  >
                    <!-- **關鍵修正**: 顯示組合後的完整備註 -->
                    {{ getCombinedNote(currentRecord.schedule[`peripheral-${i}-${shift}班`]) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <InpatientSidebar
        :patients="allPatients"
        :scheduled-ids="scheduledPatientIds"
        @drag-start="onDragStart"
      />
    </main>
  </div>
  <PatientSelectDialog
    :is-visible="isDialogVisible"
    title="選擇排班病人"
    :patients="allPatients"
    :show-fill-options="false"
    @confirm="handlePatientSelectedFromDialog"
    @cancel="isDialogVisible = false"
  />
</template>

<style scoped>
/* ==========================================================================
   1. 頁面整體佈局 (Layout) - **此區為本次修改核心**
   ========================================================================== */

/* 最外層容器，設定為佔滿整個視窗高度的 Flex 容器 */
.page-container {
  display: flex;
  flex-direction: column; /* 讓 header 和 main-content 垂直排列 */
  height: 100vh; /* 佔滿整個可視螢幕高度 */
  overflow: hidden; /* 防止整個頁面出現滾動條 */
  background-color: #f4f7f9;
}

/* 頂部標頭區塊 */
.page-header {
  flex-shrink: 0; /* 防止 header 在空間不足時被壓縮 */
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  z-index: 10; /* 確保在最上層 */
}

/* 主內容區 (包含床位區和側邊欄) */
.page-main-content {
  flex-grow: 1; /* 讓主內容區填滿 header 下方所有剩餘的垂直空間 */
  display: flex; /* 內部使用 flex，讓床位區和側邊欄水平排列 */
  min-height: 0; /* 解決 flex 子項目 overflow 的問題，非常重要 */
}

/* 中間的床位內容區 (將會滾動的部分) */
.schedule-content {
  flex-grow: 1; /* 佔滿側邊欄以外所有剩餘的水平空間 */
  overflow-y: auto; /* **關鍵！讓這個區塊產生自己的垂直滾動條** */
  min-width: 0;
}

/* 右側側邊欄 (固定不動的部分) */
.inpatient-sidebar {
  flex-shrink: 0; /* 防止側邊欄被壓縮 */
  width: 200px; /* 給一個固定寬度 */
  border-left: 1px solid #e0e0e0;
  /* 讓側邊欄內部也能滾動 (如果病人列表太長) */
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ==========================================================================
   2. 元件樣式 (Components) - 大部分為您原有的樣式微調
   ========================================================================== */

/* -- Header 內部樣式 -- */
.header-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  gap: 20px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 15px;
}
.page-title {
  font-size: 1.8em;
  margin: 0;
  white-space: nowrap;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 10px;
}
.current-date-text,
.weekday-display {
  font-size: 1.5em;
  font-weight: bold;
}
.weekday-display {
  color: var(--primary-color);
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.status-indicator {
  font-weight: bold;
  color: #6c757d;
}

/* -- 控制面板樣式 -- */
.controls-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.controls-left,
.controls-right {
  display: flex;
  align-items: center;
  gap: 10px;
}
.controls-panel button,
.controls-panel input[type='date'],
.controls-panel input[type='text'] {
  padding: 8px 15px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 5px;
  height: 40px;
  box-sizing: border-box;
}
.date-navigator button {
  padding: 8px 12px;
  font-size: 1em;
  border-radius: 5px;
  border: 1px solid #ccc;
  cursor: pointer;
  background-color: #fff;
}
#save-btn {
  background-color: var(--success-color);
  color: white;
  border-color: var(--success-color);
}
#print-btn {
  background-color: var(--info-color);
  color: white;
  border-color: var(--info-color);
}
#clear-all-btn {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
#copy-schedule-btn {
  background-color: var(--warning-color);
  color: white;
  border-color: var(--warning-color);
}
.search-group {
  display: flex;
  align-items: center;
}
.search-group input {
  border-radius: 5px 0 0 5px;
}
.search-group button {
  border-radius: 0 5px 5px 0;
  border-left: none;
}

/* ==========================================================================
   3. 床位與排程樣式 (Bed & Schedule Styles)
   ========================================================================== */

.dialysis-unit {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 20px;
}
.aisle {
  writing-mode: vertical-lr;
  text-align: center;
  padding: 20px 5px;
  background-color: #e9ecef;
  border-radius: 8px;
  font-size: 1.5em;
  letter-spacing: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6c757d;
}
.left-wing,
.right-wing {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bed-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.bed,
.nursing-station,
.peripheral-bed {
  border: 1px solid #ccc;
  border-radius: 8px;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.bed {
  min-height: 160px;
}
.nursing-station {
  background-color: #f0f4c3;
  border: 2px dashed #afb42b;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  font-weight: bold;
  color: #558b2f;
  grid-column: span 3;
  padding: 40px 0;
}
.bed-header,
.peripheral-header {
  background-color: #e3f2fd;
  color: #0d47a1;
  font-weight: bold;
  padding: 6px;
  text-align: center;
  font-size: 1em;
}

/* -- 排程行 & 格子樣式 -- */
.shift-row,
.peripheral-shift-row {
  display: grid;
  align-items: stretch; /* 讓格子填滿高度 */
  border-top: 1px solid #e0e0e0;
  transition: background-color 0.3s;
}
.shift-row {
  grid-template-columns: 28px 60px 1fr 50px;
}
.peripheral-shift-row {
  grid-template-columns: 28px 70px 70px 1fr 40px;
}

.shift-label {
  background-color: #f5f5f5;
  font-size: 0.8em;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid #e0e0e0;
}
.shift-row > div,
.shift-row > select,
.peripheral-shift-row > div,
.peripheral-shift-row > select {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 8px;
  min-height: 48px;
  border-left: 1px solid #e0e0e0;
  word-break: break-all;
  text-align: center;
}
.patient-name,
.peripheral-patient-name {
  font-size: 1em; /* 從 1.1em 縮小 */
  padding: 4px 6px; /* 微調內距 */
}
.patient-name:empty::before,
.peripheral-patient-name:empty::before {
  content: '輸入病人';
  color: #aaa;
  font-style: italic;
}
.patient-tag:empty::before {
  content: '備註';
  color: #aaa;
  font-style: italic;
}
.patient-tag {
  font-size: 0.9em; /* 縮小字體 */
  white-space: nowrap; /* 強制不換行 */
  overflow: hidden; /* 隱藏超出部分 */
  text-overflow: ellipsis; /* 超出部分顯示省略號 */
  padding: 4px 6px; /* 微調內距 */
}
.nurse-team-select {
  padding: 4px;
  border: none;
  font-size: 0.8em;
  width: 100%;
  background: transparent;
  border-radius: 0;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  text-align: center;
}
.shift-row.split-shift .nurse-split-column {
  display: flex;
  flex-direction: column;
  padding: 0;
}
.nurse-split-column .nurse-team-select {
  flex-grow: 1;
  height: 50%;
}
.nurse-split-column .nurse-team-select:first-child {
  border-bottom: 1px solid #e0e0e0;
}

/* -- 特殊床位 & 狀態顏色 -- */
.bed.hepatitis .bed-header {
  background-color: var(--hepatitis-bg);
  color: #af8203;
}
.bed.unassigned .bed-header {
  background-color: #bdbdbd;
  color: #424242;
}
.bed.unassigned .shift-row {
  display: none;
}
.bed.aisle-side.right-wing-bed {
  border-left: 5px solid #4caf50;
}
.bed.aisle-side.left-wing-bed {
  border-right: 5px solid #4caf50;
}

/* --- ↓↓↓ 關鍵修正處 ↓↓↓ --- */
/* 使用群組選擇器，讓主床位和外圍床位共用顏色規則 */
.shift-row.tag-ip,
.peripheral-shift-row.tag-ip {
  background-color: #ffebee; /* 住 */
}
.shift-row.tag-chou,
.peripheral-shift-row.tag-chou {
  background-color: #e3f2fd; /* 抽 */
}
.shift-row.tag-new,
.peripheral-shift-row.tag-new {
  background-color: #fffde7; /* 新 */
}
.shift-row.tag-huan,
.peripheral-shift-row.tag-huan {
  background-color: #e0f7fa; /* 換 */
}
.shift-row.tag-liang,
.peripheral-shift-row.tag-liang {
  background-color: #fff3e0; /* 兩 */
}
.shift-row.tag-b,
.peripheral-shift-row.tag-b {
  background-color: #fff9c4; /* B */
}

.patient-name.drag-over {
  background-color: #c8e6c9 !important;
}

/* -- 外圍床位 -- */
.extra-sections {
  margin-top: 30px;
}
.peripheral-section {
  margin-bottom: 20px;
}
.peripheral-bed-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
  gap: 10px;
}
.peripheral-bed .peripheral-header {
  background-color: #fce4ec;
  color: #c2185b;
}

/* ==========================================================================
   4. 側邊欄樣式 (Sidebar Styles) - **此區有微調**
   ========================================================================== */
.inpatient-sidebar h3 {
  margin-top: 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.filter-group button {
  padding: 4px 8px;
  font-size: 0.8em;
  flex-grow: 1;
  border: 1px solid #ccc;
  background-color: #fff;
  cursor: pointer;
}
.filter-group button:hover {
  background-color: #f0f0f0;
}
.filter-group button.active {
  background-color: var(--primary-color);
  color: white;
}

#inpatient-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  flex-grow: 1; /* **關鍵：讓列表填滿側邊欄剩餘空間** */
  overflow-y: auto; /* **關鍵：如果列表太長，讓列表自己滾動** */
}
#inpatient-list li {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 5px;
  cursor: grab;
}
#inpatient-list li:active {
  cursor: grabbing;
}

/* ==========================================================================
   5. 列印樣式 (Print Styles) - 維持不變
   ========================================================================== */
@page {
  size: A4 landscape;
  margin: 0.5cm;
}
@media print {
  body {
    padding: 0;
    background-color: #fff;
    font-size: 8pt;
    -webkit-print-color-adjust: exact;
    color-adjust: exact;
  }
  .controls-panel,
  .aisle,
  .status-indicator,
  #print-btn,
  #save-btn,
  #clear-all-btn,
  #copy-schedule-btn,
  #copy-source-date,
  .search-group,
  #today-btn,
  .date-nav-btn,
  .inpatient-sidebar {
    display: none !important;
  }
  .dialysis-unit,
  .extra-sections {
    max-width: 100%;
    box-shadow: none;
    gap: 10px;
  }
  .dialysis-unit {
    grid-template-columns: 1fr 1fr;
  }
  .bed,
  .nursing-station,
  .peripheral-bed {
    border: 1px solid #000;
    box-shadow: none;
    page-break-inside: avoid;
    border-radius: 3px;
  }
  .bed-row,
  .peripheral-bed-container {
    gap: 5px;
  }
  .bed {
    min-height: 120px;
  }
  /* -- 排程行 & 格子樣式 -- */
  .shift-row,
  .peripheral-shift-row {
    display: grid;
    align-items: stretch; /* 讓格子填滿高度 */
    border-top: 1px solid #e0e0e0;
    transition: background-color 0.3s;
  }
  .shift-row {
    grid-template-columns: 28px 60px 1fr 60px;
  } /* 微調備註欄寬度 */
  .peripheral-shift-row {
    grid-template-columns: 28px 70px 70px 1fr 50px;
  } /* 微調備註欄寬度 */

  .shift-label {
    background-color: #f5f5f5;
    font-size: 0.8em;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    border-right: 1px solid #e0e0e0;
  }
  .nurse-team-select,
  .patient-name,
  .peripheral-patient-name,
  .peripheral-bed-number,
  .nurse-split-column {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }
  .nurse-split-column {
    flex-direction: column;
  }
  .nurse-split-column .nurse-team-select {
    width: 100%;
    flex-grow: 1;
  }
  .peripheral-bed-number:empty::before {
    content: '';
  }

  .patient-name:empty::before,
  .peripheral-patient-name:empty::before {
    content: '輸入病人';
    color: #aaa;
    font-style: italic;
    font-size: 0.9em; /* 也可調整提示文字大小 */
  }
  .patient-tag:empty::before {
    content: '備註';
    color: #aaa;
    font-style: italic;
  }
  .patient-name:empty,
  .peripheral-patient-name:empty {
    background-color: transparent !important;
  }
  select,
  .nurse-team-select:has(option[value='']:checked) {
    -webkit-appearance: none;
    -moz-appearance: none;
    appearance: none;
    border: none;
    background: transparent !important;
  }
  .patient-name.tag-new,
  .peripheral-patient-name.tag-new,
  .patient-name.hospitalized,
  .peripheral-patient-name.hospitalized,
  .patient-name.tag-b,
  .peripheral-patient-name.tag-b,
  .patient-name.tag-chou,
  .peripheral-patient-name.tag-chou,
  .patient-name.tag-liang,
  .peripheral-patient-name.tag-liang,
  .patient-name.tag-huan,
  .peripheral-patient-name.tag-huan {
    background-color: inherit !important;
    border: 1px dotted #888;
  }
  .bed.hepatitis .bed-header {
    border-bottom: 2px double #000;
    background-color: #fff !important;
  }
}
</style>
