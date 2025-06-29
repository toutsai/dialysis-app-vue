<script setup>
import { defineProps, defineEmits } from 'vue'

// Props 和 Emits 的定義保持不變
const props = defineProps({
  layout: Array,
  scheduleData: Object,
  patientMap: Map,
  shifts: Array,
  weekdays: Array,
  weekDates: Array,
  hepatitisBeds: Array,
  getStyleFunc: Function,
})

const emit = defineEmits(['grid-click', 'drop', 'drag-start', 'drag-over', 'drag-leave'])

// 輔助函式保持不變
const getPatient = (slotId) => {
  const slotData = props.scheduleData[slotId]
  if (!slotData) {
    // 如果這個 slotId 根本沒有排班，直接返回 null
    return null
  }

  if (slotData && slotData.patientId) {
    const patient = props.patientMap.get(slotData.patientId)
    if (!patient) {
      // 找到了排班記錄，但 patientId 在 patientMap 中找不到對應的病人
      console.warn(`Patient not found for ID: ${slotData.patientId} in slot ${slotId}`)
      return null
    }
    return patient // 成功找到
  }

  return null
}
</script>

<template>
  <div class="table-wrapper">
    <table class="weekly-schedule-table">
      <thead>
        <tr>
          <th>床位</th>
          <th>班次</th>
          <th v-for="(day, index) in weekdays" :key="day">
            <div class="weekday">{{ day }}</div>
            <div class="date" v-if="weekDates[index]">{{ weekDates[index].date }}</div>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="bedNumber in layout" :key="bedNumber">
          <tr
            v-for="(shift, shiftIndex) in shifts"
            :key="shift"
            :class="{ 'hepatitis-bed': hepatitisBeds.includes(bedNumber) }"
          >
            <td v-if="shiftIndex === 0" :rowspan="shifts.length" class="bed-number-cell">
              {{ bedNumber }}號床
            </td>
            <td class="shift-cell">{{ shift }}</td>
            <td
              v-for="(day, dayIndex) in weekdays"
              :key="day"
              :class="{ 'afternoon-shift': shift === '午班' }"
            >
              <div
                class="schedule-slot"
                :class="[
                  getStyleFunc(`${bedNumber}-${shiftIndex}-${dayIndex}`),
                  { 'has-patient': !!getPatient(`${bedNumber}-${shiftIndex}-${dayIndex}`) },
                ]"
                @click="emit('grid-click', `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                @drop="emit('drop', $event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                @dragover.prevent="emit('drag-over', $event)"
                @dragleave.prevent="emit('drag-leave', $event)"
                @dragstart="emit('drag-start', $event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                :draggable="!!getPatient(`${bedNumber}-${shiftIndex}-${dayIndex}`)?.id"
              >
                <template
                  v-for="patient in [getPatient(`${bedNumber}-${shiftIndex}-${dayIndex}`)]"
                  :key="patient?.id"
                >
                  <div v-if="patient" class="patient-details">
                    <!-- 第一行：姓名和標籤的容器 -->
                    <div class="patient-primary-info">
                      <span class="patient-name">{{ patient.name }}</span>
                      <span v-for="disease in patient.diseases" :key="disease" class="disease-tag">
                        {{ disease }}
                      </span>
                    </div>

                    <!-- 第二行：病歷號 -->
                    <div class="patient-secondary-info">
                      <span class="patient-mrn">{{ patient.medicalRecordNumber }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
/*
  ======================= 【修改點】Style 調整 =======================
  主要修改 .table-wrapper，讓它能夠填滿父容器並產生滾動條。
  其他樣式是我們之前確認的最終卡片式設計。
  ===================================================================
*/
:root {
  --border-color: #f0f0f0;
  --hepatitis-bg: #fff3cd;
  --red-text: #d9534f;
  --patient-card-border: #e0e0e0;
}

/* 核心修改：讓這個 wrapper 具備滾動能力 */
.table-wrapper {
  width: 100%;
  height: 100%;
  overflow: auto; /* 當內容超出時，顯示滾動條 */
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.weekly-schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 1200px; /* 確保在窄螢幕下表格內容不會擠壓 */
}

/* sticky header 確保在垂直滾動時，表頭固定 */
.weekly-schedule-table thead th {
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 10;
  padding: 8px 4px;
}

/* sticky first column 確保在水平滾動時，床位和班次欄位固定 */
.weekly-schedule-table .bed-number-cell,
.weekly-schedule-table .shift-cell {
  position: sticky;
  background-color: #fafafa;
  z-index: 5;
}
.weekly-schedule-table .bed-number-cell {
  left: 0; /* 固定在最左側 */
}
.weekly-schedule-table .shift-cell {
  left: 80px; /* 固定在床位欄旁邊 (假設床位欄寬度約80px) */
}

.weekly-schedule-table th,
.weekly-schedule-table td {
  border: 1px solid var(--border-color);
  text-align: center;
  vertical-align: middle;
  height: 90px;
  padding: 6px;
}

.weekday {
  font-weight: bold;
}
.date {
  font-size: 0.8em;
  color: #6c757d;
}
tr.hepatitis-bed {
  border-left: 4px solid var(--hepatitis-bg);
}
td.afternoon-shift {
  background-color: #f9f9f9;
}

.schedule-slot {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  transition: all 0.2s ease-in-out;
  padding: 4px;
}

.schedule-slot.has-patient {
  background-color: #fff;
  border: 1px solid var(--patient-card-border);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  cursor: grab;
}

.schedule-slot.has-patient:active {
  cursor: grabbing;
  transform: scale(0.98);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
}

.schedule-slot.drag-over {
  transform: scale(1.05);
  background-color: #e6f7ff !important;
  border: 2px dashed #1890ff;
}

.patient-details {
  display: flex;
  flex-direction: column; /* 確保兩行是垂直排列 */
  align-items: center; /* 讓兩行內容水平居中 */
  justify-content: center;
  gap: 4px; /* 第一行和第二行之間的間距 */
  width: 100%;
}

/* 第一行：姓名和標籤的容器 */
.patient-primary-info {
  display: flex;
  align-items: center; /* 垂直對齊姓名和標籤 */
  justify-content: center; /* 將姓名和標籤作為一個整體水平居中 */
  gap: 8px; /* 姓名和標籤之間的間距 */
  flex-wrap: wrap; /* 如果標籤太多，允許換行 */
}

.patient-name {
  font-size: 18px; /* 稍微加大姓名，使其更突出 */
  font-weight: 500;
  color: #212529;
}

.disease-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: bold;
  color: var(--red-text);
  border: 1px solid var(--red-text);
  border-radius: 6px; /* 使用稍方的圓角 */
  line-height: 1.4;
  background-color: #fff;
  white-space: nowrap;
}

/* 第二行：病歷號容器 */
.patient-secondary-info {
  /* 這裡不需要特別的樣式，它會自然地在第二行 */
}

.patient-mrn {
  font-size: 14px; /* 調整病歷號大小 */
  color: #6c757d;
  /* 根據您的圖片，病歷號沒有括號 */
}

/* 背景色標籤 */
.schedule-slot.tag-chou {
  background-color: #e3f2fd;
}
.schedule-slot.tag-new {
  background-color: #fffde7;
}
.schedule-slot.tag-ip {
  background-color: #ffebee;
}
.schedule-slot.tag-huan {
  background-color: #e0f7fa;
}
.schedule-slot.tag-liang {
  background-color: #fff3e0;
}
.schedule-slot.tag-b {
  background-color: #fff9c4;
}
</style>
