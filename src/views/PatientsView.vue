<!-- 檔案路徑: src/views/PatientsView.vue (已修正) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import {
  clearFutureSchedulesForPatient,
  cleanTemporaryDataInFutureSchedules,
} from '@/services/scheduleService.js'
import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue'
import { useAuth } from '@/composables/useAuth.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import * as XLSX from 'xlsx'
import { useNotification } from '@/composables/useNotification.js'

const patientApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')
const ordersHistoryApi = ApiManager('dialysis_orders_history')

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

const isConfirmDialogVisible = ref(false)
const confirmDialogTitle = ref('')
const confirmDialogMessage = ref('')
const confirmAction = ref(null)
const isOrderModalVisible = ref(false)
const editingPatientForOrder = ref(null)

const isConflictDialogVisible = ref(false)
const conflictDialogOptions = ref([])
const newPatientDataForConflict = ref(null)
const existingPatientForConflict = ref(null)

const { addNotification } = useNotification()

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
  let patientsToDisplay
  let searchTerm = ''
  if (!allPatients.value) return []
  if (activeTab.value === 'er') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'er' && !p.isDeleted)
    searchTerm = erSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'ipd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted)
    searchTerm = ipdSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'opd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted)
    searchTerm = opdSearchTerm.value.toLowerCase()
  } else if (activeTab.value === 'deleted') {
    patientsToDisplay = allPatients.value.filter((p) => p.isDeleted)
    searchTerm = deletedSearchTerm.value.toLowerCase()
  } else {
    patientsToDisplay = []
  }
  if (searchTerm) {
    patientsToDisplay = patientsToDisplay.filter(
      (p) =>
        (p.name && p.name.toLowerCase().includes(searchTerm)) ||
        (p.medicalRecordNumber && p.medicalRecordNumber.includes(searchTerm)),
    )
  }
  return [...patientsToDisplay].sort((a, b) => {
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
  if (activeTab.value === 'deleted' || !allPatients.value) {
    return null
  }
  const patientsForStats = allPatients.value.filter(
    (p) => p.status === activeTab.value && !p.isDeleted,
  )
  const stats = {
    total: patientsForStats.length,
    byFrequency: {},
  }
  patientsForStats.forEach((patient) => {
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

  // --- 編輯現有病人 ---
  if (patientData.id) {
    const originalPatient = editingPatient.value
    const wasDiscontinuedBefore = originalPatient ? originalPatient.isDiscontinued : false
    const isNowDiscontinued = patientData.isDiscontinued

    if (!wasDiscontinuedBefore && isNowDiscontinued) {
      confirmDialogTitle.value = '確認中止透析'
      confirmDialogMessage.value = `您確定要將「${patientData.name}」標記為中止透析，並清除其所有未來的排班嗎？此操作無法復原排程。`
      confirmAction.value = async () => {
        try {
          closeModal()
          const updateData = {
            isDiscontinued: true,
            discontinuedDate:
              patientData.discontinuedDate || new Date().toISOString().split('T')[0],
          }
          await patientApi.update(patientData.id, updateData)
          await clearFutureSchedulesForPatient(patientData.id)
          await fetchAllPatients()
          addNotification(`中止透析: ${patientData.name}`, 'patient')
        } catch (err) {
          console.error('中止透析操作失敗:', err)
          alertDialogTitle.value = '操作失敗'
          alertDialogMessage.value = err.message || '中止透析操作失敗！'
          isAlertDialogVisible.value = true
        }
      }
      isConfirmDialogVisible.value = true
    } else {
      // 一般編輯儲存
      try {
        const dataToUpdate = { ...patientData }
        delete dataToUpdate.id
        await patientApi.update(patientData.id, dataToUpdate)
        closeModal()
        await fetchAllPatients()
        addNotification(`修改病人資料: ${patientData.name}`, 'patient')
      } catch (err) {
        console.error('更新病人資料失敗:', err)
        alertDialogTitle.value = '操作失敗'
        alertDialogMessage.value = '更新病人資料失敗！'
        isAlertDialogVisible.value = true
      }
    }
    return
  }

  // --- 新增病人（核心檢查邏輯） ---
  if (!patientData.medicalRecordNumber) {
    alertDialogTitle.value = '資料不完整'
    alertDialogMessage.value = '請務必填寫病歷號。'
    isAlertDialogVisible.value = true
    return
  }

  const existingPatient = allPatients.value.find(
    (p) => p.medicalRecordNumber === patientData.medicalRecordNumber,
  )

  if (existingPatient) {
    const statusMap = { ipd: '住院', opd: '門診', er: '急診' }
    const currentStatusText = existingPatient.isDeleted
      ? `已刪除 (原為${statusMap[existingPatient.originalStatus] || '未知'})`
      : statusMap[existingPatient.status] || '未知'
    const targetStatusText = statusMap[modalType.value]

    confirmDialogTitle.value = '病歷號重複'
    confirmDialogMessage.value = `病歷號 ${patientData.medicalRecordNumber} (${existingPatient.name}) 已存在於「${currentStatusText}」清單中。您是否要直接將其轉移並更新資料？`

    newPatientDataForConflict.value = patientData
    existingPatientForConflict.value = existingPatient

    isConfirmDialogVisible.value = true
    confirmAction.value = () => handleConflictSelected()
  } else {
    // 病人不存在，正常新增
    try {
      const dataToCreate = { ...patientData }
      dataToCreate.createdAt = new Date().toISOString()
      dataToCreate.isDeleted = false
      dataToCreate.status = modalType.value
      await patientApi.save(dataToCreate)
      closeModal()
      await fetchAllPatients()
      addNotification(`新增病人: ${dataToCreate.name}`, 'patient')
    } catch (err) {
      console.error('新增病人失敗:', err)
      alertDialogTitle.value = '操作失敗'
      alertDialogMessage.value = '新增病人失敗！'
      isAlertDialogVisible.value = true
    }
  }
}

async function handleConflictSelected() {
  const existingPatient = existingPatientForConflict.value
  const newPatientData = newPatientDataForConflict.value

  if (!existingPatient || !newPatientData) return

  try {
    const dataToUpdate = {
      ...newPatientData,
      status: modalType.value,
      isDeleted: false,
      deletedAt: null,
      deleteReason: null,
      originalStatus: null,
    }
    delete dataToUpdate.id

    await patientApi.update(existingPatient.id, dataToUpdate)

    if (!existingPatient.isDeleted) {
      await cleanTemporaryDataInFutureSchedules(existingPatient.id, dataToUpdate)
    }

    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = `病人 ${newPatientData.name} 已成功更新並轉移至 ${modalType.value === 'ipd' ? '住院' : modalType.value === 'er' ? '急診' : '門診'} 清單。`
    isAlertDialogVisible.value = true

    closeModal()
    await fetchAllPatients()
    addNotification(`轉移病人: ${newPatientData.name}`, 'patient')
  } catch (err) {
    console.error('轉移更新病人失敗:', err)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '轉移更新病人失敗！'
    isAlertDialogVisible.value = true
  } finally {
    existingPatientForConflict.value = null
    newPatientDataForConflict.value = null
  }
}

async function transferPatient(patientId, newStatus) {
  if (isPageLocked.value) {
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = '操作被鎖定：權限不足。'
    isAlertDialogVisible.value = true
    return
  }
  const patientName = allPatients.value.find((p) => p.id === patientId)?.name || '此病人'
  const targetStatusMap = { ipd: '住院', opd: '門診', er: '急診' }
  const targetStatusText = targetStatusMap[newStatus] || '未知狀態'
  confirmDialogTitle.value = `確認轉為${targetStatusText}`
  confirmDialogMessage.value = `您確定要將「${patientName}」轉為${targetStatusText}嗎？\n\n注意：此操作將會清除該病人在未來排程中的所有手動備註和護理師分配，並更新自動狀態標籤。`
  confirmAction.value = async () => {
    try {
      await patientApi.update(patientId, { status: newStatus })
      const originalPatientData = allPatients.value.find((p) => p.id === patientId)
      const updatedPatient = { ...originalPatientData, status: newStatus }
      await cleanTemporaryDataInFutureSchedules(patientId, updatedPatient)
      await fetchAllPatients()
      addNotification(`轉移病人: ${patientName} 至 ${targetStatusText}`, 'patient')
    } catch (err) {
      console.error('轉床失敗:', err)
      alertDialogTitle.value = '操作失敗'
      alertDialogMessage.value = err.message || '轉床失敗！'
      isAlertDialogVisible.value = true
    }
  }
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
      await clearFutureSchedulesForPatient(patientToDeleteId.value)
      await fetchAllPatients()
      addNotification(`刪除病人: ${patient.name}`, 'patient')
    }
  } catch (err) {
    console.error('刪除失敗:', err)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = err.message || '刪除失敗！'
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
    addNotification(`復原病人: ${patient.name}`, 'patient')
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
  editingPatient.value = JSON.parse(JSON.stringify(patient))
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
    alertDialogTitle.value = '讀取失敗'
    alertDialogMessage.value = '讀取病人資料失敗！'
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
  return date.toISOString().split('T')[0]
}

function getRowClass(p) {
  if (p.isDiscontinued) return 'status-discontinued'
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
  if (existingPatientForConflict.value) {
    //
  } else {
    console.log('使用者取消了操作。')
  }
}

function openOrderModal(patient) {
  editingPatientForOrder.value = JSON.parse(JSON.stringify(patient))
  isOrderModalVisible.value = true
}

async function handleSaveOrder(orderDataFromModal) {
  if (!editingPatientForOrder.value || !editingPatientForOrder.value.id) {
    alertDialogTitle.value = '儲存失敗'
    alertDialogMessage.value = '找不到有效的病人資訊，請重新操作。'
    isAlertDialogVisible.value = true
    return
  }

  const patientId = editingPatientForOrder.value.id
  const patientName = editingPatientForOrder.value.name
  const updatedAt = new Date().toISOString()

  const cleanOrders = {
    ak: orderDataFromModal.ak || '',
    dialysateCa: orderDataFromModal.dialysateCa || '',
    heparinInitial: orderDataFromModal.heparinInitial || '',
    heparinMaintenance: orderDataFromModal.heparinMaintenance || '',
    bloodFlow: orderDataFromModal.bloodFlow || '',
    dryWeight: orderDataFromModal.dryWeight || '',
    effectiveDate: orderDataFromModal.effectiveDate || updatedAt.slice(0, 10),
  }

  const historyRecord = {
    patientId: patientId,
    patientName: patientName,
    orders: cleanOrders,
    updatedAt: updatedAt,
  }

  try {
    await Promise.all([
      patientApi.update(patientId, { dialysisOrders: cleanOrders }),
      ordersHistoryApi.save(historyRecord),
    ])

    addNotification(`${patientName} 的透析醫囑已更新`, 'patient')
    isOrderModalVisible.value = false
    await fetchAllPatients()
  } catch (error) {
    console.error('儲存醫囑失敗:', error)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存醫囑時發生錯誤: ${error.message}`
    isAlertDialogVisible.value = true
  }
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
                <th class="col-actions">操作</th>
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
                <td class="col-shrink">
                  <div v-if="p.isFirstDialysis">✓</div>
                  <div v-if="p.firstDialysisDate" class="date-subtext">
                    {{ formatDate(p.firstDialysisDate) }}
                  </div>
                </td>
                <td class="col-shrink">
                  <div v-if="p.isDiscontinued">✓</div>
                  <div v-if="p.discontinuedDate" class="date-subtext">
                    {{ formatDate(p.discontinuedDate) }}
                  </div>
                </td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.createdAt) }}</td>
                <td class="col-actions action-buttons">
                  <button class="btn btn-order" @click="openOrderModal(p)" :disabled="isPageLocked">
                    透析醫囑
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'ipd')"
                    :disabled="isPageLocked"
                  >
                    轉住院
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'opd')"
                    :disabled="isPageLocked"
                  >
                    轉門診
                  </button>
                  <div class="icon-buttons">
                    <button
                      class="btn-icon btn-edit"
                      @click="openEditPatientModal(p)"
                      :disabled="isPageLocked"
                      title="編輯"
                    >
                      ✏️
                    </button>
                    <button
                      class="btn-icon btn-delete"
                      @click="deletePatient(p.id)"
                      :disabled="isPageLocked"
                      title="刪除"
                    >
                      🗑️
                    </button>
                  </div>
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
                <th class="col-actions">操作</th>
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
                <td class="col-shrink">
                  <div v-if="p.isFirstDialysis">✓</div>
                  <div v-if="p.firstDialysisDate" class="date-subtext">
                    {{ formatDate(p.firstDialysisDate) }}
                  </div>
                </td>
                <td class="col-shrink">
                  <div v-if="p.isDiscontinued">✓</div>
                  <div v-if="p.discontinuedDate" class="date-subtext">
                    {{ formatDate(p.discontinuedDate) }}
                  </div>
                </td>
                <td class="col-expand">{{ p.remarks }}</td>
                <td class="col-shrink">{{ formatDate(p.createdAt) }}</td>
                <td class="col-actions action-buttons">
                  <button class="btn btn-order" @click="openOrderModal(p)" :disabled="isPageLocked">
                    透析醫囑
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'er')"
                    :disabled="isPageLocked"
                  >
                    轉急診
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'opd')"
                    :disabled="isPageLocked"
                  >
                    轉門診
                  </button>
                  <div class="icon-buttons">
                    <button
                      class="btn-icon btn-edit"
                      @click="openEditPatientModal(p)"
                      :disabled="isPageLocked"
                      title="編輯"
                    >
                      ✏️
                    </button>
                    <button
                      class="btn-icon btn-delete"
                      @click="deletePatient(p.id)"
                      :disabled="isPageLocked"
                      title="刪除"
                    >
                      🗑️
                    </button>
                  </div>
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
                <th class="col-actions">操作</th>
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
                <td class="col-actions action-buttons">
                  <button class="btn btn-order" @click="openOrderModal(p)" :disabled="isPageLocked">
                    透析醫囑
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'er')"
                    :disabled="isPageLocked"
                  >
                    轉急診
                  </button>
                  <button
                    class="btn btn-transfer"
                    @click="transferPatient(p.id, 'ipd')"
                    :disabled="isPageLocked"
                  >
                    轉住院
                  </button>
                  <div class="icon-buttons">
                    <button
                      class="btn-icon btn-edit"
                      @click="openEditPatientModal(p)"
                      :disabled="isPageLocked"
                      title="編輯"
                    >
                      ✏️
                    </button>
                    <button
                      class="btn-icon btn-delete"
                      @click="deletePatient(p.id)"
                      :disabled="isPageLocked"
                      title="刪除"
                    >
                      🗑️
                    </button>
                  </div>
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
                <td class="col-actions action-buttons">
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
    <ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    />
    <DialysisOrderModal
      :is-visible="isOrderModalVisible"
      :patient-data="editingPatientForOrder"
      @close="isOrderModalVisible = false"
      @save="handleSaveOrder"
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
  justify-content: flex-start;
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
  min-width: 250px;
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
.patient-table tr.status-discontinued {
  background-color: #fee2e2;
  color: #7f1d1d;
  text-decoration: line-through;
  opacity: 0.7;
}

.patient-table tr.status-discontinued button {
  text-decoration: none;
}

/* ✨ 核心修正點：調整操作按鈕的樣式和佈局 ✨ */
.col-actions {
  width: 320px; /* 給予一個固定的寬度以容納所有按鈕 */
}
.action-buttons {
  display: flex;
  flex-wrap: nowrap; /* 強制不換行 */
  gap: 0.5rem;
  align-items: center;
}
.action-buttons .btn {
  padding: 5px 10px;
  font-size: 0.9em;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  color: white;
  white-space: nowrap; /* 確保按鈕文字不換行 */
}
.btn.btn-order {
  background-color: #ff9c07;
  color: #212529;
  border-color: #ffc107;
}
.btn.btn-order:hover:not(:disabled) {
  background-color: #e0a800;
  border-color: #d39e00;
}
.btn.btn-transfer {
  background-color: #17a2b8;
}
.btn.btn-restore {
  background-color: var(--success-color);
}
.icon-buttons {
  display: flex;
  gap: 0.25rem;
  margin-left: auto; /* 將圖示按鈕推到最右邊 */
}
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  font-size: 1.2rem;
  line-height: 1;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;
}
.btn-icon.btn-edit {
  color: #007bff;
}
.btn-icon.btn-delete {
  color: #dc3545;
}
.btn-icon.btn-edit:hover {
  background-color: #e0e7ff;
}
.btn-icon.btn-delete:hover {
  background-color: #fee2e2;
}

.table-wrapper {
  max-height: calc(70vh - 50px);
  overflow-y: auto;
}
.is-locked .view-header button,
.is-locked .toolbar button,
.is-locked .action-buttons .btn,
.is-locked .action-buttons .btn-icon {
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
.patient-table td.col-actions {
  text-align: left;
}
.date-subtext {
  font-size: 0.8em;
  color: #666;
  margin-top: 2px;
}
.patient-table tr.status-discontinued .date-subtext {
  color: #991b1b;
}
</style>
