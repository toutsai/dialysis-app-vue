<script setup>
import { computed } from 'vue'

const props = defineProps({
  layout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  patientMap: { type: Map, required: true },
  shifts: { type: Array, required: true },
  weekdays: { type: Array, required: true },
  weekDates: { type: Array, default: () => [] },
  hepatitisBeds: { type: Array, default: () => [] },
  getStyleFunc: { type: Function, default: () => ({}) },
})
// 在這裡打印出每次渲染時接收到的 props
console.log('[Debug ScheduleTable] Received props:', {
  scheduleData: props.scheduleData,
  patientMap: props.patientMap,
})

const emit = defineEmits(['grid-click', 'drop', 'drag-start', 'drag-over', 'drag-leave'])

function getSlot(slotId) {
  return props.scheduleData[slotId] || null
}

function getPatient(slotId) {
  const slot = getSlot(slotId)
  return slot?.patientId ? props.patientMap.get(slot.patientId) : null
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
            <td v-if="shiftIndex === 0" :rowspan="shifts.length">{{ bedNumber }}號床</td>
            <td>{{ shift }}</td>
            <td v-for="(day, dayIndex) in weekdays" :key="day">
              <div
                class="schedule-slot"
                :class="getStyleFunc(`${bedNumber}-${shiftIndex}-${dayIndex}`)"
                @click="emit('grid-click', `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                @drop="emit('drop', $event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                @dragover.prevent="emit('drag-over', $event)"
                @dragleave.prevent="emit('drag-leave', $event)"
                @dragstart="emit('drag-start', $event, `${bedNumber}-${shiftIndex}-${dayIndex}`)"
                :draggable="!!getSlot(`${bedNumber}-${shiftIndex}-${dayIndex}`)?.patientId"
              >
                <template
                  v-for="patient in [getPatient(`${bedNumber}-${shiftIndex}-${dayIndex}`)]"
                  :key="patient?.id"
                >
                  <template v-if="patient">
                    <div class="slot-patient-name">
                      <span>{{ patient.name }}</span>
                      <span
                        v-for="disease in patient.diseases"
                        :key="disease"
                        class="disease-tag"
                        >{{ disease }}</span
                      >
                    </div>
                    <div class="slot-patient-mrn">({{ patient.medicalRecordNumber || 'N/A' }})</div>
                    <div
                      class="slot-note"
                      v-if="getSlot(`${bedNumber}-${shiftIndex}-${dayIndex}`).note"
                    >
                      {{ getSlot(`${bedNumber}-${shiftIndex}-${dayIndex}`).note }}
                    </div>
                  </template>
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
.table-wrapper {
  flex-grow: 1;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.weekly-schedule-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  min-width: 1200px; /* 給一個最小寬度，防止內容擠壓 */
}

.weekly-schedule-table th,
.weekly-schedule-table td {
  border: 1px solid var(--border-color);
  padding: 4px;
  text-align: center;
  vertical-align: middle;
  height: 70px; /* 增加一點高度以容納更多資訊 */
}

.weekly-schedule-table thead th {
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 10;
}

.weekday {
  font-weight: bold;
}
.date {
  font-size: 0.8em;
  color: #6c757d;
}

tr.hepatitis-bed > td:first-child {
  background-color: var(--hepatitis-bg);
  font-weight: bold;
}

.schedule-slot {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border-radius: 4px;
  padding: 5px;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.1s;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 3px;
  min-height: 65px;
  font-size: 0.9em;
}

.schedule-slot.filled {
  cursor: grab;
}
.schedule-slot.filled:active {
  cursor: grabbing;
}

.schedule-slot.drag-over {
  transform: scale(1.05);
  background-color: #d4edda !important;
  border: 2px dashed #155724;
}

.slot-patient-name {
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 5px;
}

.disease-tag {
  display: inline-block;
  padding: 1px 5px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--red-text);
  border: 1px solid var(--red-text);
  border-radius: 4px;
  line-height: 1.2;
}

.slot-patient-mrn {
  font-size: 0.8em;
  color: #6c757d;
}

.slot-note {
  font-size: 0.8em;
  color: #005a9c;
  font-style: italic;
  margin-top: 2px;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 背景色樣式 */
.schedule-slot.tag-ip {
  background-color: #ffebee;
}
.schedule-slot.tag-chou {
  background-color: #e3f2fd;
}
.schedule-slot.tag-new {
  background-color: #fffde7;
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
