<template>
  <div class="log-page-container" id="pdf-export-area">
    <div v-if="isLoading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>正在載入 {{ selectedDate }} 的日誌與排班資料...</p>
    </div>

    <header class="log-page-header">
      <div class="header-left">
        <h1>血液透析中心工作日誌</h1>

        <div class="date-navigator">
          <button @click="changeDate(-1)">❮ 上一日</button>

          <div class="date-display-wrapper">
            <input type="date" v-model="selectedDate" class="hidden-date-input" />
            <span class="current-date-text" @click="triggerDateInput">{{
              selectedDateDisplay
            }}</span>
            <span class="weekday-display">{{ weekdayDisplay }}</span>
          </div>

          <button @click="changeDate(1)">下一日 ❯</button>
          <button @click="goToToday" class="btn-goto-today">今日</button>
        </div>
      </div>
      <div class="header-right">
        <span class="status-indicator">{{ statusText }}</span>
        <button @click="exportToPDF" class="export-pdf-btn" :disabled="isLoading">匯出 PDF</button>
      </div>
    </header>

    <main class="log-page-main">
      <!-- ==================== 第一區: 營運統計 ==================== -->
      <section class="log-section">
        <!-- ✨ [Template 修改] 新增 section-header 來包裹標題和同步按鈕 ✨ -->
        <div class="section-header">
          <h2>營運統計</h2>
          <button @click="syncStatsWithSchedule" class="sync-stats-btn">
            <i class="fas fa-sync-alt"></i> 同步排班人數
          </button>
        </div>

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
          <div class="cell-category">門診</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.early.opd }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.noon.opd }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.late.opd }}</div>
          <div class="cell-total">
            {{
              (dailyLog.stats.main_beds.early.opd || 0) +
              (dailyLog.stats.main_beds.noon.opd || 0) +
              (dailyLog.stats.main_beds.late.opd || 0)
            }}
          </div>

          <div class="cell-category">住院+急診</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.early.ipd_er }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.noon.ipd_er }}</div>
          <div class="cell-data">{{ dailyLog.stats.main_beds.late.ipd_er }}</div>
          <div class="cell-total">
            {{
              (dailyLog.stats.main_beds.early.ipd_er || 0) +
              (dailyLog.stats.main_beds.noon.ipd_er || 0) +
              (dailyLog.stats.main_beds.late.ipd_er || 0)
            }}
          </div>

          <div class="cell-category">HDR開床數 (A)</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.early.total }}</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.noon.total }}</div>
          <div class="cell-data total-a">{{ dailyLog.stats.main_beds.late.total }}</div>
          <div class="cell-total total-a">
            {{
              (dailyLog.stats.main_beds.early.total || 0) +
              (dailyLog.stats.main_beds.noon.total || 0) +
              (dailyLog.stats.main_beds.late.total || 0)
            }}
          </div>

          <!-- 急重症床位 -->
          <div class="cell-item rowspan-2">急重症 (外圍)</div>
          <div class="cell-category">加護病房+RCC (B)</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.ipd }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.ipd }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.ipd }}</div>
          <div class="cell-total">
            {{
              (dailyLog.stats.peripheral_beds.early.ipd || 0) +
              (dailyLog.stats.peripheral_beds.noon.ipd || 0) +
              (dailyLog.stats.peripheral_beds.late.ipd || 0)
            }}
          </div>

          <div class="cell-category">急診 (C)</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.early.er }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.noon.er }}</div>
          <div class="cell-data">{{ dailyLog.stats.peripheral_beds.late.er }}</div>
          <div class="cell-total">
            {{
              (dailyLog.stats.peripheral_beds.early.er || 0) +
              (dailyLog.stats.peripheral_beds.noon.er || 0) +
              (dailyLog.stats.peripheral_beds.late.er || 0)
            }}
          </div>

          <!-- 總人次 -->
          <div class="cell-item">總人次</div>
          <div class="cell-category">(A)+(B)+(C)</div>
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
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.onDL.early" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.onDL.noon" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.onDL.late" />
          </div>
          <div class="cell-total">
            {{
              (dailyLog.stats.patient_care.onDL.early || 0) +
              (dailyLog.stats.patient_care.onDL.noon || 0) +
              (dailyLog.stats.patient_care.onDL.late || 0)
            }}
          </div>

          <div class="cell-category">AK 凝固更換病患</div>
          <div class="cell-input">
            <input
              type="number"
              min="0"
              v-model.number="dailyLog.stats.patient_care.akChange.early"
            />
          </div>
          <div class="cell-input">
            <input
              type="number"
              min="0"
              v-model.number="dailyLog.stats.patient_care.akChange.noon"
            />
          </div>
          <div class="cell-input">
            <input
              type="number"
              min="0"
              v-model.number="dailyLog.stats.patient_care.akChange.late"
            />
          </div>
          <div class="cell-total">
            {{
              (dailyLog.stats.patient_care.akChange.early || 0) +
              (dailyLog.stats.patient_care.akChange.noon || 0) +
              (dailyLog.stats.patient_care.akChange.late || 0)
            }}
          </div>

          <div class="cell-category">預約未到病患</div>
          <div class="cell-input">
            <input
              type="number"
              min="0"
              v-model.number="dailyLog.stats.patient_care.noShow.early"
            />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.noShow.noon" />
          </div>
          <div class="cell-input">
            <input type="number" min="0" v-model.number="dailyLog.stats.patient_care.noShow.late" />
          </div>
          <div class="cell-total">
            {{
              (dailyLog.stats.patient_care.noShow.early || 0) +
              (dailyLog.stats.patient_care.noShow.noon || 0) +
              (dailyLog.stats.patient_care.noShow.late || 0)
            }}
          </div>

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
          <div class="cell-total">
            {{
              (dailyLog.stats.staffing.early || 0) +
              (dailyLog.stats.staffing.noon || 0) +
              (dailyLog.stats.staffing.late || 0)
            }}
          </div>
        </div>
      </section>

      <section class="log-section">
        <div class="section-header">
          <h2>病人動態表</h2>
          <button @click="addRow('patientMovements')" class="add-row-btn-header">新增動態</button>
        </div>
        <div v-if="dailyLog.patientMovements.length > 0" class="dynamic-table-container">
          <table class="dynamic-table">
            <thead>
              <tr>
                <th class="col-name">姓名</th>
                <th class="col-mrn">病歷號</th>
                <th class="col-bed">床號</th>
                <th class="col-date">住院日</th>
                <th class="col-date">出院日</th>
                <th class="col-physician">會診醫師</th>
                <th class="col-reason-wide">住院原因</th>
                <th class="col-remarks-wide">備註</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dailyLog.patientMovements" :key="item.id">
                <td class="col-name">
                  <div class="autocomplete-wrapper">
                    <input
                      type="text"
                      :ref="(el) => (inputRefs[`movements-${index}`] = el)"
                      v-model="item.name"
                      @input="handlePatientSearch(index, 'movements')"
                      @focus="showAutocomplete($event, index, 'movements')"
                      @blur="hideAutocomplete"
                      placeholder="搜尋病人..."
                    />
                  </div>
                </td>
                <td class="col-mrn"><input type="text" v-model="item.medicalRecordNumber" /></td>
                <td class="col-bed">
                  <div
                    class="bed-change-cell"
                    :class="{
                      'is-clickable': ['ipd', 'er'].includes(
                        patientMap.get(item.patientId)?.status,
                      ),
                    }"
                    @click="promptWardNumber(index)"
                    title="點擊編輯住院床號"
                  >
                    {{ patientMap.get(item.patientId)?.wardNumber || '點擊設定' }}
                  </div>
                </td>
                <td class="col-date"><input type="date" v-model="item.admissionDate" /></td>
                <td class="col-date"><input type="date" v-model="item.dischargeDate" /></td>
                <td class="col-physician"><input type="text" v-model="item.physician" /></td>
                <td class="col-reason-wide"><input type="text" v-model="item.reason" /></td>
                <td class="col-remarks-wide"><input type="text" v-model="item.remarks" /></td>
                <td class="col-actions">
                  <button @click="deleteRow(index, 'patientMovements')" class="delete-btn">
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="log-section">
        <div class="section-header">
          <h2>血管通路阻塞</h2>
          <button @click="addRow('vascularAccessLog')" class="add-row-btn-header">新增處置</button>
        </div>
        <div v-if="dailyLog.vascularAccessLog.length > 0" class="dynamic-table-container">
          <table class="dynamic-table">
            <thead>
              <tr>
                <th class="col-name">姓名</th>
                <th class="col-mrn">病歷號</th>
                <th class="col-date">日期</th>
                <th class="col-interventions-wide">處置</th>
                <th class="col-location">處置院所</th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in dailyLog.vascularAccessLog" :key="item.id">
                <td class="col-name">
                  <div class="autocomplete-wrapper">
                    <input
                      type="text"
                      :ref="(el) => (inputRefs[`vascular-${index}`] = el)"
                      v-model="item.name"
                      @input="handlePatientSearch(index, 'vascular')"
                      @focus="showAutocomplete($event, index, 'vascular')"
                      @blur="hideAutocomplete"
                      placeholder="搜尋病人..."
                    />
                  </div>
                </td>
                <td class="col-mrn"><input type="text" v-model="item.medicalRecordNumber" /></td>
                <td class="col-date"><input type="date" v-model="item.date" /></td>
                <td class="col-interventions-wide">
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
                    <label
                      ><input
                        type="checkbox"
                        value="清血塊"
                        v-model="item.interventions"
                      />清血塊</label
                    >
                    <label
                      ><input
                        type="checkbox"
                        value="PERM-Cath"
                        v-model="item.interventions"
                      />PERM-Cath</label
                    >
                    <label
                      ><input
                        type="checkbox"
                        value="例行返診"
                        v-model="item.interventions"
                      />例行返診</label
                    >
                  </div>
                </td>
                <td class="col-location"><input type="text" v-model="item.location" /></td>
                <td class="col-actions">
                  <button @click="deleteRow(index, 'vascularAccessLog')" class="delete-btn">
                    移除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="log-section">
        <h2>其他事項</h2>
        <div class="autoresize-textarea-wrapper">
          <textarea
            v-model="dailyLog.handoverNotes"
            ref="handoverTextarea"
            class="handover-textarea"
            rows="1"
            placeholder="請輸入交班事項..."
            @input="handleTextareaInput"
          ></textarea>
        </div>
      </section>

      <footer class="log-page-footer">
        <div class="leader-signature-grid">
          <div class="leader-title">組長簽核</div>
          <div class="signature-slot">
            <span class="shift-label">第一班：</span>
            <div v-if="dailyLog.leader.early.name" class="signature-display">
              <div class="signature-info">
                <span class="leader-name leader-stamp">{{ dailyLog.leader.early.name }}</span>
                <span class="signature-time">{{
                  formatSignTime(dailyLog.leader.early.signedAt)
                }}</span>
              </div>
              <div class="signature-actions">
                <button
                  @click="signAsLeader('early')"
                  class="action-text-btn edit-btn"
                  title="修正或更新簽核"
                >
                  修正
                </button>
                <button
                  @click="unsignLeader('early')"
                  class="action-text-btn unsign-btn"
                  title="撤銷簽核"
                >
                  撤銷
                </button>
              </div>
            </div>
            <button v-else @click="signAsLeader('early')" class="sign-btn">簽核</button>
          </div>
          <div class="signature-slot">
            <span class="shift-label">第二班：</span>
            <div v-if="dailyLog.leader.noon.name" class="signature-display">
              <div class="signature-info">
                <span class="leader-name leader-stamp">{{ dailyLog.leader.noon.name }}</span>
                <span class="signature-time">{{
                  formatSignTime(dailyLog.leader.noon.signedAt)
                }}</span>
              </div>
              <div class="signature-actions">
                <button
                  @click="signAsLeader('noon')"
                  class="action-text-btn edit-btn"
                  title="修正或更新簽核"
                >
                  修正
                </button>
                <button
                  @click="unsignLeader('noon')"
                  class="action-text-btn unsign-btn"
                  title="撤銷簽核"
                >
                  撤銷
                </button>
              </div>
            </div>
            <button v-else @click="signAsLeader('noon')" class="sign-btn">簽核</button>
          </div>
          <div class="signature-slot">
            <span class="shift-label">第三班：</span>
            <div v-if="dailyLog.leader.late.name" class="signature-display">
              <span class="leader-name leader-stamp">{{ dailyLog.leader.late.name }}</span>
              <span class="signature-time">{{
                formatSignTime(dailyLog.leader.late.signedAt)
              }}</span>
              <div class="signature-actions">
                <button
                  @click="signAsLeader('late')"
                  class="action-text-btn edit-btn"
                  title="修正或更新簽核"
                >
                  修正
                </button>
                <button
                  @click="unsignLeader('late')"
                  class="action-text-btn unsign-btn"
                  title="撤銷簽核"
                >
                  撤銷
                </button>
              </div>
            </div>
            <button v-else @click="signAsLeader('late')" class="sign-btn">簽核</button>
          </div>
        </div>
      </footer>
    </main>

    <ul v-if="isAutocompleteVisible" class="global-autocomplete-results" :style="autocompleteStyle">
      <li
        v-for="p in patientSearchResults"
        :key="p.id"
        @mousedown.prevent="selectPatient(p, activeSearch.index, activeSearch.type)"
      >
        {{ p.name }} ({{ p.medicalRecordNumber }})
      </li>
      <li v-if="patientSearchResults.length === 0" class="no-results">無符合結果</li>
    </ul>

    <WardNumberDialog
      :is-visible="isWardDialogVisible"
      :current-value="
        currentEditingMovementIndex > -1
          ? patientMap.get(dailyLog.patientMovements[currentEditingMovementIndex].patientId)
              ?.wardNumber
          : ''
      "
      @confirm="handleWardNumberConfirm"
      @cancel="handleWardNumberCancel"
    />
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
import ApiManager from '@/services/api_manager.js'
import { useAuth } from '@/composables/useAuth.js'
import { where } from 'firebase/firestore'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'
import WardNumberDialog from '@/components/WardNumberDialog.vue'
import { updatePatient as optimizedUpdatePatient } from '@/services/optimizedApiService.js'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

const patientStore = usePatientStore()
const { allPatients, patientMap } = storeToRefs(patientStore)

const dailyLogsApi = ApiManager('daily_logs')
const schedulesApi = ApiManager('schedules')

const isLoading = ref(false)
const selectedDate = ref(formatDate(new Date()))
const hasUnsavedChanges = ref(false)
const { currentUser } = useAuth()
const handoverTextarea = ref(null)
const isWardDialogVisible = ref(false)
const currentEditingMovementIndex = ref(-1)
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')
const currentSchedule = ref({})

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
    patient_care: {
      onDL: { early: null, noon: null, late: null },
      akChange: { early: null, noon: null, late: null },
      noShow: { early: null, noon: null, late: null },
    },
    staffing: { early: null, noon: null, late: null },
  },
  patientMovements: [],
  vascularAccessLog: [],
  handoverNotes: '',
  leader: {
    early: { userId: null, name: null, signedAt: null },
    noon: { userId: null, name: null, signedAt: null },
    late: { userId: null, name: null, signedAt: null },
  },
})

const dailyLog = reactive(initialLogState())
const activeSearch = ref({ type: null, index: -1 })
const patientSearchResults = ref([])
const inputRefs = reactive({})
const isAutocompleteVisible = ref(false)
const autocompleteStyle = reactive({ top: '0px', left: '0px', width: '0px' })

const selectedDateDisplay = computed(() => {
  const d = new Date(selectedDate.value)
  if (isNaN(d.getTime())) return selectedDate.value
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}/${month}/${day}`
})

const weekdayDisplay = computed(() => {
  try {
    const d = new Date(selectedDate.value)
    return ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  } catch {
    return ''
  }
})

const statusText = computed(() => {
  if (hasUnsavedChanges.value) {
    return '有未儲存的變更'
  }
  const isSigned = Object.values(dailyLog.leader).some((l) => l && l.userId)
  return isSigned ? '變更已儲存' : '尚未簽核'
})

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

function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

async function saveLog(successMessage = '日誌已儲存！') {
  if (isLoading.value) return
  isLoading.value = true
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
      const docId = selectedDate.value
      await dailyLogsApi.save(docId, dataToSave)
      dailyLog.id = docId
    }
    hasUnsavedChanges.value = false
    showAlert('操作成功', successMessage)
  } catch (error) {
    console.error('儲存日誌失敗:', error)
    showAlert('儲存失敗', '儲存日誌時發生錯誤')
  } finally {
    isLoading.value = false
  }
}

async function loadDailyLog(dateStr) {
  isLoading.value = true
  hasUnsavedChanges.value = false
  Object.assign(dailyLog, initialLogState(), { date: dateStr })
  currentSchedule.value = {}
  try {
    await patientStore.fetchPatientsIfNeeded()
    const [logResult, scheduleData] = await Promise.all([
      dailyLogsApi.fetchById(dateStr),
      schedulesApi.fetchAll([where('date', '==', dateStr)]),
    ])
    if (logResult) {
      const mergedLog = { ...initialLogState(), ...logResult }
      Object.assign(dailyLog, mergedLog)
    }
    if (scheduleData.length > 0) {
      currentSchedule.value = scheduleData[0].schedule || {}
      if (!logResult) {
        calculateStatsFromSchedule(scheduleData[0])
      }
    }
  } catch (error) {
    console.error('載入日誌失敗:', error)
    showAlert('載入失敗', '載入日誌時發生錯誤')
  } finally {
    isLoading.value = false
    await nextTick()
    handleTextareaInput()
  }
}

// ✨ [Script 修改] 微調函式，讓它只更新特定部分的 stats
function calculateStatsFromSchedule(scheduleRecord) {
  const newStats = {
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
  }

  if (!scheduleRecord || !scheduleRecord.schedule) {
    dailyLog.stats.main_beds = newStats.main_beds
    dailyLog.stats.peripheral_beds = newStats.peripheral_beds
    return
  }

  for (const shiftKey in scheduleRecord.schedule) {
    const slotData = scheduleRecord.schedule[shiftKey]
    if (!slotData?.patientId) continue
    const patient = patientMap.value.get(slotData.patientId)
    if (!patient) continue
    const shiftCode = shiftKey.split('-').pop()
    const isPeripheral = shiftKey.startsWith('peripheral')
    if (isPeripheral) {
      newStats.peripheral_beds[shiftCode].total++
      if (patient.status === 'ipd') {
        newStats.peripheral_beds[shiftCode].ipd++
      } else if (patient.status === 'er') {
        newStats.peripheral_beds[shiftCode].er++
      }
    } else {
      newStats.main_beds[shiftCode].total++
      if (patient.status === 'opd') {
        newStats.main_beds[shiftCode].opd++
      } else if (patient.status === 'ipd' || patient.status === 'er') {
        newStats.main_beds[shiftCode].ipd_er++
      }
    }
  }

  dailyLog.stats.main_beds = newStats.main_beds
  dailyLog.stats.peripheral_beds = newStats.peripheral_beds
}

// ✨ [Script 修改] 新增同步按鈕的處理函式
async function syncStatsWithSchedule() {
  showConfirm(
    '確認同步人數',
    '此操作將會用最新的「每日排程表」資料覆蓋上方的「洗腎中心床位」與「急重症床位」統計。您手動填寫的其他欄位（如病人照護、護理人力）將不受影響。確定要繼續嗎？',
    async () => {
      isLoading.value = true
      try {
        const scheduleData = await schedulesApi.fetchAll([where('date', '==', selectedDate.value)])
        if (scheduleData.length > 0) {
          calculateStatsFromSchedule(scheduleData[0])
          hasUnsavedChanges.value = true
          showAlert('同步成功', '人數統計已更新，請記得儲存變更！')
        } else {
          showAlert('同步失敗', `找不到 ${selectedDate.value} 的排班資料。`)
        }
      } catch (error) {
        console.error('同步排班統計失敗:', error)
        showAlert('同步失敗', '同步人數統計時發生錯誤。')
      } finally {
        isLoading.value = false
      }
    },
  )
}

function changeDate(days) {
  const newDate = new Date(selectedDate.value)
  newDate.setDate(newDate.getDate() + days)
  selectedDate.value = formatDate(newDate)
}
function goToToday() {
  selectedDate.value = formatDate(new Date())
}
function triggerDateInput() {
  document.querySelector('.hidden-date-input').showPicker()
}
function addRow(targetArrayKey) {
  const newId = Date.now()
  if (targetArrayKey === 'patientMovements') {
    dailyLog.patientMovements.push({
      id: newId,
      name: '',
      medicalRecordNumber: '',
      bedChange: '',
      admissionDate: '',
      dischargeDate: '',
      physician: '',
      reason: '',
      remarks: '',
    })
  } else if (targetArrayKey === 'vascularAccessLog') {
    dailyLog.vascularAccessLog.push({
      id: newId,
      name: '',
      medicalRecordNumber: '',
      date: selectedDate.value,
      interventions: [],
      location: '',
    })
  }
}
function deleteRow(index, targetArrayKey) {
  showConfirm('確認移除', '您確定要移除這一行嗎？', () => {
    dailyLog[targetArrayKey].splice(index, 1)
  })
}
function handlePatientSearch(index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  const query = targetArray[index].name.toLowerCase()
  if (!query) {
    patientSearchResults.value = []
    return
  }
  patientSearchResults.value = allPatients.value.filter(
    (p) => p.name.toLowerCase().includes(query) || p.medicalRecordNumber.includes(query),
  )
}
function showAutocomplete(event, index, type) {
  activeSearch.value = { type, index }
  handlePatientSearch(index, type)
  const inputElement = event.target
  const rect = inputElement.getBoundingClientRect()
  autocompleteStyle.top = `${rect.bottom + window.scrollY}px`
  autocompleteStyle.left = `${rect.left + window.scrollX}px`
  autocompleteStyle.width = `${rect.width}px`
  isAutocompleteVisible.value = true
}
function hideAutocomplete() {
  setTimeout(() => {
    isAutocompleteVisible.value = false
  }, 200)
}
function selectPatient(patient, index, type) {
  const targetArray = type === 'movements' ? dailyLog.patientMovements : dailyLog.vascularAccessLog
  targetArray[index].name = patient.name
  targetArray[index].patientId = patient.id
  targetArray[index].medicalRecordNumber = patient.medicalRecordNumber
  if (type === 'movements') {
    targetArray[index].admissionDate = patient.admissionDate || ''
    targetArray[index].physician = patient.physician || ''
    let foundBed = ''
    if (currentSchedule.value) {
      for (const shiftKey in currentSchedule.value) {
        const slot = currentSchedule.value[shiftKey]
        if (slot.patientId === patient.id) {
          const parts = shiftKey.split('-')
          foundBed = parts[0] === 'peripheral' ? `外圍${parts[1]}` : parts[1]
          break
        }
      }
    }
    targetArray[index].bedChange = foundBed
  }
  isAutocompleteVisible.value = false
}
async function signAsLeader(shift) {
  if (!currentUser.value) return
  const performSign = async (isOverride = false) => {
    dailyLog.leader[shift] = {
      userId: currentUser.value.uid,
      name: currentUser.value.name,
      signedAt: new Date().toISOString(),
    }
    const successMsg = isOverride ? '覆蓋簽核成功！日誌已更新。' : '簽核成功！日誌已儲存。'
    await saveLog(successMsg)
  }
  const existingLeader = dailyLog.leader[shift]
  let confirmMsg = `您確定要以「${currentUser.value.name}」的名義簽核此班別，並儲存所有變更嗎？`
  let confirmTitle = '確認簽核'
  if (existingLeader?.userId && existingLeader.userId !== currentUser.value.uid) {
    confirmTitle = '覆蓋簽核'
    confirmMsg = `此班別已由 ${existingLeader.name} 簽核。\n\n` + confirmMsg
  } else if (existingLeader?.userId && !hasUnsavedChanges.value) {
    showAlert('提示', '您已簽核，且日誌無未儲存的變更。')
    return
  } else if (hasUnsavedChanges.value) {
    confirmTitle = '更新簽核並儲存'
  }
  showConfirm(confirmTitle, confirmMsg, performSign)
}
function formatSignTime(isoString) {
  if (!isoString) return ''
  const date = new Date(isoString)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}
async function unsignLeader(shift) {
  if (!currentUser.value) return
  const performUnsign = async () => {
    dailyLog.leader[shift] = { userId: null, name: null }
    await saveLog('撤銷簽核成功！日誌已更新。')
  }
  if (dailyLog.leader[shift]?.userId) {
    if (
      dailyLog.leader[shift]?.userId === currentUser.value.uid ||
      currentUser.value.role === 'admin'
    ) {
      showConfirm(
        '撤銷簽核',
        `您確定要撤銷 ${dailyLog.leader[shift].name} 的簽核並儲存變更嗎？`,
        performUnsign,
      )
    } else {
      showAlert('權限不足', '您沒有權限撤銷其他人的簽核。')
    }
  }
}
function showConfirm(title, message, onConfirmCallback) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmAction.value = onConfirmCallback
  isConfirmDialogVisible.value = true
}
function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  handleCancel()
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmDialogTitle.value = ''
  confirmDialogMessage.value = ''
  confirmAction.value = null
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
function promptWardNumber(index) {
  const patientId = dailyLog.patientMovements[index]?.patientId
  if (!patientId) {
    showAlert('操作失敗', '請先透過「姓名」欄位選擇一位病人，才能設定床號。')
    return
  }
  const patient = patientMap.value.get(patientId)
  if (!patient || !['ipd', 'er'].includes(patient.status)) {
    showAlert(
      '提示',
      `病人「${patient.name}」目前的狀態是「${patient.status === 'opd' ? '門診' : '未知'}」，無法設定住院床號。`,
    )
    return
  }
  currentEditingMovementIndex.value = index
  isWardDialogVisible.value = true
}
async function handleWardNumberConfirm(newWardNumber) {
  const index = currentEditingMovementIndex.value
  if (index < 0) return
  const patientId = dailyLog.patientMovements[index]?.patientId
  if (!patientId) return
  try {
    await optimizedUpdatePatient(patientId, { wardNumber: newWardNumber })
    await patientStore.forceRefreshPatients()
    showAlert('操作成功', '住院床號已更新！')
  } catch (error) {
    console.error('更新住院床號失敗:', error)
    showAlert('操作失敗', '更新住院床號時發生錯誤。')
  } finally {
    handleWardNumberCancel()
  }
}
function handleWardNumberCancel() {
  isWardDialogVisible.value = false
  currentEditingMovementIndex.value = -1
}
function handleTextareaInput() {
  const textarea = handoverTextarea.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }
}
async function exportToPDF() {
  if (isLoading.value) {
    showAlert('提示', '目前正在載入資料，請稍後再試。')
    return
  }
  const originalLoadingText = document.querySelector('.loading-overlay p')?.textContent || ''
  const loadingOverlay = document.querySelector('.loading-overlay')
  const loadingTextElement = document.querySelector('.loading-overlay p')
  if (loadingOverlay) {
    if (loadingTextElement) {
      loadingTextElement.textContent = '正在準備匯出 PDF，請稍候...'
    }
    isLoading.value = true
  }
  await new Promise((resolve) => setTimeout(resolve, 50))
  try {
    const exportArea = document.getElementById('pdf-export-area')
    if (!exportArea) {
      showAlert('錯誤', '找不到要匯出的內容！')
      return
    }
    isLoading.value = false
    exportArea.classList.add('pdf-export-mode')
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))
    const canvas = await html2canvas(exportArea, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      ignoreElements: (element) =>
        element.classList.contains('header-right') || element.classList.contains('loading-overlay'),
    })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdfWidth = 210
    const pdfHeight = 297
    const contentWidth = canvas.width
    const contentHeight = canvas.height
    const pageHeight = (contentWidth / pdfWidth) * pdfHeight
    let leftHeight = contentHeight
    let position = 0
    const pdf = new jsPDF('p', 'mm', 'a4')
    if (leftHeight < pageHeight) {
      pdf.addImage(
        imgData,
        'JPEG',
        10,
        10,
        pdfWidth - 20,
        (pdfWidth / contentWidth) * contentHeight - 20,
      )
    } else {
      while (leftHeight > 0) {
        pdf.addImage(
          imgData,
          'JPEG',
          10,
          position + 10,
          pdfWidth - 20,
          (pdfWidth / contentWidth) * contentHeight - 20,
        )
        leftHeight -= pageHeight
        position -= pdfHeight
        if (leftHeight > 0) {
          pdf.addPage()
        }
      }
    }
    pdf.save(`血液透析中心工作日誌_${selectedDate.value}.pdf`)
  } catch (error) {
    console.error('匯出 PDF 失敗:', error)
    showAlert('錯誤', '匯出 PDF 時發生錯誤，請檢查主控台訊息。')
  } finally {
    const exportArea = document.getElementById('pdf-export-area')
    if (exportArea) {
      exportArea.classList.remove('pdf-export-mode')
    }
    if (loadingTextElement) {
      loadingTextElement.textContent = originalLoadingText
    }
    isLoading.value = false
  }
}
onMounted(async () => {
  await loadDailyLog(selectedDate.value)
})
watch(selectedDate, (newDate) => {
  if (newDate) {
    loadDailyLog(newDate)
  }
})
watch(
  dailyLog,
  () => {
    if (isLoading.value) return
    hasUnsavedChanges.value = true
  },
  { deep: true },
)
</script>

<style scoped>
/* ✨ [Style 修改] 引入 Font Awesome (如果全域沒有的話) 和新增按鈕樣式 ✨ */
@import url('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.4/css/all.min.css');

/* 頁面與標題 */
.log-page-container {
  padding: 0.5rem;
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
  gap: 10px;
}
.date-navigator button {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border: 1px solid #6c757d;
  background-color: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
}
.date-navigator button:hover {
  background-color: #e9ecef;
}
.date-display-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: #fff;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 10px;
  height: 45px;
  cursor: pointer;
}
.hidden-date-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
.current-date-text {
  font-size: 1.5rem;
  font-weight: bold;
  color: #343a40;
  white-space: nowrap;
}
.weekday-display {
  font-size: 1.5rem;
  font-weight: bold;
  color: #007bff;
}
.btn-goto-today {
  order: 3;
}
.status-indicator {
  font-style: italic;
  color: #6c757d;
  font-weight: 500;
}
.export-pdf-btn {
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
  white-space: nowrap;
  background-color: #17a2b8;
  color: white;
  border-color: #17a2b8;
}
.export-pdf-btn:hover:not(:disabled) {
  background-color: #138496;
}
.export-pdf-btn:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
  opacity: 0.7;
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

/* ✨ [Style 修改] 新增同步按鈕和 section-header 樣式 ✨ */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}
.section-header h2 {
  margin: 0;
  padding: 0;
  border: none;
  font-size: 1.5rem;
  color: #495057;
}
.sync-stats-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  background-color: #6c757d;
  color: white;
  border: 1px solid #6c757d;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.sync-stats-btn:hover {
  background-color: #5a6268;
}
.sync-stats-btn .fa-sync-alt {
  animation: none;
}
.sync-stats-btn:active .fa-sync-alt {
  animation: spin 1s linear infinite;
}
.add-row-btn-header {
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
  font-weight: 500;
  background-color: #007bff;
  color: white;
  border: 1px solid #007bff;
  border-radius: 6px;
  cursor: pointer;
}

/* 統計表格 */
.stats-grid {
  display: grid;
  grid-template-columns: 140px 160px repeat(3, 1fr) 100px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  overflow: hidden;
}
/* ... (其餘所有樣式保持不變) ... */
.stats-grid > div {
  padding: 0.75rem;
  border-bottom: 1px solid #e9ecef;
  border-right: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  justify-content: center;
}
.stats-grid > div:last-child {
  border-right: none;
}
.stats-grid tr > td:last-child {
  border-right: none;
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
.dynamic-table-container {
  width: 100%;
  overflow-x: auto;
}
.dynamic-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 1200px;
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
  text-align: center;
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
.dynamic-table .col-name {
  width: 12%;
  min-width: 120px;
}
.dynamic-table .col-mrn {
  width: 9%;
  min-width: 90px;
}
.dynamic-table .col-bed {
  width: 8%;
  min-width: 80px;
}
.dynamic-table .col-date {
  width: 11%;
  min-width: 130px;
}
.dynamic-table .col-physician {
  width: 10%;
  min-width: 100px;
}
.dynamic-table .col-reason-wide {
  width: auto;
}
.dynamic-table .col-remarks-wide {
  width: auto;
}
.dynamic-table .col-interventions-wide {
  width: 40%;
  min-width: 380px;
}
.dynamic-table .col-location {
  width: 15%;
  min-width: 120px;
}
.dynamic-table .col-actions {
  width: 80px;
  min-width: 80px;
  text-align: center;
}
.delete-btn {
  background-color: #dc3545;
  color: white;
  border: 1px solid #dc3545;
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.delete-btn:hover {
  background-color: #c82333;
}
.action-text-btn {
  padding: 0.4rem 0.8rem;
  font-size: 0.9rem;
  border-radius: 6px;
  border: 1px solid;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}
.action-text-btn.edit-btn {
  background-color: #6c757d;
  color: white;
  border-color: #6c757d;
}
.action-text-btn.edit-btn:hover {
  background-color: #5a6268;
}
.action-text-btn.unsign-btn {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.action-text-btn.unsign-btn:hover {
  background-color: #e0a800;
}
.bed-change-cell {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
  box-sizing: border-box;
  border-radius: 4px;
  background-color: #f8f9fa;
  border: 1px dashed transparent;
  color: #495057;
  font-weight: 500;
  transition: all 0.2s;
}
.bed-change-cell.is-clickable {
  cursor: pointer;
  border-color: #ced4da;
}
.bed-change-cell.is-clickable:hover {
  border-color: #007bff;
  background-color: #e7f1ff;
  color: #0056b3;
}
.autocomplete-wrapper {
  position: relative;
}
:deep(.global-autocomplete-results) {
  position: fixed;
  max-height: 200px;
  overflow-y: auto;
  background-color: #fff;
  border: 1px solid #ced4da;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
  list-style: none;
  padding: 0;
  margin: 0;
  z-index: 1000;
  border-radius: 4px;
}
:deep(.global-autocomplete-results li) {
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  white-space: nowrap;
}
:deep(.global-autocomplete-results li:hover) {
  background-color: #e9ecef;
}
:deep(.global-autocomplete-results .no-results) {
  padding: 0.5rem 0.75rem;
  color: #6c757d;
  cursor: default;
}
.checkbox-group {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}
.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}
.autoresize-textarea-wrapper {
  position: relative;
}
.handover-textarea {
  width: 100%;
  padding: 1rem;
  font-size: 1.1rem;
  line-height: 1.6;
  border: 1px solid #ced4da;
  border-radius: 6px;
  resize: none;
  overflow-y: hidden;
  min-height: 50px;
  box-sizing: border-box;
}
.log-page-footer {
  margin-top: 1rem;
  padding-top: 1.5rem;
  border-top: 1px solid #e9ecef;
}
.leader-signature-grid {
  display: grid;
  grid-template-columns: 140px repeat(3, 1fr);
  align-items: center;
  gap: 1.5rem;
  max-width: 900px;
}
.leader-title {
  font-size: 1.2rem;
  font-weight: 500;
  color: #495057;
  justify-self: start;
}
.signature-slot {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 0.75rem;
}
.shift-label {
  font-size: 1.1rem;
  color: #495057;
  font-weight: 500;
  white-space: nowrap;
}
.sign-btn {
  width: 100px;
  padding: 0.6rem 1.2rem;
  font-size: 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  background-color: #007bff;
  color: white;
  border: 1px solid #007bff;
}
.sign-btn:hover {
  background-color: #0056b3;
}
.signature-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 45px;
  padding: 4px 8px;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  gap: 0.5rem;
  min-width: 160px;
}
.signature-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.leader-name {
  font-size: 1.1rem;
  font-weight: bold;
}
.leader-stamp {
  font-family: 'KaiTi', '標楷體', serif;
  color: #c82333;
  border: 2px solid #c82333;
  border-radius: 8px;
  padding: 2px 8px;
  letter-spacing: 2px;
  font-weight: bold;
  transform: rotate(-5deg);
  user-select: none;
  box-shadow: 0 0 2px rgba(0, 0, 0, 0.2);
  white-space: nowrap;
}
.signature-time {
  font-size: 0.8rem;
  color: #6c757d;
  font-weight: 500;
  align-self: flex-end;
  padding-bottom: 2px;
}
.signature-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
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
.pdf-export-mode .log-page-header {
  padding-bottom: 0.5rem;
  margin-bottom: 1rem;
  border: none;
}
.pdf-export-mode .log-section {
  padding: 1rem;
  margin-bottom: 1rem !important;
  box-shadow: none;
  border: 1px solid #dee2e6;
}
.pdf-export-mode h2 {
  margin-bottom: 1rem;
  font-size: 1.3rem;
  padding-bottom: 0.5rem;
}
.pdf-export-mode .stats-grid {
  grid-template-columns: 120px 140px repeat(3, 1fr) 80px;
}
.pdf-export-mode .stats-grid > div {
  padding: 0.5rem;
}
.pdf-export-mode .dynamic-table th,
.pdf-export-mode .dynamic-table td {
  padding: 0.4rem;
}
.pdf-export-mode .dynamic-table input {
  padding: 0.3rem;
  font-size: 0.9rem;
  background-color: #f8f9fa;
}
.pdf-export-mode .add-row-btn-header {
  display: none;
}
.pdf-export-mode .leader-signature-grid {
  gap: 1rem;
}
.pdf-export-mode .sign-btn,
.pdf-export-mode .unsign-btn,
.pdf-export-mode .edit-btn {
  box-shadow: none;
  border-width: 1px;
}
@media (max-width: 992px) {
  .leader-signature-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
  .leader-title {
    grid-column: 1 / -1;
    text-align: center;
    margin-bottom: 0.5rem;
  }
  .signature-slot {
    justify-content: space-between;
  }
}
</style>
