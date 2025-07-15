<!-- 檔案路徑: src/views/PatientsView.vue (移除ID驗證版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { where } from 'firebase/firestore'

// ✅ 導入優化後的函式
import {
  fetchAllPatients as optimizedFetchAllPatients,
  updatePatient as optimizedUpdatePatient,
  savePatient as optimizedSavePatient,
  savePatientHistory as optimizedSavePatientHistory,
  saveDialysisOrderHistory as optimizedSaveDialysisOrderHistory,
} from '@/services/optimizedApiService.js'

import {
  clearFutureSchedulesForPatient,
  cleanTemporaryDataInFutureSchedules,
} from '@/services/scheduleService.js'
import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue'
import PatientHistoryModal from '@/components/PatientHistoryModal.vue'
import { useAuth } from '@/composables/useAuth.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import * as XLSX from 'xlsx'
import { useNotification } from '@/composables/useNotification.js'

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

const isHistoryModalVisible = ref(false)
const selectedPatientForHistory = ref(null)

const { addNotification } = useNotification()

// ✨ 安全的權限狀態獲取
const auth = useAuth()
const { isLoggedIn } = auth
const isPageLocked = computed(() => auth.isReadOnly.value)

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
          // ✅ 使用優化函式
          await optimizedUpdatePatient(patientData.id, updateData)
          await clearFutureSchedulesForPatient(patientData.id)
          await fetchAllPatients()
          addNotification('變更病人資料', 'patient')
        } catch (err) {
          console.error('中止透析操作失敗:', err)
          alertDialogTitle.value = '操作失敗'
          alertDialogMessage.value = err.message || '中止透析操作失敗！'
          isAlertDialogVisible.value = true
        }
      }
      isConfirmDialogVisible.value = true
    } else {
      try {
        const dataToUpdate = { ...patientData }
        delete dataToUpdate.id
        // ✅ 使用優化函式
        await optimizedUpdatePatient(patientData.id, dataToUpdate)
        closeModal()
        await fetchAllPatients()
        addNotification('變更病人資料', 'patient')
      } catch (err) {
        console.error('更新病人資料失敗:', err)
        alertDialogTitle.value = '操作失敗'
        alertDialogMessage.value = '更新病人資料失敗！'
        isAlertDialogVisible.value = true
      }
    }
    return
  }

  // 🔧 只保留基本的必填驗證，移除格式驗證
  if (!patientData.medicalRecordNumber || !patientData.medicalRecordNumber.trim()) {
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

    confirmDialogTitle.value = '病歷號重複'
    confirmDialogMessage.value = `病歷號 ${patientData.medicalRecordNumber} (${existingPatient.name}) 已存在於「${currentStatusText}」清單中。您是否要直接將其轉移並更新資料？`
    newPatientDataForConflict.value = patientData
    existingPatientForConflict.value = existingPatient
    isConfirmDialogVisible.value = true
    confirmAction.value = () => handleConflictSelected()
  } else {
    try {
      const dataToCreate = { ...patientData }
      dataToCreate.createdAt = new Date().toISOString()
      dataToCreate.isDeleted = false
      dataToCreate.status = modalType.value

      // ✅ 使用優化函式
      const savedPatient = await optimizedSavePatient(dataToCreate)

      const historyEntry = {
        patientId: savedPatient.id,
        patientName: dataToCreate.name,
        timestamp: new Date().toISOString(),
        eventType: 'CREATE',
        eventDetails: {
          status: modalType.value,
        },
      }

      // ✅ 使用優化函式
      await optimizedSavePatientHistory(historyEntry)
      closeModal()
      await fetchAllPatients()
      addNotification('新增病人資料', 'patient')
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

    // ✅ 使用優化函式
    await optimizedUpdatePatient(existingPatient.id, dataToUpdate)

    const historyEntry = {
      patientId: existingPatient.id,
      patientName: newPatientData.name,
      timestamp: new Date().toISOString(),
      eventType: 'TRANSFER',
      eventDetails: {
        from: existingPatient.status,
        to: modalType.value,
        note: `從衝突中解決，原狀態為 ${existingPatient.isDeleted ? '已刪除' : existingPatient.status}`,
      },
    }

    // ✅ 使用優化函式
    await optimizedSavePatientHistory(historyEntry)

    if (!existingPatient.isDeleted) {
      await cleanTemporaryDataInFutureSchedules(existingPatient.id, dataToUpdate)
    }

    alertDialogTitle.value = '操作成功'
    alertDialogMessage.value = `病人 ${newPatientData.name} 已成功更新並轉移至 ${modalType.value === 'ipd' ? '住院' : modalType.value === 'er' ? '急診' : '門診'} 清單。`
    isAlertDialogVisible.value = true
    closeModal()
    await fetchAllPatients()
    addNotification('變更病人資料', 'patient')
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
      const originalPatientData = allPatients.value.find((p) => p.id === patientId)

      // ✅ 使用優化函式
      await optimizedUpdatePatient(patientId, { status: newStatus })

      const historyEntry = {
        patientId: patientId,
        patientName: originalPatientData.name,
        timestamp: new Date().toISOString(),
        eventType: 'TRANSFER',
        eventDetails: {
          from: originalPatientData.status,
          to: newStatus,
        },
      }

      // ✅ 使用優化函式
      await optimizedSavePatientHistory(historyEntry)

      const updatedPatient = { ...originalPatientData, status: newStatus }
      await cleanTemporaryDataInFutureSchedules(patientId, updatedPatient)
      await fetchAllPatients()
      addNotification('變更病人資料', 'patient')
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
      const deletedAt = new Date().toISOString()

      // ✅ 使用優化函式
      await optimizedUpdatePatient(patientToDeleteId.value, {
        isDeleted: true,
        originalStatus: patient.status,
        deleteReason: reason,
        deletedAt: deletedAt,
      })

      const historyEntry = {
        patientId: patientToDeleteId.value,
        patientName: patient.name,
        timestamp: deletedAt,
        eventType: 'DELETE',
        eventDetails: {
          reason: reason,
          fromStatus: patient.status,
        },
      }

      // ✅ 使用優化函式
      await optimizedSavePatientHistory(historyEntry)
      await clearFutureSchedulesForPatient(patientToDeleteId.value)
      await fetchAllPatients()
      addNotification('刪除病人資料', 'patient')
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
    const newStatus = patient.originalStatus || 'opd'

    // ✅ 使用優化函式
    await optimizedUpdatePatient(patientId, {
      isDeleted: false,
      status: newStatus,
      deleteReason: null,
      deletedAt: null,
    })

    const historyEntry = {
      patientId: patientId,
      patientName: patient.name,
      timestamp: new Date().toISOString(),
      eventType: 'RESTORE',
      eventDetails: {
        restoredTo: newStatus,
        fromReason: patient.deleteReason,
      },
    }

    // ✅ 使用優化函式
    await optimizedSavePatientHistory(historyEntry)
    await fetchAllPatients()
    addNotification('復原病人資料', 'patient')
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

function openHistoryModal(patient) {
  selectedPatientForHistory.value = patient
  isHistoryModalVisible.value = true
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

// ✅ 使用優化函式載入患者資料
async function fetchAllPatients() {
  try {
    console.log('🔄 [PatientsView] 開始載入患者資料...')
    allPatients.value = await optimizedFetchAllPatients()
    console.log(`✅ [PatientsView] 患者資料載入完成，共 ${allPatients.value.length} 位患者`)
  } catch (err) {
    console.error('❌ [PatientsView] 讀取病人資料失敗:', err)
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

// ✅ 修正透析醫囑儲存功能
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

  const parseNumeric = (value) => {
    if (value === '' || value === null || value === undefined) {
      return null
    }
    const num = Number(value)
    return isNaN(num) ? null : num
  }

  const cleanOrders = {
    ak: orderDataFromModal.ak || '',
    dialysateCa: orderDataFromModal.dialysateCa || '',
    heparinInitial: parseNumeric(orderDataFromModal.heparinInitial),
    heparinMaintenance: parseNumeric(orderDataFromModal.heparinMaintenance),
    bloodFlow: parseNumeric(orderDataFromModal.bloodFlow),
    dryWeight: parseNumeric(orderDataFromModal.dryWeight),
    effectiveDate: orderDataFromModal.effectiveDate || updatedAt.slice(0, 10),
  }

  // ✅ 修正醫囑歷史記錄，加入更完整的資料結構
  const historyRecord = {
    patientId: patientId,
    patientName: patientName,
    orders: cleanOrders,
    updatedAt: updatedAt,
    createdAt: updatedAt, // 新增 createdAt 欄位
    operationType: 'UPDATE', // 新增操作類型
  }

  try {
    console.log('💾 [PatientsView] 儲存透析醫囑...')
    await Promise.all([
      // ✅ 使用優化函式更新患者資料
      optimizedUpdatePatient(patientId, { dialysisOrders: cleanOrders }),
      // ✅ 使用優化函式儲存醫囑歷史
      optimizedSaveDialysisOrderHistory(historyRecord),
    ])
    console.log('✅ [PatientsView] 透析醫囑儲存成功')
    addNotification('變更病人資料', 'patient')
    isOrderModalVisible.value = false
    await fetchAllPatients()
  } catch (error) {
    console.error('❌ [PatientsView] 儲存醫囑失敗:', error)
    alertDialogTitle.value = '操作失敗'
    alertDialogMessage.value = `儲存醫囑時發生錯誤: ${error.message}`
    isAlertDialogVisible.value = true
  }
}

onMounted(() => {
  console.log('🚀 [PatientsView] 組件已掛載，開始初始化...')
  fetchAllPatients()
})
</script>

<template>
  <!-- ✨ 安全門：只有登入後才渲染內容 -->
  <div v-if="isLoggedIn">
    <div class="page-container" :class="{ 'is-locked': isPageLocked }">
      <h1 class="page-title">透析病人管理</h1>

      <div class="tabs">
        <button class="tab-button" :class="{ active: activeTab === 'er' }" @click="changeTab('er')">
          急診
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'ipd' }"
          @click="changeTab('ipd')"
        >
          住院
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'opd' }"
          @click="changeTab('opd')"
        >
          門診
        </button>
        <button
          class="tab-button"
          :class="{ active: activeTab === 'deleted' }"
          @click="changeTab('deleted')"
        >
          已刪除
        </button>
      </div>

      <!-- 急診病人表格 -->
      <div v-if="activeTab === 'er'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('er')" :disabled="isPageLocked" class="btn-add">
              新增病人
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
          <div class="flex-table-wrapper">
            <div class="flex-table-header">
              <div class="flex-cell col-name" @click="handleSort('name')">
                姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
              </div>
              <div class="flex-cell col-mrn" @click="handleSort('medicalRecordNumber')">
                病歷號
                <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
              </div>
              <div class="flex-cell col-physician" @click="handleSort('physician')">
                開單醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
              </div>
              <div class="flex-cell col-freq" @click="handleSort('freq')">
                頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
              </div>
              <div class="flex-cell col-mode">模式</div>
              <div class="flex-cell col-first-dialysis">首透</div>
              <div class="flex-cell col-discontinued">中止</div>
              <div class="flex-cell col-remarks">備註</div>
              <div class="flex-cell col-created" @click="handleSort('createdAt')">
                新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
              </div>
              <div class="flex-cell col-actions">操作</div>
            </div>

            <div class="flex-table-body">
              <div
                v-for="p in displayedPatients"
                :key="p.id"
                class="flex-table-row"
                :class="getRowClass(p)"
              >
                <div class="flex-cell col-name">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </div>
                <div class="flex-cell col-mrn">{{ p.medicalRecordNumber }}</div>
                <div class="flex-cell col-physician">{{ p.physician }}</div>
                <div class="flex-cell col-freq">{{ p.freq }}</div>
                <div class="flex-cell col-mode">{{ p.mode }}</div>
                <div class="flex-cell col-first-dialysis">
                  <div v-if="p.isFirstDialysis">✓</div>
                  <div v-if="p.firstDialysisDate" class="date-subtext">
                    {{ formatDate(p.firstDialysisDate) }}
                  </div>
                </div>
                <div class="flex-cell col-discontinued">
                  <div v-if="p.isDiscontinued">✓</div>
                  <div v-if="p.discontinuedDate" class="date-subtext">
                    {{ formatDate(p.discontinuedDate) }}
                  </div>
                </div>
                <div class="flex-cell col-remarks">{{ p.remarks }}</div>
                <div class="flex-cell col-created">{{ formatDate(p.createdAt) }}</div>
                <div class="flex-cell col-actions">
                  <div class="action-buttons">
                    <button
                      class="btn btn-order"
                      @click="openOrderModal(p)"
                      :disabled="isPageLocked"
                    >
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
                        class="btn-icon btn-history"
                        @click="openHistoryModal(p)"
                        title="動向歷史"
                      >
                        🕒
                      </button>
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 住院病人表格 -->
      <div v-if="activeTab === 'ipd'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('ipd')" :disabled="isPageLocked" class="btn-add">
              新增病人
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
          <div class="flex-table-wrapper">
            <div class="flex-table-header">
              <div class="flex-cell col-name" @click="handleSort('name')">
                姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
              </div>
              <div class="flex-cell col-mrn" @click="handleSort('medicalRecordNumber')">
                病歷號
                <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
              </div>
              <div class="flex-cell col-physician" @click="handleSort('physician')">
                會診醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
              </div>
              <div class="flex-cell col-freq" @click="handleSort('freq')">
                頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
              </div>
              <div class="flex-cell col-mode">模式</div>
              <div class="flex-cell col-first-dialysis">首透</div>
              <div class="flex-cell col-discontinued">中止</div>
              <div class="flex-cell col-remarks">備註</div>
              <div class="flex-cell col-created" @click="handleSort('createdAt')">
                新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
              </div>
              <div class="flex-cell col-actions">操作</div>
            </div>

            <div class="flex-table-body">
              <div
                v-for="p in displayedPatients"
                :key="p.id"
                class="flex-table-row"
                :class="getRowClass(p)"
              >
                <div class="flex-cell col-name">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </div>
                <div class="flex-cell col-mrn">{{ p.medicalRecordNumber }}</div>
                <div class="flex-cell col-physician">{{ p.physician }}</div>
                <div class="flex-cell col-freq">{{ p.freq }}</div>
                <div class="flex-cell col-mode">{{ p.mode }}</div>
                <div class="flex-cell col-first-dialysis">
                  <div v-if="p.isFirstDialysis">✓</div>
                  <div v-if="p.firstDialysisDate" class="date-subtext">
                    {{ formatDate(p.firstDialysisDate) }}
                  </div>
                </div>
                <div class="flex-cell col-discontinued">
                  <div v-if="p.isDiscontinued">✓</div>
                  <div v-if="p.discontinuedDate" class="date-subtext">
                    {{ formatDate(p.discontinuedDate) }}
                  </div>
                </div>
                <div class="flex-cell col-remarks">{{ p.remarks }}</div>
                <div class="flex-cell col-created">{{ formatDate(p.createdAt) }}</div>
                <div class="flex-cell col-actions">
                  <div class="action-buttons">
                    <button
                      class="btn btn-order"
                      @click="openOrderModal(p)"
                      :disabled="isPageLocked"
                    >
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
                        class="btn-icon btn-history"
                        @click="openHistoryModal(p)"
                        title="動向歷史"
                      >
                        🕒
                      </button>
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 門診常規表格 -->
      <div v-if="activeTab === 'opd'" class="tab-content active">
        <div class="view-header">
          <div class="controls-left">
            <button @click="openAddPatientModal('opd')" :disabled="isPageLocked" class="btn-add">
              新增病人
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
          <div class="flex-table-wrapper">
            <div class="flex-table-header">
              <div class="flex-cell col-name" @click="handleSort('name')">
                姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
              </div>
              <div class="flex-cell col-mrn" @click="handleSort('medicalRecordNumber')">
                病歷號
                <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
              </div>
              <div class="flex-cell col-physician" @click="handleSort('physician')">
                收案醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
              </div>
              <div class="flex-cell col-freq" @click="handleSort('freq')">
                頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
              </div>
              <div class="flex-cell col-mode">模式</div>
              <div class="flex-cell col-vasc-access">血管通路</div>
              <div class="flex-cell col-remarks">備註</div>
              <div class="flex-cell col-created" @click="handleSort('createdAt')">
                新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
              </div>
              <div class="flex-cell col-actions">操作</div>
            </div>

            <div class="flex-table-body">
              <div
                v-for="p in displayedPatients"
                :key="p.id"
                class="flex-table-row"
                :class="getRowClass(p)"
              >
                <div class="flex-cell col-name">
                  <div class="name-cell-content">
                    <span class="patient-name-text">{{ p.name }}</span>
                    <div
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </div>
                <div class="flex-cell col-mrn">{{ p.medicalRecordNumber }}</div>
                <div class="flex-cell col-physician">{{ p.physician }}</div>
                <div class="flex-cell col-freq">{{ p.freq }}</div>
                <div class="flex-cell col-mode">{{ p.mode }}</div>
                <div class="flex-cell col-vasc-access">{{ p.vascAccess }}</div>
                <div class="flex-cell col-remarks">{{ p.remarks }}</div>
                <div class="flex-cell col-created">{{ formatDate(p.createdAt) }}</div>
                <div class="flex-cell col-actions">
                  <div class="action-buttons">
                    <button
                      class="btn btn-order"
                      @click="openOrderModal(p)"
                      :disabled="isPageLocked"
                    >
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
                        class="btn-icon btn-history"
                        @click="openHistoryModal(p)"
                        title="動向歷史"
                      >
                        🕒
                      </button>
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
                  </div>
                </div>
              </div>
            </div>
          </div>
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
                    class="btn btn-restore"
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

    <!-- Modal 組件 -->
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

    <PatientHistoryModal
      :is-visible="isHistoryModalVisible"
      :patient-id="selectedPatientForHistory?.id"
      :patient-name="selectedPatientForHistory?.name"
      @close="isHistoryModalVisible = false"
    />
  </div>
</template>

<style scoped>
/* CSS 變數 */
:root {
  --primary-color: #005a9c;
  --success-color: #16a34a;
  --danger-color: #dc3545;
  --warning-color: #f97316;
  --info-color: #0ea5e9;
  --green-bg: #f0fdf4;
  --blue-bg: #eff6ff;
  --purple-bg: #e9d5ff;
  --orange-bg: #fff7ed;
  --grey-bg: #f8f9fa;
  --grey-text: #6c757d;
}

/* 基礎佈局 */
.page-container {
  padding: 1.5rem;
}

.page-title {
  margin-bottom: 1.5rem;
  color: #333; /* ✅ 黑色 */
  font-weight: bold;
}

/* 分頁標籤 */
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
  transition: color 0.2s;
}

.tab-button.active {
  color: var(--primary-color);
  font-weight: bold;
}

.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background-color: var(--primary-color);
}

.tab-button:hover:not(.active) {
  color: #555;
}

/* 視圖標題區 */
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
  background-color: var(--success-color);
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.controls-left .btn-add:hover:not(:disabled) {
  background-color: #15803d;
}

.controls-left .btn-add:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
  height: 40px;
  font-size: 1rem;
}

.controls-left input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 90, 156, 0.1);
}

/* 統計摘要 */
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
  color: var(--primary-color);
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

/* Flexbox 表格樣式 */
.table-wrapper {
  max-height: calc(100vh - 250px);
  overflow-y: auto;
}

.flex-table-wrapper {
  border: 1px solid #ddd;
  border-radius: 4px;
  overflow: hidden;
}

.flex-table-header,
.flex-table-row {
  display: flex;
  border-bottom: 1px solid #ddd;
}

.flex-table-body .flex-table-row:last-child {
  border-bottom: none;
}

.flex-table-header {
  background-color: #f2f2f2;
  font-weight: bold;
  position: sticky;
  top: 0;
  z-index: 2;
}

.flex-cell {
  padding: 10px 12px;
  display: flex;
  align-items: center;
  overflow: hidden;
  white-space: nowrap;
  border-right: 1px solid #ddd;
}

.flex-table-header .flex-cell:last-child,
.flex-table-row .flex-cell:last-child {
  border-right: none;
}

/* 欄位寬度設定 */
.col-name {
  flex: 0 0 140px;
}
.col-mrn {
  flex: 0 0 90px;
}
.col-physician {
  flex: 0 0 100px;
}
.col-freq {
  flex: 0 0 90px;
}
.col-mode {
  flex: 0 0 80px;
}
.col-vasc-access {
  flex: 0 0 90px;
}
.col-first-dialysis,
.col-discontinued {
  flex: 0 0 70px;
  text-align: center;
  justify-content: center;
}
.col-remarks {
  flex: 1 1 auto;
  white-space: normal;
  word-break: break-all;
}
.col-created {
  flex: 0 0 110px;
}
.col-actions {
  flex: 0 0 390px;
  justify-content: flex-start;
}

.flex-table-header .flex-cell {
  cursor: pointer;
  user-select: none;
  transition: background-color 0.2s;
}

.flex-table-header .flex-cell:hover {
  background-color: #e8e8e8;
}

/* 姓名欄位特殊樣式 */
.name-cell-content {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: nowrap;
}

.patient-name-text {
  font-weight: bold;
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
  color: var(--danger-color);
  border: 1px solid var(--danger-color);
  border-radius: 4px;
}

/* 操作按鈕樣式 */
.action-buttons {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}

.action-buttons .btn {
  padding: 5px 10px;
  font-size: 0.9em;
  border-radius: 4px;
  border: none;
  cursor: pointer;
  color: white;
  white-space: nowrap;
  transition: background-color 0.2s;
}

.btn.btn-order {
  background-color: #ff9c07;
  color: #212529;
}

.btn.btn-order:hover:not(:disabled) {
  background-color: #e0a800;
}

.btn.btn-transfer {
  background-color: #17a2b8;
}

.btn.btn-transfer:hover:not(:disabled) {
  background-color: #138496;
}

.btn.btn-restore {
  background-color: var(--success-color);
}

.btn.btn-restore:hover:not(:disabled) {
  background-color: #15803d;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.icon-buttons {
  display: flex;
  gap: 0.25rem;
  margin-left: auto;
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

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon.btn-edit {
  color: #007bff;
}
.btn-icon.btn-delete {
  color: #dc3545;
}
.btn-icon.btn-history {
  color: #6c757d;
}

.btn-icon.btn-edit:hover:not(:disabled) {
  background-color: #e0e7ff;
}
.btn-icon.btn-delete:hover:not(:disabled) {
  background-color: #fee2e2;
}
.btn-icon.btn-history:hover:not(:disabled) {
  background-color: #f1f3f5;
}

/* 行背景色 */
.flex-table-row.status-opd {
  background-color: var(--green-bg);
}
.flex-table-row.status-ipd {
  background-color: var(--blue-bg);
}
.flex-table-row.status-er {
  background-color: #f3e8ff; /* ✅ 改為淡紫色 */
}
.flex-table-row.status-biweekly {
  background-color: var(--orange-bg);
}
.flex-table-row.status-deleted {
  background-color: var(--grey-bg);
  color: var(--grey-text);
}
.flex-table-row.status-discontinued {
  background-color: #fee2e2;
  color: #7f1d1d;
  text-decoration: line-through;
  opacity: 0.7;
}
.flex-table-row.status-discontinued button {
  text-decoration: none;
}

.date-subtext {
  font-size: 0.8em;
  color: #666;
  margin-top: 2px;
}

.flex-table-row.status-discontinued .date-subtext {
  color: #991b1b;
}

.sort-indicator {
  display: inline-block;
  margin-left: 5px;
  color: #999;
}

/* 鎖定狀態 */
.is-locked .flex-table-wrapper {
  pointer-events: none;
  opacity: 0.65;
}

/* 已刪除病人的表格樣式 */
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
  transition: background-color 0.2s;
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
  height: 40px;
}

.toolbar .btn-export {
  background-color: var(--info-color);
}

.toolbar .btn-export:hover {
  background-color: #0284c7;
}

.patient-table {
  width: 100%;
  border-collapse: collapse;
}

.patient-table th,
.patient-table td {
  border: 1px solid #ddd;
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
}

.patient-table th {
  background-color: #f2f2f2;
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}

.patient-table th:hover {
  background-color: #e8e8e8;
}

/* 響應式設計 */
@media (max-width: 1200px) {
  .col-actions {
    flex: 0 0 300px;
  }
}

@media (max-width: 768px) {
  .view-header {
    flex-direction: column;
    align-items: stretch;
  }

  .stats-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  .controls-left input {
    min-width: 200px;
  }
}
</style>
