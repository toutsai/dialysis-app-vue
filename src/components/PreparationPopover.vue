<script setup>
import { ref, watch, onUnmounted, nextTick, computed } from 'vue'

const props = defineProps({
  isVisible: Boolean,
  patients: Array,
  targetElement: HTMLElement,
})

const emit = defineEmits(['close'])

const popoverRef = ref(null)
const popoverStyle = ref({})

// ✨ 核心修改: 定位計算邏輯更新
const calculatePosition = () => {
  if (!props.targetElement || !popoverRef.value) return

  const targetRect = props.targetElement.getBoundingClientRect()
  const popoverRect = popoverRef.value.getBoundingClientRect()

  // 1. 計算理想位置：預設在目標元素的「正上方」，並水平居中
  let top = targetRect.top - popoverRect.height - 10 // 向上偏移 10px 的間距
  let left = targetRect.left + targetRect.width / 2 - popoverRect.width / 2

  // 2. 邊界檢查
  // 如果上方空間不足，則改為顯示在「正下方」
  if (top < 10) {
    // 10px 是距離螢幕頂部的安全邊距
    top = targetRect.bottom + 10 // 向下偏移 10px
  }

  // 如果左側超出螢幕，則向右移動到安全邊距
  if (left < 10) {
    left = 10
  }

  // 如果右側超出螢幕，則向左移動到安全邊距
  const screenWidth = window.innerWidth
  if (left + popoverRect.width > screenWidth - 10) {
    left = screenWidth - popoverRect.width - 10
  }

  // 3. 應用樣式
  popoverStyle.value = {
    // ✨ 使用 fixed 定位，可以無視頁面滾動，定位更精準
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
  }
}

const handleClickOutside = (event) => {
  if (
    popoverRef.value &&
    !popoverRef.value.contains(event.target) &&
    props.targetElement && // 增加檢查 props.targetElement 是否存在
    !props.targetElement.contains(event.target)
  ) {
    emit('close')
  }
}

watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      nextTick(() => {
        calculatePosition()
        window.addEventListener('resize', calculatePosition)
        document.addEventListener('mousedown', handleClickOutside, true) // 使用捕獲模式
      })
    } else {
      window.removeEventListener('resize', calculatePosition)
      document.removeEventListener('mousedown', handleClickOutside, true)
    }
  },
)

onUnmounted(() => {
  window.removeEventListener('resize', calculatePosition)
  document.removeEventListener('mousedown', handleClickOutside, true)
})

const hasPatients = computed(() => props.patients && props.patients.length > 0)
</script>

<template>
  <!-- ✨ 核心修改: 使用 Teleport 將彈出框渲染到 body 層級，避免被父元件的樣式影響 -->
  <Teleport to="body">
    <div v-if="isVisible" ref="popoverRef" class="preparation-popover" :style="popoverStyle">
      <div v-if="hasPatients" class="popover-content">
        <table>
          <thead>
            <tr>
              <th>姓名</th>
              <th>AK</th>
              <th>Ca</th>
              <th>Heparin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="patient in patients" :key="patient.id">
              <td>{{ patient.name }}</td>
              <td>{{ patient.dialysisOrders?.ak || '–' }}</td>
              <td>{{ patient.dialysisOrders?.dialysateCa || '–' }}</td>
              <td>
                {{ patient.dialysisOrders?.heparinInitial || '–' }}/{{
                  patient.dialysisOrders?.heparinMaintenance || '–'
                }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty-state">沒有需要備物的病人</div>
    </div>
  </Teleport>
</template>

<style scoped>
.preparation-popover {
  /* ✨ 核心修改: 移除 position: absolute，改由 JS 控制 */
  z-index: 1010;
  background-color: white;
  border: 1px solid #ccc;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  min-width: 320px;
  max-width: 450px;
}
.popover-content {
  padding: 0.5rem;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
th,
td {
  border: 1px solid #e0e0e0;
  padding: 8px 10px;
  text-align: center;
}
th {
  background-color: #f5f5f5;
  font-weight: bold;
}
td:first-child {
  text-align: left;
  font-weight: 500;
  white-space: nowrap;
}
.empty-state {
  padding: 1.5rem;
  text-align: center;
  color: #666;
}
</style>
