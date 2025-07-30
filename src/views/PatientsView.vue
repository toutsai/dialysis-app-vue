<!-- 檔案路徑: src/views/PatientsView.vue (流程優化版) -->
<script setup>
import { ref, onMounted, computed } from 'vue'
import { doc, getDoc, updateDoc } from 'firebase/firestore' // ✨ 1. 引入必要的 firestore 函式
import { db } from '@/composables/useFirebase.js' // ✨ 2. 引入 db 實例

import {
  fetchAllPatients as optimizedFetchAllPatients,
  updatePatient as optimizedUpdatePatient,
  savePatient as optimizedSavePatient,
  savePatientHistory as optimizedSavePatientHistory,
  saveDialysisOrderHistory as optimizedSaveDialysisOrderHistory,
} from '@/services/optimizedApiService.js'

// ✨ 3. 不再使用這個函式，因為它的行為不符合我們的預期 (只清除了每日排程，未動總表)
// import { removePatientFromBaseSchedule } from '@/services/baseScheduleService.js'

import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'
import AlertDialog from '@/components/AlertDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DialysisOrderModal from '@/components/DialysisOrderModal.vue'
import PatientHistoryModal from '@/components/PatientHistoryModal.vue'
import { useAuth } from '@/composables/useAuth.js'
import { generateAutoNote } from '@/utils/scheduleUtils.js'
import * as XLSX from 'xlsx'
import { useGlobalNotifier } from '@/composables/useGlobalNotifier.js'

const allPatients = ref([])
const activeTab = ref('er')
const currentSort = ref({ column: 'createdAt', order: 'desc' })

// --- 舊的搜尋框 ref 改為列表內篩選 ---
const erListFilter = ref('')
const ipdListFilter = ref('')
const opdListFilter = ref('')
const deletedSearchTerm = ref('') // 已刪除列表的搜尋保持不變

// ✨ 新增: 全局搜尋/新增/復原功能的輸入框 ref
const globalSearchTerm = ref('')

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
    searchTerm = erListFilter.value.toLowerCase()
  } else if (activeTab.value === 'ipd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'ipd' && !p.isDeleted)
    searchTerm = ipdListFilter.value.toLowerCase()
  } else if (activeTab.value === 'opd') {
    patientsToDisplay = allPatients.value.filter((p) => p.status === 'opd' && !p.isDeleted)
    searchTerm = opdListFilter.value.toLowerCase()
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

// ==========================================================
// 核心修正：新的、真正能修改總表的函式
// ==========================================================
/**
 * 直接從 base_schedules/MASTER_SCHEDULE 文件中移除指定病人的排班規則。
 * 這是觸發後端自動同步的唯一正確方法。
 * @param {string} patientId 要移除的病人 ID
 */
async function removeRuleFromMasterSchedule(patientId) {
  if (!patientId) {
    console.error('[removeRuleFromMasterSchedule] 無效的 patientId')
    return
  }
  const masterScheduleRef = doc(db, 'base_schedules', 'MASTER_SCHEDULE')
  try {
    const docSnap = await getDoc(masterScheduleRef)
    if (!docSnap.exists()) {
      console.warn('[removeRuleFromMasterSchedule] MASTER_SCHEDULE 文件不存在，無需操作。')
      return
    }
    const scheduleData = docSnap.data()
    // 確保 schedule 屬性存在
    const masterRules = scheduleData.schedule || {}

    // 檢查病人是否真的在總表規則中
    if (masterRules[patientId]) {
      // 從物件中刪除該病人的鍵值對
      delete masterRules[patientId]
      // 將修改後、不含該病人的物件寫回資料庫
      await updateDoc(masterScheduleRef, {
        schedule: masterRules,
      })
      console.log(`✅ [removeRuleFromMasterSchedule] 已成功從總表中移除病人 ${patientId} 的規則。`)
    } else {
      console.log(`[removeRuleFromMasterSchedule] 病人 ${patientId} 不在總表規則中，無需移除。`)
    }
  } catch (error) {
    console.error(`❌ [removeRuleFromMasterSchedule] 從總表移除病人規則時失敗:`, error)
    // 拋出錯誤，讓呼叫它的函式可以捕獲並處理
    throw new Error('從總床位表移除規則失敗，請檢查權限或網路。')
  }
}

// ==========================================================
// 全局智慧搜尋與新增/復原功能
// ==========================================================

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

  let foundPatient = null

  if (searchResults.length > 1) {
    const patientList = searchResults
      .map((p) => `- ${p.name} (${p.medicalRecordNumber})`)
      .slice(0, 10)
      .join('\n')

    showAlert(
      '找到多位病人',
      `符合 "${query}" 的病人不只一位，請輸入更完整的姓名或病歷號以精確查找。\n\n找到的病人列表：\n${patientList}`,
    )
    return
  } else if (searchResults.length === 1) {
    foundPatient = searchResults[0]
  }

  if (foundPatient) {
    const statusMap = { ipd: '住院', opd: '門診', er: '急診' }

    if (foundPatient.isDeleted) {
      const targetStatusText = statusMap[activeTab.value] || '列表'
      showConfirm(
        '找到已刪除病人',
        `病人 "${foundPatient.name}" (${foundPatient.medicalRecordNumber}) 已被刪除 (原因: ${foundPatient.deleteReason || '未知'})。\n\n您是否要將其復原到目前的「${targetStatusText}」清單中？`,
        () => {
          restoreAndTransferPatient(foundPatient.id, activeTab.value)
        },
      )
    } else {
      const currentStatusText = statusMap[foundPatient.status] || '未知'
      showAlert(
        '病人已存在',
        `病人 "${foundPatient.name}" (${foundPatient.medicalRecordNumber}) 目前已在「${currentStatusText}」清單中。`,
      )
    }
  } else {
    console.log(`找不到病人 "${searchTerm}"，直接開啟新增視窗。`)
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

async function restoreAndTransferPatient(patientId, targetStatus) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }

  try {
    const patient = allPatients.value.find((p) => p.id === patientId)
    if (!patient) {
      showAlert('錯誤', '找不到該病人資料。')
      return
    }

    const statusMap = { ipd: '住院', opd: '門診', er: '急診' }
    const targetStatusText = statusMap[targetStatus] || '未知'

    await optimizedUpdatePatient(patientId, {
      isDeleted: false,
      status: targetStatus,
      originalStatus: patient.originalStatus,
      deleteReason: null,
      deletedAt: null,
    })

    const historyEntry = {
      patientId: patientId,
      patientName: patient.name,
      timestamp: new Date().toISOString(),
      eventType: 'RESTORE_AND_TRANSFER',
      eventDetails: {
        restoredTo: targetStatus,
        fromReason: patient.deleteReason,
      },
    }
    await optimizedSavePatientHistory(historyEntry)

    // ✨ 核心修正：呼叫新的、正確的函式
    await removeRuleFromMasterSchedule(patientId)

    await fetchAllPatients()
    createGlobalNotification(`復原病人：${patient.name} 至 ${targetStatusText}`, 'patient')
    showAlert(
      '復原成功',
      `${patient.name} 已成功復原並移至「${targetStatusText}」清單。如需排班，請至總床位表設定。`,
    )
    globalSearchTerm.value = ''
  } catch (err) {
    console.error('復原並轉移失敗:', err)
    showAlert('操作失敗', '復原病人時發生錯誤！')
  }
}

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
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }

  // --- 編輯現有病人 ---
  if (patientData.id) {
    const originalPatient = editingPatient.value
    const wasDiscontinuedBefore = originalPatient ? originalPatient.isDiscontinued : false
    const isNowDiscontinued = patientData.isDiscontinued

    // 處理中止透析的特殊情況
    if (!wasDiscontinuedBefore && isNowDiscontinued) {
      showConfirm(
        '確認中止透析',
        `您確定要將「${patientData.name}」標記為中止透析，並從總床位表中移除其排班規則嗎？此操作會自動清除所有未來排程。`,
        async () => {
          try {
            closeModal()
            const updateData = {
              isDiscontinued: true,
              discontinuedDate:
                patientData.discontinuedDate || new Date().toISOString().split('T')[0],
            }
            await optimizedUpdatePatient(patientData.id, updateData)
            // ✨ 核心修正：呼叫新的、正確的函式
            await removeRuleFromMasterSchedule(patientData.id)
            await fetchAllPatients()
            createGlobalNotification(`中止透析：${patientData.name}`, 'patient')
          } catch (err) {
            console.error('中止透析操作失敗:', err)
            showAlert('操作失敗', err.message || '中止透析操作失敗！')
          }
        },
      )
      return
    }

    // 一般編輯儲存
    try {
      const dataToUpdate = { ...patientData }
      delete dataToUpdate.id
      await optimizedUpdatePatient(patientData.id, dataToUpdate)
      closeModal()
      await fetchAllPatients()
      createGlobalNotification(`編輯病人：${patientData.name}`, 'patient')
    } catch (err) {
      console.error('更新病人資料失敗:', err)
      showAlert('操作失敗', '更新病人資料失敗！')
    }
    return
  }

  // --- 新增病人 ---
  if (!patientData.medicalRecordNumber || !patientData.medicalRecordNumber.trim()) {
    showAlert('資料不完整', '請務必填寫病歷號。')
    return
  }

  const existingPatient = allPatients.value.find(
    (p) => p.medicalRecordNumber === patientData.medicalRecordNumber,
  )

  if (existingPatient) {
    // 處理病歷號重複
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
    // 正常新增
    try {
      const dataToCreate = { ...patientData }
      dataToCreate.createdAt = new Date().toISOString()
      dataToCreate.isDeleted = false
      dataToCreate.status = modalType.value

      const savedPatient = await optimizedSavePatient(dataToCreate)

      const historyEntry = {
        patientId: savedPatient.id,
        patientName: dataToCreate.name,
        timestamp: new Date().toISOString(),
        eventType: 'CREATE',
        eventDetails: { status: modalType.value },
      }

      await optimizedSavePatientHistory(historyEntry)
      closeModal()
      await fetchAllPatients()

      const statusText =
        modalType.value === 'ipd' ? '住院' : modalType.value === 'er' ? '急診' : '門診'
      createGlobalNotification(`新增病人：${dataToCreate.name} (${statusText})`, 'patient')
    } catch (err) {
      console.error('新增病人失敗:', err)
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

    await optimizedSavePatientHistory(historyEntry)

    closeModal()
    await fetchAllPatients()

    const statusText =
      modalType.value === 'ipd' ? '住院' : modalType.value === 'er' ? '急診' : '門診'
    createGlobalNotification(`轉移病人：${newPatientData.name} 至 ${statusText}`, 'patient')

    showAlert('操作成功', `病人 ${newPatientData.name} 已成功更新並轉移至 ${statusText} 清單。`)
  } catch (err) {
    console.error('轉移更新病人失敗:', err)
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

  const patientName = allPatients.value.find((p) => p.id === patientId)?.name || '此病人'
  const targetStatusMap = { ipd: '住院', opd: '門診', er: '急診' }
  const targetStatusText = targetStatusMap[newStatus] || '未知狀態'

  showConfirm(
    `確認轉為${targetStatusText}`,
    `您確定要將「${patientName}」轉為${targetStatusText}嗎？\n\n💡 如果該病人已排床，建議完成轉移後到「門住總床位表」檢查並調整排床。`,
    async () => {
      try {
        const originalPatientData = allPatients.value.find((p) => p.id === patientId)

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

        await optimizedSavePatientHistory(historyEntry)
        await fetchAllPatients()

        createGlobalNotification(`轉移病人：${patientName} 至 ${targetStatusText}`, 'patient')

        showAlert(
          '轉移成功',
          `${patientName} 已成功轉至${targetStatusText}。\n\n📋 如有排床，請到「門住總床位表」確認自動標籤是否正確。`,
        )
      } catch (err) {
        console.error('轉床失敗:', err)
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

    const patientNameForNotification = patient.name
    const patientIdForActions = patientToDeleteId.value

    // 1. 將病人文件標記為已刪除
    const deletedAt = new Date().toISOString()
    await optimizedUpdatePatient(patientIdForActions, {
      isDeleted: true,
      originalStatus: patient.status,
      deleteReason: reason,
      deletedAt: deletedAt,
    })

    // 2. 儲存操作歷史
    const historyEntry = {
      patientId: patientIdForActions,
      patientName: patientNameForNotification,
      timestamp: deletedAt,
      eventType: 'DELETE',
      eventDetails: { reason: reason, fromStatus: patient.status },
    }
    await optimizedSavePatientHistory(historyEntry)

    // 3. ✨ 核心修正：呼叫新的、正確的函式來修改總表，觸發後端同步
    await removeRuleFromMasterSchedule(patientIdForActions)

    // 4. 刷新前端列表
    await fetchAllPatients()

    // 5. 發送通知
    createGlobalNotification(`刪除病人：${patientNameForNotification} (${reason})`, 'patient')
    showAlert(
      '刪除成功',
      `${patientNameForNotification} 已被刪除，其在「門急住床位總表」中的規則也已移除。未來排程將由系統自動更新。`,
    )
  } catch (err) {
    console.error('刪除病人流程失敗:', err)
    showAlert('操作失敗', err.message || '刪除病人時發生錯誤！')
  } finally {
    isDeleteDialogVisible.value = false
    patientToDeleteId.value = null
  }
}

async function restorePatient(patientId) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }

  try {
    const patient = allPatients.value.find((p) => p.id === patientId)
    if (!patient) {
      showAlert('錯誤', '找不到該病人資料。')
      return
    }
    const newStatus = patient.originalStatus || 'opd'
    const statusText = newStatus === 'ipd' ? '住院' : newStatus === 'er' ? '急診' : '門診'

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
      eventDetails: { restoredTo: newStatus, fromReason: patient.deleteReason },
    }
    await optimizedSavePatientHistory(historyEntry)

    // ✨ 核心修正：復原病人時，也需要確保其規則已從總表移除，讓他回到乾淨的未排班狀態。
    await removeRuleFromMasterSchedule(patientId)

    await fetchAllPatients()
    createGlobalNotification(`復原病人：${patient.name} 至 ${statusText}`, 'patient')
    showAlert(
      '復原成功',
      `${patient.name} 已復原至 ${statusText} 清單，請至「門住總床位表」為其重新排班。`,
    )
  } catch (err) {
    console.error('復原失敗:', err)
    showAlert('操作失敗', '復原失敗！')
  }
}

function openAddPatientModal(type) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  editingPatient.value = { diseases: [] }
  modalType.value = type
  isModalVisible.value = true
}

function openEditPatientModal(patient) {
  if (isPageLocked.value) {
    showAlert('操作失敗', '操作被鎖定：權限不足。')
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
    showAlert('操作失敗', '操作被鎖定：權限不足。')
    return
  }
  patientToDeleteId.value = patientId
  isDeleteDialogVisible.value = true
}

async function fetchAllPatients() {
  try {
    console.log('🔄 [PatientsView] 開始載入患者資料...')
    allPatients.value = await optimizedFetchAllPatients()
    console.log(`✅ [PatientsView] 患者資料載入完成，共 ${allPatients.value.length} 位患者`)
  } catch (err) {
    console.error('❌ [PatientsView] 讀取病人資料失敗:', err)
    showAlert('讀取失敗', '讀取病人資料失敗！')
  }
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
}

function openOrderModal(patient) {
  editingPatientForOrder.value = JSON.parse(JSON.stringify(patient))
  isOrderModalVisible.value = true
}

async function handleSaveOrder(orderDataFromModal) {
  if (!editingPatientForOrder.value || !editingPatientForOrder.value.id) {
    showAlert('儲存失敗', '找不到有效的病人資訊，請重新操作。')
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

  const historyRecord = {
    patientId: patientId,
    patientName: patientName,
    orders: cleanOrders,
    updatedAt: updatedAt,
    createdAt: updatedAt,
    operationType: 'UPDATE',
  }

  try {
    console.log('💾 [PatientsView] 儲存透析醫囑...')
    await Promise.all([
      optimizedUpdatePatient(patientId, { dialysisOrders: cleanOrders }),
      optimizedSaveDialysisOrderHistory(historyRecord),
    ])
    console.log('✅ [PatientsView] 透析醫囑儲存成功')

    isOrderModalVisible.value = false
    await fetchAllPatients()

    createGlobalNotification(`更新醫囑：${patientName}`, 'patient')
  } catch (error) {
    console.error('❌ [PatientsView] 儲存醫囑失敗:', error)
    showAlert('操作失敗', `儲存醫囑時發生錯誤: ${error.message}`)
  }
}

onMounted(() => {
  console.log('🚀 [PatientsView] 組件已掛載，開始初始化...')
  fetchAllPatients()
})
</script>

<template>
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

      <!-- 主要內容區 (急診, 住院, 門診) -->
      <div v-if="activeTab !== 'deleted'" class="tab-content active">
        <!-- 頂部控制列 -->
        <div class="view-header">
          <div class="controls-left">
            <div class="search-group global-search">
              <input
                type="text"
                v-model="globalSearchTerm"
                @keydown.enter="handleGlobalSearch(globalSearchTerm)"
                placeholder="搜尋/新增病人..."
              />
              <button class="btn-search" @click="handleGlobalSearch(globalSearchTerm)">搜尋</button>
            </div>
            <div class="search-group list-filter">
              <input
                v-if="activeTab === 'er'"
                type="text"
                v-model="erListFilter"
                placeholder="篩選列表..."
              />
              <input
                v-if="activeTab === 'ipd'"
                type="text"
                v-model="ipdListFilter"
                placeholder="篩選列表..."
              />
              <input
                v-if="activeTab === 'opd'"
                type="text"
                v-model="opdListFilter"
                placeholder="篩選列表..."
              />
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

        <!-- 桌機版 Flex 表格 -->
        <div class="table-wrapper desktop-only">
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
                {{
                  activeTab === 'opd' ? '收案醫師' : activeTab === 'ipd' ? '會診醫師' : '開單醫師'
                }}
                <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
              </div>
              <div class="flex-cell col-freq" @click="handleSort('freq')">
                頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
              </div>
              <div class="flex-cell col-mode">模式</div>
              <div v-if="activeTab === 'opd'" class="flex-cell col-vasc-access">血管通路</div>
              <template v-else>
                <div class="flex-cell col-first-dialysis">首透</div>
                <div class="flex-cell col-discontinued">中止</div>
              </template>
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
                <div v-if="activeTab === 'opd'" class="flex-cell col-vasc-access">
                  {{ p.vascAccess }}
                </div>
                <template v-else>
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
                </template>
                <div class="flex-cell col-remarks">{{ p.remarks }}</div>
                <div class="flex-cell col-created">{{ formatDate(p.createdAt) }}</div>
                <div class="flex-cell col-actions">
                  <div class="action-buttons">
                    <button
                      class="btn btn-edit"
                      @click="openEditPatientModal(p)"
                      :disabled="isPageLocked"
                    >
                      編輯
                    </button>
                    <button
                      class="btn btn-order"
                      @click="openOrderModal(p)"
                      :disabled="isPageLocked"
                    >
                      醫囑
                    </button>
                    <button
                      v-if="activeTab !== 'ipd'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'ipd')"
                      :disabled="isPageLocked"
                    >
                      轉住院
                    </button>
                    <button
                      v-if="activeTab !== 'opd'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'opd')"
                      :disabled="isPageLocked"
                    >
                      轉門診
                    </button>
                    <button
                      v-if="activeTab !== 'er'"
                      class="btn btn-transfer"
                      @click="transferPatient(p.id, 'er')"
                      :disabled="isPageLocked"
                    >
                      轉急診
                    </button>
                    <div class="action-divider"></div>
                    <div class="icon-buttons">
                      <button
                        class="btn-icon btn-history"
                        @click="openHistoryModal(p)"
                        title="動向歷史"
                      >
                        🕒
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

        <!-- 手機版卡片列表 -->
        <div class="cards-container mobile-only">
          <div
            v-for="p in displayedPatients"
            :key="p.id"
            class="patient-card"
            :class="getRowClass(p)"
          >
            <div class="card-header">
              <div class="patient-name-section">
                <span class="patient-name-text">{{ p.name }}</span>
                <span class="freq-tag-card" :class="FREQ_COLOR_MAP[p.freq || '未設定']">{{
                  p.freq || '未設定'
                }}</span>
              </div>
              <div class="card-actions-header">
                <button class="btn-icon btn-history" @click="openHistoryModal(p)" title="動向歷史">
                  🕒
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
                  <span class="label">新增日期</span
                  ><span class="value">{{ formatDate(p.createdAt) }}</span>
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
                編輯
              </button>
              <button class="btn btn-order" @click="openOrderModal(p)" :disabled="isPageLocked">
                醫囑
              </button>
              <button
                v-if="activeTab !== 'ipd'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'ipd')"
                :disabled="isPageLocked"
              >
                轉住院
              </button>
              <button
                v-if="activeTab !== 'opd'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'opd')"
                :disabled="isPageLocked"
              >
                轉門診
              </button>
              <button
                v-if="activeTab !== 'er'"
                class="btn btn-transfer"
                @click="transferPatient(p.id, 'er')"
                :disabled="isPageLocked"
              >
                轉急診
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 已刪除病人表格 -->
      <div v-else class="tab-content active">
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

    <!-- Modal 組件 (保持不變) -->
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
/* ================================== */
/*         通用及桌面版樣式            */
/* ================================== */
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
  padding: 1.5rem;
}
.page-title {
  margin-bottom: 1.5rem;
  color: #333;
  font-weight: bold;
}
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
  background-color: var(--primary-color);
  color: white;
  border: 1px solid var(--primary-color);
  border-radius: 5px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  cursor: pointer;
  height: 40px;
  transition: background-color 0.2s;
}
.search-group.global-search .btn-search:hover:not(:disabled) {
  background-color: #00457c;
}
.search-group.list-filter input {
  min-width: 200px;
  background-color: #f8f9fa;
}
.controls-left input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(0, 90, 156, 0.1);
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
  flex: 0 0 400px;
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
.btn.btn-edit {
  background-color: #007bff;
}
.btn.btn-edit:hover:not(:disabled) {
  background-color: #0056b3;
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
.action-divider {
  width: 1px;
  height: 24px;
  background-color: #dee2e6;
  margin: 0 0.25rem;
}
.icon-buttons {
  display: flex;
  gap: 0.25rem;
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
.btn-icon.btn-delete {
  color: #dc3545;
}
.btn-icon.btn-history {
  color: #6c757d;
}
.btn-icon.btn-delete:hover:not(:disabled) {
  background-color: #fee2e2;
}
.btn-icon.btn-history:hover:not(:disabled) {
  background-color: #f1f3f5;
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
.is-locked .flex-table-wrapper {
  pointer-events: none;
  opacity: 0.65;
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
  cursor: pointer;
  user-select: none;
  font-weight: 600;
}
.patient-table th:hover {
  background-color: #e8e8e8;
}

/* ================================== */
/* ‼️        新增的響應式樣式        ‼️ */
/* ================================== */

/* 預設隱藏手機版卡片，顯示桌面版表格 */
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
  /* 螢幕小於 992px 時，隱藏表格，顯示卡片 */
  .desktop-only {
    display: none;
  }
  .mobile-only {
    display: block;
  }

  .page-container {
    padding: 0;
    background-color: #f8f9fa;
  }
  .page-title {
    padding: 1rem;
    margin-bottom: 0;
    border-bottom: 1px solid #dee2e6;
    background-color: #fff;
  }
  .tabs {
    background-color: #fff;
    margin-bottom: 0;
    padding: 0 1rem;
  }
  .tab-content {
    padding: 1rem;
  }

  .view-header {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .controls-left {
    flex-direction: column;
    align-items: stretch;
    gap: 1rem;
  }
  .search-group input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
  }
  .search-group.global-search {
    display: flex;
  }
  .search-group.global-search input {
    flex-grow: 1;
    border-right: none;
  }
  .search-group.global-search .btn-search {
    flex-shrink: 0;
  }
  .stats-summary {
    flex-direction: column;
    align-items: flex-start;
  }

  /* 卡片列表容器 */
  .cards-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* 單張卡片 */
  .patient-card {
    background-color: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    overflow: hidden;
  }
  .patient-card.status-opd {
    border-top: 4px solid var(--green-bg);
  }
  .patient-card.status-ipd {
    border-top: 4px solid var(--red-bg);
  }
  .patient-card.status-er {
    border-top: 4px solid var(--purple-bg);
  }
  .patient-card.status-biweekly {
    border-top: 4px solid var(--orange-bg);
  }
  .patient-card.status-discontinued {
    text-decoration: line-through;
    opacity: 0.8;
  }
  .patient-card.status-discontinued button {
    text-decoration: none;
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
  .card-actions-header {
    display: flex;
    align-items: center;
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
  }

  /* 已刪除頁面在手機上的調整 */
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
  .toolbar input {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }
  .toolbar .btn-export {
    width: 100%;
  }
}
</style>
