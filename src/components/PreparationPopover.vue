<!-- 檔案路徑: src/components/PreparationPopover.vue -->
// 檔案路徑: src/components/PreparationPopover.vue

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

const calculatePosition = () => {
  // 保留這個檢查是個好習慣，以防萬一
  if (!props.targetElement || !popoverRef.value) return

  const targetRect = props.targetElement.getBoundingClientRect()
  const popoverRect = popoverRef.value.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  let top = targetRect.bottom + window.scrollY + 5
  let left = targetRect.left + window.scrollX

  // 避免彈出框超出視窗右邊界
  if (left + popoverRect.width > viewportWidth) {
    left = viewportWidth - popoverRect.width - 10
  }
  // 避免彈出框超出視窗下邊界
  if (top + popoverRect.height > viewportHeight) {
    top = targetRect.top + window.scrollY - popoverRect.height - 5
  }

  // 避免彈出框小於0
  if (top < 0) top = 5
  if (left < 0) left = 5

  popoverStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
  }
}

const handleClickOutside = (event) => {
  if (
    popoverRef.value &&
    !popoverRef.value.contains(event.target) &&
    !props.targetElement.contains(event.target)
  ) {
    emit('close')
  }
}

// ✨ --- 核心修正 --- ✨
// 使用 watch 來動態管理事件監聽器
watch(
  () => props.isVisible,
  (newValue, oldValue) => {
    if (newValue) {
      // 當彈出框變為可見時
      nextTick(() => {
        calculatePosition() // 先計算一次位置
        // 新增監聽器
        window.addEventListener('resize', calculatePosition)
        document.addEventListener('mousedown', handleClickOutside)
      })
    } else if (oldValue) {
      // 當彈出框從「可見」變為「不可見」時
      // 立刻移除監聽器
      window.removeEventListener('resize', calculatePosition)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  },
  { immediate: true }, // ✨ 新增 immediate: true，確保元件初始顯示時也能正確加上監聽器
)

// ✨ --- 核心修正 --- ✨
// onMounted 被移除，因為邏輯已經移到 watch 中
// onUnmounted 仍然保留，作為最後的保險，確保元件銷毀時徹底清除監聽器
onUnmounted(() => {
  window.removeEventListener('resize', calculatePosition)
  document.removeEventListener('mousedown', handleClickOutside)
})

const hasPatients = computed(() => props.patients && props.patients.length > 0)
</script>

<template>
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
</template>

<style scoped>
.preparation-popover {
  position: absolute;
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
