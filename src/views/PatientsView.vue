<!-- 檔案路徑: src/views/PatientsView.vue (語法修正後的 <template>) -->
<template>
</template>

<style>
        :root {
            --green-bg: #e8f5e9; --green-text: #2e7d32;
            --blue-bg: #e3f2fd;  --blue-text: #1565c0;
            --orange-bg: #fff3e0; --orange-text: #ef6c00;
            --grey-bg: #f5f5f5; --grey-text: #616161;
            --red-text: #c62828;
            --primary-color: #007bff;
            --success-color: #28a745;
            --warning-color: #ffc107;
            --danger-color: #dc3545;
            --info-color: #17a2b8;
        }
        body { font-family: 'Segoe UI', 'Microsoft JhengHei', sans-serif; background-color: #f9f9f9; margin: 0; padding: 20px; }
        .container { max-width: 1400px; margin: 0 auto; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .tabs { display: flex; border-bottom: 2px solid #ddd; margin-bottom: 20px; }
        .tab-button { padding: 10px 20px; border: none; background: none; font-size: 1.2em; cursor: pointer; position: relative; color: #666; }
        .tab-button.active { color: #005a9c; font-weight: bold; }
        .tab-button.active::after { content: ''; position: absolute; bottom: -2px; left: 0; right: 0; height: 2px; background-color: #005a9c; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 15px; }
        .toolbar button { padding: 8px 15px; font-size: 1em; background-color: var(--primary-color); color: white; border: none; border-radius: 5px; cursor: pointer; }
        .toolbar button:hover { background-color: #0056b3; }
        .toolbar .search-group { display: flex; gap: 5px; }
        .toolbar input { padding: 8px; border: 1px solid #ccc; border-radius: 5px; }
        .stats-area { display: flex; gap: 15px; font-size: 0.9em; align-items: center; }
        .stat-item { padding: 4px 8px; border-radius: 12px; color: white; font-weight: bold; }
        .stat-item.total { background-color: #6c757d; }
        .stat-item.freq-135 { background-color: #28a745; }
        .stat-item.freq-246 { background-color: #17a2b8; }
        .stat-item.freq-other { background-color: #ffc107; color: #333; }
        .patient-table { width: 100%; border-collapse: collapse; table-layout: auto; }
        .patient-table th, .patient-table td { border: 1px solid #ddd; padding: 8px; text-align: left; white-space: nowrap; }
        .patient-table td:nth-child(1), .patient-table#ipd-table-body td:nth-child(8), .patient-table#opd-table-body td:nth-child(7) { white-space: normal; }
        .patient-table th { background-color: #f2f2f2; cursor: pointer; user-select: none; position: sticky; top: 0; }
        .patient-table th:hover { background-color: #e8e8e8; }
        .patient-table th .sort-indicator { display: inline-block; margin-left: 5px; color: #999; }
        .patient-table tr.status-opd { background-color: var(--green-bg); }
        .patient-table tr.status-ipd { background-color: var(--blue-bg); }
        .patient-table tr.status-biweekly { background-color: var(--orange-bg); }
        .patient-table tr.status-deleted { background-color: var(--grey-bg); color: var(--grey-text); }
        .disease-tag { display: inline-block; margin-left: 8px; padding: 2px 6px; font-size: 0.8em; font-weight: bold; color: var(--red-text); border: 1px solid var(--red-text); border-radius: 4px; }
        .action-buttons button { margin-right: 5px; padding: 5px 10px; font-size: 0.9em; border-radius: 4px; border: none; cursor: pointer; color: white; }
        .btn-edit { background-color: var(--primary-color); }
        .btn-transfer { background-color: var(--info-color); }
        .btn-delete { background-color: var(--danger-color); }
        .btn-restore { background-color: var(--success-color); }
        .table-wrapper { max-height: 60vh; overflow-y: auto; }
        .modal { display: none; position: fixed; z-index: 1000; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
        .modal-content { background-color: #fefefe; padding: 20px; border: 1px solid #888; width: 90%; max-width: 700px; border-radius: 8px; }
        .modal-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 20px; }
        .modal-header h2 { margin: 0; }
        .close-button { color: #aaa; font-size: 28px; font-weight: bold; cursor: pointer; }
        .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
        .form-field { display: flex; flex-direction: column; }
        .form-field.hidden { display: none; }
        .form-field label { margin-bottom: 5px; font-weight: bold; }
        .form-field input, .form-field select, .form-field textarea { padding: 8px; border: 1px solid #ccc; border-radius: 4px; width: 100%; box-sizing: border-box; }
        .form-field-full { grid-column: 1 / -1; }
        .form-group { border: 1px solid #e0e0e0; padding: 15px; border-radius: 5px; margin-top: 10px; }
        .form-group legend { padding: 0 10px; font-weight: bold; color: #333; }
        .checkbox-container { display: flex; flex-wrap: wrap; gap: 20px; }
        .checkbox-group { display: flex; align-items: center; gap: 5px; }
        .checkbox-group input[type="checkbox"] { width: auto; height: 1.2em; width: 1.2em; }
        .checkbox-group label { font-weight: normal; margin-bottom: 0; }
        .modal-footer { margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; text-align: right; }
        #delete-reason-dialog { border: 1px solid #ccc; border-radius: 8px; padding: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); }
        #delete-reason-dialog::backdrop { background-color: rgba(0,0,0,0.5); }
        #delete-reason-dialog h3 { margin-top: 0; }
        #delete-reason-dialog .button-group { display: flex; flex-direction: column; gap: 10px; margin-top: 15px; }
        #delete-reason-dialog button { width: 100%; padding: 10px; font-size: 1em; }
    </style>

<script setup>
import { ref, onMounted, computed } from 'vue';
import ApiManager from '@/services/api_manager.js';
// 我們稍後會建立這個子元件
// import PatientFormModal from '@/components/PatientFormModal.vue';

const patientApi = ApiManager('patients');

// --- 狀態定義 ---
const allPatients = ref([]);
const activeTab = ref('ipd'); // 'ipd', 'opd', 'deleted'
const currentSort = ref({ column: 'createdAt', order: 'desc' });
const deletedSearchTerm = ref('');

// --- 計算屬性 (Computed Properties) ---
// 根據 activeTab 和排序規則，動態計算出要顯示在表格中的病人列表
const displayedPatients = computed(() => {
  let patients;
  if (activeTab.value === 'deleted') {
    patients = allPatients.value.filter(p => p.isDeleted);
    if (deletedSearchTerm.value) {
      const term = deletedSearchTerm.value.toLowerCase();
      patients = patients.filter(p =>
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.medicalRecordNumber && p.medicalRecordNumber.includes(term))
      );
    }
  } else {
    patients = allPatients.value.filter(p => p.status === activeTab.value && !p.isDeleted);
  }

  // 排序邏輯
  return [...patients].sort((a, b) => {
    let valA = a[currentSort.value.column];
    let valB = b[currentSort.value.column];
    if (valA && typeof valA.toDate === 'function') valA = valA.toDate();
    if (valB && typeof valB.toDate === 'function') valB = valB.toDate();
    valA = valA || '';
    valB = valB || '';
    const compare = String(valA).localeCompare(String(valB), 'zh-Hant');
    return currentSort.value.order === 'asc' ? compare : -compare;
  });
});

// --- 方法定義 ---
async function fetchAllPatients() {
  try {
    allPatients.value = await patientApi.fetchAll();
    // Vue 的計算屬性會自動更新 displayedPatients，無需手動渲染
  } catch (error) {
    console.error("讀取病人資料失敗:", error);
    alert("讀取病人資料失敗！");
  }
}

function changeTab(tabName) {
  activeTab.value = tabName;
}

function handleSort(key) {
  if (currentSort.value.column === key) {
    currentSort.value.order = currentSort.value.order === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.value.column = key;
    currentSort.value.order = 'asc';
  }
}

// ... 其他方法，如 openModal, deletePatient 等，我們稍後再實現 ...

// --- 生命週期鉤子 ---
onMounted(() => {
  fetchAllPatients();
});
// --- 輔助函式 (請將這些貼到 <script setup> 的底部) ---

function getSortIndicator(key) {
  if (currentSort.value.column === key) {
    return currentSort.value.order === 'asc' ? '▲' : '▼';
  }
  return '';
}

function formatDate(isoString) {
  if (!isoString) return '';
  const date = (typeof isoString.toDate === 'function') ? isoString.toDate() : new Date(isoString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString();
}

function getRowClass(p) {
  if (p.isDeleted) return 'status-deleted';
  const biweeklyFreq = ['一四', '二五', '三六', '一五', '二六'];
  if (biweeklyFreq.includes(p.frequency)) return 'status-biweekly';
  if (p.status === 'ipd') return 'status-ipd';
  if (p.status === 'opd') return 'status-opd';
  return '';
}

function generateDiseaseTags(diseases) {
  if (!diseases || diseases.length === 0) return '';
  return diseases.map(tag => `<span class="disease-tag">${tag}</span>`).join('');
}
 <script>
