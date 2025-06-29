<!-- 檔案路徑: src/components/InpatientSidebar.vue -->
<script setup>
import { ref, computed } from 'vue'

// 1. 定義 props：告訴這個元件，它會從父層接收一個叫做 'patients' 的屬性，
//    這個屬性是一個陣列。
const props = defineProps({
  patients: {
    type: Array,
    required: true,
  },
  scheduledIds: {
    type: Set,
    default: () => new Set(), // prop 的預設值如果是物件或陣列，必須用工廠函式返回
  },
})

// 2. 定義 emits：告訴父層這個元件可能會發出哪些事件。
//    雖然拖曳是透過原生 API 處理，但定義出來是個好習慣。
const emit = defineEmits(['drag-start'])

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

function handleDragStart(event, patientId) {
  // 直接將收到的原生事件和 patientId 傳給父元件
  emit('drag-start', event, patientId)
}
</script>

<template>
  <aside class="inpatient-sidebar">
    <h3>住院病人 (可拖曳)</h3>
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
      <!--
        假設您的 script 中有 inpatientList 這個 computed property
        來處理過濾後的病人列表
      -->
      <li
        v-for="p in inpatientList"
        :key="p.id"
        draggable="true"
        :class="{ 'is-scheduled': scheduledIds.has(p.id) }"
        @dragstart="handleDragStart($event, p.id)"
      >
        <!-- 第一行：姓名和頻率 -->
        <div class="patient-info-row">
          <span class="name">{{ p.name }}</span>
          <span class="freq">{{ p.frequency || '未設定' }}</span>
        </div>

        <!-- ======================= 【修改點】 ======================= -->
        <!-- 第二行：顯示疾病標籤，而不是病歷號 -->
        <div
          class="patient-info-row disease-tags-container"
          v-if="p.diseases && p.diseases.length > 0"
        >
          <span v-for="disease in p.diseases" :key="disease" class="sidebar-disease-tag">
            {{ disease }}
          </span>
        </div>
        <!-- ======================= 修改結束 ======================= -->
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.inpatient-sidebar {
  width: 280px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0; /* 核心！告訴 flexbox 不要壓縮我 */
  background-color: #f8f9fa;
  border-left: 1px solid #dee2e6;
}

h3 {
  margin-top: 0;
  text-align: center;
  color: #495057;
}

.filter-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-bottom: 16px;
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

/* 如果病人已被排班，顯示不同樣式 */
li.is-scheduled {
  background-color: #fffbe6; /* 淡黃色背景 */
  border-color: #ffeeba;
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

/*
  ======================= 【新增樣式】 =======================
  這是顯示疾病標籤所需的全新樣式
*/
.disease-tags-container {
  justify-content: flex-start; /* 讓標籤從左邊開始排列 */
  gap: 6px;
  margin-top: 6px; /* 與上一行的間距 */
  flex-wrap: wrap;
}

.sidebar-disease-tag {
  display: inline-block;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: bold;
  color: #721c24; /* 深紅色文字 */
  background-color: #f8d7da; /* 淡紅色背景 */
  border-radius: 12px;
}

/* 原本的 .mrn 樣式可以被註解或刪除 */
/*
.mrn {
  font-size: 13px;
  color: #6c757d;
}
*/
</style>
