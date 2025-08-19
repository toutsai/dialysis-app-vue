<!-- 檔案路徑: src/views/PatientsView.vue (✨ Pinia 遷移版 ✨) -->
<script setup>
import { ref, onMounted, computed, watch, onUnmounted } from 'vue'
import { doc, getDoc, updateDoc, where, orderBy } from 'firebase/firestore'
import { db } from '@/composables/useFirebase.js'
import {
  updatePatient as optimizedUpdatePatient,
  savePatient as optimizedSavePatient,
} from '@/services/optimizedApiService.js'
import ApiManager from '@/services/api_manager.js'

import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue'
import PatientHistoryModal from '@/components/PatientHistoryModal.vue'
import { useAuth } from '@/composables/useAuth.js'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'
import * as XLSX from 'xlsx'

// ✨ --- 核心修改 #1: 引入 Pinia Store --- ✨
import { usePatientStore } from '@/stores/patientStore.js'
import { storeToRefs } from 'pinia'

// ✨ --- 核心修改 #2: 實例化 Store 並獲取響應式狀態 --- ✨
const patientStore = usePatientStore()
const { allPatients } = storeToRefs(patientStore) // 直接從 Store 獲取 allPatients

const patientHistory = ref([])
const activeTab = ref('opd')
const currentSort = ref({ column: 'updatedAt', order: 'desc' })
const patientHistoryApi = ApiManager('patient_history')
const deletedPatientHistory = ref([])
const erListFilter = ref('')
const ipdListFilter = ref('')
const opdListFilter = ref('')
const deletedSearchTerm = ref('')
const globalSearchTerm = ref('')
const patientStats = ref({
  source: { er: 0, ipd: 0, opd: 0, deleted: 0 },
  mode: {},
  disease: {},
  freq: {},
  opdChanges: {
    lastMonth: {
      new: 0,
      transferOut: 0,
      death: 0,
      details: { 轉外院透析: 0, 轉PD: 0, 腎臟移植: 0 },
    },
    thisMonth: {
      new: 0,
      transferOut: 0,
      death: 0,
      details: { 轉外院透析: 0, 轉PD: 0, 腎臟移植: 0 },
    },
  },
})
const activePopover = ref(null)
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
const isHistoryModalVisible = ref(false)
const selectedPatientForHistory = ref(null)
const newPatientDataForConflict = ref(null)
const existingPatientForConflict = ref(null)
const isRestoreDialogVisible = ref(false)
const patientToRestoreId = ref(null)
const { createGlobalNotification } = useGlobalNotifier()
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
  每日: 'freq-purple',
  每周一: 'freq-teal',
  每周二: 'freq-teal',
  每周三: 'freq-teal',
  每周四: 'freq-teal',
  每周五: 'freq-teal',
  每周六: 'freq-teal',
  臨時: 'freq-red',
  未設定: 'freq-grey',
}
const DELETE_REASONS = [
  { value: '出院', text: '出院' },
  { value: '死亡', text: '死亡' },
  { value: '轉外院透析', text: '轉外院透析' },
  { value: '轉PD', text: '轉PD' },
  { value: '腎臟移植', text: '腎臟移植' },
  { value: '轉安寧', text: '轉安寧' },
  { value: '腎功能恢復不須透析', text: '腎功能恢復不須透析' },
]
const RESTORE_OPTIONS = [
  { value: 'opd', text: '復原至 門診' },
  { value: 'ipd', text: '復原至 住院' },
  { value: 'er', text: '復原至 急診' },
]

const displayedPatients = computed(() => {
  let patientsToDisplay
  let searchTerm = ''
  if (!allPatients.value) return [] // 數據源已改為 store 的 allPatients
  if (activeTab.value === 'er') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'er' && !p.isDeleted)
    searchTerm = erListFilter.value.toLowerCase()
  } else if (activeTab.value === 'ipd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted)
    searchTerm = ipdListFilter.value.toLowerCase()
  } else if (activeTab.value === 'opd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted)
    searchTerm = opdListFilter.value.toLowerCase()
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
    const sortColumn = currentSort.value.column
    if (sortColumn === 'patientStatus') {
      const statusA = a.patientStatus || {}
      const statusB = b.patientStatus || {}
      valA =
        (statusA.isFirstDialysis?.active ? '1' : '0') +
        (statusA.isPaused?.active ? '1' : '0') +
        (statusA.hasBloodDraw?.active ? '1' : '0')
      valB =
        (statusB.isFirstDialysis?.active ? '1' : '0') +
        (statusB.isPaused?.active ? '1' : '0') +
        (statusB.hasBloodDraw?.active ? '1' : '0')
    } else {
      valA = a[sortColumn]
      valB = b[sortColumn]
    }
    if (valA && typeof valA.toDate === 'function') valA = valA.toDate()
    if (valB && typeof valB.toDate === 'function') valB = valB.toDate()
    valA = valA || ''
    valB = valB || ''
    const compare = String(valA).localeCompare(String(valB), 'zh-Hant')
    return currentSort.value.order === 'asc' ? compare : -compare
  })
})

const displayedDeletedHistory = computed(() => {
  let history = deletedPatientHistory.value
  if (deletedSearchTerm.value) {
    const term = deletedSearchTerm.value.toLowerCase()
    history = history.filter((h) => h.patientName.toLowerCase().includes(term))
  }
  return history
})

async function fetchDeletedPatientHistory() {
  try {
    deletedPatientHistory.value = await patientHistoryApi.fetchAll([
      where('eventType', '==', 'DELETE'),
      orderBy('timestamp', 'desc'),
    ])
  } catch (error) {
    console.error('讀取已刪除病人歷史失敗:', error)
    showAlert('讀取失敗', '讀取已刪除病人動向失敗！')
  }
}

watch(activeTab, (newTab) => {
  if (newTab === 'deleted') {
    fetchDeletedPatientHistory()
  }
})

const calculateStats = () => {
  const statsResult = {
    source: { er: 0, ipd: 0, opd: 0, deleted: 0 },
    mode: { HD: 0, SLED: 0, CVVHDF: 0, PP: 0, DFPP: 0 },
    disease: { HBV: 0, HCV: 0, HIV: 0, RPR: 0, COVID: 0, 隔離: 0 },
    freq: { 一三五: 0, 二四六: 0, 一四: 0, 二五: 0, 三六: 0, 一五: 0, 二六: 0, 臨時: 0 },
    opdChanges: {
      lastMonth: {
        new: 0,
        transferOut: 0,
        death: 0,
        details: { 轉外院透析: 0, 轉PD: 0, 腎臟移植: 0 },
      },
      thisMonth: {
        new: 0,
        transferOut: 0,
        death: 0,
        details: { 轉外院透析: 0, 轉PD: 0, 腎臟移植: 0 },
      },
    },
  }
  const today = new Date()
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth()
  const firstDayThisMonth = new Date(currentYear, currentMonth, 1)
  const firstDayLastMonth = new Date(currentYear, currentMonth - 1, 1)
  const lastDayLastMonth = new Date(currentYear, currentMonth, 0)
  const transferOutReasons = ['轉外院透析', '轉PD', '腎臟移植']
  allPatients.value.forEach((p) => {
    if (p.isDeleted) {
      statsResult.source.deleted++
    } else if (p.status) {
      if (!statsResult.source[p.status]) statsResult.source[p.status] = 0
      statsResult.source[p.status]++
    }
    if (!p.isDeleted) {
      if (p.mode && statsResult.mode.hasOwnProperty(p.mode)) statsResult.mode[p.mode]++
      if (p.diseases)
        p.diseases.forEach((d) => {
          if (statsResult.disease.hasOwnProperty(d)) statsResult.disease[d]++
        })
      if (p.freq && statsResult.freq.hasOwnProperty(p.freq)) statsResult.freq[p.freq]++
    }
    if (p.isDeleted && p.originalStatus === 'opd') {
      const deletedAt = p.deletedAt?.toDate
        ? p.deletedAt.toDate()
        : p.deletedAt
          ? new Date(p.deletedAt)
          : null
      if (deletedAt) {
        const period =
          deletedAt >= firstDayLastMonth && deletedAt <= lastDayLastMonth
            ? 'lastMonth'
            : deletedAt >= firstDayThisMonth && deletedAt <= today
              ? 'thisMonth'
              : null
        if (period) {
          if (p.deleteReason === '死亡') {
            statsResult.opdChanges[period].death++
          } else if (transferOutReasons.includes(p.deleteReason)) {
            statsResult.opdChanges[period].transferOut++
            if (statsResult.opdChanges[period].details.hasOwnProperty(p.deleteReason)) {
              statsResult.opdChanges[period].details[p.deleteReason]++
            }
          }
        }
      }
    }
  })
  patientHistory.value.forEach((history) => {
    const eventTime = history.timestamp?.toDate
      ? history.timestamp.toDate()
      : new Date(history.timestamp)
    const period =
      eventTime >= firstDayLastMonth && eventTime <= lastDayLastMonth
        ? 'lastMonth'
        : eventTime >= firstDayThisMonth && eventTime <= today
          ? 'thisMonth'
          : null
    if (period) {
      if (history.eventType === 'CREATE' && history.eventDetails?.status === 'opd') {
        statsResult.opdChanges[period].new++
      } else if (history.eventType === 'TRANSFER' && history.eventDetails?.to === 'opd') {
        statsResult.opdChanges[period].new++
      } else if (
        history.eventType === 'RESTORE_AND_TRANSFER' &&
        history.eventDetails?.restoredTo === 'opd'
      ) {
        statsResult.opdChanges[period].new++
      }
    }
  })
  patientStats.value = statsResult
}
watch(allPatients, calculateStats, { deep: true })
watch(patientHistory, calculateStats, { deep: true })

const togglePopover = (popoverName) => {
  if (activePopover.value === popoverName) {
    activePopover.value = null
  } else {
    activePopover.value = popoverName
  }
}
const closePopovers = (event) => {
  if (event && event.target.closest('.stats-popover-wrapper')) {
    return
  }
  activePopover.value = null
}
function showAlert(title, message) {
  alertDialogTitle.value = title
  alertDialogMessage.value = message
  isAlertDialogVisible.value = true
}
function showConfirm(title, message, onConfirm) {
  confirmDialogTitle.value = title
  confirmDialogMessage.value = message
  confirmAction.value = onConfirm
  isConfirmDialogVisible.value = true
}
// ✨ 核心修改 #3: 移除本地的 removeRuleFromMasterSchedule，改用 Store 的 action
// async function removeRuleFromMasterSchedule(patientId) { ... }

// ✨ 核心修改 #4: 移除本地的 fetchAllPatients 和 refreshAllData
// async function fetchAllPatients() { ... }
// async function refreshAllData() { ... }
// 未來將直接使用 patientStore.forceRefreshPatients()

async function fetchPatientHistoryForStats() {
  try {
    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)
    twoMonthsAgo.setDate(1)
    patientHistory.value = await patientHistoryApi.fetchAll([
      where('timestamp', '>=', twoMonthsAgo.toISOString()),
    ])
  } catch (error) {
    console.error('讀取病人歷史紀錄失敗:', error)
    showAlert('讀取失敗', '讀取病人歷史統計資料失敗！')
  }
}

async function handleGlobalSearch(query) {
  if (!query || !query.trim()) {
    showAlert('提示', '請輸入病人姓名或病歷號進行搜尋。')
    return
  }
  const searchTerm = query.trim()
  const searchTermLower = searchTerm.toLowerCase()
  const searchResults = allPatients.value.filter(
    (p) =>
      (p.medicalRecordNumber && p.medicalRecordNumber.includes(searchTerm)) ||
      (p.name && p.name.toLowerCase().includes(searchTermLower)),
  )
  if (searchResults.length > 1) {
    showAlert('找到多位病人', `符合 "${query}" 的病人不只一位，請用更完整的資料查找。`)
    return
  }
  const foundPatient = searchResults.length === 1 ? searchResults[0] : null
  const statusMap = { ipd: '住院', opd: '門診', er: '急診' }
  const targetStatusText = statusMap[activeTab.value] || '列表'
  if (foundPatient) {
    if (foundPatient.isDeleted) {
      showConfirm(
        '找到已刪除病人',
        `病人 "${foundPatient.name}" (${foundPatient.medicalRecordNumber}) 已被刪除 (原因: ${foundPatient.deleteReason || '未知'})。\n\n是否要復原並移至「${targetStatusText}」清單？`,
        () => restorePatient(foundPatient.id),
      )
    } else if (foundPatient.status !== activeTab.value) {
      const currentStatusText = statusMap[foundPatient.status] || '未知'
      showConfirm(
        '找到病人 (不同表單)',
        `病人 "${foundPatient.name}" (${foundPatient.medicalRecordNumber}) 目前在「${currentStatusText}」清單中。\n\n是否要移至「${targetStatusText}」清單？`,
        () => transferPatient(foundPatient.id, activeTab.value),
      )
    } else {
      showAlert('病人已存在', `病人 "${foundPatient.name}" 已在「${targetStatusText}」清單中。`)
    }
  } else {
    const newPatientTemplate = { diseases: [] }
    if (/^\d{6,}$/.test(searchTerm)) {
      newPatientTemplate.medicalRecordNumber = searchTerm
    } else {
      newPatientTemplate.name = searchTerm
    }
    editingPatient.value = newPatientTemplate
    modalType.value = activeTab.value
    isModalVisible.value = true
  }
}
async function handleSavePatient(patientData) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  if (patientData.id) {
    const originalPatient = allPatients.value.find((p) => p.id === patientData.id)
    if (originalPatient && !originalPatient.isDiscontinued && patientData.isDiscontinued) {
      showConfirm(
        '確認中止透析',
        `您確定要將「${patientData.name}」標記為中止透析，並從總床位表中移除其排班規則嗎？`,
        async () => {
          try {
            closeModal()
            await optimizedUpdatePatient(patientData.id, {
              isDiscontinued: true,
              discontinuedDate:
                patientData.discontinuedDate || new Date().toISOString().split('T')[0],
            })
            await patientStore.removeRuleFromMasterSchedule(patientData.id) // 改用 Store action
            await patientStore.forceRefreshPatients() // 強制刷新 Store
            window.dispatchEvent(new CustomEvent('patient-data-updated'))
            createGlobalNotification(`中止透析：${patientData.name}`, 'patient')
            showAlert('操作成功', `已將 ${patientData.name} 標記為中止透析。`)
          } catch (err) {
            showAlert('操作失敗', err.message || '中止透析操作失敗！')
          }
        },
      )
      return
    }
    try {
      const dataToUpdate = { ...patientData }
      delete dataToUpdate.id
      dataToUpdate.updatedAt = new Date().toISOString()
      await optimizedUpdatePatient(patientData.id, dataToUpdate)
      await patientStore.forceRefreshPatients() // 強制刷新 Store
      window.dispatchEvent(new CustomEvent('patient-data-updated'))
      createGlobalNotification(`編輯病人：${patientData.name}`, 'patient')
      closeModal()
    } catch (err) {
      showAlert('操作失敗', '更新病人資料失敗！')
    }
    return
  }
  if (!patientData.medicalRecordNumber?.trim()) {
    showAlert('資料不完整', '請務必填寫病歷號。')
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
    showConfirm(
      '病歷號重複',
      `病歷號 ${patientData.medicalRecordNumber} (${existingPatient.name}) 已存在於「${currentStatusText}」清單中。您是否要直接將其轉移並更新資料？`,
      () => handleConflictSelected(),
    )
    newPatientDataForConflict.value = patientData
    existingPatientForConflict.value = existingPatient
  } else {
    try {
      const dataToCreate = {
        ...patientData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isDeleted: false,
        status: modalType.value,
      }
      const savedPatient = await optimizedSavePatient(dataToCreate)
      await patientStore.forceRefreshPatients() // 強制刷新 Store
      window.dispatchEvent(new CustomEvent('patient-data-updated'))
      const statusText = { ipd: '住院', opd: '門診', er: '急診' }[modalType.value] || '列表'
      createGlobalNotification(`新增病人：${dataToCreate.name} (${statusText})`, 'patient')
      closeModal()
    } catch (err) {
      showAlert('操作失敗', '新增病人失敗！')
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
    await optimizedUpdatePatient(existingPatient.id, dataToUpdate)
    await patientStore.forceRefreshPatients() // 強制刷新 Store
    window.dispatchEvent(new CustomEvent('patient-data-updated'))
    const statusText = { ipd: '住院', opd: '門診', er: '急診' }[modalType.value] || '列表'
    createGlobalNotification(`轉移病人：${newPatientData.name} 至 ${statusText}`, 'patient')
    showAlert('操作成功', `病人 ${newPatientData.name} 已成功更新並轉移至 ${statusText} 清單。`)
    closeModal()
  } catch (err) {
    showAlert('操作失敗', '轉移更新病人失敗！')
  } finally {
    existingPatientForConflict.value = null
    newPatientDataForConflict.value = null
  }
}
async function transferPatient(patientId, newStatus) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) return
  const targetStatusText = { ipd: '住院', opd: '門診', er: '急診' }[newStatus] || '未知'
  showConfirm(
    `確認轉為${targetStatusText}`,
    `您確定要將「${patient.name}」轉為${targetStatusText}嗎？`,
    async () => {
      try {
        await optimizedUpdatePatient(patientId, { status: newStatus })
        await patientStore.forceRefreshPatients() // 強制刷新 Store
        window.dispatchEvent(new CustomEvent('patient-data-updated'))
        createGlobalNotification(`轉移病人：${patient.name} 至 ${targetStatusText}`, 'patient')
        showAlert('轉移成功', `${patient.name} 已成功轉至${targetStatusText}。`)
        globalSearchTerm.value = ''
      } catch (err) {
        showAlert('操作失敗', err.message || '轉床失敗！')
      }
    },
  )
}
async function handleDeleteReasonSelected(reason) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  if (!patientToDeleteId.value) return
  try {
    const patient = allPatients.value.find((p) => p.id === patientToDeleteId.value)
    if (!patient) {
      showAlert('錯誤', '找不到該病人資料。')
      return
    }
    const patientIdForActions = patient.id
    const patientNameForNotification = patient.name
    await optimizedUpdatePatient(patientIdForActions, {
      isDeleted: true,
      originalStatus: patient.status,
      deleteReason: reason,
      deletedAt: new Date().toISOString(),
    })
    await patientStore.removeRuleFromMasterSchedule(patientIdForActions) // 改用 Store action
    await patientStore.forceRefreshPatients() // 強制刷新 Store
    window.dispatchEvent(new CustomEvent('patient-data-updated'))
    createGlobalNotification(`刪除病人：${patientNameForNotification} (${reason})`, 'patient')
    showAlert(
      '刪除成功',
      `${patientNameForNotification} 已被刪除，其在「門急住床位總表」中的規則也已移除。後端將自動更新未來排程。`,
    )
  } catch (err) {
    console.error('刪除病人流程失敗:', err)
    showAlert('操作失敗', err.message || '刪除病人時發生錯誤！')
  } finally {
    isDeleteDialogVisible.value = false
    patientToDeleteId.value = null
  }
}
function restorePatient(patientId) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  patientToRestoreId.value = patientId
  isRestoreDialogVisible.value = true
}
async function handleRestoreSelected(targetStatus) {
  isRestoreDialogVisible.value = false
  const patientId = patientToRestoreId.value
  if (!patientId || !targetStatus) return
  const patient = allPatients.value.find((p) => p.id === patientId)
  if (!patient) {
    // ✨ 新增健壯性：如果本地列表沒有，從 Store 再找一次
    const patientFromStore = patientStore.patientMap.get(patientId)
    if (!patientFromStore) {
      showAlert('錯誤', '找不到該病人資料。')
      return
    }
  }
  const patientName = patient?.name || patientStore.patientMap.get(patientId)?.name
  const statusMap = { opd: '門診', ipd: '住院', er: '急診' }
  const targetStatusText = statusMap[targetStatus] || '列表'
  try {
    await optimizedUpdatePatient(patientId, {
      isDeleted: false,
      status: targetStatus,
      deleteReason: null,
      deletedAt: null,
      originalStatus: null,
    })
    await patientStore.removeRuleFromMasterSchedule(patientId) // 復原時也應清除舊規則
    await patientStore.forceRefreshPatients() // 強制刷新 Store
    window.dispatchEvent(new CustomEvent('patient-data-updated'))
    createGlobalNotification(`復原病人：${patientName} 至 ${targetStatusText}`, 'patient')
    showAlert(
      '復原成功',
      `${patientName} 已復原並移至「${targetStatusText}」清單。如需排班，請至總床位表設定。`,
    )
  } catch (err) {
    showAlert('操作失敗', '復原病人時發生錯誤！')
  } finally {
    patientToRestoreId.value = null
  }
}

function cancelDelete() {
  isDeleteDialogVisible.value = false
  patientToDeleteId.value = null
}
function openEditPatientModal(patient) {
  editingPatient.value = JSON.parse(JSON.stringify(patient))
  modalType.value = activeTab.value
  isModalVisible.value = true
}
function openHistoryModal(patientId) {
  selectedPatientForHistory.value = { id: patientId }
  isHistoryModalVisible.value = true
}
function deletePatient(patientId) {
  patientToDeleteId.value = patientId
  isDeleteDialogVisible.value = true
}
function changeTab(tabName) {
  activeTab.value = tabName
  globalSearchTerm.value = ''
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
  globalSearchTerm.value = ''
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
  if (biweeklyFreq.includes(p.freq)) return 'status-biweekly'
  return `status-${p.status}`
}
function generateDiseaseTags(diseases) {
  if (!diseases?.length) return ''
  return diseases.map((tag) => `<span class="disease-tag">${tag}</span>`).join('')
}
function handleConfirm() {
  if (typeof confirmAction.value === 'function') confirmAction.value()
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function handleCancel() {
  isConfirmDialogVisible.value = false
  confirmAction.value = null
}
function openOrderModal(patient) {
  editingPatientForOrder.value = JSON.parse(JSON.stringify(patient))
  isOrderModalVisible.value = true
}
async function handleSaveOrder(orderData) {
  if (!editingPatientForOrder.value?.id) {
    showAlert('儲存失敗', '找不到有效的病人資訊。')
    return
  }
  const patientId = editingPatientForOrder.value.id
  const patientName = editingPatientForOrder.value.name
  const parseNumeric = (v) => (v === '' || v == null ? null : Number(v))
  const cleanOrders = {
    ak: orderData.ak || '',
    dialysateCa: orderData.dialysateCa || '',
    heparinInitial: parseNumeric(orderData.heparinInitial),
    heparinMaintenance: parseNumeric(orderData.heparinMaintenance),
    bloodFlow: parseNumeric(orderData.bloodFlow),
    dryWeight: parseNumeric(orderData.dryWeight),
    effectiveDate: orderData.effectiveDate || new Date().toISOString().slice(0, 10),
  }
  try {
    await optimizedUpdatePatient(patientId, { dialysisOrders: cleanOrders })
    isOrderModalVisible.value = false
    await patientStore.forceRefreshPatients() // 強制刷新 Store
    createGlobalNotification(`更新醫囑：${patientName}`, 'patient')
  } catch (error) {
    showAlert('操作失敗', `儲存醫囑時發生錯誤: ${error.message}`)
  }
}
function exportDeletedPatients() {
  const data = displayedDeletedHistory.value.map((h) => {
    const s = h.snapshot || {}
    return [
      h.patientName,
      s.medicalRecordNumber || 'N/A',
      { opd: '門診', ipd: '住院', er: '急診' }[h.eventDetails.fromStatus] || '未知',
      h.eventDetails.reason,
      s.hospitalInfo?.transferOut || '',
      formatDate(h.timestamp),
    ]
  })
  const ws = XLSX.utils.aoa_to_sheet([
    ['姓名', '病歷號', '原狀態', '刪除原因', '轉出院所', '刪除日期'],
    ...data,
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '已刪除病人')
  XLSX.writeFile(wb, `已刪除病人清單_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

onMounted(() => {
  // ✨ 核心修改 #5: onMounted 邏輯大幅簡化
  // 不再需要呼叫 refreshAllData，因為 App.vue 已經觸發了
  fetchPatientHistoryForStats() // 統計歷史數據仍然需要本地獲取
  window.addEventListener('click', closePopovers)
})

onUnmounted(() => {
  window.removeEventListener('click', closePopovers)
})
</script>

<template>
  <div v-if="isLoggedIn">
    <link
      rel="stylesheet"
      href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"
    />
    <div class="page-container" :class="{ 'is-locked': isPageLocked }">
      <!-- ... (頂部區域和非刪除列表不變) ... -->
      <div class="desktop-only">
        <h1 class="page-title">透析病人管理</h1>
        <div class="main-stats-bar">
          <div class="source-stats">
            <button
              class="stat-tag"
              :class="{ active: activeTab === 'er' }"
              @click="changeTab('er')"
            >
              急診 <span class="count">{{ patientStats.source.er }}</span></button
            ><button
              class="stat-tag"
              :class="{ active: activeTab === 'ipd' }"
              @click="changeTab('ipd')"
            >
              住院 <span class="count">{{ patientStats.source.ipd }}</span></button
            ><button
              class="stat-tag"
              :class="{ active: activeTab === 'opd' }"
              @click="changeTab('opd')"
            >
              門診 <span class="count">{{ patientStats.source.opd }}</span></button
            ><button
              class="stat-tag"
              :class="{ active: activeTab === 'deleted' }"
              @click="changeTab('deleted')"
            >
              已刪除 <span class="count">{{ patientStats.source.deleted }}</span>
            </button>
          </div>
          <div class="detailed-stats">
            <div class="stats-popover-wrapper">
              <button class="stat-popover-trigger" @click.stop="togglePopover('mode')">類型</button>
              <div v-if="activePopover === 'mode'" class="stats-popover">
                <div v-for="(count, key) in patientStats.mode" :key="key" class="popover-item">
                  <span>{{ key }}</span
                  ><span>{{ count }}</span>
                </div>
              </div>
            </div>
            <div class="stats-popover-wrapper">
              <button class="stat-popover-trigger" @click.stop="togglePopover('disease')">
                疾病
              </button>
              <div v-if="activePopover === 'disease'" class="stats-popover">
                <div v-for="(count, key) in patientStats.disease" :key="key" class="popover-item">
                  <span>{{ key }}</span
                  ><span>{{ count }}</span>
                </div>
              </div>
            </div>
            <div class="stats-popover-wrapper">
              <button class="stat-popover-trigger" @click.stop="togglePopover('freq')">頻率</button>
              <div v-if="activePopover === 'freq'" class="stats-popover">
                <div v-for="(count, key) in patientStats.freq" :key="key" class="popover-item">
                  <span>{{ key }}</span
                  ><span>{{ count }}</span>
                </div>
              </div>
            </div>
            <div class="stats-popover-wrapper">
              <button class="stat-popover-trigger" @click.stop="togglePopover('opdChanges')">
                門診變動
              </button>
              <div v-if="activePopover === 'opdChanges'" class="stats-popover opd-changes-popover">
                <div class="popover-section-title">上個月</div>
                <div class="popover-item">
                  <span>新增</span><span>{{ patientStats.opdChanges.lastMonth.new }}</span>
                </div>
                <div class="popover-item">
                  <span>轉出</span><span>{{ patientStats.opdChanges.lastMonth.transferOut }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 轉外院</span
                  ><span>{{ patientStats.opdChanges.lastMonth.details['轉外院透析'] }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 轉 PD</span
                  ><span>{{ patientStats.opdChanges.lastMonth.details['轉PD'] }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 腎移植</span
                  ><span>{{ patientStats.opdChanges.lastMonth.details['腎臟移植'] }}</span>
                </div>
                <div class="popover-item">
                  <span>死亡</span><span>{{ patientStats.opdChanges.lastMonth.death }}</span>
                </div>
                <hr class="popover-divider" />
                <div class="popover-section-title">本月至今</div>
                <div class="popover-item">
                  <span>新增</span><span>{{ patientStats.opdChanges.thisMonth.new }}</span>
                </div>
                <div class="popover-item">
                  <span>轉出</span><span>{{ patientStats.opdChanges.thisMonth.transferOut }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 轉外院</span
                  ><span>{{ patientStats.opdChanges.thisMonth.details['轉外院透析'] }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 轉 PD</span
                  ><span>{{ patientStats.opdChanges.thisMonth.details['轉PD'] }}</span>
                </div>
                <div class="popover-sub-item">
                  <span>- 腎移植</span
                  ><span>{{ patientStats.opdChanges.thisMonth.details['腎臟移植'] }}</span>
                </div>
                <div class="popover-item">
                  <span>死亡</span><span>{{ patientStats.opdChanges.thisMonth.death }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="mobile-header mobile-only">
        <h1 class="page-title">透析病人管理</h1>
        <div class="source-stats">
          <button class="stat-tag" :class="{ active: activeTab === 'er' }" @click="changeTab('er')">
            急診 <span class="count">{{ patientStats.source.er }}</span></button
          ><button
            class="stat-tag"
            :class="{ active: activeTab === 'ipd' }"
            @click="changeTab('ipd')"
          >
            住院 <span class="count">{{ patientStats.source.ipd }}</span></button
          ><button
            class="stat-tag"
            :class="{ active: activeTab === 'opd' }"
            @click="changeTab('opd')"
          >
            門診 <span class="count">{{ patientStats.source.opd }}</span></button
          ><button
            class="stat-tag"
            :class="{ active: activeTab === 'deleted' }"
            @click="changeTab('deleted')"
          >
            已刪除 <span class="count">{{ patientStats.source.deleted }}</span>
          </button>
        </div>
      </div>

      <div v-if="activeTab !== 'deleted'" class="tab-content active desktop-only">
        <div class="view-header">
          <div class="controls-left">
            <div class="search-group global-search">
              <input
                type="text"
                v-model="globalSearchTerm"
                @keydown.enter="handleGlobalSearch(globalSearchTerm)"
                placeholder="搜尋/新增/轉移病人..."
              /><button class="btn-search" @click="handleGlobalSearch(globalSearchTerm)">
                執行
              </button>
            </div>
            <div class="search-group list-filter">
              <input
                v-if="activeTab === 'er'"
                type="text"
                v-model="erListFilter"
                placeholder="篩選列表..."
              /><input
                v-if="activeTab === 'ipd'"
                type="text"
                v-model="ipdListFilter"
                placeholder="篩選列表..."
              /><input
                v-if="activeTab === 'opd'"
                type="text"
                v-model="opdListFilter"
                placeholder="篩選列表..."
              />
            </div>
          </div>
        </div>
        <div class="table-wrapper">
          <div class="flex-table-wrapper">
            <div class="flex-table-header">
              <div class="flex-cell col-name" @click="handleSort('name')">姓名</div>
              <div class="flex-cell col-mrn" @click="handleSort('medicalRecordNumber')">病歷號</div>
              <div class="flex-cell col-physician" @click="handleSort('physician')">
                {{ activeTab === 'opd' ? '收案醫師' : '會診醫師' }}
              </div>
              <div class="flex-cell col-freq" @click="handleSort('freq')">頻率</div>
              <div class="flex-cell col-mode">模式</div>
              <div class="flex-cell col-status" @click="handleSort('patientStatus')">狀態</div>
              <div class="flex-cell col-hospital" @click="handleSort('hospitalInfo')">透析院所</div>
              <div class="flex-cell col-vasc-access">血管通路</div>
              <div class="flex-cell col-remarks">備註</div>
              <div class="flex-cell col-updated" @click="handleSort('updatedAt')">異動日期</div>
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
                      v-if="p.diseases && p.diseases.length"
                      class="disease-tags-container"
                      v-html="generateDiseaseTags(p.diseases)"
                    ></div>
                  </div>
                </div>
                <div class="flex-cell col-mrn">{{ p.medicalRecordNumber }}</div>
                <div class="flex-cell col-physician">{{ p.physician }}</div>
                <div class="flex-cell col-freq">{{ p.freq }}</div>
                <div class="flex-cell col-mode">{{ p.mode }}</div>
                <div class="flex-cell col-status">
                  <div class="status-icon-container">
                    <i
                      v-if="p.patientStatus?.isFirstDialysis?.active"
                      class="fas fa-star status-icon-first"
                      :title="`首透: ${p.patientStatus.isFirstDialysis.date || '無日期'}`"
                    ></i
                    ><i
                      v-if="p.patientStatus?.isPaused?.active"
                      class="fas fa-pause-circle status-icon-paused"
                      :title="`暫停透析: ${p.patientStatus.isPaused.date || '無日期'}`"
                    ></i
                    ><i
                      v-if="p.patientStatus?.hasBloodDraw?.active"
                      class="fas fa-vial status-icon-blood"
                      :title="`已抽血: ${p.patientStatus.hasBloodDraw.date || '無日期'}`"
                    ></i>
                  </div>
                </div>
                <div class="flex-cell col-hospital">
                  <div class="hospital-cell-content">
                    <span class="hospital-source">{{ p.hospitalInfo?.source }}</span>
                    <div
                      v-if="p.hospitalInfo?.source && p.hospitalInfo?.transferOut"
                      class="hospital-divider"
                    ></div>
                    <span class="hospital-transfer-out">{{ p.hospitalInfo?.transferOut }}</span>
                  </div>
                </div>
                <div class="flex-cell col-vasc-access">{{ p.vascAccess }}</div>
                <div class="flex-cell col-remarks">{{ p.remarks }}</div>
                <div class="flex-cell col-updated">{{ formatDate(p.updatedAt) }}</div>
                <div class="flex-cell col-actions">
                  <div class="action-buttons">
                    <button
                      class="btn-icon btn-edit"
                      @click="openEditPatientModal(p)"
                      :disabled="isPageLocked"
                      title="編輯"
                    >
                      <i class="fas fa-pencil-alt"></i></button
                    ><button
                      class="btn-icon btn-order"
                      @click="openOrderModal(p)"
                      :disabled="isPageLocked"
                      title="醫囑"
                    >
                      <i class="fas fa-notes-medical"></i></button
                    ><button
                      class="btn-icon btn-delete"
                      @click="deletePatient(p.id)"
                      :disabled="isPageLocked"
                      title="刪除"
                    >
                      <i class="fas fa-trash-alt"></i>
                    </button>
                    <div class="action-divider"></div>
                    <button
                      v-if="activeTab !== 'opd'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'opd')"
                      :disabled="isPageLocked"
                    >
                      <i class="fas fa-clinic-medical"></i> 轉門診</button
                    ><button
                      v-if="activeTab !== 'ipd'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'ipd')"
                      :disabled="isPageLocked"
                    >
                      <i class="fas fa-procedures"></i> 轉住院</button
                    ><button
                      v-if="activeTab !== 'er'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'er')"
                      :disabled="isPageLocked"
                    >
                      <i class="fas fa-ambulance"></i> 轉急診
                    </button>
                    <div class="action-divider"></div>
                    <button
                      class="btn-icon btn-history"
                      @click="openHistoryModal(p.id)"
                      title="動向歷史"
                    >
                      <i class="fas fa-history"></i>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 已刪除列表 -->
      <div v-else class="tab-content active desktop-only">
        <div class="toolbar">
          <div class="search-group">
            <input type="text" v-model="deletedSearchTerm" placeholder="搜尋已刪除病人..." />
          </div>
          <button @click="exportDeletedPatients" class="btn-export">轉出已刪除清單</button>
        </div>
        <div class="table-wrapper">
          <table class="patient-table deleted-history-table">
            <thead>
              <tr>
                <th>刪除日期</th>
                <th>姓名</th>
                <th>病歷號</th>
                <th>原狀態/原因</th>
                <th>首次透析/日期</th>
                <th>透析管路/建立日期</th>
                <th>透析院所 (原/轉出)</th>
                <th>住院/透析原因</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="h in displayedDeletedHistory" :key="h.id" class="status-deleted">
                <td>{{ formatDate(h.timestamp) }}</td>
                <td>{{ h.patientName }}</td>
                <td>{{ h.snapshot?.medicalRecordNumber || 'N/A' }}</td>
                <td>
                  <div class="status-reason-cell">
                    <span
                      class="original-status-badge"
                      :class="`status-${h.eventDetails.fromStatus}`"
                      >{{
                        { opd: '門診', ipd: '住院', er: '急診' }[h.eventDetails.fromStatus]
                      }}</span
                    >{{ h.eventDetails.reason }}
                  </div>
                </td>
                <td>{{ h.snapshot?.firstDialysisDate }}</td>
                <td>
                  <div v-if="h.snapshot?.vascAccess" class="vasc-cell">
                    <span>{{ h.snapshot.vascAccess }}</span
                    ><span class="sub-text">{{ h.snapshot.accessCreationDate }}</span>
                  </div>
                </td>
                <td>
                  <div class="hospital-cell-content">
                    <span class="hospital-source">{{ h.snapshot?.hospitalInfo?.source }}</span>
                    <div
                      v-if="
                        h.snapshot?.hospitalInfo?.source && h.snapshot?.hospitalInfo?.transferOut
                      "
                      class="hospital-divider"
                    ></div>
                    <span class="hospital-transfer-out">{{
                      h.snapshot?.hospitalInfo?.transferOut
                    }}</span>
                  </div>
                </td>
                <td>
                  <div
                    v-if="h.snapshot?.inpatientReason || h.snapshot?.dialysisReason"
                    class="reason-cell"
                  >
                    <div>
                      <span class="reason-label">住:</span> {{ h.snapshot.inpatientReason }}
                    </div>
                    <div><span class="reason-label">透:</span> {{ h.snapshot.dialysisReason }}</div>
                  </div>
                </td>

                <!-- ✨ 核心修正: 混合使用文字按鈕和圖示按鈕 -->
                <td class="col-actions">
                  <div class="action-buttons" style="justify-content: center">
                    <button
                      class="btn btn-restore"
                      @click="restorePatient(h.patientId)"
                      :disabled="isPageLocked"
                    >
                      復原
                    </button>
                    <button
                      class="btn-icon btn-history"
                      @click="openHistoryModal(h.patientId)"
                      title="動向歷史"
                    >
                      <i class="fas fa-history"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="tab-content-mobile mobile-only">
        <div v-if="activeTab !== 'deleted'" class="cards-container">
          <div
            v-for="p in displayedPatients"
            :key="p.id"
            class="patient-card"
            :class="getRowClass(p)"
          >
            <div class="card-header">
              <div class="patient-name-section">
                <span class="patient-name-text">{{ p.name }}</span
                ><span class="freq-tag-card" :class="FREQ_COLOR_MAP[p.freq || '未設定']">{{
                  p.freq || '未設定'
                }}</span>
              </div>
              <div class="card-actions-header">
                <button
                  class="btn-icon btn-history"
                  @click="openHistoryModal(p.id)"
                  title="動向歷史"
                >
                  <i class="fas fa-history"></i></button
                ><button
                  class="btn-icon btn-delete"
                  @click="deletePatient(p.id)"
                  :disabled="isPageLocked"
                  title="刪除"
                >
                  <i class="fas fa-trash-alt"></i>
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="info-grid">
                <div class="info-item">
                  <span class="label">病歷號</span
                  ><span class="value">{{ p.medicalRecordNumber }}</span>
                </div>
                <div class="info-item">
                  <span class="label">醫師</span><span class="value">{{ p.physician }}</span>
                </div>
                <div class="info-item">
                  <span class="label">模式</span><span class="value">{{ p.mode }}</span>
                </div>
                <div v-if="activeTab === 'opd'" class="info-item">
                  <span class="label">血管通路</span><span class="value">{{ p.vascAccess }}</span>
                </div>
                <div v-if="activeTab !== 'opd'" class="info-item">
                  <span class="label">首透</span
                  ><span class="value">{{
                    p.isFirstDialysis ? `✓ (${formatDate(p.firstDialysisDate)})` : '否'
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="label">異動日期</span
                  ><span class="value">{{ formatDate(p.updatedAt) }}</span>
                </div>
              </div>
              <div class="info-grid" style="margin-top: 0.5rem">
                <div class="info-item">
                  <span class="label">透析院所</span
                  ><span class="value">{{
                    p.hospitalInfo?.source || p.hospitalInfo?.transferOut
                  }}</span>
                </div>
                <div class="info-item">
                  <span class="label">狀態</span>
                  <div class="status-icon-container">
                    <i
                      v-if="p.patientStatus?.isFirstDialysis?.active"
                      class="fas fa-star status-icon-first"
                      :title="`首透: ${p.patientStatus.isFirstDialysis.date || '無日期'}`"
                    ></i
                    ><i
                      v-if="p.patientStatus?.isPaused?.active"
                      class="fas fa-pause-circle status-icon-paused"
                      :title="`暫停透析: ${p.patientStatus.isPaused.date || '無日期'}`"
                    ></i
                    ><i
                      v-if="p.patientStatus?.hasBloodDraw?.active"
                      class="fas fa-vial status-icon-blood"
                      :title="`已抽血: ${p.patientStatus.hasBloodDraw.date || '無日期'}`"
                    ></i>
                  </div>
                </div>
              </div>
              <div v-if="p.remarks" class="remarks-section">
                <span class="label">備註:</span> {{ p.remarks }}
              </div>
              <div
                v-if="p.diseases && p.diseases.length"
                class="disease-tags-container"
                v-html="generateDiseaseTags(p.diseases)"
              ></div>
            </div>
            <div class="card-footer">
              <button
                class="btn btn-edit"
                @click="openEditPatientModal(p)"
                :disabled="isPageLocked"
              >
                <i class="fas fa-pencil-alt"></i> 編輯</button
              ><button class="btn btn-order" @click="openOrderModal(p)" :disabled="isPageLocked">
                <i class="fas fa-notes-medical"></i> 醫囑</button
              ><button
                v-if="activeTab !== 'ipd'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'ipd')"
                :disabled="isPageLocked"
              >
                <i class="fas fa-procedures"></i> 轉住院</button
              ><button
                v-if="activeTab !== 'opd'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'opd')"
                :disabled="isPageLocked"
              >
                <i class="fas fa-clinic-medical"></i> 轉門診</button
              ><button
                v-if="activeTab !== 'er'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'er')"
                :disabled="isPageLocked"
              >
                <i class="fas fa-ambulance"></i> 轉急診
              </button>
            </div>
          </div>
        </div>
        <div v-else></div>
      </div>
      <div class="fixed-bottom-bar mobile-only">
        <div class="search-group global-search">
          <input
            type="text"
            v-model="globalSearchTerm"
            @keydown.enter="handleGlobalSearch(globalSearchTerm)"
            placeholder="搜尋/新增/轉移病人..."
          /><button class="btn-search" @click="handleGlobalSearch(globalSearchTerm)">執行</button>
        </div>
      </div>
    </div>
    <PatientFormModal
      :is-modal-visible="isModalVisible"
      :patient-data="editingPatient"
      :patient-type="modalType"
      @close="closeModal"
      @save="handleSavePatient"
    /><SelectionDialog
      :is-visible="isDeleteDialogVisible"
      title="請選擇刪除原因"
      :options="DELETE_REASONS"
      @select="handleDeleteReasonSelected"
      @cancel="cancelDelete"
    /><AlertDialog
      :is-visible="isAlertDialogVisible"
      :title="alertDialogTitle"
      :message="alertDialogMessage"
      @confirm="isAlertDialogVisible = false"
    /><ConfirmDialog
      :is-visible="isConfirmDialogVisible"
      :title="confirmDialogTitle"
      :message="confirmDialogMessage"
      @confirm="handleConfirm"
      @cancel="handleCancel"
    /><DialysisOrderModal
      :is-visible="isOrderModalVisible"
      :patient-data="editingPatientForOrder"
      @close="isOrderModalVisible = false"
      @save="handleSaveOrder"
    /><PatientHistoryModal
      :is-visible="isHistoryModalVisible"
      :patient-id="selectedPatientForHistory?.id"
      :patient-name="selectedPatientForHistory?.name"
      @close="isHistoryModalVisible = false"
    /><SelectionDialog
      :is-visible="isRestoreDialogVisible"
      title="請選擇復原位置"
      :options="RESTORE_OPTIONS"
      @select="handleRestoreSelected"
      @cancel="isRestoreDialogVisible = false"
    />
  </div>
</template>

<style scoped>
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
  --red-bg: #fef2f2;
  --grey-bg: #f8f9fa;
  --grey-text: #6c757d;
}
.page-container {
  padding: 10px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.page-title {
  margin-bottom: 1rem;
  color: #333;
  font-weight: bold;
  flex-shrink: 0;
}
.main-stats-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #dee2e6;
  flex-shrink: 0;
}
.source-stats {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.stat-tag {
  background-color: transparent;
  border: none;
  padding: 8px 16px;
  font-size: 1.1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 3px solid transparent;
  border-radius: 4px 4px 0 0;
  color: #495057;
}
.stat-tag .count {
  font-weight: bold;
  color: #e67700;
  margin-left: 8px;
  background-color: #f1f3f5;
  padding: 2px 6px;
  border-radius: 8px;
}
.stat-tag:hover {
  background-color: #f8f9fa;
}
.stat-tag.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
}
.stat-tag.active .count {
  background-color: var(--primary-color);
  color: white;
}
.detailed-stats {
  display: flex;
  gap: 0.5rem;
}
.stats-popover-wrapper {
  position: relative;
}
.stat-popover-trigger {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 8px 16px;
  cursor: pointer;
}
.stats-popover {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 5px;
  background-color: white;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  width: 220px;
  z-index: 10;
  padding: 0.75rem;
}
.popover-item {
  display: flex;
  justify-content: space-between;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f1f3f5;
}
.popover-item:last-child {
  border-bottom: none;
}
.popover-sub-item {
  display: flex;
  justify-content: space-between;
  padding: 0.2rem 0 0.2rem 1.5rem;
  font-size: 0.85em;
  color: #6c757d;
}
.opd-changes-popover {
  width: 250px;
}
.popover-section-title {
  font-weight: bold;
  color: #333;
  margin-top: 0.5rem;
  margin-bottom: 0.25rem;
  font-size: 0.9em;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #eee;
}
.opd-changes-popover .popover-item {
  padding: 0.25rem 0.5rem;
}
.popover-divider {
  border: none;
  border-top: 1px solid #e9ecef;
  margin: 0.5rem 0;
}
.tab-content {
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.view-header {
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 15px;
  flex-shrink: 0;
}
.controls-left {
  display: flex;
  align-items: center;
  gap: 15px;
  flex-wrap: wrap;
}
.controls-left .search-group {
  display: flex;
  align-items: center;
}
.controls-left input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
  height: 40px;
  font-size: 1rem;
}
.search-group.global-search input {
  min-width: 280px;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}
.search-group.global-search .btn-search {
  padding: 8px 15px;
  font-size: 1em;
  background-color: #17a2b8;
  color: white;
  border: 1px solid #17a2b8;
  border-radius: 5px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  cursor: pointer;
  height: 40px;
  transition: background-color 0.2s;
}
.search-group.global-search .btn-search:hover:not(:disabled) {
  background-color: #138496;
}
.search-group.list-filter input {
  min-width: 200px;
  background-color: #f8f9fa;
}
.table-wrapper {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 0;
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
.col-name {
  flex: 0 0 140px;
}
.col-mrn {
  flex: 0 0 90px;
}
.col-physician {
  flex: 0 0 90px;
}
.col-freq {
  flex: 0 0 90px;
}
.col-mode {
  flex: 0 0 80px;
}
.col-status {
  flex: 0 0 100px;
}
.col-hospital {
  flex: 0 0 160px;
}
.col-vasc-access {
  flex: 0 0 110px;
}
.col-remarks {
  flex: 1 1 auto;
  white-space: normal;
  word-break: break-all;
}
.col-updated {
  flex: 0 0 110px;
}
.col-actions {
  flex: 0 0 420px;
  justify-content: flex-start;
}
.flex-table-header .flex-cell {
  cursor: pointer;
  user-select: none;
}
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
.status-icon-container {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 1.2rem;
}
.status-icon-first {
  color: #f97316;
}
.status-icon-paused {
  color: #6b7280;
}
.status-icon-blood {
  color: #3b82f6;
}
.action-buttons {
  display: flex;
  flex-wrap: nowrap;
  gap: 0.5rem;
  align-items: center;
  width: 100%;
}
.btn {
  padding: 5px 10px;
  font-size: 0.9em;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  color: white;
  white-space: nowrap;
  transition: background-color 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5em;
}
.btn.btn-edit {
  background-color: #007bff;
  border-color: #007bff;
}
.btn.btn-order {
  background-color: #ffc107;
  color: #212529;
  border-color: #ffc107;
}
.btn.btn-transfer {
  background-color: #17a2b8;
  border-color: #17a2b8;
}
.btn.btn-edit:hover:not(:disabled) {
  background-color: #0069d9;
}
.btn.btn-order:hover:not(:disabled) {
  background-color: #e0a800;
}
.btn.btn-transfer:hover:not(:disabled) {
  background-color: #138496;
}
.btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 50%;
  font-size: 1rem;
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
.btn-icon.btn-order {
  color: #fd7e14;
}
.btn-icon.btn-transfer {
  color: #17a2b8;
}
.btn-icon.btn-history {
  color: #6c757d;
}
.btn-icon.btn-delete {
  color: #dc3545;
}
.btn-icon.btn-edit:hover:not(:disabled) {
  background-color: #e7f1ff;
}
.btn-icon.btn-order:hover:not(:disabled) {
  background-color: #fff3e0;
}
.btn-icon.btn-transfer:hover:not(:disabled) {
  background-color: #e2f7fa;
}
.btn-icon.btn-history:hover:not(:disabled) {
  background-color: #f1f3f5;
}
.btn-icon.btn-delete:hover:not(:disabled) {
  background-color: #fee2e2;
}
.action-divider {
  width: 1px;
  height: 24px;
  background-color: #dee2e6;
  margin: 0 0.25rem;
}
.flex-table-row.status-opd {
  background-color: var(--green-bg);
}
.flex-table-row.status-ipd {
  background-color: var(--red-bg);
}
.flex-table-row.status-er {
  background-color: #f3e8ff;
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
  font-weight: 600;
}
.hospital-cell-content {
  display: flex;
  align-items: center;
  gap: 0.5em;
  width: 100%;
}
.hospital-source {
  color: #6c757d;
  text-align: right;
  flex: 1;
}
.hospital-transfer-out {
  color: #17a2b8;
  font-weight: 500;
  flex: 1;
}
.hospital-divider {
  width: 1px;
  height: 1.5em;
  background-color: #ced4da;
}
.deleted-history-table th {
  text-align: center;
}
.deleted-history-table td {
  text-align: center;
  vertical-align: middle;
}
.status-reason-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.original-status-badge {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.85em;
  font-weight: bold;
  color: #fff;
}
.original-status-badge.status-opd {
  background-color: #28a745;
}
.original-status-badge.status-ipd {
  background-color: #dc3545;
}
.original-status-badge.status-er {
  background-color: #6f42c1;
}
.vasc-cell,
.reason-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.9em;
  text-align: left;
}
.vasc-cell .sub-text {
  font-size: 0.9em;
  color: #6c757d;
}
.reason-cell .reason-label {
  font-weight: bold;
  color: #495057;
  margin-right: 0.5em;
}

/* ✨ 核心修正: 為復原按鈕添加明確樣式 */
.btn-restore {
  background-color: var(--success-color);
  border-color: var(--success-color);
  color: white;
}
.btn-restore:hover:not(:disabled) {
  background-color: #15803d; /* 較深的綠色 */
}
.btn-icon.btn-restore {
  background: none;
  color: var(--success-color);
}
.btn-icon.btn-restore:hover:not(:disabled) {
  background-color: #d1fae5;
}

.mobile-only {
  display: none;
}
.desktop-only {
  display: block;
}
@media (max-width: 1200px) {
  .desktop-only .flex-table-wrapper {
    min-width: 1200px;
  }
  .desktop-only.table-wrapper {
    overflow-x: auto;
  }
}
@media (max-width: 992px) {
  .desktop-only {
    display: none !important;
  }
  .mobile-only {
    display: block !important;
  }
  .page-container {
    padding: 0;
    background-color: #f8f9fa;
    padding-bottom: 80px;
  }
  .mobile-header {
    background-color: #fff;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .mobile-header .page-title {
    text-align: center;
    margin-bottom: 1rem;
    font-size: 1.5rem;
    padding: 0;
    border: none;
  }
  .mobile-header .source-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }
  .mobile-header .stat-tag {
    width: 100%;
    text-align: center;
    padding: 8px;
    font-size: 1rem;
    border-radius: 6px;
    border: 1px solid #dee2e6;
  }
  .mobile-header .stat-tag.active {
    background-color: #28a745;
    color: white;
    border-color: #28a745;
  }
  .mobile-header .stat-tag .count {
    color: #333;
    background-color: #e9ecef;
  }
  .mobile-header .stat-tag.active .count {
    background-color: rgba(255, 255, 255, 0.2);
    color: white;
  }
  .tab-content-mobile {
    padding: 1rem;
  }
  .cards-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .patient-card {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
  }
  .patient-name-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .patient-name-text {
    font-size: 1.2rem;
    font-weight: bold;
  }
  .freq-tag-card {
    color: #fff;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 0.8em;
    font-weight: 500;
  }
  .freq-blue {
    background-color: #3498db;
  }
  .freq-green {
    background-color: #2ecc71;
  }
  .freq-orange {
    background-color: #f39c12;
  }
  .freq-purple {
    background-color: #9b59b6;
  }
  .freq-teal {
    background-color: #1abc9c;
  }
  .freq-red {
    background-color: #e74c3c;
  }
  .freq-grey {
    background-color: #95a5a6;
  }
  .card-actions-header {
    display: flex;
    align-items: center;
  }
  .card-actions-header .btn-icon {
    font-size: 1rem;
    width: 32px;
    height: 32px;
  }
  .card-body {
    padding: 1rem;
  }
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .info-item {
    display: flex;
    flex-direction: column;
  }
  .info-item .label {
    font-size: 0.8rem;
    color: #6c757d;
  }
  .info-item .value {
    font-weight: 500;
  }
  .remarks-section {
    background-color: #f8f9fa;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.9rem;
    margin: 0.75rem 0;
  }
  .remarks-section .label {
    font-weight: bold;
    margin-right: 0.5rem;
  }
  .card-footer {
    padding: 0.75rem 1rem;
    background-color: #f8f9fa;
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .card-footer .btn {
    flex-grow: 1;
    padding: 0.6rem 0.5rem;
  }
  .fixed-bottom-bar {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background-color: #fff;
    padding: 1rem;
    box-shadow: 0 -2px 10px rgba(0, 0, 0, 0.1);
    z-index: 100;
  }
  .fixed-bottom-bar .search-group {
    display: flex;
    width: 100%;
  }
  .fixed-bottom-bar .search-group input {
    flex-grow: 1;
    min-width: 0;
    border: 1px solid #ccc;
    border-radius: 6px 0 0 6px;
    height: 40px;
    padding: 8px;
    font-size: 1rem;
  }
  .fixed-bottom-bar .search-group .btn-search {
    flex-shrink: 0;
    height: 40px;
    padding: 8px 15px;
    font-size: 1rem;
    background-color: #17a2b8;
    color: white;
    border: 1px solid #17a2b8;
    border-radius: 0 6px 6px 0;
    cursor: pointer;
  }
}
</style>
