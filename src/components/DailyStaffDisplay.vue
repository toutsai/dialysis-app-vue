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

    <!-- 【修改】會診醫師 (改為依據時間自動顯示，移除輪播) -->
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

// 1. Props 定義不變
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

// 【修改】2. 移除輪播邏輯，改用響應式的當前時間
const currentTime = ref(new Date())
let timeUpdateInterval = null

// 【修改】3. 重新撰寫 computed 屬性，使其直接依賴 `currentTime`
const displayedConsultPhysician = computed(() => {
  // 這個 computed 屬性現在會因為 currentTime 的變化而自動重新計算
  const currentHour = currentTime.value.getHours()

  // 上午 08:00 - 11:59
  if (currentHour >= 8 && currentHour < 12) {
    return {
      key: 'morning',
      shiftLabel: '上午',
      data: props.dailyConsultPhysicians.morning,
    }
  }
  // 下午 12:00 - 16:59
  else if (currentHour >= 12 && currentHour < 17) {
    return {
      key: 'afternoon',
      shiftLabel: '下午',
      data: props.dailyConsultPhysicians.afternoon,
    }
  }
  // 夜間 (其他所有時間)
  else {
    return {
      key: 'night',
      shiftLabel: '夜間',
      data: props.dailyConsultPhysicians.night,
    }
  }
})

// 【修改】4. 使用生命週期鉤子來管理時間更新
onMounted(() => {
  // 每分鐘更新一次時間，這樣跨越班次時顯示會自動變化
  // (例如從 11:59 -> 12:00，會自動從上午班切換到下午班)
  if (timeUpdateInterval) clearInterval(timeUpdateInterval)
  timeUpdateInterval = setInterval(() => {
    currentTime.value = new Date()
  }, 60000) // 60000 毫秒 = 1 分鐘
})

onUnmounted(() => {
  // 元件銷毀時清除計時器，避免記憶體洩漏
  if (timeUpdateInterval) clearInterval(timeUpdateInterval)
})
</script>

<style scoped>
/* 樣式基本不變，只移除不再需要的 carousel 相關樣式 */
.daily-staff-container {
  display: flex;
  gap: 8px;
  align-items: center;
}
/* 【移除】.consult-carousel-wrapper 和 .carousel-arrow 的樣式 */

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
