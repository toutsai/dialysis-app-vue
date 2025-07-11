<script setup>
// 【核心修正】: 從 'vue' 中同時引入 ref, computed, 和 inject
import { ref, computed, inject } from 'vue'

const props = defineProps({
  patientId: {
    type: String,
    required: true,
    default: '',
  },
})

// 注入由祖先元件提供的數據和方法
// 第二個參數是「預設值」，在找不到提供者時使用，以防止錯誤
const patientWithMemoIds = inject('patientWithMemoIds', ref(new Set()))
const showPatientMemos = inject('showPatientMemos', () => {
  console.warn('[MemoIcon] showPatientMemos function was not provided by an ancestor component.')
})

// 計算屬性，判斷此 patientId 是否存在於備忘錄集合中
const hasMemos = computed(() => {
  // 防禦性檢查，確保 patientId 和注入的 ref 都有效
  if (!props.patientId || !patientWithMemoIds.value) {
    return false
  }
  return patientWithMemoIds.value.has(props.patientId)
})

// 點擊圖示時觸發的函式
function handleClick() {
  if (props.patientId) {
    showPatientMemos(props.patientId)
  }
}
</script>

<template>
  <!-- 只有當 hasMemos 為 true 時，才渲染這個圖示 -->
  <span v-if="hasMemos" class="memo-icon-wrapper" title="有交班事項" @click.stop="handleClick">
    📝
  </span>
</template>

<style scoped>
.memo-icon-wrapper {
  display: inline-block;
  vertical-align: middle;
  cursor: pointer;
  margin-left: 8px;
  font-size: 1.2em;
  transition: transform 0.2s;
  position: relative;
  z-index: 10; /* 給予較高的 z-index 確保能被點擊 */
}

.memo-icon-wrapper:hover {
  transform: scale(1.4);
}
</style>
