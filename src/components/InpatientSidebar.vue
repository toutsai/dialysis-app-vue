<!-- 檔案路徑: src/components/InpatientSidebar.vue -->
<script setup>
import { ref, computed } from 'vue'

// 1. 定義 props：告訴這個元件，它會從父層接收一個叫做 'patients' 的屬性，
//    這個屬性是一個陣列。
const props = defineProps({
  patients: {
    type: Array,
    required: true, // 標示為必需的 prop
    default: () => [], // 提供一個預設值，防止在父層還沒傳遞資料時出錯
  },
})

// 2. 定義 emits：告訴父層這個元件可能會發出哪些事件。
//    雖然拖曳是透過原生 API 處理，但定義出來是個好習慣。
const emit = defineEmits(['dragstart'])

// 3. 內部狀態：篩選器的狀態由元件自己管理
const inpatientFilter = ref('all')

// 4. 計算屬性：它的資料來源，從全域的 allPatients.value 變成了 props.patients
const inpatientList = computed(() => {
  // 從 props.patients 中篩選出住院病人
  let inpatients = props.patients.filter((p) => p.status === 'ipd' && !p.isDeleted)

  const regularFreqs = ['一三五', '二四六']
  if (inpatientFilter.value === '135') {
    inpatients = inpatients.filter((p) => p.frequency === '一三五')
  } else if (inpatientFilter.value === '246') {
    inpatients = inpatients.filter((p) => p.frequency === '二四六')
  } else if (inpatientFilter.value === 'other') {
    inpatients = inpatients.filter((p) => !regularFreqs.includes(p.frequency))
  }
  return inpatients
})

// 5. 方法：拖曳開始時，我們也可以透過 emit 通知父層（雖然目前不是必需的）
function onDragStart(event, patientId) {
  event.dataTransfer.setData('text/plain', patientId)
  event.dataTransfer.effectAllowed = 'copy'
  emit('dragstart', patientId) // 發出一個事件
}
</script>

<template>
  <aside class="inpatient-sidebar">
    <h3>住院病人清單 (可拖曳)</h3>
    <div class="filter-group">
      <button @click="inpatientFilter = 'all'" :class="{ active: inpatientFilter === 'all' }">
        全部
      </button>
      <button @click="inpatientFilter = '135'" :class="{ active: inpatientFilter === '135' }">
        一三五
      </button>
      <button @click="inpatientFilter = '246'" :class="{ active: inpatientFilter === '246' }">
        二四六
      </button>
      <button @click="inpatientFilter = 'other'" :class="{ active: inpatientFilter === 'other' }">
        其他
      </button>
    </div>
    <ul id="inpatient-list">
      <!-- v-for 的資料來源 inpatientList 現在是基於 props 計算的 -->
      <li
        v-for="p in inpatientList"
        :key="p.id"
        draggable="true"
        @dragstart="onDragStart($event, p.id)"
      >
        <div class="patient-info-row">
          <span class="name">{{ p.name }}</span>
          <span class="freq">{{ p.frequency || '未設定' }}</span>
        </div>
        <div class="patient-info-row">
          <span class="mrn">({{ p.medicalRecordNumber || 'N/A' }})</span>
        </div>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
/* 加上 scoped 是一個非常好的習慣，確保樣式不會洩漏出去 */
.inpatient-sidebar {
  width: 240px;
  flex-shrink: 0;
  background-color: #f8f9fa;
  padding: 15px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  max-height: calc(75vh + 20px);
  display: flex;
  flex-direction: column;
}
.inpatient-sidebar h3 {
  margin-top: 0;
  text-align: center;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 10px;
  margin-bottom: 10px;
}
.filter-group {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 10px;
}
.filter-group button {
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 4px 8px;
  font-size: 0.8em;
  flex-grow: 1;
  cursor: pointer;
  background-color: #fff;
}
.filter-group button.active {
  background-color: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}
#inpatient-list {
  list-style-type: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex-grow: 1;
}
#inpatient-list li {
  background-color: #fff;
  border: 1px solid #e0e0e0;
  padding: 8px 12px;
  margin-bottom: 8px;
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  transition: background-color 0.3s;
  cursor: grab;
}
#inpatient-list li:active {
  cursor: grabbing;
}
.patient-info-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  align-items: center;
}
#inpatient-list li .name {
  font-weight: bold;
  font-size: 1.1em;
}
#inpatient-list li .mrn {
  font-size: 0.85em;
  color: #6c757d;
}
#inpatient-list li .freq {
  font-size: 0.9em;
  color: #555;
  background-color: #e9ecef;
  padding: 2px 6px;
  border-radius: 10px;
}
</style>
