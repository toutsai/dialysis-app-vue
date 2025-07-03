<!-- src/components/BedChangeDialog.vue (重構版) -->
<script setup>
import { ref, computed, watch } from 'vue'

// 1. 引入我們需要的常量
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'

const props = defineProps({
  isVisible: Boolean,
  patientInfo: Object, // { id, shiftId, name, ... } e.g., shiftId: 'bed-29-early'
  currentSchedule: Object, // 完整的當日 schedule 物件
})

const emit = defineEmits(['confirm', 'cancel'])

const selectedNewBed = ref(null)

// 【核心邏輯】計算可用的空床位
const availableBeds = computed(() => {
  if (!props.isVisible || !props.patientInfo || !props.patientInfo.shiftId) return []

  // 2. 從 patientInfo.shiftId 中解析出班別代碼
  const shiftCode = props.patientInfo.shiftId.split('-')[2] // 'early', 'noon', 'late'

  // 檢查是否是有效的班別代碼
  if (!Object.values(SHIFT_CODES).includes(shiftCode)) {
    console.error(`無效的班別代碼: ${shiftCode}`)
    return []
  }

  // 3. 定義所有可能的床號
  const allBedNumbers = [
    1,
    2,
    3,
    5,
    6,
    7,
    8,
    9,
    11,
    12,
    13,
    15,
    16,
    17,
    18,
    19,
    21,
    22,
    23,
    25,
    26,
    27,
    28,
    29,
    31,
    32,
    33,
    35,
    36,
    37,
    38,
    39,
    51,
    52,
    53,
    55,
    56,
    57,
    58,
    59,
    61,
    62,
    63,
    65,
    'peripheral-1',
    'peripheral-2',
    'peripheral-3',
    'peripheral-4',
    'peripheral-5',
    'peripheral-6',
  ]

  // 4. 找出所有已佔用的床位
  const occupiedBedShiftIds = new Set(Object.keys(props.currentSchedule))

  // 5. 過濾出同班次的空床位
  return allBedNumbers
    .map((bedNum) => `bed-${bedNum}-${shiftCode}`) // 組裝成標準 ID
    .filter((shiftId) => !occupiedBedShiftIds.has(shiftId)) // 檢查該 ID 是否未被佔用
})

// 當 Dialog 打開時，清空上一次的選擇
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      selectedNewBed.value = null
    }
  },
)

function confirmChange() {
  if (!selectedNewBed.value) {
    alert('請選擇一個新的床位！')
    return
  }
  emit('confirm', {
    oldShiftId: props.patientInfo.shiftId,
    newShiftId: selectedNewBed.value,
  })
}
</script>

<template>
  <div v-if="isVisible" class="dialog-overlay">
    <div class="dialog-content">
      <h3 class="dialog-title">更換床位</h3>
      <div v-if="patientInfo" class="patient-info">
        <p><strong>病人:</strong> {{ patientInfo.name }}</p>
        <p><strong>目前床位:</strong> {{ patientInfo.shiftId }}</p>
      </div>
      <div class="form-group">
        <label for="bed-select">請選擇新床位:</label>
        <select id="bed-select" v-model="selectedNewBed" class="bed-select-input">
          <option :value="null" disabled>-- 請選擇 --</option>
          <option v-for="bedId in availableBeds" :key="bedId" :value="bedId">
            {{ bedId }}
          </option>
        </select>
        <p v-if="availableBeds.length === 0" class="no-beds-message">此班次已無可用空床！</p>
      </div>
      <div class="dialog-actions">
        <button @click="$emit('cancel')" class="btn-cancel">取消</button>
        <button @click="confirmChange" :disabled="!selectedNewBed" class="btn-confirm">
          確定更換
        </button>
      </div>
    </div>
  </div>
</template>

<!-- Style 部分保持不變 -->
<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.dialog-content {
  background: white;
  padding: 25px;
  border-radius: 8px;
  width: 400px;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}
.dialog-title {
  margin-top: 0;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}
.form-group {
  margin: 20px 0;
}
.bed-select-input {
  width: 100%;
  padding: 8px;
  font-size: 1em;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.dialog-actions {
  text-align: right;
  margin-top: 20px;
}
.dialog-actions button {
  padding: 8px 16px;
  border-radius: 5px;
  border: none;
  cursor: pointer;
  margin-left: 10px;
}
.btn-confirm {
  background-color: var(--primary-color);
  color: white;
}
.btn-cancel {
  background-color: #ccc;
}
/* 這些樣式似乎不屬於這個 Dialog，但暫時保留以防萬一 */
.patient-item.has-memo {
  outline: 2px solid #dc3545;
}
.patient-item[draggable='true'] {
  cursor: grab;
}
.patient-item[draggable='true']:active {
  cursor: grabbing;
}
.patient-list-cell {
  border: 2px dashed transparent;
  transition: border-color 0.2s;
}
.patient-list-cell:hover {
  border-color: #a5d6a7;
}
</style>
