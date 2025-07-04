<script setup>
import { ref, onMounted, computed } from 'vue'
import { deleteField, where } from 'firebase/firestore'
import ApiManager from '@/services/api_manager.js'
import PatientFormModal from '@/components/PatientFormModal.vue'
import SelectionDialog from '@/components/SelectionDialog.vue'

const patientApi = ApiManager('patients')
const schedulesApi = ApiManager('schedules')

const allPatients = ref([])
const activeTab = ref('ipd')
const currentSort = ref({ column: 'createdAt', order: 'desc' })
const deletedSearchTerm = ref('')
const isModalVisible = ref(false)
const editingPatient = ref(null)
const modalType = ref('ipd')
const isDeleteDialogVisible = ref(false)
const patientToDeleteId = ref(null)
const DELETE_REASONS = [
  { value: '出院', text: '出院' },
  { value: '死亡', text: '死亡' },
  { value: '轉外院透析', text: '轉外院透析' },
  { value: '轉PD', text: '轉PD' },
  { value: '腎臟移植', text: '腎臟移植' },
  { value: '作廢', text: '作廢' },
]

const displayedPatients = computed(() => {
  let patients
  if (activeTab.value === 'deleted') {
    patients = allPatients.value.filter((p) => p.isDeleted)
    if (deletedSearchTerm.value) {
      const term = deletedSearchTerm.value.toLowerCase()
      patients = patients.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(term)) ||
          (p.medicalRecordNumber && p.medicalRecordNumber.includes(term)),
      )
    }
  } else {
    patients = allPatients.value.filter((p) => p.status === activeTab.value && !p.isDeleted)
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

async function fetchAllPatients() {
  try {
    allPatients.value = await patientApi.fetchAll()
  } catch (error) {
    console.error('讀取病人資料失敗:', error)
    alert('讀取病人資料失敗！')
  }
}

async function clearPatientTemporaryScheduleData(patientId, mode = 'clear') {
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
      const shiftIds = Object.keys(newSchedule)
      for (const shiftId of shiftIds) {
        if (newSchedule[shiftId]?.patientId === patientId) {
          isModified = true
          if (mode === 'delete') {
            delete newSchedule[shiftId]
            console.log(`在 ${doc.date} 的排程中，準備刪除病人 ${patientId} 的班次 ${shiftId}`)
          } else {
            newSchedule[shiftId].manualNote = ''
            newSchedule[shiftId].nurseTeam = null
            newSchedule[shiftId].nurseTeamIn = null
            newSchedule[shiftId].nurseTeamOut = null
            console.log(`在 ${doc.date} 的排程中，準備清理病人 ${patientId} 的班次 ${shiftId}`)
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
  } catch (error) {
    const actionText = mode === 'delete' ? '刪除' : '清理'
    console.error(`為病人 ${patientId} ${actionText}排班資料時發生錯誤:`, error)
    alert(`為病人${actionText}排班資料時發生錯誤，請手動檢查排班表！`)
  }
}

async function handleSavePatient(patientData) {
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
  } catch (error) {
    console.error('儲存病人資料失敗:', error)
    alert('儲存病人資料失敗！')
  }
}

async function transferPatient(patientId, newStatus) {
  const patientName = allPatients.value.find((p) => p.id === patientId)?.name || '此病人'
  const targetStatus = newStatus === 'ipd' ? '住院' : '門診'
  if (
    confirm(
      `確定要將 ${patientName} 轉為${targetStatus}嗎？\n\n注意：此操作將會清除該病人在未來排程中的所有手動備註和護理師分配。`,
    )
  ) {
    try {
      await patientApi.update(patientId, { status: newStatus })
      await clearPatientTemporaryScheduleData(patientId, 'clear')
      await fetchAllPatients()
    } catch (error) {
      alert('轉床失敗！')
    }
  }
}

async function handleDeleteReasonSelected(reason) {
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
  } catch (error) {
    alert('刪除失敗！')
  } finally {
    isDeleteDialogVisible.value = false
    patientToDeleteId.value = null
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

function openAddPatientModal(type) {
  editingPatient.value = { diseases: [] }
  modalType.value = type
  isModalVisible.value = true
}

function openEditPatientModal(patient) {
  editingPatient.value = patient
  modalType.value = patient.status
  isModalVisible.value = true
}

function closeModal() {
  isModalVisible.value = false
  editingPatient.value = null
}

function deletePatient(patientId) {
  patientToDeleteId.value = patientId
  isDeleteDialogVisible.value = true
}

function cancelDelete() {
  isDeleteDialogVisible.value = false
  patientToDeleteId.value = null
}

async function restorePatient(patientId) {
  try {
    const patient = allPatients.value.find((p) => p.id === patientId)
    await patientApi.update(patientId, {
      isDeleted: false,
      status: patient.originalStatus || 'opd',
      deleteReason: null,
      deletedAt: null,
    })
    await fetchAllPatients()
  } catch (error) {
    alert('復原失敗！')
  }
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
  if (p.status === 'ipd') return 'status-ipd'
  if (p.status === 'opd') return 'status-opd'
  return ''
}

function generateDiseaseTags(diseases) {
  if (!diseases || diseases.length === 0) return ''
  return diseases.map((tag) => `<span class="disease-tag">${tag}</span>`).join('')
}

onMounted(() => {
  fetchAllPatients()
})
</script>

<template>
  <div>
    <div class="page-container">
      <h1 class="page-title">透析病人管理系統</h1>
      <div class="tabs">
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

      <div v-if="activeTab === 'ipd'" class="tab-content active">
        <div class="toolbar"><button @click="openAddPatientModal('ipd')">新增住院病人</button></div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-name">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-mrn">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th @click="handleSort('physician')">
                  會診醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
                </th>
                <th @click="handleSort('freq')">
                  頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
                </th>
                <th>模式</th>
                <th>首透</th>
                <th>中止</th>
                <th>備註</th>
                <th @click="handleSort('createdAt')">
                  新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
                </th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-name">
                  {{ p.name }} <span v-html="generateDiseaseTags(p.diseases)"></span>
                </td>
                <td class="col-mrn">{{ p.medicalRecordNumber }}</td>
                <td>{{ p.physician }}</td>
                <td>{{ p.freq }}</td>
                <td>{{ p.mode }}</td>
                <td>{{ p.isFirstDialysis ? '✓' : '' }}</td>
                <td>{{ p.isDiscontinued ? '✓' : '' }}</td>
                <td>{{ p.remarks }}</td>
                <td>{{ formatDate(p.createdAt) }}</td>
                <td class="col-actions action-buttons">
                  <button class="btn-edit" @click="openEditPatientModal(p)">編輯</button>
                  <button class="btn-transfer" @click="transferPatient(p.id, 'opd')">轉門診</button>
                  <button class="btn-delete" @click="deletePatient(p.id)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="activeTab === 'opd'" class="tab-content active">
        <div class="toolbar"><button @click="openAddPatientModal('opd')">新增門診病人</button></div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-name">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-mrn">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th @click="handleSort('physician')">
                  收案醫師 <span class="sort-indicator">{{ getSortIndicator('physician') }}</span>
                </th>
                <th @click="handleSort('freq')">
                  頻率 <span class="sort-indicator">{{ getSortIndicator('freq') }}</span>
                </th>
                <th>模式</th>
                <th>血管通路</th>
                <th>備註</th>
                <th @click="handleSort('createdAt')">
                  新增日期 <span class="sort-indicator">{{ getSortIndicator('createdAt') }}</span>
                </th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-name">
                  {{ p.name }} <span v-html="generateDiseaseTags(p.diseases)"></span>
                </td>
                <td class="col-mrn">{{ p.medicalRecordNumber }}</td>
                <td>{{ p.physician }}</td>
                <td>{{ p.freq }}</td>
                <td>{{ p.mode }}</td>
                <td>{{ p.vascAccess }}</td>
                <td>{{ p.remarks }}</td>
                <td>{{ formatDate(p.createdAt) }}</td>
                <td class="col-actions action-buttons">
                  <button class="btn-edit" @click="openEditPatientModal(p)">編輯</button>
                  <button class="btn-transfer" @click="transferPatient(p.id, 'ipd')">轉住院</button>
                  <button class="btn-delete" @click="deletePatient(p.id)">刪除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-if="activeTab === 'deleted'" class="tab-content active">
        <div class="toolbar">
          <div class="search-group">
            <input type="text" v-model="deletedSearchTerm" placeholder="搜尋已刪除病人..." />
          </div>
          <button>轉出已刪除清單</button>
        </div>
        <div class="table-wrapper">
          <table class="patient-table">
            <thead>
              <tr>
                <th @click="handleSort('name')" class="col-name">
                  姓名 <span class="sort-indicator">{{ getSortIndicator('name') }}</span>
                </th>
                <th @click="handleSort('medicalRecordNumber')" class="col-mrn">
                  病歷號
                  <span class="sort-indicator">{{ getSortIndicator('medicalRecordNumber') }}</span>
                </th>
                <th>原狀態</th>
                <th>刪除原因</th>
                <th>備註</th>
                <th @click="handleSort('deletedAt')">
                  刪除日期 <span class="sort-indicator">{{ getSortIndicator('deletedAt') }}</span>
                </th>
                <th class="col-actions">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in displayedPatients" :key="p.id" :class="getRowClass(p)">
                <td class="col-name">{{ p.name }}</td>
                <td class="col-mrn">{{ p.medicalRecordNumber }}</td>
                <td>{{ p.originalStatus === 'ipd' ? '住院' : '門診' }}</td>
                <td>{{ p.deleteReason }}</td>
                <td>{{ p.remarks }}</td>
                <td>{{ formatDate(p.deletedAt) }}</td>
                <td class="col-actions action-buttons">
                  <button class="btn-restore" @click="restorePatient(p.id)">復原</button>
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
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 15px;
}
.toolbar button {
  padding: 8px 15px;
  font-size: 1em;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
}
.toolbar button:hover {
  background-color: #0056b3;
}
.toolbar .search-group {
  display: flex;
  gap: 5px;
}
.toolbar input {
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 5px;
}
.patient-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 關鍵！改為 fixed 佈局 */
}
.patient-table th,
.patient-table td {
  border: 1px solid #ddd;
  padding: 10px 12px;
  text-align: left;
  vertical-align: middle;
  overflow: hidden;
  text-overflow: ellipsis;
}
.patient-table td:first-child {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
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
  max-height: 70vh;
  overflow-y: auto;
}

/* 為關鍵欄位定義固定寬度 */
.col-name {
  width: 180px;
}
.col-mrn {
  width: 120px;
}
.col-actions {
  width: 220px;
  text-align: center;
}
</style>
