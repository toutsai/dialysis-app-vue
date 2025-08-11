<!-- 檔案路徑: src/views/DailyLogView.vue -->
<template>
  <div class="log-page-container">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入 {{ selectedDate }} 的日誌與排班資料...</p>
    </div>

    <header class="log-page-header">
      <div class="header-left">
        <h1>血液透析中心工作日誌</h1>
        <div class="date-navigator">
          <button @click="changeDate(-1)">❮ 上一日</button>
          <input type="date" v-model="selectedDate" />
          <button @click="goToToday">今日</button>
          <button @click="changeDate(1)">下一日 ❯</button>
        </div>
      </div>
      <div class="header-right">
        <span class="status-indicator">{{ statusText }}</span>
        <button @click="saveLog" class="save-btn" :disabled="!hasUnsavedChanges || isLoading">
          儲存日誌
        </button>
      </div>
    </header>

    <main class="log-page-main">
      <!-- ==================== 第一區: 營運統計 ==================== -->
      <section class="log-section">
        <div class="stats-grid">
          <!-- Grid Headers -->
          <div class="grid-header cell-item">項目</div>
          <div class="grid-header cell-category">班別</div>
          <div class="grid-header cell-shift">第一班 (7-12)</div>
          <div class="grid-header cell-shift">第二班 (12-3)</div>
          <div class="grid-header cell-shift">第三班 (3-11)</div>
          <div class="grid-header cell-total">合計</div>

          <!-- 洗腎中心床位 -->
          <div class="cell-item rowspan-3">洗腎中心床位 (限44床)</div>
          <div class="cell-category">門診人數</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.early.opd }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.noon.opd }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.late.opd }}</div>
          <div class="cell-total">
            {{
              dailyLog.stats.main_beds.early.opd +
              dailyLog.stats.main_beds.noon.opd +
              dailyLog.stats.main_beds.late.opd
            }}
          </div>

          <div class="cell-category">住院+急診來 HDR</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.early.ipd_er }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.noon.ipd_er }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.late.ipd_er }}</div>
          <div class="cell-total">
            {{
              dailyLog.stats.main_beds.early.ipd_er +
              dailyLog.stats.main_beds.noon.ipd_er +
              dailyLog.stats.main_beds.late.ipd_er
            }}
          </div>

          <div class="cell-category">總開床數(A)</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.early.total }}</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.noon.total }}</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.late.total }}</div>
          <div class="cell-total total-a">
            {{
              dailyLog.stats.main_beds.early.total +
              dailyLog.stats.main_beds.noon.total +
              dailyLog.stats.main_beds.late.total
            }}
          </div>

          <!-- 急重症床位 -->
          <div class="cell-item rowspan-2">急重症 (外圍)</div>
          <div class="cell-category">加護病房 A+B(B)</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.ipd }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.ipd }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.ipd }}</div>
          <div class="cell-total">
            {{
              dailyLog.stats.peripheral_beds.early.ipd +
              dailyLog.stats.peripheral_beds.noon.ipd +
              dailyLog.stats.peripheral_beds.late.ipd
            }}
          </div>

          <div class="cell-category">急診(C)</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.er }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.er }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.er }}</div>
          <div class="cell-total">
            {{
              dailyLog.stats.peripheral_beds.early.er +
              dailyLog.stats.peripheral_beds.noon.er +
              dailyLog.stats.peripheral_beds.late.er
            }}
          </div>

          <!-- 總人次 -->
          <div class="cell-item">總人次</div>
          <div class="cell-category">A+B+C</div>
          <div class="cell-data total-final">{{ totalPatients.early }}</div>
          <div class="cell-data total-final">{{ totalPatients.noon }}</div>
          <div class="cell-data total-final">{{ totalPatients.late }}</div>
          <div class="cell-total total-final">
            {{ totalPatients.early + totalPatients.noon + totalPatients.late }}
          </div>

          <!-- 病人照護 -->
          <div class="cell-item rowspan-3">病人照護</div>
          <div class="cell-category">ON D/L 病患</div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.onDL" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.akChange" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.noShow" />
          </div>
          <div class="cell-total"></div>

          <div class="cell-category">AK 凝固更換病患</div>
          <div class="cell-input"></div>
          <div class="cell-input"></div>
          <div class="cell-input"></div>
          <div class="cell-total"></div>

          <div class="cell-category">預約未到病患</div>
          <div class="cell-input"></div>
          <div class="cell-input"></div>
          <div class="cell-input"></div>
          <div class="cell-total"></div>

          <!-- 護理人力 -->
          <div class="cell-item">護理人力</div>
          <div class="cell-category"></div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.staffing.early" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.staffing.noon" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.staffing.late" />
          </div>
          <div class="cell-total"></div>
        </div>
      </section>

      <!-- ==================== 第二區: 病人動態表 ==================== -->
      <section class="log-section">
        <h2>病人動態表</h2>
        <div class="dynamic-table-container">
          <table class="dynamic-table">
            <thead>
              <tr>
                <th class="col-name">姓名</th>
                <th class="col-mrn">病歷號</th>
                <th class="col-date">住院日</th>
                <th class="col-date">出院日</th>
                <th class="col-reason">住院原因</th>
                <th class="col-bed">床號</th>
                <th class="col-remarks">備註</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dailyLog.patientMovements" :key="item.id">
                <td class="col-name">
                  <div class="autocomplete-wrapper">
                    <input
                      type="text"
                      v-model="item.name"
                      @input="handlePatientSearch(index, 'movements')"
                      @focus="handlePatientSearch(index, 'movements')"
                      placeholder="搜尋病人..."
                    />
                    <ul
                      v-if="activeSearch.type === 'movements' && activeSearch.index === index"
                      class="autocomplete-results"
                    >
                      <li
                        v-for="p in patientSearchResults"
                        :key="p.id"
                        @click="selectPatient(p, index, 'movements')"
                      >
                        {{ p.name }} ({{ p.medicalRecordNumber }})
                      </li>
                    </ul>
                  </div>
                </td>
                <td class="col-mrn"><input type="text" v-model="item.medicalRecordNumber" /></td>
                <td class="col-date"><input type="date" v-model="item.admissionDate" /></td>
                <td class="col-date"><input type="date" v-model="item.dischargeDate" /></td>
                <td class="col-reason"><input type="text" v-model="item.reason" /></td>
                <td class="col-bed"><input type="text" v-model="item.bedChange" /></td>
                <td class="col-remarks"><input type="text" v-model="item.remarks" /></td>
                <td class="col-actions">
                  <button @click="deleteRow(index, 'patientMovements')" class="delete-btn">
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <button @click="addRow('patientMovements')" class="add-row-btn">新增一筆動態</button>
        </div>
      </section>

      <!-- ==================== 第三區: 血管通路 ==================== -->
      <section class="log-section">
        <h2>血管通路阻塞</h2>
        <div class="dynamic-table-container">
          <table class="dynamic-table">
            <thead>
              <tr>
                <th class="col-name">姓名</th>
                <th class="col-mrn">病歷號</th>
                <th class="col-date">日期</th>
                <th class="col-interventions">處置</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dailyLog.vascularAccessLog" :key="item.id">
                <td class="col-name">
                  <div class="autocomplete-wrapper">
                    <input
                      type="text"
                      v-model="item.name"
                      @input="handlePatientSearch(index, 'vascular')"
                      @focus="handlePatientSearch(index, 'vascular')"
                      placeholder="搜尋病人..."
                    />
                    <ul
                      v-if="activeSearch.type === 'vascular' && activeSearch.index === index"
                      class="autocomplete-results"
                    >
                      <li
                        v-for="p in patientSearchResults"
                        :key="p.id"
                        @click="selectPatient(p, index, 'vascular')"
                      >
                        {{ p.name }} ({{ p.medicalRecordNumber }})
                      </li>
                    </ul>
                  </div>
                </td>
                <td class="col-mrn"><input type="text" v-model="item.medicalRecordNumber" /></td>
                <td class="col-date"><input type="date" v-model="item.date" /></td>
                <td class="col-interventions">
                  <div class="checkbox-group">
                    <label
                      ><input type="checkbox" value="PTA" v-model="item.interventions" />PTA</label
                    >
                    <label
                      ><input
                        type="checkbox"
                        value="新建"
                        v-model="item.interventions"
                      />新建</label
                    >
                    <label
                      ><input
                        type="checkbox"
                        value="重建"
                        v-model="item.interventions"
                      />重建</label
                    >
                  </div>
                </td>
                <td class="col-actions">
                  <button @click="deleteRow(index, 'vascularAccessLog')" class="delete-btn">
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <button @click="addRow('vascularAccessLog')" class="add-row-btn">新增一筆處置</button>
        </div>
      </section>

      <!-- ==================== 第四區: 其他事項 ==================== -->
      <section class="log-section">
        <h2>其他事項</h2>
        <textarea
          v-model="dailyLog.handoverNotes"
          class="handover-textarea"
          rows="8"
          placeholder="請輸入交班事項..."
        ></textarea>
      </section>

      <footer class="log-page-footer">
        <div class="leader-signature">
          <span>Leader</span>
          <span>第一班：<input type="text" v-model="dailyLog.leader.early" /></span>
          <span>第二班：<input type="text" v-model="dailyLog.leader.noon" /></span>
          <span>第三班：<input type="text" v-model="dailyLog.leader.late" /></span>
        </div>
      </footer>
    </main>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
// ✨ 核心修正 1：改回您專案中一直使用的 default import 方式
import ApiManager from '@/services/api_manager.js'
import { where } from 'firebase/firestore'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'

// ✨ 核心修正 2：在檔案內部創建需要的 API 實例，與其他頁面保持一致
const dailyLogsApi = ApiManager('daily_logs')
const schedulesApi = ApiManager('schedules')
const patientsApi = ApiManager('patients')

// --- State ---
const isLoading = ref(false)
const selectedDate = ref(formatDate(new Date()))
const statusText = ref('請選擇日期以載入資料')
const hasUnsavedChanges = ref(false)
const allPatients = ref([])
const patientMap = ref(new Map())

const initialLogState = () => ({
  id: null,
  date: selectedDate.value,
  stats: {
    main_beds: {
      early: { opd: 0, ipd_er: 0, total: 0 },
      noon: { opd: 0, ipd_er: 0, total: 0 },
      late: { opd: 0, ipd_er: 0, total: 0 },
    },
    peripheral_beds: {
      early: { ipd: 0, er: 0, total: 0 },
      noon: { ipd: 0, er: 0, total: 0 },
      late: { ipd: 0, er: 0, total: 0 },
    },
    patient_care: { onDL: null, akChange: null, noShow: null },
    staffing: { early: null, noon: null, late: null },
  },
  patientMovements: [],
  vascularAccessLog: [],
  handoverNotes: '',
  leader: { early: '', noon: '', late: '' },
})

const dailyLog = reactive(initialLogState())
const activeSearch = ref({ type: null, index: -1 })
const patientSearchResults = ref([])

// --- Computed ---
const totalPatients = computed(() => {
  const shifts = [SHIFT_CODES.EARLY, SHIFT_CODES.NOON, SHIFT_CODES.LATE]
  const totals = { early: 0, noon: 0, late: 0 }
  shifts.forEach((shift) => {
    totals[shift] =
      (dailyLog.stats.main_beds[shift]?.total || 0) +
      (dailyLog.stats.peripheral_beds[shift]?.total || 0)
  })
  return totals
})

// --- Utility Functions ---
function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

// --- Data Fetching & Processing ---
async function loadDailyLog(dateStr) {
  isLoading.value = true
  hasUnsavedChanges.value = false
  Object.assign(dailyLog, initialLogState(), { date: dateStr }) // Reset state

  try {
    // ✨ 核心修正：不再使用 fetchAll 進行查詢，而是直接用 fetchById 獲取文件
    const [logResult, scheduleData] = await Promise.all([
      dailyLogsApi.fetchById(dateStr), // <-- 改用 fetchById，直接傳入日期字串作為 ID
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
    ])

    // 如果 logResult 存在 (fetchById 找到文件會返回物件，否則返回 null)
    if (logResult) {
      Object.assign(dailyLog, logResult)
      statusText.value = '已載入儲存的日誌'
    } else {
      statusText.value = '新日誌（資料來自排班表）'
    }

    if (scheduleData.length > 0) {
      calculateStatsFromSchedule(scheduleData[0])
    } else {
      statusText.value = dailyLog.id ? '已載入儲存的日誌 (本日無排班)' : '本日無排班資料'
    }
  } catch (error) {
    // fetchById 找不到文件時不會拋出錯誤，而是返回 null，所以這裡的 catch 主要是處理真正的網路或權限問題
    console.error('載入日誌失敗:', error)
    statusText.value = '載入失敗'
    alert('載入日誌時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

function calculateStatsFromSchedule(scheduleRecord) {
  const stats = initialLogState().stats

  if (!scheduleRecord || !scheduleRecord.schedule) return

  for (const shiftKey in scheduleRecord.schedule) {
    const slotData = scheduleRecord.schedule[shiftKey]
    if (!slotData?.patientId) continue

    const patient = patientMap.value.get(slotData.patientId)
    if (!patient) continue

    const shiftCode = shiftKey.split('-').pop()
    const isPeripheral = shiftKey.startsWith('peripheral')

    if (isPeripheral) {
      stats.peripheral_beds[shiftCode].total++
      if (patient.status === 'ipd') stats.peripheral_beds[shiftCode].ipd++
      if (patient.status === 'er') stats.peripheral_beds[shiftCode].er++
    } else {
      stats.main_beds[shiftCode].total++
      if (patient.status === 'opd') stats.main_beds[shiftCode].opd++
      if (['ipd', 'er'].includes(patient.status)) stats.main_beds[shiftCode].ipd_er++
    }
  }

  // 只更新自動計算的部分，保留手動填寫的資料
  dailyLog.stats.main_beds = stats.main_beds
  dailyLog.stats.peripheral_beds = stats.peripheral_beds
}

// --- Event Handlers ---
function changeDate(days) {
  const newDate = new Date(selectedDate.value)
  newDate.setDate(newDate.getDate() + days)
  selectedDate.value = formatDate(newDate)
}

function goToToday() {
  selectedDate.value = formatDate(new Date())
}

function addRow(targetArrayKey) {
  const newId = Date.now()
  if (targetArrayKey === 'patientMovements') {
    dailyLog.patientMovements.push({
      id: newId,
      name: '',
      medicalRecordNumber: '',
      admissionDate: '',
      dischargeDate: '',
      reason: '',
      bedChange: '',
      remarks: '',
    })
  } else if (targetArrayKey === 'vascularAccessLog') {
    dailyLog.vascularAccessLog.push({
      id: newId,
      name: '',
      medicalRecordNumber: '',
      date: selectedDate.value,
      interventions: [],
    })
  }
}

function deleteRow(index, targetArrayKey) {
  if (confirm('確定要移除這一行嗎？')) {
    dailyLog[targetArrayKey].splice(index, 1)
  }
}

function handlePatientSearch(index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  const query = targetArray[index].name.toLowerCase()
  activeSearch.value = { type, index }

  if (!query) {
    patientSearchResults.value = []
    return
  }

  patientSearchResults.value = allPatients.value.filter(
    (p) => p.name.toLowerCase().includes(query) || p.medicalRecordNumber.includes(query),
  )
}

function selectPatient(patient, index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  targetArray[index].name = patient.name
  targetArray[index].patientId = patient.id
  targetArray[index].medicalRecordNumber = patient.medicalRecordNumber
  if (type === 'movements') {
    targetArray[index].admissionDate = patient.admissionDate || ''
  }
  activeSearch.value = { type: null, index: -1 }
}

async function saveLog() {
  if (isLoading.value) return
  isLoading.value = true
  statusText.value = '儲存中...'

  // 清理空的動態行
  dailyLog.patientMovements = dailyLog.patientMovements.filter(
    (item) => item.name || item.medicalRecordNumber,
  )
  dailyLog.vascularAccessLog = dailyLog.vascularAccessLog.filter(
    (item) => item.name || item.medicalRecordNumber,
  )

  try {
    const dataToSave = JSON.parse(JSON.stringify(dailyLog))
    if (dailyLog.id) {
      await dailyLogsApi.update(dailyLog.id, dataToSave)
    } else {
      const savedDoc = await dailyLogsApi.save(dataToSave)
      dailyLog.id = savedDoc.id
    }
    hasUnsavedChanges.value = false
    statusText.value = '日誌已儲存'
    alert('日誌儲存成功！')
  } catch (error) {
    console.error('儲存日誌失敗:', error)
    statusText.value = '儲存失敗'
    alert('儲存日誌時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

// --- Lifecycle & Watchers ---
onMounted(async () => {
  isLoading.value = true
  try {
    const patients = await patientsApi.fetchAll()
    allPatients.value = patients
    patientMap.value = new Map(patients.map((p) => [p.id, p]))
    await loadDailyLog(selectedDate.value)
  } catch (error) {
    console.error('初始化頁面失敗:', error)
    alert('頁面初始化失敗')
    statusText.value = '初始化失敗'
  }
  isLoading.value = false
})

watch(selectedDate, (newDate) => {
  if (newDate) {
    loadDailyLog(newDate)
  }
})

watch(
  dailyLog,
  (newValue, oldValue) => {
    // 忽略第一次載入時的觸發
    if (isLoading.value || !oldValue.date) return
    hasUnsavedChanges.value = true
    statusText.value = '有未儲存的變更'
  },
  { deep: true },
)
</script>

<style scoped>
/* 頁面與標題 */
.log-page-container {
  padding: 1rem;
  background-color: #f8f9fa;
}
.log-page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 2px solid #dee2e6;
  flex-wrap: wrap;
  gap: 1rem;
}
.header-left,
.header-right {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
h1 {
  font-size: 2rem;
  margin: 0;
  color: #343a40;
}
.date-navigator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.date-navigator input[type='date'] {
  font-size: 1.1rem;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
}
.status-indicator {
  font-style: italic;
  color: #6c757d;
}
button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: 1px solid #6c757d;
  background-color: #fff;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
button:hover {
  background-color: #e9ecef;
}
.save-btn {
  background-color: #28a745;
  color: white;
  border-color: #28a745;
  font-weight: 500;
}
.save-btn:hover:not(:disabled) {
  background-color: #218838;
}
.save-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

/* 主要內容區 */
.log-page-main {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
.log-section {
  background-color: #fff;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}
.log-section h2 {
  margin-top: 0;
  margin-bottom: 1.5rem;
  font-size: 1.5rem;
  color: #495057;
  border-bottom: 1px solid #e9ecef;
  padding-bottom: 0.75rem;
}

/* 統計表格 */
.stats-grid {
  display: grid;
  grid-template-columns: 140px 160px repeat(3, 1fr) 100px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
}
.stats-grid > div {
  padding: 0.75rem;
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stats-grid > div:nth-child(6n) {
  border-right: none;
}
.stats-grid .grid-header {
  font-weight: bold;
  background-color: #f8f9fa;
}
.cell-item {
  font-weight: 500;
  background-color: #f8f9fa;
  justify-content: flex-start;
}
.cell-category {
  justify-content: flex-start;
}
.rowspan-2 {
  grid-row: span 2;
}
.rowspan-3 {
  grid-row: span 3;
}
.cell-data {
  font-size: 1.2rem;
  font-weight: bold;
}
.total-a {
  background-color: #fffbe3;
}
.total-final {
  background-color: #e3fafc;
  font-size: 1.3rem;
}
.cell-input input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  text-align: center;
  font-size: 1.1rem;
}

/* 動態表格 */
.dynamic-table-container {
  width: 100%;
  overflow-x: auto;
}
.dynamic-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 900px;
}
.dynamic-table th,
.dynamic-table td {
  border: 1px solid #dee2e6;
  padding: 0.5rem;
  text-align: left;
  vertical-align: middle;
}
.dynamic-table th {
  background-color: #f8f9fa;
  font-weight: 500;
}
.dynamic-table input[type='text'],
.dynamic-table input[type='date'] {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid transparent;
  border-radius: 4px;
  transition: border-color 0.2s;
}
.dynamic-table input:focus {
  outline: none;
  border-color: #80bdff;
}
.col-name {
  width: 15%;
}
.col-mrn {
  width: 10%;
}
.col-date {
  width: 12%;
}
.col-reason,
.col-remarks {
  width: 20%;
}
.col-bed {
  width: 8%;
}
.col-interventions {
  width: 25%;
}
.col-actions {
  width: 100px;
  text-align: center;
}
.delete-btn,
.add-row-btn {
  background-color: #dc3545;
  color: white;
  border-color: #dc3545;
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
}
.add-row-btn {
  margin-top: 1rem;
  background-color: #007bff;
  border-color: #007bff;
}

/* Autocomplete */
.autocomplete-wrapper {
  position: relative;
}
.autocomplete-results {
  position: absolute;
  top: 100%;
  left: 0;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  background-color: #fff;
  border: 1px solid #ced4da;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0;
  margin: 0;
  z-index: 10;
}
.autocomplete-results li {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
}
.autocomplete-results li:hover {
  background-color: #e9ecef;
}

/* Checkbox group */
.checkbox-group {
  display: flex;
  gap: 1rem;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

/* 其他事項 & Footer */
.handover-textarea {
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  line-height: 1.6;
  border: 1px solid #ced4da;
  border-radius: 6px;
  resize: vertical;
}
.log-page-footer {
  margin-top: 1rem;
}
.leader-signature {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  font-size: 1.1rem;
}
.leader-signature input {
  padding: 0.3rem 0.5rem;
  border: none;
  border-bottom: 1px solid #6c757d;
  background: transparent;
  font-size: 1.1rem;
}

/* Loading Overlay */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.loading-spinner {
  border: 8px solid #f3f3f3;
  border-top: 8px solid #007bff;
  border-radius: 50%;
  width: 60px;
  height: 60px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}
@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
