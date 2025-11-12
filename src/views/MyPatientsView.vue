<!-- 檔案路徑: src/views/MyPatientsView.vue (最終版) -->
<template>
  <div class="my-patients-container">
    <div class="page-header">
      <h1 class="page-title">我的今日病人</h1>
      <button @click="fetchMyPatientData" :disabled="isLoading" class="btn-refresh">
        <i class="fas fa-sync-alt" :class="{ 'fa-spin': isLoading }"></i>
        {{ isLoading ? '載入中...' : '重新整理' }}
      </button>
    </div>

    <!-- 1. 載入中狀態 -->
    <div v-if="isLoading" class="status-panel">
      <div class="spinner"></div>
      <p>正在為您準備今日的病人照護列表...</p>
    </div>

    <!-- 2. 沒有分配到病人的狀態 -->
    <div v-else-if="!patientList || patientList.length === 0" class="status-panel">
      <i class="fas fa-check-circle icon-success"></i>
      <p>您今天沒有被分配到照護病人，或班表尚未更新。</p>
    </div>

    <!-- 3. 成功載入資料，顯示表格 -->
    <div v-else class="table-wrapper">
      <table class="patient-table">
        <thead>
          <tr>
            <th class="col-shift">班別</th>
            <th class="col-bed">床位</th>
            <th class="col-name">姓名</th>
            <th class="col-prep">AK</th>
            <th class="col-prep">Ca</th>
            <th class="col-prep">Heparin</th>
            <th class="col-prep">BF</th>
            <th class="col-access">通路/穿刺針</th>
            <th class="col-meds">須施打藥物</th>
            <th class="col-memos">交班備忘</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="patient in patientList" :key="patient.id">
            <td>{{ patient.shift }}</td>
            <td>{{ patient.bedNum }}</td>
            <td class="patient-name">{{ patient.name }}</td>
            <td>{{ patient.preparation.ak }}</td>
            <td>{{ patient.preparation.dialysateCa }}</td>
            <td>{{ patient.preparation.heparin }}</td>
            <td>{{ patient.preparation.bloodFlow }}</td>
            <td>{{ patient.preparation.vascAccess }}</td>
            <td>
              <ul v-if="patient.injections.length > 0" class="info-list">
                <li v-for="med in patient.injections" :key="med.id">
                  {{ med.name }} {{ med.dose }}
                </li>
              </ul>
              <span v-else class="no-data">–</span>
            </td>
            <td>
              <ul v-if="patient.memos.length > 0" class="info-list memo-list">
                <li v-for="memo in patient.memos" :key="memo.id">{{ memo.content }}</li>
              </ul>
              <span v-else class="no-data">–</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup>
import { useMyPatientList } from '@/composables/useMyPatientList.js'

// ✨ 核心步驟：呼叫 composable
// isLoading, patientList, fetchMyPatientData 都會從 useMyPatientList 中回傳
const { isLoading, patientList, fetchMyPatientData } = useMyPatientList()
</script>

<style scoped>
.my-patients-container {
  padding: 1.5rem;
  background-color: #f8f9fa;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.page-title {
  font-size: 1.8rem;
  font-weight: bold;
  color: #2c3e50;
  margin: 0;
}

.btn-refresh {
  padding: 0.5rem 1rem;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 500;
  transition: background-color 0.2s;
}

.btn-refresh:hover:not(:disabled) {
  background-color: #0056b3;
}

.btn-refresh:disabled {
  background-color: #6c757d;
  cursor: not-allowed;
}

.status-panel {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background-color: #ffffff;
  border-radius: 8px;
  padding: 2rem;
  color: #6c757d;
  font-size: 1.1rem;
}

.icon-success {
  font-size: 3rem;
  color: #28a745;
  margin-bottom: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
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

.table-wrapper {
  flex-grow: 1;
  overflow-x: auto; /* 允許表格水平滾動 */
  background-color: #ffffff;
  border: 1px solid #dee2e6;
  border-radius: 8px;
}

.patient-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.patient-table th,
.patient-table td {
  border: 1px solid #dee2e6;
  padding: 12px 15px;
  text-align: center;
  vertical-align: middle;
}

.patient-table th {
  background-color: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
}

.patient-table tbody tr:hover {
  background-color: #f1f7ff;
}

.patient-name {
  font-weight: 500;
}

.info-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.memo-list li {
  padding: 4px 6px;
  background-color: #fff9e6;
  border-left: 3px solid #ffc107;
  border-radius: 3px;
}

.no-data {
  color: #adb5bd;
}

/* 設定欄位寬度 */
.col-shift {
  width: 8%;
}
.col-bed {
  width: 6%;
}
.col-name {
  width: 8%;
}
.col-prep {
  width: 7%;
}
.col-access {
  width: 12%;
}
.col-meds {
  width: 18%;
}
.col-memos {
  width: 20%;
}
</style>
