<template>
  <div v-if="messageTypes.length > 0" class="messages-icon-container">
    <span
      v-for="type in messageTypes"
      :key="type"
      class="message-icon-wrapper"
      :title="getTooltipText(type)"
      @click.stop="handleClick"
    >
      {{ getMessageTypeIcon(type) }}
    </span>
  </div>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useTaskStore } from '@/stores/taskStore'

const props = defineProps({
  patientId: {
    type: String,
    required: true,
  },
  context: {
    type: String,
    default: 'detail',
  },
})

const taskStore = useTaskStore()

// ✨ 1. 注入來自父層 (如 ScheduleView) 的正在檢視的日期
// 如果沒有提供，就預設為 null，這樣 getter 會自動使用今天的日期
const viewingDate = inject('viewingDate', null)

// ✨ 2. [核心修改] messageTypes 現在會根據注入的日期來計算
const messageTypes = computed(() => {
  if (!props.patientId) return []

  // 呼叫 store 的 getter 函式，並傳入我們從父層得到的 viewingDate 的值
  // 如果 viewingDate 是 null (例如在某些頁面沒有提供)，getter 會自動用今天
  const mapForDate = taskStore.getPatientMessageTypesMapForDate(viewingDate?.value)

  return mapForDate.get(props.patientId) || []
})

// handleIconClick 的注入保持不變
const handleIconClick = inject('handleIconClick', (patientId, context) => {
  console.warn(
    `[PatientMessagesIcon] handleIconClick function was not provided. Clicked on patient ${patientId} with context ${context}.`,
  )
})

function getMessageTypeIcon(type) {
  switch (type) {
    case '抽血':
      return '🩸'
    case '衛教':
      return '📢'
    case '常規':
    default:
      return '📝'
  }
}

function getTooltipText(type) {
  switch (type) {
    case '抽血':
      return '有抽血提醒'
    case '衛教':
      return '有衛教事項'
    case '常規':
    default:
      return '有交班事項'
  }
}

function handleClick() {
  if (props.patientId) {
    handleIconClick(props.patientId, props.context)
  }
}
</script>

<style scoped>
.messages-icon-container {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  position: relative;
  z-index: 10;
}
.message-icon-wrapper {
  display: inline-block;
  vertical-align: middle;
  cursor: pointer;
  font-size: 1.2em;
  transition: transform 0.2s;
  line-height: 1;
}
.message-icon-wrapper:hover {
  transform: scale(1.4);
}
</style>
