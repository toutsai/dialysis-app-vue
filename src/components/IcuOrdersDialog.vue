<!-- 檔案路徑: src/components/IcuOrdersDialog.vue (動態卡片最終版) -->
<template>
  <div v-if="isVisible" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content">
      <header class="modal-header">
        <h2>{{ targetDate }} 外圍病房透析醫囑單</h2>
        <div class="header-actions">
          <button @click="handleSaveAndPrint" class="btn-print">
            <i class="fas fa-print"></i> 儲存並列印
          </button>
          <button @click="$emit('close')" class="btn-close">×</button>
        </div>
      </header>

      <div class="modal-body" id="icu-orders-printable-area">
        <h1 class="printable-header">{{ targetDate }} 外圍病房透析醫囑單</h1>

        <section class="order-section">
          <h3 class="section-title">當日透析病患</h3>

          <!-- 早班 -->
          <div class="shift-group">
            <h4>早班</h4>
            <div v-if="earlyPeripheralPatients.length > 0" class="patient-grid">
              <div v-for="p in earlyPeripheralPatients" :key="p.id" class="patient-order-card">
                <div class="patient-header">
                  <div class="info-item"><strong>床號:</strong> {{ p.wardNumber || '____' }}</div>
                  <div
                    class="info-item name"
                    @click="$emit('open-order-modal', p)"
                    title="點擊編輯醫囑"
                  >
                    <strong>姓名:</strong> {{ p.name }}
                  </div>
                  <div class="info-item"><strong>病歷號:</strong> {{ p.medicalRecordNumber }}</div>
                </div>

                <!-- ✅ [核心修改] 將 order-details 和 notes-section 包在一個 card-body 中 -->
                <div class="card-body">
                  <div
                    v-if="p.dialysisOrders?.mode === 'PP' || p.dialysisOrders?.mode === 'DFPP'"
                    class="order-details"
                  >
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div class="highlight-field">
                      <strong>血漿交換量:</strong>
                      {{
                        p.dialysisOrders?.exchangeVolume
                          ? p.dialysisOrders.exchangeVolume.toFixed(0) + ' ml'
                          : '____'
                      }}
                    </div>
                    <div class="highlight-field">
                      <strong>血液流速:</strong>
                      {{
                        p.dialysisOrders?.bloodFlow
                          ? p.dialysisOrders.bloodFlow + ' ml/min'
                          : '____'
                      }}
                    </div>
                    <div>
                      <strong>體重/Hct:</strong> {{ p.dialysisOrders?.bw || '____' }}kg /
                      {{ p.dialysisOrders?.hct || '____' }}%
                    </div>
                    <div><strong>Heparin:</strong> {{ p.dialysisOrders?.heparin || '____' }}</div>
                  </div>
                  <div v-else class="order-details">
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div><strong>頻次:</strong> {{ p.dialysisOrders?.freq || '____' }}</div>
                    <div class="highlight-field">
                      <strong>AK:</strong> {{ p.dialysisOrders?.ak || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>藥水:</strong> {{ p.dialysisOrders?.dialysate || '____' }}
                    </div>
                    <div>
                      <strong>時間(hr):</strong> {{ p.dialysisOrders?.dialysisHours || '____' }}
                    </div>
                    <div>
                      <strong>Heparin:</strong> {{ p.dialysisOrders?.heparinRinse || '____' }} /
                      {{ p.dialysisOrders?.heparinLM || '____' }}
                    </div>
                    <div>
                      <strong>BF/DF:</strong> {{ p.dialysisOrders?.bloodFlow || '____' }} /
                      {{ p.dialysisOrders?.dialysateFlow || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>脫水量:</strong> {{ p.dialysisOrders?.dehydration || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>Mannitol:</strong> {{ p.dialysisOrders?.mannitol || '____' }}
                    </div>
                  </div>

                  <div class="notes-section">
                    <strong>備註：</strong>
                    <input
                      type="text"
                      class="notes-input"
                      v-model="localNotes[p.id]"
                      @input="updateLocalNote(p.id, $event.target.value)"
                      placeholder="點此輸入備註..."
                    />
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="no-patients-text">早班無外圍病房病人</p>
          </div>

          <!-- 午班 -->
          <div class="shift-group">
            <h4>午班</h4>
            <div v-if="noonPeripheralPatients.length > 0" class="patient-grid">
              <div v-for="p in noonPeripheralPatients" :key="p.id" class="patient-order-card">
                <div class="patient-header">
                  <div class="info-item"><strong>床號:</strong> {{ p.wardNumber || '____' }}</div>
                  <div
                    class="info-item name"
                    @click="$emit('open-order-modal', p)"
                    title="點擊編輯醫囑"
                  >
                    <strong>姓名:</strong> {{ p.name }}
                  </div>
                  <div class="info-item"><strong>病歷號:</strong> {{ p.medicalRecordNumber }}</div>
                </div>

                <!-- ✅ [核心修改] 將 order-details 和 notes-section 包在一個 card-body 中 -->
                <div class="card-body">
                  <div
                    v-if="p.dialysisOrders?.mode === 'PP' || p.dialysisOrders?.mode === 'DFPP'"
                    class="order-details"
                  >
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div class="highlight-field">
                      <strong>血漿交換量:</strong>
                      {{
                        p.dialysisOrders?.exchangeVolume
                          ? p.dialysisOrders.exchangeVolume.toFixed(0) + ' ml'
                          : '____'
                      }}
                    </div>
                    <div class="highlight-field">
                      <strong>血液流速:</strong>
                      {{
                        p.dialysisOrders?.bloodFlow
                          ? p.dialysisOrders.bloodFlow + ' ml/min'
                          : '____'
                      }}
                    </div>
                    <div>
                      <strong>體重/Hct:</strong> {{ p.dialysisOrders?.bw || '____' }}kg /
                      {{ p.dialysisOrders?.hct || '____' }}%
                    </div>
                    <div><strong>Heparin:</strong> {{ p.dialysisOrders?.heparin || '____' }}</div>
                  </div>
                  <div v-else class="order-details">
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div><strong>頻次:</strong> {{ p.dialysisOrders?.freq || '____' }}</div>
                    <div class="highlight-field">
                      <strong>AK:</strong> {{ p.dialysisOrders?.ak || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>藥水:</strong> {{ p.dialysisOrders?.dialysate || '____' }}
                    </div>
                    <div>
                      <strong>時間(hr):</strong> {{ p.dialysisOrders?.dialysisHours || '____' }}
                    </div>
                    <div>
                      <strong>Heparin:</strong> {{ p.dialysisOrders?.heparinRinse || '____' }} /
                      {{ p.dialysisOrders?.heparinLM || '____' }}
                    </div>
                    <div>
                      <strong>BF/DF:</strong> {{ p.dialysisOrders?.bloodFlow || '____' }} /
                      {{ p.dialysisOrders?.dialysateFlow || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>脫水量:</strong> {{ p.dialysisOrders?.dehydration || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>Mannitol:</strong> {{ p.dialysisOrders?.mannitol || '____' }}
                    </div>
                  </div>

                  <div class="notes-section">
                    <strong>備註：</strong>
                    <input
                      type="text"
                      class="notes-input"
                      v-model="localNotes[p.id]"
                      @input="updateLocalNote(p.id, $event.target.value)"
                      placeholder="點此輸入備註..."
                    />
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="no-patients-text">午班無外圍病房病人</p>
          </div>

          <!-- 晚班 -->
          <div class="shift-group">
            <h4>晚班</h4>
            <div v-if="latePeripheralPatients.length > 0" class="patient-grid">
              <div v-for="p in latePeripheralPatients" :key="p.id" class="patient-order-card">
                <div class="patient-header">
                  <div class="info-item"><strong>床號:</strong> {{ p.wardNumber || '____' }}</div>
                  <div
                    class="info-item name"
                    @click="$emit('open-order-modal', p)"
                    title="點擊編輯醫囑"
                  >
                    <strong>姓名:</strong> {{ p.name }}
                  </div>
                  <div class="info-item"><strong>病歷號:</strong> {{ p.medicalRecordNumber }}</div>
                </div>

                <!-- ✅ [核心修改] 將 order-details 和 notes-section 包在一個 card-body 中 -->
                <div class="card-body">
                  <div
                    v-if="p.dialysisOrders?.mode === 'PP' || p.dialysisOrders?.mode === 'DFPP'"
                    class="order-details"
                  >
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div class="highlight-field">
                      <strong>血漿交換量:</strong>
                      {{
                        p.dialysisOrders?.exchangeVolume
                          ? p.dialysisOrders.exchangeVolume.toFixed(0) + ' ml'
                          : '____'
                      }}
                    </div>
                    <div class="highlight-field">
                      <strong>血液流速:</strong>
                      {{
                        p.dialysisOrders?.bloodFlow
                          ? p.dialysisOrders.bloodFlow + ' ml/min'
                          : '____'
                      }}
                    </div>
                    <div>
                      <strong>體重/Hct:</strong> {{ p.dialysisOrders?.bw || '____' }}kg /
                      {{ p.dialysisOrders?.hct || '____' }}%
                    </div>
                    <div><strong>Heparin:</strong> {{ p.dialysisOrders?.heparin || '____' }}</div>
                  </div>
                  <div v-else class="order-details">
                    <div>
                      <strong>會診醫師:</strong> {{ p.dialysisOrders?.physician || '____' }}
                    </div>
                    <div><strong>透析模式:</strong> {{ p.dialysisOrders?.mode || '____' }}</div>
                    <div><strong>頻次:</strong> {{ p.dialysisOrders?.freq || '____' }}</div>
                    <div class="highlight-field">
                      <strong>AK:</strong> {{ p.dialysisOrders?.ak || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>藥水:</strong> {{ p.dialysisOrders?.dialysate || '____' }}
                    </div>
                    <div>
                      <strong>時間(hr):</strong> {{ p.dialysisOrders?.dialysisHours || '____' }}
                    </div>
                    <div>
                      <strong>Heparin:</strong> {{ p.dialysisOrders?.heparinRinse || '____' }} /
                      {{ p.dialysisOrders?.heparinLM || '____' }}
                    </div>
                    <div>
                      <strong>BF/DF:</strong> {{ p.dialysisOrders?.bloodFlow || '____' }} /
                      {{ p.dialysisOrders?.dialysateFlow || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>脫水量:</strong> {{ p.dialysisOrders?.dehydration || '____' }}
                    </div>
                    <div class="highlight-field">
                      <strong>Mannitol:</strong> {{ p.dialysisOrders?.mannitol || '____' }}
                    </div>
                  </div>

                  <div class="notes-section">
                    <strong>備註：</strong>
                    <input
                      type="text"
                      class="notes-input"
                      v-model="localNotes[p.id]"
                      @input="updateLocalNote(p.id, $event.target.value)"
                      placeholder="點此輸入備註..."
                    />
                  </div>
                </div>
              </div>
            </div>
            <p v-else class="no-patients-text">晚班無外圍病房病人</p>
          </div>
        </section>

        <!-- ... CRRT 區塊  ... -->
        <section class="order-section">
          <h3 class="section-title">CRRT 病人名單</h3>
          <div v-if="cvvhPatients.length > 0" class="crrt-container">
            <div v-for="p in cvvhPatients" :key="p.id" class="crrt-patient-card">
              <table class="crrt-table">
                <thead>
                  <tr>
                    <th style="width: 80px">床號</th>
                    <th style="width: 100px">姓名</th>
                    <th style="width: 100px">病歷號</th>
                    <th style="width: 100px">會診醫師</th>
                    <th style="width: 100px">透析模式</th>
                    <th style="width: auto">
                      <div class="crrt-header-with-btn">
                        <span>CRRT 醫囑</span>
                        <button
                          class="btn-edit-crrt"
                          @click="$emit('open-crrt-order-modal', p)"
                          title="新增/修正 CRRT 醫囑"
                        >
                          <i class="fas fa-edit"></i> 新增/修正
                        </button>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{{ p.wardNumber || '____' }}</td>
                    <td>{{ p.name }}</td>
                    <td>{{ p.medicalRecordNumber }}</td>
                    <td>{{ p.physician || '____' }}</td>
                    <td>{{ p.mode || 'CVVHDF' }}</td>
                    <td class="crrt-orders-cell">
                      <div class="order-info" v-if="p.crrtOrders?.physician">
                        <span class="physician-info">
                          {{ p.crrtOrders.isModified ? '修正醫師' : '開立醫師' }}:
                          {{ p.crrtOrders.physician }}
                          <span v-if="p.crrtOrders?.timestamp" class="timestamp-info">
                            ({{ formatDateTime(p.crrtOrders.timestamp) }})</span
                          >
                        </span>
                      </div>
                      <div class="crrt-order-content">
                        <div class="crrt-order-item">
                          <span class="order-label">模式:</span><span>{{ getCRRTMode(p) }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">PBP:</span
                          ><span>{{ p.crrtOrders?.pbp || '____' }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">透析液流速:</span
                          ><span>{{
                            p.crrtOrders?.dialysateFlowRate
                              ? `${p.crrtOrders.dialysateFlowRate} ml/hr`
                              : '____'
                          }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">補充液流速:</span
                          ><span>{{
                            p.crrtOrders?.replacementFlowRate
                              ? `${p.crrtOrders.replacementFlowRate} ml/hr`
                              : '____'
                          }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">前/後稀釋:</span
                          ><span>{{ p.crrtOrders?.dilutionRatio || '____' }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">Heparin:</span
                          ><span>{{ p.crrtOrders?.heparin || '____' }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">脫水速率:</span
                          ><span>{{ getDehydrationRateDisplay(p.crrtOrders) }}</span>
                        </div>
                        <div class="crrt-order-item">
                          <span class="order-label">是否加KCL:</span
                          ><span>{{ p.crrtOrders?.addKCL ? '是' : '否' }}</span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr class="emergency-row">
                    <td colspan="6">
                      <div class="emergency-content">
                        <span class="emergency-label">緊急時是否可撤：</span>
                        <div class="withdraw-options">
                          <label class="checkbox-label">
                            <!-- ✅ [核心修改] 使用 v-model 綁定到本地狀態 -->
                            <input
                              type="radio"
                              v-model="crrtEmergencyData[p.id].withdraw"
                              value="yes"
                            />可
                          </label>
                          <label class="checkbox-label">
                            <input
                              type="radio"
                              v-model="crrtEmergencyData[p.id].withdraw"
                              value="no"
                            />否
                          </label>
                        </div>
                        <!-- ✅ [核心修改] 使用 v-model 綁定到本地狀態 -->
                        <input
                          type="text"
                          class="withdraw-note"
                          v-model="crrtEmergencyData[p.id].note"
                          placeholder="備註..."
                        />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <p v-else class="no-patients-text">本日無 CRRT 病患</p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, watch } from 'vue'
import { SHIFT_CODES } from '@/constants/scheduleConstants.js'

const props = defineProps({
  isVisible: Boolean,
  targetDate: String,
  schedule: Object,
  patientMap: Map,
})

const emit = defineEmits(['close', 'open-order-modal', 'open-crrt-order-modal', 'save-and-print'])

// ✅ [核心修改] 建立本地狀態來追蹤所有可編輯欄位的即時值
const localNotes = reactive({})
const crrtEmergencyData = reactive({})

// 新增更新本地備註的方法
function updateLocalNote(patientId, value) {
  localNotes[patientId] = value
}

// 修改 watch，確保初始化時載入現有備註
watch(
  () => props.isVisible,
  (newVal) => {
    if (newVal) {
      // 初始化 HD/SLED/PP/DFPP 病人備註
      allPeripheralPatients.value.forEach((p) => {
        localNotes[p.id] = p.dialysisOrders?.icuNote || ''
      })
      // 初始化 CRRT 病人資料
      cvvhPatients.value.forEach((p) => {
        crrtEmergencyData[p.id] = {
          withdraw: p.emergencyWithdraw || null,
          note: p.emergencyWithdrawNote || '',
        }
      })
    }
  },
  { immediate: true },
)

// ✅ [核心修改] 新增 "儲存並列印" 的處理函式
const handleSaveAndPrint = () => {
  const payload = {
    notes: { ...localNotes },
    crrtEmergency: { ...crrtEmergencyData },
  }
  emit('save-and-print', payload, printContent)
}

// 為了方便在 template 中使用 v-for，我們將班別資料整理成一個陣列
const shifts = computed(() => [
  { name: 'early', displayName: '早班', patients: earlyPeripheralPatients.value },
  { name: 'noon', displayName: '午班', patients: noonPeripheralPatients.value },
  { name: 'late', displayName: '晚班', patients: latePeripheralPatients.value },
])

const getCRRTMode = (patient) => {
  if (patient.crrtOrders?.mode) return patient.crrtOrders.mode
  if (patient.mode === 'CVVHDF') return 'CVVHDF'
  if (patient.mode === 'CVVH') return 'CVVH'
  if (patient.mode === 'CVVHD') return 'CVVHD'
  return '____'
}

const getDehydrationRateDisplay = (crrtOrders) => {
  if (!crrtOrders) return '____'
  const lower = crrtOrders.dehydrationRateLower
  const upper = crrtOrders.dehydrationRateUpper
  if (typeof lower === 'number' || typeof upper === 'number') {
    const displayLower = typeof lower === 'number' ? lower : '____'
    const displayUpper = typeof upper === 'number' ? upper : '____'
    if (displayLower === displayUpper) return `${displayLower} ml/hr`
    return `${displayLower} - ${displayUpper} ml/hr`
  }
  if (typeof crrtOrders.dehydrationRate === 'number') {
    return `${crrtOrders.dehydrationRate} ml/hr`
  }
  return '____'
}

const formatDateTime = (timestamp) => {
  if (!timestamp) return ''
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
  return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

const updateEmergencyWithdraw = (patientId, value) => {
  console.log('Update emergency withdraw:', patientId, value)
}

const updateEmergencyNote = (patientId, value) => {
  console.log('Update emergency note:', patientId, value)
}

const allPeripheralPatients = computed(() => {
  if (!props.schedule || !props.patientMap) return []
  return Object.entries(props.schedule)
    .filter(([shiftId, slot]) => shiftId.startsWith('peripheral-') && slot?.patientId)
    .map(([shiftId, slot]) => {
      const patient = props.patientMap.get(slot.patientId)
      if (
        patient &&
        (patient.status === 'ipd' || patient.status === 'er') &&
        patient.mode !== 'CVVHDF'
      ) {
        return {
          ...patient,
          bedNum: `外圍 ${shiftId.split('-')[1]}`,
          shiftCode: shiftId.split('-')[2],
        }
      }
      return null
    })
    .filter(Boolean)
})

const earlyPeripheralPatients = computed(() =>
  allPeripheralPatients.value
    .filter((p) => p.shiftCode === SHIFT_CODES.EARLY)
    .sort((a, b) => a.bedNum.localeCompare(b.bedNum, undefined, { numeric: true })),
)

const noonPeripheralPatients = computed(() =>
  allPeripheralPatients.value
    .filter((p) => p.shiftCode === SHIFT_CODES.NOON)
    .sort((a, b) => a.bedNum.localeCompare(b.bedNum, undefined, { numeric: true })),
)

const latePeripheralPatients = computed(() =>
  allPeripheralPatients.value
    .filter((p) => p.shiftCode === SHIFT_CODES.LATE)
    .sort((a, b) => a.bedNum.localeCompare(b.bedNum, undefined, { numeric: true })),
)

const cvvhPatients = computed(() => {
  if (!props.patientMap) return []
  return Array.from(props.patientMap.values()).filter((p) => p.mode === 'CVVHDF' && !p.isDeleted)
})

const printContent = () => {
  const printableArea = document.getElementById('icu-orders-printable-area')
  if (printableArea) {
    // 先強制更新所有輸入框的值屬性
    const inputs = printableArea.querySelectorAll('input[type="text"]')
    inputs.forEach((input) => {
      input.setAttribute('value', input.value)
    })

    // 處理 radio buttons
    const radios = printableArea.querySelectorAll('input[type="radio"]:checked')
    radios.forEach((radio) => {
      radio.setAttribute('checked', 'checked')
    })

    const printWindow = window.open('', '_blank')
    printWindow.document.write('<html><head><title>列印醫囑單</title>')
    const styles = Array.from(document.styleSheets)
      .map((styleSheet) => {
        try {
          return Array.from(styleSheet.cssRules)
            .map((rule) => rule.cssText)
            .join('')
        } catch (e) {
          return ''
        }
      })
      .join('')
    printWindow.document.write('<style>' + styles + '</style>')
    printWindow.document.write('<style></style>')
    printWindow.document.write('</head><body>')
    printWindow.document.write(printableArea.innerHTML)
    printWindow.document.write('</body></html>')
    printWindow.document.close()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 250)
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background-color: #f8f9fa;
  width: 95%;
  max-width: 1200px;
  height: 90vh;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
  flex-shrink: 0;
}
.modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.btn-print {
  background-color: #17a2b8;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 5px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}
.btn-close {
  background: none;
  border: none;
  font-size: 2rem;
  font-weight: bold;
  cursor: pointer;
  color: #6c757d;
}
.modal-body {
  padding: 1.5rem;
  overflow-y: auto;
  flex-grow: 1;
}
.order-section {
  margin-bottom: 2rem;
}
.section-title {
  font-size: 1.3rem;
  margin-top: 0;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 2px solid #007bff;
}
.shift-group {
  margin-bottom: 1.5rem;
}
.shift-group h4 {
  font-size: 1.1rem;
  margin-bottom: 1rem;
  color: #495057;
}
.patient-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 1.2rem;
}
.patient-order-card {
  background-color: #fff;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.card-body {
  flex-grow: 1; /* 讓內容區填滿剩餘空間 */
  display: flex;
  flex-direction: column;
}

.order-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem 1rem;
  padding: 1rem;
  font-size: 1.05rem;
  line-height: 1.5;
  flex-grow: 1; /* 讓醫囑細節填滿 body 的剩餘空間 */
}

/* ✅ [核心修改] 優化備註區塊和輸入框的樣式 */
.notes-section {
  padding: 0.75rem 1rem;
  border-top: 1px solid #e9ecef;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background-color: #f8f9fa;
  margin-top: auto; /* 確保它總是在底部 */
}

.notes-section strong {
  white-space: nowrap;
  color: #495057;
}

.notes-input {
  width: 100%;
  border: 1px solid transparent; /* 預設無邊框 */
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  background-color: #f8f9fa; /* 與背景色相同 */
  transition: all 0.2s;
  color: #212529;
  font-size: 1rem;
}

/* 當有 placeholder (即內容為空) 時，滑鼠懸停才顯示邊框 */
.notes-input:placeholder-shown:hover {
  border-color: #ced4da;
  background-color: #fff;
}

/* 當有內容時，直接顯示邊框 */
.notes-input:not(:placeholder-shown) {
  border-color: #ced4da;
  background-color: #fff;
}

.notes-input:focus {
  outline: none;
  border-color: #80bdff;
  background-color: #fff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.notes-input::placeholder {
  color: #6c757d;
  font-style: italic;
}
.patient-header {
  display: flex;
  justify-content: space-between;
  background-color: #e9ecef;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid #dee2e6;
}
.patient-header .info-item {
  font-size: 1.05rem;
}
.patient-header .info-item.name {
  font-weight: bold;
  cursor: pointer;
  color: #0056b3;
  text-decoration: underline;
  font-size: 1.1rem;
}
.order-details {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem 1rem;
  padding: 1rem;
  font-size: 1.05rem;
  line-height: 1.5;
}
.no-patients-text {
  color: #6c757d;
  font-style: italic;
}
.crrt-table {
  width: 100%;
  border-collapse: collapse;
  background-color: #fff;
}
.crrt-table th,
.crrt-table td {
  border: 1px solid #dee2e6;
  padding: 0.75rem;
  text-align: center;
  vertical-align: middle;
}
.crrt-table th {
  background-color: #e9ecef;
  font-weight: bold;
  font-size: 1rem;
}
.crrt-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.crrt-patient-card {
  background-color: #fff;
  border-radius: 6px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}
.crrt-orders-cell {
  text-align: left !important;
  padding: 1rem !important;
}
.crrt-header-with-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}
.crrt-header-with-btn span {
  white-space: nowrap;
}
.btn-edit-crrt {
  background-color: #007bff;
  color: white;
  border: none;
  padding: 0.3rem 0.6rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 0.3rem;
  transition: background-color 0.2s;
  white-space: nowrap;
}
.btn-edit-crrt:hover {
  background-color: #0056b3;
}
.order-info {
  font-size: 0.85rem;
  color: #6c757d;
  font-style: italic;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #dee2e6;
}
.physician-info,
.timestamp-info {
  font-style: italic;
}
.crrt-order-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.crrt-order-item {
  display: flex;
  align-items: center;
  font-size: 0.95rem;
}
.order-label {
  font-weight: bold;
  margin-right: 0.5rem;
  color: #495057;
}
.emergency-row {
  background-color: #f8f9fa;
  border-top: 2px solid #dee2e6 !important;
}
.emergency-content {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.75rem 1rem;
}
.emergency-label {
  font-weight: bold;
  color: #495057;
  white-space: nowrap;
}
.withdraw-options {
  display: flex;
  gap: 1.5rem;
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
  font-size: 0.95rem;
}
.checkbox-label input[type='checkbox'] {
  cursor: pointer;
  width: 18px;
  height: 18px;
}
.withdraw-note {
  flex: 1;
  padding: 0.3rem 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
  min-width: 300px;
}
.withdraw-note::placeholder {
  color: #adb5bd;
}
.highlight-field {
  color: #d32f2f;
  font-weight: bold;
  font-size: 1.1rem;
}
.printable-header {
  display: none;
}

@media print {
  .modal-header {
    display: none !important;
  }
  .printable-header {
    display: block !important;
    text-align: center;
    font-size: 1.8rem;
    margin-bottom: 2rem;
    color: black;
  }
  @page {
    size: A4;
    margin: 15mm;
  }
  body {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    font-size: 14pt !important;
    zoom: 0.7;
  }
  .modal-body {
    padding: 0 !important;
  }
  .patient-header .info-item {
    font-size: 14pt !important;
  }
  .patient-header .info-item.name {
    font-size: 16pt !important;
  }
  .order-details {
    font-size: 14pt !important;
    line-height: 1.6 !important;
    padding: 1.2rem !important;
  }
  .highlight-field {
    color: #d32f2f !important;
    font-weight: bold !important;
    font-size: 15pt !important;
  }
  .patient-grid {
    grid-template-columns: 1fr 1fr !important;
    page-break-inside: avoid;
  }
  .patient-order-card {
    page-break-inside: avoid;
  }
  .shift-group h4 {
    font-size: 16pt !important;
    margin-bottom: 1rem !important;
  }
  .crrt-table th {
    font-size: 13pt !important;
    background-color: #e9ecef !important;
  }
  .btn-edit-crrt {
    display: none !important;
  }
  .crrt-order-content {
    font-size: 11pt !important;
  }
  .order-info {
    font-size: 10pt !important;
    margin-bottom: 0.5rem !important;
  }
  .withdraw-options {
    font-size: 12pt !important;
  }
  .withdraw-note {
    border: 1px solid #000 !important;
    font-size: 11pt !important;
  }
}
</style>
