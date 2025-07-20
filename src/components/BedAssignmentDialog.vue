<!-- 完整修正後的 BedAssignmentDialog.vue - 修復重複排床問題 -->
<template>
  <div>
    <div v-if="isVisible" class="dialog-overlay" @click.self="isComponentMounted && emit('close')">
      <div class="dialog-content">
        <div class="dialog-header">
          <h2>{{ dialogTitle }}</h2>
          <button @click="isComponentMounted && emit('close')" class="close-btn">×</button>
        </div>
        <div class="dialog-body">
          <div class="assignment-grid">
            <div class="column patient-column">
              <div class="column-header">
                <h4>{{ leftColumnTitle }}</h4>
                <select v-if="showFreqSelector && !isEditMode" v-model="selectedFreq">
                  <option value="all">所有頻率</option>
                  <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                    {{ freq }}
                  </option>
                </select>
              </div>

              <!-- 編輯模式：顯示當前病人信息 -->
              <div v-if="isEditMode" class="current-patient-info">
                <div class="patient-card current-patient">
                  <div class="patient-name">{{ currentPatient.name }}</div>
                  <div class="patient-details">
                    病歷號：{{ currentPatient.medicalRecordNumber }}<br />
                    狀態：{{ getStatusText(currentPatient.status) }}<br />
                    目前頻率：{{ currentPatient.freq }}
                  </div>

                  <!-- 頻率變更選擇器 -->
                  <div v-if="context?.mode === 'change_freq_and_bed'" class="freq-change-section">
                    <label>新頻率：</label>
                    <select v-model="newFreqSelection" @change="handleFreqChange">
                      <option value="">請選擇新頻率</option>
                      <option v-for="(days, freq) in freqMap" :key="freq" :value="freq">
                        {{ freq }}
                      </option>
                    </select>
                  </div>
                </div>
              </div>

              <!-- 一般模式：顯示病人列表 -->
              <div v-else class="patient-groups-container">
                <div
                  v-for="(patients, groupName) in patientGroups"
                  :key="groupName"
                  class="patient-group"
                >
                  <h5 v-if="patients.length > 0" class="group-title">{{ groupName }}</h5>
                  <ul v-if="patients.length > 0" class="item-list patient-list">
                    <li
                      v-for="patient in patients"
                      :key="patient.id"
                      :class="{
                        selected: patient.id === selectedPatientId,
                        pending: isPendingAssignment(patient.id),
                      }"
                      @click="handlePatientClick(patient.id)"
                    >
                      <span class="patient-info-name">
                        {{ patient.name }}
                        <span class="patient-freq">({{ patient.freq || 'N/A' }})</span>
                        <span class="patient-status">
                          -
                          {{
                            patient.status === 'ipd'
                              ? '住院'
                              : patient.status === 'er'
                                ? '急診'
                                : '門診'
                          }}
                        </span>
                        <span v-if="patient.mode && patient.mode !== 'HD'"
                          >- {{ patient.mode }}</span
                        >
                        <span v-if="isPendingAssignment(patient.id)" class="pending-indicator">
                          → {{ getPendingBedInfo(patient.id) }}
                        </span>
                      </span>
                      <div
                        v-if="patient.diseases && patient.diseases.length > 0"
                        class="disease-tags-container"
                      >
                        <span
                          v-for="disease in patient.diseases"
                          :key="disease"
                          class="disease-tag"
                        >
                          {{ disease }}
                        </span>
                      </div>
                    </li>
                  </ul>
                </div>
                <div
                  v-if="Object.values(patientGroups).every((p) => p.length === 0)"
                  class="empty-state"
                >
                  無符合條件的病人
                </div>
              </div>
            </div>

            <div class="column bed-column">
              <div class="column-header">
                <h4>
                  可用空床
                  <span v-if="targetFrequency"> ({{ targetFrequency }}) </span>
                </h4>
                <select v-model="selectedShiftFilter">
                  <option value="all">所有班別</option>
                  <option v-for="shift in shifts" :key="shift" :value="shift">
                    {{ shiftDisplayNames[shift] }}
                  </option>
                </select>
              </div>

              <div v-if="!canShowBeds" class="empty-state-full">
                {{ bedEmptyMessage }}
              </div>
              <div v-else class="bed-results-grid">
                <div
                  v-for="(beds, shiftCode) in availableBeds"
                  :key="shiftCode"
                  class="shift-group"
                >
                  <h5>{{ shiftDisplayNames[shiftCode] }}</h5>
                  <ul v-if="beds.length > 0" class="item-list bed-list">
                    <li
                      v-for="bed in beds"
                      :key="bed"
                      @click="handleBedClick(bed, shiftCode)"
                      :class="{ 'hepatitis-bed': isHepatitisBed(bed) }"
                    >
                      {{ typeof bed === 'string' ? `外圍 ${bed.split('-')[1]}` : bed }}
                    </li>
                  </ul>
                  <p v-else class="empty-state-small">無可用空床</p>
                </div>
                <div
                  v-if="Object.values(availableBeds).every((b) => b.length === 0) && canShowBeds"
                  class="empty-state-full"
                >
                  此頻率在此條件下無任何可用空床
                </div>
              </div>
            </div>
          </div>

          <!-- 待排床列表和確認按鈕 (只在非編輯模式顯示) -->
          <div v-if="!isEditMode && pendingAssignments.length > 0" class="pending-section">
            <div class="pending-header">
              <h4>待確認排床 ({{ pendingAssignments.length }} 位)</h4>
              <div class="pending-actions">
                <button @click="clearPendingAssignments" class="btn-clear">清空</button>
                <button @click="confirmAllAssignments" class="btn-confirm">確認排床</button>
              </div>
            </div>
            <div class="pending-list">
              <div
                v-for="(assignment, index) in pendingAssignments"
                :key="index"
                class="pending-item"
              >
                <span class="patient-name">{{ assignment.patientName }}</span>
                <span class="assignment-arrow">→</span>
                <span class="bed-info">
                  {{
                    typeof assignment.bedNum === 'string'
                      ? `外圍 ${assignment.bedNum.split('-')[1]}`
                      : assignment.bedNum
                  }}床
                  {{ shiftDisplayNames[assignment.shiftCode] }}
                </span>
                <button @click="removePendingAssignment(index)" class="btn-remove">×</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <AlertDialog
      :is-visible="alertInfo.isVisible"
      :title="alertInfo.title"
      :message="alertInfo.message"
      @confirm="alertInfo.isVisible = false"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import AlertDialog from '@/components/AlertDialog.vue'

const props = defineProps({
  isVisible: Boolean,
  allPatients: { type: Array, required: true },
  bedLayout: { type: Array, required: true },
  scheduleData: { type: Object, required: true },
  shifts: { type: Array, required: true },
  freqMap: { type: Object, required: true },
  predefinedPatientGroups: { type: Object, default: null },
  assignmentMode: { type: String, default: 'frequency' },
  dayOfWeek: { type: Number, default: 1 },
  context: { type: Object, default: null }, // 編輯上下文
})

const emit = defineEmits(['close', 'assign-bed'])

// 基本狀態
const selectedFreq = ref('all')
const selectedShiftFilter = ref('all')
const selectedPatientId = ref(null)
const alertInfo = ref({ isVisible: false, title: '', message: '' })
const localAssignedPatientIds = ref(new Set())
const isComponentMounted = ref(true)

// 批量排床狀態
const pendingAssignments = ref([])

// 編輯模式狀態
const newFreqSelection = ref('')

// 組件卸載時清理
onBeforeUnmount(() => {
  isComponentMounted.value = false
  pendingAssignments.value = []
  localAssignedPatientIds.value.clear()
})

// 計算屬性：是否為編輯模式
const isEditMode = computed(() => {
  return props.context?.mode === 'change_freq_and_bed' || props.context?.mode === 'change_bed_only'
})

// 計算屬性：當前病人
const currentPatient = computed(() => {
  if (isEditMode.value && props.context?.patient) {
    return props.context.patient
  }
  return null
})

// 計算屬性：對話框標題
const dialogTitle = computed(() => {
  if (props.context?.mode === 'change_freq_and_bed') {
    return `變更頻率與床位：${currentPatient.value?.name || ''}`
  }
  if (props.context?.mode === 'change_bed_only') {
    return `更換床位：${currentPatient.value?.name || ''}`
  }
  return '智慧排班助理'
})

// 計算屬性：左側欄標題
const leftColumnTitle = computed(() => {
  if (isEditMode.value) {
    return '當前病人資訊'
  }
  return props.predefinedPatientGroups ? '問題病人列表' : '選擇病人'
})

// 計算屬性：是否顯示頻率選擇器
const showFreqSelector = computed(() => {
  return (
    (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') &&
    !props.predefinedPatientGroups
  )
})

// 計算屬性：目標頻率
const targetFrequency = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return newFreqSelection.value || currentPatient.value?.freq || '請先選擇新頻率'
    }
    if (props.context?.mode === 'change_bed_only') {
      return currentPatient.value?.freq || '未知頻率'
    }
  }

  if (selectedPatientId.value) {
    const patient = props.allPatients.find((p) => p.id === selectedPatientId.value)
    return patient?.freq || '請選擇病人'
  }

  return '請選擇病人'
})

// 計算屬性：是否可以顯示床位
const canShowBeds = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return !!newFreqSelection.value
    }
    if (props.context?.mode === 'change_bed_only') {
      return !!currentPatient.value?.freq
    }
  }
  return !!selectedPatientId.value
})

// 計算屬性：床位空訊息
const bedEmptyMessage = computed(() => {
  if (isEditMode.value) {
    if (props.context?.mode === 'change_freq_and_bed') {
      return '請先選擇新頻率以查詢空床。'
    }
    if (props.context?.mode === 'change_bed_only') {
      return currentPatient.value?.freq ? '載入中...' : '病人頻率資訊不完整。'
    }
  }
  return '請先從左側選擇一位病人以查詢空床。'
})

const patientGroups = computed(() => {
  if (props.predefinedPatientGroups) {
    return props.predefinedPatientGroups
  }

  if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
    const groups = {
      '未排床 - 急診': [],
      '未排床 - 住院': [],
      '未排床 - 門診': [],
    }

    const unassignedPatients = props.allPatients.filter((p) => {
      return !p.isDeleted && !p.isDiscontinued && !localAssignedPatientIds.value.has(p.id) && p.freq
    })

    const filteredPatients =
      selectedFreq.value === 'all'
        ? unassignedPatients
        : unassignedPatients.filter((p) => p.freq === selectedFreq.value)

    filteredPatients.forEach((patient) => {
      if (patient.status === 'er') {
        groups['未排床 - 急診'].push(patient)
      } else if (patient.status === 'ipd') {
        groups['未排床 - 住院'].push(patient)
      } else if (patient.status === 'opd') {
        groups['未排床 - 門診'].push(patient)
      }
    })

    return groups
  }

  if (props.assignmentMode === 'singleDay') {
    const groups = {
      '今日應排 - 急診': [],
      '今日應排 - 住院': [],
      '今日應排 - 門診': [],
      '今日非排 (臨洗) - 急診': [],
      '今日非排 (臨洗) - 住院': [],
      '今日非排 (臨洗) - 門診': [],
    }
    if (!props.allPatients) return groups

    props.allPatients.forEach((p) => {
      if (p.isDeleted || localAssignedPatientIds.value.has(p.id) || p.isDiscontinued) {
        return
      }

      const shouldSchedule = shouldPatientBeScheduled(p, props.dayOfWeek)
      const targetGroup = shouldSchedule ? '今日應排' : '今日非排 (臨洗)'

      if (p.status === 'er') groups[`${targetGroup} - 急診`].push(p)
      else if (p.status === 'ipd') groups[`${targetGroup} - 住院`].push(p)
      else if (p.status === 'opd') groups[`${targetGroup} - 門診`].push(p)
    })
    return groups
  }
  return {}
})

const availableBeds = computed(() => {
  // 決定要查詢的病人和頻率
  let targetPatient, targetFreq

  if (isEditMode.value) {
    targetPatient = currentPatient.value
    if (props.context?.mode === 'change_freq_and_bed') {
      targetFreq = newFreqSelection.value
    } else if (props.context?.mode === 'change_bed_only') {
      targetFreq = currentPatient.value?.freq
    }
  } else {
    targetPatient = props.allPatients.find((p) => p.id === selectedPatientId.value)
    targetFreq = targetPatient?.freq
  }

  if (!targetPatient || !targetFreq) return {}

  // 🔥 新增：收集已被暫時分配的床位 (樂觀更新)
  const temporarilyAssignedBeds = new Set()
  pendingAssignments.value.forEach((assignment) => {
    const bedKey = `${assignment.bedNum}-${assignment.shiftCode}`
    temporarilyAssignedBeds.add(bedKey)
  })

  const results = {}
  props.shifts.forEach((shiftCode) => {
    if (selectedShiftFilter.value === 'all' || selectedShiftFilter.value === shiftCode) {
      results[shiftCode] = []
    }
  })

  if (props.assignmentMode === 'singleDay') {
    props.bedLayout.forEach((bedNum) => {
      props.shifts.forEach((shiftCode) => {
        if (!results[shiftCode]) return

        // 🔥 樂觀更新：檢查床位是否已被暫時分配
        const bedKey = `${bedNum}-${shiftCode}`
        if (temporarilyAssignedBeds.has(bedKey)) return

        const bedIdPart =
          typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`
        const dailySlotId = `${bedIdPart}-${shiftCode}`
        if (!props.scheduleData[dailySlotId]?.patientId) {
          results[shiftCode].push(bedNum)
        }
      })
    })
  } else {
    const dayIndices = props.freqMap[targetFreq]
    if (!dayIndices || dayIndices.length === 0) return {}

    props.bedLayout.forEach((bedNum) => {
      props.shifts.forEach((shiftCode, shiftIndex) => {
        if (!results[shiftCode]) return

        // 🔥 樂觀更新：檢查床位是否已被暫時分配
        const bedKey = `${bedNum}-${shiftCode}`
        if (temporarilyAssignedBeds.has(bedKey)) return

        let isFullyAvailable = true
        for (const dayIndex of dayIndices) {
          const slotIdToCheck = `${bedNum}-${shiftIndex}-${dayIndex}`
          // 編輯模式時，排除當前病人已佔用的床位
          const currentSlotData = props.scheduleData[slotIdToCheck]
          if (
            currentSlotData?.patientId &&
            !(isEditMode.value && currentSlotData.patientId === targetPatient.id)
          ) {
            isFullyAvailable = false
            break
          }
        }
        if (isFullyAvailable) {
          results[shiftCode].push(bedNum)
        }
      })
    })
  }
  return results
})

// 🔥 修改：scheduleData 監聽器，添加調試
watch(
  () => props.scheduleData,
  (newSchedule, oldSchedule) => {
    const ids = new Set()
    if (newSchedule) {
      for (const slotData of Object.values(newSchedule)) {
        if (slotData?.patientId) ids.add(slotData.patientId)
      }
    }

    // 調試日誌：追蹤狀態變化
    console.log('📊 [BedAssignmentDialog] scheduleData 更新:', {
      已排床病人數: ids.size,
      已排床病人: Array.from(ids),
      變更: newSchedule !== oldSchedule,
    })

    localAssignedPatientIds.value = ids
  },
  { immediate: true, deep: true },
)

watch(selectedFreq, () => {
  if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
    selectedPatientId.value = null
  }
})

// 🔥 修改：isVisible 監聽器，優化狀態管理
watch(
  () => props.isVisible,
  (newValue) => {
    if (newValue) {
      isComponentMounted.value = true

      // 🔥 對話框打開時，立即同步最新的已排床狀態
      const ids = new Set()
      if (props.scheduleData) {
        for (const slotData of Object.values(props.scheduleData)) {
          if (slotData?.patientId) ids.add(slotData.patientId)
        }
      }
      localAssignedPatientIds.value = ids

      console.log('🔄 [BedAssignmentDialog] 對話框打開，同步已排床狀態:', Array.from(ids))

      if (isEditMode.value) {
        selectedPatientId.value = currentPatient.value?.id || null
        newFreqSelection.value = ''
      } else {
        if (props.assignmentMode === 'frequency' || props.assignmentMode === 'base') {
          selectedFreq.value = 'all'
        }
        selectedPatientId.value = null
      }
    } else {
      selectedPatientId.value = null
      selectedShiftFilter.value = 'all'
      newFreqSelection.value = ''
      pendingAssignments.value = []
      // 🔥 不要清空 localAssignedPatientIds，保持狀態同步
      // localAssignedPatientIds.value.clear()  // 註解掉這行
    }
  },
)

// 方法
function getStatusText(status) {
  const statusMap = {
    opd: '門診',
    ipd: '住院',
    er: '急診',
  }
  return statusMap[status] || status
}

function handleFreqChange() {
  // 當頻率改變時，清空已選床位
}

function handlePatientClick(patientId) {
  selectedPatientId.value = patientId
}

// 🔥 修改：handleBedClick 函數，添加立即狀態更新
function handleBedClick(bedNum, shiftCode) {
  if (!isComponentMounted.value) return

  let patientId, finalFreq

  if (isEditMode.value) {
    patientId = currentPatient.value?.id
    if (props.context?.mode === 'change_freq_and_bed') {
      finalFreq = newFreqSelection.value
    } else if (props.context?.mode === 'change_bed_only') {
      finalFreq = currentPatient.value?.freq
    }
  } else {
    patientId = selectedPatientId.value
    const patient = props.allPatients.find((p) => p.id === patientId)
    finalFreq = patient?.freq
  }

  if (!patientId) {
    if (isComponentMounted.value) {
      alertInfo.value = { isVisible: true, title: '操作提示', message: '請先選擇一位病人！' }
    }
    return
  }

  if (!finalFreq) {
    if (isComponentMounted.value) {
      alertInfo.value = { isVisible: true, title: '操作提示', message: '請先選擇有效的頻率！' }
    }
    return
  }

  const bedIdPart =
    typeof bedNum === 'string' && bedNum.startsWith('peripheral-') ? bedNum : `bed-${bedNum}`
  const shiftId = `${bedIdPart}-${shiftCode}`

  // 編輯模式：直接排床
  if (isEditMode.value) {
    emit('assign-bed', {
      patientId,
      bedNum,
      shiftCode,
      shiftId,
      newFreq: props.context?.mode === 'change_freq_and_bed' ? finalFreq : undefined,
    })
    return
  }

  // 一般模式：加入待排床列表
  const patient = props.allPatients.find((p) => p.id === patientId)
  if (!patient) return

  const existingIndex = pendingAssignments.value.findIndex(
    (assignment) => assignment.patientId === patientId,
  )

  if (existingIndex !== -1) {
    // 更新現有的排床安排
    pendingAssignments.value[existingIndex] = {
      patientId,
      patientName: patient.name,
      bedNum,
      shiftCode,
      shiftId,
    }
  } else {
    // 添加新的排床安排
    pendingAssignments.value.push({
      patientId,
      patientName: patient.name,
      bedNum,
      shiftCode,
      shiftId,
    })
  }

  // 🔥 立即更新本地狀態，讓病人從列表中消失
  localAssignedPatientIds.value.add(patientId)
  console.log('🎯 [BedAssignmentDialog] 添加到待排床:', patient.name, '本地狀態已更新')

  selectedPatientId.value = null
}

function isPendingAssignment(patientId) {
  return pendingAssignments.value.some((assignment) => assignment.patientId === patientId)
}

function getPendingBedInfo(patientId) {
  const assignment = pendingAssignments.value.find(
    (assignment) => assignment.patientId === patientId,
  )
  if (!assignment) return ''

  const bedDisplay =
    typeof assignment.bedNum === 'string'
      ? `外圍 ${assignment.bedNum.split('-')[1]}`
      : assignment.bedNum
  return `${bedDisplay}床 ${shiftDisplayNames[assignment.shiftCode]}`
}

// 🔥 修改：removePendingAssignment 函數
function removePendingAssignment(index) {
  const assignment = pendingAssignments.value[index]

  // 🔥 從本地狀態中移除，讓病人重新出現在列表中
  localAssignedPatientIds.value.delete(assignment.patientId)
  pendingAssignments.value.splice(index, 1)

  console.log('❌ [BedAssignmentDialog] 移除待排床:', assignment.patientName, '本地狀態已更新')
}

// 🔥 修改：clearPendingAssignments 函數
function clearPendingAssignments() {
  // 🔥 從本地狀態中移除所有待排床的病人
  pendingAssignments.value.forEach((assignment) => {
    localAssignedPatientIds.value.delete(assignment.patientId)
  })
  pendingAssignments.value = []

  console.log('🧹 [BedAssignmentDialog] 清空所有待排床，本地狀態已重置')
}

// 🔥 修改：confirmAllAssignments 函數
function confirmAllAssignments() {
  if (pendingAssignments.value.length === 0 || !isComponentMounted.value) return

  const assignmentList = pendingAssignments.value
    .map((assignment) => {
      const bedDisplay =
        typeof assignment.bedNum === 'string'
          ? `外圍 ${assignment.bedNum.split('-')[1]}`
          : assignment.bedNum
      return `${assignment.patientName} → ${bedDisplay}床 ${shiftDisplayNames[assignment.shiftCode]}`
    })
    .join('\n')

  const assignmentCount = pendingAssignments.value.length

  try {
    if (isComponentMounted.value) {
      // 🔥 關鍵修改：先記錄要排床的病人ID
      const assignedPatientIds = new Set(pendingAssignments.value.map((a) => a.patientId))

      // 發送排床事件
      pendingAssignments.value.forEach((assignment) => {
        emit('assign-bed', {
          patientId: assignment.patientId,
          bedNum: assignment.bedNum,
          shiftCode: assignment.shiftCode,
          shiftId: assignment.shiftId,
        })
      })

      // 🔥 立即更新本地狀態，確保病人從未排床列表中消失
      assignedPatientIds.forEach((patientId) => {
        localAssignedPatientIds.value.add(patientId)
      })

      console.log(
        '✅ [BedAssignmentDialog] 批量排床完成，已更新本地狀態:',
        Array.from(assignedPatientIds),
      )

      alertInfo.value = {
        isVisible: true,
        title: '批量排床成功',
        message: `總共完成 ${assignmentCount} 位病人的排床：\n\n${assignmentList}`,
      }
    }
  } catch (error) {
    console.error('批量排床時發生錯誤:', error)
    if (isComponentMounted.value) {
      alertInfo.value = {
        isVisible: true,
        title: '排床錯誤',
        message: '批量排床時發生錯誤，請重試。',
      }
    }
  } finally {
    // 清空待排床列表
    pendingAssignments.value = []
  }
}

function shouldPatientBeScheduled(patient, dayOfWeek) {
  if (patient.freq === '臨時') return true
  if (!patient.freq || !props.freqMap) return false
  const scheduledDays = props.freqMap[patient.freq]
  return scheduledDays ? scheduledDays.includes(dayOfWeek) : false
}

const hepatitisBedNumbers = [31, 32, 33, 35, 36]
function isHepatitisBed(bedNum) {
  return typeof bedNum === 'number' && hepatitisBedNumbers.includes(bedNum)
}

const shiftDisplayNames = { early: '早班', noon: '午班', late: '晚班' }
</script>

<style scoped>
/* 定義 CSS 變量 */
:root {
  --primary-color: #005a9c;
  --success-color: #16a34a;
  --danger-color: #dc3545;
  --warning-color: #f97316;
  --info-color: #0ea5e9;
}

/* 編輯模式樣式 */
.current-patient-info {
  padding: 1rem;
  background-color: #fff;
  border-radius: 8px;
  border: 2px solid var(--primary-color, #007bff);
}

.patient-card.current-patient {
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.patient-name {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--primary-color, #007bff);
  margin-bottom: 0.5rem;
}

.patient-details {
  color: #6c757d;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.freq-change-section {
  border-top: 1px solid #dee2e6;
  padding-top: 1rem;
}

.freq-change-section label {
  display: block;
  font-weight: bold;
  margin-bottom: 0.5rem;
  color: #495057;
}

.freq-change-section select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
}

.freq-change-section select:focus {
  outline: none;
  border-color: var(--primary-color, #007bff);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

/* 批量排床樣式 */
.patient-list li.pending {
  background-color: #fff3cd;
  border-color: #ffeaa7;
  color: #856404;
}

.patient-list li.pending .patient-info-name {
  color: #856404;
}

.pending-indicator {
  color: #e17055;
  font-weight: 600;
  font-size: 0.9em;
}

.pending-section {
  margin-top: 1rem;
  padding: 1.2rem;
  background-color: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  flex-shrink: 0; /* 防止被壓縮 */
  min-height: 120px; /* 設定最小高度 */
  max-height: 25vh; /* 設定最大高度 */
  display: flex;
  flex-direction: column;
}

.pending-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0; /* 防止被壓縮 */
}

.pending-header h4 {
  margin: 0;
  color: #495057;
  font-size: 1.1rem;
  font-weight: 600;
}

.pending-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-clear,
.btn-confirm,
.btn-remove {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.btn-clear {
  background-color: #6c757d;
  color: white;
}

.btn-clear:hover {
  background-color: #5a6268;
}

.btn-confirm {
  background-color: #28a745;
  color: white;
  font-weight: 600;
}

.btn-confirm:hover {
  background-color: #218838;
}

.btn-remove {
  background-color: #dc3545;
  color: white;
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  line-height: 1;
}

.btn-remove:hover {
  background-color: #c82333;
}

.pending-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto; /* 允許滾動 */
  flex: 1; /* 佔用剩餘空間 */
  padding-right: 0.5rem; /* 為滾動條留空間 */
}

.pending-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 10px 14px; /* 增加padding */
  background-color: white;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  font-size: 0.95rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* 增加輕微陰影 */
  flex-shrink: 0; /* 防止項目被壓縮 */
}

.pending-item:hover {
  background-color: #f8f9fa;
  border-color: #adb5bd;
}

.patient-name {
  font-weight: 600;
  color: #495057;
  min-width: 80px;
}

.assignment-arrow {
  color: #6c757d;
  font-weight: bold;
}

.bed-info {
  color: #007bff;
  font-weight: 500;
  flex: 1;
}

/* 響應式調整 - 當有待排床時 */
.dialog-body:has(.pending-section) .assignment-grid {
  max-height: calc(70vh - 150px); /* 當有待排床時，減少主區域高度 */
}

.dialog-body:has(.pending-section) .column {
  max-height: calc(70vh - 200px);
}

/* 滾動條樣式優化 */
.pending-list::-webkit-scrollbar {
  width: 6px;
}

.pending-list::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 3px;
}

.pending-list::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.pending-list::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

/* 基本樣式 */
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
  transition: opacity 0.3s ease;
}

.dialog-content {
  background: white;
  padding: 1.5rem 2rem;
  border-radius: 12px;
  width: 90%;
  max-width: 1200px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  max-height: 95vh; /* 增加對話框最大高度 */
  min-height: 70vh; /* 設定最小高度 */
  overflow: hidden;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
  flex-shrink: 0;
}

.dialog-header h2 {
  margin: 0;
  font-size: 1.8rem;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2.5rem;
  line-height: 1;
  cursor: pointer;
  color: #888;
  padding: 0;
  transition: color 0.2s;
}

.close-btn:hover {
  color: #000;
}

.dialog-body {
  overflow: hidden;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 60vh; /* 增加最小高度 */
}

.assignment-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 2rem;
  width: 100%;
  flex: 1;
  min-height: 0; /* 允許縮小 */
}

.column {
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 1rem;
  min-height: 40vh; /* 調整最小高度 */
  max-height: calc(70vh - 100px); /* 減少最大高度，給待排床更多空間 */
}

.column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid #dee2e6;
  padding-bottom: 0.8rem;
  margin-bottom: 0.8rem;
  flex-shrink: 0;
}

.column-header h4 {
  margin: 0;
  font-size: 1.2rem;
  color: #333;
}

.column-header select {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #ced4da;
  background-color: white;
  font-size: 0.9rem;
}

.item-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.patient-groups-container {
  overflow-y: auto;
  flex-grow: 1;
}

.patient-group {
  margin-bottom: 1.5rem;
}

.patient-group:last-child {
  margin-bottom: 0;
}

.group-title {
  margin: 0 0 0.8rem 0;
  padding: 0.5rem 0;
  border-bottom: 2px solid #005a9c;
  color: #005a9c;
  font-size: 1.1rem;
  font-weight: 600;
  position: sticky;
  top: 0;
  background-color: #f8f9fa;
  z-index: 1;
}

.patient-list li {
  padding: 12px 14px;
  margin-bottom: 8px;
  border-radius: 8px;
  border: 1px solid #ced4da;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  background-color: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.patient-list li:hover {
  background-color: #e9ecef;
  border-color: #adb5bd;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.patient-list li.selected {
  background-color: #005a9c;
  color: white;
  border-color: #005a9c;
  font-weight: bold;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 90, 156, 0.3);
}

.patient-list li.selected .patient-info-name {
  color: white;
}

.patient-list li.selected .disease-tag {
  background-color: white;
  color: #005a9c;
  border: 1px solid white;
}

.patient-info-name {
  font-weight: 500;
  font-size: 1rem;
  line-height: 1.4;
  color: #333;
}

.patient-freq {
  font-weight: 600;
  color: #007bff;
  margin-left: 0.25rem;
}

.patient-status {
  color: #6c757d;
  font-weight: 400;
  margin-left: 0.25rem;
}

.patient-list li.selected .patient-freq {
  color: #fff;
}

.patient-list li.selected .patient-status {
  color: rgba(255, 255, 255, 0.8);
}

.disease-tags-container {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.disease-tag {
  background-color: #ffe4e6;
  color: #c53030;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75em;
  font-weight: 500;
  border: 1px solid #fbb6ce;
  white-space: nowrap;
}

.bed-results-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  overflow-y: auto;
  flex-grow: 1;
}

.shift-group h5 {
  margin: 0 0 0.5rem 0;
  color: #343a40;
  font-size: 1.1rem;
  font-weight: 600;
}

.bed-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.bed-list li {
  background-color: #e3f2fd;
  text-align: center;
  flex-basis: 75px;
  font-weight: bold;
  color: #0d47a1;
  padding: 8px;
  border: 1px solid #b3e5fc;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.bed-list li:hover {
  background-color: #bbdefb;
  transform: scale(1.05);
  border-color: #81d4fa;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.bed-list li.hepatitis-bed {
  background-color: #fff9c4;
  color: #f57f17;
  border-color: #fff176;
}

.bed-list li.hepatitis-bed:hover {
  background-color: #fff59d;
  border-color: #ffeb3b;
}

.empty-state,
.empty-state-full {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  height: 100%;
  color: #6c757d;
  font-size: 1.2rem;
  text-align: center;
  padding: 2rem;
  background-color: #fff;
  border: 1px dashed #ced4da;
  border-radius: 6px;
}

.empty-state-small {
  color: #999;
  font-style: italic;
  margin: 0.5rem 0;
}
</style>
