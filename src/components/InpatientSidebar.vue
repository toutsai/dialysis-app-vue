<!-- 檔案路徑: src/components/InpatientSidebar.vue (最終修正版) -->
<script setup>
import { ref, computed } from 'vue'

// 1. Props 和 Emits 定義
const props = defineProps({
  patients: {
    type: Array,
    required: true,
  },
  scheduledIds: {
    type: Set,
    default: () => new Set(),
  },
})

const emit = defineEmits(['drag-start'])

// 2. 內部狀態
const inpatientFilter = ref('all')

// 3. 計算屬性，用於過濾住院病人列表
const inpatientList = computed(() => {
  // 從 props.patients 中篩選出住院病人
  let inpatients = props.patients.filter((p) => p.status === 'ipd' && !p.isDeleted)

  const regularFreqs = ['一三五', '二四六']

  // 根據篩選器過濾病人
  if (inpatientFilter.value === '135') {
    inpatients = inpatients.filter((p) => (p.freq ?? p.frequency) === '一三五')
  } else if (inpatientFilter.value === '246') {
    inpatients = inpatients.filter((p) => (p.freq ?? p.frequency) === '二四六')
  } else if (inpatientFilter.value === 'other') {
    inpatients = inpatients.filter((p) => !regularFreqs.includes(p.freq ?? p.frequency))
  }
  return inpatients
})

// 4. 事件處理函式
function handleDragStart(event, patient) {
  // 發送 event 和完整的 patient 物件給父元件
  emit('drag-start', event, patient)
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
      <li
        v-for="p in inpatientList"
        :key="p.id"
        draggable="true"
        :class="{ 'is-scheduled': scheduledIds.has(p.id) }"
        @dragstart="handleDragStart($event, p)"
      >
        <!-- 第一行：姓名和頻率 -->
        <div class="patient-info-row">
          <span class="name">{{ p.name }}</span>
          <span class="freq">{{ (p.freq ?? p.frequency) || '未設定' }}</span>
        </div>

        <!-- 第二行：疾病標籤 -->
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
  </aside>
</template>

<!-- Style 部分完全不需要修改 -->
<style scoped>
.inpatient-sidebar {
  width: 240px;
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
/* 吳秀美特殊樣式 */
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
  justify-content: flex-start; /* 讓標籤從左邊開始排列 */
  gap: 6px;
  margin-top: 6px; /* 與上一行的間距 */
  flex-wrap: wrap;
}

.sidebar-disease-tag {
  /* 佈局與定位 */
  display: inline-block;

  /* 尺寸與邊距 */
  padding: 1px 6px; /* 微調 padding 使其更精緻 */
  line-height: 1.2;

  /* 顏色與外觀 (套用新的描邊樣式) */
  background-color: transparent;
  border: 1.5px solid #dc3545; /* 邊框可以稍細一點以適應側邊欄 */
  color: #dc3545;
  border-radius: 5px;

  /* 字體 */
  font-size: 11px;
  font-weight: bold;
}
</style>
