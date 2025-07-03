<!-- 檔案路徑: src/components/ScheduleTable.vue (重構版) -->
<script setup>
// 1. 引入我們需要的常量和輔助函式
import { SHIFT_CODES, getShiftDisplayName } from '@/constants/scheduleConstants'

// Props 的定義保持不變，因為父元件傳遞的 props 名稱不變
const props = defineProps({
  layout: Array,
  scheduleData: Object,
  patientMap: Map,
  shifts: Array, // 這個 prop 現在會接收 ['early', 'noon', 'late']
  weekdays: Array,
  weekDates: Array,
  hepatitisBeds: Array,
  getStyleFunc: Function,
})

const emit = defineEmits(['grid-click', 'drop', 'drag-start', 'drag-over', 'drag-leave'])

// getPatient 輔助函式保持不變，它不依賴班別名稱
const getPatient = (slotId) => {
  const slotData = props.scheduleData[slotId]
  if (!slotData) {
    return null
  }
  if (slotData && slotData.patientId) {
    const patient = props.patientMap.get(slotData.patientId)
    if (!patient) {
      console.warn(`Patient not found for ID: ${slotData.patientId} in slot ${slotId}`)
      return null
    }
    return patient
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
            <div class="date" v-if="weekDates[index]">{{ weekDates[index] }}</div>
            <!-- 修正：之前是.date -->
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="bedNumber in layout" :key="bedNumber">
          <!-- 2. v-for 迴圈現在迭代的是英文代碼 ['early', 'noon', 'late'] -->
          <tr
            v-for="(shiftCode, shiftIndex) in shifts"
            :key="shiftCode"
            :class="{ 'hepatitis-bed': hepatitisBeds.includes(bedNumber) }"
          >
            <td v-if="shiftIndex === 0" :rowspan="shifts.length" class="bed-number-cell">
              {{ bedNumber }}號床
            </td>
            <!-- 3. 顯示時，使用 getShiftDisplayName 轉換為中文。HTML 和 CSS class 不變 -->
            <td class="shift-cell">{{ getShiftDisplayName(shiftCode) }}</td>
            <td
              v-for="(day, dayIndex) in weekdays"
              :key="day"
              :class="{ 'afternoon-shift': shiftCode === SHIFT_CODES.NOON }"
            >
              <!-- 下方的所有邏輯都基於 shiftIndex 和 dayIndex，所以完全不需要修改 -->
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
                    <div class="patient-primary-info">
                      <span class="patient-name">{{ patient.name }}</span>
                      <span v-for="disease in patient.diseases" :key="disease" class="disease-tag">
                        {{ disease }}
                      </span>
                    </div>
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

<!-- Style 部分完全不需要修改，因為我們沒有改變任何 class 名稱 -->
<style scoped>
:root {
  --border-color: #dee2e6;
  --hepatitis-bg: #fff3cd;
  --red-text: #d9534f;
  --patient-card-border: #e0e0e0;
}

.table-wrapper {
  width: 100%;
  height: 100%;
  overflow: auto;
  border: 0;
  border-radius: 8px;
}

.weekly-schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 1200px;
}

.weekly-schedule-table thead th {
  position: sticky;
  top: 0;
  background-color: #e9ecef;
  z-index: 10;
  padding: 8px 4px;
}

.weekly-schedule-table .bed-number-cell,
.weekly-schedule-table .shift-cell {
  position: sticky;
  font-weight: normal;
  color: #495057;
  background-color: #e9ecef;
  z-index: 5;
}
.weekly-schedule-table .bed-number-cell {
  left: 0;
}
.weekly-schedule-table .shift-cell {
  left: 60px;
}

.weekly-schedule-table th,
.weekly-schedule-table td {
  border: 1px solid var(--border-color);
  text-align: center;
  vertical-align: middle;
  height: 60px;
  padding: 4px;
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
  background-color: #e9ecef;
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
}

.schedule-slot.has-patient {
  background-color: #fff;
  border: 1px solid #e0e0e0;
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
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
}

.patient-primary-info {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.patient-name {
  font-size: 18px;
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
  border-radius: 6px;
  line-height: 1.4;
  background-color: #fff;
  white-space: nowrap;
}

.patient-secondary-info {
}

.patient-mrn {
  font-size: 14px;
  color: #6c757d;
}

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
