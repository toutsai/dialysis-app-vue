<!-- 檔案路徑: src/components/DailyStaffDisplay.vue -->
<template>
  <div class="daily-staff-container">
    <!-- 查房醫師 (固定顯示) -->
    <div class="staff-item shift-early">
      <span class="staff-label">早班</span>
      <div class="staff-details">
        <div class="staff-name">
          <span class="staff-job-title">查房</span>
          {{ dailyPhysicians.early?.name || '--' }}
        </div>
        <span v-if="dailyPhysicians.early" class="staff-contact">
          (員:{{ dailyPhysicians.early.staffId || 'N/A' }} / 電:{{
            dailyPhysicians.early.phone || 'N/A'
          }})
        </span>
      </div>
    </div>
    <div class="staff-item shift-noon">
      <span class="staff-label">午班</span>
      <div class="staff-details">
        <div class="staff-name">
          <span class="staff-job-title">查房</span>
          {{ dailyPhysicians.noon?.name || '--' }}
        </div>
        <span v-if="dailyPhysicians.noon" class="staff-contact">
          (員:{{ dailyPhysicians.noon.staffId || 'N/A' }} / 電:{{
            dailyPhysicians.noon.phone || 'N/A'
          }})
        </span>
      </div>
    </div>
    <div class="staff-item shift-late">
      <span class="staff-label">晚班</span>
      <div class="staff-details">
        <div class="staff-name">
          <span class="staff-job-title">查房</span>
          {{ dailyPhysicians.late?.name || '--' }}
        </div>
        <span v-if="dailyPhysicians.late" class="staff-contact">
          (員:{{ dailyPhysicians.late.staffId || 'N/A' }} / 電:{{
            dailyPhysicians.late.phone || 'N/A'
          }})
        </span>
      </div>
    </div>

    <!-- 會診醫師 (智慧輪播) -->
    <div class="consult-carousel-wrapper">
      <button class="carousel-arrow" @click="cycleConsultShift(-1)">&lt;</button>
      <div class="staff-item" :class="`shift-consult-${displayedConsultPhysician.key}`">
        <span class="staff-label">{{ displayedConsultPhysician.shiftLabel }}</span>
        <div class="staff-details">
          <div class="staff-name">
            <span class="staff-job-title">會診</span>
            {{ displayedConsultPhysician.data?.name || '--' }}
          </div>
          <span v-if="displayedConsultPhysician.data" class="staff-contact">
            (員:{{ displayedConsultPhysician.data.staffId || 'N/A' }} / 電:{{
              displayedConsultPhysician.data.phone || 'N/A'
            }})
          </span>
        </div>
      </div>
      <button class="carousel-arrow" @click="cycleConsultShift(1)">&gt;</button>
    </div>

    <!-- 專師 -->
    <div class="staff-item shift-specialist">
      <span class="staff-label">專師</span>
      <div class="staff-details">
        <span class="staff-name">賴若蕎</span>
        <span class="staff-contact">(電: 665129)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 1. 定義 props，用來接收從父層傳來的資料
const props = defineProps({
  dailyPhysicians: {
    type: Object,
    required: true,
    default: () => ({ early: null, noon: null, late: null }),
  },
  dailyConsultPhysicians: {
    type: Object,
    required: true,
    default: () => ({ morning: null, afternoon: null, night: null }),
  },
})

// 2. 將所有輪播相關的邏輯都搬到這個元件內部
const activeConsultShiftIndex = ref(0)
const consultShiftCycleOrder = ['morning', 'afternoon', 'night']
let shiftCycleInterval = null

const displayedConsultPhysician = computed(() => {
  const currentShiftKey = consultShiftCycleOrder[activeConsultShiftIndex.value]
  switch (currentShiftKey) {
    case 'morning':
      return {
        key: 'morning',
        shiftLabel: '上午',
        data: props.dailyConsultPhysicians.morning,
      }
    case 'afternoon':
      return {
        key: 'afternoon',
        shiftLabel: '下午',
        data: props.dailyConsultPhysicians.afternoon,
      }
    case 'night':
      return {
        key: 'night',
        shiftLabel: '夜間',
        data: props.dailyConsultPhysicians.night,
      }
    default:
      return { key: 'morning', shiftLabel: '上午', data: null }
  }
})

function cycleConsultShift(direction) {
  if (shiftCycleInterval) clearInterval(shiftCycleInterval) // 手動切換時停止自動輪播

  const newIndex = activeConsultShiftIndex.value + direction
  if (newIndex >= consultShiftCycleOrder.length) {
    activeConsultShiftIndex.value = 0
  } else if (newIndex < 0) {
    activeConsultShiftIndex.value = consultShiftCycleOrder.length - 1
  } else {
    activeConsultShiftIndex.value = newIndex
  }
}

function setupInitialConsultShiftDisplay() {
  const currentHour = new Date().getHours()
  if (currentHour >= 8 && currentHour < 12) {
    activeConsultShiftIndex.value = 0 // 上午
  } else if (currentHour >= 12 && currentHour < 17) {
    activeConsultShiftIndex.value = 1 // 下午
  } else {
    activeConsultShiftIndex.value = 2 // 夜間
  }

  // 設定每 10 秒自動輪播
  if (shiftCycleInterval) clearInterval(shiftCycleInterval)
  shiftCycleInterval = setInterval(() => {
    cycleConsultShift(1)
  }, 10000)
}

onMounted(() => {
  setupInitialConsultShiftDisplay()
})

onUnmounted(() => {
  if (shiftCycleInterval) clearInterval(shiftCycleInterval)
})
</script>

<style scoped>
/* 3. 將所有相關的 CSS 都搬到這裡，成為元件的專屬樣式 */
.daily-staff-container {
  display: flex;
  gap: 8px;
  align-items: center;
}
.consult-carousel-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.carousel-arrow {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #64748b;
  border-radius: 50%;
  width: 26px;
  height: 26px;
  font-size: 0.9rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  transition: all 0.2s;
  flex-shrink: 0;
}
.carousel-arrow:hover {
  background-color: #e2e8f0;
  color: #1e293b;
}
.staff-item {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  min-width: 175px;
  height: 52px;
  box-sizing: border-box;
}
.staff-label {
  font-weight: 700;
  font-size: 0.9rem;
  margin-right: 8px;
  color: white;
}
.staff-details {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  line-height: 1.3;
  flex-grow: 1;
}
.staff-name {
  display: flex;
  align-items: baseline;
  gap: 0.3em;
  font-weight: 600;
  font-size: 1rem;
}
.staff-job-title {
  font-size: 0.8em;
  font-weight: 500;
  opacity: 0.9;
}
.staff-contact {
  font-size: 0.7rem;
  opacity: 0.9;
  white-space: nowrap;
}
.staff-item.shift-early {
  background-color: #28a745;
  color: white;
}
.staff-item.shift-noon {
  background-color: #ffc107;
  color: #212529;
}
.staff-item.shift-noon .staff-label {
  color: #212529;
}
.staff-item.shift-late {
  background-color: #17a2b8;
  color: white;
}
.staff-item.shift-consult-morning {
  background-color: #d1fae5;
  color: #065f46;
}
.staff-item.shift-consult-morning .staff-label {
  color: #065f46;
}
.staff-item.shift-consult-afternoon {
  background-color: #fef3c7;
  color: #92400e;
}
.staff-item.shift-consult-afternoon .staff-label {
  color: #92400e;
}
.staff-item.shift-consult-night {
  background-color: #cffafe;
  color: #155e75;
}
.staff-item.shift-consult-night .staff-label {
  color: #155e75;
}
.staff-item.shift-specialist {
  background-color: #e5e7eb;
  color: #1f2937;
}
.staff-item.shift-specialist .staff-label {
  color: #1f2937;
}
</style>
