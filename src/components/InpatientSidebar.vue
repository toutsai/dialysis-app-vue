<script setup>
import { ref, computed } from 'vue'
// 由於您提供的程式碼中已經有這行，我們假設您的 utils 檔案已經建立好
import { shouldPatientBeScheduled } from '@/utils/scheduleUtils.js'

const props = defineProps({
  patients: {
    type: Array,
    required: true,
  },
  scheduledIds: {
    type: Set,
    default: () => new Set(),
  },
  // prop: useDailyFilter 決定是否啟用「當日/非當日」篩選模式
  useDailyFilter: {
    type: Boolean,
    default: false,
  },
  // prop: dayOfWeek，僅在 useDailyFilter 為 true 時有效
  dayOfWeek: {
    type: Number, // 1=週一, ..., 7=週日
    default: 1,
  },
})

const emit = defineEmits(['drag-start'])

const inpatientFilter = ref('all')

const inpatientList = computed(() => {
  // 基礎過濾：篩選出未被刪除的住院病人
  let inpatients = props.patients.filter((p) => p.status === 'ipd' && !p.isDeleted)

  // 模式一：如果啟用每日篩選 (在 ScheduleView 中使用)
  if (props.useDailyFilter) {
    if (inpatientFilter.value === 'today') {
      inpatients = inpatients.filter((p) => shouldPatientBeScheduled(p, props.dayOfWeek))
    } else if (inpatientFilter.value === 'other_day') {
      inpatients = inpatients.filter((p) => !shouldPatientBeScheduled(p, props.dayOfWeek))
    }
  }
  // 模式二：傳統的頻率篩選 (在 WeeklyView 或其他地方使用)
  else {
    const regularFreqs = ['一三五', '二四六']
    if (inpatientFilter.value === '135') {
      inpatients = inpatients.filter((p) => (p.freq ?? p.frequency) === '一三五')
    } else if (inpatientFilter.value === '246') {
      inpatients = inpatients.filter((p) => (p.freq ?? p.frequency) === '二四六')
    } else if (inpatientFilter.value === 'other') {
      inpatients = inpatients.filter((p) => !regularFreqs.includes(p.freq ?? p.frequency))
    }
  }

  return inpatients
})

function handleDragStart(event, patient) {
  emit('drag-start', event, patient)
}
</script>

<template>
  <aside class="inpatient-sidebar">
    <h3>住院病人 (可拖曳)</h3>
    <!-- 【修改 1】: 為 filter-group 添加動態 class 綁定 -->
    <div class="filter-group" :class="{ 'daily-filter-layout': useDailyFilter }">
      <!-- 每日篩選模式的按鈕 -->
      <template v-if="useDailyFilter">
        <button @click="inpatientFilter = 'all'" :class="{ active: inpatientFilter === 'all' }">
          全部
        </button>
        <button @click="inpatientFilter = 'today'" :class="{ active: inpatientFilter === 'today' }">
          當日應排
        </button>
        <button
          @click="inpatientFilter = 'other_day'"
          :class="{ active: inpatientFilter === 'other_day' }"
        >
          非當日(臨洗)
        </button>
      </template>

      <!-- 傳統頻率篩選模式的按鈕 -->
      <template v-else>
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
      </template>
    </div>

    <ul id="inpatient-list">
      <li
        v-for="p in inpatientList"
        :key="p.id"
        draggable="true"
        :class="{ 'is-scheduled': scheduledIds.has(p.id) }"
        @dragstart="handleDragStart($event, p)"
      >
        <div class="patient-info-row">
          <span class="name">{{ p.name }}</span>
          <span class="freq">{{ (p.freq ?? p.frequency) || '未設定' }}</span>
        </div>
        <div
          class="patient-info-row disease-tags-container"
          v-if="p.diseases && p.diseases.length > 0"
        >
          <span v-for="disease in p.diseases" :key="disease" class="sidebar-disease-tag">
            {{ disease }}
          </span>
        </div>
      </li>
    </ul>
    <div v-if="inpatientList.length === 0" class="empty-list-message">無符合條件的病人</div>
  </aside>
</template>

<style scoped>
.inpatient-sidebar {
  width: 240px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background-color: #f8f9fa;
  border-left: 1px solid #dee2e6;
}
h3 {
  margin-top: 0;
  text-align: center;
  color: #495057;
}

/* 【修改 2】: 替換為新的、更可靠的 CSS 佈局規則 */
.filter-group {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
  /* 預設佈局（用於 WeeklyView）：兩兩一排 */
  grid-template-columns: 1fr 1fr;
}

/* 當啟用每日篩選時，啟用這個 class */
.filter-group.daily-filter-layout {
  /* 雖然這裡還是兩列，但下面的規則會改變第一個按鈕的行為 */
  grid-template-columns: 1fr 1fr;
}

/* 選中每日篩選佈局下的第一個按鈕（"全部"）*/
.filter-group.daily-filter-layout button:first-child {
  /* 讓它從第一條網格線跨到最後一條，即獨佔一行 */
  grid-column: 1 / -1;
}

.filter-group button {
  padding: 8px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: #fff;
  cursor: pointer;
  transition: all 0.2s;
}
.filter-group button:hover {
  background-color: #e9ecef;
}
.filter-group button.active {
  background-color: #007bff;
  color: #fff;
  border-color: #007bff;
}
#inpatient-list {
  list-style: none;
  padding: 0;
  margin: 0;
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
li {
  padding: 12px;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  background-color: #fff;
  cursor: grab;
  transition:
    box-shadow 0.2s,
    transform 0.2s;
}
li:active {
  cursor: grabbing;
  transform: scale(0.98);
}
li.is-scheduled {
  background-color: #fffbe6;
  border-color: #ffeeba;
}
li:has(span:contains('吳秀美')) {
  background-color: #fffde7;
}
.patient-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.name {
  font-weight: bold;
  font-size: 16px;
}
.freq {
  font-size: 12px;
  background-color: #e9ecef;
  color: #495057;
  padding: 2px 6px;
  border-radius: 4px;
}
.disease-tags-container {
  justify-content: flex-start;
  gap: 6px;
  margin-top: 6px;
  flex-wrap: wrap;
}
.sidebar-disease-tag {
  display: inline-block;
  padding: 1px 6px;
  line-height: 1.2;
  background-color: transparent;
  border: 1.5px solid #dc3545;
  color: #dc3545;
  border-radius: 5px;
  font-size: 11px;
  font-weight: bold;
}
.empty-list-message {
  text-align: center;
  color: #adb5bd;
  padding: 40px 20px;
  font-style: italic;
}
</style>
