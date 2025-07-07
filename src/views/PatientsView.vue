<!-- 檔案路徑: src/views/PatientView.vue -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { deleteField, where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue' // 1. 確保已引入
import { useAuth } from '@/composables/useAuth.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import * as XLSX from 'xlsx'

const patientApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const allPatients = ref([])
const activeTab = ref('er')
const currentSort = ref({ column: 'createdAt', order: 'desc' })

const erSearchTerm = ref('')
const ipdSearchTerm = ref('')
const opdSearchTerm = ref('')
const deletedSearchTerm = ref('')

const isModalVisible = ref(false)
const editingPatient = ref(null)
const modalType = ref('ipd')
const isDeleteDialogVisible = ref(false)
const patientToDeleteId = ref(null)

const isAlertDialogVisible = ref(false)
const alertDialogTitle = ref('')
const alertDialogMessage = ref('')

// 2. 為 ConfirmDialog 定義狀態
const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)

const FREQ_COLOR_MAP = {
  一三五: 'freq-blue',
  二四六: 'freq-green',
  一四: 'freq-orange',
  二五: 'freq-orange',
  三六: 'freq-orange',
  一五: 'freq-orange',
  二六: 'freq-orange',
  每周一次: 'freq-teal',
  臨時: 'freq-red',
  未設定: 'freq-grey',
}

const DELETE_REASONS = [
  { value: '出院', text: '出院' },
  { value: '死亡', text: '死亡' },
  { value: '轉外院透析', text: '轉外院透析' },
  { value: '轉PD', text: '轉PD' },
  { value: '腎臟移植', text: '腎臟移植' },
  { value: '作廢', text: '作廢' },
]
const { isReadOnly } = useAuth()
const isPageLocked = computed(() => isReadOnly.value)

const displayedPatients = computed(() => {
  let patients
  let searchTerm = ''

  if (activeTab.value === 'er') {
    patients = allPatients.value.filter((p) => p.status === 'er' && !p.isDeleted)
    searchTerm = erSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'ipd') {
    patients = allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted)
    searchTerm = ipdSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'opd') {
    patients = allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted)
    searchTerm = opdSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'deleted') {
    patients = allPatients.value.filter((p) => p.isDeleted)
    searchTerm = deletedSearchTerm.value.toLowerCase()
  } else {
    patients = []
  }

  if (searchTerm) {
    patients = patients.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(searchTerm)) ||
        (p.medicalRecordNumber && p.medicalRecordNumber.includes(searchTerm)),
    )
  }

  return [...patients].sort((a, b) => {
    let valA, valB
    if (currentSort.value.column === 'freq') {
      valA = a.freq
      valB = b.freq
    } else {
      valA = a[currentSort.value.column]
      valB = b[currentSort.value.column]
    }
    if (valA && typeof valA.toDate === 'function') valA = valA.toDate()
    if (valB && typeof valB.toDate === 'function') valB = valB.toDate()
    valA = valA || ''
    valB = valB || ''
    const compare = String(valA).localeCompare(String(valB), 'zh-Hant')
    return currentSort.value.order === 'asc' ? compare : -compare
  })
})

const patientStats = computed(() => {
  if (activeTab.value === 'deleted') {
    return null
  }
  const currentTabPatients = allPatients.value.filter(
    (p) => p.status === activeTab.value && !p.isDeleted,
  )

  const stats = {
    total: currentTabPatients.length,
    byFrequency: {},
  }

  currentTabPatients.forEach((patient) => {
    const freq = patient.freq || '未設定'
    if (!stats.byFrequency[freq]) {
      stats.byFrequency[freq] = 0
    }
    stats.byFrequency[freq]++
  })

  const sortedFrequencies = {}
  const freqOrder = [
    '一三五',
    '二四六',
    '一四',
    '二五',
    '三六',
    '一五',
    '二六',
    '每周一次',
    '臨時',
    '未設定',
  ]

  freqOrder.forEach((key) => {
    if (stats.byFrequency[key]) {
      sortedFrequencies[key] = stats.byFrequency[key]
    }
  })
  for (const key in stats.byFrequency) {
    if (!sortedFrequencies[key]) {
      sortedFrequencies[key] = stats.byFrequency[key]
    }
  }
  stats.byFrequency = sortedFrequencies

  return stats
})

function exportDeletedPatients() {
  const deletedPatients = allPatients.value.filter((p) => p.isDeleted)
  if (deletedPatients.length === 0) {
    alert('沒有已刪除的病人資料可供匯出。')
    return
  }

  const headers = ['姓名', '病歷號', '原狀態', '刪除原因', '刪除日期', '備註']
  const data = deletedPatients.map((p) => [
    p.name || '',
    p.medicalRecordNumber || '',
    p.originalStatus === 'ipd' ? '住院' : p.originalStatus === 'er' ? '急診' : '門診',
    p.deleteReason || '',
    formatDate(p.deletedAt) || '',
    p.remarks || '',
  ])

  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data])
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, '已刪除病人')

  const today = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(workbook, `已刪除病人清單_${today}.xlsx`)
}

async function handleSavePatient(patientData) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  try {
    const patientId = patientData.id
    const dataToUpdate = { ...patientData }
    delete dataToUpdate.id
    dataToUpdate.freq = patientData.freq
    if ('frequency' in dataToUpdate) {
      dataToUpdate.frequency = deleteField()
    }
    if (patientId) {
      await patientApi.update(patientId, dataToUpdate)
    } else {
      dataToUpdate.createdAt = new Date().toISOString()
      dataToUpdate.isDeleted = false
      dataToUpdate.status = modalType.value
      await patientApi.save(dataToUpdate)
    }
    closeModal()
    await fetchAllPatients()
  } catch (err) {
    console.error('儲存病人資料失敗:', err)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '儲存病人資料失敗！'
    isAlertDialogVisible.value = true
  }
}

// 3. 【核心修改】: 重寫 transferPatient 函式，用 ConfirmDialog 取代 confirm()
async function transferPatient(patientId, newStatus) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  const patientName = allPatients.value.find((p) => p.id === patientId)?.name || '此病人'
  const targetStatusMap = {
    ipd: '住院',
    opd: '門診',
    er: '急診',
  }
  const targetStatusText = targetStatusMap[newStatus] || '未知狀態'

  // a. 設定對話框的內容
  confirmDialogTitle.value = `確認轉為${targetStatusText}`
  confirmDialogMessage.value = `您確定要將「${patientName}」轉為${targetStatusText}嗎？\n\n注意：此操作將會清除該病人在未來排程中的所有手動備註和護理師分配，並更新自動狀態標籤。`

  // b. 定義用戶點擊「確認」後要執行的動作
  confirmAction.value = async () => {
    try {
      await patientApi.update(patientId, { status: newStatus })
      const originalPatientData = allPatients.value.find((p) => p.id === patientId)
      const updatedPatient = { ...originalPatientData, status: newStatus }
      await clearPatientTemporaryScheduleData(patientId, 'clear', updatedPatient)
      await fetchAllPatients()
    } catch (err) {
      console.error('轉床失敗:', err)
      alertDialogTitle.value = '操作失敗'
      alertDialogMessage.value = '轉床失敗！'
      isAlertDialogVisible.value = true
    }
  }

  // c. 顯示我們的自訂對話框
  isConfirmDialogVisible.value = true
}

async function handleDeleteReasonSelected(reason) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  if (!patientToDeleteId.value) return
  try {
    const patient = allPatients.value.find((p) => p.id === patientToDeleteId.value)
    if (patient) {
      await patientApi.update(patientToDeleteId.value, {
        isDeleted: true,
        originalStatus: patient.status,
        deleteReason: reason,
        deletedAt: new Date().toISOString(),
      })
      await clearPatientTemporaryScheduleData(patientToDeleteId.value, 'delete')
      await fetchAllPatients()
    }
  } catch (err) {
    console.error('刪除失敗:', err)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '刪除失敗！'
    isAlertDialogVisible.value = true
  } finally {
    isDeleteDialogVisible.value = false
    patientToDeleteId.value = null
  }
}
async function restorePatient(patientId) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  try {
    const patient = allPatients.value.find((p) => p.id === patientId)
    await patientApi.update(patientId, {
      isDeleted: false,
      status: patient.originalStatus || 'opd',
      deleteReason: null,
      deletedAt: null,
    })
    await fetchAllPatients()
  } catch (err) {
    console.error('復原失敗:', err)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '復原失敗！'
    isAlertDialogVisible.value = true
  }
}
function openAddPatientModal(type) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  editingPatient.value = { diseases: [] }
  modalType.value = type
  isModalVisible.value = true
}
function openEditPatientModal(patient) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  editingPatient.value = patient
  modalType.value = patient.status
  isModalVisible.value = true
}
function deletePatient(patientId) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  patientToDeleteId.value = patientId
  isDeleteDialogVisible.value = true
}
async function fetchAllPatients() {
  try {
    allPatients.value = await patientApi.fetchAll()
  } catch (err) {
    console.error('讀取病人資料失敗:', err)
    alertDialogTitle.value = '讀取病人資料失敗！'
    isAlertDialogVisible.value = true
  }
}

async function clearPatientTemporaryScheduleData(
  patientId,
  mode = 'clear',
  updatedPatientData = null,
) {
  if (!patientId) return
  try {
    const actionText = mode === 'delete' ? '刪除' : '清理'
    console.log(`開始為病人 ${patientId} ${actionText} 未來排班資料...`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    const futureScheduleDocs = await schedulesApi.fetchAll([where('date', '>=', todayStr)])
    const updatePromises = []

    for (const doc of futureScheduleDocs) {
      let isModified = false
      const newSchedule = { ...doc.schedule }

      for (const shiftId in newSchedule) {
        if (newSchedule[shiftId]?.patientId === patientId) {
          isModified = true
          if (mode === 'delete') {
            delete newSchedule[shiftId]
            console.log(`在 ${doc.date} 的排程中，刪除病人 ${patientId} 的班次 ${shiftId}`)
          } else {
            const slot = newSchedule[shiftId]
            slot.manualNote = ''
            slot.nurseTeam = null
            slot.nurseTeamIn = null
            slot.nurseTeamOut = null
            if (updatedPatientData) {
              slot.autoNote = generateAutoNote(updatedPatientData)
            }
            console.log(`在 ${doc.date} 的排程中，清理病人 ${patientId} 的班次 ${shiftId}`)
          }
        }
      }
      if (isModified) {
        updatePromises.push(schedulesApi.update(doc.id, { schedule: newSchedule }))
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises)
      console.log(
        `成功為病人 ${patientId} ${actionText}了 ${updatePromises.length} 天的未來排班資料。`,
      )
    } else {
      console.log(`未在未來排程中找到病人 ${patientId} 的資料可供${actionText}。`)
    }
  } catch (err) {
    const actionText = mode === 'delete' ? '刪除' : '清理'
    console.error(`為病人 ${patientId} ${actionText}排班資料時發生錯誤:`, err)
    alertDialogTitle.value = `操作失敗`
    alertDialogMessage.value = `為病人${actionText}排班資料時發生錯誤，請手動檢查排班表！`
    isAlertDialogVisible.value = true
  }
}
function changeTab(tabName) {
  activeTab.value = tabName
}
function handleSort(key) {
  if (currentSort.value.column === key) {
    currentSort.value.order = currentSort.value.order === 'asc' ? 'desc' : 'asc'
  } else {
    currentSort.value.column = key
    currentSort.value.order = 'asc'
  }
}
function closeModal() {
  isModalVisible.value = false
  editingPatient.value = null
}
function cancelDelete() {
  isDeleteDialogVisible.value = false
  patientToDeleteId.value = null
}
function getSortIndicator(key) {
  if (currentSort.value.column === key) {
    return currentSort.value.order === 'asc' ? '▲' : '▼'
  }
  return ''
}
function formatDate(isoString) {
  if (!isoString) return ''
  const date = typeof isoString.toDate === 'function' ? isoString.toDate() : new Date(isoString)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString()
}
function getRowClass(p) {
  if (p.isDeleted) return 'status-deleted'
  const biweeklyFreq = ['一四', '二五', '三六', '一五', '二六']
  const freqValue = p.freq
  if (biweeklyFreq.includes(freqValue)) return 'status-biweekly'
  if (p.status === 'er') return 'status-er'
  if (p.status === 'ipd') return 'status-ipd'
  if (p.status === 'opd') return 'status-opd'
  return ''
}
function generateDiseaseTags(diseases) {
  if (!diseases || diseases.length === 0) return ''
  return diseases.map((tag) => `<span class="disease-tag">${tag}</span>`).join('')
}

// 4. 新增處理 ConfirmDialog 結果的函式
function handleConfirm() {
  if (typeof confirmAction.value === 'function') {
    confirmAction.value()
  }
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}

onMounted(() => {
  fetchAllPatients()
})
</script>

<template>
  <div>
    <div class="page-container" :class="{ 'is-locked': isPageLocked }">
      <h1 class="page-title">透析病人管理系統</h1>
      <div class="tabs">
        <button class="tab-button" :class="{ active: activeTab === 'er' }" @click="changeTab('er')">
          急診病人
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'ipd' }"
          @click="changeTab('ipd')"
        >
          住院病人
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'opd' }"
          @click="changeTab('opd')"
        >
          門診常規
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'deleted' }"
          @click="changeTab('deleted')"
        >
          已刪除病人
        </button>
      </div>

      <!-- 急診病人表格 -->
      <div v-if="activeTab === 'er'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('er')" :disabled="isPageLocked" class="btn-add">
              新增急診病人
            </button>
            <div class="search-group">
              <input type="text" v-model="erSearchTerm" placeholder="搜尋病人姓名/病歷號..." />
            </div>
          </div>
          <div v-if="patientStats" class="stats-summary">
            <span class="total-count">總人數：{{ patientStats.total }}</span>
            <div class="freq-counts">
              <span
                v-for="(count, freq) in patientStats.byFrequency"
                :key="freq"
                class="freq-tag"
                :class="FREQ_COLOR_MAP[freq]"
              >
                {{ freq }}: {{ count }}人
              </span>
            </div>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-shrink">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-shrink">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th @click="handleSort('physician')" class="col-shrink">
                  開單醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
                </th>
                <th @click="handleSort('freq')" class="col-shrink">
                  頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
                </th>
                <th class="col-shrink">模式</th>
                <th class="col-shrink">首透</th>
                <th class="col-shrink">中止</th>
                <th class="col-expand">備註</th>
                <th @click="handleSort('createdAt')" class="col-shrink">
                  新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
                </th>
                <th class="col-shrink">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-shrink">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </td>
                <td class="col-shrink">{{ p.medicalRecordNumber }}</td>
                <td class="col-shrink">{{ p.physician }}</td>
                <td class="col-shrink">{{ p.freq }}</td>
                <td class="col-shrink">{{ p.mode }}</td>
                <td class="col-shrink">{{ p.isFirstDialysis ? '✓' : '' }}</td>
                <td class="col-shrink">{{ p.isDiscontinued ? '✓' : '' }}</td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.createdAt) }}</td>
                <td class="col-shrink action-buttons">
                  <button
                    class="btn-edit"
                    @click="openEditPatientModal(p)"
                    :disabled="isPageLocked"
                  >
                    編輯
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'ipd')"
                    :disabled="isPageLocked"
                  >
                    轉住院
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'opd')"
                    :disabled="isPageLocked"
                  >
                    轉門診
                  </button>
                  <button class="btn-delete" @click="deletePatient(p.id)" :disabled="isPageLocked">
                    刪除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 住院病人表格 -->
      <div v-if="activeTab === 'ipd'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('ipd')" :disabled="isPageLocked" class="btn-add">
              新增住院病人
            </button>
            <div class="search-group">
              <input type="text" v-model="ipdSearchTerm" placeholder="搜尋病人姓名/病歷號..." />
            </div>
          </div>
          <div v-if="patientStats" class="stats-summary">
            <span class="total-count">總人數：{{ patientStats.total }}</span>
            <div class="freq-counts">
              <span
                v-for="(count, freq) in patientStats.byFrequency"
                :key="freq"
                class="freq-tag"
                :class="FREQ_COLOR_MAP[freq]"
              >
                {{ freq }}: {{ count }}人
              </span>
            </div>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-shrink">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-shrink">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th @click="handleSort('physician')" class="col-shrink">
                  會診醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
                </th>
                <th @click="handleSort('freq')" class="col-shrink">
                  頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
                </th>
                <th class="col-shrink">模式</th>
                <th class="col-shrink">首透</th>
                <th class="col-shrink">中止</th>
                <th class="col-expand">備註</th>
                <th @click="handleSort('createdAt')" class="col-shrink">
                  新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
                </th>
                <th class="col-shrink">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-shrink">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </td>
                <td class="col-shrink">{{ p.medicalRecordNumber }}</td>
                <td class="col-shrink">{{ p.physician }}</td>
                <td class="col-shrink">{{ p.freq }}</td>
                <td class="col-shrink">{{ p.mode }}</td>
                <td class="col-shrink">{{ p.isFirstDialysis ? '✓' : '' }}</td>
                <td class="col-shrink">{{ p.isDiscontinued ? '✓' : '' }}</td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.createdAt) }}</td>
                <td class="col-shrink action-buttons">
                  <button
                    class="btn-edit"
                    @click="openEditPatientModal(p)"
                    :disabled="isPageLocked"
                  >
                    編輯
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'er')"
                    :disabled="isPageLocked"
                  >
                    轉急診
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'opd')"
                    :disabled="isPageLocked"
                  >
                    轉門診
                  </button>
                  <button class="btn-delete" @click="deletePatient(p.id)" :disabled="isPageLocked">
                    刪除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 門診常規表格 -->
      <div v-if="activeTab === 'opd'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('opd')" :disabled="isPageLocked" class="btn-add">
              新增門診病人
            </button>
            <div class="search-group">
              <input type="text" v-model="opdSearchTerm" placeholder="搜尋病人姓名/病歷號..." />
            </div>
          </div>
          <div v-if="patientStats" class="stats-summary">
            <span class="total-count">總人數：{{ patientStats.total }}</span>
            <div class="freq-counts">
              <span
                v-for="(count, freq) in patientStats.byFrequency"
                :key="freq"
                class="freq-tag"
                :class="FREQ_COLOR_MAP[freq]"
              >
                {{ freq }}: {{ count }}人
              </span>
            </div>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-shrink">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-shrink">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th @click="handleSort('physician')" class="col-shrink">
                  收案醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
                </th>
                <th @click="handleSort('freq')" class="col-shrink">
                  頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
                </th>
                <th class="col-shrink">模式</th>
                <th class="col-shrink">血管通路</th>
                <th class="col-expand">備註</th>
                <th @click="handleSort('createdAt')" class="col-shrink">
                  新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
                </th>
                <th class="col-shrink">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-shrink">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </td>
                <td class="col-shrink">{{ p.medicalRecordNumber }}</td>
                <td class="col-shrink">{{ p.physician }}</td>
                <td class="col-shrink">{{ p.freq }}</td>
                <td class="col-shrink">{{ p.mode }}</td>
                <td class="col-shrink">{{ p.vascAccess }}</td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.createdAt) }}</td>
                <td class="col-shrink action-buttons">
                  <button
                    class="btn-edit"
                    @click="openEditPatientModal(p)"
                    :disabled="isPageLocked"
                  >
                    編輯
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'er')"
                    :disabled="isPageLocked"
                  >
                    轉急診
                  </button>
                  <button
                    class="btn-transfer"
                    @click="transferPatient(p.id, 'ipd')"
                    :disabled="isPageLocked"
                  >
                    轉住院
                  </button>
                  <button class="btn-delete" @click="deletePatient(p.id)" :disabled="isPageLocked">
                    刪除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 已刪除病人表格 -->
      <div v-if="activeTab === 'deleted'" class="tab-content active">
        <div class="toolbar">
          <div class="search-group">
            <input type="text" v-model="deletedSearchTerm" placeholder="搜尋已刪除病人..." />
          </div>
          <button @click="exportDeletedPatients" class="btn-export">轉出已刪除清單</button>
        </div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th class="col-shrink">姓名</th>
                <th class="col-shrink">病歷號</th>
                <th class="col-shrink">原狀態</th>
                <th class="col-shrink">刪除原因</th>
                <th class="col-expand">備註</th>
                <th class="col-shrink">刪除日期</th>
                <th class="col-shrink">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-shrink">{{ p.name }}</td>
                <td class="col-shrink">{{ p.medicalRecordNumber }}</td>
                <td class="col-shrink">
                  {{
                    p.originalStatus === 'ipd'
                      ? '住院'
                      : p.originalStatus === 'er'
                        ? '急診'
                        : '門診'
                  }}
                </td>
                <td class="col-shrink">{{ p.deleteReason }}</td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.deletedAt) }}</td>
                <td class="col-shrink action-buttons">
                  <button
                    class="btn-restore"
                    @click="restorePatient(p.id)"
                    :disabled="isPageLocked"
                  >
                    復原
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <PatientFormModal
      :is-modal-visible="isModalVisible"
      :patient-data="editingPatient"
      :patient-type="modalType"
      @close="closeModal"
      @save="handleSavePatient"
    />
    <SelectionDialog
      :is-visible="isDeleteDialogVisible"
      title="請選擇刪除原因"
      :options="DELETE_REASONS"
      @select="handleDeleteReasonSelected"
      @cancel="cancelDelete"
    />
    <AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    />
    <!-- 5. 在模板中放置 ConfirmDialog 元件，並綁定事件 -->
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
  </div>
</template>

<style scoped>
.tabs {
  display: flex;
  border-bottom: 2px solid #ddd;
  margin-bottom: 20px;
}
.tab-button {
  padding: 10px 20px;
  border: none;
  background: none;
  font-size: 1.2em;
  cursor: pointer;
  position: relative;
  color: #666;
}
.tab-button.active {
  color: #005a9c;
  font-weight: bold;
}
.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: #005a9c;
}
.tab-content {
  display: block;
}
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 15px;
}
.controls-left {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}
.controls-left .btn-add {
  padding: 8px 15px;
  font-size: 1em;
  background-color: #16a34a;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  flex-shrink: 0;
}
.controls-left .btn-add:hover {
  background-color: #15803d;
}
.controls-left .search-group {
  display: flex;
  align-items: center;
}
.controls-left input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  min-width: 250px;
}

.stats-summary {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.total-count {
  font-size: 1.1em;
  font-weight: bold;
  color: var(--primary-color, #005a9c);
  white-space: nowrap;
}
.freq-counts {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.freq-tag {
  color: #fff;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.9em;
  font-weight: 500;
  white-space: nowrap;
}
.freq-tag.freq-blue {
  background-color: #2563eb;
}
.freq-tag.freq-green {
  background-color: #16a34a;
}
.freq-tag.freq-orange {
  background-color: #f97316;
}
.freq-tag.freq-teal {
  background-color: #0d9488;
}
.freq-tag.freq-red {
  background-color: #dc2626;
}
.freq-tag.freq-grey {
  background-color: #64748b;
}

.toolbar {
  display: flex;
  justify-content: flex-start; /* 修改: 靠左對齊 */
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 15px;
}
.toolbar button {
  padding: 8px 15px;
  font-size: 1em;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
.toolbar .search-group {
  display: flex;
  gap: 5px;
}
.toolbar input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  min-width: 250px; /* 新增: 給搜尋框一個最小寬度 */
}
.toolbar .btn-export {
  background-color: #0ea5e9;
}
.toolbar .btn-export:hover {
  background-color: #0284c7;
}

.patient-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: auto;
}

.patient-table th,
.patient-table td {
  border: 1px solid #ddd;
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}
.name-cell-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}
.patient-name-text {
  font-weight: bold;
  white-space: nowrap;
  flex-shrink: 0;
}
.disease-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
:deep(.disease-tag) {
  display: inline-block;
  padding: 2px 6px;
  font-size: 0.8em;
  font-weight: bold;
  color: var(--danger-color, #dc3545);
  border: 1px solid var(--danger-color, #dc3545);
  border-radius: 4px;
}
.patient-table th {
  background-color: #f2f2f2;
  cursor: pointer;
  user-select: none;
  position: sticky;
  top: 0;
  z-index: 5;
  white-space: nowrap;
}
.patient-table th:hover {
  background-color: #e8e8e8;
}
.patient-table th .sort-indicator {
  display: inline-block;
  margin-left: 5px;
  color: #999;
}
.patient-table tr.status-opd {
  background-color: var(--green-bg);
}
.patient-table tr.status-ipd {
  background-color: var(--blue-bg);
}
.patient-table tr.status-er {
  background-color: var(--purple-bg, #e9d5ff);
}
.patient-table tr.status-biweekly {
  background-color: var(--orange-bg);
}
.patient-table tr.status-deleted {
  background-color: var(--grey-bg);
  color: var(--grey-text);
}
.action-buttons button {
  margin-right: 5px;
  padding: 5px 10px;
  font-size: 0.9em;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  color: white;
}
.btn-edit {
  background-color: var(--primary-color);
}
.btn-transfer {
  background-color: var(--info-color);
}
.btn-delete {
  background-color: var(--danger-color);
}
.btn-restore {
  background-color: var(--success-color);
}
.table-wrapper {
  max-height: calc(70vh - 50px);
  overflow-y: auto;
}
.is-locked .view-header button,
.is-locked .toolbar button,
.is-locked .action-buttons button {
  opacity: 0.65;
  pointer-events: none;
}

.col-shrink {
  white-space: nowrap;
}
.col-expand {
  width: 100%;
}

.patient-table td.col-shrink {
  text-align: center;
}
.patient-table td.col-shrink:has(.name-cell-content) {
  text-align: left;
}
.patient-table td.action-buttons {
  text-align: center;
}
</style>
