<!-- 檔案路徑: src/components/ScheduleTable.vue (修改後完整版) -->
<script setup>
import { computed } from 'vue'
import { getShiftDisplayName } from '@/constants/scheduleConstants'

const props = defineProps({
  layout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  patientMap: { type: Map, required: true },
  shifts: { type: Array, required: true },
  weekdays: { type: Array, required: true },
  weekDates: { type: Array, default: () => [] },
  hepatitisBeds: { type: Array, default: () => [] },
  getStyleFunc: { type: Function, default: () => ({}) },
  isDateInPast: { type: Function, default: () => false },
})

const emit = defineEmits(['grid-click', 'drop', 'drag-start', 'drag-over', 'drag-leave'])

// getPatientDetails 函式保持不變，它已經正確地提供了 diseases 陣列
const getPatientDetails = (slotId) => {
  const slotData = props.scheduleData[slotId]
  if (!slotData || !slotData.patientId) return null

  const patient = props.patientMap.get(slotData.patientId)
  if (!patient) return null

  return {
    name: patient.name,
    medicalRecordNumber: patient.medicalRecordNumber,
    diseases: patient.diseases || [],
  }
}
</script>

<template>
  <div class="schedule-table-container">
    <table class="schedule-table">
      <thead>
        <tr>
          <th class="bed-header-cell">床位</th>
          <th class="shift-header-cell">班次</th>
          <th v-for="(day, index) in weekdays" :key="index" class="day-header-cell">
            {{ day }}
            <span v-if="weekDates[index]" class="date-display">{{ weekDates[index] }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-for="bedNum in layout" :key="`bed-${bedNum}`">
          <!-- 第一個班次，帶 rowspan -->
          <tr class="bed-row">
            <td
              class="bed-number-cell"
              :rowspan="shifts.length"
              :class="{ 'hepatitis-bed': hepatitisBeds.includes(bedNum) }"
            >
              {{ bedNum }}號床
            </td>
            <td class="shift-name-cell">{{ getShiftDisplayName(shifts[0]) }}</td>
            <td v-for="(day, dayIndex) in weekdays" :key="`slot-${bedNum}-0-${dayIndex}`">
              <div
                class="schedule-slot"
                :class="[
                  getStyleFunc(`${bedNum}-0-${dayIndex}`),
                  { 'is-past': props.isDateInPast(dayIndex) },
                ]"
                :draggable="
                  getPatientDetails(`${bedNum}-0-${dayIndex}`) && !props.isDateInPast(dayIndex)
                    ? 'true'
                    : 'false'
                "
                @click="
                  !props.isDateInPast(dayIndex) && emit('grid-click', `${bedNum}-0-${dayIndex}`)
                "
                @drop="
                  !props.isDateInPast(dayIndex) && emit('drop', $event, `${bedNum}-0-${dayIndex}`)
                "
                @dragstart="
                  !props.isDateInPast(dayIndex) &&
                  emit('drag-start', $event, `${bedNum}-0-${dayIndex}`)
                "
                @dragover.prevent="!props.isDateInPast(dayIndex) && emit('drag-over', $event)"
                @dragleave="emit('drag-leave', $event)"
              >
                <div v-if="getPatientDetails(`${bedNum}-0-${dayIndex}`)" class="patient-details">
                  <!-- 今天及未來的顯示方式 -->
                  <template v-if="!props.isDateInPast(dayIndex)">
                    <div class="patient-name">
                      {{ getPatientDetails(`${bedNum}-0-${dayIndex}`).name }}
                      <span
                        v-for="disease in getPatientDetails(`${bedNum}-0-${dayIndex}`).diseases"
                        :key="disease"
                        class="disease-tag-in-table"
                      >
                        {{ disease }}
                      </span>
                    </div>
                    <div class="patient-mrn">
                      {{ getPatientDetails(`${bedNum}-0-${dayIndex}`).medicalRecordNumber }}
                    </div>
                  </template>
                  <!-- 已過去的顯示方式 -->
                  <template v-else>
                    <div class="patient-name-past">
                      {{ getPatientDetails(`${bedNum}-0-${dayIndex}`).name }}
                    </div>
                  </template>
                </div>
                <!-- 只有在今天及未來，且格子為空時，才顯示 '+' -->
                <div v-else-if="!props.isDateInPast(dayIndex)" class="empty-slot-placeholder">
                  +
                </div>
              </div>
            </td>
          </tr>
          <!-- 其他班次 -->
          <tr v-for="shiftIndex in shifts.length - 1" :key="`shift-row-${bedNum}-${shiftIndex}`">
            <td class="shift-name-cell">{{ getShiftDisplayName(shifts[shiftIndex]) }}</td>
            <td
              v-for="(day, dayIndex) in weekdays"
              :key="`slot-${bedNum}-${shiftIndex}-${dayIndex}`"
            >
              <div
                class="schedule-slot"
                :class="[
                  getStyleFunc(`${bedNum}-${shiftIndex}-${dayIndex}`),
                  { 'is-past': props.isDateInPast(dayIndex) },
                ]"
                :draggable="
                  getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`) &&
                  !props.isDateInPast(dayIndex)
                    ? 'true'
                    : 'false'
                "
                @click="
                  !props.isDateInPast(dayIndex) &&
                  emit('grid-click', `${bedNum}-${shiftIndex}-${dayIndex}`)
                "
                @drop="
                  !props.isDateInPast(dayIndex) &&
                  emit('drop', $event, `${bedNum}-${shiftIndex}-${dayIndex}`)
                "
                @dragstart="
                  !props.isDateInPast(dayIndex) &&
                  emit('drag-start', $event, `${bedNum}-${shiftIndex}-${dayIndex}`)
                "
                @dragover.prevent="!props.isDateInPast(dayIndex) && emit('drag-over', $event)"
                @dragleave="emit('drag-leave', $event)"
              >
                <div
                  v-if="getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`)"
                  class="patient-details"
                >
                  <template v-if="!props.isDateInPast(dayIndex)">
                    <div class="patient-name">
                      {{ getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`).name }}
                      <span
                        v-for="disease in getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`)
                          .diseases"
                        :key="disease"
                        class="disease-tag-in-table"
                      >
                        {{ disease }}
                      </span>
                    </div>
                    <div class="patient-mrn">
                      {{
                        getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`).medicalRecordNumber
                      }}
                    </div>
                  </template>
                  <template v-else>
                    <div class="patient-name-past">
                      {{ getPatientDetails(`${bedNum}-${shiftIndex}-${dayIndex}`).name }}
                    </div>
                  </template>
                </div>
                <div v-else-if="!props.isDateInPast(dayIndex)" class="empty-slot-placeholder">
                  +
                </div>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.schedule-table-container {
  width: 100%;
  height: 100%;
  overflow: auto;
}
.schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.schedule-table th,
.schedule-table td {
  border: 1px solid #dee2e6;
  text-align: center;
  vertical-align: middle;
  padding: 0;
  height: 60px;
}
.schedule-table thead th {
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 10;
  padding: 8px 4px;
}
.date-display {
  font-size: 0.8em;
  color: #6c757d;
  display: block;
}
.bed-header-cell {
  width: 80px;
}
.shift-header-cell {
  width: 70px;
}
.bed-number-cell {
  position: sticky;
  left: 0;
  background-color: #f8f9fa;
  z-index: 5;
  font-weight: bold;
}
.hepatitis-bed {
  background-color: var(--hepatitis-bg, #fff9c4);
}
.shift-name-cell {
  background-color: #f8f9fa;
  font-size: 0.9em;
}

/* --- Schedule Slot 內部樣式 --- */
.schedule-slot {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  transition: all 0.2s; /* 統一 transition */
  overflow: hidden;
}
.patient-details {
  padding: 4px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}

/* -- 今天及未來日期的樣式 -- */
.patient-name {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-weight: bold;
  font-size: 0.95em;
  white-space: nowrap;
}

.patient-mrn {
  font-size: 0.8em;
  color: #555;
  white-space: nowrap;
}
.disease-tag-in-table {
  display: inline-block;
  vertical-align: middle;
  padding: 2px 6px;
  line-height: 1;
  background-color: transparent;
  border: 2px solid #dc3545;
  color: #dc3545;
  border-radius: 6px;
  font-size: 0.85em;
  font-weight: bold;
}
.empty-slot-placeholder {
  color: #adb5bd;
  font-size: 1.5rem;
  user-select: none;
}
.schedule-slot:hover .empty-slot-placeholder {
  color: #007bff;
}

/* --- 歷史資料視覺呈現的核心 CSS --- */
.schedule-slot.is-past {
  cursor: not-allowed;
  opacity: 0.85;
}
.schedule-slot.is-past:not([class*='status-']):not([class*='tag-']) {
  background-color: #f5f5f5 !important;
  opacity: 1;
}
.patient-name-past {
  font-weight: normal;
  color: #333;
  font-size: 0.9em;
}

/* --- 【新增】拖曳相關樣式 --- */
.schedule-slot.drag-over {
  background-color: #c8e6c9 !important;
  border: 2px dashed #4caf50;
  box-shadow: inset 0 0 10px rgba(0, 0, 0, 0.1);
}

.schedule-slot[draggable='true'] {
  cursor: grab;
}

.schedule-slot[draggable='true']:active {
  cursor: grabbing;
  transform: scale(0.98);
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
  z-index: 20; /* 確保拖曳時元素在最上層 */
}
</style>
