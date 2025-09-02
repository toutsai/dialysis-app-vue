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
import { computed } from 'vue'
import { useTaskStore } from '@/stores/taskStore.js' // ✨ 1. 引入 taskStore

const props = defineProps({
  patientId: {
    type: String,
    required: true,
  },
  // ✨ 2. [移除] 不再需要 typesMap 這個 prop
  /*
  typesMap: {
    type: Map,
    required: true,
  },
  */
  context: {
    type: String,
    default: 'detail',
  },
})

const taskStore = useTaskStore() // ✨ 3. 實例化 store

// ✨ 4. [核心修改] messageTypes 直接從 store 的 getter 中計算而來
const messageTypes = computed(() => {
  if (!props.patientId) return []
  // 直接使用 store 中已經計算好的 Map，並用自己的 patientId 查找
  // 這是完全響應式的，當 store 資料更新，這裡會自動重新計算
  return taskStore.getPatientMessageTypesMapForDate.get(props.patientId) || []
})

// handleIconClick 的注入保持不變
import { inject } from 'vue'
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
